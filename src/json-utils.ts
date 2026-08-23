export interface JsonPropertyRange {
	key: string;
	valueStart: number;
	valueEnd: number;
}

function skipWhitespace(content: string, index: number): number {
	while (index < content.length && /\s/.test(content[index])) index++;
	return index;
}

function scanStringEnd(content: string, start: number): number | null {
	if (content[start] !== '"') return null;
	for (let i = start + 1; i < content.length; i++) {
		if (content[i] === "\\") {
			i++;
			continue;
		}
		if (content[i] === '"') return i + 1;
	}
	return null;
}

function scanStructuredValueEnd(content: string, start: number): number | null {
	const opening = content[start];
	if (opening !== "{" && opening !== "[") return null;
	const stack: string[] = [opening];

	for (let i = start + 1; i < content.length; i++) {
		const char = content[i];
		if (char === '"') {
			const stringEnd = scanStringEnd(content, i);
			if (stringEnd === null) return null;
			i = stringEnd - 1;
			continue;
		}
		if (char === "{" || char === "[") {
			stack.push(char);
			continue;
		}
		if (char === "}" || char === "]") {
			const expected = char === "}" ? "{" : "[";
			if (stack.pop() !== expected) return null;
			if (!stack.length) return i + 1;
		}
	}
	return null;
}

function scanJsonValueEnd(content: string, start: number): number | null {
	const first = content[start];
	if (first === '"') return scanStringEnd(content, start);
	if (first === "{" || first === "[") return scanStructuredValueEnd(content, start);

	let index = start;
	while (index < content.length && !/[\s,}\]]/.test(content[index])) index++;
	return index > start ? index : null;
}

/** Return the value ranges for each property of a JSON root object. */
export function topLevelJsonObjectProperties(content: string): JsonPropertyRange[] | null {
	let index = skipWhitespace(content, 0);
	if (content[index] !== "{") return null;
	index++;
	const properties: JsonPropertyRange[] = [];
	let expectProperty = true;

	while (index < content.length) {
		index = skipWhitespace(content, index);
		if (content[index] === "}") {
			index = skipWhitespace(content, index + 1);
			return index === content.length ? properties : null;
		}
		if (!expectProperty || content[index] !== '"') return null;

		const keyEnd = scanStringEnd(content, index);
		if (keyEnd === null) return null;
		let key: string;
		try {
			key = JSON.parse(content.slice(index, keyEnd)) as string;
		} catch {
			return null;
		}

		index = skipWhitespace(content, keyEnd);
		if (content[index] !== ":") return null;
		const valueStart = skipWhitespace(content, index + 1);
		const valueEnd = scanJsonValueEnd(content, valueStart);
		if (valueEnd === null) return null;
		properties.push({ key, valueStart, valueEnd });

		index = skipWhitespace(content, valueEnd);
		if (content[index] === ",") {
			index++;
			expectProperty = true;
			continue;
		}
		if (content[index] === "}") continue;
		return null;
	}
	return null;
}

/**
 * Parse a JSON root object while leaving selected top-level values unmaterialized.
 * This prevents a lossless HealthKit archive from becoming a second large object
 * graph in the Obsidian dashboard cache.
 */
export function parseJsonObjectExcluding(
	content: string,
	omittedKeys: ReadonlySet<string>
): { record: Record<string, unknown>; omittedValues: Record<string, string> } | null {
	const properties = topLevelJsonObjectProperties(content);
	if (!properties) return null;
	const record: Record<string, unknown> = {};
	const omittedValues: Record<string, string> = {};

	try {
		for (const property of properties) {
			const rawValue = content.slice(property.valueStart, property.valueEnd);
			if (omittedKeys.has(property.key)) {
				omittedValues[property.key] = rawValue;
			} else {
				record[property.key] = JSON.parse(rawValue) as unknown;
			}
		}
		return { record, omittedValues };
	} catch {
		return null;
	}
}

