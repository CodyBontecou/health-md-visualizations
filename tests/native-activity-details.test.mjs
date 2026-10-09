import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
let temporary,harness;
after(async()=>{if(temporary) await rm(temporary,{recursive:true,force:true});});
async function readers(){
 if(harness)return harness;
 temporary=await mkdtemp(path.join(os.tmpdir(),'healthmd-native-activity-'));
 const outfile=path.join(temporary,'readers.mjs');
 await build({stdin:{contents:['json','csv','markdown'].map(name=>`export * from './src/parsers/${name}-parser.ts';`).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
 return harness=await import(pathToFileURL(outfile).href);
}
const base='tests/fixtures/native-activity/android-v6-activity/2026-11-01';
test('all four native activity formats preserve exact interval records without daily aggregates',async()=>{
 const module=await readers(),native=module.parseJSON(await readFile(base+'.json','utf8'));
 assert.equal(native.nativeActivityDetails.length,2);
 for(const [suffix,parse] of [['.csv',module.parseCSV],['.md',module.parseMarkdown],['-bases.md',module.parseMarkdown]]){
  const result=parse(await readFile(base+suffix,'utf8')),day=Array.isArray(result)?result[0]:result;
  assert.ok(day,suffix);
  assert.deepEqual(day.nativeActivityDetails,native.nativeActivityDetails,suffix);
  assert.deepEqual(day.activity.stepSamples,native.activity.stepSamples,suffix);
  assert.deepEqual(day.activity.activityIntensity,native.activity.activityIntensity,suffix);
  assert.equal(day.canonicalMetrics?.steps,undefined);
  assert.equal(day.canonicalMetrics?.activity_intensity_minutes,undefined);
 }
});
test('native activity rejects missing interval ends, clock conflicts, fractional counts and foreign authority',async()=>{
 const module=await readers(),original=JSON.parse(await readFile(base+'.json','utf8'));
 for(const mutation of [value=>delete value.activity.stepSamples[0].exactEndTime,
   value=>value.activity.stepSamples[0].value=1.5,
   value=>value.activity.stepSamples[0].exactTime.nano++,
   value=>value.activity.activityIntensity[0].endTimeISO='2026-11-01T05:00:00Z',
   value=>value.activity.activityIntensity[0].intensity='',
   value=>value.activity.activityIntensity[0].duration=-1]){
  const copy=structuredClone(original);mutation(copy);assert.equal(module.parseJSON(JSON.stringify(copy)),null);
 }
 const foreign=structuredClone(original);foreign.schema_profile='apple-v11';foreign.schema_version=11;
 assert.equal(module.parseJSON(JSON.stringify(foreign)),null);
 const csv=await readFile(base+'.csv','utf8');
 assert.deepEqual(module.parseCSV(csv.replaceAll('steps_interval','unknown_interval')),[]);
 const md=await readFile(base+'.md','utf8');
 assert.equal(module.parseMarkdown(md.replaceAll('steps_interval','unknown_interval')),null);
});

test('activity fixtures retain their native producer hashes and explicit synthetic qualification',async()=>{
 const root='tests/fixtures/native-activity',manifest=JSON.parse(await readFile(root+'/provenance.json','utf8'));
 assert.match(manifest.producer_commit,/^[0-9a-f]{40}$/);
 assert.equal(manifest.synthetic,true);assert.equal(manifest.production_enabled,false);assert.equal(manifest.sdk_capture_qualified,false);
 for(const [file,digest] of Object.entries(manifest.sha256))assert.equal(createHash('sha256').update(await readFile(root+'/'+file)).digest('hex'),digest,file);
});
