import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createProject,newProject} from '../src/project/store.mjs';
import {serve} from '../src/server.mjs';
import {priceLesson} from '../examples/teaching/course.mjs';
import {temp,words} from './helpers.mjs';

const beatId='shared/clip';
function scene(id,beat={}){
  return {id,title:words(id),start:priceLesson().start,beats:[{id:beatId,label:words(id),hold:8,...beat}]};
}
async function studio(t,project){
  const store=await createProject(join(await temp(t),'project'),project),server=await serve(store.directory,{port:0});let browser;
  t.after(async()=>{await browser?.close();await server.close();});
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(server.url);await page.waitForSelector('#scene-select');
  return {store,server,page};
}

test('presentation cue edits keep their original scene when an Agent moves the cursor',async t=>{
  const presentation={surface:'table',show:[],cues:{'zh-CN':{audioHash:null,cues:[{at:1,surface:'table',focus:['hero']}]}}};
  const project=newProject({scenes:[scene('chapter/a',{presentation}),scene('chapter/b',{presentation:structuredClone(presentation)})]},{locale:'zh-CN',sequence:[{id:'entry/a',sceneId:'chapter/a'},{id:'entry/b',sceneId:'chapter/b'}]});
  const {store,server,page}=await studio(t,project);
  await page.locator('[data-ui="presentation-cues"]').click();await page.locator('[data-cue-row] input[type="number"]').fill('2');
  await server.director.seek({beatId,entryId:'entry/b'});
  await page.waitForFunction(()=>document.querySelector('#scene-select')?.value==='chapter/b');
  await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r1'));
  const saved=(await store.read()).lesson.scenes;
  assert.deepEqual(saved[0].beats[0].presentation.cues['zh-CN'].cues,[{at:2,surface:'table',focus:['hero']}]);
  assert.deepEqual(saved[1].beats[0].presentation.cues['zh-CN'].cues,presentation.cues['zh-CN'].cues,'Moving the cursor must not retarget the open editor.');
});

test('readiness links locate the exact scene and repeated entry without parsing IDs',async t=>{
  const project=newProject({scenes:[scene('chapter/a'),scene('chapter/b',{narration:words('Needs an audio take.'),presentation:{surface:'table',focus:['seat:missing']}})]},{locale:'zh-CN',sequence:[{id:'entry/a',sceneId:'chapter/a'},{id:'entry/b',sceneId:'chapter/b'},{id:'repeat/b',sceneId:'chapter/b'}]});
  const {server,page}=await studio(t,project);
  for(const code of ['AUDIO_MISSING','PRESENTATION_TARGET'])for(const entryId of ['entry/b','repeat/b']){
    const snapshot=await (await fetch(server.url+'/api/snapshot')).json(),issues=snapshot.observation.readiness.issues;
    const index=issues.findIndex(issue=>issue.code===code&&issue.target?.entryId===entryId);
    assert.notEqual(index,-1,`${code} must identify its sequence entry.`);
    const target=issues[index].target,frame=snapshot.plan.frames.find(f=>f.sceneId===target.sceneId&&f.entryId===target.entryId&&f.beatId===target.beatId),link=page.locator('.issue-link').nth(index);
    assert.equal(await link.getAttribute('data-issue-frame'),frame.id);
    await link.evaluate(element=>{element.closest('details').open=true;});await link.click();
    await page.waitForFunction(id=>document.querySelector('.beat-chip.active')?.dataset.frame===id,frame.id);
    const observation=await server.director.observe();
    assert.deepEqual({sceneId:observation.sceneId,entryId:observation.entryId,beatId:observation.beat},{sceneId:'chapter/b',entryId,beatId});
  }
});

test('studio export readiness uses the player view while director state stays available',async t=>{
  const project=newProject({scenes:[scene('hidden/cards',{presentation:{surface:'table',focus:['card:Ks']}})]},{locale:'zh-CN'});
  const {server,page}=await studio(t,project),snapshot=await (await fetch(server.url+'/api/snapshot')).json();
  assert.deepEqual(snapshot.observation.state.seats.find(seat=>seat.id==='bb').hole,['Ks','Jh'],'Authoring observation keeps director visibility.');
  assert.deepEqual(snapshot.plan.frames[0].state.seats.find(seat=>seat.id==='bb').hole,[null,null]);
  assert.ok(snapshot.plan.issues.some(issue=>issue.code==='PRESENTATION_TARGET'));
  assert.deepEqual(snapshot.observation.readiness,{ready:false,issues:snapshot.plan.issues});
  assert.equal(await page.locator('[data-ui="render"]').isDisabled(),true,'The UI must not offer export for a focus target absent from the final player view.');
});
