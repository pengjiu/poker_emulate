import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {temp,words,packs} from './helpers.mjs';
import {createProject,newProject} from '../src/project/store.mjs';
import {serve} from '../src/server.mjs';
import {compileProject} from '../src/compiler.mjs';
import {Director} from '../src/director.mjs';
import {practiceIssues} from '../src/project/practice.mjs';
import {resolveSessionObservations} from '../src/project/session.mjs';

function lesson(){return {scenes:[{id:'finished',title:words('Completed hand'),start:{street:'river',board:['2c','5d','8h','9s','Jc'],button:'hero',hero:'hero',actor:'other',seats:[{id:'hero',name:'North',stack:95,contributed:5,hole:['Ah','Ad']},{id:'other',name:'Harbor',stack:95,contributed:5,hole:['Kh','Kd']}]},beats:[{id:'checks',label:words('Check through'),actions:[{type:'check',seat:'other'},{type:'check',seat:'hero'}]},{id:'award',label:words('Award'),actions:[{type:'showdown'}]}]}]};}
test('director session and practice forms create a legal continuation and an answerable independent exercise',async t=>{
  let server,browser;t.after(async()=>{await browser?.close();await server?.close();});
  const dir=await temp(t),store=await createProject(join(dir,'project'),newProject(lesson()));server=await serve(store.directory,{port:0});browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.url);await page.waitForSelector('[data-ui="workflow-session"]',{state:'attached'});await page.locator('[data-ui="workflow-session"]').evaluate(b=>b.closest('details').open=true);await page.click('[data-ui="workflow-session"]');
  await page.fill('[data-work="id"]','next');await page.fill('[data-work="title"]','第二手');await page.fill('[data-hole-seat="hero"]','Ks Qs');await page.click('.modal-overlay [data-save]');await page.waitForFunction(()=>document.querySelector('#scene-select')?.value==='next');
  const p=await store.read(),s=p.lesson.scenes.find(s=>s.id==='next');assert.equal(p.lesson.session.hands.length,2);assert.equal(s.start.button,'other');assert.equal(s.start.seats.find(s=>s.id==='hero').stack,104);assert.equal(s.start.seats.find(s=>s.id==='other').stack,94.5);assert.equal(compileProject(p,packs).frames[0].state.pot,1.5);
  await page.locator('[data-ui="workflow-practice"]').evaluate(b=>b.closest('details').open=true);await page.click('[data-ui="workflow-practice"]');await page.fill('[data-work="prompt"]','这一手谁在按钮位？');await page.fill('[data-choice-row="call"] input[type="text"]','Harbor');await page.check('[data-choice-row="call"] input[type="checkbox"]');await page.fill('[data-work="explanation"]','按钮从上一手的 North 顺时针移动到 Harbor。');await page.click('.modal-overlay [data-save]');await page.waitForFunction(()=>document.querySelector('.status-dot')?.parentElement.textContent.includes('r2'));
  const exercise=await browser.newPage();await exercise.goto(server.url+'/practice');assert.ok((await exercise.locator('body').innerText()).includes('这一手谁在按钮位'));assert.ok(!(await exercise.locator('body').innerText()).includes('按钮从上一手的 North'));
  await page.locator('[data-ui="workflow-newHand"]').evaluate(b=>b.closest('details').open=true);await page.click('[data-ui="workflow-newHand"]');await page.fill('[data-work="id"]','six');await page.selectOption('[data-work="count"]','6');
  const stacks=()=>page.locator('[data-player] [data-work="stack"]').evaluateAll(nodes=>nodes.map(n=>Number(n.value)));
  assert.ok(new Set(await stacks()).size>1);assert.equal(await page.inputValue('[data-player="hero"] [data-work="stack"]'),'100');
  await page.click('[data-stacks="equal"]');assert.deepEqual(await stacks(),Array(6).fill(100));
  await page.fill('[data-player="hero"] [data-work="stack"]','87.4');await page.selectOption('[data-work="count"]','7');assert.equal(await page.inputValue('[data-player="hero"] [data-work="stack"]'),'87.4');
  await page.selectOption('[data-work="count"]','6');await page.click('[data-stacks="varied"]');await page.fill('[data-player="hero"] [data-work="cards"]','Ah Qh');await page.click('.modal-overlay [data-save]');await page.waitForFunction(()=>document.querySelector('#scene-select')?.value==='six');
  const created=(await store.read()).lesson.scenes.find(s=>s.id==='six');assert.equal(created.start.seats.length,6);assert.ok(new Set(created.start.seats.map(s=>s.stack+(s.contributed??0))).size>1);assert.equal(compileProject(await store.read(),packs).frames[0].state.pot,1.5);
  await page.locator('[data-ui="workflow-variant"]').evaluate(b=>b.closest('details').open=true);await page.click('[data-ui="workflow-variant"]');assert.deepEqual(await page.locator('[data-work="kind"] option').evaluateAll(nodes=>nodes.map(n=>n.value)),['hole','stack']);await page.selectOption('[data-work="kind"]','stack');await page.fill('[data-work="id"]','six-short');await page.fill('[data-work="amount"]','60');await page.click('.modal-overlay [data-save]');await page.waitForFunction(()=>document.querySelector('#scene-select')?.value==='six-short');assert.equal((await store.read()).lesson.scenes.find(s=>s.id==='six-short').start.seats.find(s=>s.id==='hero').stack,60);
  assert.deepEqual(errors,[]);
});
test('public commands preserve practice history while a question revision marks earlier attempts stale',async t=>{
  const dir=await temp(t),store=await createProject(join(dir,'project'),newProject(lesson())),d=await Director.open(store.directory),practice={id:'practice',title:words('Practice'),questions:[{id:'button',sceneId:'finished',node:{beatId:'checks'},prompt:words('Who is the button?'),choices:[{id:'hero',text:words('North')},{id:'other',text:words('Harbor')}],correctChoiceIds:['hero'],explanation:words('The current button is North.')}]};
  await d.apply({requestId:'question',expectedRevision:0,commands:[{type:'practice.set',value:practice},{type:'practice.answer',value:{questionId:'button',choiceIds:['hero']}}]});assert.equal((await d.export({kind:'practice-results'})).correct,1);
  const destination=join(dir,'practice.html');await d.export({kind:'practice',destination});await assert.rejects(()=>d.export({kind:'practice',destination}),{code:'DESTINATION_EXISTS'});
  practice.questions[0].prompt=words('Identify the current button before the next hand.');await d.apply({requestId:'revision',expectedRevision:1,commands:[{type:'practice.set',value:practice}]});const result=await d.export({kind:'practice-results'});assert.equal(result.attempts,1);assert.equal(result.current,0);assert.equal(result.stale,1);
});
test('language-specific rehearsal estimates do not replace an attached voice duration',async t=>{
  const p=newProject(lesson()),beat=p.lesson.scenes[0].beats[0];beat.narration=words('A reading-time example.');beat.hold=.2;beat.rehearsalDuration={'zh-CN':4,'en-US':8,'ja-JP':6};
  const durations=Object.keys(beat.rehearsalDuration).map(locale=>compileProject(p,packs,{output:{locale}}).frames.find(f=>f.narration).narrationDuration);assert.deepEqual(durations,[4,8,6]);
  const {hash}=await import('../src/util.mjs'),assetId='a'.repeat(64);p.assets[assetId]={path:'assets/'+assetId+'.wav',sha256:assetId,bytes:200,duration:2,mime:'audio/wav'};beat.audio={'zh-CN':{assetId,locale:'zh-CN',textHash:hash(beat.narration['zh-CN'])}};assert.equal(compileProject(p,packs).frames.find(f=>f.audio).narrationDuration,2);
});

