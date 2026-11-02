import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fixture,temp,packs,words} from './helpers.mjs';
import {createProject} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {compileProject} from '../src/compiler.mjs';
import {renderVideo} from '../src/media/render.mjs';
import {chapterPlans} from '../src/media/chapters.mjs';
import {effectWav,mixGraph} from '../src/media/sound.mjs';
import {hash} from '../src/util.mjs';
const exec=promisify(execFile);

test('an excerpt replays earlier actions, excludes unrelated missing voices and keeps its exact decision',()=>{
  const p=fixture(),scene=p.lesson.scenes[0],full=compileProject(p,packs),beat=scene.beats.find(b=>b.narration),id=beat.id;
  const short=compileProject(p,packs,{output:{sequence:[{id:'short',sceneId:scene.id,fromBeatId:id,toBeatId:id}]}});
  assert.deepEqual(short.frames[0].state,full.frames.find(f=>f.beatId===id).state);
  assert.equal(short.frames[0].startFrame,0);assert.ok(short.frames.every(f=>f.beatId===id));
  assert.ok(short.issues.filter(i=>i.target).every(i=>i.target.beatId===id));
  scene.beats.push({id:'unfinished-later',label:words('Later draft'),actions:[{type:'bet',seat:'missing-player',to:1}]});
  assert.doesNotThrow(()=>compileProject(p,packs,{output:{sequence:[{id:'independent-prefix',sceneId:scene.id,fromBeatId:id,toBeatId:id}]}}));
  assert.throws(()=>compileProject(p,packs,{output:{sequence:[{id:'bad',sceneId:scene.id,fromBeatId:scene.beats.at(-1).id,toBeatId:scene.beats[0].id}]}}),e=>e.code==='SEQUENCE');
});

test('chapter identities survive reordering and exclude unrelated project edits',()=>{
  const p=fixture({sceneId:'side-pots'}),s=p.lesson.scenes.find(s=>s.id==='side-pots');
  s.beats.forEach(b=>{delete b.narration;b.hold=.2;});const copy=structuredClone(s);copy.id='second';p.lesson.scenes=[s,copy];
  p.output.sequence=[{id:'one',sceneId:s.id},{id:'two',sceneId:copy.id}];
  const before=chapterPlans(compileProject(p,packs));p.revision++;copy.appearance={felt:'#333344'};
  const after=chapterPlans(compileProject(p,packs));assert.equal(before[0].hash,after[0].hash);assert.notEqual(before[1].hash,after[1].hash);
  const shifted=compileProject(p,packs);for(const f of shifted.frames){f.start+=10;f.end+=10;f.startFrame+=240;f.endFrame+=240;f.stateStart+=10;if(f.narrationStart!==undefined)f.narrationStart+=10;}
  assert.equal(chapterPlans(shifted)[1].hash,after[1].hash);
});

test('real chapter cache reuses the unchanged chapter and rejects corrupted media',async t=>{
  const dir=await temp(t),p=fixture({sceneId:'side-pots'}),s=p.lesson.scenes.find(s=>s.id==='side-pots');
  s.beats.forEach(b=>{delete b.narration;b.hold=.12;b.actionHold=.12;});const copy=structuredClone(s);copy.id='second';p.lesson.scenes=[s,copy];p.output.sequence=[{id:'one',sceneId:s.id},{id:'two',sceneId:copy.id}];
  const store=await createProject(join(dir,'project'),p),d=await Director.open(store.directory),out=join(dir,'renders');
  const first=await renderVideo(store.directory,{out});assert.equal(first.validation.metrics.chapterMisses,2);
  copy.appearance={felt:'#444455'};await d.apply({requestId:'change-second',expectedRevision:0,commands:[{type:'scene.put',value:copy}]});
  const second=await renderVideo(store.directory,{out});assert.equal(second.validation.metrics.chapterHits,1);assert.equal(second.validation.metrics.chapterMisses,1);assert.equal(second.frames,first.frames);
  const chapter=chapterPlans(compileProject(await store.read(),packs))[0],cache=hash({plan:chapter.hash,renderer:second.rendererHash,toolchain:second.toolchain,visualImplementationHash:second.visualImplementationHash});await writeFile(join(out,'.chapters',cache,'video.mp4'),'broken');
  await d.apply({requestId:'course',expectedRevision:1,commands:[{type:'course.set',value:{id:'course',title:words('Course'),episodes:[{id:'one',sceneId:s.id,objective:words('Observe')} ,{id:'two',sceneId:copy.id,objective:words('Compare')}]}}]});
  await assert.rejects(()=>renderVideo(store.directory,{out}),e=>e.code==='CACHE_INVALID');
  assert.ok((await readFile(join(second.directory,'video.mp4'))).length>1000);
});

test('visual rehearsal permits missing speech only, and formal output continues to reject it',async t=>{
  const dir=await temp(t),p=fixture({sceneId:'side-pots'}),s=p.lesson.scenes.find(s=>s.id==='side-pots');p.lesson.scenes=[s];s.beats.forEach(b=>{delete b.narration;b.hold=.12;b.actionHold=.12;});s.beats[0].narration=words('Rehearsal speech pending.');
  const store=await createProject(join(dir,'project'),p),out=join(dir,'renders');await assert.rejects(()=>renderVideo(store.directory,{out}),e=>e.code==='PRECHECK');
  const proof=await renderVideo(store.directory,{out,rehearsal:true});assert.equal(proof.validation.status,'VISUAL_PASS');assert.equal(proof.validation.pendingVoice.length,1);assert.equal(proof.validation.rehearsal,true);
});

test('sound mixing ducks background during a voice and preserves a genuinely quiet interval',async t=>{
  const dir=await temp(t),bed=join(dir,'bed.wav'),voice=join(dir,'voice.wav'),out=join(dir,'mix.wav');
  await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=220:duration=6:sample_rate=48000',bed]);
  await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=2000:duration=2:sample_rate=48000',voice]);
  const sources=[{kind:'voice',path:voice,start:1,duration:2},{kind:'bed',path:bed,start:0,duration:6,volume:.5}],plan={duration:6,sound:{ducking:{reductionDB:12,attack:.05,release:.1},quiet:[[4,4.5]]}};
  await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=black:s=16x16:d=6','-f','lavfi','-i','anullsrc=r=48000:cl=stereo',...sources.flatMap(s=>['-i',s.path]),'-filter_complex',mixGraph(sources,plan),'-map','[mixed]','-t','6','-c:a','pcm_s16le',out]);
  const band=await exec('ffmpeg',['-v','error','-i',out,'-af','lowpass=f=350','-ac','1','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:4e6});
  const samples=band.stdout,rms=(from,to)=>{let sum=0,n=0;for(let i=Math.floor(from*48000);i<Math.floor(to*48000);i++){const v=samples.readFloatLE(i*4);sum+=v*v;n++;}return Math.sqrt(sum/n);};
  assert.ok(rms(1.5,2.5)<rms(.2,.7)*.4,'Background is at least 8 dB quieter under narration.');assert.ok(rms(4.1,4.4)<1e-5,'Quiet interval contains no background tail.');
  for(const kind of ['deal','bet','collect','payout']){const wav=effectWav(kind);assert.equal(wav.toString('ascii',0,4),'RIFF');assert.ok(wav.length>4000);}
});
