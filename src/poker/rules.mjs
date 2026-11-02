// Pure poker rules. All internal amounts are integer hundredths of a BB.
import {fail} from "../errors.mjs";
export const clone = x => structuredClone(x);
export {RiverError as PokerError} from '../errors.mjs';
const requireThat = (yes, code, message, detail) => { if (!yes) fail(code, message, "state", detail); };
export function chips(value) {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'CHIP_AMOUNT', 'Chip amounts must be nonnegative numbers with at most two decimal places.');
  return Math.round(value * 100);
}
const total = values => values.reduce((a, b) => a + b, 0);
export const potValue = s => s.settled ? 0 : total(s.seats.map(p => p.contributed));
export const bankroll = s => total(s.seats.map(p => p.stack)) + potValue(s);
const active = s => s.seats.filter(p => !p.folded);
const actionable = s => active(s).filter(p => p.stack > 0);
const maxBet = s => Math.max(0, ...s.seats.map(p => p.streetBet));
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
  const bet = maxBet(s), able = actionable(s);
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
  requireThat(new Set(s.seats.map(p=>p.id)).size === s.seats.length && s.seats.every(p=>typeof p.id==='string' && p.id), 'SEAT_ID', 'Seat IDs must be unique nonempty strings.');
  player(s,s.button); player(s,s.hero);
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
  const p = player(s,id), bet = maxBet(s), call = Math.min(p.stack,bet-p.streetBet);
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
function settleUncontested(s) {
  refundUncalled(s);
  const winner = active(s)[0], value = potValue(s);
  winner.stack += value;
  s.potAtAward = value; s.payouts = [{seat:winner.id,amount:value,pot:0}];
  s.settled = true; s.roundClosed=true; s.actor=null;
}
export function sidePots(s) {
  const levels = [...new Set(s.seats.map(p=>p.contributed).filter(Boolean))].sort((a,b)=>a-b);
  let prior = 0;
  const pots=[];
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
export function evaluate(cards) {
  requireThat(cards.length===7 && new Set(cards).size===7, 'SHOWDOWN_CARDS', 'Hand evaluation needs seven unique cards.');
  let best=-1;
  for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)for(let d=c+1;d<6;d++)for(let e=d+1;e<7;e++) best=Math.max(best,rankFive([cards[a],cards[b],cards[c],cards[d],cards[e]]));
  return best;
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
    s.seats.forEach(p=>{p.streetBet=0;p.action=null;});
    const can=actionable(s);
    s.actor=can.length>1?clockwise(s,s.button).find(p=>!p.folded && p.stack>0)?.id:null;
    s.roundClosed=!s.actor;
  } else if(command.type==='showdown') {
    requireThat(s.roundClosed && s.board.length===5, 'SHOWDOWN_NOT_READY', 'Showdown requires a complete board and a closed betting round.');
    const ranks=Object.fromEntries(active(s).map(p=>[p.id,evaluate([...p.hole,...s.board])]));
    const pots=sidePots(s); s.potAtAward=potValue(s); s.payouts=[];
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
