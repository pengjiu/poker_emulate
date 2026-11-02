import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {stored,temp,fixture,packs,words} from './helpers.mjs';
import {Director} from '../src/director.mjs';
import {createProject,atomicJSON} from '../src/project/store.mjs';
import {validateProject,compileProject} from '../src/compiler.mjs';
import {renderVideo} from '../src/media/render.mjs';
import {importAudio} from '../src/media/audio.mjs';
import {migrateLegacy} from '../src/project/migrate.mjs';
import {localePacks} from '../src/locales.mjs';
import {hash} from '../src/util.mjs';
const exec=promisify(execFile),voice=resolve('examples/legacy/assets/audio/en-US.wav');
async function smallProject(t){const dir=await temp(t),p=fixture({sceneId:'side-pots',locale:'en-US'});p.lesson.scenes=p.lesson.scenes.filter(s=>s.id==='side-pots');p.lesson.scenes[0].beats.forEach(b=>b.hold=.12);return createProject(join(dir,'project'),p);}
test('Browser data URL and CLI path import the same measured asset (A02)',async t=>{
  const store=await stored(t),d=await Director.open(store.directory),bytes=await readFile(voice);
  await d.apply({requestId:'audio-data',expectedRevision:0,commands:[{type:'audio.attach',beatId:'decision',value:{locale:'en-US',source:{data:'data:audio/wav;base64,'+bytes.toString('base64')}}}]});
  await d.apply({requestId:'audio-file',expectedRevision:1,commands:[{type:'audio.attach',beatId:'decision',value:{locale:'en-US',source:{path:voice}}}]});
  const p=await store.read();assert.equal(Object.keys(p.assets).length,1);assert.ok(Object.values(p.assets)[0].duration>8);
  const moved=join(await temp(t),'移交 assets');await d.export({destination:moved});const report=await validateProject(p,packs,{directory:moved,output:{locale:'en-US'},media:true});assert.equal(report.ready,true);
});
test('MP3 import is decoded; corrupt file and missing file fail before changes',async t=>{
  const store=await stored(t),dir=await temp(t),mp3=join(dir,'voice.mp3');await exec('ffmpeg',['-y','-v','error','-i',voice,mp3]);const imported=await importAudio(store.directory,{path:mp3});assert.ok(imported.asset.duration>8);
  const d=await Director.open(store.directory),before=await readFile(store.path);const request=path=>({requestId:path,expectedRevision:0,commands:[{type:'audio.attach',beatId:'decision',value:{locale:'en-US',source:{path}}}]});
  await assert.rejects(()=>d.apply(request(join(dir,'missing.wav'))),e=>e.code==='ASSET_MISSING');await writeFile(join(dir,'bad.wav'),'not audio');await assert.rejects(()=>d.apply(request(join(dir,'bad.wav'))),e=>e.code==='AUDIO_INVALID');assert.deepEqual(await readFile(store.path),before);
});
test('One-language narration edit invalidates only its own audio (A11)',async t=>{
  const dir=await temp(t),store=await migrateLegacy('examples/legacy/lesson.json',join(dir,'migrated')),d=await Director.open(store.directory),before=await store.read();
  await d.apply({requestId:'rewrite-ja',expectedRevision:0,commands:[{type:'narration.set',beatId:'decision',locale:'ja-JP',text:'新しい解説です。'}]});
  const after=await store.read(),a=after.lesson.scenes[0].beats.find(b=>b.id==='decision').audio,b=before.lesson.scenes[0].beats.find(b=>b.id==='decision').audio;
  assert.equal(a['ja-JP'],undefined);assert.deepEqual(a['en-US'],b['en-US']);assert.deepEqual(a['zh-CN'],b['zh-CN']);
  for(const locale of ['zh-CN','en-US'])assert.equal((await validateProject(after,packs,{directory:store.directory,output:{locale},media:true})).ready,true);
});
test('Audio time determines integer frame plan and cannot clip the tail',async t=>{
  const dir=await temp(t),store=await migrateLegacy('examples/legacy/lesson.json',join(dir,'project'));
  const durations=[];for(const locale of Object.keys(packs)){
    const p=compileProject(await store.read(),packs,{output:{locale,profile:'final'}}),f=p.frames.find(f=>f.audio);assert.ok(f.duration>=f.audio.duration+.35-1e-8);assert.equal(f.startFrame/p.fps,f.start);durations.push(f.duration);
  }assert.equal(new Set(durations).size,3);
});
test('Additional language is a dictionary addition, without rule changes',async t=>{
  const dir=await temp(t);for(const [name,pack]of Object.entries(packs))await writeFile(join(dir,name+'.json'),JSON.stringify(pack));await writeFile(join(dir,'en-XA.json'),JSON.stringify({...packs['en-US'],locale:'en-XA'}));
  const expanded=await localePacks(dir),p=fixture({locale:'en-XA'});for(const s of p.lesson.scenes){s.title['en-XA']=s.title['en-US'];for(const b of [...s.beats,...(s.branches??[]).flatMap(b=>b.beats)]){b.label['en-XA']=b.label['en-US'];if(b.narration)b.narration['en-XA']=b.narration['en-US'];}for(const b of s.branches??[])b.label['en-XA']=b.label['en-US'];}
  assert.equal(compileProject(p,expanded).locale,'en-XA');
});
test('Real render is atomically published, decodable and reused on exact retry (A13)',async t=>{
  const store=await smallProject(t),out=join(await temp(t),'results'),first=await renderVideo(store.directory,{out}),second=await renderVideo(store.directory,{out});
  assert.equal(first.cached,false);assert.equal(second.cached,true);assert.equal(first.videoSha256,second.videoSha256);assert.equal(first.fingerprint,second.fingerprint);assert.equal((await readdir(out)).filter(x=>!x.startsWith('.')).length,1);
  assert.ok(first.validation.metrics.capturedFrames>0);assert.ok(first.validation.metrics.reusedFrames>0);assert.equal(first.validation.metrics.capturedFrames+first.validation.metrics.reusedFrames,first.frames);
});
test('Concurrent render is rejected while a real job holds the singleton lock (A12)',async t=>{
  const store=await smallProject(t),out=join(await temp(t),'results');let reached,continueJob;const paused=new Promise(r=>reached=r),continuePromise=new Promise(r=>continueJob=r);
  const first=renderVideo(store.directory,{out,hooks:{onPhase:async phase=>{if(phase==='frames'){reached();await continuePromise;}}}});await paused;
  try{await assert.rejects(()=>renderVideo(store.directory,{out}),e=>e.code==='RENDER_BUSY');}finally{continueJob();}await first;
});
test('Cancellation kills a live frame render and cleans staging within five seconds',async t=>{
  const store=await smallProject(t),out=join(await temp(t),'results'),controller=new AbortController();let cancelledAt,pids=[];
  await assert.rejects(()=>renderVideo(store.directory,{out,signal:controller.signal,onProgress:p=>{if(p.frame===0){
    const rows=spawnSync('ps',['-axo','pid=,ppid='],{encoding:'utf8'}).stdout.trim().split('\n').map(x=>x.trim().split(/\s+/).map(Number)),ids=new Set([process.pid]);let more=true;while(more){more=false;for(const [pid,ppid]of rows)if(ids.has(ppid)&&!ids.has(pid)){ids.add(pid);more=true;}}pids=[...ids].filter(pid=>pid!==process.pid);cancelledAt=Date.now();controller.abort();
  }}}),e=>e.code==='CANCELLED');
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  while(pids.some(alive)&&Date.now()-cancelledAt<4500)await new Promise(r=>setTimeout(r,50));
  assert.ok(pids.length>=2);assert.deepEqual(pids.filter(alive),[]);assert.ok(Date.now()-cancelledAt<5000);assert.ok(!(await readdir(out)).some(x=>x.startsWith('.stage-')));assert.equal((await readdir(join(out,'failures'))).length,1);
});
test('A killed FFmpeg produces failure, never a published success',async t=>{
  const store=await smallProject(t),out=join(await temp(t),'results');let children;
  await assert.rejects(()=>renderVideo(store.directory,{out,hooks:{onPhase:async(_phase,context)=>children=context.children},onProgress:p=>{if(p.frame===0)for(const child of children)child.kill('SIGKILL');}}));
  assert.deepEqual((await readdir(out)).filter(x=>!x.startsWith('.')),['failures']);
});
test('Publication write failure preserves a prior success (A12)',async t=>{
  const store=await smallProject(t),out=join(await temp(t),'results'),first=await renderVideo(store.directory,{out}),original=await readFile(join(first.directory,'video.mp4'));
  await assert.rejects(()=>renderVideo(store.directory,{out,output:{aspect:'portrait'},hooks:{beforePublish:()=>{const e=new Error('Injected write failure');e.code='ENOSPC';throw e;}}}));
  assert.equal(hash(await readFile(join(first.directory,'video.mp4'))),hash(original));assert.ok(!(await readdir(out)).some(x=>x.startsWith('.stage-')));
});
