import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let modulePromise;

async function loadDateVariables() {
	if (modulePromise) return modulePromise;
	modulePromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-date-variable-tests-"));
		const outfile = path.join(tempDir, "date-variables.mjs");
		await esbuild.build({
			entryPoints: [path.join(process.cwd(), "src/date-variables.ts")],
			bundle: true,
			platform: "node",
			format: "esm",
			outfile,
			logLevel: "silent",
		});
		return import(pathToFileURL(outfile).href);
	})();
	return modulePromise;
}

after(async () => {
	if (tempDir) {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("dynamic date variables resolve current week and month boundaries", async () => {
	const { resolveDynamicDateVariable } = await loadDateVariables();
	const now = new Date(2026, 6, 2, 12, 30, 5); // Thu Jul 2, 2026 local time

	assert.deepEqual(resolveDynamicDateVariable("{{today:YYYY-MM-DD}}", now), {
		matched: true,
		value: "2026-07-02",
	});
	assert.deepEqual(resolveDynamicDateVariable("{{monday:YYYY-MM-DD}}", now), {
		matched: true,
		value: "2026-06-29",
	});
	assert.deepEqual(resolveDynamicDateVariable("{{sunday:YYYY-MM-DD}}", now), {
		matched: true,
		value: "2026-07-05",
	});
	assert.deepEqual(resolveDynamicDateVariable("{{month-start}}", now), {
		matched: true,
		value: "2026-07-01",
	});
	assert.deepEqual(resolveDynamicDateVariable("{{month_start}}", now), {
		matched: true,
		value: "2026-07-01",
	});
	assert.deepEqual(resolveDynamicDateVariable("{{month-end}}", now), {
		matched: true,
		value: "2026-07-31",
	});
});

test("dynamic date variables support datetime format tokens", async () => {
	const { resolveDynamicDateVariable } = await loadDateVariables();
	const now = new Date(2026, 6, 2, 12, 30, 5);

	assert.deepEqual(resolveDynamicDateVariable("{{now:YYYY-MM-DDTHH:mm:ss}}", now), {
		matched: true,
		value: "2026-07-02T12:30:05",
	});
	assert.deepEqual(resolveDynamicDateVariable("{{week-end:YYYY-MM-DDTHH:mm:ss}}", now), {
		matched: true,
		value: "2026-07-05T23:59:59",
	});
});

test("frontmatter variable references support brace and dollar-brace forms", async () => {
	const { parseFrontmatterVariableReference } = await loadDateVariables();

	assert.equal(parseFrontmatterVariableReference("{journal-start}"), "journal-start");
	assert.equal(parseFrontmatterVariableReference("${report_start}"), "report_start");
	assert.equal(parseFrontmatterVariableReference("{{today}}"), null);
	assert.equal(parseFrontmatterVariableReference("2026-07-02"), null);
});

test("unknown dynamic date variables return an inline-friendly error", async () => {
	const { resolveDynamicDateVariable } = await loadDateVariables();
	const result = resolveDynamicDateVariable("{{fiscal-start}}", new Date(2026, 6, 2));

	assert.equal(result.matched, true);
	assert.match(result.error, /Unknown dynamic date variable "fiscal-start"/);
});
