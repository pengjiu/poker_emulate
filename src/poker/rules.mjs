// Pure poker rules. All internal amounts are integer hundredths of the fixed denomination.
import {fail} from "../errors.mjs";
export const clone = x => structuredClone(x);
export {RiverError as PokerError} from '../errors.mjs';
const requireThat = (yes, code, message, detail) => { if (!yes) fail(code, message, "state", detail); };
export function chips(value) {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'CHIP_AMOUNT', 'Chip amounts must be nonnegative numbers with at most two decimal places.');
  return Math.round(value * 100);
}
const total = values => values.reduce((a, b) => a + b, 0);
export const potValue = s => s.settled ? 0 : total(s.seats.map(p => p.contributed)) + (s.deadPot ?? 0);
export const bankroll = s => total(s.seats.map(p => p.stack)) + potValue(s) + (s.rakeTaken ?? 0);
const active = s => s.seats.filter(p => !p.folded);
const actionable = s => active(s).filter(p => p.stack > 0);
const maxBet = s => Math.max(s.forcedBet ?? 0, ...s.seats.map(p => p.streetBet));
const facingBet = s => actionable(s).length <= 1 ? Math.max(0, ...s.seats.map(p => p.streetBet)) : maxBet(s);
const player = (s, id) => {
  const p = s.seats.find(p => p.id === id);
  requireThat(p, 'SEAT_UNKNOWN', `Unknown seat: ${id}`); return p;
};
function clockwise(s, id) {
  const i = s.seats.findIndex(p => p.id === id);
  return [...s.seats.slice(i + 1), ...s.seats.slice(0, i + 1)];
}
function validateCards(s) {
  const cards = [...s.board, ...s.seats.flatMap(p => p.hole)];
  requireThat(cards.every(c => /^[2-9TJQKA][cdhs]$/.test(c)), 'CARD_INVALID', 'Cards use ranks 2–9,T,J,Q,K,A and suits c,d,h,s.');
  requireThat(new Set(cards).size === cards.length, 'CARD_DUPLICATE', 'A physical card can appear only once.');
  requireThat(s.seats.every(p => p.hole.length === 0 || p.hole.length === 2), 'HOLE_COUNT', 'Each seat has either two cards or no assigned cards.');
}
function integrity(s) {
  validateCards(s);
  requireThat(s.seats.every(p => [p.stack,p.contributed,p.streetBet].every(n => Number.isSafeInteger(n) && n >= 0) && p.streetBet <= p.contributed), 'CHIP_STATE', 'Stacks and contributions are inconsistent.');
  requireThat(Number.isSafeInteger(bankroll(s)) && bankroll(s) === s.bankroll, 'CHIP_CONSERVATION', 'Chip conservation failed.');
  requireThat(Number.isSafeInteger(s.deadPot ?? 0) && (s.deadPot ?? 0) >= 0 && Number.isSafeInteger(s.rakeTaken ?? 0) && (s.rakeTaken ?? 0) >= 0, 'CHIP_STATE', 'Dead money and rake must use nonnegative smallest units.');
}
function refundUncalled(s) {
  const sorted = [...s.seats].sort((a,b) => b.contributed-a.contributed);
  const excess = sorted[0].contributed - sorted[1].contributed;
  if (excess > 0) {
    const p = sorted[0]; p.stack += excess; p.contributed -= excess;
    p.streetBet = Math.max(0, p.streetBet-excess);
    s.refunds.push({seat:p.id,amount:excess});
  }
}
function nextActor(s, after) {
  if (active(s).length === 1) { settleUncontested(s); return; }
  const bet = facingBet(s), able = actionable(s);
  if (able.length <= 1 && (!able.length || able[0].streetBet === bet)) {
    s.actor = null; s.roundClosed = true; refundUncalled(s); return;
  }
  const next = clockwise(s, after).find(p => !p.folded && p.stack > 0 && (p.streetBet < bet || s.actedAt[p.id] === undefined));
  s.actor = next?.id ?? null; s.roundClosed = !next;
  if (s.roundClosed) refundUncalled(s);
}
export function loadState(input) {
  requireThat(input && Array.isArray(input.seats) && input.seats.length >= 2 && input.seats.length <= 9, 'SEAT_COUNT', 'Use 2–9 seats.');
  const streets = ['preflop','flop','turn','river'];
  requireThat(streets.includes(input.street), 'STREET', 'Choose preflop, flop, turn or river.');
  const s = {
    street:input.street, board:[...(input.board ?? [])], button:input.button, actor:input.actor ?? null,
    hero:input.hero ?? input.button, bigBlind:chips(input.bigBlind ?? 1), lastFullRaise:chips(input.lastFullRaise ?? input.bigBlind ?? 1),
    actedAt:Object.fromEntries(Object.entries(input.actedAt ?? {}).map(([k,v]) => [k,chips(v)])),
    seats:input.seats.map(p => ({id:p.id,name:p.name ?? p.id,stack:chips(p.stack),contributed:chips(p.contributed ?? 0),streetBet:chips(p.streetBet ?? 0),folded:!!p.folded,hole:[...(p.hole ?? [])],action:p.action ?? null})),
    roundClosed:!!input.roundClosed, settled:false, revealed:[], payouts:[], refunds:[], potAtAward:0, lastEvent:null
  };
  if (input.smallBlind !== undefined) {
    s.smallBlind = chips(input.smallBlind);
    requireThat(s.smallBlind > 0 && s.smallBlind <= s.bigBlind, 'BLIND', 'The small blind must be positive and at most the big blind.');
  }
  if (input.unit !== undefined) {
    requireThat(['BB','chips'].includes(input.unit), 'CHIP_UNIT', 'Use BB or chips as the display denomination.');
    requireThat(input.unit !== 'BB' || s.bigBlind === 100, 'CHIP_UNIT', 'BB display requires a big blind of one; use chips for changing tournament levels.');
    s.displayUnit = input.unit;
  } else if(s.bigBlind!==100) s.displayUnit='chips';
  if (input.deadPot !== undefined) s.deadPot = chips(input.deadPot);
  if (input.antePaid !== undefined) {
    requireThat(input.antePaid && typeof input.antePaid === 'object' && !Array.isArray(input.antePaid), 'ANTE', 'Ante payments are keyed by seat.');
    s.antePaid = Object.fromEntries(Object.entries(input.antePaid).map(([id,amount]) => [id,chips(amount)]));
    requireThat(total(Object.values(s.antePaid)) === (s.deadPot ?? 0), 'ANTE', 'Ante payments must equal the dead-money pool.');
  }
  if (input.forcedBet !== undefined) {
    s.forcedBet = chips(input.forcedBet);
    requireThat(input.street === 'preflop' && s.forcedBet === s.bigBlind, 'BLIND', 'A forced bring-in is the full preflop big blind.');
  }
  if (input.blindSeats !== undefined) {
    const seats=input.blindSeats;
    requireThat(seats&&typeof seats==='object'&&!Array.isArray(seats)&&Object.keys(seats).every(key=>['smallBlindSeat','bigBlindSeat'].includes(key))&&typeof seats.bigBlindSeat==='string'&&(seats.smallBlindSeat===null||typeof seats.smallBlindSeat==='string')&&seats.bigBlindSeat!==seats.smallBlindSeat,'BLIND','Blind roles must identify the big blind and an optional small blind.');
    s.blindSeats=clone(seats);
  }
  if (input.rake !== undefined) {
    const value = input.rake;
    requireThat(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => ['rate','cap','noFlopNoDrop','minPot'].includes(key)), 'RAKE', 'Provide a percentage/cap rake model.');
    requireThat(Number.isFinite(value.rate) && value.rate >= 0 && value.rate <= 1 && typeof value.noFlopNoDrop === 'boolean', 'RAKE', 'Rake rate is a fraction and noFlopNoDrop is explicit.');
    s.rake = {rate:value.rate,cap:chips(value.cap),noFlopNoDrop:value.noFlopNoDrop,minPot:chips(value.minPot ?? 0)};
    s.rakeTaken = 0;
  }
  requireThat(new Set(s.seats.map(p=>p.id)).size === s.seats.length && s.seats.every(p=>typeof p.id==='string' && p.id), 'SEAT_ID', 'Seat IDs must be unique nonempty strings.');
  player(s,s.button); player(s,s.hero);
  if(s.blindSeats){player(s,s.blindSeats.bigBlindSeat);if(s.blindSeats.smallBlindSeat!==null)player(s,s.blindSeats.smallBlindSeat);}
  for (const id of Object.keys(s.antePaid ?? {})) player(s,id);
  requireThat(s.bigBlind > 0 && s.lastFullRaise > 0, 'BLIND', 'The big blind and minimum raise must be positive.');
  requireThat(s.board.length === [0,3,4,5][streets.indexOf(s.street)], 'BOARD_COUNT', 'The board must match the selected street.');
  s.bankroll = bankroll(s);
  if (s.actor) {
    const p = player(s,s.actor);
    requireThat(!s.roundClosed && !p.folded && p.stack>0, 'ACTOR', 'The acting seat must be able to act in an open round.');
  } else requireThat(s.roundClosed, 'ACTOR_REQUIRED', 'An open betting round requires an acting seat.');
  requireThat(active(s).length >= 2, 'ACTIVE_SEATS', 'A starting hand needs at least two non-folded seats.');
  for (const [id, value] of Object.entries(s.actedAt)) {
    player(s, id);
    requireThat(value <= maxBet(s), 'ACTED_AT', 'Prior faced bet cannot exceed the current highest bet.');
  }
  if(s.roundClosed) {
    requireThat(actionable(s).every(p => p.streetBet === maxBet(s)), 'ROUND_INCONSISTENT', 'A live player still owes chips; this round cannot be closed.');
    requireThat(!sidePots(s).some(p => p.eligible.length === 0), 'POT_NO_ELIGIBLE', 'Every pot needs an eligible player.');
    refundUncalled(s);
  }
  integrity(s); return s;
}
export function legalActions(s, id = s.actor) {
  if (!id || s.settled || s.roundClosed || id !== s.actor) return [];
  const p = player(s,id), bet = facingBet(s), call = Math.min(p.stack,bet-p.streetBet);
  const actions = [{type:'fold'}];
  if (call===0) actions.push({type:'check'}); else actions.push({type:'call',amount:call/100});
  const rights = s.actedAt[id] === undefined || bet-s.actedAt[id] >= s.lastFullRaise;
  const opponentsCanRespond = actionable(s).some(q=>q.id!==id);
  const maxTo = (p.streetBet+p.stack)/100;
  if (rights && opponentsCanRespond && p.streetBet+p.stack>bet) {
    const minTo = (bet===0?s.bigBlind:bet+s.lastFullRaise)/100;
    if (maxTo>=minTo) actions.push({type:bet===0?'bet':'raise',minTo,maxTo});
    actions.push({type:'allin',to:maxTo});
  } else if (p.stack<=bet-p.streetBet) actions.push({type:'allin',to:maxTo});
  return actions;
}
/** One hand-level rake, after unmatched bets, rounded down to the smallest unit. */
export function rakeAmount(s, gross = potValue(s)) {
  if (!s.rake || s.rake.noFlopNoDrop && s.board.length < 3 || gross < s.rake.minPot) return 0;
  return Math.min(gross, s.rake.cap, Math.floor(gross * s.rake.rate + 1e-9));
}
function netPots(s, pots) {
  let remaining = rakeAmount(s);
  if (!s.rake) return pots;
  s.rakeTaken = remaining;
  s.rakePaid = [];
  return pots.map((pot,index) => {
    const amount = Math.min(pot.amount, remaining); remaining -= amount;
    if (amount) s.rakePaid.push({pot:index,amount});
    return {...pot,amount:pot.amount-amount};
  });
}
function settleUncontested(s) {
  refundUncalled(s);
  const winner = active(s)[0], value = potValue(s);
  const [net] = netPots(s,[{amount:value,eligible:[winner.id]}]);
  winner.stack += net.amount;
  s.potAtAward = value; s.payouts = [{seat:winner.id,amount:net.amount,pot:0}];
  s.settled = true; s.roundClosed=true; s.actor=null;
}
export function sidePots(s) {
  const levels = [...new Set(s.seats.map(p=>p.contributed).filter(Boolean))].sort((a,b)=>a-b);
  let prior = 0;
  const pots=(s.deadPot ?? 0) ? [{amount:s.deadPot,eligible:active(s).map(p=>p.id)}] : [];
  for(const level of levels){
    const contributors=s.seats.filter(p=>p.contributed>=level);
    const pot = {amount:(level-prior)*contributors.length,eligible:contributors.filter(p=>!p.folded).map(p=>p.id)};
    prior=level;
    const previous=pots.at(-1);
    if(previous && previous.eligible.join('|')===pot.eligible.join('|'))previous.amount+=pot.amount;
    else pots.push(pot);
  }
  return pots;
}
function rankFive(cards) {
  const values = cards.map(c=>'23456789TJQKA'.indexOf(c[0])+2).sort((a,b)=>b-a);
  const counts = new Map(); values.forEach(n=>counts.set(n,(counts.get(n)||0)+1));
  const groups = [...counts.entries()].sort((a,b)=>b[1]-a[1] || b[0]-a[0]);
  const unique = [...new Set(values)];
  const straight = unique.length===5 ? (unique[0]-unique[4]===4?unique[0]:(unique.join(',')==='14,5,4,3,2'?5:0)) : 0;
  const flush = cards.every(c=>c[1]===cards[0][1]);
  let parts;
  if (flush && straight) parts=[8,straight];
  else if(groups[0][1]===4) parts=[7,groups[0][0],groups[1][0]];
  else if(groups[0][1]===3 && groups[1][1]===2) parts=[6,groups[0][0],groups[1][0]];
  else if(flush) parts=[5,...values];
  else if(straight) parts=[4,straight];
  else if(groups[0][1]===3) parts=[3,groups[0][0],...groups.slice(1).map(x=>x[0])];
  else if(groups[0][1]===2 && groups[1][1]===2) parts=[2,Math.max(groups[0][0],groups[1][0]),Math.min(groups[0][0],groups[1][0]),groups[2][0]];
  else if(groups[0][1]===2) parts=[1,groups[0][0],...groups.slice(1).map(x=>x[0])];
  else parts=[0,...values];
  while(parts.length<6)parts.push(0);
  return parts.reduce((n,p)=>n*15+p,0);
}
export function evaluatePartial(cards) {
  requireThat(Array.isArray(cards) && cards.length>=5 && cards.length<=7 && new Set(cards).size===cards.length && cards.every(c=>/^[2-9TJQKA][cdhs]$/.test(c)), 'SHOWDOWN_CARDS', 'Hand evaluation needs five to seven unique valid cards.');
  let best=-1;
  for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++) best=Math.max(best,rankFive([cards[a],cards[b],cards[c],cards[d],cards[e]]));
  return best;
}
export function evaluate(cards) {
  requireThat(Array.isArray(cards) && cards.length===7, 'SHOWDOWN_CARDS', 'Hand evaluation needs seven unique cards.');
  return evaluatePartial(cards);
}
export function transition(current, command) {
  const s=clone(current);
  requireThat(!s.settled, 'HAND_SETTLED', 'This hand has already been settled.');
  if(command.type==='deal') {
    requireThat(s.roundClosed, 'ROUND_OPEN', 'Finish the betting round before dealing.');
    const next={preflop:'flop',flop:'turn',turn:'river'}[s.street];
    requireThat(next, 'BOARD_COMPLETE', 'The river is already dealt.');
    requireThat(Array.isArray(command.cards) && command.cards.length===(next==='flop'?3:1), 'DEAL_COUNT', 'Deal three flop cards or one turn/river card.');
    s.board.push(...command.cards); s.street=next; s.actedAt={}; s.lastFullRaise=s.bigBlind;
    delete s.forcedBet;
    s.seats.forEach(p=>{p.streetBet=0;p.action=null;});
    const can=actionable(s);
    s.actor=can.length>1?clockwise(s,s.button).find(p=>!p.folded && p.stack>0)?.id:null;
    s.roundClosed=!s.actor;
  } else if(command.type==='showdown') {
    requireThat(s.roundClosed && s.board.length===5, 'SHOWDOWN_NOT_READY', 'Showdown requires a complete board and a closed betting round.');
    const ranks=Object.fromEntries(active(s).map(p=>[p.id,evaluate([...p.hole,...s.board])]));
    const pots=netPots(s,sidePots(s)); s.potAtAward=potValue(s); s.payouts=[];
    pots.forEach((pot,index)=>{
      requireThat(pot.eligible.length>0,'POT_NO_ELIGIBLE','A pot has no eligible player.');
      const best=Math.max(...pot.eligible.map(id=>ranks[id]));
      const winners=clockwise(s,s.button).filter(p=>pot.eligible.includes(p.id) && ranks[p.id]===best);
      const each=Math.floor(pot.amount/winners.length); let odd=pot.amount%winners.length;
      winners.forEach(p=>{const amount=each+(odd-->0?1:0);p.stack+=amount;s.payouts.push({seat:p.id,amount,pot:index});});
    });
    s.revealed=active(s).map(p=>p.id); s.settled=true;s.actor=null;
  } else {
    requireThat(command.seat===s.actor && !s.roundClosed,'OUT_OF_TURN','Only the current acting seat can act.',{actor:s.actor});
    const p=player(s,command.seat), choices=legalActions(s), choice=choices.find(x=>x.type===command.type);
    requireThat(choice,'ACTION_ILLEGAL',`Action ${command.type} is not currently legal.`,{legalActions:choices});
    const oldMax=maxBet(s);let actionAmount=0;
    if(command.type==='fold')p.folded=true;
    else if(command.type==='check')s.actedAt[p.id]=oldMax;
    else {
      const target=command.type==='call'?p.streetBet+chips(choice.amount):command.type==='allin'?p.streetBet+p.stack:chips(command.to);
      if(['bet','raise'].includes(command.type)) requireThat(target>=chips(choice.minTo) && target<=chips(choice.maxTo),'BET_SIZE','Use a legal total bet amount, not the increment.',{minTo:choice.minTo,maxTo:choice.maxTo});
      const paid=target-p.streetBet;
      actionAmount=paid;
      requireThat(paid>0 && paid<=p.stack,'BET_SIZE','The amount must fit the remaining stack.');
      p.stack-=paid;p.contributed+=paid;p.streetBet=target;
      const increase=target-oldMax;
      if(increase>=s.lastFullRaise) s.lastFullRaise=increase;
      s.actedAt[p.id]=Math.max(oldMax,target);
    }
    p.action={type:command.type,to:p.streetBet,amount:actionAmount};
    nextActor(s,p.id);
  }
  s.lastEvent=clone(command); integrity(s); return s;
}
export function observe(s, {view='player',seat=s.hero}={}) {
  requireThat(view==='player' || view==='director','VIEW','Use player or director view.');
  player(s,seat);
  const result=clone(s);
  result.seats.forEach(p=>{if(view==='player' && p.id!==seat && !s.revealed.includes(p.id))p.hole=p.hole.map(()=>null);});
  result.pot=potValue(s);result.pots=s.settled?[]:sidePots(s);result.potsProvisional=!s.roundClosed;result.legalActions=legalActions(s);
  return result;
}