test('editing one practice item and adding one observation leave other stale content unconfirmed',async t=>{
  const dir=await temp(t),store=await createProject(join(dir,'project'),newProject(lesson())),d=await Director.open(store.directory);
  const question={id:'one',sceneId:'finished',node:{beatId:'checks'},prompt:words('First question'),choices:[{id:'hero',text:words('North')},{id:'other',text:words('Harbor')}],correctChoiceIds:['hero'],explanation:words('Original explanation')};
  const practice={id:'practice',title:words('Practice'),questions:[question,{...structuredClone(question),id:'two',prompt:words('Second question')}]};
  await d.apply({requestId:'prepare',expectedRevision:0,commands:[{type:'practice.set',value:practice},{type:'session.set',value:{id:'session',title:words('Session'),hands:[{sceneId:'finished'}],observations:[{id:'old',sceneId:'finished',beatId:'checks',actionIndex:0,seatId:'other',kind:'observed',text:words('Original blind interpretation')} ]}}]});
  const s=(await store.read()).lesson.scenes[0];s.start.bigBlind=3;s.start.smallBlind=1;s.start.unit='chips';
  await d.apply({requestId:'changed-level',expectedRevision:1,commands:[{type:'scene.put',value:s}]});
  let server,browser;t.after(async()=>{await browser?.close();await server?.close();});server=await serve(store.directory,{port:0});browser=await chromium.launch();const page=await browser.newPage();await page.goto(server.url);
  await page.locator('[data-ui="workflow-practice"]').evaluate(b=>b.closest('details').open=true);await page.click('[data-ui="workflow-practice"]');await page.selectOption('[data-work="question"]','one');await page.fill('[data-work="explanation"]','Reviewed only the first question.');await page.click('.modal-overlay [data-save]');await page.waitForSelector('.modal-overlay',{state:'detached'});
  assert.ok(practiceIssues(await store.read()).some(i=>i.code==='PRACTICE_STALE'&&i.path==='practice/two'));
  await page.locator('[data-ui="workflow-observation"]').evaluate(b=>b.closest('details').open=true);await page.click('[data-ui="workflow-observation"]');await page.fill('[data-work="note"]','A new observation under the new level.');await page.click('.modal-overlay [data-save]');await page.waitForSelector('.modal-overlay',{state:'detached'});
  const notes=resolveSessionObservations(await store.read());assert.equal(notes[0].current,false);assert.equal(notes[1].current,true);
  await page.locator('[data-ui="workflow-session"]').evaluate(b=>b.closest('details').open=true);await page.click('[data-ui="workflow-session"]');assert.equal(await page.inputValue('[data-work="smallBlind"]'),'1');assert.equal(await page.inputValue('[data-work="bigBlind"]'),'3');
});
