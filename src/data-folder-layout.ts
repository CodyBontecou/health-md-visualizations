import type { DataFolderGranularity } from "./types";

export const SUPPORTED_DATA_EXTENSIONS = ["json", "csv", "md"] as const;

const DATA_FOLDER_MAX_DEPTH: Record<DataFolderGranularity, number> = {
	flat: 0,
	year: 1,
	month: 2,
	week: 3,
	day: 4,
};

export interface DataFilePathCandidate {
	name: string;
	extension: string;
	path: string;
	rootPath: string;
	pattern: string;
}

export function dataFolderMaxDepth(
	granularity: DataFolderGranularity
): number {
	return DATA_FOLDER_MAX_DEPTH[granularity];
}

export function shouldDescendIntoDataFolderDepth(
	granularity: DataFolderGranularity,
	depth: number
): boolean {
	return depth < dataFolderMaxDepth(granularity);
}

export function isSupportedDataExtension(extension: string): boolean {
	return (SUPPORTED_DATA_EXTENSIONS as readonly string[]).includes(extension);
}

export function matchesGlob(candidate: string, pattern: string): boolean {
	if (!pattern || pattern === "*" || pattern === "*.*") return true;

	// Simple glob: support * and ? wildcards
	const regex = new RegExp(
		"^" +
			pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, ".*")
				.replace(/\?/g, ".") +
			"$",
		"i"
	);
	return regex.test(candidate);
}

export function relativePathFromRoot(rootPath: string, filePath: string): string {
	const normalizedRoot = rootPath.replace(/\/+$/g, "");
	if (!normalizedRoot) return filePath;
	const prefix = `${normalizedRoot}/`;
	return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : filePath;
}

export function matchesDataFilePath({
	name,
	extension,
	path,
	rootPath,
	pattern,
}: DataFilePathCandidate): boolean {
	if (!isSupportedDataExtension(extension)) return false;
	if (matchesGlob(name, pattern)) return true;
	return matchesGlob(relativePathFromRoot(rootPath, path), pattern);
}
