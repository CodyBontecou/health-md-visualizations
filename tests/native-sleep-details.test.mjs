import { createHash } from "node:crypto";
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const directories = [];
let directory;
after(async()=>{await Promise.all(directories.map(value=>rm(value,{recursive:true,force:true})));});
async function readers(){
 directory=await mkdtemp(path.join(os.tmpdir(),'healthmd-native-sleep-'));
 directories.push(directory);
 const output=path.join(directory,'readers.mjs');
 await build({stdin:{contents:['json','csv','markdown'].map(name=>`export * from './src/parsers/${name}-parser.ts';`).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:output,logLevel:'silent'});
 return import(pathToFileURL(output).href);
}
test('verbatim native parent/stage artifacts retain exact timing in every reader',async()=>{
 const module=await readers();
 const base=path.join(process.cwd(),'tests/fixtures/sleep-native-parents/2026-11-01');
 const provenance=JSON.parse(await readFile(path.join(process.cwd(),'tests/fixtures/sleep-native-parents/provenance.json'),'utf8'));
 for(const [name,digest] of Object.entries(provenance.sha256)) {
  const bytes=await readFile(path.join(process.cwd(),'tests/fixtures/sleep-native-parents',name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),digest,name);
 }
 const native=module.parseJSON(await readFile(base+'.json','utf8'));
 for(const [suffix,parse] of [['.csv',module.parseCSV],['.md',module.parseMarkdown],['-bases.md',module.parseMarkdown]]){
  const value=parse(await readFile(base+suffix,'utf8'));
  const day=Array.isArray(value)?value[0]:value;
  assert.ok(day,suffix);
  assert.equal(day.sleep.sleepStages.length,1,suffix);
  assert.equal(day.sleep.sleepSessions.length,2,suffix);
  assert.equal(day.sleep.sleepStages[0].startDate,native.sleep.sleepStages[0].startDate,suffix);
  assert.equal(day.sleep.sleepStages[0].endDate,native.sleep.sleepStages[0].endDate,suffix);
  assert.equal(day.sleep.sleepStages[0].durationSeconds,native.sleep.sleepStages[0].durationSeconds,suffix);
  for(let i=0;i<2;i++){
   assert.equal(day.sleep.sleepSessions[i].startTimeISO,native.sleep.sleepSessions[i].startTimeISO,suffix);
   assert.equal(day.sleep.sleepSessions[i].endTimeISO,native.sleep.sleepSessions[i].endTimeISO,suffix);
  }
  if(suffix!=='.md'){
   assert.deepEqual(day.sleep.sleepStages,native.sleep.sleepStages,suffix);
   assert.deepEqual(day.sleep.sleepSessions,native.sleep.sleepSessions,suffix);
  }
 }
});
test('successor details reject malformed clocks without rewriting source records',async()=>{
 const module=await readers();
 const base=path.join(process.cwd(),'tests/fixtures/sleep-native-parents/2026-11-01');
 for(const [suffix,parse] of [['.json',module.parseJSON],['.csv',module.parseCSV],['.md',module.parseMarkdown],['-bases.md',module.parseMarkdown]]){
  const input=await readFile(base+suffix,'utf8');
  const invalid=input.replaceAll('2026-11-01T18:30:00.987654321Z','2026-02-30T18:30:00.987654321Z');
  const value=parse(invalid);
  assert.ok(value===null || (Array.isArray(value)&&value.length===0),suffix);
 }
 const baseCsv=await readFile(base+'.csv','utf8');
 assert.deepEqual(module.parseCSV(baseCsv.replace(',seconds,2026-11-01T02:00:00.123456789Z',',seconds,2026-11-01T02:00:00.000000000Z')),[]);
 const apple=JSON.parse(await readFile(base+'.json','utf8'));
 apple.schema_version=11;apple.schema_profile='apple-v11';
 apple.sleep.sleepStages[0].stage='core';
 delete apple.sleep.lightSleep;
 assert.equal(module.parseJSON(JSON.stringify(apple)),null,'Health Connect parents are not Apple native parents');
 delete apple.sleep.sleepSessions;
 const day=module.parseJSON(JSON.stringify(apple));
 assert.equal(day.sleep.sleepStages[0].stage,'core');
 assert.equal(day.sleep.sleepStages[0].startDate,'2026-11-01T02:00:00.123456789Z');
});


test('native Apple fixture bytes retain recorded producer provenance', async () => {
 const root = path.join(process.cwd(), 'tests/fixtures/sleep-native-apple');
 const provenance = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
 assert.equal(provenance.synthetic, true);
 assert.match(provenance.producer_revision, /^[a-f0-9]{40}$/);
 assert.equal(Object.keys(provenance.sha256).length, 8);
 for (const [name, digest] of Object.entries(provenance.sha256)) {
  assert.equal(createHash('sha256').update(await readFile(path.join(root, name))).digest('hex'), digest, name);
 }
});

test('native Apple stage selection retains exact clocks and platform identities in every reader', async () => {
 const module = await readers();
 for (const variant of ['selected-stages', 'total-only']) {
  const base = path.join(process.cwd(), 'tests/fixtures/sleep-native-apple', variant, '2026-11-01');
  const native = JSON.parse(await readFile(base + '.json', 'utf8'));
  const expectedStages = variant === 'total-only' ? ['unspecified'] : ['inBed', 'core', 'unspecified'];
  assert.deepEqual(native.sleep.sleepStages.map(stage => stage.stage), expectedStages);
  for (const [suffix, parse] of [['.json', module.parseJSON], ['.csv', module.parseCSV], ['.md', module.parseMarkdown], ['-bases.md', module.parseMarkdown]]) {
   const result = parse(await readFile(base + suffix, 'utf8'));
   const day = Array.isArray(result) ? result[0] : result;
   assert.ok(day, variant + suffix);
   assert.equal(day.date, '2026-11-01');
   assert.equal(day.schemaProfile, 'apple-v11');
   assert.deepEqual(day.sleep.sleepStages.map(stage => stage.stage), expectedStages, variant + suffix);
   assert.equal(day.sleep.sleepSessions, undefined, 'Apple does not synthesize Android parent records');
   assert.equal(day.sleep.lightSleep, undefined, 'Core does not alias Light');
   for (let i = 0; i < native.sleep.sleepStages.length; i++) {
    const expected = native.sleep.sleepStages[i];
    const actual = day.sleep.sleepStages[i];
    assert.equal(actual.startDate, expected.startDate, variant + suffix);
    assert.equal(actual.endDate, expected.endDate, variant + suffix);
    assert.equal(actual.durationSeconds, expected.durationSeconds, variant + suffix);
   }
   if (suffix !== '.md') {
    assert.deepEqual(day.sleep.sleepStages, native.sleep.sleepStages, variant + suffix);
   }
  }
 }
});


test('successor Markdown uses exact selected summary facts and never overlapping stage inference', async () => {
 const module = await readers();
 for (const profile of ['apple-v11', 'android-sleep-v6']) {
  const header = '> Health.md sleep attribution: `morning_ends` (Morning ends); whole sessions by wake-up date.\n'
   + '> Profile: `' + profile + '`; calendar timezone: `America/New_York`; timestamp timezone: `UTC`; owner rule: `session_end_date`; clipping: `none`.\n';
  let body = '\n# Health Data — 2026-11-01\n\n## Sleep\n- **Total Sleep:** 20.83 hours\n'
   + '\n## Sleep Stage Details\n| Start (UTC) | End (UTC) | Stage |\n|---|---|---|\n'
   + '| 2026-10-31T23:30:00.125Z | 2026-11-01T20:20:00.125Z | inBed |\n'
   + '| 2026-10-31T23:30:00.125Z | 2026-11-01T20:20:00.125Z | rem |\n';
  if (profile === 'android-sleep-v6') body = body.replace('inBed', 'sleeping');
  const facts = {sleep_total_hours: 75000 / 3600, sleep_rem_hours: 75000 / 3600, sleep_bedtime:1170, sleep_wake:920};
  const parse = value => module.parseMarkdown(header + '> Sleep summary facts: `' + value + '`\n' + body);
  const value = parse(JSON.stringify(facts));
  assert.ok(value);
  assert.equal(value.sleep.bedtime, "19:30");
  assert.equal(value.sleep.wakeTime, "15:20");
  assert.ok(Math.abs(value.sleep.totalDuration - 75000) < 1e-8);
  assert.ok(Math.abs(value.sleep.remSleep - 75000) < 1e-8);
  assert.equal(parse('{"sleep_total_hours":1.25}').sleep.totalDuration, 4500, 'SDK totals remain independent of stage sums');
  assert.equal(parse('{"sleep_rem_hours":0.25}').sleep.totalDuration, undefined, 'a partial stage summary does not authorize total sleep');
  assert.equal(parse('{"sleep_rem_hours":0.25}').sleep.remSleep, 900);
  for (const noSummary of [parse('{}'), module.parseMarkdown(header + body)]) {
   assert.equal(noSummary.sleep.totalDuration, undefined);
   assert.equal(noSummary.sleep.remSleep, undefined);
   assert.equal(noSummary.sleep.coreSleep, undefined);
   assert.equal(noSummary.sleep.bedtimeISO, undefined);
   assert.equal(noSummary.sleep.wakeTimeISO, undefined);
  }
  for (const malformed of ['{"sleep_total_hours":-1}', '{"sleep_total_hours":"20"}', '{"unknown":1}', '{"sleep_bedtime":"25:00"}', '{"sleep_total_hours":1,"sleep_total_hours":2}']) {
   assert.equal(parse(malformed), null, malformed);
  }
  assert.equal(module.parseMarkdown(header + '> Sleep summary facts: `{}`\n> Sleep summary facts: `{}`\n' + body), null);
  assert.equal(module.parseMarkdown('> Sleep summary facts: `{}`\n' + body), null);
 }
});


test('native metadata-off summary cells match SDK totals without losing full stage facts', async () => {
 const module = await readers();
 const root = path.join(process.cwd(), 'tests/fixtures/native-sleep-exact-summary');
 const provenance = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
 for (const [name, hash] of Object.entries(provenance.sha256)) assert.equal(createHash('sha256').update(await readFile(path.join(root, name))).digest('hex'), hash);
 for (const metadata of ['true', 'false']) {
  const base = path.join(root, metadata, '2026-11-01');
  const native = module.parseJSON(await readFile(base + '.json', 'utf8'));
  for (const [suffix, parse] of [['.csv', module.parseCSV], ['.md', module.parseMarkdown], ['-bases.md', module.parseMarkdown]]) {
   const value = parse(await readFile(base + suffix, 'utf8'));
   const day = Array.isArray(value) ? value[0] : value;
   assert.ok(day, metadata + suffix);
   assert.ok(Math.abs(day.sleep.totalDuration - native.sleep.totalDuration) < 1e-8, metadata + suffix);
   assert.deepEqual(day.sleep.sleepStages, native.sleep.sleepStages, metadata + suffix);
   assert.equal(day.sleep.lightSleep, undefined);
  }
 }
});


test('successor CSV never derives missing sleep summaries and retains independent zero and stage-only summaries', async () => {
 const module = await readers();
 for (const metadata of ['true', 'false']) {
  const csv = await readFile(path.join(process.cwd(), 'tests/fixtures/native-sleep-exact-summary', metadata, '2026-11-01.csv'), 'utf8');
  const onlyStages = csv.split('\n').filter(line => !line.startsWith('2026-11-01,Sleep,')).join('\n');
  const day = module.parseCSV(onlyStages)[0];
  assert.ok(day.sleep.sleepStages.length > 0);
  for (const key of ['totalDuration', 'deepSleep', 'remSleep', 'coreSleep', 'awakeTime', 'bedtimeISO', 'wakeTimeISO']) assert.equal(day.sleep[key], undefined, key);
  const noStages = onlyStages.split('\n').filter(line => !line.startsWith('2026-11-01,Sleep Detail,')).join('\n');
  const zero = module.parseCSV(noStages + '\n2026-11-01,Sleep,Total Sleep,0,hours,\n')[0];
  assert.equal(zero.sleep.totalDuration, 0);
  const awake = module.parseCSV(noStages + '\n2026-11-01,Sleep,Awake Time,0.25,hours,\n')[0];
  assert.equal(awake.sleep.totalDuration, undefined);
  assert.equal(awake.sleep.awakeTime, 900);
 }
 const markdown = await readFile(path.join(process.cwd(), 'tests/fixtures/native-sleep-exact-summary/false/2026-11-01.md'), 'utf8');
 const justRem = markdown.slice(0, markdown.indexOf('## Sleep Stage Details')).replace(/^> Sleep summary facts:.*$/m, '> Sleep summary facts: `{"sleep_rem_hours":0.25}`');
 const parsed = module.parseMarkdown(justRem);
 assert.equal(parsed.sleep.totalDuration, undefined);
 assert.equal(parsed.sleep.remSleep, 900);
});
