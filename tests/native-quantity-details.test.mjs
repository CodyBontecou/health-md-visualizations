import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
let temporary;
let harness;
after(async()=>{if(temporary) await rm(temporary,{recursive:true,force:true});});
async function readers(){
 if(harness) return harness;
 temporary=await mkdtemp(path.join(os.tmpdir(),'healthmd-native-quantity-'));
 const outfile=path.join(temporary,'readers.mjs');
 await build({stdin:{contents:['json','csv','markdown'].map(name=>`export * from './src/parsers/${name}-parser.ts';`).join('\n')+"\nexport {renderHeartTerrain} from './src/visualizations/heart-terrain.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
 harness=await import(pathToFileURL(outfile).href);
 return harness;
}
const variants=[['apple-v11-quantities','2026-03-15',5],['apple-v11-heart-only','2026-03-15',1],['android-v6-quantities','2026-11-01',5],['android-v6-heart-only','2026-11-01',1]];
const base=(variant,date)=>path.join(process.cwd(),'tests/fixtures/native-quantity-details',variant,date);
test('native quantity artifacts retain immutable producer byte provenance',async()=>{
 const provenance=JSON.parse(await readFile('tests/fixtures/native-quantity-details/provenance.json','utf8'));
 assert.match(provenance.producer_commit,/^[0-9a-f]{40}$/);
 for(const [name,digest] of Object.entries(provenance.sha256)) assert.equal(createHash('sha256').update(await readFile(path.join('tests/fixtures/native-quantity-details',name))).digest('hex'),digest,name);
});
test('quantity-only captures survive all four readers without fabricated summaries',async()=>{
 const module=await readers();
 for(const [variant,date,count] of variants){
  const json=await readFile(base(variant,date)+'.json','utf8');
  const native=module.parseJSON(json);
  assert.ok(native,variant);
  assert.equal(native.nativeQuantityDetails.length,count,variant);
  assert.equal(native.heart.averageHeartRate,undefined,variant);
  for(const [suffix,parse] of [['.csv',module.parseCSV],['.md',module.parseMarkdown],['-bases.md',module.parseMarkdown]]){
   const result=parse(await readFile(base(variant,date)+suffix,'utf8'));
   const day=Array.isArray(result)?result[0]:result;
   assert.ok(day,variant+suffix);
   assert.equal(day.nativeQuantityDetails.length,count,variant+suffix);
   assert.equal(day.heart.averageHeartRate,undefined,variant+suffix);
   assert.equal(day.heart.heartRateMin,undefined,variant+suffix);
   assert.equal(day.heart.heartRateMax,undefined,variant+suffix);
   if(suffix!=='.md') assert.deepEqual(day.nativeQuantityDetails,native.nativeQuantityDetails,variant+suffix);
   else assert.deepEqual(day.nativeQuantityDetails.map(({metric,unit,sample})=>[metric,unit,sample.timestamp,sample.value]),native.nativeQuantityDetails.map(({metric,unit,sample})=>[metric,unit,sample.timestamp,sample.value]),variant+suffix);
   assert.equal(day.heart.heartRateSamples[0].value,72.125,variant+suffix);
  }
 }
});
test('quantity readers reject incompatible units, cross-platform HRV, clocks and CSV siblings',async()=>{
 const module=await readers();
 const root=JSON.parse(await readFile(base('android-v6-quantities','2026-11-01')+'.json','utf8'));
 const mismatch=structuredClone(root);mismatch.heart.heartRateSamples[0].exactTime.nano++;
 assert.equal(module.parseJSON(JSON.stringify(mismatch)),null);
 const csv=await readFile(base('apple-v11-quantities','2026-03-15')+'.csv','utf8');
 assert.deepEqual(module.parseCSV(csv.replace('""unit"":""bpm""','""unit"":""ms""')),[]);
 assert.deepEqual(module.parseCSV(csv.replace('hrv_sdnn','hrv_rmssd')),[]);
 assert.deepEqual(module.parseCSV(csv.replace('json,2026-03-15T01:00:00.125000000Z','json,2026-03-15T01:00:00Z')),[]);
 const md=await readFile(base('apple-v11-quantities','2026-03-15')+'.md','utf8');
 assert.equal(module.parseMarkdown(md.replace('HRV SDNN Sample Details','HRV RMSSD Sample Details')),null);
 assert.equal(module.parseMarkdown(md.replace('2026-03-15T01:00:00.125000000Z','2026-02-30T01:00:00.125000000Z')),null);
 const bases=await readFile(base('apple-v11-quantities','2026-03-15')+'-bases.md','utf8');
 assert.equal(module.parseMarkdown(bases.replace('"unit":"ratio_0_1"','"unit":"percent"')),null);
 const invalidRatio=structuredClone(root);invalidRatio.vitals.bloodOxygenSamples[0].value=1.005;
 assert.equal(module.parseJSON(JSON.stringify(invalidRatio)),null);
 const low=structuredClone(root);low.vitals.bloodOxygenSamples[0].value=0.005;
 assert.equal(module.parseJSON(JSON.stringify(low)).vitals.bloodOxygenSamples[0].value,0.5);
});

test('sample-only heart terrain uses recorded samples without adding daily summaries',async()=>{
 const module=await readers();
 const day=module.parseJSON(await readFile(base('android-v6-heart-only','2026-11-01')+'.json','utf8'));
 const before=JSON.stringify(day);
 function element(text=''){
  return {text,children:[],style:{},classList:{add(){},remove(){}},empty(){this.children=[];},
   createDiv(options){const child=element(options.text);this.children.push(child);return child;},
   createEl(_tag,options){const child=element(options.text);this.children.push(child);return child;}};
 }
 const stats=element(),hits=[];
 module.renderHeartTerrain({fillRect(){}},[day],400,200,{}, {isDark:false},stats,{add(value){hits.push(value);}});
 assert.equal(hits.length,1);
 assert.ok(hits[0].details.some(value=>value.label==='Avg' && value.value==='72 bpm'));
 assert.equal(JSON.stringify(day),before);
 const text=JSON.stringify(stats);
 assert.ok(!text.includes('999') && !text.includes('NaN') && !text.includes('undefined'));
});
