import {clone,hash} from '../util.mjs';
import {check} from '../errors.mjs';
import {loadState,transition,chips} from '../poker/rules.mjs';
import {route} from './routes.mjs';

// Presentation, voice assets and review stamps do not change the authored poker
// argument. Facts, hypotheses and every dependent script do.
export function variantReviewHash(scene) {
  const passage = beat => ({id: beat.id, actions: beat.actions, narration: beat.narration, view: beat.view});
  return hash({
    start: scene.start,
    beats: scene.beats.map(passage),
    branches: (scene.branches ?? []).map(branch => ({id: branch.id, from: branch.from, beats: branch.beats.map(passage)})),
    analysis: (scene.analysis ?? []).map(({review, ...material}) => material),
    change: scene.variant?.change
  });
}

/** Only source poker facts participate; renaming a title does not change provenance. */
export function scenePokerHash(scene) {
  const passage = beat => ({id:beat.id,actions:beat.actions,view:beat.view});
  return hash({start:scene.start,beats:scene.beats.map(passage),branches:(scene.branches??[]).map(branch=>({id:branch.id,from:branch.from,beats:branch.beats.map(passage)}))});
}
const text = (value,path) => check(typeof value==='string'&&value.trim(),'VARIANT','Use nonempty text.',path);
function keys(value,allowed,path) {
  check(value&&typeof value==='object'&&!Array.isArray(value),'VARIANT','Expected an object.',path);
  for(const key of Object.keys(value))check(allowed.includes(key),'UNKNOWN_FIELD',`Unknown variant field: ${key}`,path+'/'+key);
}
const card = value => typeof value==='string'&&/^[2-9TJQKA][cdhs]$/.test(value);
const index = (value,path) => check(Number.isSafeInteger(value)&&value>=0,'VARIANT','Use a zero-based index.',path);
function replay(scene) {
  for(const branch of [null,...(scene.branches??[]).map(b=>b.id)]) {
    let state=loadState(scene.start);
    for(const beat of route(scene,branch))for(const action of beat.actions??[])state=transition(state,action);
  }
}
export function variantSchema(value,path='variant') {
  keys(value,['sourceSceneId','sourceHash','sourceHashKind','change','reviewHash'],path);text(value.sourceSceneId,path+'/sourceSceneId');
  check(/^[a-f0-9]{64}$/.test(value.sourceHash),'VARIANT','Invalid source fingerprint.',path+'/sourceHash');
  if(value.sourceHashKind!==undefined)check(value.sourceHashKind==='poker','VARIANT','Unknown source fingerprint version.',path+'/sourceHashKind');
  check(value.reviewHash===null||/^[a-f0-9]{64}$/.test(value.reviewHash),'VARIANT','Review state must be explicit.',path+'/reviewHash');
  const c=value.change,p=path+'/change',kind=c?.kind??'action';
  check(['action','board','hole','stack'].includes(kind),'VARIANT','Unknown condition type.',p+'/kind');
  keys(c,['kind','beatId','actionIndex','cardIndex','seatId','before','after'],p);
  if(kind==='action') {
    text(c.beatId,p+'/beatId');index(c.actionIndex,p+'/actionIndex');
    for(const key of ['before','after'])check(c[key]&&typeof c[key].type==='string','VARIANT','An action record is required.',p+'/'+key);
  } else if(kind==='board') {
    index(c.cardIndex,p+'/cardIndex');check(card(c.before)&&card(c.after),'VARIANT','Board changes contain valid cards.',p);
    if(c.beatId!==undefined){text(c.beatId,p+'/beatId');index(c.actionIndex,p+'/actionIndex');}
    else check(c.actionIndex===undefined,'VARIANT','An action index requires a deal beat.',p);
  } else {
    text(c.seatId,p+'/seatId');
    if(kind==='stack'){chips(c.before);chips(c.after);}
    else for(const key of ['before','after'])check(Array.isArray(c[key])&&[0,2].includes(c[key].length)&&c[key].every(card)&&new Set(c[key]).size===c[key].length,'VARIANT','Hole cards must be empty or two unique cards.',p+'/'+key);
  }
}

