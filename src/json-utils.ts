export interface JsonPropertyRange {
	key: string;
	valueStart: number;
	valueEnd: number;
}

const TRAILING_OMISSION_FAST_PATH_MIN_LENGTH = 512 * 1024;

function compactTrailingMetadata(content: string, valueStart: number): string {
	const head = content.slice(valueStart, Math.min(content.length, valueStart + 4096));
	const tail = content.slice(Math.max(valueStart, content.length - 4096));
	const edges = `${head}\n${tail}`;
	const metadata: Record<string, unknown> = {};
	const stringProperty = (source: string, key: string): string | undefined => {
		const match = source.match(new RegExp(`${JSON.stringify(key)}\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`));
		if (!match) return undefined;
		try { return JSON.parse(match[1]) as string; } catch { return undefined; }
	};
	const numberProperty = (source: string, key: string): number | undefined => {
		const match = source.match(new RegExp(`${JSON.stringify(key)}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
		if (!match) return undefined;
		const value = Number(match[1]);
		return Number.isFinite(value) ? value : undefined;
	};

	metadata.capture_status = stringProperty(head, "capture_status");
	metadata.schema = stringProperty(edges, "schema");
	metadata.schema_version = numberProperty(edges, "schema_version");
	for (const key of Object.keys(metadata)) {
		if (metadata[key] === undefined) delete metadata[key];
	}
	return JSON.stringify(metadata);
}

function parseWithoutLargeTrailingProperty(
	content: string,
	omittedKeys: ReadonlySet<string>
): { record: Record<string, unknown>; omittedValues: Record<string, string> } | null {
	if (content.length < TRAILING_OMISSION_FAST_PATH_MIN_LENGTH || omittedKeys.size !== 1) return null;
	const [key] = omittedKeys;
	const keyToken = JSON.stringify(key);
	const keyStart = content.lastIndexOf(keyToken);
	if (keyStart < 0) return null;

	const beforeKey = content.slice(0, keyStart).trimEnd();
	if (!beforeKey.endsWith(",")) return null;
	let valueStart = skipWhitespace(content, keyStart + keyToken.length);
	if (content[valueStart] !== ":") return null;
	valueStart = skipWhitespace(content, valueStart + 1);
	if (content[valueStart] !== "{" && content[valueStart] !== "[") return null;
	if (!content.trimEnd().endsWith("}")) return null;

	try {
		const prefix = `${beforeKey.slice(0, -1).trimEnd()}}`;
		const record = JSON.parse(prefix) as unknown;
		if (!record || typeof record !== "object" || Array.isArray(record)) return null;
		// Preserve scalar archive identity/status while deliberately skipping large
		// record arrays and detailed diagnostics for oversized inputs.
		return {
			record: record as Record<string, unknown>,
			omittedValues: { [key]: compactTrailingMetadata(content, valueStart) },
		};
	} catch {
		return null;
	}
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
	const fastPath = parseWithoutLargeTrailingProperty(content, omittedKeys);
	if (fastPath) return fastPath;
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
