import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

let temporary, module;
after(async()=>{if(temporary) await rm(temporary,{recursive:true,force:true});});
async function readers() {
 if(module)return module;
 temporary=await mkdtemp(path.join(os.tmpdir(),'healthmd-native-markdown-'));
 const outfile=path.join(temporary,'reader.mjs');
 await build({stdin:{contents:['json','csv','markdown'].map(name=>`export * from './src/parsers/${name}-parser.ts';`).join('\n'),
  resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile,logLevel:'silent'});
 return module=await import(pathToFileURL(outfile));
}
const escaped=value=>JSON.stringify(value).replace(/[|`<>&]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
function fullSleepTables(markdown, source) {
 for(const [heading,records,stage] of [['Sleep Stage Details',source.sleep.sleepStages,true],['Sleep Session Details',source.sleep.sleepSessions,false]]) {
  if(!records?.length)continue;
  const header=stage?'| Start (UTC) | End (UTC) | Stage | Native Record (JSON) |':'| Start (UTC) | End (UTC) | Native Record (JSON) |';
  const separator=stage?'|---|---|---|---|':'|---|---|---|';
  const rows=records.map(record=>`| ${record[stage?'startDate':'startTimeISO']} | ${record[stage?'endDate':'endTimeISO']} | ${stage?record.stage+' | ':''}\`${escaped(record)}\` |`);
  markdown=markdown.replace(new RegExp(`(## ${heading}\\n)(?:\\|[^\\n]*(?:\\n|$))+`),`$1${[header,separator,...rows].join('\n')}\n`);
 }
 return markdown;
}
function frontmatter(markdown,key,records) {
 const field=records.length?`${key}:\n${records.map(r=>'  - '+JSON.stringify(r)).join('\n')}`:`${key}: []`;
 return markdown.replace('\n---\n',`\n${field}\n---\n`);
}
const sleepRoots=['tests/fixtures/sleep-native-parents','tests/fixtures/sleep-native-apple/selected-stages'];

test('captured native sleep artifacts retain complete source records across all four formats',async()=>{
 const r=await readers(),root='tests/fixtures/native-sleep-complete';
 const manifest=JSON.parse(await readFile(`${root}/provenance.json`,'utf8'));
 const jsonFiles=Object.keys(manifest.files).filter(file=>file.endsWith('.json'));
 assert.equal(jsonFiles.length,6);
 for(const file of jsonFiles) {
  const source=JSON.parse(await readFile(`${root}/${file}`,'utf8'));
  for(const [suffix,parse] of [['.json',r.parseJSON],['.csv',r.parseCSV],['.md',r.parseMarkdown],['-bases.md',r.parseMarkdown]]) {
   const name=file.replace(/\.json$/,suffix),parsed=parse(await readFile(`${root}/${name}`,'utf8'));
   const day=Array.isArray(parsed)?parsed[0]:parsed;assert.ok(day,name);
   assert.deepEqual(day.sleep.sleepStages,source.sleep.sleepStages,name);
   assert.deepEqual(day.sleep.sleepSessions,source.sleep.sleepSessions,name);
  }
 }
});

test('complete sleep corpus preserves all 24 captured artifacts byte for byte',async()=>{
 const root='tests/fixtures/native-sleep-complete';
 const manifest=JSON.parse(await readFile(`${root}/provenance.json`,'utf8'));
 assert.equal(Object.keys(manifest.files).length,24);
 for(const [file,digest] of Object.entries(manifest.files)) {
  assert.equal(createHash('sha256').update(await readFile(`${root}/${file}`)).digest('hex'),digest,file);
 }
});

test('complete sleep Markdown rows preserve every emitted native stage and parent field',async()=>{
 const r=await readers();
 for(const root of sleepRoots) {
  const source=JSON.parse(await readFile(`${root}/2026-11-01.json`,'utf8'));
  source.sleep.sleepStages[0].metadata={synthetic:'quote "x" | ` <value> & end'};
  const markdown=fullSleepTables(await readFile(`${root}/2026-11-01.md`,'utf8'),source);
  const day=r.parseMarkdown(markdown);assert.ok(day,root);
  assert.deepEqual(day.sleep.sleepStages,source.sleep.sleepStages,root);
  assert.deepEqual(day.sleep.sleepSessions,source.sleep.sleepSessions,root);
 }
});

