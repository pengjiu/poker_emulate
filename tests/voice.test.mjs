import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,chmod,readdir,rm,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import {stored,temp} from './helpers.mjs';
import {Director} from '../src/director.mjs';
import {voiceProfile} from '../src/project/schema.mjs';
import {compileProject} from '../src/compiler.mjs';
import {hash} from '../src/util.mjs';
import {serve} from '../src/server.mjs';
import {spawn,execFile} from 'node:child_process';
import {once} from 'node:events';
import {connectDirector} from '../src/connect.mjs';
import {voiceEngineStatus,readVoicePreset} from '../src/media/voice.mjs';
import {promisify} from 'node:util';
import presetCatalog from '../src/media/voice-presets.json' with {type:'json'};

async function controlledEngine(t,{presets=false}={}){
  const home=join(await temp(t),'engine'),checkpoint=join(home,'checkpoints');
  for(const name of ['config.yaml','gpt.pth','codec.pth','s2mel.pth','hf_cache/w2v-bert-2.0/model.safetensors','hf_cache/w2v-bert-2.0/config.json','hf_cache/w2v-bert-2.0/preprocessor_config.json','hf_cache/campplus_cn_common.bin','hf_cache/bigvgan/config.json','hf_cache/bigvgan/bigvgan_generator.pt']){const p=join(checkpoint,name);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,'fixture');}
  await mkdir(join(home,'examples'));await writeFile(join(home,'examples/voice_04.wav'),await readFile(resolve('examples/legacy/assets/audio/zh-CN.wav')));await writeFile(join(home,'.river-install.json'),'{}');
  if(presets)for(const preset of presetCatalog.presets)await copyFile(resolve('tests/fixtures/index-tts-references',preset.file.split('/').pop()),join(home,preset.file));
  const executable=resolve('tests/fixtures/voice-engine.mjs');await chmod(executable,0o755);
  const keys=['RIVER_INDEXTTS_HOME','RIVER_INDEXTTS_PYTHON','RIVER_TEST_VOICE_COUNTER','RIVER_TEST_VOICE_DELAY','RIVER_TEST_VOICE_MODE'],before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  t.after(()=>{for(const key of keys)if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];});
  process.env.RIVER_INDEXTTS_HOME=home;process.env.RIVER_INDEXTTS_PYTHON=executable;process.env.RIVER_TEST_VOICE_COUNTER=join(home,'calls.ndjson');delete process.env.RIVER_TEST_VOICE_MODE;process.env.RIVER_TEST_VOICE_DELAY='100';
  return {home,counter:process.env.RIVER_TEST_VOICE_COUNTER};
}
const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Voice progress was not observed');};

