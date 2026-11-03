import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {continueSession,sessionIssues,reviewSession,resolveSessionObservations} from '../src/project/session.mjs';
import {createVariant,variantIssues} from '../src/project/variants.mjs';
import {answerPractice,practiceSummary,practiceIssues,practiceHTML,reviewPractice} from '../src/project/practice.mjs';
import {loadState,bankroll,createHand} from '../src/poker/rules.mjs';
import {newProject,createProject} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {compileProject} from '../src/compiler.mjs';
import {localePacks} from '../src/locales.mjs';

const words=text=>({'zh-CN':text,'en-US':text,'ja-JP':text});
function fixture(){
  const scene={id:'hand-1',title:words('River decision'),start:{street:'river',board:['2c','3d','4h','5s','9c'],button:'a',hero:'a',actor:'b',seats:[{id:'a',name:'Alice',avatar:'A',stack:90,contributed:10,hole:['As','Ad']},{id:'b',name:'Bob',avatar:'B',stack:90,contributed:10,hole:['Ks','Kd']}]},beats:[{id:'bet',label:words('Bet'),actions:[{seat:'b',type:'bet',to:10}]},{id:'decision',label:words('Decision')},{id:'call',label:words('Call'),actions:[{seat:'a',type:'call'},{type:'showdown'}]}]};
  return {lesson:{scenes:[scene]},output:{locale:'zh-CN'}};
}
function withPractice(){const p=fixture();p.lesson.practice={id:'practice',title:words('Price exercise'),questions:[{id:'q1',sceneId:'hand-1',node:{beatId:'decision'},prompt:words('Your choice?'),choices:[{id:'call',text:words('Call')},{id:'fold',text:words('Fold')}],correctChoiceIds:['call'],explanation:words('Given the stated value/bluff assumption, call.'),objective:words('Use the stated range')}],attempts:[]};return p;}
test('A new session hand carries real settlement, player identity, clockwise button and explicit deposits',()=>{
  const p=fixture(),next=continueSession(p,{sourceSceneId:'hand-1',id:'hand-2',title:words('Next'),holes:{a:['Jh','Jd']},adjustments:[{seatId:'b',amount:20,reason:'Documented reload'}],level:{bigBlind:2,smallBlind:1,unit:'chips'}});
  p.lesson.scenes.push(next.scene);p.lesson.session=next.session;
  assert.equal(next.scene.start.button,'b');assert.equal(next.scene.start.actor,'b');assert.deepEqual(next.scene.start.seats.map(s=>[s.id,s.name,s.avatar,s.stack,s.streetBet,s.hole]),[['a','Alice','A',118,2,['Jh','Jd']],['b','Bob','B',99,1,[]]]);
  assert.equal(bankroll(loadState(next.scene.start)),22000);assert.deepEqual(sessionIssues(p),[]);
  p.lesson.scenes[0].beats[0].actions[0].to=11;assert.ok(sessionIssues(p).some(i=>i.code==='SESSION_STALE'));
});
test('Session continuation rejects unsettled money, invalid withdrawals, collisions and incorrect lineage',()=>{
  const p=fixture(),source=p.lesson.scenes[0];source.beats.pop();assert.throws(()=>continueSession(p,{sourceSceneId:source.id,id:'next',title:words('Next')}),e=>e.code==='SESSION_UNSETTLED');
  const q=fixture();assert.throws(()=>continueSession(q,{sourceSceneId:'hand-1',id:'next',title:words('Next'),adjustments:[{seatId:'b',amount:-81,reason:'Withdraw'}]}),e=>e.code==='SESSION_STACK');
  assert.throws(()=>continueSession(q,{sourceSceneId:'hand-1',id:'next',title:words('Next'),holes:{a:['As','Ad'],b:['As','Ks']}}),e=>e.code==='CARD_DUPLICATE');
  const next=continueSession(q,{sourceSceneId:'hand-1',id:'next',title:words('Next')});q.lesson.scenes.push(next.scene);q.lesson.session=next.session;next.scene.start.seats[0].stack+=1;assert.ok(sessionIssues(q).some(i=>i.code==='SESSION_STALE'));
});
test('Tournament dead-button progression preserves empty seats and avoids a repeated BB when entering heads-up',()=>{
  const p=fixture(),source=p.lesson.scenes[0];source.start={street:'river',board:['2c','3d','4h','5s','9c'],button:'a',hero:'d',actor:null,roundClosed:true,unit:'chips',blindSeats:{smallBlindSeat:'b',bigBlindSeat:'c'},seats:[{id:'a',stack:90,contributed:10,hole:['As','Ad']},{id:'b',stack:0,contributed:10,hole:['Kh','Kd']},{id:'c',stack:90,contributed:10,hole:['Qh','Qd']},{id:'d',stack:90,contributed:10,hole:['Jh','Jd']}]};source.beats=[{id:'show',label:words('Showdown'),actions:[{type:'showdown'}]}];
  const next=continueSession(p,{sourceSceneId:source.id,id:'next',title:words('Dead button')});assert.equal(next.scene.start.button,'b');assert.deepEqual(next.scene.start.blindSeats,{smallBlindSeat:'c',bigBlindSeat:'d'});assert.equal(next.scene.start.seats.find(s=>s.id==='b').folded,true);assert.equal(next.scene.start.seats.length,4);
  const q=fixture(),three=q.lesson.scenes[0];three.start={...source.start,hero:'b',seats:[{id:'a',stack:0,contributed:10,hole:['Kh','Kd']},{id:'b',stack:90,contributed:10,hole:['As','Ad']},{id:'c',stack:90,contributed:10,hole:['Qh','Qd']}]};three.beats=structuredClone(source.beats);
  const hu=continueSession(q,{sourceSceneId:three.id,id:'hu',title:words('Heads up')});assert.equal(hu.scene.start.button,'c');assert.deepEqual(hu.scene.start.blindSeats,{smallBlindSeat:'c',bigBlindSeat:'b'});assert.equal(hu.scene.start.actor,'c');
});
test('A joining player can replace an eliminated BB at a full table while the physical blind sequence stays intact',()=>{
  const p=fixture(),source=p.lesson.scenes[0],ids=['a','b','c','d','e','f','g','h','i'],ranks=['A','K','Q','J','T','9','8','7','6'];
  source.start={street:'river',board:['2c','3d','4h','5s','9c'],button:'a',hero:'d',actor:null,roundClosed:true,bigBlind:2,unit:'chips',blindSeats:{smallBlindSeat:'b',bigBlindSeat:'c'},seats:ids.map((id,i)=>({id,stack:id==='c'?0:90,contributed:10,hole:[ranks[i]+'s',ranks[i]+'d']}))};source.beats=[{id:'show',label:words('Showdown'),actions:[{type:'showdown'}]}];
  const next=continueSession(p,{sourceSceneId:source.id,id:'next',title:words('Replacement'),adjustments:[{join:{id:'new-player',stack:100},reason:'New participant takes the vacant physical slot'}],level:{bigBlind:2,smallBlind:1,unit:'chips'}});
  assert.deepEqual(next.scene.start.seats.map(s=>s.id),['a','b','new-player','d','e','f','g','h','i']);assert.equal(next.scene.start.button,'b');assert.deepEqual(next.scene.start.blindSeats,{smallBlindSeat:'new-player',bigBlindSeat:'d'});assert.equal(next.scene.start.actor,'e');assert.equal(bankroll(loadState(next.scene.start)),91000);
  p.lesson.scenes.push(next.scene);p.lesson.session=next.session;assert.deepEqual(sessionIssues(p),[]);
});
test('Opponent notes bind an actual public action, remain distinguishable from inference and go stale',()=>{
  const p=fixture();p.lesson.session=reviewSession(p,{id:'s',title:words('Session'),hands:[{sceneId:'hand-1'}],observations:[{id:'note',sceneId:'hand-1',beatId:'bet',actionIndex:0,seatId:'b',kind:'inference',text:words('This size may polarize the range')}]});
  const [note]=resolveSessionObservations(p);assert.equal(note.current,true);assert.equal(note.kind,'inference');assert.deepEqual(note.publicState.seats.find(s=>s.id==='b').hole,[null,null]);assert.deepEqual(note.action,{seat:'b',type:'bet',to:10});
  p.lesson.scenes[0].beats[0].actions[0].to=11;assert.ok(sessionIssues(p).some(i=>i.code==='SESSION_OBSERVATION_STALE'));
  const q=fixture();assert.throws(()=>reviewSession(q,{id:'s',title:words('Session'),hands:[{sceneId:'hand-1'}],observations:[{id:'bad',sceneId:'hand-1',beatId:'bet',actionIndex:0,seatId:'a',kind:'observed',text:words('Wrong player')}]}),e=>e.code==='SESSION_OBSERVATION');
});
test('Public session export uses one fixed denomination across non-unit blinds, antes, stacks and legal actions',async t=>{
  const p=fixture(),scene=p.lesson.scenes[0];
  scene.start=createHand({seats:[{id:'a',stack:20,hole:['As','Ad']},{id:'b',stack:20,hole:['Kh','Kd']},{id:'c',stack:20,hole:[]}],button:'a',hero:'a',bigBlind:2,smallBlind:1,bigBlindAnte:2,unit:'chips'});
  scene.beats=[{id:'raise',label:words('Raise'),actions:[{seat:'a',type:'raise',to:6}]}];
  const dir=await mkdtemp(join(tmpdir(),'river-session-units-'));t.after(()=>rm(dir,{recursive:true,force:true}));const directory=join(dir,'project');await createProject(directory,newProject(p.lesson));const director=await Director.open(directory);
  await director.apply({requestId:'bind-history',expectedRevision:0,commands:[{type:'session.set',value:{id:'s',title:words('History'),hands:[{sceneId:scene.id}],observations:[{id:'raise-note',sceneId:scene.id,beatId:'raise',actionIndex:0,seatId:'a',kind:'observed',text:words('Raised to six chips')}]} }]});
  const original=await director.export(),[note]=await director.export({kind:'session'}),s=note.publicState;
  assert.equal(note.current,true);assert.equal(note.unit,'chips');assert.equal(s.unit,'chips');assert.equal(s.bigBlind,2);assert.equal(s.lastFullRaise,4);assert.equal(s.pot,11);assert.equal(s.bankroll,60);assert.equal(s.deadPot,2);assert.deepEqual(s.antePaid,{c:2});assert.deepEqual(s.actedAt,{a:6});
  assert.deepEqual(s.seats.map(p=>[p.stack,p.contributed,p.streetBet]),[[14,6,6],[19,1,1],[16,2,2]]);assert.equal(s.pots.reduce((total,pot)=>total+pot.amount,0),11);assert.deepEqual(s.seats[0].action,{type:'raise',to:6,amount:6});
  assert.equal(note.action.to,6);assert.equal(s.lastEvent.to,6);assert.equal(s.legalActions.find(a=>a.type==='call').amount,5);assert.equal(s.legalActions.find(a=>a.type==='raise').minTo,10);assert.deepEqual(s.seats[1].hole,[null,null]);
  assert.equal(note.sourceHash,original.lesson.session.observations[0].sourceHash);assert.deepEqual((await director.export()).lesson,original.lesson);
  const plan=await director.export({kind:'plan'});assert.deepEqual(plan.frames[0].state.seats.map(p=>p.stack),s.seats.map(p=>p.stack));assert.equal(plan.frames[0].state.pot,s.pot);
});
test('Session observations require the played route, reject fictional branch actions atomically and retain shared-prefix facts',async t=>{
  const scene={id:'source',title:words('Source hand'),start:{street:'river',board:['2c','5d','8h','9s','Jc'],button:'hero',hero:'hero',actor:'hero',seats:[{id:'hero',stack:95,contributed:5,hole:['As','Ad']},{id:'other',stack:95,contributed:5,hole:['Ks','Kd']}]},beats:[{id:'bet',label:words('Bet'),view:{reveal:['other']},actions:[{seat:'hero',type:'bet',to:2}]},{id:'fold',label:words('Fold'),actions:[{seat:'other',type:'fold'}]}],branches:[{id:'called',from:'bet',label:words('Counterfactual call'),beats:[{id:'altcall',label:words('Call'),actions:[{seat:'other',type:'call'}]},{id:'show',label:words('Showdown'),actions:[{type:'showdown'}]}]}]};
  const p=newProject({scenes:[scene]}),next=continueSession(p,{sourceSceneId:scene.id,id:'next',title:words('Next hand')});p.lesson.scenes.push(next.scene);p.lesson.session=next.session;
  const prefix={id:'prefix',sceneId:scene.id,branchId:'called',beatId:'bet',actionIndex:0,seatId:'hero',kind:'observed',text:words('Hero bet two')},fiction={id:'fiction',sceneId:scene.id,branchId:'called',beatId:'altcall',actionIndex:0,seatId:'other',kind:'observed',text:words('Other called')};
  const reviewed=reviewSession(p,{...next.session,observations:[prefix]});assert.equal(reviewed.observations[0].branchId,null);
  const dir=await mkdtemp(join(tmpdir(),'river-session-route-'));t.after(()=>rm(dir,{recursive:true,force:true}));const directory=join(dir,'project');await createProject(directory,p);const director=await Director.open(directory),before=await director.export();
  await assert.rejects(director.apply({requestId:'fictional-history',expectedRevision:0,commands:[{type:'session.set',value:{...next.session,observations:[prefix,fiction]}}]}),e=>e.code==='SESSION_OBSERVATION_ROUTE');assert.deepEqual(await director.export(),before);
  p.lesson.session={...reviewed,observations:[...reviewed.observations,{...fiction,sourceHash:'f'.repeat(64)}]};
  assert.ok(sessionIssues(p).some(i=>i.code==='SESSION_OBSERVATION_ROUTE'));const notes=resolveSessionObservations(p);assert.equal(notes[0].current,true);assert.deepEqual(notes[0].publicState.seats.find(s=>s.id==='other').hole,['Ks','Kd']);assert.equal(notes[1].current,false);assert.equal(notes[1].issue.code,'SESSION_OBSERVATION_ROUTE');
  const packs=await localePacks(),plan=compileProject(p,packs,{output:{sceneId:'next'}});assert.ok(plan.issues.some(i=>i.code==='SESSION_OBSERVATION_ROUTE'));assert.deepEqual(plan.frames[0].history.map(n=>n.id),['prefix']);
  const branchProject=newProject({scenes:[structuredClone(scene)]}),branchNext=continueSession(branchProject,{sourceSceneId:scene.id,sourceBranchId:'called',id:'next',title:words('Actual called hand')});branchProject.lesson.scenes.push(branchNext.scene);branchProject.lesson.session=reviewSession(branchProject,{...branchNext.session,observations:[{...prefix,branchId:null}]});assert.equal(resolveSessionObservations(branchProject)[0].current,true);assert.equal(branchProject.lesson.session.observations[0].branchId,'called');
  const staleProject=newProject({scenes:[structuredClone(scene)]});staleProject.lesson.scenes[0].beats[0].actions[0].to=3;const rebuilt=continueSession(staleProject,{sourceSceneId:scene.id,id:'next',title:words('Regenerated stacks')});staleProject.lesson.scenes.push(rebuilt.scene);staleProject.lesson.session={...rebuilt.session,observations:reviewed.observations};
  const stale=compileProject(staleProject,packs,{output:{sceneId:'next'}});assert.ok(stale.issues.some(i=>i.code==='SESSION_OBSERVATION_STALE'));assert.deepEqual(stale.frames[0].history,[]);
});
test('Scene creation rejects unknown setup and seat fields before committing any partial project change',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'river-setup-strict-'));t.after(()=>rm(dir,{recursive:true,force:true}));const directory=join(dir,'project');await createProject(directory,newProject(fixture().lesson));const director=await Director.open(directory),before=await director.export();
  const setup={seats:[{id:'a',stack:20},{id:'b',stack:20}],button:'a'};
  for(const [index,bad]of [{...setup,bigblind:2},{...setup,seats:[{...setup.seats[0],hloe:['As','Ad']},setup.seats[1]]}].entries()){
    await assert.rejects(director.apply({requestId:`typo-${index}`,expectedRevision:0,commands:[{type:'scene.create',value:{id:'created',title:words('New hand'),setup:bad}}]}),e=>e.code==='UNKNOWN_FIELD');assert.deepEqual(await director.export(),before);
  }
  await director.apply({requestId:'valid-setup',expectedRevision:0,commands:[{type:'scene.create',value:{id:'created',title:words('New hand'),setup:{...setup,bigBlind:2,smallBlind:1}}}]});const created=(await director.export()).lesson.scenes.find(s=>s.id==='created');assert.equal(created.start.bigBlind,2);assert.equal(created.start.unit,'chips');
});
test('Single-variable changes replay board, holdings, stacks and actions and reject future conflicts',()=>{
  const p=fixture(),source=p.lesson.scenes[0],original=structuredClone(source);
  for(const change of [{kind:'board',cardIndex:0,card:'2d'},{kind:'hole',seatId:'a',cards:['Ah','Ac']},{kind:'stack',seatId:'a',stack:80},{beatId:'bet',actionIndex:0,action:{seat:'b',type:'bet',to:15}}]){
    const variant=createVariant(source,{id:'variant',title:words('Changed condition'),change});assert.equal(variant.variant.reviewHash,null);assert.equal(variant.variant.sourceHashKind,'poker');assert.deepEqual(source,original);p.lesson.scenes=[source,variant];assert.deepEqual(variantIssues(p),[]);
  }
  assert.throws(()=>createVariant(source,{id:'bad',title:words('Conflict'),change:{kind:'board',cardIndex:0,card:'As'}}),e=>e.code==='CARD_DUPLICATE');
  const turn=structuredClone(source);turn.start.street='turn';turn.start.board.pop();turn.beats=[{id:'check',label:words('Checks'),actions:[{seat:'b',type:'check'},{seat:'a',type:'check'}]},{id:'river',label:words('River'),actions:[{type:'deal',cards:['9c']}]}];
  assert.throws(()=>createVariant(turn,{id:'bad',title:words('Future conflict'),change:{kind:'hole',seatId:'a',cards:['9c','Ad']}}),e=>e.code==='CARD_DUPLICATE');
  const variant=createVariant(turn,{id:'good',title:words('Different river'),change:{kind:'board',beatId:'river',actionIndex:0,cardIndex:0,card:'Tc'}});assert.equal(variant.beats[1].actions[0].cards[0],'Tc');
});
test('Practice records a real choice against its decision and answer version without claiming mastery',()=>{
  const p=withPractice();p.lesson.practice=reviewPractice(p,p.lesson.practice);assert.deepEqual(practiceIssues(p),[]);const record=answerPractice(p,{questionId:'q1',choiceIds:['call'],learnerId:'viewer',answeredAt:'2026-11-02T12:00:00Z'});p.lesson.practice.attempts.push(record);
  assert.equal(record.correct,true);assert.equal(practiceSummary(p).current,1);assert.equal(practiceSummary(p).correct,1);
  p.lesson.practice.questions[0].correctChoiceIds=['fold'];assert.equal(practiceSummary(p).stale,1);assert.equal(practiceSummary(p).current,0);
  assert.throws(()=>answerPractice(p,{questionId:'q1',choiceIds:['raise']}),e=>e.code==='PRACTICE_CHOICE');
});
test('Portable practice hides feedback until answering, survives reopen and renders authored text safely',async t=>{
  const p=withPractice();p.lesson.practice.questions[0].prompt=words('</script><img src=x onerror="window.injected=true"> Which action?');
  p.lesson.practice=reviewPractice(p,p.lesson.practice);
  const dir=await mkdtemp(join(tmpdir(),'river-practice-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'practice.html');await writeFile(path,practiceHTML(p,'zh-CN'));
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(pathToFileURL(path).href);
  assert.equal(await page.locator('#feedback').isVisible(),false);assert.equal(await page.locator('#explanation').textContent(),'');assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  const context=await page.locator('#context').textContent();assert.match(context,/河牌/);assert.doesNotMatch(context,/river/);assert.match(context,/底池: 30 BB/);assert.match(context,/跟注额: 10 BB/);assert.match(context,/当前行动者: Alice/);
  await page.locator('input[value=call]').check();await page.locator('#submit').click();assert.equal(await page.locator('#feedback').isVisible(),true);assert.equal(await page.locator('#result').textContent(),'回答正确');assert.equal(await page.locator('.history-row').count(),1);
  await page.reload();assert.equal(await page.locator('.history-row').count(),1);assert.equal(await page.locator('#feedback').isVisible(),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
