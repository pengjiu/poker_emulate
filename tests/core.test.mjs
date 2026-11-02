import test from 'node:test';
import assert from 'node:assert/strict';
import {loadState,transition,legalActions,bankroll,sidePots,evaluate,observe} from '../src/poker/rules.mjs';
import {compileProject} from '../src/compiler.mjs';
import {fixture,packs,words} from './helpers.mjs';
const project=fixture(),base=project.lesson.scenes[0].start;
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
const after=(start,commands)=>commands.reduce(transition,loadState(start));
test('All authored scenes and routes compile with consistent chip totals in six outputs',()=>{
  for(const locale of Object.keys(packs))for(const aspect of ['portrait','landscape'])for(const s of project.lesson.scenes)for(const branchId of [null,...(s.branches??[]).map(b=>b.id)]){
    const plan=compileProject(project,packs,{output:{locale,aspect,sceneId:s.id,branchId}});
    for(const f of plan.frames)assert.equal(Math.round(bankroll(f.state)*100),Math.round(f.state.bankroll*100));
  }
});
test('Independently expected unequal all-ins: 120 main, 60 side, 40 refund',()=>{
  const p=compileProject(project,packs,{output:{sceneId:'side-pots'}}),s=p.frames.at(-2).state;
  assert.deepEqual(s.pots.map(p=>p.amount),[120,60]);assert.deepEqual(s.refunds,[{seat:'c',amount:40}]);
  assert.deepEqual(p.frames.at(-1).state.seats.map(s=>s.stack),[120,60,40]);assert.equal(s.unit,'BB');
});
test('Folded blind money merges into one eligible main pot',()=>assert.deepEqual(sidePots(loadState(base)),[{amount:550,eligible:['btn','bb']}]))
test('Unmatched live wagers stay provisional until round closes',()=>{
  let s=after(base,[{seat:'bb',type:'check'},{seat:'btn',type:'bet',to:2}]);assert.equal(observe(s).potsProvisional,true);s=transition(s,{seat:'bb',type:'call'});assert.equal(observe(s).potsProvisional,false);
});
test('Short raise to 15 after a 10 bet does not reopen prior bettor',()=>{
  const p=compileProject(project,packs,{output:{sceneId:'short-raise'}}),scene=project.lesson.scenes[2],s=after(scene.start,scene.beats.slice(0,5).flatMap(b=>b.actions??[]));
  assert.deepEqual(p.frames.find(f=>f.beatId==='flat-fifteen').state.legalActions,legalActions(s));
  assert.equal(s.actor,'a');assert.deepEqual(legalActions(s).map(a=>a.type),['fold','call']);assert.equal(legalActions(s)[1].amount,5);
  expectCode(()=>transition(s,{seat:'a',type:'raise',to:30}),'ACTION_ILLEGAL');
});
test('Cumulative short raises reaching 20 reopen a full 10 raise',()=>{
  const input=structuredClone(project.lesson.scenes[2].start);input.seats[1].stack=15;input.seats[2].stack=20;
  const s=after(input,[{seat:'a',type:'bet',to:10},{seat:'b',type:'allin'},{seat:'c',type:'allin'},{seat:'d',type:'call'}]);
  assert.deepEqual(legalActions(s).find(x=>x.type==='raise'),{type:'raise',minTo:30,maxTo:100});
});
test('Heads-up blind roles and pre/postflop order',()=>{
  let s=loadState({street:'preflop',button:'a',actor:'a',seats:[{id:'a',stack:99.5,contributed:.5,streetBet:.5,hole:['As','Ad']},{id:'b',stack:99,contributed:1,streetBet:1,hole:['Ks','Kd']}]});
  s=transition(s,{seat:'a',type:'call'});assert.equal(s.actor,'b');assert.ok(legalActions(s).some(a=>a.type==='check'));
  s=transition(s,{seat:'b',type:'check'});s=transition(s,{type:'deal',cards:['2c','3d','4h']});assert.equal(s.actor,'b');
});
test('Covering player cannot create a side bet against one all-in player',()=>{
  const s=loadState({street:'flop',board:['2c','3d','4h'],button:'a',actor:'a',seats:[{id:'a',stack:100,hole:['As','Ad']},{id:'b',stack:0,contributed:10,streetBet:10,hole:['Ks','Kd']}]});assert.deepEqual(legalActions(s).map(a=>a.type),['fold','call']);
});
test('Uncalled wager is refunded and folded contributions remain',()=>{
  const input={street:'river',board:['2c','3d','4h','5s','9c'],button:'a',actor:'a',seats:[{id:'a',stack:100,contributed:10,hole:['As','Ad']},{id:'b',stack:100,contributed:10,hole:['Ks','Kd']},{id:'c',stack:100,contributed:5,folded:true,hole:['Qs','Qd']}]};
  const s=after(input,[{seat:'a',type:'bet',to:20},{seat:'b',type:'fold'}]);assert.equal(s.potAtAward,2500);assert.equal(s.seats[0].stack,12500);assert.deepEqual(s.refunds,[{seat:'a',amount:2000}]);assert.equal(bankroll(s),32500);
});
test('Royal-board tie awards odd chip clockwise from dealer: 101/102',()=>{
  const s=after({street:'river',board:['As','Ks','Qs','Js','Ts'],button:'a',actor:null,roundClosed:true,seats:[{id:'a',stack:0,contributed:1.01,hole:['2c','3c']},{id:'b',stack:0,contributed:1.01,hole:['4d','5d']},{id:'c',stack:0,contributed:.01,folded:true,hole:['6h','7h']}]},[{type:'showdown'}]);assert.deepEqual(s.seats.map(p=>p.stack),[101,102,0]);
});
test('All nine hand categories and wheel ordering',()=>{
  const hands=[['As','Ks','Qs','Js','Ts','2c','3d'],['As','Ah','Ad','Ac','Ks','2c','3d'],['As','Ah','Ad','Ks','Kh','2c','3d'],['As','Js','8s','5s','2s','3d','4h'],['As','Kd','Qc','Jh','Ts','2c','3d'],['As','Ah','Ad','Ks','Qc','2c','3d'],['As','Ah','Ks','Kh','Qc','2c','3d'],['As','Ah','Ks','Qh','9c','2c','3d'],['As','Kd','9c','7h','5s','2c','3d']].map(evaluate);
  assert.ok(hands.every((x,i)=>i===0||x<hands[i-1]));assert.ok(evaluate(['As','2c','3d','4h','5s','9c','Td'])<evaluate(['2s','3c','4d','5h','6s','9c','Td']));
});
for(const [name,edit,code]of [
  ['duplicate cards',x=>x.seats[3].hole=['Qd','As'],'CARD_DUPLICATE'],
  ['negative stack',x=>x.seats[0].stack=-1,'CHIP_AMOUNT'],
  ['fractional smallest chip',x=>x.seats[0].stack=1.001,'CHIP_AMOUNT'],
  ['unsafe integer stack',x=>x.seats[0].stack=Number.MAX_SAFE_INTEGER,'CHIP_AMOUNT'],
  ['incorrect board',x=>x.street='turn','BOARD_COUNT'],
  ['missing actor',x=>x.actor=null,'ACTOR_REQUIRED'],
  ['unknown history seat',x=>x.actedAt={ghost:0},'SEAT_UNKNOWN']
])test('Reject '+name,()=>{const x=structuredClone(base);edit(x);expectCode(()=>loadState(x),code);});
test('Closed snapshot cannot hide an unpaid live player (R06)',()=>{
  expectCode(()=>loadState({street:'flop',board:['2c','3d','4h'],button:'a',actor:null,roundClosed:true,seats:[{id:'a',stack:90,contributed:10,streetBet:10,hole:['As','Ad']},{id:'b',stack:100,hole:['Ks','Kd']}]}),'ROUND_INCONSISTENT');
});
test('Illegal transition leaves prior state intact',()=>{
  let s=loadState(base);const original=structuredClone(s);expectCode(()=>transition(s,{seat:'btn',type:'bet',to:3}),'OUT_OF_TURN');assert.deepEqual(s,original);
  expectCode(()=>transition(s,{type:'deal',cards:['3c']}),'ROUND_OPEN');s=transition(s,{seat:'bb',type:'check'});
  expectCode(()=>transition(s,{seat:'btn',type:'bet',to:.5}),'BET_SIZE');expectCode(()=>transition(s,{seat:'btn',type:'bet',to:100}),'BET_SIZE');
  s=transition(s,{seat:'btn',type:'check'});expectCode(()=>transition(s,{type:'deal',cards:['As']}),'CARD_DUPLICATE');
});
test('Player view conceals opponents until explicit reveal; chips unchanged',()=>{
  const p=fixture();p.lesson.scenes[0].beats[2].view={reveal:['bb']};const plan=compileProject(p,packs),before=plan.frames[0],revealed=plan.frames.find(f=>f.beatId==='decision');
  assert.deepEqual(before.state.seats.find(p=>p.id==='bb').hole,[null,null]);assert.deepEqual(revealed.state.seats.find(p=>p.id==='bb').hole,['7d','6d']);assert.equal(before.state.bankroll,revealed.state.bankroll);
});
test('Only selected route is executed; unused invalid tail is diagnosed separately (R05)',()=>{
  const p=fixture();p.lesson.scenes[0].beats[3].actions=[{seat:'ghost',type:'check'}];
  assert.ok(compileProject(p,packs,{output:{branchId:'check-line'}}).frames.length);expectCode(()=>compileProject(p,packs),'OUT_OF_TURN');
});
test('Multi-action beats keep each visible state; narration happens after actions (R07)',()=>{
  const p=fixture();p.lesson.scenes=[p.lesson.scenes[0]];p.lesson.scenes[0].branches=[];
  p.lesson.scenes[0].beats=[{id:'double',label:words('Checks'),actions:[{seat:'bb',type:'check'},{seat:'btn',type:'check'}],narration:words('Both checked'),hold:1}];
  const frames=compileProject(p,packs).frames;assert.equal(frames.length,3);assert.equal(frames[0].state.actor,'btn');assert.equal(frames[1].state.roundClosed,true);assert.equal(frames[2].event,null);assert.equal(frames[2].narration,'Both checked');
});
test('256 complete seeded hands terminate, conserve chips and use unique cards',()=>{
  let actions=0,showdowns=0,sidePotHands=0;
  for(let seed=1;seed<=256;seed++){
    let rng=seed;const rand=()=>{rng=(Math.imul(1664525,rng)+1013904223)>>>0;return rng/2**32;};
    const n=2+(seed%8),deck=[];for(const r of '23456789TJQKA')for(const s of 'cdhs')deck.push(r+s);
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
    const button=n-1,sb=n===2?button:0,bb=n===2?0:1;
    const seats=Array.from({length:n},(_,i)=>{const blind=i===sb?.5:i===bb?1:0;return {id:`p${i}`,stack:5+Math.floor(rand()*196)-blind,contributed:blind,streetBet:blind,hole:[deck.pop(),deck.pop()]};});
    let s=loadState({street:'preflop',button:`p${button}`,actor:`p${n===2?button:2}`,seats}),steps=0,hadSidePot=false;
    while(!s.settled){assert.ok(++steps<300);let command;
      if(s.roundClosed)command=s.board.length===5?{type:'showdown'}:{type:'deal',cards:Array.from({length:s.street==='preflop'?3:1},()=>deck.pop())};
      else{const choices=legalActions(s),choice=choices[Math.floor(rand()*choices.length)];assert.ok(choice);command={seat:s.actor,type:choice.type};if(choice.minTo!==undefined){const low=Math.round(choice.minTo*100),high=Math.round(choice.maxTo*100);command.to=(rand()<.7?low:low+Math.floor(rand()*(high-low+1)))/100;}}
      s=transition(s,command);assert.equal(bankroll(s),s.bankroll);actions++;if(!s.settled&&s.roundClosed&&sidePots(s).length>1)hadSidePot=true;
    }if(s.revealed.length)showdowns++;if(hadSidePot)sidePotHands++;
  }
  assert.deepEqual({actions,showdowns,sidePotHands},{actions:2718,showdowns:205,sidePotHands:146});
});