test('Voice generation has atomic project commits, portable references and exact retry semantics',async t=>{
  const engine=await controlledEngine(t),store=await stored(t,{locale:'zh-CN'}),d=await Director.open(store.directory);
  const edit=async commands=>d.apply({requestId:crypto.randomUUID(),expectedRevision:(await store.read()).revision,commands});
  await edit([{type:'narration.set',beatId:'decision',locale:'zh-CN',text:'这里我拿KK，面对all-in，先看他能用什么牌推。'},{type:'voice.set',value:{locale:'zh-CN',speed:1.1,pronunciations:{KK:'口袋K','all-in':'all in'}}}]);
  const before=await store.read(),params={action:'generate',requestId:'voice-1',expectedRevision:before.revision};
  assert.equal((await d.voice({action:'status'})).available,true);
  const result=await d.voice(params),project=await store.read(),beat=project.lesson.scenes[0].beats.find(b=>b.id==='decision');
  assert.equal(project.revision,before.revision+1);assert.equal(beat.audio['zh-CN'].voiceHash,hash(voiceProfile(project,'zh-CN')));
  assert.equal(compileProject(project,d.packs).issues.length,0);assert.equal((await d.voice({action:'status'})).job.status,'complete');
  const calls=(await readFile(engine.counter,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(calls.length,1);assert.equal(calls[0].lang,'ZH');assert.match(calls[0].clips[0].spokenText,/口袋K.*all in/);assert.match(beat.narration['zh-CN'],/KK.*all-in/);
  assert.deepEqual(await d.voice(params),result);assert.equal((await readFile(engine.counter,'utf8')).trim().split('\n').length,1);
  await assert.rejects(d.voice({...params,force:true}),e=>e.code==='REQUEST_CONFLICT');
  const dest=join(await temp(t),'portable');await store.copyTo(dest);const reopened=await Director.open(dest);assert.equal((await reopened.store.read()).voice['zh-CN'].referenceAssetId,project.voice['zh-CN'].referenceAssetId);
  const originalHash=compileProject(await store.read(),d.packs).projectHash;
  await edit([{type:'voice.set',value:{locale:'zh-CN',speed:1.2}}]);const stale=compileProject(await store.read(),d.packs);assert.ok(stale.issues.some(i=>i.code==='AUDIO_STALE'));assert.notEqual(stale.projectHash,originalHash);
  await edit([{type:'audio.attach',beatId:'decision',value:{locale:'zh-CN',source:{path:resolve('examples/legacy/assets/audio/zh-CN.wav')}}}]);await edit([{type:'voice.set',value:{locale:'zh-CN',speed:1}}]);assert.equal(compileProject(await store.read(),d.packs).issues.length,0);
  await d.voice({action:'generate',requestId:'repair-source',expectedRevision:(await store.read()).revision,force:true});
  const audio=(await store.read()).lesson.scenes[0].beats.find(b=>b.id==='decision').audio['zh-CN'],asset=(await store.read()).assets[audio.assetId],file=join(store.directory,asset.path);
  await rm(file);await d.voice({action:'generate',requestId:'repair-missing',expectedRevision:(await store.read()).revision});assert.equal(hash(await readFile(file)),audio.assetId);
  await writeFile(file,'corrupted');await d.voice({action:'generate',requestId:'repair-corrupt',expectedRevision:(await store.read()).revision});assert.equal(hash(await readFile(file)),audio.assetId);
});

test('Failed, cancelled and superseded voice work never replaces the saved lesson',async t=>{
  await controlledEngine(t);const store=await stored(t,{locale:'en-US'}),d=await Director.open(store.directory),initial=await store.read();
  await t.test('Engine failure preserves manifest and saves a bounded diagnostic',async()=>{
    process.env.RIVER_TEST_VOICE_MODE='fail';await assert.rejects(d.voice({action:'generate',requestId:'failed',expectedRevision:initial.revision}),e=>e.code==='VOICE_FAILED');assert.deepEqual(await store.read(),initial);assert.equal((await d.voice({action:'status'})).job.error.code,'VOICE_FAILED');assert.ok((await readdir(join(store.directory,'evidence/voice'))).some(n=>n.endsWith('.log')));delete process.env.RIVER_TEST_VOICE_MODE;
  });
  await t.test('Cancellation kills the worker and leaves the manifest unchanged',async()=>{
    process.env.RIVER_TEST_VOICE_DELAY='1000';const pending=d.voice({action:'generate',requestId:'cancelled',expectedRevision:initial.revision});await waitFor(()=>d.speech.job?.phase==='synthesizing'&&d.speech.job?.status==='running');assert.equal((await d.voice({action:'cancel'})).cancelled,true);await assert.rejects(pending,e=>e.code==='VOICE_CANCELLED');assert.deepEqual(await store.read(),initial);
  });
  await t.test('Accepted cancellation at the final commit boundary preserves the manifest',async()=>{
    process.env.RIVER_TEST_VOICE_DELAY='20';let entered,resume;const reached=new Promise(r=>{entered=r;}),gate=new Promise(r=>{resume=r;});d.store.faults.beforeRename=async()=>{entered();await gate;};
    const pending=d.voice({action:'generate',requestId:'cancel-at-commit',expectedRevision:initial.revision});await reached;assert.equal((await d.voice({action:'cancel'})).cancelled,true);resume();await assert.rejects(pending,e=>e.code==='VOICE_CANCELLED');assert.deepEqual(await store.read(),initial);delete d.store.faults.beforeRename;
  });
  await t.test('Concurrent engine jobs are rejected and stale completion cannot overwrite an edit',async()=>{
    process.env.RIVER_TEST_VOICE_DELAY='400';const pending=d.voice({action:'generate',requestId:'superseded',expectedRevision:initial.revision});await waitFor(()=>d.speech.job?.phase==='synthesizing'&&d.speech.job?.status==='running');
    const other=await Director.open(store.directory);await assert.rejects(other.voice({action:'generate',requestId:'parallel',expectedRevision:initial.revision}),e=>e.code==='VOICE_BUSY');
    await d.apply({requestId:'new-script',expectedRevision:initial.revision,commands:[{type:'narration.set',beatId:'decision',text:'The new script must be preserved.'}]});const edited=await store.read();await assert.rejects(pending,e=>e.code==='REVISION_CONFLICT');assert.deepEqual(await store.read(),edited);
  });
});

test('Voice cancel reports completion once the manifest has been committed',async t=>{
  await controlledEngine(t);const store=await stored(t,{locale:'en-US'}),d=await Director.open(store.directory);let entered,resume;const reached=new Promise(r=>{entered=r;}),gate=new Promise(r=>{resume=r;});
  d.store.faults.afterRename=async()=>{entered();await gate;};const pending=d.voice({action:'generate',requestId:'past-commit',expectedRevision:0});await reached;
  assert.equal((await d.voice({action:'cancel'})).cancelled,false);assert.equal((await store.read()).revision,1);resume();await pending;assert.equal(d.speech.job.status,'complete');
});

test('An unexpectedly terminated voice worker retains its exit signal without changing the project',async t=>{
  await controlledEngine(t);process.env.RIVER_TEST_VOICE_MODE='signal';const store=await stored(t,{locale:'zh-CN'}),d=await Director.open(store.directory),before=await store.read();
  await assert.rejects(d.voice({action:'generate',requestId:'unexpected-signal',expectedRevision:before.revision}),e=>e.code==='VOICE_FAILED'&&e.detail?.process?.signal==='SIGKILL'&&e.detail.process.exitCode===null);
  assert.deepEqual(await store.read(),before);
  const files=await readdir(join(store.directory,'evidence/voice')),file=files.find(f=>f.startsWith('failed-')&&f.endsWith('.json'));assert.ok(file);
  const diagnostic=JSON.parse(await readFile(join(store.directory,'evidence/voice',file),'utf8'));assert.equal(diagnostic.error.process.signal,'SIGKILL');
});

test('A completed voice receipt remains replayable during an unrelated active generation',async t=>{
  await controlledEngine(t);const store=await stored(t,{locale:'en-US'}),d=await Director.open(store.directory),params={action:'generate',requestId:'completed-A',expectedRevision:0};
  const original=await d.voice(params);process.env.RIVER_TEST_VOICE_DELAY='400';const pending=d.voice({action:'generate',requestId:'active-B',expectedRevision:1,force:true});await waitFor(()=>d.speech.job?.phase==='synthesizing');
  assert.deepEqual(await d.voice(params),original);assert.equal(d.speech.job.status,'running');assert.ok(d.speech.abort);await pending;assert.equal((await store.read()).revision,2);
});

test('Beat delivery overrides inherit the speaker and regenerate only the affected narration',async t=>{
  const engine=await controlledEngine(t),store=await stored(t,{locale:'en-US'}),d=await Director.open(store.directory),scene=(await store.read()).lesson.scenes[0];
  scene.beats.push({id:'second-thought',label:{'en-US':'Next thought'},narration:{'en-US':'Think about the range on the next street.'}});
  await d.apply({requestId:'two-thoughts',expectedRevision:0,commands:[{type:'scene.put',value:scene},{type:'voice.set',value:{locale:'en-US',pronunciations:{range:'RANGE'}}}]});
  await d.voice({action:'generate',requestId:'both-voices',expectedRevision:1});const initial=await store.read(),s=structuredClone(initial.lesson.scenes[0]),first=s.beats.find(b=>b.id==='decision');first.delivery={'en-US':{speed:.85,emotionStrength:.4,pronunciations:{button:'BUTTON'}}};
  await d.apply({requestId:'one-delivery',expectedRevision:2,commands:[{type:'scene.put',value:s}]});const changed=await store.read(),issues=compileProject(changed,d.packs).issues;
  assert.deepEqual(issues.map(i=>i.path),['beats/decision/audio/en-US']);assert.equal(changed.voice['en-US'].speed,1);
  await d.voice({action:'generate',requestId:'one-new-voice',expectedRevision:3});const calls=(await readFile(engine.counter,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(calls[0].clips.length,2);assert.equal(calls[1].clips.length,1);assert.equal(calls[1].clips[0].settings.speed,.85);assert.equal(calls[1].clips[0].settings.pronunciations.range,'RANGE');assert.equal(calls[1].clips[0].settings.pronunciations.button,'BUTTON');
  const final=await store.read();assert.equal(final.voice['en-US'].referenceAssetId,initial.voice['en-US'].referenceAssetId);assert.deepEqual(final.lesson.scenes[0].beats.find(b=>b.id==='second-thought').audio,initial.lesson.scenes[0].beats.find(b=>b.id==='second-thought').audio);assert.equal(compileProject(final,d.packs).issues.length,0);
});

test('Replacing a missing audio asset with different generated bytes still exports a portable project',async t=>{
  await controlledEngine(t);const store=await stored(t,{locale:'en-US'}),d=await Director.open(store.directory);
  await d.apply({requestId:'old-voice',expectedRevision:0,commands:[{type:'audio.attach',beatId:'decision',value:{locale:'en-US',source:{path:resolve('examples/legacy/assets/audio/en-US.wav')}}}]});
  const before=await store.read(),old=before.lesson.scenes[0].beats.find(b=>b.id==='decision').audio['en-US'].assetId;await rm(join(store.directory,before.assets[old].path));
  await d.voice({action:'generate',requestId:'different-bytes-repair',expectedRevision:1});const project=await store.read();assert.equal(project.assets[old],undefined);
  const dest=join(await temp(t),'portable');await store.copyTo(dest);const exported=await Director.open(dest);assert.deepEqual(await exported.store.read(),project);
});

test('Transient access errors do not discard valid unused library assets',async t=>{
  if(process.platform==='win32'||process.getuid?.()===0){t.skip('Requires POSIX file permission enforcement for the current user.');return;}
  const store=await stored(t,{locale:'en-US'}),d=await Director.open(store.directory);
  await d.apply({requestId:'library-1',expectedRevision:0,commands:[{type:'audio.attach',beatId:'decision',value:{locale:'en-US',source:{path:resolve('examples/legacy/assets/audio/en-US.wav')}}}]});
  const p=await store.read(),old=p.lesson.scenes[0].beats.find(b=>b.id==='decision').audio['en-US'].assetId,file=join(store.directory,p.assets[old].path);
  await d.apply({requestId:'library-2',expectedRevision:1,commands:[{type:'audio.attach',beatId:'decision',value:{locale:'en-US',source:{path:resolve('examples/legacy/assets/audio/ja-JP.wav')}}}]});
  await chmod(file,0);try{await assert.rejects(readFile(file),e=>e.code==='EACCES');await d.apply({requestId:'unrelated-edit',expectedRevision:2,commands:[{type:'output.set',value:{captions:true}}]});assert.ok((await store.read()).assets[old]);}finally{await chmod(file,0o644);}
  assert.equal(hash(await readFile(file)),old);
});

test('A single NDJSON session handles cancel while its voice generation is pending',async t=>{
  await controlledEngine(t);const store=await stored(t,{locale:'zh-CN'}),child=spawn(process.execPath,['bin/river.mjs','session','--project',store.directory],{env:{...process.env},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
  child.stdin.end(JSON.stringify({method:'voice',params:{action:'generate',requestId:'session-cancel',expectedRevision:0}})+'\n'+JSON.stringify({method:'voice',params:{action:'cancel'}})+'\n');
  const [code]=await once(child,'close'),rows=stdout.trim().split('\n').map(JSON.parse);assert.equal(code,1,stderr);assert.equal(rows.length,2);assert.ok(rows.some(r=>r.ok&&r.value.cancelled===true));assert.ok(rows.some(r=>!r.ok&&r.error.code==='VOICE_CANCELLED'));assert.equal((await store.read()).revision,0);
});

test('Shared-runtime voice transport preserves settings errors and accepts fractional timeouts',async t=>{
  await controlledEngine(t);const store=await stored(t,{locale:'en-US'}),server=await serve(store.directory,{port:0});t.after(()=>server.close());const d=await connectDirector(store.directory);
  await assert.rejects(d.dispatch({method:'voice',params:{action:'generate',requestId:'invalid-timeout',expectedRevision:0,timeoutSeconds:'bad'}}),e=>e.code==='VOICE_SETTINGS');
  const result=await d.dispatch({method:'voice',params:{action:'generate',requestId:'fractional-timeout',expectedRevision:0,timeoutSeconds:10.00001}});assert.equal(result.revision,1);
});

test('Real director UI generates, previews and configures voice through the public RPC',async t=>{
  await controlledEngine(t);process.env.RIVER_TEST_VOICE_DELAY='800';const store=await stored(t,{locale:'zh-CN'}),server=await serve(store.directory,{port:0}),browser=await chromium.launch({headless:true});t.after(async()=>{await browser.close();await server.close();});
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.url);await page.waitForSelector('#voice-status');
  await page.locator('[data-frame="decision"]').click();await page.waitForSelector('[data-frame="decision"].active');await page.locator('#narration').fill('这手先别急着all-in。看清楚他的范围，再决定要不要继续。');
  await page.locator('.voice-settings').locator('summary').first().click();await page.selectOption('#voice-style','engaged');await page.locator('#voice-speed').fill('1.1');await page.locator('[data-ui="voice-generate"]').click();
  await page.waitForSelector('[data-ui="voice-cancel"]');await page.waitForSelector('.voice-preview');await page.waitForFunction(()=>document.querySelector('#voice-status').textContent.includes('完成'));
  const p=await store.read();assert.equal(p.voice['zh-CN'].speed,1.1);assert.match(p.lesson.scenes[0].beats.find(b=>b.id==='decision').narration['zh-CN'],/all-in/);assert.ok(await page.locator('audio.voice-preview').count());
  await page.locator('.voice-settings').locator('summary').first().click();await page.locator('#voice-speed').fill('.85');await page.locator('#voice-local').check();assert.equal(Number(await page.locator('#voice-speed').inputValue()),.85);await page.locator('[data-ui="voice-generate"]').click();await page.waitForSelector('[data-ui="voice-cancel"]');await page.waitForFunction(()=>document.querySelector('#voice-status').textContent.includes('完成'));
  const local=await store.read();assert.equal(local.voice['zh-CN'].speed,1.1);assert.equal(local.lesson.scenes[0].beats.find(b=>b.id==='decision').delivery['zh-CN'].speed,.85);
  const clean=await browser.newPage();await clean.goto(server.url+'/?view=client');await clean.waitForSelector('.client');assert.equal(await clean.locator('.voice-settings,.voice-actions,.inspector').count(),0);await clean.close();assert.deepEqual(errors,[]);
});

test('A programme batches shared beats once and freezes independent beat speakers in one worker',async t=>{
  const engine=await controlledEngine(t),store=await stored(t,{locale:'zh-CN'}),d=await Director.open(store.directory),p=await store.read(),a=p.lesson.scenes[0],b=structuredClone(a);b.id='second-hand';
  a.branches=[];b.branches=[];a.beats=a.beats.filter(x=>x.id==='decision');b.beats=b.beats.filter(x=>x.id==='decision');a.beats[0].speaker='questioner';b.beats[0].speaker='analyst';
  await d.apply({requestId:'two-speakers',expectedRevision:0,commands:[{type:'scene.put',value:a},{type:'scene.put',value:b},{type:'voice.set',sceneId:b.id,beatId:'decision',value:{locale:'zh-CN',reference:{path:resolve('examples/legacy/assets/audio/ja-JP.wav')},speed:.95}},{type:'output.set',value:{sequence:[{id:'q',sceneId:a.id},{id:'a',sceneId:b.id},{id:'replay',sceneId:a.id}]}}]});
  const before=await store.read(),localRef=before.lesson.scenes.find(s=>s.id===b.id).beats[0].delivery['zh-CN'].referenceAssetId;
  await d.voice({action:'generate',requestId:'programme',expectedRevision:1});const calls=(await readFile(engine.counter,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.length,1);assert.equal(calls[0].clips.length,2);assert.notEqual(calls[0].clips[0].reference,calls[0].clips[1].reference);assert.notEqual(calls[0].clips[0].referenceHash,calls[0].clips[1].referenceHash);
  const final=await store.read();assert.equal(final.lesson.scenes.find(s=>s.id===b.id).beats[0].delivery['zh-CN'].referenceAssetId,localRef);assert.equal(compileProject(final,d.packs).issues.length,0);
  await assert.rejects(d.voice({action:'generate',requestId:'ambiguous-selection',expectedRevision:2,beatIds:['decision']}),e=>e.code==='VOICE_SETTINGS');
  await d.apply({requestId:'brief-only',expectedRevision:2,commands:[{type:'direction.set',value:{patternId:'dialogue'}}]});assert.equal(compileProject(await store.read(),d.packs).issues.length,0);
});

test('Explicit null selects main-line speech even when the current scene displays a branch',async t=>{
  await controlledEngine(t);const store=await stored(t,{locale:'zh-CN'}),d=await Director.open(store.directory),sceneId=(await store.read()).output.sceneId;
  await d.apply({requestId:'main-speech',expectedRevision:0,commands:[{type:'narration.set',sceneId,beatId:'bet',text:'这是主线下注的解释。'},{type:'output.set',value:{branchId:'check-line'}}]});
  await d.voice({action:'generate',requestId:'explicit-main',expectedRevision:1,sceneId,branchId:null,beatIds:['bet']});
  const p=await store.read();assert.ok(p.lesson.scenes[0].beats.find(b=>b.id==='bet').audio['zh-CN']);assert.equal(p.output.branchId,'check-line');
});

test('Official reference presets report availability and require three distinct pinned samples',async t=>{
  const engine=await controlledEngine(t),uninstalled=await voiceEngineStatus();
  assert.deepEqual(uninstalled.presets.map(p=>p.id),['official-01','official-04','official-06']);
  assert.equal(new Set(uninstalled.presets.map(p=>p.sha256)).size,3);assert.ok(uninstalled.presets.every(p=>/^[a-f0-9]{64}$/.test(p.sha256)&&!p.available));
  for(const preset of presetCatalog.presets){
    const bytes=await readFile(resolve('tests/fixtures/index-tts-references',preset.file.split('/').pop()));assert.equal(hash(bytes),preset.sha256);
    await copyFile(resolve('tests/fixtures/index-tts-references',preset.file.split('/').pop()),join(engine.home,preset.file));
  }
  const installed=await voiceEngineStatus();assert.ok(installed.available);assert.ok(installed.presets.every(p=>p.available&&p.previewUrl==='/api/voice-reference/'+p.id));
  assert.ok(installed.presets.every(p=>p.source.revision==='b01840e8e4fd9753743a6d0466cd73ae1d634a68'));
  await assert.rejects(readVoicePreset('../checkpoints/config.yaml'),e=>e.code==='VOICE_PRESET_UNKNOWN');
  await writeFile(join(engine.home,'examples/voice_01.wav'),'wrong source');await assert.rejects(readVoicePreset('official-01'),e=>e.code==='VOICE_PRESET_CHANGED');
  await rm(join(engine.home,'examples/voice_06.wav'));await assert.rejects(readVoicePreset('official-06'),e=>e.code==='VOICE_PRESET_MISSING');
  const partial=await voiceEngineStatus();assert.equal(partial.available,true);assert.deepEqual(partial.presets.filter(p=>p.available).map(p=>p.id),['official-04']);
});

test('Public preset edits import portable references, replay exactly and invalidate generated bindings',async t=>{
  const engine=await controlledEngine(t,{presets:true}),store=await stored(t,{locale:'zh-CN'}),d=await Director.open(store.directory);
  const edit={requestId:'preset-01',expectedRevision:0,commands:[{type:'voice.set',value:{locale:'zh-CN',presetId:'official-01',speed:1.1}}]},receipt=await d.apply(edit),first=await store.read();
  const reference=presetCatalog.presets[0].sha256;assert.equal(first.voice['zh-CN'].referenceAssetId,reference);assert.equal(first.voice['zh-CN'].speed,1.1);assert.equal(first.voice['zh-CN'].presetId,undefined);
  assert.equal(hash(await readFile(join(store.directory,first.assets[reference].path))),reference);
  await rm(join(engine.home,'examples/voice_01.wav'));assert.deepEqual(await d.apply(edit),receipt);
  await assert.rejects(d.apply({...edit,requestId:'missing-preset',expectedRevision:1}),e=>e.code==='VOICE_PRESET_MISSING');assert.deepEqual(await store.read(),first);
  await d.voice({action:'generate',requestId:'speak-01',expectedRevision:1});
  let current=await store.read(),beat=current.lesson.scenes[0].beats.find(b=>b.id==='decision'),text=beat.narration['zh-CN'],duration=current.assets[beat.audio['zh-CN'].assetId].duration,oldAudio=beat.audio['zh-CN'].assetId;
  await d.apply({requestId:'bind-01',expectedRevision:current.revision,commands:[{type:'timing.set',beatId:'decision',value:{locale:'zh-CN',timing:{actions:[],narration:0}}},{type:'captions.set',beatId:'decision',value:{locale:'zh-CN',cues:[{start:0,end:duration,text}]}},{type:'presentation.set',beatId:'decision',value:{surface:'table',focus:['hero']}},{type:'presentation.cues',beatId:'decision',value:{locale:'zh-CN',cues:[{at:0,focus:['hero']}]}}]});
  current=await store.read();assert.equal(compileProject(current,d.packs).issues.length,0);
  await d.apply({requestId:'preset-04',expectedRevision:current.revision,commands:[{type:'voice.set',value:{locale:'zh-CN',presetId:'official-04'}}]});
  assert.ok(compileProject(await store.read(),d.packs).issues.some(i=>i.code==='AUDIO_STALE'));
  await d.voice({action:'generate',requestId:'speak-04',expectedRevision:(await store.read()).revision});current=await store.read();beat=current.lesson.scenes[0].beats.find(b=>b.id==='decision');
  assert.notEqual(beat.audio['zh-CN'].assetId,oldAudio);
  const issues=compileProject(current,d.packs).issues.map(i=>i.code);for(const code of ['TIMING_STALE','CAPTION_STALE','PRESENTATION_STALE'])assert.ok(issues.includes(code),code);assert.ok(!issues.includes('AUDIO_STALE'));
  const calls=(await readFile(engine.counter,'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(calls.map(c=>c.clips[0].referenceHash),[reference,presetCatalog.presets[1].sha256]);
  for(const value of [{presetId:'unknown'},{presetId:null},{presetId:'official-04',reference:null},{presetId:'official-04',reference:{path:resolve('examples/legacy/assets/audio/en-US.wav')}}]){
    const before=await store.read();await assert.rejects(d.apply({requestId:crypto.randomUUID(),expectedRevision:before.revision,commands:[{type:'voice.set',value:{locale:'zh-CN',...value}}]}),e=>['VOICE_PRESET_UNKNOWN','VOICE_SETTINGS'].includes(e.code));assert.deepEqual(await store.read(),before);
  }
  const destination=join(await temp(t),'portable');await d.export({destination});await rm(engine.home,{recursive:true,force:true});const reopened=await Director.open(destination);assert.equal((await reopened.store.read()).voice['zh-CN'].referenceAssetId,presetCatalog.presets[1].sha256);
});

test('Reference-only installation verifies pinned samples without model, Python or normalizer setup',async t=>{
  const directory=await temp(t),execute=promisify(execFile),script=`
import importlib.util, io, json, sys
from pathlib import Path
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('river_setup', 'scripts/setup-index-tts.py')
setup=importlib.util.module_from_spec(spec); spec.loader.exec_module(setup)
home=Path(sys.argv[1]); fixtures=Path('tests/fixtures/index-tts-references')
home.mkdir(); record=home/'.river-install.json'; record.write_text(json.dumps({'files':[{'file':'keep-model'}],'upstreamCommit':'keep-commit'}))
requests=[]
def fetch(url, timeout):
    assert setup.REFERENCES['revision'] in url
    requests.append(url)
    return io.BytesIO((fixtures/url.split('/')[-1]).read_bytes())
def forbidden(*args, **kwargs): raise AssertionError('Reference-only installation must not load or download models')
setup.urllib.request.urlopen=fetch; setup.install_models=forbidden; setup.warm_normalizer=forbidden; setup.subprocess.run=forbidden
sys.argv=['setup-index-tts.py','--home',str(home),'--references-only']; setup.main(); setup.main()
result=json.loads(record.read_text()); assert len(requests)==3; assert result['files']==[{'file':'keep-model'}]; assert result['upstreamCommit']=='keep-commit'
assert len(set(row['sha256'] for row in result['references']))==3
missing=home/'examples/voice_01.wav'; missing.unlink()
setup.urllib.request.urlopen=lambda *args, **kwargs:io.BytesIO(b'not the pinned sample')
try: setup.main()
except RuntimeError: pass
else: raise AssertionError('A mismatched reference must be rejected')
assert not missing.exists(); assert json.loads(record.read_text())==result
print(json.dumps({'downloads':len(requests),'references':len(result['references'])}))
`;
  const {stdout}=await execute('python3',['-c',script,join(directory,'engine')]);assert.deepEqual(JSON.parse(stdout.trim().split('\n').at(-1)),{downloads:3,references:3});
});

async function studioAPI(server,store){
  const {token}=JSON.parse(await readFile(join(store.directory,'.runtime.json'),'utf8'));
  return async(path,body)=>{const response=await fetch(server.url+path,{method:'POST',headers:{'Content-Type':'application/json','x-river-token':token},body:JSON.stringify(body)});return {status:response.status,...await response.json()};};
}
async function completedStudioJob(server){
  for(let i=0;i<120;i++){const snapshot=await(await fetch(server.url+'/api/snapshot')).json();if(snapshot.job&&snapshot.job.status!=='running')return snapshot;await new Promise(r=>setTimeout(r,30));}
  throw Error('Studio export did not finish');
}

test('Studio export serializes native voice generation, preserves beat speakers and stops on cancel or failure',async t=>{
  const engine=await controlledEngine(t,{presets:true}),store=await stored(t,{locale:'zh-CN'}),renders=[],server=await serve(store.directory,{port:0,render:async directory=>{assert.equal(server.director.speech.job.status,'complete');renders.push(await store.read());return {fingerprint:'c'.repeat(64),directory};}});t.after(()=>server.close());const post=await studioAPI(server,store),d=server.director;
  await d.apply({requestId:'independent-speaker',expectedRevision:0,commands:[{type:'narration.set',beatId:'bet',text:'这段使用默认声线。'},{type:'voice.set',beatId:'decision',value:{locale:'zh-CN',presetId:'official-06'}}]});
  const initial=await store.read(),local=initial.lesson.scenes[0].beats.find(b=>b.id==='decision').delivery['zh-CN'].referenceAssetId;
  process.env.RIVER_TEST_VOICE_DELAY='400';const results=await Promise.all([post('/api/render',{voicePresetId:'official-04',expectedRevision:initial.revision}),post('/api/render',{voicePresetId:'official-04',expectedRevision:initial.revision})]);assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);
  let snapshot=await completedStudioJob(server);assert.equal(snapshot.job.status,'complete');assert.equal(renders.length,1);assert.equal(renders[0].voice['zh-CN'].referenceAssetId,presetCatalog.presets[1].sha256);assert.equal(renders[0].lesson.scenes[0].beats.find(b=>b.id==='decision').delivery['zh-CN'].referenceAssetId,local);
  let calls=(await readFile(engine.counter,'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(new Set(calls[0].clips.map(c=>c.referenceHash)),new Set([local,presetCatalog.presets[1].sha256]));
  const revision=(await store.read()).revision;assert.equal((await post('/api/render',{})).status,202);snapshot=await completedStudioJob(server);assert.equal(snapshot.job.status,'complete');assert.equal(renders.length,2);assert.equal((await store.read()).revision,revision);assert.equal((await readFile(engine.counter,'utf8')).trim().split('\n').length,1);
  for(const cancel of ['voice','export']){
    const before=await store.read(),audio=before.lesson.scenes[0].beats.map(b=>b.audio);assert.equal((await post('/api/render',{voicePresetId:'official-01',expectedRevision:before.revision})).status,202);
    await waitFor(()=>d.speech.job?.status==='running'&&d.speech.job?.phase==='synthesizing');
    if(cancel==='voice')assert.equal((await d.voice({action:'cancel'})).cancelled,true);else await post('/api/cancel',{});
    snapshot=await completedStudioJob(server);assert.equal(snapshot.job.error.code,'VOICE_CANCELLED');assert.equal(renders.length,2);assert.deepEqual((await store.read()).lesson.scenes[0].beats.map(b=>b.audio),audio);
  }
  process.env.RIVER_TEST_VOICE_MODE='fail';assert.equal((await post('/api/render',{voicePresetId:'official-04',expectedRevision:(await store.read()).revision})).status,202);snapshot=await completedStudioJob(server);assert.equal(snapshot.job.error.code,'VOICE_FAILED');assert.equal(renders.length,2);delete process.env.RIVER_TEST_VOICE_MODE;
  const before=await store.read();assert.equal((await post('/api/render',{voicePresetId:'not-listed',expectedRevision:before.revision})).error.code,'VOICE_PRESET_UNKNOWN');assert.deepEqual(await store.read(),before);
  assert.equal((await post('/api/render',{voicePresetId:'official-04',expectedRevision:0})).status,202);snapshot=await completedStudioJob(server);assert.equal(snapshot.job.error.code,'REVISION_CONFLICT');assert.equal(renders.length,2);assert.deepEqual(await store.read(),before);
});

test('Reference preview serves only intact whitelisted samples with native audio range requests',async t=>{
  const engine=await controlledEngine(t,{presets:true}),store=await stored(t),server=await serve(store.directory,{port:0});t.after(()=>server.close());
  for(const preset of presetCatalog.presets){const response=await fetch(server.url+'/api/voice-reference/'+preset.id);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'audio/wav');assert.equal(hash(Buffer.from(await response.arrayBuffer())),preset.sha256);}
  const range=await fetch(server.url+'/api/voice-reference/official-01',{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
  const head=await fetch(server.url+'/api/voice-reference/official-01',{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('Content-Length')),(await readFile(resolve('tests/fixtures/index-tts-references/voice_01.wav'))).length);
  const unknown=await fetch(server.url+'/api/voice-reference/config.yaml');assert.equal(unknown.status,400);assert.equal((await unknown.json()).error.code,'VOICE_PRESET_UNKNOWN');
  const traversal=await fetch(server.url+'/api/voice-reference/..%2F..%2Fcheckpoints%2Fconfig.yaml');assert.equal(traversal.status,400);assert.equal((await traversal.json()).error.code,'VOICE_PRESET_UNKNOWN');
  await writeFile(join(engine.home,'examples/voice_01.wav'),'tampered');const changed=await fetch(server.url+'/api/voice-reference/official-01');assert.equal(changed.status,400);assert.equal((await changed.json()).error.code,'VOICE_PRESET_CHANGED');
});

test('Browser preset choices reach the native worker and export selection regenerates before rendering',async t=>{
  const engine=await controlledEngine(t,{presets:true}),store=await stored(t,{locale:'zh-CN'}),renders=[],server=await serve(store.directory,{port:0,render:async directory=>{renders.push(await store.read());return {fingerprint:'d'.repeat(64),directory};}}),browser=await chromium.launch({headless:true});t.after(async()=>{await browser.close();await server.close();});
  await server.director.apply({requestId:'default-narration',expectedRevision:0,commands:[{type:'narration.set',beatId:'bet',text:'这一段继承默认参考声线。'}]});process.env.RIVER_TEST_VOICE_DELAY='800';
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(server.url);await page.waitForSelector('#voice-status');await page.locator('[data-frame="decision"]').click();await page.waitForSelector('[data-frame="decision"].active');
  await page.locator('.voice-settings').locator('summary').first().click();await page.selectOption('#voice-preset','official-01');assert.equal(await page.locator('#voice-reference-preview audio').getAttribute('src'),'/api/voice-reference/official-01');
  await page.locator('[data-ui="voice-generate"]').click();await page.waitForSelector('[data-ui="voice-cancel"]');await page.waitForFunction(()=>document.querySelector('#voice-status').textContent.includes('完成'));assert.equal((await store.read()).voice['zh-CN'].referenceAssetId,presetCatalog.presets[0].sha256);
  await page.locator('.voice-settings').locator('summary').first().click();await page.locator('#voice-local').check();await page.selectOption('#voice-preset','official-01');const localRevision=(await store.read()).revision;await page.locator('[data-ui="voice-save"]').click();await page.waitForFunction(revision=>document.querySelector('.stage-top')?.textContent.includes('r'+(revision+1)),localRevision);assert.equal((await store.read()).lesson.scenes[0].beats.find(b=>b.id==='decision').delivery['zh-CN'].referenceAssetId,presetCatalog.presets[0].sha256);
  await page.locator('.voice-settings').locator('summary').first().click();await page.selectOption('#voice-preset','official-06');await page.locator('[data-ui="voice-generate"]').click();await page.waitForSelector('[data-ui="voice-cancel"]');await page.waitForFunction(()=>document.querySelector('#voice-status').textContent.includes('完成'));
  await page.selectOption('#export-voice','official-04');assert.equal(await page.locator('[data-ui="render"]').isEnabled(),true);await page.locator('[data-ui="render"]').click();await page.waitForSelector('[data-ui="voice-cancel"]');assert.equal(await page.locator('[data-ui="render"]').isDisabled(),true);await page.waitForFunction(()=>document.querySelector('#job-status a')?.textContent.includes('完成'));
  assert.equal(renders.length,1);assert.equal(renders[0].voice['zh-CN'].referenceAssetId,presetCatalog.presets[1].sha256);assert.equal(renders[0].lesson.scenes[0].beats.find(b=>b.id==='decision').delivery['zh-CN'].referenceAssetId,presetCatalog.presets[2].sha256);
  let calls=(await readFile(engine.counter,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(calls.length,3);assert.equal(calls[0].clips[0].referenceHash,presetCatalog.presets[0].sha256);assert.equal(calls[1].clips[0].referenceHash,presetCatalog.presets[2].sha256);assert.deepEqual(new Set(calls[2].clips.map(c=>c.referenceHash)),new Set([presetCatalog.presets[1].sha256,presetCatalog.presets[2].sha256]));
  await page.selectOption('#export-voice','');await page.locator('[data-ui="render"]').click();await page.waitForFunction(()=>document.querySelector('#job-status a')?.textContent.includes('完成'));assert.equal(renders.length,2);assert.equal((await readFile(engine.counter,'utf8')).trim().split('\n').length,3);
  process.env.RIVER_TEST_VOICE_DELAY='3000';await page.selectOption('#export-voice','official-01');await page.locator('[data-ui="render"]').click();await waitFor(()=>server.director.speech.job?.status==='running'&&server.director.speech.job?.phase==='synthesizing');await page.waitForSelector('[data-ui="voice-cancel"]');await page.locator('[data-ui="voice-cancel"]').click();const cancelled=await completedStudioJob(server);assert.equal(cancelled.job.error.code,'VOICE_CANCELLED');assert.equal(renders.length,2);assert.deepEqual(errors,[]);
});
