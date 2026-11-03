import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createProject,newProject} from '../src/project/store.mjs';
import {confirmAnalysis} from '../src/analysis/index.mjs';
import {serve} from '../src/server.mjs';
import {temp,words} from './helpers.mjs';

function teachingBranch(){
  const scene={
    id:'river',title:words('Price on an alternative route'),
    start:{street:'river',board:['Qd','7c','2s','Tc','4d'],button:'hero',hero:'hero',actor:'villain',seats:[
      {id:'villain',name:'North',stack:95.45,contributed:4.55,hole:['Kc','Jh']},
      {id:'hero',name:'Hero',stack:95.45,contributed:4.55,hole:['Ah','Qh']}
    ]},
    beats:[{id:'start',label:words('Start'),hold:.5}],
    branches:[{id:'alternative',from:'start',label:words('Alternative'),beats:[
      {id:'offer',label:words('Bet'),actions:[{type:'bet',seat:'villain',to:6}]},
      {id:'think',label:words('Analysis'),hold:2,presentation:{surface:'analysis',analysisId:'price'}},
      {id:'return',label:words('Return'),hold:1,presentation:{surface:'table'}}
    ]}]
  };
  scene.analysis=[confirmAnalysis(scene,{id:'price',node:{beatId:'offer'},title:words('Price is not equity'),calculation:'potOdds'})];
  return scene;
}

async function studio(t){
  const store=await createProject(join(await temp(t),'project'),newProject({scenes:[teachingBranch()]},{locale:'en-US',branchId:'alternative'}));
  const server=await serve(store.directory,{port:0});
  let browser;
  t.after(async()=>{await browser?.close();await server.close();});
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  return {store,server,page,errors};
}

test('continuing a teaching branch preserves its analysis and the original route',async t=>{
  const {store,server,page,errors}=await studio(t),before=await store.read(),source=before.lesson.scenes[0];
  assert.equal((await server.director.observe()).readiness.ready,true);
  await page.goto(server.url);await page.waitForSelector('#scene-select');
  await page.locator('[data-frame="return"]').click();await page.waitForSelector('[data-frame="return"].active');
  await page.locator('#stage [data-act="call"]').click();
  await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r1'));

  const saved=await store.read(),scene=saved.lesson.scenes[0],fork=scene.branches.find(branch=>branch.id===saved.output.branchId);
  assert.notEqual(fork.id,'alternative');
  assert.deepEqual(scene.branches.find(branch=>branch.id==='alternative'),source.branches[0]);
  assert.deepEqual(scene.analysis.find(item=>item.id==='price'),source.analysis[0]);
  assert.deepEqual(fork.beats.at(-1).actions,[{seat:'hero',type:'call'}]);
  const plan=await server.director.export({kind:'plan'});
  assert.deepEqual(plan.issues,[],'Copying a reviewed prefix must keep its material on the new route.');
  const teaching=plan.frames.find(frame=>frame.presentation?.surface==='analysis'),analysis=teaching.presentation.analysis;
  assert.equal(analysis.status,'current');
  assert.notEqual(analysis.id,'price');
  assert.ok(fork.beats.some(beat=>beat.id===analysis.node.beatId));
  assert.equal(analysis.decision.pot,15.1);
  assert.equal(plan.frames.at(-1).state.pot,21.1,'Continuing the route executes the new call exactly once.');
  assert.equal((await server.director.observe()).readiness.ready,true);
  await page.locator(`[data-frame="${teaching.id}"]`).click();
  await page.waitForSelector('#stage [data-teaching-surface="analysis"]');
  assert.equal(await page.locator('[data-ui="render"]').isEnabled(),true);
  assert.deepEqual(errors,[]);
});

test('a new blank scene does not inherit analysis nodes or variant review from the current scene',async t=>{
  const {store,server,page,errors}=await studio(t);
  await server.director.apply({requestId:'reviewed-variant',expectedRevision:0,commands:[
    {type:'scene.variant',sourceSceneId:'river',value:{id:'larger',title:words('Larger bet'),change:{beatId:'offer',actionIndex:0,action:{type:'bet',seat:'villain',to:9.1}}}},
    {type:'analysis.confirm',sceneId:'larger',analysisId:'price'},
    {type:'scene.review',sceneId:'larger'},
    {type:'output.set',value:{sceneId:'larger',branchId:'alternative'}}
  ]});
  assert.equal((await server.director.observe()).readiness.ready,true);
  const before=await store.read(),source=before.lesson.scenes.find(scene=>scene.id==='larger');
  await page.goto(server.url);await page.waitForSelector('#scene-select');
  await page.locator('[data-ui="new-scene"]').click();
  const editor=page.locator('.modal textarea'),draft=JSON.parse(await editor.inputValue());
  draft.id='blank';await editor.fill(JSON.stringify(draft));
  await page.locator('[data-save]').click();
  await page.waitForFunction(()=>document.querySelector('#scene-select')?.value==='blank');

  const saved=await store.read(),blank=saved.lesson.scenes.find(scene=>scene.id==='blank');
  assert.equal(Object.hasOwn(blank,'analysis'),false,'A blank trajectory cannot retain nodes from the removed beats.');
  assert.equal(Object.hasOwn(blank,'variant'),false,'A fresh scene is not an unreviewed copy of the previous condition change.');
  assert.deepEqual(blank.start,source.start);
  assert.deepEqual(saved.lesson.scenes.find(scene=>scene.id==='larger'),source);
  assert.deepEqual((await server.director.export({kind:'plan'})).issues,[]);
  assert.equal((await server.director.observe()).readiness.ready,true);
  assert.equal(await page.locator('[data-ui="render"]').isEnabled(),true);
  assert.deepEqual(errors,[]);
});