test('sleep frontmatter and full or legacy tables reconcile without hiding or duplicating source facts',async()=>{
 const r=await readers();
 for(const root of sleepRoots) {
  const source=JSON.parse(await readFile(`${root}/2026-11-01.json`,'utf8'));
  const plain=await readFile(`${root}/2026-11-01.md`,'utf8');
  for(const [key,field] of [['sleep_stage_details','sleepStages'],['sleep_session_details','sleepSessions']]) {
   const expected=source.sleep[field];if(!expected)continue;
   const full=fullSleepTables(plain,source);
   for(const md of [frontmatter(full,key,[]),frontmatter(full,key,expected),frontmatter(plain,key,expected)]) {
    assert.deepEqual(r.parseMarkdown(md)?.sleep?.[field],expected,`${root}/${key}`);
   }
   const conflict=structuredClone(expected);conflict[0].metadata={conflict:'must reject'};
   assert.equal(r.parseMarkdown(frontmatter(full,key,conflict)),null,`${root}/${key} metadata conflict`);
   const index=plain.indexOf('## '+(field==='sleepStages'?'Sleep Stage Details':'Sleep Session Details'));
   const changed=plain.slice(0,index)+plain.slice(index).replace(expected[0][field==='sleepStages'?'startDate':'startTimeISO'], '2026-11-01T02:00:00.123456790Z');
   assert.equal(r.parseMarkdown(frontmatter(changed,key,expected)),null,`${root}/${key} projected clock conflict`);
  }
  const full=fullSleepTables(plain,source),body=full.split('\n---\n')[1];
  assert.deepEqual(r.parseMarkdown(full+'\n'+body)?.sleep.sleepStages,source.sleep.sleepStages,'repeated complete table is a representation, not another observation');
 }
});

test('complete sleep rows reject contradictory display clocks, stage labels and platform identities',async()=>{
 const r=await readers();
 for(const root of sleepRoots) {
  const source=JSON.parse(await readFile(`${root}/2026-11-01.json`,'utf8'));
  const original=await readFile(`${root}/2026-11-01.md`,'utf8'),md=fullSleepTables(original,source);
  const stage=source.sleep.sleepStages[0];
  assert.equal(r.parseMarkdown(md.replace(`| ${stage.startDate} |`,`| 2026-11-01T02:00:00.123456790Z |`)),null);
  assert.equal(r.parseMarkdown(md.replace(`| ${stage.stage} | \``,`| invented | \``)),null);
  const foreign=structuredClone(source);foreign.sleep.sleepStages[0].stage=source.schema_profile==='apple-v11'?'light':'core';
  assert.equal(r.parseMarkdown(fullSleepTables(original,foreign)),null,'a native stage never acquires the other platform identity');
  const wrongHeader=md.replace('Stage | Native Record (JSON)','Stage | Native Record (JSON) | Native Record (JSON)');
  assert.equal(r.parseMarkdown(wrongHeader),null,'duplicate source column');
 }
});

test('strict native profiles reject the other platform stage identity in every format',async()=>{
 const r=await readers();
 for(const root of sleepRoots) {
  const source=JSON.parse(await readFile(`${root}/2026-11-01.json`,'utf8'));
  const original=source.sleep.sleepStages[0].stage;
  const foreign=source.schema_profile==='apple-v11'?'light':'core';
  source.sleep.sleepStages[0].stage=foreign;
  assert.equal(r.parseJSON(JSON.stringify(source)),null,root);
  for(const [suffix,parse] of [['.csv',r.parseCSV],['.md',r.parseMarkdown],['-bases.md',r.parseMarkdown]]) {
   const text=await readFile(`${root}/2026-11-01${suffix}`,'utf8');
   const changed=suffix==='.csv'?text.replace(`""stage"":""${original}""`,`""stage"":""${foreign}""`)
    :suffix==='-bases.md'?text.replace(`"stage":"${original}"`,`"stage":"${foreign}"`)
    :text.replace(`| ${original} |`,`| ${foreign} |`);
   assert.notEqual(changed,text,`${root}${suffix}: mutation must reach the native record`);
   const value=parse(changed);assert.ok(value===null||(Array.isArray(value)&&!value.length),`${root}${suffix}`);
  }
 }
});

const detailCases=[
 {file:'tests/fixtures/native-workouts/android-v6-workouts-METRIC-false/health/2026-11-01.md',field:'nativeWorkoutDetails',key:'native_workout_details'},
 {file:'tests/fixtures/native-activity/android-v6-activity/2026-11-01.md',field:'nativeActivityDetails',key:'native_activity_details'},
];
test('workout and activity source JSON cells accept literal code spans and preserve plain-cell compatibility',async()=>{
 const r=await readers();
 for(const c of detailCases) {
  const plain=await readFile(c.file,'utf8');
  const expected=r.parseMarkdown(plain)[c.field];assert.ok(expected.length,c.file);
  const wrapped=plain.replace(/\| (\{.+\}) \|/g,'| `$1` |');
  assert.deepEqual(r.parseMarkdown(wrapped)?.[c.field],expected,c.file);
 }
});

test('workout and activity frontmatter cannot shadow contradictory source tables',async()=>{
 const r=await readers();
 for(const c of detailCases) {
  const plain=await readFile(c.file,'utf8'),expected=r.parseMarkdown(plain)[c.field];
  for(const records of [[],expected])assert.deepEqual(r.parseMarkdown(frontmatter(plain,c.key,records))?.[c.field],expected,c.file);
  const bad=structuredClone(expected);bad[0].sample.metadata={conflict:'must reject'};
  assert.equal(r.parseMarkdown(frontmatter(plain,c.key,bad)),null,c.file);
 }
});
