import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {newProject,createProject,ProjectStore} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {compileProject} from '../src/compiler.mjs';
import {chapterPlans} from '../src/media/chapters.mjs';
import {effectWav} from '../src/media/sound.mjs';
import {renderVideo,mediaImplementationFingerprint,visualImplementationFingerprint} from '../src/media/render.mjs';
import {hash} from '../src/util.mjs';
import {renderMixedAudio} from '../src/media/mix.mjs';
import {produce} from '../src/media/produce.mjs';
import {words,packs,temp} from './helpers.mjs';

function scene(id='one'){
  return {id,title:words('One decision'),start:{street:'river',board:['Qd','7c','2s','Tc','4d'],button:'hero',hero:'hero',actor:'hero',seats:[{id:'villain',name:'North',stack:10,contributed:1,hole:['Kc','Jh']},{id:'hero',name:'River',stack:10,contributed:1,hole:['Ah','Qh']}]},beats:[{id:'hold',label:words('Test fixture'),hold:.6}]};
}
async function voiced(t){
  const dir=await temp(t),s=scene();s.beats[0].narration=words('Integration test signal, not a voice recording.');
  const store=await createProject(join(dir,'project'),newProject({scenes:[s]},{locale:'en-US'})),d=await Director.open(store.directory),wav=join(dir,'signal.wav');await writeFile(wav,effectWav('bet'));
  await d.apply({requestId:'signal',expectedRevision:0,commands:[{type:'audio.attach',beatId:'hold',value:{locale:'en-US',source:{path:wav}}}]});return {dir,store,d};
}

test('chapter video identities ignore another scene title and reordered programme metadata',()=>{
  const a=scene(),b=scene('two'),p=newProject({scenes:[a,b]},{locale:'en-US'});p.output.sequence=[{id:'a',sceneId:a.id},{id:'b',sceneId:b.id}];
  const before=chapterPlans(compileProject(p,packs));p.lesson.scenes[0].title=words('Only the first title changed');assert.equal(compileProject(p,packs).title,'Only the first title changed');
  assert.equal(chapterPlans(compileProject(p,packs))[1].hash,before[1].hash);
  p.output.sequence.reverse();const reordered=chapterPlans(compileProject(p,packs));assert.equal(reordered[0].hash,before[1].hash);assert.equal(reordered[1].hash,before[0].hash);
});

test('a manual sound cue cannot drift past its passage into a later scene',()=>{
  const a=scene(),b=scene('two');a.beats[0].sound={effects:[{kind:'bet',at:1}]};b.beats[0].hold=3;
  const p=newProject({scenes:[a,b]},{locale:'en-US'});p.output.sequence=[{id:'a',sceneId:a.id},{id:'b',sceneId:b.id}];
  const plan=compileProject(p,packs),issue=plan.issues.find(i=>i.code==='SOUND_TIMING');assert.ok(issue);assert.deepEqual(issue.target,{sceneId:'one',entryId:'a',beatId:'hold'});assert.equal(plan.sound.events.length,0);
  p.lesson.scenes[0].beats[0].sound.effects[0].at=.2;assert.ok(!compileProject(p,packs).issues.some(i=>i.code==='SOUND_TIMING'));
});

test('an intentionally muted ambient-only programme still produces valid silent media',async t=>{
  const dir=await temp(t),s=scene(),p=newProject({scenes:[s]},{locale:'en-US'});s.beats[0].sound={effects:[{kind:'bet',at:.1,volume:0}]};p.lesson.scenes=[s];p.sound={effects:{enabled:true,volume:0}};const store=await createProject(join(dir,'project'),p),receipt=await renderVideo(store.directory,{out:join(dir,'render')});
  assert.equal(receipt.validation.status,'PASS');assert.equal(receipt.validation.audioNonSilent,false);assert.ok(receipt.validation.maxVolumeDB===null||receipt.validation.maxVolumeDB<-70);assert.equal(receipt.audioSources.some(source=>source.kind==='voice'),false);
});

