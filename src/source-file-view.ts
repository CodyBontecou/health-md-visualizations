import { FileView, TFile, WorkspaceLeaf } from "obsidian";
import { isBlankCsvRecord, iterateCsvRecords } from "./csv-utils";
import { parseJSON } from "./parsers/json-parser";

export const HEALTH_MD_SOURCE_VIEW_TYPE = "health-md-source-file";
export const HEALTH_MD_SOURCE_EXTENSIONS = ["json", "csv"];

const CSV_PREVIEW_MAX_ROWS = 200;
const CSV_PREVIEW_MAX_COLUMNS = 40;
const CSV_PREVIEW_MAX_CELL_CHARACTERS = 500;
const INLINE_RAW_MAX_BYTES = 512 * 1024;
const JSON_PRETTY_PRINT_MAX_BYTES = 1024 * 1024;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

export function parseCsvPreview(content: string): { rows: string[][]; truncatedRows: boolean; truncatedColumns: boolean } {
	const rows: string[][] = [];
	let truncatedColumns = false;
	let truncatedRows = false;
	for (const record of iterateCsvRecords(content, {
		cellCharacterLimit: () => CSV_PREVIEW_MAX_CELL_CHARACTERS,
		truncationMarker: "…",
	})) {
		if (isBlankCsvRecord(record)) continue;
		if (rows.length >= CSV_PREVIEW_MAX_ROWS) {
			truncatedRows = true;
			break;
		}
		if (record.length > CSV_PREVIEW_MAX_COLUMNS) truncatedColumns = true;
		rows.push(record.slice(0, CSV_PREVIEW_MAX_COLUMNS));
	}
	return { rows, truncatedRows, truncatedColumns };
}

function renderPre(container: HTMLElement, text: string, language: string): void {
	const pre = container.createEl("pre", { cls: `health-md-source-pre language-${language}` });
	pre.createEl("code", { text, cls: `language-${language}` });
}

export class HealthMdSourceFileView extends FileView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.icon = "file-text";
		this.navigation = true;
		this.allowNoFile = false;
	}

	getViewType(): string {
		return HEALTH_MD_SOURCE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.name ?? "Health.md source";
	}

	canAcceptExtension(extension: string): boolean {
		return HEALTH_MD_SOURCE_EXTENSIONS.includes(extension.toLowerCase());
	}

	async onLoadFile(file: TFile): Promise<void> {
		const content = await this.app.vault.cachedRead(file);
		this.render(file, content);
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.contentEl.empty();
	}

	async onRename(file: TFile): Promise<void> {
		if (this.file === file) {
			await this.onLoadFile(file);
		}
	}

	private render(file: TFile, content: string): void {
		this.contentEl.empty();
		const root = this.contentEl.createDiv({ cls: "health-md-source-view" });
		const header = root.createDiv({ cls: "health-md-source-header" });
		header.createDiv({ cls: "health-md-source-title", text: file.name });
		header.createDiv({
			cls: "health-md-source-meta",
			text: `${file.path} · ${file.extension.toUpperCase()} · ${formatBytes(file.stat.size)}`,
		});

		if (file.extension.toLowerCase() === "json") {
			this.renderJson(root, content);
		} else if (file.extension.toLowerCase() === "csv") {
			this.renderCsv(root, content);
		} else {
			renderPre(root, content, "text");
		}
	}

	private renderJson(root: HTMLElement, content: string): void {
		if (content.length > JSON_PRETTY_PRINT_MAX_BYTES) {
			const day = parseJSON(content);
			root.createDiv({
				cls: "health-md-source-warning",
				text: "This lossless export is too large to render safely. Showing compact metadata instead of record payloads.",
			});
			if (day) {
				renderPre(root, JSON.stringify({
					schema: day.schema,
					schema_version: day.schemaVersion,
					date: day.date,
					time_context: day.time_context,
					raw_capture: day.rawCapture,
				}, null, 2), "json");
			}
			return;
		}
		try {
			const formatted = JSON.stringify(JSON.parse(content), null, 2);
			renderPre(root, formatted, "json");
		} catch {
			root.createDiv({ cls: "health-md-source-warning", text: "Could not pretty-print this JSON file." });
		}
	}

	private renderCsv(root: HTMLElement, content: string): void {
		const { rows, truncatedRows, truncatedColumns } = parseCsvPreview(content);
		if (!rows.length) {
			root.createDiv({ cls: "health-md-source-warning", text: "CSV file is empty." });
			return;
		}

		const previewNote = root.createDiv({ cls: "health-md-source-meta" });
		previewNote.setText(
			`Previewing ${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}` +
				(truncatedRows || truncatedColumns ? " (truncated for readability)" : "")
		);

		const tableWrap = root.createDiv({ cls: "health-md-source-table-wrap" });
		const table = tableWrap.createEl("table", { cls: "health-md-source-table" });
		const [headerRow, ...bodyRows] = rows;
		const thead = table.createEl("thead");
		const tr = thead.createEl("tr");
		headerRow.forEach((cell) => tr.createEl("th", { text: cell }));

		const tbody = table.createEl("tbody");
		bodyRows.forEach((row) => {
			const rowEl = tbody.createEl("tr");
			const width = Math.max(headerRow.length, row.length);
			for (let i = 0; i < width; i++) {
				rowEl.createEl("td", { text: row[i] ?? "" });
			}
		});

		if (content.length <= INLINE_RAW_MAX_BYTES) {
			const details = root.createEl("details", { cls: "health-md-source-raw" });
			details.createEl("summary", { text: "Raw CSV" });
			renderPre(details, content, "csv");
		} else {
			root.createDiv({
				cls: "health-md-source-warning",
				text: "Raw CSV is not embedded because this lossless export is large. Open it with an external editor to inspect every canonical record.",
			});
		}
	}
}
