import test from 'node:test';
import assert from 'node:assert/strict';
import {Director} from '../src/director.mjs';
import {compileProject,validateProject} from '../src/compiler.mjs';
import {patterns,selectDirection} from '../src/direction/index.mjs';
import {narrationAt,narrationCues,subtitleCues,renderFrame} from '../src/client/render.mjs';
import {hash} from '../src/util.mjs';
import {fixture,packs,stored,words} from './helpers.mjs';

function timed(){
  const p=fixture(),s=p.lesson.scenes[0];p.output.captions=true;p.lesson.scenes=[s];s.branches=[];
  const text='先看大盲怎么打。双方都过牌，转牌落下之后，再重新判断范围。',id='b'.repeat(64);
  p.assets[id]={path:`assets/${id}.wav`,sha256:id,duration:4,bytes:400,mime:'audio/wav'};
  s.beats=[{id:'flow',label:words('Flow'),actions:[{type:'check',seat:'bb'},{type:'check',seat:'btn'},{type:'deal',cards:['2h']}],timing:{actions:[.5,1.5,2.5],narration:0},narration:words(text),audio:{'zh-CN':{assetId:id,locale:'zh-CN',textHash:hash(text)}},hold:1}];s.beats[0].timing.audioHashes={'zh-CN':id};return p;
}

test('Catalog profiles localize all guidance and are isolated frozen project snapshots',async t=>{
  const index=patterns();assert.equal(index.patterns.length,10);
  for(const item of index.patterns){const {profile}=patterns(item.id);for(const locale of Object.keys(packs)){assert.ok(profile.name[locale]);assert.ok(profile.guidance[locale].length);assert.ok(profile.checks[locale].length);}assert.ok(profile.sources.length);}
  const chosen=selectDirection({patternId:'think-aloud',overrides:{summary:{'zh-CN':'新摘要'},guidance:{'zh-CN':['自己的表达纪律']}}});
  assert.equal(chosen.profile.summary['zh-CN'],'新摘要');assert.ok(chosen.profile.summary['ja-JP']);assert.notEqual(patterns('think-aloud').profile.summary['zh-CN'],'新摘要');
  const custom=selectDirection({profile:{...chosen.profile,id:'my-new-mode',perspective:'observer with a rotating guest',structure:['setup','challenge','return']}});assert.equal(custom.origin,undefined);
  const store=await stored(t),d=await Director.open(store.directory),request={requestId:'mode',expectedRevision:0,commands:[{type:'direction.set',value:{profile:custom.profile}}]};
  const receipt=await d.apply(request);assert.deepEqual((await d.observe()).direction,custom);assert.deepEqual(await (await Director.open(store.directory)).apply(request),receipt);
  const project=await d.export();assert.deepEqual(project.direction,custom);
  const sceneId=project.output.sceneId;await d.apply({requestId:'scope',expectedRevision:1,commands:[{type:'direction.set',sceneId,value:{patternId:'range-lab'}}]});assert.equal((await d.observe()).direction.profile.id,'range-lab');
  await d.apply({requestId:'inherit',expectedRevision:2,commands:[{type:'direction.set',sceneId,value:null}]});assert.equal((await d.observe()).direction.profile.id,'my-new-mode');
  await assert.rejects(d.apply({requestId:'bad',expectedRevision:3,commands:[{type:'direction.set',value:{patternId:'missing'}}]}),e=>e.code==='PATTERN_UNKNOWN');assert.equal((await store.read()).revision,3);await assert.rejects(d.apply({requestId:'empty-scope',expectedRevision:3,commands:[{type:'direction.set',sceneId:'',value:null}]}),e=>e.code==='SCHEMA');assert.equal((await store.read()).direction.profile.id,'my-new-mode');
});
test('Timed actions advance under one speech/caption clock without exposing future state',()=>{
  const p=timed(),plan=compileProject(p,packs),cue=narrationCues(plan);assert.equal(cue.length,1);assert.equal(cue[0].start,0);assert.equal(cue[0].duration,4);
  assert.equal(plan.frames[0].state.actor,'bb');assert.equal(plan.frames.find(f=>f.event?.seat==='bb').state.actor,'btn');
  assert.equal(plan.frames.find(f=>f.event?.seat==='btn').state.roundClosed,true);assert.equal(plan.frames.find(f=>f.event?.type==='deal').state.board.length,4);
  for(const second of [.2,.8,1.8,2.8,3.8]){const active=narrationAt(plan,Math.floor(second*plan.fps));assert.equal(active.id,'flow');assert.equal(active.start,0);assert.equal(active.duration,4);}
  assert.equal(narrationAt(plan,Math.floor(4.1*plan.fps)),null);assert.equal(plan.issues.length,0);
  const split=plan.frames.at(-1);assert.equal(split.stateStart,2.5);assert.equal(split.stateEvent.type,'deal');
  assert.ok(plan.duration>=4.35);assert.match(renderFrame(plan,Math.floor(3.8*plan.fps)),/caption-lane/);
  assert.deepEqual(plan.frames[0].state.seats.find(s=>s.id==='bb').hole,[null,null]);
});
test('Delayed speech preserves silence and quantized action collisions fail explicitly',()=>{
  const p=timed();p.lesson.scenes[0].beats[0].timing.narration=1.1;const plan=compileProject(p,packs);
  assert.equal(narrationAt(plan,Math.floor(1*plan.fps)),null);assert.equal(narrationCues(plan)[0].start,27/24);assert.ok(plan.duration>=5.45);
  p.lesson.scenes[0].beats[0].timing.actions=[.001,.002,2];assert.throws(()=>compileProject(p,packs),e=>e.code==='TIMING_COLLISION');
  p.lesson.scenes[0].beats[0].timing.actions=[1,1,2];assert.throws(()=>compileProject(p,packs),e=>e.code==='TIMING');
});
test('Programme repetition resets state, scopes identities and retains all narration occurrences',async t=>{
  const p=timed(),id=p.output.sceneId;p.output.sequence=[{id:'original',sceneId:id},{id:'replay',sceneId:id}];
  const plan=compileProject(p,packs);assert.equal(narrationCues(plan).length,2);assert.equal(new Set(plan.frames.map(f=>f.id)).size,plan.frames.length);
  const first=plan.frames[0],again=plan.frames.find(f=>f.entryId==='replay');assert.deepEqual(again.state,first.state);assert.ok(again.start>0);
  const store=await stored(t),d=await Director.open(store.directory);await store.update(async()=>({project:p}));
  await assert.rejects(d.seek({beatId:'flow'}),e=>e.code==='BEAT_AMBIGUOUS');assert.equal((await d.seek({beatId:'flow',entryId:'replay'})).entryId,'replay');
  assert.equal(compileProject(p,packs,{output:{sceneId:id}}).sequence,null);
  await d.apply({requestId:'aspect',expectedRevision:0,commands:[{type:'output.set',value:{aspect:'portrait'}}]});assert.equal((await store.read()).output.sequence.length,2);
  await d.apply({requestId:'single',expectedRevision:1,commands:[{type:'output.set',value:{sceneId:id}}]});assert.equal((await store.read()).output.sequence,undefined);
});
test('Scene-specific profiles stay attached to their programme chapters',async()=>{
  const p=timed(),a=p.lesson.scenes[0],b=structuredClone(a);b.id='second';b.appearance={tableName:'Luna 12',felt:'#224466'};
  a.direction=selectDirection({patternId:'think-aloud'});b.direction=selectDirection({patternId:'decision-quiz'});p.lesson.scenes.push(b);
  p.output.sequence=[{id:'one',sceneId:a.id},{id:'two',sceneId:b.id}];const plan=compileProject(p,packs);
  assert.deepEqual(plan.directions.map(item=>item.direction.profile.id),['think-aloud','decision-quiz']);const frame=plan.frames.find(f=>f.entryId==='two');assert.match(renderFrame(plan,frame.startFrame),/Luna 12/);
  const report=await validateProject(p,packs);assert.equal(report.ready,true);assert.equal(report.results[0].frames,plan.totalFrames);
});