test('real cached media verifies subtitles and carries its production implementation identity',async t=>{
  const {dir,store}=await voiced(t),out=join(dir,'renders'),first=await renderVideo(store.directory,{out});
  assert.equal(first.mediaImplementationHash,await mediaImplementationFingerprint());assert.ok(first.artifacts['captions.srt']);
  const cached=await renderVideo(store.directory,{out});assert.equal(cached.cached,true);
  await writeFile(join(first.directory,'captions.srt'),'wrong subtitle');await assert.rejects(()=>renderVideo(store.directory,{out}),{code:'CACHE_INVALID'});
});

test('a valid chapter from a different capture implementation cannot bypass a final media rebuild',async t=>{
  const {dir,store,d}=await voiced(t),out=join(dir,'renders'),first=await renderVideo(store.directory,{out});
  assert.equal(first.visualImplementationHash,await visualImplementationFingerprint());
  const chapter=chapterPlans(compileProject(await store.read(),packs))[0],key=hash({plan:chapter.hash,renderer:first.rendererHash,toolchain:first.toolchain,visualImplementationHash:first.visualImplementationHash}),path=join(out,'.chapters',key,'receipt.json');
  const receipt=JSON.parse(await readFile(path,'utf8'));assert.equal(receipt.visualImplementationHash,first.visualImplementationHash);
  receipt.visualImplementationHash='0'.repeat(64);await writeFile(path,JSON.stringify(receipt));
  // An audio-only change misses the final cache but would reuse identical
  // pictures. Intact video bytes cannot excuse a different capture identity.
  await d.apply({requestId:'new-mix',expectedRevision:1,commands:[{type:'sound.set',value:{voiceGainDB:-1}}]});
  assert.equal(chapterPlans(compileProject(await store.read(),packs))[0].hash,chapter.hash);
  await assert.rejects(()=>renderVideo(store.directory,{out}),{code:'CACHE_INVALID'});
});

test('mixed preview reuses identical audio across layout revisions and checks source bytes before cache',async t=>{
  const {store,d}=await voiced(t),first=await renderMixedAudio(store.directory),saved=await store.read();
  const changed=structuredClone(saved.lesson.scenes[0]);changed.appearance={felt:'#445566'};
  await d.apply({requestId:'appearance',expectedRevision:saved.revision,commands:[{type:'scene.put',value:changed}]});
  const second=await renderMixedAudio(store.directory);assert.equal(second.cached,true);assert.equal(second.fingerprint,first.fingerprint);assert.equal(second.revision,saved.revision+1);
  const asset=Object.values(saved.assets)[0];await writeFile(join(store.directory,asset.path),'corrupted source');await assert.rejects(()=>renderMixedAudio(store.directory),e=>e.code==='ASSET_CHANGED'||e.code==='ASSET_SIZE');
});

test('delivery transcript has complete timing and cached editable projects are verified too',async t=>{
  const {dir,store,d}=await voiced(t),out=join(dir,'delivery');
  await d.apply({requestId:'practice',expectedRevision:1,commands:[{type:'practice.set',value:{id:'lesson-practice',title:words('Practice'),questions:[{id:'price',sceneId:'one',node:{beatId:'hold'},prompt:words('Is there a bet to call?'),choices:[{id:'yes',text:words('Yes')},{id:'no',text:words('No')}],correctChoiceIds:['no'],explanation:words('The players have equal street contributions.')}]}},{type:'output.set',value:{locale:'zh-CN'}},{type:'delivery.set',value:[{id:'lesson',title:words('Lesson'),output:{...(await store.read()).output,locale:'en-US'}}]}]});
  const first=await produce(store.directory,{out});assert.deepEqual(first.practices,[{locale:'en-US',file:'practice-en-US.html'}]);assert.equal(await readFile(join(first.directory,'practice.html'),'utf8'),await readFile(join(first.directory,'practice-en-US.html'),'utf8'));
  const transcript=JSON.parse(await readFile(join(first.directory,'lesson-transcript.json'),'utf8'));assert.equal(transcript.length,1);assert.ok(transcript[0].end>transcript[0].start);assert.ok(Object.keys(first.files).some(path=>path.startsWith('project/')));assert.ok(first.files['index.html']);
  const again=await produce(store.directory,{out});assert.equal(again.cached,true);assert.equal(again.directory,first.directory);
  const exported=new ProjectStore(join(first.directory,'project'));await writeFile(exported.path,'{}');await assert.rejects(()=>produce(store.directory,{out}),{code:'CACHE_INVALID'});
});
