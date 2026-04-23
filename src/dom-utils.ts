export interface StatBox {
	value: string;
	label: string;
	color?: string;
}

export interface InlineStatPart {
	text: string;
	strong?: boolean;
}

export function renderStatBoxes(statsEl: HTMLElement, boxes: StatBox[]): void {
	statsEl.empty();
	boxes.forEach(({ value, label, color }) => {
		const box = statsEl.createDiv({ cls: "health-md-stat-box" });
		const valueEl = box.createDiv({
			cls: "health-md-stat-value",
			text: value,
		});
		if (color) {
			valueEl.style.color = color;
		}
		box.createDiv({ cls: "health-md-stat-label", text: label });
	});
}

export function renderInlineStats(
	statsEl: HTMLElement,
	stats: InlineStatPart[][]
): void {
	statsEl.empty();
	stats.forEach((parts) => {
		const row = statsEl.createSpan();
		parts.forEach((part) => {
			if (part.strong) {
				row.createEl("strong", { text: part.text });
				return;
			}
			row.appendChild(activeDocument.createTextNode(part.text));
		});
	});
}

export function appendSvgFromMarkup(container: HTMLElement, svgMarkup: string): void {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
	const svg = doc.documentElement;
	if (svg.tagName.toLowerCase() !== "svg") return;
	container.appendChild(activeDocument.importNode(svg, true));
}
