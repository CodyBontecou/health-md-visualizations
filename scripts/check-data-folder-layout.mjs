import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const repoRoot = process.cwd();
const tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-layout-"));

try {
	const outfile = path.join(tempDir, "data-folder-layout.mjs");
	await esbuild.build({
		entryPoints: [path.join(repoRoot, "src/data-folder-layout.ts")],
		bundle: true,
		platform: "node",
		format: "esm",
		outfile,
		logLevel: "silent",
	});

	const layout = await import(pathToFileURL(outfile).href);

	const expectedDepths = {
		flat: 0,
		year: 1,
		month: 2,
		week: 3,
		day: 4,
	};

	for (const [granularity, maxDepth] of Object.entries(expectedDepths)) {
		assert.equal(layout.dataFolderMaxDepth(granularity), maxDepth);
		assert.equal(
			layout.shouldDescendIntoDataFolderDepth(granularity, maxDepth),
			false,
			`${granularity} should stop after depth ${maxDepth}`
		);
		if (maxDepth > 0) {
			assert.equal(
				layout.shouldDescendIntoDataFolderDepth(granularity, maxDepth - 1),
				true,
				`${granularity} should descend before depth ${maxDepth}`
			);
		}
	}

	assert.equal(layout.shouldDescendIntoDataFolderDepth("flat", 0), false);
	assert.equal(layout.dataFolderMaxDepth("custom", "{year}/{month}/{day}"), 3);
	assert.equal(layout.dataFolderMaxDepth("custom", "Apple Health/{year}/{week}"), 3);
	assert.equal(layout.shouldDescendIntoDataFolderDepth("custom", 2, "{year}/{month}/{day}"), true);
	assert.equal(layout.shouldDescendIntoDataFolderDepth("custom", 3, "{year}/{month}/{day}"), false);
	assert.equal(layout.normalizeDataFolderPathTemplate("../../{year}//{month}/./{day}/"), "{year}/{month}/{day}");
	assert.equal(layout.normalizeDataFolderPathTemplate("exports\u0000/{year}\u001f/{month}\u007f"), "exports/{year}/{month}");
	assert.equal(layout.normalizeDataFolderPathTemplate(""), "{year}/{month}/{day}");
	assert.deepEqual(layout.dataFolderPathTemplateDateParts("2026-06-03"), {
		year: "2026",
		month: "06",
		week: "W23",
		day: "03",
		date: "2026-06-03",
	});
	assert.equal(layout.renderDataFolderPathTemplate("exports/{year}/{week}/{date}", "2026-06-03"), "exports/2026/W23/2026-06-03");
	assert.equal(layout.relativePathFromRoot("Health", "Health/2026/06/03/data.json"), "2026/06/03/data.json");

	assert.equal(
		layout.matchesDataFilePath({
			name: "2026-06-03.json",
			extension: "json",
			path: "Health/2026-06-03.json",
			rootPath: "Health",
			pattern: "*.json",
		}),
		true,
		"flat direct files continue to match file-name globs"
	);

	assert.equal(
		layout.matchesDataFilePath({
			name: "data.json",
			extension: "json",
			path: "Health/2026/06/03/data.json",
			rootPath: "Health",
			pattern: "2026/**/*.json",
		}),
		true,
		"nested files can match data-folder-relative globs"
	);

	assert.equal(
		layout.matchesDataFilePath({
			name: "data.txt",
			extension: "txt",
			path: "Health/2026/06/03/data.txt",
			rootPath: "Health",
			pattern: "*",
		}),
		false,
		"unsupported extensions remain ignored"
	);

	assert.equal(
		layout.matchesDataFilePath({
			name: "data.json",
			extension: "json",
			path: "Health/2026/06/03/data.json",
			rootPath: "Health",
			pattern: "2025/**/*.json",
		}),
		false,
		"nested relative patterns do not match unrelated years"
	);

	console.log("Data folder layout checks passed");
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
