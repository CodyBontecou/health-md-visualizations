import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
let temporary,harness;
after(async()=>{if(temporary) await rm(temporary,{recursive:true,force:true});});
async function readers(){
 if(harness)return harness;
 temporary=await mkdtemp(path.join(os.tmpdir(),'healthmd-native-workouts-'));
 const outfile=path.join(temporary,'readers.mjs');
 await build({stdin:{contents:['json','csv','markdown'].map(name=>`export * from './src/parsers/${name}-parser.ts';`).join('\n')+"\nexport {workoutDistanceMeters} from './src/workout-utils.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
 return harness=await import(pathToFileURL(outfile).href);
}
const root='tests/fixtures/native-workouts';
async function bases(){
 const result=[];
 for(const variant of await readdir(root,{withFileTypes:true})) if(variant.isDirectory()) {
  const folder=variant.name.startsWith('apple')?'Health':'health';
  const filename=(await readdir(path.join(root,variant.name,folder))).find(name=>name.endsWith('.json'));
  result.push(path.join(root,variant.name,folder,filename.slice(0,-5)));
 }
 return result;
}
test('all four actual native workout formats preserve complete source records and exact quantities',async()=>{
 const module=await readers();
 for(const base of await bases()){
  const original=JSON.parse(await readFile(base+'.json','utf8'));
  const native=module.parseJSON(JSON.stringify(original));
  assert.ok(native,base+'.json');
  assert.equal(native.nativeWorkoutDetails.length,original.workouts.length,base);
  if(!base.includes('-sdk')) {
   assert.equal(native.workouts[0].duration,1800.5);
   assert.equal(native.workouts[0].avgHeartRate,160.125);
   assert.equal(native.workouts[0].avgRunningCadence,178.625);
  }
  const expected=original.workouts.map(sample=>({...sample,...(typeof sample.distance==='number'?{distanceMeters:sample.distance}:{})}));
  assert.deepEqual(native.nativeWorkoutDetails.map(record=>record.sample),original.workouts,base);
  assert.deepEqual(native.workouts,expected,base);
  if(original.workouts[0].distance!==undefined) assert.equal(module.workoutDistanceMeters(native.workouts[0]),original.workouts[0].distance);
  for(const [suffix,parse] of [['.csv',module.parseCSV],['.md',module.parseMarkdown],['-bases.md',module.parseMarkdown]]){
   const result=parse(await readFile(base+suffix,'utf8')),day=Array.isArray(result)?result[0]:result;
   assert.ok(day,base+suffix);
   assert.deepEqual(day.nativeWorkoutDetails,native.nativeWorkoutDetails,base+suffix);
   if(suffix!=='.md' || !base.includes('-sdk')) {
    assert.equal(day.canonicalMetrics?.workout_count,original.workouts.length,base+suffix);
    const minutes=original.workouts.reduce((sum,workout)=>sum+workout.duration,0)/60;
    assert.ok(Math.abs(day.canonicalMetrics.workout_minutes-minutes)<1e-9,base+suffix);
   }
   assert.deepEqual(day.workouts,expected,base+suffix);
   if(original.workouts[0].distance!==undefined) assert.equal(module.workoutDistanceMeters(day.workouts[0]),original.workouts[0].distance,base+suffix);
  }
 }
});
test('successor workout readers reject inconsistent exact clocks and elapsed duration without changing active duration',async()=>{
 const module=await readers();
 for(const base of await bases()){
  const original=JSON.parse(await readFile(base+'.json','utf8'));
  assert.ok(module.parseJSON(JSON.stringify(original)));
  for(const mutate of [
   value=>value.workouts[0].elapsedDuration+=1,
   value=>value.workouts[0].startTimeISO='2026-03-15T00:00:00',
   value=>value.workouts[0].duration=-1,
   value=>value.workouts[0].type='',
  ]){
   const value=structuredClone(original);mutate(value);
   assert.equal(module.parseJSON(JSON.stringify(value)),null,base);
  }
  const inconsistent=structuredClone(original);
  inconsistent.workouts[0].elapsedDuration += original.schema_profile==='apple-v11' ? 1e-8 : 1e-9;
  assert.equal(module.parseJSON(JSON.stringify(inconsistent)),null,base+' elapsed precision');
  if(original.schema_profile==='android-sleep-v6'){
   const value=structuredClone(original);value.workouts[0].exactStartTime.nano+=1;
   assert.equal(module.parseJSON(JSON.stringify(value)),null,base);
  }
 }
});
test('workout consumer fixtures are the byte-pinned actual native artifacts',async()=>{
 const manifest=JSON.parse(await readFile(root+'/provenance.json','utf8'));
 assert.equal(Object.keys(manifest.files).length,44);
 for(const [file,digest] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex'),digest,file);
});
