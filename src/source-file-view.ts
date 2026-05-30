import { FileView, TFile, WorkspaceLeaf } from "obsidian";

export const HEALTH_MD_SOURCE_VIEW_TYPE = "health-md-source-file";
export const HEALTH_MD_SOURCE_EXTENSIONS = ["json", "csv"];

const CSV_PREVIEW_MAX_ROWS = 200;
const CSV_PREVIEW_MAX_COLUMNS = 40;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(1)} MB`;
}

function parseCsvLine(line: string): string[] {
	const cells: string[] = [];
	let cell = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		const next = line[i + 1];
		if (ch === '"') {
			if (inQuotes && next === '"') {
				cell += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === "," && !inQuotes) {
			cells.push(cell);
			cell = "";
		} else {
			cell += ch;
		}
	}

	cells.push(cell);
	return cells;
}

function parseCsvPreview(content: string): { rows: string[][]; truncatedRows: boolean; truncatedColumns: boolean } {
	const lines = content.split(/\r?\n/).filter((line, index, arr) => index < arr.length - 1 || line.length > 0);
	const rows: string[][] = [];
	let truncatedColumns = false;

	for (const line of lines.slice(0, CSV_PREVIEW_MAX_ROWS)) {
		const cells = parseCsvLine(line);
		if (cells.length > CSV_PREVIEW_MAX_COLUMNS) truncatedColumns = true;
		rows.push(cells.slice(0, CSV_PREVIEW_MAX_COLUMNS));
	}

	return {
		rows,
		truncatedRows: lines.length > CSV_PREVIEW_MAX_ROWS,
		truncatedColumns,
	};
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
		try {
			const formatted = JSON.stringify(JSON.parse(content), null, 2);
			renderPre(root, formatted, "json");
		} catch {
			root.createDiv({
				cls: "health-md-source-warning",
				text: "Could not pretty-print JSON; showing raw file contents.",
			});
			renderPre(root, content, "json");
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

		const details = root.createEl("details", { cls: "health-md-source-raw" });
		details.createEl("summary", { text: "Raw CSV" });
		renderPre(details, content, "csv");
	}
}