/** Convert an observed engine snapshot to author/display amounts exactly once.
 * Legal actions and lastEvent already use author amounts and must remain unchanged. */
export function displayState(state) {
  const s=clone(state);
  for(const key of ['bigBlind','smallBlind','lastFullRaise','bankroll','pot','potAtAward','rakeTaken','deadPot','forcedBet'])if(s[key]!==undefined)s[key]/=100;
  if(s.antePaid)s.antePaid=Object.fromEntries(Object.entries(s.antePaid).map(([id,amount])=>[id,amount/100]));
  if(s.rake)for(const key of ['cap','minPot'])s.rake[key]/=100;
  for(const paid of s.rakePaid??[])paid.amount/=100;
  s.actedAt=Object.fromEntries(Object.entries(s.actedAt).map(([id,amount])=>[id,amount/100]));
  for(const seat of s.seats){for(const key of ['stack','contributed','streetBet'])seat[key]/=100;if(seat.action){seat.action.to/=100;seat.action.amount/=100;}}
  for(const pot of [...s.pots,...s.payouts,...s.refunds])pot.amount/=100;
  s.unit=s.displayUnit??'BB';return s;
}

/** Post one new hand using the same engine; all amounts remain in the fixed denomination. */
export function createHand(input) {
  const knownKeys=(value,allowed,label)=>{
    requireThat(value&&typeof value==='object'&&!Array.isArray(value),'SCHEMA',`${label} must be an object.`);
    for(const key of Object.keys(value))requireThat(allowed.includes(key),'UNKNOWN_FIELD',`Unknown ${label} field: ${key}`);
  };
  knownKeys(input,['seats','button','hero','bigBlind','smallBlind','ante','bigBlindAnte','rake','unit','blindSeats'],'hand setup');
  const {seats,button,hero=button,bigBlind=1,smallBlind=bigBlind/2,ante=0,bigBlindAnte=0,rake,unit=bigBlind===1?'BB':'chips',blindSeats}=input;
  requireThat(Array.isArray(seats) && seats.length>=2 && seats.length<=9, 'SEAT_COUNT', 'Use 2–9 occupied seats.');
  for(const seat of seats)knownKeys(seat,['id','name','avatar','stack','hole'],'setup seat');
  if(blindSeats!==undefined)knownKeys(blindSeats,['smallBlindSeat','bigBlindSeat'],'blind roles');
  const bb=chips(bigBlind),sb=chips(smallBlind),ordinaryAnte=chips(ante),bba=chips(bigBlindAnte);
  requireThat(bb>0 && sb>0 && sb<=bb && !(ordinaryAnte && bba), 'BLIND', 'Use positive ordered blinds and either ante or big-blind ante.');
  const players=seats.map(p=>({...clone(p),stack:chips(p.stack),contributed:0,streetBet:0,folded:p.stack===0})),occupied=players.filter(p=>p.stack>0);
  requireThat(occupied.length>=2, 'STACK', 'A hand needs at least two funded players. Zero-stack seats are inactive placeholders.');
  const buttonIndex=players.findIndex(p=>p.id===button);
  requireThat(buttonIndex>=0, 'SEAT_UNKNOWN', 'The button must be an occupied seat.');
  const nextOccupied=index=>{for(let step=1;step<=players.length;step++){const at=(index+step)%players.length;if(players[at].stack>0)return at;}};
  let sbIndex=occupied.length===2?buttonIndex:nextOccupied(buttonIndex),bbIndex=nextOccupied(sbIndex);
  if(blindSeats){sbIndex=blindSeats.smallBlindSeat===null?-1:players.findIndex(p=>p.id===blindSeats.smallBlindSeat);bbIndex=players.findIndex(p=>p.id===blindSeats.bigBlindSeat);requireThat(bbIndex>=0&&players[bbIndex].stack>0&&(blindSeats.smallBlindSeat===null||sbIndex>=0&&players[sbIndex].stack>0)&&sbIndex!==bbIndex,'BLIND','Explicit blind roles must name funded distinct seats.');}
  requireThat(occupied.length!==2||sbIndex===buttonIndex,'BLIND','Heads-up the button is the small blind.');
  const antes={};let dead=0;
  const post=(index,amount,isAnte=false)=>{
    const p=players[index],paid=Math.min(p.stack,amount);p.stack-=paid;
    if(isAnte){dead+=paid;antes[p.id]=(antes[p.id]??0)+paid;}else{p.contributed+=paid;p.streetBet+=paid;}
  };
  if(ordinaryAnte)players.forEach((_,i)=>post(i,ordinaryAnte,true));
  if(sbIndex>=0)post(sbIndex,sb);post(bbIndex,bb);
  if(bba)post(bbIndex,bba,true); // Tournament BBA: live big blind has priority when short.
  const able=players.filter(p=>p.stack>0),nominal=able.length>1&&Math.max(...players.map(p=>p.streetBet))<bb;
  const ordered=[...players.slice(bbIndex+1),...players.slice(0,bbIndex+1)];
  const actor=ordered.find(p=>p.stack>0)?.id??null;
  const roles={smallBlindSeat:sbIndex>=0?players[sbIndex].id:null,bigBlindSeat:players[bbIndex].id};
  const start={street:'preflop',board:[],button,hero,bigBlind,...(sb*2!==bb?{smallBlind}:{}),lastFullRaise:bigBlind,unit,blindSeats:roles,seats:players.map(p=>({id:p.id,...(p.name!==undefined?{name:p.name}:{}),...(p.avatar!==undefined?{avatar:p.avatar}:{}),stack:p.stack/100,contributed:p.contributed/100,streetBet:p.streetBet/100,...(p.folded?{folded:true}:{}),hole:p.folded?[]:clone(p.hole??[])})),actor,roundClosed:!actor,...(dead?{deadPot:dead/100,antePaid:Object.fromEntries(Object.entries(antes).map(([id,value])=>[id,value/100]))}:{}),...(nominal?{forcedBet:bigBlind}:{}),...(rake?{rake:clone(rake)}:{})};
  const state=loadState(start);nextActor(state,players[bbIndex].id);integrity(state);
  start.actor=state.actor;start.roundClosed=state.roundClosed;
  for(const p of start.seats){const actual=player(state,p.id);p.stack=actual.stack/100;p.contributed=actual.contributed/100;p.streetBet=actual.streetBet/100;}
  // An all-in blind can cause immediate unmatched-bet return before any authored action.
  if(start.roundClosed)delete start.forcedBet;
  loadState(start);return start;
}
