import {loadState,transition,observe as observeState,displayState as stateInBB} from './poker/rules.mjs';
import {check,errorJSON} from './errors.mjs';
import {projectSchema,outputSchema,voiceProfile,timingProfile} from './project/schema.mjs';
import {clone,hash} from './util.mjs';
import {verifyAudio} from './media/audio.mjs';
import {effectiveDirection} from './direction/index.mjs';
import {compileAnalysis} from './analysis/index.mjs';
import {verifyEvidence} from './analysis/evidence.mjs';
import {compilePresentations} from './presentation.mjs';
import {variantReviewHash,variantIssues} from './project/variants.mjs';
import {route} from './project/routes.mjs';
import {compileSound} from './media/sound.mjs';
import {sessionIssuesForScenes,resolveSessionObservations} from './project/session.mjs';
import {practiceIssues} from './project/practice.mjs';
import {courseAdvisories} from './project/course.mjs';
export {route} from './project/routes.mjs';
export {displayState as stateInBB} from './poker/rules.mjs';

export const profiles={draft:{short:720,fps:24},final:{short:1080,fps:30}};
function timingBindingCurrent(beat,locale,audioHash){
  const ref=beat.audio?.[locale],estimate=beat.rehearsalDuration?.[locale];
  return ref?audioHash===ref.assetId:audioHash===null&&Number.isFinite(estimate)&&estimate>0;
}
export function selectedRoutes(project,output={}){
  const selected={...project.output,...output};
  if((Object.hasOwn(output,'sceneId')||Object.hasOwn(output,'branchId'))&&!Object.hasOwn(output,'sequence'))selected.sequence=null;
  outputSchema(selected);
  const entries=selected.sequence??[{id:null,sceneId:selected.sceneId,branchId:selected.branchId}];
  return {selected,entries:entries.map(entry=>{
    const scene=project.lesson.scenes.find(s=>s.id===entry.sceneId);check(scene,'SCENE_UNKNOWN','Unknown scene.','output/sequence');
    const beats=route(scene,entry.branchId);for(const key of ['fromBeatId','toBeatId'])if(entry[key]!==undefined)check(beats.some(b=>b.id===entry[key]),'SEQUENCE','Excerpt beat does not exist on this route.','output/sequence/'+entry.id+'/'+key);
    return {entryId:entry.id,scene,branchId:entry.branchId??null,fromBeatId:entry.fromBeatId,toBeatId:entry.toBeatId};
  })};
}
export function compileProject(project,packs,{output={},view='player'}={}){
  projectSchema(project);const {selected,entries}=selectedRoutes(project,output),pack=packs[selected.locale];
  check(pack,'LOCALE','Install the complete locale dictionary.','output/locale',{available:Object.keys(packs)});
  const profile=profiles[selected.profile],fps=profile.fps,issues=[],frames=[],directions=[];let tick=0;
  const ticks=seconds=>Math.max(1,Math.ceil(seconds*fps-1e-9)),at=seconds=>Math.ceil(seconds*fps-1e-9);
  const text=(map,path,target)=>{if(typeof map?.[selected.locale]!=='string'||!map[selected.locale].trim()){issues.push({code:'TRANSLATION_MISSING',path:path+'/'+selected.locale,message:'Missing selected-language text.',retryable:false,...(target?{target}:{})});return '…';}return map[selected.locale];};
  let title='';
  for(const {entryId,scene,branchId,fromBeatId,toBeatId}of entries){
    const entryStart=tick,frameOffset=frames.length,issueOffset=issues.length;
    const sceneTitle=text(scene.title,`scenes/${scene.id}/title`);if(!title)title=sceneTitle;
    if(branchId)text(scene.branches.find(b=>b.id===branchId).label,`branches/${branchId}/label`);
    const direction=effectiveDirection(project,scene);directions.push({entryId,sceneId:scene.id,direction});
    if(direction){for(const key of ['name','summary'])text(direction.profile[key],`scenes/${scene.id}/direction/${key}`);for(const key of ['guidance','checks'])if(!direction.profile[key][selected.locale]?.length)issues.push({code:'TRANSLATION_MISSING',path:`scenes/${scene.id}/direction/${key}/${selected.locale}`,message:'Missing selected-language direction.',retryable:false});}
    let state=loadState(scene.start),revealed=[],stateStart=tick/fps,stateEvent=null,nodeIndex=0,previousState=null;
    const teaching=scene.analysis?.length||route(scene,branchId).some(b=>b.presentation);
    if(scene.variant&&scene.variant.reviewHash!==variantReviewHash(scene))issues.push({code:'VARIANT_REVIEW',path:`scenes/${scene.id}/variant`,message:'Review changed conditions, dependent narration and conclusions through scene.review.',retryable:false});
    const appearance={tableName:'Orion 06',felt:'#1b5850',...scene.appearance};
    function add(beat,part,event,count,cue=null,actionIndex=typeof part==='number'?part:null){
      const visible=clone(state);visible.revealed=[...new Set([...visible.revealed,...revealed])];const snapshot=observeState(visible,{view});
      snapshot.seats.forEach(p=>{p.avatar=scene.start.seats.find(s=>s.id===p.id)?.avatar??p.name.slice(0,1);});
      const localId=part===null?beat.id:`${beat.id}::${part}`,id=entryId===null?localId:`${entryId}::${localId}`;
      frames.push({id,sceneId:scene.id,entryId,branchId,beatId:beat.id,actionIndex,...(teaching?{nodeIndex,previousState}:{}),label:text(beat.label,`beats/${beat.id}/label`,{sceneId:scene.id,entryId,beatId:beat.id}),event:clone(event),stateStart,stateEvent:clone(stateEvent),startFrame:tick,endFrame:tick+count,start:tick/fps,end:(tick+count)/fps,duration:count/fps,narration:cue?.text??'',audio:cue?.audio??null,...(cue?{narrationId:cue.id,narrationStart:cue.start,narrationDuration:cue.duration,speaker:beat.speaker??null,captionCues:beat.captionCues?.[selected.locale]?.cues??null}:{}),state:stateInBB(snapshot),appearance});tick+=count;
    }
    const authoredRoute=route(scene,branchId),selectedRoute=toBeatId?authoredRoute.slice(0,authoredRoute.findIndex(beat=>beat.id===toBeatId)+1):authoredRoute;
    for(const beat of selectedRoute){
      const target={sceneId:scene.id,entryId,beatId:beat.id};
      if(beat.view){revealed=beat.view.reveal;for(const id of revealed)check(state.seats.some(s=>s.id===id),'REVEAL','Unknown revealed seat.',`beats/${beat.id}/view/reveal`);}
      const narration=beat.narration?text(beat.narration,`beats/${beat.id}/narration`,target):'';
      const ref=beat.audio?.[selected.locale],asset=ref?project.assets[ref.assetId]:null;let audio=null;
      if(narration){
        if(!ref||!asset)issues.push({code:'AUDIO_MISSING',path:`beats/${beat.id}/audio/${selected.locale}`,message:'Generate or attach narration audio.',retryable:false,target});
        else if(ref.textHash!==hash(narration)||(ref.voiceHash&&ref.voiceHash!==hash(voiceProfile(project,selected.locale,beat))))issues.push({code:'AUDIO_STALE',path:`beats/${beat.id}/audio/${selected.locale}`,message:'Narration or voice settings changed after this audio was produced.',retryable:false,target});
        else audio={assetId:ref.assetId,locale:selected.locale,duration:asset.duration,path:asset.path};
      }
      const actions=beat.actions??[],actionHold=beat.actionHold??.7,hold=beat.hold??1.2,estimated=beat.rehearsalDuration?.[selected.locale]??hold,timing=timingProfile(beat,selected.locale);
      if(timing&&narration&&!timingBindingCurrent(beat,selected.locale,beat.timing.audioHashes?.[selected.locale]))issues.push({code:'TIMING_STALE',path:`beats/${beat.id}/timing/${selected.locale}`,message:'Review action/speech timing against the current audio or explicit rehearsal estimate through timing.set.',retryable:false,target});
      const captionSettings=beat.captionCues?.[selected.locale],captions=captionSettings?.cues;
      if(captionSettings&&(!timingBindingCurrent(beat,selected.locale,captionSettings.audioHash)||!captions.length))issues.push({code:'CAPTION_STALE',path:`beats/${beat.id}/captionCues/${selected.locale}`,message:'Confirm precise caption timing against the current audio or explicit rehearsal estimate through captions.set.',retryable:false,target});
      const captionDuration=audio?.duration??(!ref?beat.rehearsalDuration?.[selected.locale]:undefined);
      if(captionDuration!==undefined&&captions?.at(-1)?.end>captionDuration+1e-6)issues.push({code:'CAPTION_TIMING',path:`beats/${beat.id}/captionCues/${selected.locale}`,message:'Caption cues exceed the narration clock duration.',retryable:false,target});
      if(captions?.some(c=>{const near=Math.floor(c.start*fps),first=near/fps>=c.start?near:near+1;return first/fps>=Math.min(c.end,captionDuration??Infinity);}))issues.push({code:'CAPTION_TIMING',path:`beats/${beat.id}/captionCues/${selected.locale}`,message:'Every caption cue must cover a visible frame at the selected frame rate.',retryable:false,target});
      const act=i=>{try{const before=clone(state);before.revealed=[...new Set([...before.revealed,...revealed])];previousState=stateInBB(observeState(before,{view}));state=transition(state,actions[i]);nodeIndex++;stateStart=tick/fps;stateEvent=clone(actions[i]);}catch(e){e.path=`scenes/${scene.id}/beats/${beat.id}/actions/${i}`;throw e;}};
      const cue=start=>narration?{id:entryId===null?beat.id:`${entryId}::${beat.id}`,start,duration:audio?.duration??estimated,text:narration,audio}:null;
      if(!timing){
        for(let i=0;i<actions.length;i++){act(i);add(beat,i,actions[i],ticks(i===actions.length-1&&!narration?Math.max(actionHold,hold):actionHold));}
        if(!actions.length||narration)add(beat,null,null,ticks(Math.max(hold,audio?audio.duration+.35:narration&&beat.rehearsalDuration?.[selected.locale]!==undefined?estimated+.35:.35)),cue(tick/fps));
        continue;
      }
      // One schedule owns both state changes and the continuous narration clock.
      const startTick=tick,actionTicks=timing.actions.map(at),narrationTick=at(timing.narration??0),speechTicks=ticks(audio?.duration??estimated);
      check(new Set(actionTicks).size===actionTicks.length,'TIMING_COLLISION','Action times collide at the selected frame rate.',`beats/${beat.id}/timing/actions`);
      const end=Math.max(ticks(hold),...(actionTicks.map(t=>t+ticks(actionHold))),narration?narrationTick+ticks((audio?.duration??estimated)+.35):0);
      const boundaries=[...new Set([0,...actionTicks,...(narration?[narrationTick,narrationTick+speechTicks]:[]),end])].filter(t=>t<=end).sort((a,b)=>a-b),speech=cue((startTick+narrationTick)/fps);
      for(let i=0;i<boundaries.length-1;i++){
        const offset=boundaries[i],actionIndex=actionTicks.indexOf(offset);if(actionIndex>=0)act(actionIndex);
        add(beat,`t${offset}`,actionIndex>=0?actions[actionIndex]:null,boundaries[i+1]-offset,narration&&offset>=narrationTick&&offset<narrationTick+speechTicks?speech:null,actionIndex>=0?actionIndex:null);
      }
    }
    if(fromBeatId||toBeatId){
      const source=frames.slice(frameOffset),first=fromBeatId?source.find(f=>f.beatId===fromBeatId):source[0],last=toBeatId?source.findLast(f=>f.beatId===toBeatId):source.at(-1);
      check(first&&last&&first.startFrame<=last.startFrame,'SEQUENCE','Excerpt end must follow its beginning.','output/sequence/'+entryId);
      const kept=source.filter(f=>f.startFrame>=first.startFrame&&f.endFrame<=last.endFrame),offset=first.startFrame-entryStart,seconds=offset/fps,ids=new Set(kept.map(f=>f.beatId));
      for(const frame of kept){frame.startFrame-=offset;frame.endFrame-=offset;frame.start-=seconds;frame.end-=seconds;frame.stateStart-=seconds;if(frame.narrationStart!==undefined)frame.narrationStart-=seconds;}
      frames.splice(frameOffset,frames.length-frameOffset,...kept);tick=kept.at(-1).endFrame;
      const retained=issues.slice(issueOffset).filter(issue=>!issue.target||ids.has(issue.target.beatId));issues.splice(issueOffset,issues.length-issueOffset,...retained);
    }
  }
  const short=profile.short,plan={format:'river.plan',version:2,projectId:project.projectId,revision:project.revision,projectHash:contentHash(project),title,...selected,fps,width:selected.aspect==='portrait'?short:short*16/9,height:selected.aspect==='portrait'?short*16/9:short,duration:tick/fps,totalFrames:tick,frames,issues,dictionary:pack,appearance:frames[0].appearance,directions};
  const course=project.lesson.course;
  if(course&&selected.sequence&&JSON.stringify(selected.sequence.map(e=>e.sceneId))!==JSON.stringify(course.episodes.flatMap(e=>e.sceneIds??[e.sceneId])))plan.advisories=[{code:'COURSE_ORDER_REVIEW',path:'lesson/course/episodes',message:'Programme order differs from the course brief. Review prerequisites, repetition and answer disclosure; update the course brief if this order is intentional.'}];
  const advisory=courseAdvisories(project,entries);if(advisory.length)plan.advisories=[...(plan.advisories??[]),...advisory];
  const selectedScenes=new Set(entries.map(e=>e.scene.id));
  for(const issue of [...variantIssues(project),...practiceIssues(project,selected.locale)])if(!issue.target?.sceneId||selectedScenes.has(issue.target.sceneId))issues.push(issue);
  issues.push(...sessionIssuesForScenes(project,selectedScenes));
  if(project.lesson.session){
    let notes=[];try{notes=resolveSessionObservations(project);}catch{}
    const order=project.lesson.session.hands.map(h=>h.sceneId);
    if(Array.isArray(notes))for(const frame of frames){const index=order.indexOf(frame.sceneId);frame.history=notes.filter(note=>note.current===true&&index>=0&&order.indexOf(note.sceneId)>=0&&order.indexOf(note.sceneId)<index);}
  }
  return compileSound(compilePresentations(plan,project,{compileAnalysis,stateInBB,route,timingBindingCurrent}),project);
}
export function contentHash(project){return hash({format:project.format,version:project.version,lesson:project.lesson,output:project.output,assets:project.assets,...(project.voice?{voice:project.voice}:{}),...(project.direction?{direction:project.direction}:{}),...(project.sound?{sound:project.sound}:{}),...(project.deliverables?{deliverables:project.deliverables}:{})});}
export async function validateProject(project,packs,{directory,output={},media=false,all=false}={}){
  projectSchema(project);const selections=all?project.lesson.scenes.flatMap(s=>[null,...(s.branches??[]).map(b=>b.id)].flatMap(branchId=>Object.keys(packs).map(locale=>({sceneId:s.id,branchId,locale,sequence:null})))):[output];
  const results=[];
  for(const overrides of selections){
    let selected={...project.output,...overrides};
    try{
      selected=selectedRoutes(project,overrides).selected;
      const plan=compileProject(project,packs,{output:selected}),issues=clone(plan.issues);
      if(media){const seen=new Set();for(const f of plan.frames){if(!f.audio||seen.has(f.audio.assetId))continue;seen.add(f.audio.assetId);try{await verifyAudio(directory,project.assets[f.audio.assetId]);}catch(e){issues.push(errorJSON(e));}}}
      if(media){const seen=new Set();for(const f of plan.frames){const p=f.presentation,materials=[p?.analysis,p?.comparison?.origin,...(p?.comparison?.routes??[]).flatMap(r=>[r.start,r.end])];for(const material of materials){const evidence=material?.evidence,key=evidence&&JSON.stringify([evidence.source,evidence.sha256]);if(!evidence?.source||seen.has(key))continue;seen.add(key);try{await verifyEvidence(directory,evidence);}catch(e){issues.push(errorJSON(e));}}}}
      if(media&&project.sound?.bed){try{const asset=project.assets[project.sound.bed.assetId];check(asset,'ASSET_MISSING','Background audio is missing.','sound/bed');await verifyAudio(directory,asset);}catch(e){issues.push(errorJSON(e));}}
      results.push({output:selected,ready:issues.length===0,duration:plan.duration,frames:plan.totalFrames,issues});
    }catch(e){results.push({output:selected,ready:false,issues:[errorJSON(e)]});}
  }
  return {scope:all?'all':'selected',mediaChecked:media,ready:results.every(r=>r.ready),results};
}
