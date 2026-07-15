import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

let tempDir;
let modulePromise;

async function loadTimeUtils() {
	if (modulePromise) return modulePromise;
	modulePromise = (async () => {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "health-md-time-utils-tests-"));
		const outfile = path.join(tempDir, "time-utils.mjs");
		await esbuild.build({
			entryPoints: [path.join(process.cwd(), "src/time-utils.ts")],
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

test("formatClockTime handles Health.md time-only and ISO values", async () => {
	const { formatClockTime } = await loadTimeUtils();

	assert.equal(formatClockTime("01:16"), "1:16 AM");
	assert.equal(formatClockTime("01:16:59"), "1:16 AM");
	assert.equal(formatClockTime("2026-07-15T23:05:12-04:00"), "11:05 PM");
});

test("formatClockTime supports meridiem values and rejects missing or invalid values", async () => {
	const { formatClockTime } = await loadTimeUtils();

	assert.equal(formatClockTime("1:16 PM"), "1:16 PM");
	assert.equal(formatClockTime("12:05 AM"), "12:05 AM");
	assert.equal(formatClockTime(undefined), undefined);
	assert.equal(formatClockTime(""), undefined);
	assert.equal(formatClockTime("not-a-time"), undefined);
	assert.equal(formatClockTime("25:00"), undefined);
});
