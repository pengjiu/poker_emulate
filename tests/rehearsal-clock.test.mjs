import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fixture,packs,temp,words} from './helpers.mjs';
import {createProject} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {compileProject,validateProject} from '../src/compiler.mjs';
import {frameAt,narrationAt,narrationCues,renderFrame,subtitleCues} from '../src/client/render.mjs';
import {renderVideo} from '../src/media/render.mjs';
import {hash} from '../src/util.mjs';

const exec=promisify(execFile),locale='zh-CN';
const timing={actions:[.5,1.25,2],narration:.25};
const captions=[
  {start:0,end:1,text:'先看大盲怎么打。'},
  {start:1,end:1.75,text:'双方都过牌，'},
  {start:1.75,end:3,text:'转牌落下之后，再重新判断范围。'}
];
const reveals=[{at:1.75,annotations:[{id:'answer',type:'label',target:[.5,.2],text:words('转牌出现')}]}];
const staleCodes=['CAPTION_STALE','PRESENTATION_STALE','TIMING_STALE'];
const codes=project=>compileProject(project,packs).issues.map(i=>i.code).sort();

function draft(){
  const project=fixture(),scene=project.lesson.scenes[0];
  project.lesson.scenes=[scene];scene.branches=[];project.output.captions=true;
  scene.beats=[{id:'flow',label:words('Flow'),hold:.2,actionHold:.2,rehearsalDuration:{[locale]:3},
    actions:[{type:'check',seat:'bb'},{type:'check',seat:'btn'},{type:'deal',cards:['2h']}],
    narration:words(captions.map(c=>c.text).join('')),
    presentation:{surface:'table',annotations:[]}}];
  return project;
}
function commands(){
  return [
    {type:'timing.set',beatId:'flow',value:{locale,timing}},
    {type:'captions.set',beatId:'flow',value:{locale,cues:captions}},
    {type:'presentation.cues',beatId:'flow',value:{locale,cues:reveals}}
  ];
}
async function scheduled(t){
  const directory=await temp(t),store=await createProject(join(directory,'project'),draft()),director=await Director.open(store.directory);
  await director.apply({requestId:'review-rehearsal',expectedRevision:0,commands:commands()});
  return {directory,store,director,project:await store.read()};
}

test('public commands bind a silent rehearsal to one action, caption and reveal clock',async t=>{
  const {store,director,project}=await scheduled(t),beat=project.lesson.scenes[0].beats[0],plan=await director.export({kind:'plan'});
  assert.equal(beat.timing.audioHashes[locale],null);
  assert.equal(beat.captionCues[locale].audioHash,null);
  assert.equal(beat.presentation.cues[locale].audioHash,null);
  assert.deepEqual(codes(project),['AUDIO_MISSING']);
  assert.deepEqual((await director.observe()).readiness.issues.map(i=>i.code),['AUDIO_MISSING']);
  const report=await validateProject(project,packs,{directory:store.directory,media:true});
  assert.equal(report.ready,false);assert.deepEqual(report.results[0].issues.map(i=>i.code),['AUDIO_MISSING']);
  assert.equal(narrationCues(plan).length,1);assert.equal(narrationCues(plan)[0].start,.25);assert.equal(narrationCues(plan)[0].duration,3);
  for(const second of [.3,.8,1.5,2.5,3.2]){
    const cue=narrationAt(plan,Math.floor(second*plan.fps));assert.equal(cue.start,.25);assert.equal(cue.duration,3);
    assert.equal(cue.id,'flow');assert.ok(Math.abs(cue.elapsed-(Math.floor(second*plan.fps)/plan.fps-.25))<1e-9);
  }
  assert.equal(frameAt(plan,0).state.actor,'bb');
  assert.equal(frameAt(plan,.5*plan.fps).state.actor,'btn');
  assert.equal(frameAt(plan,1.25*plan.fps).state.roundClosed,true);
  assert.equal(frameAt(plan,2*plan.fps).state.board.length,4);
  for(let i=0;i<2*plan.fps;i++)assert.doesNotMatch(renderFrame(plan,i),/转牌落下之后|转牌出现/,'Future caption and reveal stay hidden until the deal.');
  assert.match(renderFrame(plan,2*plan.fps),/转牌落下之后/);assert.match(renderFrame(plan,2*plan.fps),/转牌出现/);
  assert.deepEqual(subtitleCues(plan).map(c=>[c.start,c.end]),[[.25,1.25],[1.25,2],[2,3.25]]);
  assert.equal(subtitleCues(plan).map(c=>c.text).join(''),beat.narration[locale]);
});