test('Validation and compilation honor explicit scene/branch overrides in both readiness directions',async()=>{
  const p=fixture();p.output.sequence=[{id:'ready',sceneId:'side-pots'}];
  let override={sceneId:'button-vs-blind',branchId:null};let report=await validateProject(p,packs,{output:override});assert.equal(report.ready,false);assert.equal(report.results[0].output.sequence,null);assert.deepEqual(report.results[0].issues,compileProject(p,packs,{output:override}).issues);
  p.output.sequence=[{id:'unready',sceneId:'button-vs-blind'}];override={sceneId:'side-pots',branchId:null};report=await validateProject(p,packs,{output:override});assert.equal(report.ready,true);assert.equal(report.results[0].duration,compileProject(p,packs,{output:override}).duration);
  override={branchId:'check-line'};report=await validateProject(p,packs,{output:override});assert.equal(report.results[0].output.sequence,null);assert.deepEqual(report.results[0].issues,compileProject(p,packs,{output:override}).issues);
});


test('Precise captions share the speech clock, preserve text and invalidate their audio binding',async t=>{
  const p=timed(),b=p.lesson.scenes[0].beats[0];b.captionCues={'zh-CN':{audioHash:b.audio['zh-CN'].assetId,cues:[{start:0,end:1.3,text:'先看大盲怎么打。'},{start:1.3,end:2.5,text:'双方都过牌，'},{start:2.5,end:4,text:'转牌落下之后，再重新判断范围。'}]}};
  let plan=compileProject(p,packs);assert.doesNotMatch(renderFrame(plan,Math.floor(.8*plan.fps)),/双方都过牌|转牌落下之后/);assert.match(renderFrame(plan,Math.floor(2.8*plan.fps)),/转牌落下之后/);assert.equal(subtitleCues(plan).length,3);assert.equal(subtitleCues(plan)[2].start,2.5);const original=structuredClone(b.captionCues);b.captionCues['zh-CN'].cues=[{start:.01,end:.02,text:b.narration['zh-CN']}];assert.ok(compileProject(p,packs).issues.some(i=>i.code==='CAPTION_TIMING'));b.captionCues=original;const bound=b.captionCues['zh-CN'].audioHash;b.captionCues['zh-CN'].audioHash='a'.repeat(64);assert.ok(compileProject(p,packs).issues.some(i=>i.code==='CAPTION_STALE'));b.captionCues['zh-CN'].audioHash=bound;
  b.captionCues['zh-CN'].cues[2].end=5;assert.ok(compileProject(p,packs).issues.some(i=>i.code==='CAPTION_TIMING'));b.captionCues['zh-CN'].cues[2].end=4;
  b.captionCues['zh-CN'].cues[0].text='不同的稿';assert.throws(()=>compileProject(p,packs),e=>e.code==='CAPTION_TEXT');b.captionCues['zh-CN'].cues[0].text='先看大盲怎么打。';
  const store=await stored(t);await store.update(async()=>({project:p}));const d=await Director.open(store.directory);await d.apply({requestId:'bind',expectedRevision:0,commands:[{type:'captions.set',beatId:'flow',value:{locale:'zh-CN',cues:original['zh-CN'].cues}}]});assert.equal((await store.read()).lesson.scenes[0].beats[0].captionCues['zh-CN'].audioHash,b.audio['zh-CN'].assetId);await d.apply({requestId:'new-take',expectedRevision:1,commands:[{type:'audio.attach',beatId:'flow',value:{locale:'zh-CN',source:{path:'examples/legacy/assets/audio/en-US.wav'}}}]});assert.ok(compileProject(await store.read(),packs).issues.some(i=>i.code==='CAPTION_STALE'));await d.apply({requestId:'change-text',expectedRevision:2,commands:[{type:'narration.set',beatId:'flow',text:'新的一段完整旁白。'}]});assert.deepEqual((await store.read()).lesson.scenes[0].beats[0].captionCues['zh-CN'],{audioHash:null,cues:[]});assert.ok(compileProject(await store.read(),packs).issues.some(i=>i.code==='CAPTION_STALE'));
});

