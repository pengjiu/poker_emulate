import {narrationCues,subtitleCues} from '../client/render.mjs';
import {clone,hash} from '../util.mjs';

const pick=(value,fields)=>Object.fromEntries(fields.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
const reference=analysis=>pick(analysis,['id','decisionHash']);
const materials=p=>[p?.analysis,p?.comparison?.origin,...(p?.comparison?.routes??[]).flatMap(r=>[r.start,r.end])].filter(Boolean);
function analysisSummary(analysis){
  const summary=pick(analysis,['id','decisionHash','title','status','calculation','metrics']);
  if(analysis.range){summary.range=pick(analysis.range,['seat','coverage','overlaps','combinationCount','blockedCount','weightedCount','units','groups','actions','equity','ev']);
    if(analysis.range.matrix)summary.range.hands=analysis.range.matrix.filter(cell=>cell.combinationCount>0).map(cell=>pick(cell,['hand','combinationCount','availableCombinations','weight','weightedCount','rangeShare','actions','equity','ev']));}
  return summary;
}
function visualSummary(p){
  const summary={surface:p?.surface??'table',show:p?.surface==='analysis'?p.show:[],analysisId:p?.analysis?.id??null,...pick(p,['focus','title','question','camera','cameraStart','rangeView','motion'])};
  if(p?.annotations)summary.annotations=p.annotations.map(({source,points,...value})=>({...value,...(source?{sourceHash:hash(source)}:{}),...(points?{pointCount:points.length,pointsHash:hash(points)}:{})}));
  if(p?.comparison)summary.comparison={mode:p.comparison.mode,origin:reference(p.comparison.origin),routes:p.comparison.routes.map(r=>({...pick(r,['id','label','actions','differences']),start:reference(r.start),end:reference(r.end)}))};
  return summary;
}
function stateSummary(frame,at){
  const state=frame.state;
  return {at,...pick(state,['street','board','unit','button','hero','actor','pot','bigBlind','smallBlind','roundClosed','settled','legalActions','payouts','refunds']),toCall:state.legalActions.find(action=>action.type==='call')?.amount??null,
    seats:state.seats.map(seat=>pick(seat,['id','name','hole','stack','contributed','streetBet','folded','action']))};
}

// A read-only projection of the player RenderPlan, never an action or timing executor.
export function storyboard(plan){
  const groups=new Map();for(const frame of plan.frames){const key=JSON.stringify([frame.entryId,frame.sceneId,frame.beatId]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(frame);}
  const beats=[...groups.values()].map(frames=>{
    const first=frames[0],spoken=frames.find(frame=>frame.narration),cue=narrationCues({frames})[0],narration=cue?{start:cue.start,end:cue.start+cue.duration,text:cue.text,estimated:!cue.audio}:null;
    const actions=[...new Map(frames.filter(frame=>frame.event).map(frame=>[frame.actionIndex,{at:frame.start,index:frame.actionIndex,event:frame.event,narrationPhase:!narration?null:frame.start<narration.start?'before':frame.start<narration.end?'during':'after'}])).values()];
    const visuals=[];let previous;
    for(const frame of frames){const visual=visualSummary(frame.presentation),key=hash(visual);if(key===previous)visuals.at(-1).end=frame.end;else visuals.push({start:frame.start,end:frame.end,...visual});previous=key;}
    const analyses=[...new Map(frames.flatMap(frame=>materials(frame.presentation).map(analysis=>[JSON.stringify(reference(analysis)),analysisSummary(analysis)]))).values()];
    return {...pick(first,['entryId','sceneId','branchId','beatId','label']),role:spoken?.speaker??null,start:first.start,end:frames.at(-1).end,narration,state:stateSummary(spoken??first,narration?.start??first.start),actions,visuals,analyses,captions:subtitleCues({frames,aspect:plan.aspect})};
  });
  return clone({format:'river.storyboard',version:1,...pick(plan,['projectId','revision','projectHash','locale','aspect','profile','fps','duration']),captionsEnabled:plan.captions,issues:plan.issues,...(plan.advisories?{advisories:plan.advisories}:{}),beats});
}
