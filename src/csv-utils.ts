export function isBlankCsvRecord(record: string[]): boolean {
	return record.every((cell) => cell.trim() === "");
}

export interface CsvIterationOptions {
	/**
	 * Return a character limit for the cell that is about to start. The completed
	 * cells in the same record are available, so callers can skip known payload
	 * columns while the parser still scans their CSV framing.
	 */
	cellCharacterLimit?: (completedCells: readonly string[], columnIndex: number) => number | undefined;
	truncationMarker?: string;
}

/**
 * Iterate RFC 4180 CSV records without splitting on physical newlines.
 * Quoted cells may contain commas, escaped quotes, CRLF, or LF characters.
 */
export function* iterateCsvRecords(
	content: string,
	options: CsvIterationOptions = {}
): Generator<string[]> {
	let row: string[] = [];
	let cell = "";
	let inQuotes = false;
	let sawAnyCharacter = false;
	let cellWasTruncated = false;
	let cellLimit = options.cellCharacterLimit?.(row, 0);

	const appendToCell = (value: string): void => {
		if (cellLimit === undefined || cell.length < cellLimit) {
			const remaining = cellLimit === undefined ? value.length : Math.max(0, cellLimit - cell.length);
			cell += value.slice(0, remaining);
			if (remaining < value.length) cellWasTruncated = true;
		} else {
			cellWasTruncated = true;
		}
	};

	const finishCell = (): void => {
		if (cellWasTruncated && options.truncationMarker) cell += options.truncationMarker;
		row.push(cell);
		cell = "";
		cellWasTruncated = false;
		cellLimit = options.cellCharacterLimit?.(row, row.length);
	};

	const finishRow = (): string[] => {
		finishCell();
		const completed = row;
		row = [];
		sawAnyCharacter = false;
		cellLimit = options.cellCharacterLimit?.(row, 0);
		return completed;
	};

	for (let i = 0; i < content.length; i++) {
		const char = content[i];
		const next = content[i + 1];
		sawAnyCharacter = true;

		if (char === '"') {
			if (inQuotes && next === '"') {
				appendToCell('"');
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (char === "," && !inQuotes) {
			finishCell();
			continue;
		}

		if ((char === "\r" || char === "\n") && !inQuotes) {
			if (char === "\r" && next === "\n") i++;
			yield finishRow();
			continue;
		}

		appendToCell(char);
	}

	if (sawAnyCharacter || cell.length > 0 || row.length > 0) {
		yield finishRow();
	}
}
