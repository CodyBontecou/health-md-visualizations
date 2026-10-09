import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
let temporary,harness;
after(async()=>{if(temporary) await rm(temporary,{recursive:true,force:true});});
async function readers(){
 if(harness)return harness;
 temporary=await mkdtemp(path.join(os.tmpdir(),'healthmd-native-bp-'));
 const outfile=path.join(temporary,'readers.mjs');
 await build({stdin:{contents:['json','csv','markdown'].map(name=>`export * from './src/parsers/${name}-parser.ts';`).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
 return harness=await import(pathToFileURL(outfile).href);
}
const variants=[['apple-v11-blood-pressure','2026-03-15'],['android-v6-blood-pressure','2026-11-01']];
const base=(variant,date)=>path.join(process.cwd(),'tests/fixtures/native-blood-pressure',variant,date);
test('all four native blood-pressure formats retain pairs and source facts without aggregate anchors',async()=>{
 const module=await readers();
 for(const [variant,date] of variants){
  const native=module.parseJSON(await readFile(base(variant,date)+'.json','utf8'));
  assert.equal(native.nativeCorrelationDetails.length,1);
  assert.equal(native.vitals.bloodPressureSamples[0].systolic,120.125);
  assert.equal(native.vitals.bloodPressureSamples[0].diastolic,80.875);
  for(const [suffix,parse] of [['.csv',module.parseCSV],['.md',module.parseMarkdown],['-bases.md',module.parseMarkdown]]){
   const result=parse(await readFile(base(variant,date)+suffix,'utf8')),day=Array.isArray(result)?result[0]:result;
   assert.ok(day,variant+suffix);
   assert.equal(day.nativeCorrelationDetails.length,1);
   const sample=day.vitals.bloodPressureSamples[0],source=native.vitals.bloodPressureSamples[0];
   assert.equal(sample.systolic,source.systolic);assert.equal(sample.diastolic,source.diastolic);
   assert.equal(sample.timestamp,source.timestamp);assert.equal(sample.endDate,source.endDate);
   if(suffix!=='.md')assert.deepEqual(day.nativeCorrelationDetails,native.nativeCorrelationDetails);
   else assert.equal(sample.metadata,undefined);
   assert.equal(day.canonicalMetrics?.blood_pressure_systolic,undefined);
   assert.equal(day.canonicalMetrics?.blood_pressure_diastolic,undefined);
  }
 }
});
test('native blood-pressure readers reject split pairs, units, interval conflicts and exact-clock disagreement',async()=>{
 const module=await readers();
 const original=JSON.parse(await readFile(base('apple-v11-blood-pressure','2026-03-15')+'.json','utf8'));
 for(const mutation of [sample=>delete sample.diastolic,sample=>sample.unit='kPa',sample=>sample.endDate='2026-03-15T00:00:00Z',sample=>sample.systolic='120']){
  const copy=structuredClone(original);mutation(copy.vitals.bloodPressureSamples[0]);assert.equal(module.parseJSON(JSON.stringify(copy)),null);
 }
 const android=JSON.parse(await readFile(base('android-v6-blood-pressure','2026-11-01')+'.json','utf8'));
 android.vitals.bloodPressureSamples[0].exactTime.nano++;assert.equal(module.parseJSON(JSON.stringify(android)),null);
 const csv=await readFile(base('apple-v11-blood-pressure','2026-03-15')+'.csv','utf8');
 assert.deepEqual(module.parseCSV(csv.replace('json,2026-03-15T01:00:00.125000000Z','json,2026-03-15T01:00:00Z')),[]);
 const bases=await readFile(base('apple-v11-blood-pressure','2026-03-15')+'-bases.md','utf8');
 assert.equal(module.parseMarkdown(bases.replace('"unit":"mmHg"','"unit":"kPa"')),null);
 const md=await readFile(base('apple-v11-blood-pressure','2026-03-15')+'.md','utf8');
 assert.equal(module.parseMarkdown(md.replace('| 120.125 | 80.875 | mmHg |','| 120.125 | | mmHg |')),null);
});
test('native blood-pressure fixtures keep immutable producer byte hashes',async()=>{
 const root='tests/fixtures/native-blood-pressure',provenance=JSON.parse(await readFile(root+'/provenance.json','utf8'));
 assert.match(provenance.producer_commit,/^[0-9a-f]{40}$/);
 for(const [file,digest] of Object.entries(provenance.sha256))assert.equal(createHash('sha256').update(await readFile(root+'/'+file)).digest('hex'),digest,file);
});

test('paired-pressure exact ISO clock and supplied offset must agree with the recorded instant',async()=>{
 const module=await readers();
 const original=JSON.parse(await readFile(base('android-v6-blood-pressure','2026-11-01')+'.json','utf8'));
 for(const mutation of [clock=>clock.iso8601='2026-11-01T01:30:00.123456788Z',clock=>clock.offset='+01:00',clock=>delete clock.iso8601]){
  const copy=structuredClone(original);mutation(copy.vitals.bloodPressureSamples[0].exactTime);
  assert.equal(module.parseJSON(JSON.stringify(copy)),null);
 }
});
