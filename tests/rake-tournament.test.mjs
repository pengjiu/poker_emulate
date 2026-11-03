import test from 'node:test';
import assert from 'node:assert/strict';
import {loadState,transition,bankroll,sidePots,rakeAmount,createHand,evaluate,evaluatePartial,legalActions,observe,displayState} from '../src/poker/rules.mjs';

const river={street:'river',board:['2c','3d','4h','5s','9c'],button:'a',hero:'a',actor:'b',seats:[{id:'a',stack:90,contributed:10,hole:['As','Ad']},{id:'b',stack:90,contributed:10,hole:['Ks','Kd']}]};
test('Capped rake settles net prizes, preserves gross pot and conserves chips including house ledger',()=>{
  let s=loadState({...river,rake:{rate:.05,cap:1,noFlopNoDrop:true}});
  for(const action of [{seat:'b',type:'bet',to:10},{seat:'a',type:'call'},{type:'showdown'}])s=transition(s,action);
  assert.equal(s.potAtAward,4000);assert.equal(s.rakeTaken,100);assert.deepEqual(s.rakePaid,[{pot:0,amount:100}]);assert.equal(s.payouts[0].amount,3900);
  assert.equal(s.seats[0].stack,11900);assert.equal(s.seats[1].stack,8000);assert.equal(bankroll(s),20000);
});
test('No-flop-no-drop, minimum pot and fractional rounding use effective matched money',()=>{
  const hand=createHand({seats:[{id:'a',stack:100},{id:'b',stack:100}],button:'a',rake:{rate:.05,cap:2,noFlopNoDrop:true}});
  const folded=transition(loadState(hand),{seat:'a',type:'fold'});assert.equal(folded.rakeTaken,0);assert.equal(folded.potAtAward,100);assert.equal(bankroll(folded),20000);
  const s=loadState({...river,seats:river.seats.map(p=>({...p,contributed:1.01,stack:98.99})),rake:{rate:.05,cap:2,noFlopNoDrop:false,minPot:2}});assert.equal(rakeAmount(s),10);
  s.rake.minPot=203;assert.equal(rakeAmount(s),0);
});
test('Rake is capped once across unequal all-in side pots and never consumes refunded money',()=>{
  const start={...river,actor:null,roundClosed:true,rake:{rate:.10,cap:5,noFlopNoDrop:false},seats:[{id:'a',stack:0,contributed:10,hole:['As','Ad']},{id:'b',stack:0,contributed:20,hole:['Ks','Kd']},{id:'c',stack:0,contributed:30,hole:['Qs','Qd']}]};
  let s=loadState(start);assert.deepEqual(s.refunds,[{seat:'c',amount:1000}]);assert.deepEqual(sidePots(s).map(p=>p.amount),[3000,2000]);
  s=transition(s,{type:'showdown'});assert.equal(s.rakeTaken,500);assert.deepEqual(s.payouts.map(p=>p.amount),[2500,2000]);assert.deepEqual(s.seats.map(p=>p.stack),[2500,2000,1000]);assert.equal(bankroll(s),6000);
});
test('Big-blind ante is shared dead money and is never refunded as an unmatched wager',()=>{
  const start=createHand({seats:[{id:'a',stack:10},{id:'b',stack:10},{id:'c',stack:10}],button:'a',bigBlind:1,bigBlindAnte:1});
  assert.equal(start.actor,'a');assert.equal(start.deadPot,1);assert.deepEqual(start.antePaid,{c:1});assert.equal(start.seats[2].stack,8);assert.equal(start.seats[2].contributed,1);
  let s=loadState(start);s=transition(s,{seat:'a',type:'fold'});s=transition(s,{seat:'b',type:'fold'});
  assert.equal(s.potAtAward,200);assert.deepEqual(s.refunds,[{seat:'c',amount:50}]);assert.equal(s.seats[2].stack,1050);assert.equal(bankroll(s),3000);
});
test('Short big blind pays live blind before BBA and a multiway caller faces full bring-in',()=>{
  const start=createHand({seats:[{id:'a',stack:10},{id:'b',stack:10},{id:'c',stack:.3}],button:'a',bigBlind:1,bigBlindAnte:1});
  assert.equal(start.forcedBet,1);assert.equal(start.deadPot,undefined);assert.equal(start.seats[2].streetBet,.3);
  let s=loadState(start);assert.equal(legalActions(s).find(a=>a.type==='call').amount,1);s=transition(s,{seat:'a',type:'call'});assert.equal(legalActions(s).find(a=>a.type==='call').amount,.5);s=transition(s,{seat:'b',type:'call'});
  assert.equal(s.roundClosed,true);assert.deepEqual(sidePots(s).map(p=>p.amount),[90,140]);assert.equal(bankroll(s),2030);
});
test('An ante-only all-in player remains eligible for the shared ante pool',()=>{
  const start=createHand({seats:[{id:'a',stack:.1,hole:['As','Ad']},{id:'b',stack:10,hole:['Ks','Kd']},{id:'c',stack:10,hole:['Qs','Qd']}],button:'a',ante:.1});
  assert.equal(start.seats[0].stack,0);const pots=sidePots(loadState(start));assert.deepEqual(pots[0],{amount:30,eligible:['a','b','c']});
  let s=loadState(start);s=transition(s,{seat:'b',type:'call'});s=transition(s,{seat:'c',type:'check'});
  for(const cards of [['2c','3d','4h'],['5s'],['9c']]){s=transition(s,{type:'deal',cards});while(!s.roundClosed)s=transition(s,{seat:s.actor,type:'check'});}
  s=transition(s,{type:'showdown'});assert.equal(s.payouts.find(p=>p.seat==='a').amount,30);assert.equal(bankroll(s),2010);
});
test('Heads-up posting order, all-in blind closure and explicit tournament denominations are correct',()=>{
  const start=createHand({seats:[{id:'a',stack:100},{id:'b',stack:100}],button:'a',bigBlind:2,smallBlind:1,bigBlindAnte:2,unit:'chips'});
  assert.equal(start.actor,'a');assert.equal(start.seats[0].streetBet,1);assert.equal(start.seats[1].streetBet,2);assert.equal(loadState(start).displayUnit,'chips');
  assert.throws(()=>createHand({seats:[{id:'a',stack:10},{id:'b',stack:10}],button:'a',bigBlind:2,smallBlind:1,unit:'BB'}),e=>e.code==='CHIP_UNIT');
  const allin=createHand({seats:[{id:'a',stack:.5},{id:'b',stack:.3}],button:'a'});assert.equal(allin.roundClosed,true);assert.equal(allin.actor,null);assert.equal(allin.seats[0].stack,.2);assert.equal(bankroll(loadState(allin)),80);
});
test('An authored non-unit blind defaults to chips without relabeling its fixed denomination as current BBs',()=>{
  const s=loadState({...river,bigBlind:2}),visible=displayState(observe(s));
  assert.equal(visible.unit,'chips');assert.equal(visible.bigBlind,2);assert.equal(visible.seats[0].stack,90);assert.equal(visible.pot,20);
  const legacy=loadState(river);assert.equal(legacy.displayUnit,undefined);assert.equal(displayState(observe(legacy)).unit,'BB');
});
test('Partial hand evaluation reuses identical ranking with a strict seven-card showdown wrapper',()=>{
  assert.equal(evaluatePartial(['As','Ks','Qs','Js','Ts']),evaluate(['As','Ks','Qs','Js','Ts','2d','3c']));
  assert.ok(evaluatePartial(['As','Ad','Ac','Kh','Kd','2c'])<evaluatePartial(['Ks','Qs','Js','Ts','9s']));
  assert.throws(()=>evaluate(['As','Ks','Qs','Js','Ts']),e=>e.code==='SHOWDOWN_CARDS');
  assert.throws(()=>evaluatePartial(['As','As','Qs','Js','Ts']),e=>e.code==='SHOWDOWN_CARDS');
});