export interface StructuredValueScalarScan {
	valueEnd: number;
	topLevelScalars: Record<string, string | number>;
}

function scanScalar(content: string, start: number): { value: string | number; end: number } | null {
	if (content[start] === '"') {
		const stringEnd = scanStringEnd(content, start);
		if (stringEnd === null || stringEnd - start > 256) return null;
		try {
			return { value: JSON.parse(content.slice(start, stringEnd)) as string, end: stringEnd };
		} catch {
			return null;
		}
	}
	let index = start;
	if (content[index] === "-") index++;
	const digitsStart = index;
	while (index < content.length && /[0-9.]/.test(content[index])) index++;
	if (index === digitsStart) return null;
	const value = Number(content.slice(start, index));
	return Number.isFinite(value) ? { value, end: index } : null;
}

/**
 * Find the end of the object at `start` while collecting scalar top-level
 * properties named in `scalarKeys`. Runs in a single pass and never
 * materializes non-scalar properties, so it stays cheap even when the object
 * embeds lossless HealthKit archives that dwarf the daily summary around it.
 */
export function scanStructuredValueCollectingScalars(
	content: string,
	start: number,
	scalarKeys: ReadonlySet<string>
): StructuredValueScalarScan | null {
	if (content[start] !== "{") return null;
	const topLevelScalars: Record<string, string | number> = {};
	let depth = 0;
	let index = start;
	let pendingKey: string | null = null;

	while (index < content.length) {
		const char = content[index];
		if (char === '"') {
			const stringEnd = scanStringEnd(content, index);
			if (stringEnd === null) return null;
			if (depth === 1) {
				try {
					const key = JSON.parse(content.slice(index, stringEnd)) as string;
					pendingKey = scalarKeys.has(key) ? key : null;
				} catch {
					pendingKey = null;
				}
			}
			index = stringEnd;
			continue;
		}
		if (char === ":" && depth === 1 && pendingKey) {
			const valueStart = skipWhitespace(content, index + 1);
			const scalar = scanScalar(content, valueStart);
			if (scalar) {
				topLevelScalars[pendingKey] = scalar.value;
				index = scalar.end;
			} else {
				index = index + 1;
			}
			pendingKey = null;
			continue;
		}
		if (char === "{" || char === "[") {
			depth++;
			index++;
			continue;
		}
		if (char === "}" || char === "]") {
			depth--;
			index++;
			if (depth === 0) return { valueEnd: index, topLevelScalars };
			continue;
		}
		if (char === ",") pendingKey = null;
		index++;
	}
	return null;
}

export function parseTopLevelJsonProperty(rawObject: string, key: string): unknown {
	const property = topLevelJsonObjectProperties(rawObject)?.find((item) => item.key === key);
	if (!property) return undefined;
	try {
		return JSON.parse(rawObject.slice(property.valueStart, property.valueEnd)) as unknown;
	} catch {
		return undefined;
	}
}

export function countTopLevelJsonArrayElements(rawArray: string): number | undefined {
	let index = skipWhitespace(rawArray, 0);
	if (rawArray[index] !== "[") return undefined;
	index++;
	let count = 0;

	while (index < rawArray.length) {
		index = skipWhitespace(rawArray, index);
		if (rawArray[index] === "]") {
			index = skipWhitespace(rawArray, index + 1);
			return index === rawArray.length ? count : undefined;
		}
		const valueEnd = scanJsonValueEnd(rawArray, index);
		if (valueEnd === null) return undefined;
		count++;
		index = skipWhitespace(rawArray, valueEnd);
		if (rawArray[index] === ",") {
			index++;
			continue;
		}
		if (rawArray[index] !== "]") return undefined;
	}
	return undefined;
}

export function countTopLevelJsonArrayProperty(rawObject: string, key: string): number | undefined {
	const property = topLevelJsonObjectProperties(rawObject)?.find((item) => item.key === key);
	if (!property) return undefined;
	return countTopLevelJsonArrayElements(rawObject.slice(property.valueStart, property.valueEnd));
}
