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