/** Replace one declared input, then replay every continuation atomically. */
export function createVariant(source,value) {
  keys(value,['id','title','change'],'variant');text(value.id,'variant/id');
  check(value.id!==source.id,'VARIANT','Choose a new scene ID.','variant/id');
  check(value.title&&typeof value.title==='object'&&!Array.isArray(value.title)&&Object.values(value.title).every(v=>typeof v==='string'),'VARIANT','Use a localized title.','variant/title');
  const input=value.change,kind=input?.kind??'action',scene=clone(source);let change;
  check(['action','board','hole','stack'].includes(kind),'VARIANT','Choose action, board, hole or stack.','variant/change/kind');
  if(kind==='action') {
    keys(input,['kind','beatId','actionIndex','action'],'variant/change');index(input.actionIndex,'variant/change/actionIndex');
    const beat=[...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===input.beatId);
    check(beat?.actions?.[input.actionIndex],'VARIANT','Choose an existing action.','variant/change');
    change={...(input.kind?{kind}:{}),beatId:input.beatId,actionIndex:input.actionIndex,before:clone(beat.actions[input.actionIndex]),after:clone(input.action)};
    beat.actions[input.actionIndex]=clone(input.action);
  } else if(kind==='board') {
    keys(input,['kind','beatId','actionIndex','cardIndex','card'],'variant/change');index(input.cardIndex,'variant/change/cardIndex');
    check(card(input.card),'VARIANT','Choose a valid replacement card.','variant/change/card');
    let cards=scene.start.board;
    if(input.beatId!==undefined) {
      index(input.actionIndex,'variant/change/actionIndex');
      const beat=[...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===input.beatId),action=beat?.actions?.[input.actionIndex];
      check(action?.type==='deal','VARIANT','A board change must target a deal action.','variant/change');cards=action.cards;
    } else check(input.actionIndex===undefined,'VARIANT','An action index needs a deal beat.','variant/change');
    check(cards?.[input.cardIndex],'VARIANT','Choose an existing board card.','variant/change/cardIndex');
    change={kind,...(input.beatId!==undefined?{beatId:input.beatId,actionIndex:input.actionIndex}:{}),cardIndex:input.cardIndex,before:cards[input.cardIndex],after:input.card};
    cards[input.cardIndex]=input.card;
  } else {
    keys(input,['kind','seatId',kind==='hole'?'cards':'stack'],'variant/change');
    const seat=scene.start.seats.find(p=>p.id===input.seatId);check(seat,'SEAT_UNKNOWN','Choose an existing seat.','variant/change/seatId');
    const field=kind==='hole'?'hole':'stack',next=kind==='hole'?input.cards:input.stack;
    change={kind,seatId:input.seatId,before:clone(seat[field]??[]),after:clone(next)};seat[field]=clone(next);
  }
  check(hash(change.before)!==hash(change.after),'VARIANT','The declared condition must actually change.','variant/change');
  scene.id=value.id;scene.title=clone(value.title);
  delete scene.continuity;
  scene.variant={sourceSceneId:source.id,sourceHash:scenePokerHash(source),sourceHashKind:'poker',change,reviewHash:null};
  variantSchema(scene.variant);
  // Preserve the earlier review as provenance. Its decision/material fingerprints
  // distinguish changed conditions from never-reviewed material; the variant itself
  // still requires an explicit scene review even when an earlier node is unaffected.
  replay(scene);return scene;
}

export function variantIssues(project) {
  const issues=[];
  for(const scene of project.lesson.scenes)if(scene.variant?.sourceHashKind==='poker') {
    const source=project.lesson.scenes.find(s=>s.id===scene.variant.sourceSceneId);
    if(!source||scenePokerHash(source)!==scene.variant.sourceHash)issues.push({code:'VARIANT_SOURCE_STALE',message:'The source history changed; rebuild or explicitly rebase the condition variant.',path:`scenes/${scene.id}/variant/sourceHash`,retryable:false,target:{sceneId:scene.id,beatId:scene.beats[0]?.id}});
  }
  return issues;
}
