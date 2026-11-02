import test from 'node:test';
import assert from 'node:assert/strict';
import {priceLesson,equilibriumLesson,transferLesson,verticalSlice,localizedProbe,course} from '../examples/teaching/course.mjs';
import {resolveDecision,compileAnalysis,verifyRiverEquilibrium,verifyRiverTypes} from '../src/analysis/index.mjs';
import {observe,bankroll} from '../src/poker/rules.mjs';

test('three pilot lessons preserve legal history and distinct teaching roles',()=>{
  const lessons=[priceLesson(),equilibriumLesson(),transferLesson()];
  assert.equal(course.episodes.length,3);
  for(const scene of lessons){
    const final=resolveDecision(scene,{beatId:scene.beats.at(-1).id});
    assert.equal(final.settled,true);
    assert.equal(bankroll(final),scene.id==='bounded-equilibrium'?3000:60000);
  }
  assert.notDeepEqual(lessons[0].start.seats.find(seat=>seat.id===lessons[0].start.hero).hole,lessons[2].start.seats.find(seat=>seat.id===lessons[2].start.hero).hole);
  assert.equal(lessons[2].beats.at(-2).actions[0].type,'fold');
  assert.equal(lessons[2].beats.some(beat=>beat.view?.reveal?.length),false);
});

test('native slice retains exact pending facts through analysis and returns to one call',()=>{
  const scene=verticalSlice(),pending=observe(resolveDecision(scene,{beatId:'river-bet'}));
  assert.equal(pending.pot,1510);
  for(const id of ['question','thinking-pause','price','range','choice']){
    const state=observe(resolveDecision(scene,{beatId:id}));
    assert.equal(state.pot,1510);assert.equal(state.actor,'btn');
    assert.deepEqual(state.seats.find(seat=>seat.id==='bb').hole,[null,null]);
  }
  const after=observe(resolveDecision(scene,{beatId:'call'}));
  assert.equal(after.pot,2110);assert.equal(after.roundClosed,true);
  assert.equal(scene.beats.filter(beat=>(beat.actions??[]).some(action=>action.seat==='btn'&&action.type==='call')).length,1);
});

test('course examples derive current prices and scoped equilibrium from engine facts',()=>{
  const price=priceLesson(),transfer=transferLesson();
  assert.equal(compileAnalysis(price,price.analysis[0],'zh-CN').calculation.total,21.1);
  assert.equal(compileAnalysis(transfer,transfer.analysis[0],'zh-CN').calculation.total,33.3);
  const model=equilibriumLesson(),before=observe(resolveDecision(model,{beatId:'model'})),after=observe(resolveDecision(model,{beatId:'model-bet'}));
  const result=verifyRiverEquilibrium({pot:before.pot/100,bet:after.legalActions.find(action=>action.type==='call').amount,valueProbability:.5},{valueBet:1,bluffBet:.5,call:.5});
  assert.equal(result.verified,true);assert.equal(result.bluffShareWhenBet,1/3);
  assert.deepEqual(verifyRiverTypes(before.board,before.seats.find(seat=>seat.id===before.hero).hole,['As','Ad'],['Jh','Th']),{valueWins:true,bluffLoses:true});
});

test('localized probe carries actual language text and one common decision',()=>{
  const scene=localizedProbe();
  for(const locale of ['zh-CN','en-US','ja-JP']){
    assert.ok(scene.title[locale]);assert.ok(scene.beats[1].narration[locale]);
    const material=compileAnalysis(scene,scene.analysis[0],locale);
    assert.equal(material.calculation.total,30);assert.equal(material.issues.some(issue=>issue.code==='TRANSLATION_MISSING'),false);
  }
});