test('the real rehearsal render passes with pending voice while formal render rejects it',async t=>{
  const {directory,store,project}=await scheduled(t),out=join(directory,'renders');
  await assert.rejects(()=>renderVideo(store.directory,{out}),e=>e.code==='PRECHECK'&&e.detail.issues.length===1&&e.detail.issues[0].code==='AUDIO_MISSING');
  const receipt=await renderVideo(store.directory,{out,rehearsal:true});
  assert.equal(receipt.validation.status,'VISUAL_PASS');assert.equal(receipt.validation.decode,true);
  assert.equal(receipt.validation.pendingVoice.length,1);assert.equal(receipt.validation.rehearsal,true);
  assert.equal(receipt.frames,compileProject(project,packs).totalFrames);
  assert.ok((await readFile(join(receipt.directory,'video.mp4'))).length>1000);
  const srt=await readFile(join(receipt.directory,'captions.srt'),'utf8');
  assert.match(srt,/00:00:02,000 --> 00:00:03,250\n转牌落下之后/);
  assert.equal(srt.match(/转牌落下之后/g)?.length,1,'The answer belongs to one continuous narration clock.');
});

test('importing real audio makes every draft binding stale until explicit public review',async t=>{
  const {directory,store,director}=await scheduled(t),source=join(directory,'take.wav');
  await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=4:sample_rate=48000',source]);
  await director.apply({requestId:'actual-audio',expectedRevision:1,commands:[{type:'audio.attach',beatId:'flow',value:{locale,source:{path:source}}}]});
  let project=await store.read(),beat=project.lesson.scenes[0].beats[0];
  assert.deepEqual(codes(project),staleCodes);
  assert.equal(beat.timing.audioHashes[locale],null);assert.equal(beat.captionCues[locale].audioHash,null);assert.equal(beat.presentation.cues[locale].audioHash,null);
  assert.equal(narrationCues(compileProject(project,packs))[0].duration,4,'Measured audio replaces the reading estimate.');
  await assert.rejects(()=>renderVideo(store.directory,{out:join(directory,'rejected'),rehearsal:true}),e=>e.code==='PRECHECK'&&e.detail.issues.map(i=>i.code).sort().join()===staleCodes.join());
  await director.apply({requestId:'review-actual-audio',expectedRevision:2,commands:commands()});
  project=await store.read();beat=project.lesson.scenes[0].beats[0];assert.deepEqual(codes(project),[]);
  for(const bound of [beat.timing.audioHashes[locale],beat.captionCues[locale].audioHash,beat.presentation.cues[locale].audioHash])assert.equal(bound,beat.audio[locale].assetId);
  const report=await validateProject(project,packs,{directory:store.directory,media:true});assert.equal(report.ready,true);
  await director.apply({requestId:'clear-actual-reveals',expectedRevision:3,commands:[{type:'presentation.cues',beatId:'flow',value:{locale,cues:[]}}]});
  project=await store.read();assert.deepEqual(project.lesson.scenes[0].beats[0].presentation.cues[locale].cues,[]);assert.deepEqual(codes(project),[]);
});

