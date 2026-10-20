import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
let temporary, module;
after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });
async function readers() {
    if (module) return module;
    temporary = await mkdtemp(path.join(os.tmpdir(), 'healthmd-workout-range-'));
    const outfile = path.join(temporary, 'readers.mjs');
    await build({ stdin: { contents: ['rollup', 'json', 'csv', 'markdown'].map(name => `export * from './src/parsers/${name}-parser.ts';`).join('\n'),
        resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
    return module = await import(pathToFileURL(outfile).href);
}
const root = 'tests/fixtures/workout-range-rules-v12';
async function files(folder) {
    const result = [];
    for (const item of await readdir(folder, { withFileTypes: true })) {
        const filename = path.join(folder, item.name);
        if (item.isDirectory()) result.push(...await files(filename));
        else result.push(filename);
    }
    return result;
}
test('all eight native workout range configurations preserve measured reducers across four formats', async () => {
    const module = await readers();
    const variants = (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory());
    assert.equal(variants.length, 8);
    for (const variant of variants) {
        const all = await files(path.join(root, variant.name));
        const base = all.find(file => file.includes('/Range/') && file.endsWith('.json')).slice(0, -5);
        for (const [suffix, parse] of [['.json', module.parseRollupJSON], ['.csv', module.parseRollupCSV], ['.md', module.parseRollupMarkdown], ['-bases.md', module.parseRollupMarkdown]]) {
            const source = await readFile(base + suffix, 'utf8'), range = parse(source);
            assert.ok(range, variant.name + suffix);
            assert.equal(range.rollupRulesVersion, 12);
            assert.equal(range.schemaVersion, 11);
            assert.equal(range.sourceSchemaVersion, 11);
            assert.equal(range.schema_profile, 'apple-rollup-v11');
            assert.equal(range.daysExpected, 2);
            assert.equal(range.daysCounted, 2);
            assert.equal(range.coveragePercent, 100);
            for (const [key, expected, rule] of [['workout_avg_heart_rate', 175, 'weighted_average'], ['workout_avg_power', 150, 'weighted_average'],
                ['workout_max_heart_rate', 260, 'maximum'], ['workout_min_heart_rate', 50, 'minimum'], ['workout_max_power', 900, 'maximum'],
                ['workout_running_cadence', 195, 'weighted_average'], ['workout_running_stride_length', 1.75, 'weighted_average'],
                ['workout_running_ground_contact', 275, 'weighted_average'], ['workout_running_vertical_oscillation', 9, 'weighted_average'],
                ['workout_cycling_cadence', 260 / 3, 'weighted_average']]) {
                assert.equal(range.metrics[key].primaryValue, expected, variant.name + suffix + key);
                assert.equal(range.metrics[key].rule, rule);
            }
            const visibleDuration = variant.name.split('-').at(-2) === 'true';
            assert.equal(range.metrics.workout_minutes !== undefined, visibleDuration);
        }
        const summaryOnly = variant.name.endsWith('-true');
        const daily = all.filter(file => !file.includes('/Range/'));
        assert.equal(daily.length, summaryOnly ? 0 : 8);
        for (const json of daily.filter(file => file.endsWith('.json'))) {
            const source = JSON.parse(await readFile(json, 'utf8'));
            assert.equal(source.workouts.length, 3);
            const base = json.slice(0, -5);
            for (const [suffix, parse] of [['.json', module.parseJSON], ['.csv', module.parseCSV], ['.md', module.parseMarkdown], ['-bases.md', module.parseMarkdown]]) {
                const result = parse(await readFile(base + suffix, 'utf8')), day = Array.isArray(result) ? result[0] : result;
                assert.ok(day, base + suffix);
                assert.deepEqual(day.nativeWorkoutDetails.map(record => record.sample), source.workouts, base + suffix);
            }
        }
    }
});
test('range reader rejects unsupported reducers, wrong source grammar and cached rule relabelling', async () => {
    const module = await readers();
    const all = await files(root);
    const json = all.find(file => file.includes('/Range/') && file.endsWith('.json'));
    const source = JSON.parse(await readFile(json, 'utf8'));
    for (const mutate of [value => value.rollup_rules_version = 13, value => value.source_schema_version = 8,
        value => value.schema_version = 9, value => value.rollup_period = 'weekly', value => value.time_context.sleep_day_attribution = 'night_begins']) {
        const invalid = structuredClone(source); mutate(invalid);
        assert.equal(module.parseRollupJSON(JSON.stringify(invalid)), null);
    }
    const markdown = await readFile(json.slice(0, -5) + '-bases.md', 'utf8');
    assert.ok(module.parseRollupMarkdown(markdown));
    assert.equal(module.parseRollupMarkdown(markdown, { rollup_rules_version: 11 }), null);
});
test('the native range corpus is retained without byte rewriting', async () => {
    const manifest = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
    assert.equal(Object.keys(manifest.files).length, 64);
    for (const [filename, digest] of Object.entries(manifest.files)) {
        assert.equal(createHash('sha256').update(await readFile(path.join(root, filename))).digest('hex'), digest, filename);
    }
});
