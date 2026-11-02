import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,cp,mkdir,rm,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {stored,fixture,packs,temp,words} from './helpers.mjs';
import {Director} from '../src/director.mjs';
import {ProjectStore,atomicJSON} from '../src/project/store.mjs';
import {projectSchema} from '../src/project/schema.mjs';
import {validateProject,compileProject} from '../src/compiler.mjs';
const outputRequest={requestId:'choose-output',expectedRevision:0,commands:[{type:'output.set',value:{locale:'ja-JP',aspect:'portrait',sceneId:'button-vs-blind',branchId:'check-line'}}]};
test('Doctor works before npm install and names the missing packages (A16)',async t=>{
  const dir=await temp(t);await cp('src',join(dir,'src'),{recursive:true});await cp('bin',join(dir,'bin'),{recursive:true});
  const r=spawnSync(process.execPath,[join(dir,'bin/river.mjs'),'doctor','--json'],{encoding:'utf8'});assert.equal(r.status,1);const report=JSON.parse(r.stdout);assert.equal(report.ok,false);assert.equal(report.checks.find(c=>c.name==='playwright-package').ok,false);assert.equal(report.checks.find(c=>c.name==='project-lock-package').ok,false);assert.match(report.checks.find(c=>c.name==='playwright-package').action,/npm ci/);
});
test('Public init distinguishes the input filename from the scene identity',async t=>{
  const dir=await temp(t),sceneFile=join(dir,'new-scene.json'),directory=join(dir,'new-project'),scene=fixture().lesson.scenes[0];await writeFile(sceneFile,JSON.stringify(scene));
  const r=spawnSync(process.execPath,['bin/river.mjs','init','--scene',sceneFile,'--project',directory,'--locale','en-US','--aspect','portrait'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);const p=await new ProjectStore(directory).read();assert.equal(p.output.sceneId,scene.id);assert.equal(p.output.locale,'en-US');assert.equal(p.output.aspect,'portrait');
  assert.ok((await stat(join(directory,'evidence'))).isDirectory());
});
test('New and portable projects provide writable evidence folders, including older sources',async t=>{
  const store=await stored(t),before=await readFile(store.path),evidence='A reproducible strategy derivation.';
  await writeFile(join(store.directory,'evidence','model.md'),evidence);
  const destination=join(await temp(t),'portable'),d=await Director.open(store.directory);await d.export({destination});
  assert.ok((await stat(join(destination,'assets'))).isDirectory());
  assert.equal(await readFile(join(destination,'evidence','model.md'),'utf8'),evidence);assert.deepEqual(await readFile(join(destination,'project.json')),before);
  await rm(join(store.directory,'evidence'),{recursive:true});
  const legacyDestination=join(await temp(t),'older-project-copy');await d.export({destination:legacyDestination});
  assert.ok((await stat(join(legacyDestination,'assets'))).isDirectory());
  await writeFile(join(legacyDestination,'evidence','new-model.md'),evidence);
  assert.deepEqual(await readFile(join(legacyDestination,'project.json')),before);assert.deepEqual(await readFile(store.path),before);
});
test('Observe, seek and exported RenderPlan share explicit BB amounts',async t=>{
  const store=await stored(t,{sceneId:'side-pots'}),d=await Director.open(store.directory),plan=await d.export({kind:'plan'}),frame=plan.frames.at(-1);
  const observation=await d.seek({frameId:frame.id});assert.equal(plan.version,2);assert.deepEqual(frame.state,observation.state);assert.equal(frame.state.unit,'BB');assert.deepEqual(frame.state.seats.map(s=>s.stack),[120,60,40]);
});
test('Output, revision and receipts survive save, move and reopen (A01/R01)',async t=>{
  const store=await stored(t),d=await Director.open(store.directory);await d.apply(outputRequest);
  const destination=join(await temp(t),'移交 project');await d.export({destination});const reopened=await Director.open(destination),before=await d.export(),after=await reopened.export();assert.deepEqual(after,before);assert.equal((await reopened.observe()).output.locale,'ja-JP');
});
test('Identical retry after reopening returns the original receipt (A10)',async t=>{
  const store=await stored(t),d=await Director.open(store.directory),first=await d.apply(outputRequest),reopen=await Director.open(store.directory);
  assert.deepEqual(await reopen.apply(outputRequest),first);assert.equal((await store.read()).revision,1);
  await assert.rejects(()=>reopen.apply({...outputRequest,commands:[{type:'output.set',value:{locale:'en-US'}}]}),e=>e.code==='REQUEST_CONFLICT');
});
test('Atomic batch rejects a later invalid edit without changing earlier values',async t=>{
  const store=await stored(t),before=await readFile(store.path),d=await Director.open(store.directory);
  await assert.rejects(()=>d.apply({...outputRequest,commands:[...outputRequest.commands,{type:'scene.put',value:{}}]}));assert.deepEqual(await readFile(store.path),before);
});
test('All load and edit entry points reject duplicate identities (R04/R10)',async t=>{
  const store=await stored(t),p=await store.read();p.lesson.scenes.push(structuredClone(p.lesson.scenes[0]));
  assert.throws(()=>projectSchema(p),e=>e.code==='ID_DUPLICATE');await writeFile(store.path,JSON.stringify(p));await assert.rejects(()=>Director.open(store.directory),e=>e.code==='ID_DUPLICATE');
  const other=await stored(t),d=await Director.open(other.directory),s=(await other.read()).lesson.scenes[0];
  s.branches=['a','b'].map(id=>({id,from:s.beats[0].id,label:words(id),beats:[{id:'shared',label:words(id)}]}));
  await assert.rejects(()=>d.apply({requestId:'duplicate',expectedRevision:0,commands:[{type:'scene.put',value:s}]}),e=>e.code==='ID_DUPLICATE');assert.equal((await other.read()).revision,0);
});
test('Missing selected-branch narration audio is correctly reported (R03)',async()=>{
  const p=fixture();p.lesson.scenes[0].branches.push({id:'new',from:'flop',label:words('new'),beats:[{id:'new-note',label:words('note'),narration:words('New explanation')}]});
  const result=await validateProject(p,packs,{output:{branchId:'new'}});assert.equal(result.ready,false);assert.ok(result.results[0].issues.some(i=>i.path.includes('new-note/audio')));
});
test('Other route issues do not prevent selecting a valid branch (A05)',async t=>{
  const store=await stored(t),p=await store.read();p.lesson.scenes[0].beats[3].actions=[{seat:'ghost',type:'check'}];await atomicJSON(store.path,p);
  const d=await Director.open(store.directory);await d.apply(outputRequest);assert.ok((await d.observe()).state);const all=await validateProject(await store.read(),packs,{all:true});assert.ok(all.results.some(x=>x.issues.some(i=>i.code==='OUT_OF_TURN')));
});
test('Unknown options, missing arguments, methods, fields and units fail early (A08)',async t=>{
  const store=await stored(t);
  for(const args of [['inspect','--project',store.directory,'--loclae','en-US'],['inspect','--project'],['unknown']]){
    const r=spawnSync(process.execPath,['bin/river.mjs',...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(JSON.parse(r.stdout).ok,false);
  }
  const d=await Director.open(store.directory);await assert.rejects(()=>d.dispatch({method:'unknown'}),e=>e.code==='METHOD');
  await assert.rejects(()=>d.apply({...outputRequest,commands:[{type:'output.set',value:{width:1920}}]}),e=>e.code==='UNKNOWN_FIELD');
  const s=(await store.read()).lesson.scenes[0];s.start.seats[0].stack='100 BB';await assert.rejects(()=>d.apply({...outputRequest,commands:[{type:'scene.put',value:s}]}),e=>e.code==='SCHEMA');
  assert.equal((await store.read()).revision,0);
});
test('Build fails on an explicit corrupt lesson without overwriting it (A09)',async t=>{
  const dir=await temp(t),file=join(dir,'lesson.json'),bytes='{"version":1,"scenes":[';await writeFile(file,bytes);
  const r=spawnSync(process.execPath,['scripts/build.mjs','--lesson',file],{encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(await readFile(file,'utf8'),bytes);
});
test('Concurrent writers never both commit the same revision',async t=>{
  const store=await stored(t),a=await Director.open(store.directory),b=await Director.open(store.directory);
  const results=await Promise.allSettled([a.apply(outputRequest),b.apply({...outputRequest,requestId:'second'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.read()).revision,1);
});
test('Receipt retention is bounded and expired requests cannot replay',async t=>{
  const store=await stored(t),d=await Director.open(store.directory);
  for(let i=0;i<130;i++)await d.apply({requestId:'r'+i,expectedRevision:i,commands:[{type:'output.set',value:{captions:!!(i%2)}}]});
  assert.equal((await store.read()).receipts.length,128);
  await assert.rejects(()=>d.apply({requestId:'r0',expectedRevision:0,commands:[{type:'output.set',value:{captions:false}}]}),e=>e.code==='RETRY_WINDOW_EXPIRED');
});
for(const phase of ['beforeRename','afterRename'])test(`Real SIGKILL ${phase}: reopen and retry commits exactly once (A10)`,async t=>{
  const store=await stored(t),child=spawnSync(process.execPath,['tests/fixtures/crash-writer.mjs',store.directory,phase],{encoding:'utf8'});assert.equal(child.signal,'SIGKILL');
  assert.equal((await store.read()).revision,phase==='afterRename'?1:0);
  // mkdir-lock timestamp probing can round into the next second on coarse filesystems.
  await sleep(12000);const d=await Director.open(store.directory),req={requestId:'crash-request',expectedRevision:0,commands:[{type:'output.set',value:{locale:'ja-JP',aspect:'portrait'}}]};
  const receipt=await d.apply(req);assert.equal(receipt.revision,1);assert.deepEqual(await d.apply(req),receipt);assert.equal((await store.read()).revision,1);
});
