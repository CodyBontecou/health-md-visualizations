import { Vault, TFile, TFolder } from "obsidian";
import { HealthDay, HealthMdSettings } from "./types";

export class DataLoader {
	private cache: HealthDay[] | null = null;
	private lastLoad = 0;
	private TTL = 30_000;

	constructor(private vault: Vault, private settings: HealthMdSettings) {}

	async load(): Promise<HealthDay[]> {
		if (this.cache && Date.now() - this.lastLoad < this.TTL) {
			return this.cache;
		}

		const folder = this.vault.getAbstractFileByPath(this.settings.dataFolder);
		if (!(folder instanceof TFolder)) return [];

		const files = folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === "json"
		);

		const days: HealthDay[] = [];
		for (const file of files) {
			const content = await this.vault.cachedRead(file);
			try {
				const parsed = JSON.parse(content);
				if (parsed.type === "health-data") days.push(parsed);
			} catch {
				// skip malformed files
			}
		}

		this.cache = days.sort((a, b) => a.date.localeCompare(b.date));
		this.lastLoad = Date.now();
		return this.cache;
	}

	invalidate(): void {
		this.cache = null;
	}
}
