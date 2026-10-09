import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
let temporary,harness;
after(async()=>{if(temporary)await rm(temporary,{recursive:true,force:true});});
async function readers(){
 if(harness)return harness;
 temporary=await mkdtemp(path.join(os.tmpdir(),'healthmd-native-clock-'));
 const outfile=path.join(temporary,'readers.mjs');
 await build({stdin:{contents:"export * from './src/native-source-clock.ts';\n"+['json','csv','markdown'].map(name=>`export * from './src/parsers/${name}-parser.ts';`).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
 return harness=await import(pathToFileURL(outfile).href);
}
test('exact source clocks retain nanoseconds, original offsets and offset-less source authority',async()=>{
 const {exactSourceClockAgrees:agree}=await readers();
 for(const [timestamp,clock] of [
  ['1969-12-31T23:59:59.999999999Z',{epochSecond:-1,nano:999999999,iso8601:'1969-12-31T23:59:59.999999999Z',offset:null}],
  ['2026-11-01T05:30:00.123456789Z',{epochSecond:1793511000,nano:123456789,iso8601:'2026-11-01T01:30:00.123456789-04:00',offset:'-04:00'}],
  ['2026-11-01T06:30:00.123456789Z',{epochSecond:1793514600,nano:123456789,iso8601:'2026-11-01T01:30:00.123456789-05:00',offset:'-05:00'}],
  ['2026-11-01T00:00:00Z',{epochSecond:1793491200,nano:0,iso8601:'2026-11-01T05:45+05:45',offset:'+05:45'}],
  ['2026-11-01T00:00:00Z',{epochSecond:1793491200,nano:0,iso8601:'2026-11-01T05:45:30+05:45:30',offset:'+05:45:30'}],
 ]){
  assert.equal(agree(timestamp,clock),true,clock.iso8601);
  assert.equal(agree(timestamp,{...clock,nano:clock.nano===999999999?999999998:clock.nano+1}),false);
 }
 const timestamp='2026-11-01T00:00:00Z',clock={epochSecond:1793491200,nano:0,iso8601:timestamp,offset:null};
 assert.equal(agree(timestamp,undefined),true,'missing exact clocks stay missing');
 for(const invalid of [{...clock,iso8601:'2026-02-30T00:00:00Z'},{...clock,offset:undefined},{...clock,offset:'+18:01'},{...clock,offset:'+00:60'},{...clock,offset:'+01:00'},{...clock,iso8601:'2026-11-01T00:00:00.000000001Z'}])assert.equal(agree(timestamp,invalid),false);
});
test('all machine readers reject contradictory exact sleep parent/stage and quantity clocks',async()=>{
 const module=await readers();
 const original=JSON.parse(await readFile('tests/fixtures/sleep-native-parents/2026-11-01.json','utf8'));
 for(const field of ['exactStartTime','exactEndTime']){
  for(const section of ['sleepStages','sleepSessions']){
   const copy=structuredClone(original);copy.sleep[section][0][field].nano++;
   assert.equal(module.parseJSON(JSON.stringify(copy)),null,section+' '+field);
  }
 }
 const qty=JSON.parse(await readFile('tests/fixtures/native-quantity-details/android-v6-quantities/2026-11-01.json','utf8'));
 qty.heart.heartRateSamples[0].exactTime.iso8601='2026-11-01T01:30:00.123456788Z';
 assert.equal(module.parseJSON(JSON.stringify(qty)),null);
 const csv=await readFile('tests/fixtures/sleep-native-parents/2026-11-01.csv','utf8');
 assert.deepEqual(module.parseCSV(csv.replace('""nano"":123456789','""nano"":123456788')),[]);
 const bases=await readFile('tests/fixtures/sleep-native-parents/2026-11-01-bases.md','utf8');
 assert.equal(module.parseMarkdown(bases.replace('"nano":123456789','"nano":123456788')),null);
});
