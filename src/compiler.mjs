import {loadState,transition,observe as observeState} from './poker/rules.mjs';
import {check,errorJSON} from './errors.mjs';
import {projectSchema,outputSchema,voiceProfile,timingProfile} from './project/schema.mjs';
import {clone,hash} from './util.mjs';
import {verifyAudio} from './media/audio.mjs';
import {effectiveDirection} from './direction/index.mjs';
import {compileAnalysis} from './analysis/index.mjs';
import {verifyEvidence} from './analysis/evidence.mjs';
import {compilePresentations} from './presentation.mjs';
import {variantReviewHash} from './project/variants.mjs';
import {route} from './project/routes.mjs';
export {route} from './project/routes.mjs';

export const profiles={draft:{short:720,fps:24},final:{short:1080,fps:30}};
export function selectedRoutes(project,output={}){
  const selected={...project.output,...output};
  if((Object.hasOwn(output,'sceneId')||Object.hasOwn(output,'branchId'))&&!Object.hasOwn(output,'sequence'))selected.sequence=null;
  outputSchema(selected);
  const entries=selected.sequence??[{id:null,sceneId:selected.sceneId,branchId:selected.branchId}];
  return {selected,entries:entries.map(entry=>{
    const scene=project.lesson.scenes.find(s=>s.id===entry.sceneId);check(scene,'SCENE_UNKNOWN','Unknown scene.','output/sequence');
    route(scene,entry.branchId);return {entryId:entry.id,scene,branchId:entry.branchId??null};
  })};
}
export function compileProject(project,packs,{output={},view='player'}={}){
  projectSchema(project);const {selected,entries}=selectedRoutes(project,output),pack=packs[selected.locale];
  check(pack,'LOCALE','Install the complete locale dictionary.','output/locale',{available:Object.keys(packs)});
  const profile=profiles[selected.profile],fps=profile.fps,issues=[],frames=[],directions=[];let tick=0;
  const ticks=seconds=>Math.max(1,Math.ceil(seconds*fps-1e-9)),at=seconds=>Math.ceil(seconds*fps-1e-9);
  const text=(map,path,target)=>{if(typeof map?.[selected.locale]!=='string'||!map[selected.locale].trim()){issues.push({code:'TRANSLATION_MISSING',path:path+'/'+selected.locale,message:'Missing selected-language text.',retryable:false,...(target?{target}:{})});return '…';}return map[selected.locale];};
  let title='';
  for(const {entryId,scene,branchId}of entries){
    const sceneTitle=text(scene.title,`scenes/${scene.id}/title`);if(!title)title=sceneTitle;
    if(branchId)text(scene.branches.find(b=>b.id===branchId).label,`branches/${branchId}/label`);
    const direction=effectiveDirection(project,scene);directions.push({entryId,sceneId:scene.id,direction});
    if(direction){for(const key of ['name','summary'])text(direction.profile[key],`scenes/${scene.id}/direction/${key}`);for(const key of ['guidance','checks'])if(!direction.profile[key][selected.locale]?.length)issues.push({code:'TRANSLATION_MISSING',path:`scenes/${scene.id}/direction/${key}/${selected.locale}`,message:'Missing selected-language direction.',retryable:false});}
    let state=loadState(scene.start),revealed=[],stateStart=tick/fps,stateEvent=null,nodeIndex=0;
    const teaching=scene.analysis?.length||route(scene,branchId).some(b=>b.presentation);
    if(scene.variant&&scene.variant.reviewHash!==variantReviewHash(scene))issues.push({code:'VARIANT_REVIEW',path:`scenes/${scene.id}/variant`,message:'Review changed conditions, dependent narration and conclusions through scene.review.',retryable:false});
    const appearance={tableName:'Orion 06',felt:'#1b5850',...scene.appearance};
    function add(beat,part,event,count,cue=null,actionIndex=typeof part==='number'?part:null){
      const visible=clone(state);visible.revealed=[...new Set([...visible.revealed,...revealed])];const snapshot=observeState(visible,{view});
      snapshot.seats.forEach(p=>{p.avatar=scene.start.seats.find(s=>s.id===p.id)?.avatar??p.name.slice(0,1);});
      const localId=part===null?beat.id:`${beat.id}::${part}`,id=entryId===null?localId:`${entryId}::${localId}`;
      frames.push({id,sceneId:scene.id,entryId,branchId,beatId:beat.id,actionIndex,...(teaching?{nodeIndex}:{}),label:text(beat.label,`beats/${beat.id}/label`,{sceneId:scene.id,entryId,beatId:beat.id}),event:clone(event),stateStart,stateEvent:clone(stateEvent),startFrame:tick,endFrame:tick+count,start:tick/fps,end:(tick+count)/fps,duration:count/fps,narration:cue?.text??'',audio:cue?.audio??null,...(cue?{narrationId:cue.id,narrationStart:cue.start,narrationDuration:cue.duration,speaker:beat.speaker??null,captionCues:beat.captionCues?.[selected.locale]?.cues??null}:{}),state:stateInBB(snapshot),appearance});tick+=count;
    }
    for(const beat of route(scene,branchId)){
      const target={sceneId:scene.id,entryId,beatId:beat.id};
      if(beat.view){revealed=beat.view.reveal;for(const id of revealed)check(state.seats.some(s=>s.id===id),'REVEAL','Unknown revealed seat.',`beats/${beat.id}/view/reveal`);}
      const narration=beat.narration?text(beat.narration,`beats/${beat.id}/narration`,target):'';
      const ref=beat.audio?.[selected.locale],asset=ref?project.assets[ref.assetId]:null;let audio=null;
      if(narration){
        if(!ref||!asset)issues.push({code:'AUDIO_MISSING',path:`beats/${beat.id}/audio/${selected.locale}`,message:'Generate or attach narration audio.',retryable:false,target});
        else if(ref.textHash!==hash(narration)||(ref.voiceHash&&ref.voiceHash!==hash(voiceProfile(project,selected.locale,beat))))issues.push({code:'AUDIO_STALE',path:`beats/${beat.id}/audio/${selected.locale}`,message:'Narration or voice settings changed after this audio was produced.',retryable:false,target});
        else audio={assetId:ref.assetId,locale:selected.locale,duration:asset.duration,path:asset.path};
      }
      const actions=beat.actions??[],actionHold=beat.actionHold??.7,hold=beat.hold??1.2,timing=timingProfile(beat,selected.locale);
      if(timing&&narration&&(!ref||beat.timing.audioHashes?.[selected.locale]!==ref.assetId))issues.push({code:'TIMING_STALE',path:`beats/${beat.id}/timing/${selected.locale}`,message:'Review action/speech timing against the current audio through timing.set.',retryable:false,target});
      const captionSettings=beat.captionCues?.[selected.locale],captions=captionSettings?.cues;
      if(captionSettings&&(!captionSettings.audioHash||captionSettings.audioHash!==ref?.assetId||!captions.length))issues.push({code:'CAPTION_STALE',path:`beats/${beat.id}/captionCues/${selected.locale}`,message:'Confirm precise caption timing against the current audio through captions.set.',retryable:false,target});
      if(audio&&captions?.at(-1)?.end>audio.duration+1e-6)issues.push({code:'CAPTION_TIMING',path:`beats/${beat.id}/captionCues/${selected.locale}`,message:'Caption cues exceed the measured speech duration.',retryable:false,target});
      if(captions?.some(c=>{const near=Math.floor(c.start*fps),first=near/fps>=c.start?near:near+1;return first/fps>=Math.min(c.end,audio?.duration??Infinity);}))issues.push({code:'CAPTION_TIMING',path:`beats/${beat.id}/captionCues/${selected.locale}`,message:'Every caption cue must cover a visible frame at the selected frame rate.',retryable:false,target});
      const act=i=>{try{state=transition(state,actions[i]);nodeIndex++;stateStart=tick/fps;stateEvent=clone(actions[i]);}catch(e){e.path=`scenes/${scene.id}/beats/${beat.id}/actions/${i}`;throw e;}};
      const cue=start=>narration?{id:entryId===null?beat.id:`${entryId}::${beat.id}`,start,duration:audio?.duration??hold,text:narration,audio}:null;
      if(!timing){
        for(let i=0;i<actions.length;i++){act(i);add(beat,i,actions[i],ticks(i===actions.length-1&&!narration?Math.max(actionHold,hold):actionHold));}
        if(!actions.length||narration)add(beat,null,null,ticks(Math.max(hold,(audio?.duration??0)+.35)),cue(tick/fps));
        continue;
      }
      // One schedule owns both state changes and the continuous narration clock.
      const startTick=tick,actionTicks=timing.actions.map(at),narrationTick=at(timing.narration??0),speechTicks=ticks(audio?.duration??hold);
      check(new Set(actionTicks).size===actionTicks.length,'TIMING_COLLISION','Action times collide at the selected frame rate.',`beats/${beat.id}/timing/actions`);
      const end=Math.max(ticks(hold),...(actionTicks.map(t=>t+ticks(actionHold))),narration?narrationTick+ticks((audio?.duration??hold)+.35):0);
      const boundaries=[...new Set([0,...actionTicks,...(narration?[narrationTick,narrationTick+speechTicks]:[]),end])].filter(t=>t<=end).sort((a,b)=>a-b),speech=cue((startTick+narrationTick)/fps);
      for(let i=0;i<boundaries.length-1;i++){
        const offset=boundaries[i],actionIndex=actionTicks.indexOf(offset);if(actionIndex>=0)act(actionIndex);
        add(beat,`t${offset}`,actionIndex>=0?actions[actionIndex]:null,boundaries[i+1]-offset,narration&&offset>=narrationTick&&offset<narrationTick+speechTicks?speech:null,actionIndex>=0?actionIndex:null);
      }
    }
  }
  const short=profile.short,plan={format:'river.plan',version:2,projectId:project.projectId,revision:project.revision,projectHash:contentHash(project),title,...selected,fps,width:selected.aspect==='portrait'?short:short*16/9,height:selected.aspect==='portrait'?short*16/9:short,duration:tick/fps,totalFrames:tick,frames,issues,dictionary:pack,appearance:frames[0].appearance,directions};
  const course=project.lesson.course;
  if(course&&selected.sequence&&JSON.stringify(selected.sequence.map(e=>e.sceneId))!==JSON.stringify(course.episodes.map(e=>e.sceneId)))plan.advisories=[{code:'COURSE_ORDER_REVIEW',path:'lesson/course/episodes',message:'Programme order differs from the course brief. Review prerequisites, repetition and answer disclosure; update the course brief if this order is intentional.'}];
  return compilePresentations(plan,project,{compileAnalysis,stateInBB,route});
}
export function contentHash(project){return hash({format:project.format,version:project.version,lesson:project.lesson,output:project.output,assets:project.assets,...(project.voice?{voice:project.voice}:{}),...(project.direction?{direction:project.direction}:{})});}
export function stateInBB(state){
  const s=clone(state);for(const k of ['bigBlind','lastFullRaise','bankroll','pot','potAtAward'])s[k]/=100;
  s.actedAt=Object.fromEntries(Object.entries(s.actedAt).map(([k,v])=>[k,v/100]));
  for(const p of s.seats){for(const k of ['stack','contributed','streetBet'])p[k]/=100;if(p.action){p.action.to/=100;p.action.amount/=100;}}
  for(const p of [...s.pots,...s.payouts,...s.refunds])p.amount/=100;s.unit='BB';return s;
}
export async function validateProject(project,packs,{directory,output={},media=false,all=false}={}){
  projectSchema(project);const selections=all?project.lesson.scenes.flatMap(s=>[null,...(s.branches??[]).map(b=>b.id)].flatMap(branchId=>Object.keys(packs).map(locale=>({sceneId:s.id,branchId,locale,sequence:null})))):[output];
  const results=[];
  for(const overrides of selections){
    let selected={...project.output,...overrides};
    try{
      selected=selectedRoutes(project,overrides).selected;
      const plan=compileProject(project,packs,{output:selected}),issues=clone(plan.issues);
      if(media){const seen=new Set();for(const f of plan.frames){if(!f.audio||seen.has(f.audio.assetId))continue;seen.add(f.audio.assetId);try{await verifyAudio(directory,project.assets[f.audio.assetId]);}catch(e){issues.push(errorJSON(e));}}}
      if(media){const seen=new Set();for(const f of plan.frames){const evidence=f.presentation?.analysis?.evidence,key=evidence&&JSON.stringify([evidence.source,evidence.sha256]);if(!evidence?.source||seen.has(key))continue;seen.add(key);try{await verifyEvidence(directory,evidence);}catch(e){issues.push(errorJSON(e));}}}
      results.push({output:selected,ready:issues.length===0,duration:plan.duration,frames:plan.totalFrames,issues});
    }catch(e){results.push({output:selected,ready:false,issues:[errorJSON(e)]});}
  }
  return {scope:all?'all':'selected',mediaChecked:media,ready:results.every(r=>r.ready),results};
}
