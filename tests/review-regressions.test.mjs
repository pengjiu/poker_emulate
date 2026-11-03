import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {words,packs,temp} from './helpers.mjs';
import {newProject,createProject} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {practiceHTML,practiceIssues,practiceSummary,reviewPractice,answerPractice} from '../src/project/practice.mjs';
import {createVariant} from '../src/project/variants.mjs';
import {createHand,loadState,observe,displayState} from '../src/poker/rules.mjs';
import {continueSession,sessionIssues,reviewSession,resolveSessionObservations} from '../src/project/session.mjs';
import {compileProject} from '../src/compiler.mjs';
import {renderFrame} from '../src/client/render.mjs';
import {compileMetrics,equityAgainstRange} from '../src/analysis/metrics.mjs';

function decisionLesson(withAnalysis=true){
  const scene={id:'river',title:words('Decision'),start:{street:'river',board:['2c','3d','4h','8s','9c'],button:'hero',hero:'hero',actor:'other',seats:[{id:'hero',stack:90,contributed:10,hole:['As','Ad']},{id:'other',stack:90,contributed:10,hole:['Ks','Kd']}]},beats:[{id:'bet',label:words('Bet'),actions:[{seat:'other',type:'bet',to:10}]},{id:'decision',label:words('Decision')}]};
  if(withAnalysis)scene.analysis=[{id:'price',node:{beatId:'decision'},title:words('Price'),calculation:'potOdds'}];
  const practice={id:'price',title:words('Exercise'),questions:[{id:'price',sceneId:scene.id,node:{beatId:'decision'},...(withAnalysis?{analysisId:'price'}:{}),prompt:words('Required equity?'),choices:[{id:'25',text:words('25%')},{id:'33',text:words('33.33%')}],correctChoiceIds:['25'],explanation:words('Call 10 to contest 40.')} ]};
  return {scenes:[scene],practice};
}

test('changed decision facts require explicit question review before grading or practice export, with or without analysis',async t=>{
  const dir=await temp(t);
  for(const withAnalysis of [true,false]){
    const lesson=decisionLesson(withAnalysis),store=await createProject(join(dir,String(withAnalysis)),newProject(lesson)),d=await Director.open(store.directory);
    const apply=async commands=>d.apply({requestId:crypto.randomUUID(),expectedRevision:(await store.read()).revision,commands});
    await assert.rejects(()=>d.export({kind:'practice'}),{code:'PRACTICE_UNREVIEWED'});
    await apply([...(withAnalysis?[{type:'analysis.confirm',analysisId:'price'}]:[]),{type:'practice.set',value:lesson.practice}]);
    await apply([{type:'practice.answer',value:{questionId:'price',choiceIds:['25']}}]);
    assert.equal(practiceSummary(await store.read()).correct,1);
    const changed=(await store.read()).lesson.scenes[0];changed.beats[0].actions[0].to=20;
    await apply([{type:'scene.put',value:changed}]);const stale=await store.read();
    assert.ok(practiceIssues(stale).some(i=>i.code==='PRACTICE_STALE'));
    assert.throws(()=>practiceHTML(stale),{code:'PRACTICE_STALE'});
    await assert.rejects(()=>d.export({kind:'practice'}),{code:'PRACTICE_STALE'});
    await assert.rejects(()=>apply([{type:'practice.answer',value:{questionId:'price',choiceIds:['25']}}]),{code:'PRACTICE_STALE'});
    assert.equal(practiceSummary(stale).stale,1);assert.equal(practiceSummary(stale).current,0);
    if(withAnalysis){await apply([{type:'analysis.confirm',analysisId:'price'}]);await assert.rejects(()=>d.export({kind:'practice'}),{code:'PRACTICE_STALE'});}
    const revised=(await store.read()).lesson.practice;revised.questions[0].correctChoiceIds=['33'];revised.questions[0].explanation=words('Call 20 to contest 60.');
    await apply([{type:'practice.set',value:revised},{type:'practice.answer',value:{questionId:'price',choiceIds:['33']}}]);
    assert.equal(practiceSummary(await store.read()).correct,1);assert.equal(practiceSummary(await store.read()).stale,1);
    assert.match((await d.export({kind:'practice'})).html,/Call 20 to contest 60/);
  }
});