test('missing estimates, old hashes and empty cue drafts cannot confirm silent schedules',async t=>{
  const {directory,store,director,project}=await scheduled(t),withoutClocks=[];
  for(const estimate of [undefined,{'en-US':3}]){
    const changed=structuredClone(project),beat=changed.lesson.scenes[0].beats[0];
    if(estimate===undefined)delete beat.rehearsalDuration;else beat.rehearsalDuration=estimate;
    assert.deepEqual(codes(changed),['AUDIO_MISSING',...staleCodes].sort(),'The selected language needs its own explicit estimate.');
    withoutClocks.push(changed);
  }
  const missing=structuredClone(project);delete missing.lesson.scenes[0].beats[0].timing.audioHashes;
  assert.ok(codes(missing).includes('TIMING_STALE'),'An absent binding is not an explicit null binding.');
  const old=structuredClone(project),oldBeat=old.lesson.scenes[0].beats[0],oldHash='a'.repeat(64);
  oldBeat.timing.audioHashes[locale]=oldHash;oldBeat.captionCues[locale].audioHash=oldHash;oldBeat.presentation.cues[locale].audioHash=oldHash;
  assert.deepEqual(codes(old),['AUDIO_MISSING',...staleCodes].sort());
  const reference=structuredClone(project),refBeat=reference.lesson.scenes[0].beats[0];refBeat.audio={[locale]:{assetId:oldHash,locale,textHash:hash(refBeat.narration[locale])}};
  assert.deepEqual(codes(reference),['AUDIO_MISSING',...staleCodes].sort(),'A missing referenced asset does not turn real-audio bindings into a silent draft.');
  const empty=structuredClone(project),emptyBeat=empty.lesson.scenes[0].beats[0];emptyBeat.captionCues[locale].cues=[];emptyBeat.presentation.cues[locale].cues=[];
  assert.deepEqual(codes(empty),['AUDIO_MISSING','CAPTION_STALE']);
  for(const changed of [...withoutClocks,old,missing,reference,empty]){
    await store.update(async()=>({project:changed}));
    await assert.rejects(()=>renderVideo(store.directory,{out:join(directory,'rejected'),rehearsal:true}),e=>e.code==='PRECHECK'&&e.detail.issues.some(i=>i.code.endsWith('_STALE')));
  }
  const withoutEstimate=draft();delete withoutEstimate.lesson.scenes[0].beats[0].rehearsalDuration;
  await store.update(async()=>({project:withoutEstimate}));
  await assert.rejects(()=>director.apply({requestId:'no-clock',expectedRevision:0,commands:commands()}),e=>e.code==='AUDIO_MISSING');
  assert.equal((await store.read()).revision,0);
});

test('empty presentation cues clear events while nonempty cues remain language-specific',async t=>{
  const {project}=await scheduled(t),beat=project.lesson.scenes[0].beats[0];
  beat.presentation.cues[locale].cues=[];assert.deepEqual(codes(project),['AUDIO_MISSING']);
  delete beat.presentation.cues[locale];beat.presentation.cues['en-US']={audioHash:null,cues:[]};assert.deepEqual(codes(project),['AUDIO_MISSING']);
  beat.presentation.cues['en-US'].cues=structuredClone(reveals);assert.deepEqual(codes(project),['AUDIO_MISSING','PRESENTATION_STALE']);
});

test('silent precise cues must preserve all text, fit the estimate and occupy visible frames',async t=>{
  const {store,director,project}=await scheduled(t);
  const over=structuredClone(project);over.lesson.scenes[0].beats[0].captionCues[locale].cues.at(-1).end=3.01;
  assert.ok(codes(over).includes('CAPTION_TIMING'));
  const invisible=structuredClone(project),cues=invisible.lesson.scenes[0].beats[0].captionCues[locale].cues;cues[0].start=.01;cues[0].end=.02;
  assert.ok(codes(invisible).includes('CAPTION_TIMING'));
  const late=structuredClone(project);late.lesson.scenes[0].beats[0].presentation.cues[locale].cues[0].at=4;
  assert.ok(codes(late).includes('PRESENTATION_TIMING'));
  const changed=captions.map(c=>({...c}));changed[0].text='遗漏了原稿。';
  await assert.rejects(()=>director.apply({requestId:'text-loss',expectedRevision:1,commands:[{type:'captions.set',beatId:'flow',value:{locale,cues:changed}}]}),e=>e.code==='CAPTION_TEXT');
  await assert.rejects(()=>director.apply({requestId:'empty-captions',expectedRevision:1,commands:[{type:'captions.set',beatId:'flow',value:{locale,cues:[]}}]}),e=>e.code==='CAPTION_TIMING');
  assert.equal((await store.read()).revision,1);
});
