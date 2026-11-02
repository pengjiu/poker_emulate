import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {temp,fixture,words,packs} from './helpers.mjs';
import {createProject,ProjectStore} from '../src/project/store.mjs';
import {importAudio} from '../src/media/audio.mjs';
import {renderVideo} from '../src/media/render.mjs';
import {hash} from '../src/util.mjs';
import {compileProject} from '../src/compiler.mjs';
const exec=promisify(execFile);
test('Each route, locale, card, audio and aspect change produces a distinct real export (A13)',async t=>{
  const dir=await temp(t),p=fixture({sceneId:'side-pots',locale:'en-US'}),scene=p.lesson.scenes.find(s=>s.id==='side-pots');p.lesson.scenes=[scene];scene.beats=[{id:'tone',label:words('Test signal'),narration:words('Test signal'),hold:.1}];
  const base=await createProject(join(dir,'base'),p),tones=[];
  for(const hz of [440,660]){const path=join(dir,hz+'.wav');await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i',`sine=frequency=${hz}:duration=0.2`,path]);tones.push(await importAudio(base.directory,{path}));}
  await base.update(async project=>{for(const a of tones)project.assets[a.assetId]=a.asset;project.lesson.scenes[0].beats[0].audio=Object.fromEntries(Object.keys(packs).map(locale=>[locale,{assetId:tones[0].assetId,locale,textHash:hash('Test signal')}]));return {project};});
  const fingerprints=new Set(),contentHashes=new Set();
  for(const variant of ['base','route','locale','card','audio','aspect']){
    const destination=join(dir,variant+'-copy');await base.copyTo(destination);const store=new ProjectStore(destination);
    await store.update(async project=>{const s=project.lesson.scenes[0];
      if(variant==='route'){s.branches=[{id:'alt',from:'tone',label:words('Alternative'),beats:[{id:'next',label:words('Next'),hold:.1}]}];project.output.branchId='alt';}
      if(variant==='locale')project.output.locale='ja-JP';if(variant==='aspect')project.output.aspect='portrait';if(variant==='card')s.start.seats[2].hole=['Jh','Jd'];if(variant==='audio')s.beats[0].audio['en-US'].assetId=tones[1].assetId;return {project};
    });
    if(variant==='base')await writeFile('dist/build.json','{"hash":"deliberately-stale"}');
    const result=await renderVideo(destination,{out:join(dir,'exports')});assert.equal(result.cached,false);fingerprints.add(result.fingerprint);contentHashes.add(result.projectHash);assert.equal(result.rendererHash,JSON.parse(await readFile('dist/build.json','utf8')).hash);
    t.diagnostic(JSON.stringify({variant,fingerprint:result.fingerprint,projectHash:result.projectHash,frames:result.frames}));
    const plan=compileProject(await store.read(),packs);assert.equal(result.planHash,hash(plan));
  }
  assert.equal(fingerprints.size,6);assert.equal(contentHashes.size,6);
});
test('Missing project resource and timeout never publish a successful artifact (A12)',async t=>{
  const dir=await temp(t),p=fixture({sceneId:'side-pots'});p.lesson.scenes=p.lesson.scenes.filter(s=>s.id==='side-pots');const store=await createProject(join(dir,'project'),p),out=join(dir,'out');
  await assert.rejects(()=>renderVideo(store.directory,{out,timeoutSeconds:.05}),e=>e.code==='TIME_LIMIT');assert.ok(!(await readdir(out)).some(x=>/^[a-f0-9]{64}$/.test(x)));
  const a=await importAudio(store.directory,{path:'examples/legacy/assets/audio/en-US.wav'});await store.update(async project=>{const b=project.lesson.scenes[0].beats[0];b.narration=words('Voice');b.audio={'zh-CN':{assetId:a.assetId,locale:'zh-CN',textHash:hash('Voice')}};project.assets[a.assetId]=a.asset;return {project};});
  await rm(join(store.directory,a.asset.path));await assert.rejects(()=>renderVideo(store.directory,{out}),e=>e.code==='PRECHECK'&&e.detail.issues.some(i=>i.code==='ASSET_MISSING'));
});
