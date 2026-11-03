import {check,errorJSON} from '../errors.mjs';
import {clone,hash} from '../util.mjs';
import {chips,loadState,transition,observe,displayState,createHand} from '../poker/rules.mjs';
import {route} from './routes.mjs';
import {decisionFingerprint} from '../analysis/index.mjs';

function keys(value,allowed,path) {
  check(value&&typeof value==='object'&&!Array.isArray(value),'SESSION','Expected an object.',path);
  for(const key of Object.keys(value))check(allowed.includes(key),'UNKNOWN_FIELD',`Unknown session field: ${key}`,path+'/'+key);
}
const text=(value,path)=>check(typeof value==='string'&&value.trim(),'SESSION','Use nonempty text.',path);
function textMap(value,path){keys(value,Object.keys(value??{}),path);check(Object.keys(value).length,'SESSION','Provide localized text.',path);for(const [locale,label]of Object.entries(value))text(label,path+'/'+locale);}
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function unique(values,path){check(Array.isArray(values),'SESSION','Expected an array.',path);const seen=new Set();for(const value of values){text(value.id,path+'/id');check(!seen.has(value.id),'SESSION','IDs must be unique.',path+'/'+value.id);seen.add(value.id);}}
function adjustmentsSchema(values,path) {
  check(Array.isArray(values),'SESSION','Adjustments must be an array.',path);
  const seen=new Set();
  for(const [i,value]of values.entries()) {
    const p=path+'/'+i;keys(value,['seatId','amount','leave','join','reason'],p);text(value.reason,p+'/reason');
    const join=Object.hasOwn(value,'join');
    if(join){keys(value.join,['id','name','avatar','stack','hole'],p+'/join');text(value.join.id,p+'/join/id');chips(value.join.stack);check(value.join.stack>0,'SESSION','A joining player needs a positive stack.',p+'/join/stack');check(value.seatId===undefined&&value.amount===undefined&&value.leave===undefined,'SESSION','Join is one separate adjustment.',p);}
    else{text(value.seatId,p+'/seatId');check((value.leave===true)!==Object.hasOwn(value,'amount'),'SESSION','Choose either a withdrawal/deposit or leaving.',p);if(value.amount!==undefined){check(Number.isFinite(value.amount)&&value.amount!==0,'SESSION','Supply a nonzero finite adjustment.',p+'/amount');chips(Math.abs(value.amount));}}
    const id=join?value.join.id:value.seatId;check(!seen.has(id),'SESSION','Use one adjustment per player.',p);seen.add(id);
  }
}
function levelSchema(level,path) {
  keys(level,['bigBlind','smallBlind','ante','bigBlindAnte','rake','unit','buttonRule'],path);chips(level.bigBlind);check(level.bigBlind>0,'BLIND','Big blind must be positive.',path+'/bigBlind');
  for(const key of ['smallBlind','ante','bigBlindAnte'])if(level[key]!==undefined)chips(level[key]);
  if(level.unit!==undefined)check(['BB','chips'].includes(level.unit),'CHIP_UNIT','Use BB or chips.',path+'/unit');
  if(level.buttonRule!==undefined)check(['moving','dead'].includes(level.buttonRule),'SESSION','Use moving or dead button rules.',path+'/buttonRule');
}
export function continuitySchema(value,path='continuity') {
  keys(value,['sourceSceneId','sourceBranchId','sourceHash','adjustments','level','holes','hero'],path);text(value.sourceSceneId,path+'/sourceSceneId');
  check(value.sourceBranchId===null||typeof value.sourceBranchId==='string','SESSION','Use a branch ID or null.',path+'/sourceBranchId');
  check(digest(value.sourceHash),'SESSION','Source identity is produced by session.next.',path+'/sourceHash');
  adjustmentsSchema(value.adjustments,path+'/adjustments');levelSchema(value.level,path+'/level');text(value.hero,path+'/hero');
  keys(value.holes,Object.keys(value.holes??{}),path+'/holes');
  for(const [seat,cards]of Object.entries(value.holes))check(Array.isArray(cards)&&[0,2].includes(cards.length)&&cards.every(c=>/^[2-9TJQKA][cdhs]$/.test(c))&&new Set(cards).size===cards.length,'CARD_INVALID','Use two unique cards or no assigned cards.',path+'/holes/'+seat);
}
export function sessionSchema(value,path='lesson/session') {
  keys(value,['id','title','hands','observations'],path);text(value.id,path+'/id');textMap(value.title,path+'/title');
  check(Array.isArray(value.hands)&&value.hands.length>0,'SESSION','A session needs an ordered hand list.',path+'/hands');
  const hands=new Set();for(const [i,hand]of value.hands.entries()){const p=path+'/hands/'+i;keys(hand,['sceneId','branchId'],p);text(hand.sceneId,p+'/sceneId');check(hand.branchId===undefined||hand.branchId===null||typeof hand.branchId==='string','SESSION','Use an optional branch ID.',p+'/branchId');check(!hands.has(hand.sceneId),'SESSION','A session hand appears once.',p);hands.add(hand.sceneId);}
  if(value.observations!==undefined){unique(value.observations,path+'/observations');for(const [i,note]of value.observations.entries()){
    const p=path+'/observations/'+i;keys(note,['id','sceneId','branchId','beatId','actionIndex','seatId','kind','text','sourceHash'],p);
    for(const key of ['sceneId','beatId','seatId'])text(note[key],p+'/'+key);
    check(note.branchId===undefined||note.branchId===null||typeof note.branchId==='string','SESSION','Use an optional branch ID.',p+'/branchId');
    check(Number.isSafeInteger(note.actionIndex)&&note.actionIndex>=0,'SESSION','Reference a completed action.',p+'/actionIndex');
    check(['observed','inference'].includes(note.kind),'SESSION','Separate an observation from an inference.',p+'/kind');textMap(note.text,p+'/text');
    if(note.sourceHash!==undefined)check(digest(note.sourceHash),'SESSION','Invalid observation identity.',p+'/sourceHash');
  }}
}
function sourceResult(scene,branchId=null) {
  let state=loadState(scene.start);const history=[];
  for(const beat of route(scene,branchId))for(const action of beat.actions??[]){state=transition(state,action);history.push(clone(action));}
  return {state,sourceHash:hash({start:scene.start,branchId,history})};
}
function nextSetup(project,value) {
  const source=project.lesson.scenes.find(s=>s.id===value.sourceSceneId);check(source,'SCENE_UNKNOWN','The previous hand does not exist.','session/sourceSceneId');
  const branchId=value.sourceBranchId??null,{state,sourceHash}=sourceResult(source,branchId);
  check(state.settled,'SESSION_UNSETTLED','Settle the previous hand before carrying its stacks forward.','session/sourceSceneId');
  const level=clone(value.level??source.continuity?.level??{bigBlind:source.start.bigBlind??1,...(source.start.smallBlind!==undefined?{smallBlind:source.start.smallBlind}:{}),...(source.start.rake?{rake:source.start.rake}:{}),...(source.start.unit?{unit:source.start.unit}:{})});
  if(level.bigBlind!==1&&level.unit===undefined)level.unit='chips';levelSchema(level,'session/level');
  const buttonRule=level.buttonRule??(level.unit==='chips'?'dead':'moving');
  const adjustments=clone(value.adjustments??[]);adjustmentsSchema(adjustments,'session/adjustments');
  let seats=state.seats.map(p=>({id:p.id,name:p.name,avatar:source.start.seats.find(s=>s.id===p.id)?.avatar,stack:p.stack/100,hole:[]}));
  for(const change of adjustments){
    if(change.join){check(!seats.some(p=>p.id===change.join.id),'SEAT_ID','A joining player ID is already seated.','session/adjustments');const vacant=seats.findIndex(p=>p.stack===0);if(seats.length>=9&&vacant>=0)seats[vacant]=clone(change.join);else seats.push(clone(change.join));continue;}
    const seat=seats.find(p=>p.id===change.seatId);check(seat,'SEAT_UNKNOWN','The adjusted player does not exist.','session/adjustments');
    if(change.leave){if(buttonRule==='dead')seat.stack=0;else seats=seats.filter(p=>p!==seat);}
    else {const amount=Math.round(change.amount*100),next=chips(seat.stack)+amount;check(next>=0,'SESSION_STACK','A withdrawal exceeds the settled stack.','session/adjustments');seat.stack=next/100;}
  }
  if(buttonRule==='moving')seats=seats.filter(p=>p.stack>0);const occupied=seats.filter(p=>p.stack>0);check(occupied.length>=2&&seats.length<=9,'SEAT_COUNT','A next hand needs 2–9 funded players in at most nine table positions.','session/adjustments');
  const holes=clone(value.holes??{});for(const [seatId,cards]of Object.entries(holes)){const seat=seats.find(p=>p.id===seatId&&p.stack>0);check(seat,'SEAT_UNKNOWN','Next-hand cards refer to an absent player.','session/holes/'+seatId);seat.hole=clone(cards);}
  const previous=state.seats.findIndex(p=>p.id===state.button),clockwise=[...state.seats.slice(previous+1),...state.seats.slice(0,previous+1)];
  let button=clockwise.find(p=>seats.some(s=>s.id===p.id&&s.stack>0))?.id??occupied[0].id,blindSeats;
  if(buttonRule==='dead') {
    const previousBB=source.start.blindSeats?.bigBlindSeat??state.seats[(previous+(state.seats.length===2?1:2))%state.seats.length].id;
    // Dead-button adjustments retain physical positions, even when a joining player
    // replaces an eliminated player ID in a full table's vacant blind slot.
    const oldBB=state.seats.findIndex(p=>p.id===previousBB);check(oldBB>=0&&seats[oldBB],'SESSION_SEAT','The former blind position must remain in the table.','session/adjustments');
    let bbIndex;for(let step=1;step<=seats.length;step++){const at=(oldBB+step)%seats.length;if(seats[at].stack>0){bbIndex=at;break;}}
    if(occupied.length===2){button=occupied.find(p=>p.id!==seats[bbIndex].id).id;blindSeats={smallBlindSeat:button,bigBlindSeat:seats[bbIndex].id};}
    else {const sbIndex=(bbIndex-1+seats.length)%seats.length;button=seats[(bbIndex-2+seats.length)%seats.length].id;blindSeats={smallBlindSeat:seats[sbIndex].stack>0?seats[sbIndex].id:null,bigBlindSeat:seats[bbIndex].id};}
  }
  const hero=value.hero??state.hero;check(seats.some(p=>p.id===hero&&p.stack>0),'SESSION_HERO','Choose a surviving hero after elimination or departure.','session/hero');
  const {buttonRule:unusedRule,...setupLevel}=level;
  const start=createHand({...setupLevel,seats,button,hero,...(blindSeats?{blindSeats}:{})});
  return {source,start,continuity:{sourceSceneId:source.id,sourceBranchId:branchId,sourceHash,adjustments,level,holes,hero}};
}
function observationSource(project,note,session=project.lesson.session) {
  const scene=project.lesson.scenes.find(s=>s.id===note.sceneId);check(scene,'SCENE_UNKNOWN','An observation hand is missing.','session/observations/'+note.id);
  const hand=session?.hands.find(h=>h.sceneId===note.sceneId);check(hand,'SESSION_OBSERVATION','An observation must belong to the recorded session.','session/observations/'+note.id);
  const playedBranch=hand.branchId??null,playedRoute=route(scene,playedBranch),addressedRoute=route(scene,note.branchId===undefined?playedBranch:note.branchId);
  const played=playedRoute.find(b=>b.id===note.beatId)?.actions?.[note.actionIndex],addressed=addressedRoute.find(b=>b.id===note.beatId)?.actions?.[note.actionIndex];
  check(played&&addressed&&hash(played)===hash(addressed),'SESSION_OBSERVATION_ROUTE','An observation must reference an action on the session’s recorded route; a shared prefix is allowed.','session/observations/'+note.id);
  let state=loadState(scene.start);
  for(const beat of playedRoute){
    if(beat.view)state.revealed=[...new Set([...state.revealed,...beat.view.reveal])];
    for(const [i,action]of (beat.actions??[]).entries()){
      state=transition(state,action);
      if(beat.id===note.beatId&&i===note.actionIndex){
        check(action.seat===note.seatId||action.type==='showdown'&&state.revealed.includes(note.seatId),'SESSION_OBSERVATION','A player observation must reference that player’s public action or an actually revealed showdown.','session/observations/'+note.id);
        const visible=observe(state);
        const sourceHash=hash({sceneId:scene.id,branchId:playedBranch,decisionHash:decisionFingerprint(scene,{beatId:note.beatId,actionIndex:note.actionIndex}),kind:note.kind,text:note.text});
        return {sourceHash,branchId:playedBranch,action:clone(action),street:visible.street,board:clone(visible.board),unit:state.displayUnit??'BB',publicState:displayState(visible)};
      }
    }
  }
  check(false,'SESSION_OBSERVATION','An observation must reference an existing completed player action.','session/observations/'+note.id);
}
/** Explicit author review binds a note to what was actually visible. */
export function reviewSession(project,value,reviewIds) {
  sessionSchema(value);const copy=clone(value);
  if(reviewIds!==undefined)check(Array.isArray(reviewIds)&&new Set(reviewIds).size===reviewIds.length&&reviewIds.every(id=>copy.observations?.some(n=>n.id===id)),'SESSION_OBSERVATION','Review IDs must name distinct submitted observations.','session.set/reviewIds');
  copy.observations=(copy.observations??[]).map(note=>{if(reviewIds!==undefined&&!reviewIds.includes(note.id))return note;const source=observationSource(project,note,copy);return {...note,branchId:source.branchId,sourceHash:source.sourceHash};});
  return copy;
}
export function resolveSessionObservations(project) {
  return (project.lesson.session?.observations??[]).map(note=>{
    try{const source=observationSource(project,note);return {...clone(note),...source,current:note.sourceHash===source.sourceHash};}
    catch(error){return {...clone(note),current:false,issue:errorJSON(error)};}
  });
}
export function continueSession(project,value) {
  keys(value,['sourceSceneId','sourceBranchId','id','title','hero','holes','adjustments','level','observations'],'session.next');text(value.id,'session.next/id');textMap(value.title,'session.next/title');
  check(!project.lesson.scenes.some(s=>s.id===value.id),'SCENE_DUPLICATE','The next hand needs a new scene ID.','session.next/id');
  const {source,start,continuity}=nextSetup(project,value);
  const scene={id:value.id,title:clone(value.title),start,beats:[{id:'setup',label:clone(value.title),hold:1.2}],continuity,...(source.appearance?{appearance:clone(source.appearance)}:{})};
  const session=clone(project.lesson.session??{id:'session',title:clone(value.title),hands:[{sceneId:source.id,branchId:value.sourceBranchId??null}],observations:[]});
  check(session.hands.at(-1)?.sceneId===source.id&&(session.hands.at(-1).branchId??null)===(value.sourceBranchId??null),'SESSION_ORDER','Continue the last recorded hand and its selected route.','session.next/sourceSceneId');
  session.hands.push({sceneId:scene.id,branchId:null});
  session.observations??=[];
  const notes=value.observations??[];
  for(const note of notes){check(!session.observations.some(n=>n.id===note.id),'SESSION','Observation IDs must be unique.','session.next/observations');const reviewed=reviewSession(project,{...session,observations:[note]}).observations[0];session.observations.push(reviewed);}
  continuitySchema(continuity);sessionSchema(session);return {scene,session};
}
export function sessionIssues(project) {
  const session=project.lesson.session,issues=[];if(!session)return issues;sessionSchema(session);
  const issue=(code,message,path,target)=>issues.push({code,message,path,retryable:false,...(target?{target}:{})});
  for(const [i,hand]of session.hands.entries()){
    const scene=project.lesson.scenes.find(s=>s.id===hand.sceneId),path=`lesson/session/hands/${i}`;
    if(!scene){issue('SESSION_SCENE','A recorded session hand is missing.',path);continue;}
    try{
      route(scene,hand.branchId??null);
      if(i>0){
        const c=scene.continuity,prior=session.hands[i-1];check(c&&c.sourceSceneId===prior.sceneId&&(c.sourceBranchId??null)===(prior.branchId??null),'SESSION_ORDER','Each hand must continue the preceding recorded hand.',path);
        continuitySchema(c);const next=nextSetup(project,c);
        check(c.sourceHash===next.continuity.sourceHash&&hash(scene.start)===hash(next.start),'SESSION_STALE','The previous outcome, blind level or carried stacks changed; regenerate this hand.',path);
      }
    }catch(error){const e=errorJSON(error);issue(e.code,e.message,e.path??path,{sceneId:scene.id,beatId:scene.beats[0]?.id});}
  }
  for(const note of session.observations??[]){
    try{check(session.hands.some(h=>h.sceneId===note.sceneId),'SESSION_OBSERVATION','An observation must belong to this session.','session/observations/'+note.id);const result=observationSource(project,note);check(note.sourceHash===result.sourceHash,'SESSION_OBSERVATION_STALE','Review the note against its changed public action and conditions.','session/observations/'+note.id);}
    catch(error){const e=errorJSON(error);issue(e.code,e.message,e.path,{sceneId:note.sceneId,beatId:note.beatId});}
  }
  return issues;
}

/** A selected later hand depends on every earlier hand in its recorded session. */
export function sessionIssuesForScenes(project,sceneIds) {
  const relevant=new Set(sceneIds),order=project.lesson.session?.hands.map(hand=>hand.sceneId)??[];
  for(const sceneId of sceneIds){const index=order.indexOf(sceneId);if(index>=0)for(const prior of order.slice(0,index+1))relevant.add(prior);}
  return sessionIssues(project).filter(issue=>!issue.target?.sceneId||relevant.has(issue.target.sceneId));
}
