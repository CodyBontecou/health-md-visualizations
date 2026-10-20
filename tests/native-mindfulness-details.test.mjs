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
 temporary = await mkdtemp(path.join(os.tmpdir(), 'healthmd-mindfulness-reader-'));
 const outfile = path.join(temporary, 'reader.mjs');
 await build({stdin: {contents: ["export * from './src/native-mindfulness-details.ts';",
  ...['json', 'csv', 'markdown'].map(name => `export * from './src/parsers/${name}-parser.ts';`)].join('\n'),
  resolveDir: process.cwd(), loader: 'ts'}, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent'});
 return module = await import(pathToFileURL(outfile).href);
}
const root = 'tests/fixtures/native-mindfulness';
async function files(folder) {
 const result = [];
 for (const item of await readdir(folder, {withFileTypes: true})) {
  const name = path.join(folder, item.name);
  if (item.isDirectory()) result.push(...await files(name)); else result.push(name);
 }
 return result;
}
test('actual native mindfulness artifacts retain distinct complete source records in every format', async () => {
 const r = await readers();
 const variants = (await readdir(root, {withFileTypes: true})).filter(item => item.isDirectory());
 assert.equal(variants.length, 4);
 for (const variant of variants) {
  const all = await files(path.join(root, variant.name));
  assert.equal(all.length, 4);
  const json = all.find(file => file.endsWith('.json')), source = JSON.parse(await readFile(json, 'utf8'));
  const apple = source.schema_profile === 'apple-v11';
  const samples = source.mindfulness[apple ? 'stateOfMindEntries' : 'sessions'];
  assert.equal(samples.length, 1);
  for (const file of all) {
   const text = await readFile(file, 'utf8');
   const parse = file.endsWith('.json') ? r.parseJSON : file.endsWith('.csv') ? r.parseCSV : r.parseMarkdown;
   const parsed = parse(text), day = Array.isArray(parsed) ? parsed[0] : parsed;
   assert.ok(day, file);
   assert.equal(day.nativeMindfulnessDetails.length, 1, file);
   const detail = day.nativeMindfulnessDetails[0];
   assert.equal(detail.metric, apple ? 'state_of_mind' : 'mindfulness_session');
   assert.deepEqual(detail.sample, samples[0], file);
   assert.equal(detail.sample.metadata.synthetic, 'mind, source');
   if (apple) {
    assert.equal(detail.sample.valence, -0.123456789);
    assert.deepEqual(detail.sample.labels, ['Calm|alert', 'quoted "label"']);
    assert.equal(day.mindfulness.sessions, undefined);
   } else {
    assert.equal(detail.sample.startTimeISO, '2026-11-01T05:30:00.123456789Z');
    assert.equal(detail.sample.endTimeISO, '2026-11-01T06:30:00.987654321Z');
    assert.equal(day.mindfulness.sessions[0].startTime, detail.sample.startTimeISO);
    assert.equal(day.mindfulness.stateOfMindEntries, undefined);
   }
  }
 }
});
test('native mindfulness rejects wrong platform, invalid valence, identity and contradictory exact clocks', async () => {
 const r = await readers(), all = await files(root);
 for (const file of all.filter(name => name.endsWith('.json') && !name.endsWith('/provenance.json'))) {
  const source = JSON.parse(await readFile(file, 'utf8')), apple = source.schema_profile === 'apple-v11';
  const sample = source.mindfulness[apple ? 'stateOfMindEntries' : 'sessions'][0];
  const metric = apple ? 'state_of_mind' : 'mindfulness_session';
  assert.equal(r.nativeMindfulnessDetails([{metric, sample}], apple ? 'android-sleep-v6' : 'apple-v11'), null);
  assert.equal(r.nativeMindfulnessDetails([{metric, sample}], apple ? 'apple-v8' : 'android-analytical-v5'), null);
  const mutations = apple ? [s => s.valence = 2, s => s.valencePercent = 99, s => s.id = 'invalid',
   s => s.labels = [1], s => s.kind = 'invented', s => s.endDate = '2000-01-01T00:00:00Z'] :
   [s => delete s.exactStartTime, s => s.exactStartTime.nano++, s => s.exactEndTime.iso8601 = '2000-01-01T00:00:00Z',
    s => s.endTimeISO = s.startTimeISO, s => s.exactStartTime.offset = '+01:00'];
  for (const mutate of mutations) {
   const changed = structuredClone(sample); mutate(changed);
   assert.equal(r.nativeMindfulnessDetails([{metric, sample: changed}], source.schema_profile), null, file);
  }
  if (apple) assert.equal(r.nativeMindfulnessDetails([{metric, sample}, {metric, sample}], source.schema_profile), null);
 }
});
test('the native mindfulness corpus retains exact captured bytes', async () => {
 const manifest = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
 assert.equal(Object.keys(manifest.files).length, 16);
 for (const [file, digest] of Object.entries(manifest.files)) {
  assert.equal(createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'), digest, file);
 }
});

test('Markdown reconciles redundant mindfulness details and rejects a contradictory frontmatter shadow', async () => {
 const r = await readers();
 for (const platform of ['apple-v11', 'android-v6']) {
  const folder = `${root}/${platform}-mindfulness-true/${platform === 'apple-v11' ? 'Health' : 'health'}`;
  const date = platform === 'apple-v11' ? '2026-03-14' : '2026-11-01';
  const markdown = await readFile(`${folder}/${date}.md`, 'utf8');
  const native = r.parseJSON(await readFile(`${folder}/${date}.json`, 'utf8')).nativeMindfulnessDetails;
  for (const records of [[], native]) {
   const field = records.length ? `native_mindfulness_details:\n  - ${JSON.stringify(records[0])}` : 'native_mindfulness_details: []';
   const both = markdown.replace('\n---\n', `\n${field}\n---\n`);
   const day = r.parseMarkdown(both);
   assert.ok(day, platform);
   assert.deepEqual(day.nativeMindfulnessDetails, native, platform);
  }
  const conflicting = structuredClone(native[0]); conflicting.sample.metadata.synthetic = 'contradiction';
  const both = markdown.replace('\n---\n', `\nnative_mindfulness_details:\n  - ${JSON.stringify(conflicting)}\n---\n`);
  assert.equal(r.parseMarkdown(both), null, platform);
  const wrongHeading = markdown.replace(platform === 'apple-v11' ? 'State of Mind Details' : 'Mindfulness Session Details',
   platform === 'apple-v11' ? 'Mindfulness Session Details' : 'State of Mind Details');
  assert.equal(r.parseMarkdown(wrongHeading), null, platform);
 }
});