test('practice uses current analysis and checks the actual evidence bytes at export and answer boundaries',async t=>{
  const dir=await temp(t),lesson=decisionLesson(),item=lesson.scenes[0].analysis[0];
  item.evidence={kind:'derivation',source:'evidence/proof.json',model:words('Explicit derivation')};
  const store=await createProject(join(dir,'project'),newProject(lesson)),d=await Director.open(store.directory);
  const apply=async commands=>d.apply({requestId:crypto.randomUUID(),expectedRevision:(await store.read()).revision,commands});
  await writeFile(join(store.directory,'evidence/proof.json'),'{}');
  await apply([{type:'practice.set',value:lesson.practice}]);
  await assert.rejects(()=>d.export({kind:'practice'}),{code:'ANALYSIS_UNREVIEWED'});
  await apply([{type:'analysis.confirm',analysisId:'price'}]);
  await d.export({kind:'practice'});
  await writeFile(join(store.directory,'evidence/proof.json'),'{"changed":true}');
  await assert.rejects(()=>d.export({kind:'practice'}),{code:'EVIDENCE_CHANGED'});
  await assert.rejects(()=>apply([{type:'practice.answer',value:{questionId:'price',choiceIds:['25']}}]),{code:'EVIDENCE_CHANGED'});
  assert.equal(practiceSummary(await store.read()).attempts,0);
});

test('custom small blinds survive play, rendering and an implicit next session level',()=>{
  const start=createHand({seats:[{id:'hero',stack:100},{id:'other',stack:100}],button:'hero',bigBlind:3,smallBlind:1});
  assert.equal(start.smallBlind,1);assert.equal(displayState(observe(loadState(start))).smallBlind,1);
  const scene={id:'first',title:words('1/3 game'),start,beats:[{id:'start',label:words('Start')},{id:'fold',label:words('Fold'),actions:[{seat:'hero',type:'fold'}]}]},p=newProject({scenes:[scene]});
  const plan=compileProject(p,packs);assert.match(renderFrame(plan,0),/1\.00 \/ 3\.00/);assert.doesNotMatch(renderFrame(plan,0),/1\.50 \/ 3\.00/);
  const next=continueSession(p,{sourceSceneId:'first',id:'next',title:words('Next')});
  assert.equal(next.scene.start.smallBlind,1);assert.equal(next.scene.continuity.level.smallBlind,1);
  assert.equal(next.scene.start.seats.find(s=>s.id===next.scene.start.blindSeats.smallBlindSeat).streetBet,1);
  p.lesson.scenes.push(next.scene);p.lesson.session=next.session;assert.deepEqual(sessionIssues(p),[]);
  assert.throws(()=>loadState({...start,smallBlind:4}),{code:'BLIND'});
  // Legacy half-blind starts retain their shape and remain readable.
  const legacy=createHand({seats:[{id:'hero',stack:100},{id:'other',stack:100}],button:'hero'});assert.equal(legacy.smallBlind,undefined);
});

test('a folded hero cannot receive live-pot SPR or equity for the two players still in the hand',()=>{
  const state=loadState({street:'river',board:['2c','3d','4h','8s','9c'],button:'hero',hero:'hero',actor:'b',seats:[{id:'hero',stack:90,contributed:10,folded:true,hole:['As','Ad']},{id:'b',stack:90,contributed:10,hole:['Ks','Kd']},{id:'c',stack:90,contributed:10,hole:['Qs','Qd']}]});
  const metrics=compileMetrics(state,{metrics:['spr','equity','outs','callEV'],range:{seat:'b',entries:[{hand:'KsKd',weight:1}]}});
  assert.ok(metrics.every(m=>!m.applicable&&m.value===null&&m.reason.includes('folded')));
  assert.equal(equityAgainstRange({hero:['As','Ad'],board:state.board,entries:[{hand:'KsKd',weight:1}]}).equity,1,'An explicitly requested hypothetical hand study remains available.');
});

test('session notes bind units, blind levels and rake without binding undisclosed opponent cards',()=>{
  const p=newProject(decisionLesson(false));delete p.lesson.practice;
  p.lesson.session=reviewSession(p,{id:'session',title:words('Session'),hands:[{sceneId:'river'}],observations:[{id:'bet',sceneId:'river',beatId:'bet',actionIndex:0,seatId:'other',kind:'observed',text:words('The opponent bet ten big blinds.')} ]});
  assert.equal(resolveSessionObservations(p)[0].current,true);
  const hidden=structuredClone(p);hidden.lesson.scenes[0].start.seats[1].hole=['Qs','Qd'];assert.equal(resolveSessionObservations(hidden)[0].current,true);
  for(const fields of [{unit:'chips',bigBlind:2},{smallBlind:.25},{rake:{rate:.05,cap:1,noFlopNoDrop:true}}]){
    const changed=structuredClone(p);Object.assign(changed.lesson.scenes[0].start,fields);
    assert.equal(resolveSessionObservations(changed)[0].current,false);
    assert.ok(sessionIssues(changed).some(i=>i.code==='SESSION_OBSERVATION_STALE'));
    changed.lesson.session=reviewSession(changed,changed.lesson.session);assert.equal(resolveSessionObservations(changed)[0].current,true);
  }
});