test('Timed speech is bound to each language take and language schedules can differ',async t=>{
  const p=timed(),b=p.lesson.scenes[0].beats[0],english='c'.repeat(64);p.assets[english]={path:`assets/${english}.wav`,sha256:english,duration:6,bytes:600,mime:'audio/wav'};b.audio['en-US']={assetId:english,locale:'en-US',textHash:hash(b.narration['en-US'])};delete b.timing.audioHashes;
  assert.ok(compileProject(p,packs).issues.some(i=>i.code==='TIMING_STALE'));const store=await stored(t);await store.update(async()=>({project:p}));const d=await Director.open(store.directory);
  await d.apply({requestId:'confirmed-times',expectedRevision:0,commands:[{type:'timing.set',beatId:'flow',value:{locale:'zh-CN',timing:{actions:[.5,1.5,2.5],narration:0}}},{type:'timing.set',beatId:'flow',value:{locale:'en-US',timing:{actions:[1,2,3],narration:.5}}}]});
  let current=await store.read(),zh=compileProject(current,packs),en=compileProject(current,packs,{output:{locale:'en-US'}});assert.equal(zh.issues.length,0);assert.equal(en.issues.length,0);assert.equal(zh.frames.find(f=>f.event?.seat==='bb').start,.5);assert.equal(en.frames.find(f=>f.event?.seat==='bb').start,1);assert.equal(narrationCues(en)[0].start,.5);
  await d.apply({requestId:'replace-en-take',expectedRevision:1,commands:[{type:'audio.attach',beatId:'flow',value:{locale:'en-US',source:{path:'examples/legacy/assets/audio/en-US.wav'}}}]});current=await store.read();assert.ok(compileProject(current,packs,{output:{locale:'en-US'}}).issues.some(i=>i.code==='TIMING_STALE'));assert.equal(compileProject(current,packs).issues.length,0);
  await d.apply({requestId:'en-default-order',expectedRevision:2,commands:[{type:'timing.set',beatId:'flow',value:{locale:'en-US',timing:null}}]});current=await store.read();assert.equal(compileProject(current,packs,{output:{locale:'en-US'}}).issues.length,0);assert.equal(compileProject(current,packs).frames.find(f=>f.event?.seat==='bb').start,.5);
});
