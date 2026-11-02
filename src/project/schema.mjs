import {check} from '../errors.mjs';
import {loadState} from '../poker/rules.mjs';
import {directionSchema} from '../direction/index.mjs';
import {analysisSchema} from '../analysis/index.mjs';
import {presentationSchema} from '../presentation.mjs';
const object=(x,p)=>check(x&&typeof x==='object'&&!Array.isArray(x),'SCHEMA','Expected an object.',p);
export function keys(value,allowed,path){object(value,path);for(const key of Object.keys(value))check(allowed.includes(key),'UNKNOWN_FIELD',`Unknown field: ${key}`,`${path}/${key}`,{allowed});}
const string=(x,p)=>check(typeof x==='string'&&x.trim().length>0,'SCHEMA','Expected a nonempty string.',p);
const list=(x,p)=>check(Array.isArray(x),'SCHEMA','Expected an array.',p);
const finite=(x,p)=>check(typeof x==='number'&&Number.isFinite(x),'SCHEMA','Expected a finite number.',p);
const unique=(items,p)=>{const seen=new Set();for(const item of items){object(item,p);string(item.id,p+'/id');check(!item.id.includes('::'),'ID_RESERVED','Double colon is reserved for compiled action frames.',p+'/'+item.id);check(!seen.has(item.id),'ID_DUPLICATE',`Duplicate ID: ${item.id}`,p+'/'+item.id);seen.add(item.id);}};
const textMap=(x,p)=>{object(x,p);for(const [k,v]of Object.entries(x))check(typeof v==='string','SCHEMA','Translation must be text.',p+'/'+k);};
export const voiceDefaults={emotion:[.12,0,0,0,0,0,.06,.55],emotionStrength:.5,speed:1,pronunciations:{}};
export const voiceProfile=(project,locale,beat)=>({...structuredClone(voiceDefaults),...project.voice?.[locale],...beat?.delivery?.[locale],pronunciations:{...project.voice?.[locale]?.pronunciations,...beat?.delivery?.[locale]?.pronunciations}});
export const timingProfile=(beat,locale)=>Object.hasOwn(beat.timing?.overrides??{},locale)?beat.timing.overrides[locale]:beat.timing?.actions?{actions:beat.timing.actions,narration:beat.timing.narration??0}:null;
export function actionTimingSchema(value,count,path='timing'){
  keys(value,['actions','narration'],path);list(value.actions,path+'/actions');check(value.actions.length===count,'TIMING','Provide one time per action.',path+'/actions');
  for(const [i,time]of value.actions.entries()){finite(time,path+'/actions/'+i);check(time>=0&&time<=86400&&(i===0||time>value.actions[i-1]),'TIMING','Action times must increase from zero and fit within a day.',path+'/actions/'+i);}
  if(value.narration!==undefined){finite(value.narration,path+'/narration');check(value.narration>=0&&value.narration<=86400,'TIMING','Invalid narration offset.',path+'/narration');}
}
export function voiceSchema(value,path='voice'){
  keys(value,['referenceAssetId','emotion','emotionStrength','speed','pronunciations'],path);
  if(value.referenceAssetId!==undefined)check(/^[a-f0-9]{64}$/.test(value.referenceAssetId),'ASSET_ID','Invalid speaker reference.',path+'/referenceAssetId');
  if(value.emotion!==undefined)check(Array.isArray(value.emotion)&&value.emotion.length===8&&value.emotion.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1),'VOICE_SETTINGS','Emotion has eight values between0 and1.',path+'/emotion');
  for(const [key,min,max]of [['speed',.5,2],['emotionStrength',0,1]])if(value[key]!==undefined)check(typeof value[key]==='number'&&Number.isFinite(value[key])&&value[key]>=min&&value[key]<=max,'VOICE_SETTINGS',`${key} must be between${min} and${max}.`,path+'/'+key);
  if(value.pronunciations!==undefined){textMap(value.pronunciations,path+'/pronunciations');for(const [key,text]of Object.entries(value.pronunciations)){string(key,path+'/pronunciations');string(text,path+'/pronunciations/'+key);}}
}
export function outputSchema(output){
  keys(output,['locale','aspect','profile','sceneId','branchId','captions','sequence'],'output');
  string(output.locale,'output/locale');string(output.sceneId,'output/sceneId');
  check(['portrait','landscape'].includes(output.aspect),'ASPECT','Use portrait or landscape.','output/aspect');
  check(['draft','final'].includes(output.profile),'PROFILE','Use draft or final.','output/profile');
  check(output.branchId===null||typeof output.branchId==='string','SCHEMA','branchId must be null or a string.','output/branchId');
  check(typeof output.captions==='boolean','SCHEMA','captions must be boolean.','output/captions');
  if(output.sequence!==undefined&&output.sequence!==null){
    list(output.sequence,'output/sequence');check(output.sequence.length>0,'SEQUENCE','Provide at least one entry.','output/sequence');unique(output.sequence,'output/sequence');
    for(const [i,entry]of output.sequence.entries()){const path='output/sequence/'+i;keys(entry,['id','sceneId','branchId'],path);string(entry.sceneId,path+'/sceneId');check(entry.branchId===undefined||entry.branchId===null||typeof entry.branchId==='string','SEQUENCE','Invalid branch ID.',path+'/branchId');}
  }
}
function beatSchema(beat,path){
  keys(beat,['id','label','actions','hold','actionHold','narration','audio','view','delivery','timing','speaker','captionCues','presentation'],path);string(beat.id,path+'/id');
  if(beat.presentation!==undefined)presentationSchema(beat.presentation,path+'/presentation');
  if(beat.speaker!==undefined)string(beat.speaker,path+'/speaker');
  if(beat.captionCues!==undefined){
    object(beat.captionCues,path+'/captionCues');
    for(const [locale,value]of Object.entries(beat.captionCues)){
      const p=path+'/captionCues/'+locale;keys(value,['audioHash','cues'],p);check(value.audioHash===null||/^[a-f0-9]{64}$/.test(value.audioHash),'CAPTION_TIMING','Caption timing needs an audio fingerprint or an explicit draft.',p+'/audioHash');const cues=value.cues;list(cues,p+'/cues');
      if(!cues.length){check(value.audioHash===null,'CAPTION_TIMING','An empty precise-caption draft cannot claim an audio binding.',p);continue;}
      for(const [i,cue]of cues.entries()){keys(cue,['start','end','text'],p+'/'+i);finite(cue.start,p+'/'+i+'/start');finite(cue.end,p+'/'+i+'/end');string(cue.text,p+'/'+i+'/text');check(cue.start>=0&&cue.end>cue.start&&cue.end<=86400&&(i===0||cue.start>=cues[i-1].end),'CAPTION_TIMING','Caption intervals must be ordered and non-overlapping.',p+'/'+i);}
      const source=beat.narration?.[locale];check(typeof source==='string','CAPTION_TEXT','Set narration before timed captions.',p);const normalized=text=>text.replace(/\s/gu,'');check(normalized(cues.map(c=>c.text).join(''))===normalized(source),'CAPTION_TEXT','Caption cues must preserve the narration text.',p);
    }
  }
  textMap(beat.label,path+'/label');if(beat.narration!==undefined)textMap(beat.narration,path+'/narration');
  for(const key of ['hold','actionHold'])if(beat[key]!==undefined){finite(beat[key],path+'/'+key);check(beat[key]>0&&beat[key]<=86400,'DURATION','Duration must be positive and at most one day.',path+'/'+key);}
  if(beat.actions!==undefined){list(beat.actions,path+'/actions');for(const [i,a]of beat.actions.entries()){
    keys(a,['type','seat','to','cards'],path+'/actions/'+i);
    check(['check','call','fold','bet','raise','allin','deal','showdown'].includes(a.type),'ACTION','Unknown action.',path+'/actions/'+i+'/type');
    const allowed=['type',...(['deal'].includes(a.type)?['cards']:a.type==='showdown'?[]:['seat',...(['bet','raise'].includes(a.type)?['to']:[])])];
    keys(a,allowed,path+'/actions/'+i);
    if(!['deal','showdown'].includes(a.type))string(a.seat,path+'/actions/'+i+'/seat');
    if(['bet','raise'].includes(a.type))finite(a.to,path+'/actions/'+i+'/to');
    if(a.type==='deal')list(a.cards,path+'/actions/'+i+'/cards');
  }}
  if(beat.timing!==undefined){
    keys(beat.timing,['actions','narration','overrides','audioHashes'],path+'/timing');
    if(beat.timing.actions!==undefined)actionTimingSchema({actions:beat.timing.actions,...(beat.timing.narration!==undefined?{narration:beat.timing.narration}:{})},(beat.actions??[]).length,path+'/timing');else check(beat.timing.narration===undefined,'TIMING','A default narration offset requires default action times.',path+'/timing');
    if(beat.timing.overrides!==undefined){object(beat.timing.overrides,path+'/timing/overrides');for(const [locale,value]of Object.entries(beat.timing.overrides))if(value!==null)actionTimingSchema(value,(beat.actions??[]).length,path+'/timing/overrides/'+locale);}
    check(beat.timing.actions!==undefined||Object.keys(beat.timing.overrides??{}).length>0,'TIMING','Provide a default or language-specific schedule.',path+'/timing');
    if(beat.timing.audioHashes!==undefined){object(beat.timing.audioHashes,path+'/timing/audioHashes');for(const [locale,value]of Object.entries(beat.timing.audioHashes))check(value===null||typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'TIMING','Invalid timing audio fingerprint.',path+'/timing/audioHashes/'+locale);}
  }
  if(beat.view!==undefined){keys(beat.view,['reveal'],path+'/view');list(beat.view.reveal,path+'/view/reveal');}
  if(beat.delivery!==undefined){object(beat.delivery,path+'/delivery');for(const [locale,settings]of Object.entries(beat.delivery))voiceSchema(settings,path+'/delivery/'+locale);}
  if(beat.audio!==undefined){object(beat.audio,path+'/audio');for(const [locale,a]of Object.entries(beat.audio)){
    keys(a,['assetId','locale','textHash','voiceHash'],path+'/audio/'+locale);string(a.assetId,path+'/audio/'+locale+'/assetId');
    if(a.voiceHash!==undefined)check(/^[a-f0-9]{64}$/.test(a.voiceHash),'SCHEMA','Invalid voice settings hash.',path+'/audio/'+locale+'/voiceHash');
    check(a.locale===locale,'AUDIO_LOCALE','Audio locale must match its key.',path+'/audio/'+locale);string(a.textHash,path+'/audio/'+locale+'/textHash');
  }}
}
export function sceneSchema(scene,path='scene'){
  keys(scene,['id','title','start','beats','branches','appearance','direction','analysis','variant'],path);string(scene.id,path+'/id');textMap(scene.title,path+'/title');
  if(scene.analysis!==undefined)analysisSchema(scene.analysis,path+'/analysis');
  if(scene.variant!==undefined){
    const p=path+'/variant',v=scene.variant;keys(v,['sourceSceneId','sourceHash','change','reviewHash'],p);string(v.sourceSceneId,p+'/sourceSceneId');
    check(/^[a-f0-9]{64}$/.test(v.sourceHash),'VARIANT','Invalid source fingerprint.',p+'/sourceHash');
    check(v.reviewHash===null||/^[a-f0-9]{64}$/.test(v.reviewHash),'VARIANT','Review state must be explicit.',p+'/reviewHash');
    keys(v.change,['beatId','actionIndex','before','after'],p+'/change');string(v.change.beatId,p+'/change/beatId');
    check(Number.isSafeInteger(v.change.actionIndex)&&v.change.actionIndex>=0,'VARIANT','Use a zero-based action index.',p+'/change/actionIndex');
    beatSchema({id:'variant-audit',label:{},actions:[v.change.before,v.change.after]},p+'/change');
  }
  if(scene.direction!==undefined)directionSchema(scene.direction,path+'/direction');
  keys(scene.start,['street','board','button','hero','actor','bigBlind','lastFullRaise','actedAt','seats','roundClosed'],path+'/start');
  const start=scene.start;
  list(start.seats,path+'/start/seats');for(const [i,seat]of start.seats.entries()){
    keys(seat,['id','name','stack','contributed','streetBet','folded','hole','avatar'],path+'/start/seats/'+i);
    string(seat.id,path+'/start/seats/'+i+'/id');if(seat.name!==undefined)string(seat.name,path+'/start/seats/'+i+'/name');
    for(const key of ['stack','contributed','streetBet'])if(key==='stack'||seat[key]!==undefined)finite(seat[key],path+'/start/seats/'+i+'/'+key);
    if(seat.folded!==undefined)check(typeof seat.folded==='boolean','SCHEMA','folded must be boolean.',path+'/start/seats/'+i+'/folded');
    if(seat.hole!==undefined)list(seat.hole,path+'/start/seats/'+i+'/hole');
    if(seat.avatar!==undefined)string(seat.avatar,path+'/start/seats/'+i+'/avatar');
  }
  if(start.board!==undefined)list(start.board,path+'/start/board');
  for(const key of ['bigBlind','lastFullRaise'])if(start[key]!==undefined)finite(start[key],path+'/start/'+key);
  if(start.roundClosed!==undefined)check(typeof start.roundClosed==='boolean','SCHEMA','roundClosed must be boolean.',path+'/start/roundClosed');
  if(start.actedAt!==undefined){object(start.actedAt,path+'/start/actedAt');for(const [k,v]of Object.entries(start.actedAt))finite(v,path+'/start/actedAt/'+k);}
  try{loadState(start);}catch(error){error.path=path+'/start';throw error;}
  list(scene.beats,path+'/beats');check(scene.beats.length>0,'EMPTY_SCENE','A scene needs a beat.',path+'/beats');
  if(scene.branches!==undefined)list(scene.branches,path+'/branches');
  const all=[...scene.beats];for(const [i,branch]of (scene.branches??[]).entries()){
    keys(branch,['id','from','label','beats'],path+'/branches/'+i);string(branch.id,path+'/branches/'+i+'/id');textMap(branch.label,path+'/branches/'+i+'/label');
    check(scene.beats.some(b=>b.id===branch.from),'BRANCH_ORIGIN','Branch origin must be a main-line beat.',path+'/branches/'+i+'/from');
    list(branch.beats,path+'/branches/'+i+'/beats');all.push(...branch.beats);
  }
  unique(scene.branches??[],path+'/branches');unique(all,path+'/beats');all.forEach(b=>beatSchema(b,path+'/beats/'+b.id));
  if(scene.appearance!==undefined){keys(scene.appearance,['tableName','felt'],path+'/appearance');if(scene.appearance.tableName!==undefined)string(scene.appearance.tableName,path+'/appearance/tableName');if(scene.appearance.felt!==undefined)check(/^#[0-9a-f]{6}$/i.test(scene.appearance.felt),'SCHEMA','Use a six-digit hex color.',path+'/appearance/felt');}
}
export function projectSchema(project){
  keys(project,['format','version','projectId','revision','lesson','output','assets','receipts','voice','direction'],'project');
  check(project.format==='river.project'&&project.version===2,'SCHEMA_VERSION','Expected river.project version 2.','project/version');
  string(project.projectId,'project/projectId');check(Number.isSafeInteger(project.revision)&&project.revision>=0,'REVISION','Invalid revision.','project/revision');
  keys(project.lesson,['scenes','title','course'],'lesson');list(project.lesson.scenes,'lesson/scenes');check(project.lesson.scenes.length>0,'EMPTY_PROJECT','Add a scene.','lesson/scenes');
  if(project.lesson.course!==undefined)courseSchema(project.lesson.course);
  if(project.lesson.title!==undefined)textMap(project.lesson.title,'lesson/title');
  unique(project.lesson.scenes,'lesson/scenes');project.lesson.scenes.forEach(s=>sceneSchema(s,'lesson/scenes/'+s.id));
  for(const episode of project.lesson.course?.episodes??[])check(project.lesson.scenes.some(s=>s.id===episode.sceneId),'SCENE_UNKNOWN','Course episode references an unknown scene.','lesson/course/episodes/'+episode.id+'/sceneId');
  outputSchema(project.output);check(project.lesson.scenes.some(s=>s.id===project.output.sceneId),'SCENE_UNKNOWN','Selected scene does not exist.','output/sceneId');
  const selected=project.lesson.scenes.find(s=>s.id===project.output.sceneId);
  check(project.output.branchId===null||selected.branches?.some(b=>b.id===project.output.branchId),'BRANCH_UNKNOWN','Selected branch does not exist.','output/branchId');
  for(const entry of project.output.sequence??[]){const scene=project.lesson.scenes.find(s=>s.id===entry.sceneId);check(scene,'SCENE_UNKNOWN','Sequence scene does not exist.','output/sequence/'+entry.id);check(!entry.branchId||scene.branches?.some(b=>b.id===entry.branchId),'BRANCH_UNKNOWN','Sequence branch does not exist.','output/sequence/'+entry.id);}
  if(project.direction!==undefined)directionSchema(project.direction);
  object(project.assets,'assets');for(const [id,a]of Object.entries(project.assets)){
    keys(a,['path','sha256','duration','bytes','mime'],'assets/'+id);
    check(id===a.sha256&&/^[a-f0-9]{64}$/.test(id),'ASSET_ID','Asset ID must be its SHA-256.','assets/'+id);
    check(typeof a.path==='string'&&/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(a.path),'ASSET_PATH','Use a project-relative content-addressed asset.','assets/'+id+'/path');
    check(Number.isFinite(a.duration)&&a.duration>0,'AUDIO_DURATION','Invalid audio duration.','assets/'+id+'/duration');
    check(Number.isSafeInteger(a.bytes)&&a.bytes>0,'ASSET_SIZE','Invalid asset size.','assets/'+id+'/bytes');
  }
  if(project.voice!==undefined){object(project.voice,'voice');for(const [locale,profile]of Object.entries(project.voice)){voiceSchema(profile,'voice/'+locale);if(profile.referenceAssetId)check(project.assets[profile.referenceAssetId],'ASSET_MISSING','Speaker reference is missing.','voice/'+locale+'/referenceAssetId');}}
  for(const scene of project.lesson.scenes)for(const beat of [...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)])for(const [locale,settings]of Object.entries(beat.delivery??{}))if(settings.referenceAssetId)check(project.assets[settings.referenceAssetId],'ASSET_MISSING','Beat speaker reference is missing.',`scenes/${scene.id}/beats/${beat.id}/delivery/${locale}/referenceAssetId`);
  list(project.receipts,'receipts');check(project.receipts.length<=128,'RECEIPTS','At most 128 receipts.','receipts');
  const requestIds=new Set();let previousRevision=0;
  for(const [i,r]of project.receipts.entries()){
    const path='receipts/'+i;keys(r,['requestId','signature','value'],path);string(r.requestId,path+'/requestId');
    check(!requestIds.has(r.requestId)&&/^[a-f0-9]{64}$/.test(r.signature),'RECEIPTS','Invalid or duplicate request receipt.',path);requestIds.add(r.requestId);
    keys(r.value,['requestId','projectId','revision','output'],path+'/value');
    check(r.value.requestId===r.requestId&&r.value.projectId===project.projectId&&Number.isSafeInteger(r.value.revision)&&r.value.revision>previousRevision&&r.value.revision<=project.revision,'RECEIPTS','Receipt does not match this project/revision.',path+'/value');
    previousRevision=r.value.revision;outputSchema(r.value.output);
  }
  return project;
}

export function courseSchema(course,path='lesson/course'){
  keys(course,['id','title','prerequisites','objectives','episodes'],path);string(course.id,path+'/id');textMap(course.title,path+'/title');
  for(const key of ['prerequisites','objectives'])if(course[key]!==undefined)textMap(course[key],path+'/'+key);
  list(course.episodes,path+'/episodes');unique(course.episodes,path+'/episodes');
  for(const [i,episode]of course.episodes.entries()){
    const p=path+'/episodes/'+i;keys(episode,['id','sceneId','objective','conditions','check'],p);string(episode.sceneId,p+'/sceneId');textMap(episode.objective,p+'/objective');
    for(const key of ['conditions','check'])if(episode[key]!==undefined)textMap(episode[key],p+'/'+key);
  }
}