test('reviewing one item preserves other stale question and observation bindings',async t=>{
  const dir=await temp(t),lesson=decisionLesson(false),copy=structuredClone(lesson.practice.questions[0]);copy.id='second';lesson.practice.questions.push(copy);
  const store=await createProject(join(dir,'project'),newProject(lesson)),d=await Director.open(store.directory),apply=async commands=>d.apply({requestId:crypto.randomUUID(),expectedRevision:(await store.read()).revision,commands});
  const note={id:'old',sceneId:'river',beatId:'bet',actionIndex:0,seatId:'other',kind:'observed',text:words('Bet ten big blinds.')};
  await apply([{type:'practice.set',value:lesson.practice},{type:'session.set',value:{id:'session',title:words('Session'),hands:[{sceneId:'river'}],observations:[note]}}]);
  const original=await store.read(),changed=structuredClone(original.lesson.scenes[0]);changed.start.unit='chips';changed.start.bigBlind=2;
  await apply([{type:'scene.put',value:changed}]);
  const practice=(await store.read()).lesson.practice;practice.questions[0].explanation=words('Rechecked denomination.');
  const session=(await store.read()).lesson.session;session.observations.push({...note,id:'new',text:words('Ten chips, or five big blinds.')});
  await apply([{type:'practice.set',value:practice,reviewIds:['price']},{type:'session.set',value:session,reviewIds:['new']}]);
  const after=await store.read();
  assert.equal(after.lesson.practice.questions[1].review.questionHash,original.lesson.practice.questions[1].review.questionHash);
  assert.ok(practiceIssues(after).some(i=>i.code==='PRACTICE_STALE'&&i.path==='practice/second'));
  const notes=resolveSessionObservations(after);assert.equal(notes[0].current,false);assert.equal(notes[1].current,true);
});

test('practice checks stale session ancestors and variant sources without blocking independent questions',()=>{
  const p=newProject(decisionLesson(false));delete p.lesson.practice;
  p.lesson.scenes[0].beats.push({id:'finish',label:words('Finish'),actions:[{seat:'hero',type:'call'},{type:'showdown'}]});
  const next=continueSession(p,{sourceSceneId:'river',id:'next',title:words('Next')});p.lesson.scenes.push(next.scene);p.lesson.session=next.session;
  const question={...decisionLesson(false).practice.questions[0],sceneId:'next',node:{beatId:'setup'}};
  p.lesson.practice=reviewPractice(p,{...decisionLesson(false).practice,questions:[question]});
  p.lesson.scenes[0].beats[0].actions[0].to=12;
  assert.throws(()=>practiceHTML(p),{code:'SESSION_STALE'});assert.throws(()=>answerPractice(p,{questionId:'price',choiceIds:['25']}),{code:'SESSION_STALE'});
  const independent=structuredClone(decisionLesson(false).scenes[0]);independent.id='independent';p.lesson.scenes.push(independent);
  p.lesson.practice=reviewPractice(p,{...decisionLesson(false).practice,questions:[{...question,sceneId:'independent',node:{beatId:'decision'}}]});assert.doesNotThrow(()=>practiceHTML(p));
  const q=newProject(decisionLesson(false));delete q.lesson.practice;
  const variant=createVariant(q.lesson.scenes[0],{id:'variant',title:words('Variation'),change:{beatId:'bet',actionIndex:0,action:{seat:'other',type:'bet',to:20}}});q.lesson.scenes.push(variant);
  q.lesson.practice=reviewPractice(q,{...decisionLesson(false).practice,questions:[{...question,sceneId:'variant',node:{beatId:'decision'}}]});
  q.lesson.scenes[0].start.seats.forEach(s=>s.contributed+=5);
  assert.throws(()=>practiceHTML(q),{code:'VARIANT_SOURCE_STALE'});assert.throws(()=>answerPractice(q,{questionId:'price',choiceIds:['25']}),{code:'VARIANT_SOURCE_STALE'});
});
