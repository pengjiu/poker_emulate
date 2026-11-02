import {ProjectStore,receiptFor} from './project/store.mjs';
import {keys,projectSchema,sceneSchema,voiceSchema,voiceProfile,actionTimingSchema,courseSchema} from './project/schema.mjs';
import {compileProject,stateInBB,route,validateProject} from './compiler.mjs';
import {importAudio} from './media/audio.mjs';
import {localePacks} from './locales.mjs';
import {clone,hash} from './util.mjs';
import {check,errorJSON} from './errors.mjs';
import {VoiceController} from './media/voice.mjs';
import {selectDirection,patterns,effectiveDirection} from './direction/index.mjs';
import {analysisSchema,confirmAnalysis} from './analysis/index.mjs';
import {bindEvidence} from './analysis/evidence.mjs';
import {presentationSchema,presentationCueSchema} from './presentation.mjs';
import {variantReviewHash} from './project/variants.mjs';
import {putBranch} from './project/branches.mjs';

export class Director {
  constructor(store,packs){this.store=store;this.packs=packs;this.cursor=null;this.previewUrl=null;this.speech=new VoiceController(this);}
  static async open(directory,options){const d=new Director(new ProjectStore(directory,options),await localePacks());await d.store.read();return d;}
  async load(){this.cursor=null;await this.store.read();return this.observe({view:'director'});}
  async observe(options={}){
    keys(options,['view'],'observe');const view=options.view??'player';check(['player','director'].includes(view),'VIEW','Use player or director.','observe/view');
    const project=await this.store.read();
    try{
      const plan=compileProject(project,this.packs,{view}),frame=plan.frames.find(f=>f.id===this.cursor)||plan.frames[0];
      return {projectId:project.projectId,revision:project.revision,output:project.output,previewUrl:this.previewUrl,sceneId:frame.sceneId,entryId:frame.entryId,beat:frame.beatId,frame:frame.id,duration:plan.duration,narration:frame.narration,direction:effectiveDirection(project,project.lesson.scenes.find(s=>s.id===frame.sceneId)),state:frame.state,...(frame.presentation?{presentation:frame.presentation}:{}),...(plan.advisories?{advisories:plan.advisories}:{}),readiness:{ready:plan.issues.length===0,issues:plan.issues}};
    }catch(e){return {projectId:project.projectId,revision:project.revision,output:project.output,previewUrl:this.previewUrl,state:null,readiness:{ready:false,issues:[errorJSON(e)]}};}
  }
  async seek({beatId,view='player',frameId,sceneId,entryId}={}){
    const project=await this.store.read(),plan=compileProject(project,this.packs,{view});
    check((typeof beatId==='string')!==(typeof frameId==='string'),'BEAT_UNKNOWN','Provide exactly one beatId or frameId.','seek');
    const matches=plan.frames.filter(f=>(frameId?f.id===frameId:f.beatId===beatId)&&(sceneId===undefined||f.sceneId===sceneId)&&(entryId===undefined||f.entryId===entryId));
    check(new Set(matches.map(f=>f.entryId)).size<=1,'BEAT_AMBIGUOUS','Use entryId or an exact frameId for repeated scenes.','seek');const frame=matches[0];
    check(frame,'BEAT_UNKNOWN','No such beat or action frame.','seek',{beatId,frameId});this.cursor=frame.id;return this.observe({view});
  }
  async commit(request,signature,edit,options){
    const {requestId,expectedRevision}=request;
    check(typeof requestId==='string'&&requestId.trim(),'REQUEST_ID','Provide a stable request ID.','requestId');
    check(Number.isSafeInteger(expectedRevision),'REVISION','Use the observed integer revision.','expectedRevision');
    return this.store.update(async project=>{
      const cached=receiptFor(project,requestId,signature);if(cached)return {value:cached};
      check(expectedRevision===project.revision,project.receipts.length===128&&expectedRevision<project.receipts[0].value.revision-1?'RETRY_WINDOW_EXPIRED':'REVISION_CONFLICT','Read the current revision before editing.','expectedRevision',{revision:project.revision});
      await edit(project);projectSchema(project);compileProject(project,this.packs);project.revision++;
      const value={requestId,projectId:project.projectId,revision:project.revision,output:clone(project.output)};
      project.receipts.push({requestId,signature,value:clone(value)});project.receipts=project.receipts.slice(-128);
      return {project,value};
    },options);
  }
  async apply(request){
    keys(request,['requestId','expectedRevision','commands'],'apply');const {expectedRevision,commands}=request;
    check(Array.isArray(commands)&&commands.length>0,'COMMANDS','Submit a nonempty command array.','commands');
    return this.commit(request,hash({expectedRevision,commands}),async project=>{
      const affected=new Map(),mark=(scene,branchId=null,all=false)=>affected.set(scene.id+'|'+(all?'*':branchId??''),{sceneId:scene.id,branchId,all});
      for(const [i,c]of commands.entries()){
        const path=`commands/${i}`;
        const allowed={
          'output.set':['type','value'],'scene.put':['type','value'],'branch.put':['type','sceneId','value','copyFrom'],
          'narration.set':['type','sceneId','beatId','locale','text'],'audio.attach':['type','sceneId','beatId','value'],'voice.set':['type','sceneId','beatId','value'],'direction.set':['type','sceneId','value'],'captions.set':['type','sceneId','beatId','value'],'timing.set':['type','sceneId','beatId','value'],
          'analysis.put':['type','sceneId','value'],'analysis.confirm':['type','sceneId','analysisId'],
          'presentation.set':['type','sceneId','beatId','value'],'presentation.cues':['type','sceneId','beatId','value'],
          'scene.variant':['type','sourceSceneId','value'],'scene.review':['type','sceneId'],'course.set':['type','value']
        }[c?.type];check(allowed,'COMMAND_UNKNOWN','Unknown editing command.',path+'/type');keys(c,allowed,path);
        for(const key of ['sceneId','beatId'])if(c[key]!==undefined)check(typeof c[key]==='string'&&c[key].trim(),'SCHEMA','Use a nonempty scope ID.',path+'/'+key);
        if(c.type==='course.set'){
          if(c.value===null)delete project.lesson.course;else{courseSchema(c.value,path+'/value');project.lesson.course=clone(c.value);}continue;
        }
        if(c.type==='scene.variant'){
          keys(c.value,['id','title','change'],path+'/value');keys(c.value.change,['beatId','actionIndex','action'],path+'/value/change');
          const source=project.lesson.scenes.find(s=>s.id===c.sourceSceneId);check(source,'SCENE_UNKNOWN','Unknown source scene.',path+'/sourceSceneId');
          check(typeof c.value.id==='string'&&c.value.id.trim()&&!project.lesson.scenes.some(s=>s.id===c.value.id),'VARIANT','Choose a new scene ID.',path+'/value/id');
          const scene=clone(source),change=c.value.change,beat=[...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===change.beatId);
          check(beat&&Number.isSafeInteger(change.actionIndex)&&change.actionIndex>=0&&beat.actions?.[change.actionIndex],'VARIANT','Choose an existing action to replace.',path+'/value/change');
          const before=clone(beat.actions[change.actionIndex]);beat.actions[change.actionIndex]=clone(change.action);
          scene.id=c.value.id;scene.title=clone(c.value.title);scene.variant={sourceSceneId:source.id,sourceHash:hash(source),change:{beatId:change.beatId,actionIndex:change.actionIndex,before,after:clone(change.action)},reviewHash:null};
          sceneSchema(scene,path+'/value');project.lesson.scenes.push(scene);mark(scene,null,true);continue;
        }
        if(c.type==='direction.set'){
          const target=c.sceneId?project.lesson.scenes.find(s=>s.id===c.sceneId):project;check(target,'SCENE_UNKNOWN','Unknown scene.',path+'/sceneId');
          const value=selectDirection(c.value);if(value===null)delete target.direction;else target.direction=value;continue;
        }
        if(c.type==='voice.set'){
          keys(c.value,['locale','reference','emotion','emotionStrength','speed','pronunciations'],path+'/value');const {locale=project.output.locale,reference,...settings}=c.value;
          check(this.packs[locale],'LOCALE','Install a locale dictionary first.',path+'/value/locale');
          check(c.sceneId===undefined||c.beatId!==undefined,'VOICE_SETTINGS','sceneId requires beatId for a local voice override.',path);
          const scene=c.beatId?project.lesson.scenes.find(s=>s.id===(c.sceneId??project.output.sceneId)):null;
          const beat=c.beatId?[...(scene?.beats??[]),...(scene?.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===c.beatId):null;
          check(!c.beatId||beat,'BEAT_UNKNOWN','Unknown beat for local voice.',path+'/beatId');
          const profile={...(beat?beat.delivery?.[locale]??{}:voiceProfile(project,locale)),...settings};voiceSchema(profile,path+'/value');
          if(reference===null)delete profile.referenceAssetId;
          else if(reference!==undefined){const imported=await importAudio(this.store.directory,reference);project.assets[imported.assetId]=imported.asset;profile.referenceAssetId=imported.assetId;}
          if(beat){beat.delivery??={};beat.delivery[locale]=profile;}else{project.voice??={};project.voice[locale]=profile;}continue;
        }
        if(c.type==='output.set'){
          keys(c.value,['locale','aspect','profile','sceneId','branchId','captions','sequence'],path+'/value');
          if(c.value.sceneId&&c.value.sceneId!==project.output.sceneId&&c.value.branchId===undefined)project.output.branchId=null;
          if((Object.hasOwn(c.value,'sceneId')||Object.hasOwn(c.value,'branchId'))&&!Object.hasOwn(c.value,'sequence'))delete project.output.sequence;
          Object.assign(project.output,c.value);continue;
        }
        if(c.type==='scene.put'){
          sceneSchema(c.value,path+'/value');
          const index=project.lesson.scenes.findIndex(s=>s.id===c.value?.id);if(index<0)project.lesson.scenes.push(clone(c.value));else project.lesson.scenes[index]=clone(c.value);
          mark(c.value,null,true);continue;
        }
        const scene=project.lesson.scenes.find(s=>s.id===(c.sceneId??project.output.sceneId));check(scene,'SCENE_UNKNOWN','Unknown scene.',path+'/sceneId');
        if(c.type==='scene.review'){
          check(scene.variant,'VARIANT','This scene has no recorded condition change.',path+'/sceneId');scene.variant.reviewHash=variantReviewHash(scene);continue;
        }
        if(c.type==='analysis.put'){
          analysisSchema([c.value],path+'/value');scene.analysis??=[];const index=scene.analysis.findIndex(a=>a.id===c.value.id);
          const value=clone(c.value);delete value.review;
          if(index<0)scene.analysis.push(value);else scene.analysis[index]=value;continue;
        }
        if(c.type==='analysis.confirm'){
          const index=scene.analysis?.findIndex(a=>a.id===c.analysisId)??-1;check(index>=0,'ANALYSIS_UNKNOWN','Unknown analysis record.',path+'/analysisId');
          scene.analysis[index]=confirmAnalysis(scene,scene.analysis[index],{evidenceHash:await bindEvidence(this.store.directory,scene.analysis[index])});continue;
        }
        if(c.type==='branch.put'){
          putBranch(scene,c.value,c.copyFrom,path);mark(scene,c.value.id);continue;
        }
        const beat=[...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===c.beatId);check(beat,'BEAT_UNKNOWN','Unknown beat.',path+'/beatId');
        const locale=c.locale??c.value?.locale??project.output.locale;check(this.packs[locale],'LOCALE','Install a locale dictionary first.',path+'/locale');
        if(c.type==='presentation.set'){
          if(c.value===null)delete beat.presentation;
          else{keys(c.value,['surface','analysisId','title','question','focus','show'],path+'/value');presentationSchema(c.value,path+'/value');beat.presentation={...clone(c.value),...(beat.presentation?.cues?{cues:beat.presentation.cues}:{})};}
        }else if(c.type==='presentation.cues'){
          keys(c.value,['locale','cues'],path+'/value');check(beat.presentation,'PRESENTATION','Set the base presentation before cues.',path+'/beatId');
          if(c.value.cues===null){if(beat.presentation.cues)delete beat.presentation.cues[locale];}
          else{presentationCueSchema(c.value.cues,path+'/value/cues');beat.presentation.cues??={};beat.presentation.cues[locale]={audioHash:beat.audio?.[locale]?.assetId??null,cues:clone(c.value.cues)};}
        }else if(c.type==='narration.set'){
          check(typeof c.text==='string'&&c.text.trim(),'NARRATION','Use nonempty narration. To remove narration replace the beat through scene.put.',path+'/text');
          beat.narration??={};if(beat.narration[locale]!==c.text&&beat.captionCues?.[locale])beat.captionCues[locale]={audioHash:null,cues:[]};beat.narration[locale]=c.text;if(beat.audio)delete beat.audio[locale];
        }else if(c.type==='timing.set'){
          keys(c.value,['locale','timing'],path+'/value');if(c.value.timing!==null)actionTimingSchema(c.value.timing,(beat.actions??[]).length,path+'/value/timing');
          beat.timing??={};beat.timing.overrides??={};beat.timing.overrides[locale]=clone(c.value.timing);beat.timing.audioHashes??={};beat.timing.audioHashes[locale]=c.value.timing===null?null:beat.audio?.[locale]?.assetId??null;
        }else if(c.type==='captions.set'){
          keys(c.value,['locale','cues'],path+'/value');if(c.value.cues===null){if(beat.captionCues)delete beat.captionCues[locale];}
          else{check(Array.isArray(c.value.cues)&&c.value.cues.length>0,'CAPTION_TIMING','Provide caption intervals, or null for automatic paging.',path+'/value/cues');check(beat.audio?.[locale],'AUDIO_MISSING','Generate or attach the speech before binding precise captions.',path+'/value');beat.captionCues??={};beat.captionCues[locale]={audioHash:beat.audio[locale].assetId,cues:clone(c.value.cues)};}
        }else{
          keys(c.value,['locale','source'],path+'/value');check(beat.narration?.[locale]?.trim(),'NARRATION','Set narration before attaching its audio.',path+'/beatId');
          const imported=await importAudio(this.store.directory,c.value.source);project.assets[imported.assetId]=imported.asset;
          beat.audio??={};beat.audio[locale]={assetId:imported.assetId,locale,textHash:hash(beat.narration[locale])};
        }
      }
      projectSchema(project);
      // Validate physics independently of incomplete translation/voice preparation.
      for(const a of affected.values()){
        const scene=project.lesson.scenes.find(s=>s.id===a.sceneId);
        for(const branchId of a.all?[null,...(scene.branches??[]).map(b=>b.id)]:[a.branchId])compileProject(project,this.packs,{output:{sceneId:a.sceneId,branchId}});
      }
    });
  }
  async voice(params={}){return this.speech.dispatch(params);}
  async export(options={}){
    keys(options,['kind','destination','patternId'],'export');const kind=options.kind??'project';
    check(['project','plan','patterns'].includes(kind),'EXPORT_KIND','Use project, plan or patterns.','export/kind');
    if(kind==='patterns'){check(options.destination===undefined,'EXPORT_KIND','Patterns are returned as structured data.','export');return patterns(options.patternId);}
    check(options.patternId===undefined,'EXPORT_KIND','patternId applies to patterns only.','export/patternId');
    if(kind==='project'&&options.destination)return this.store.copyTo(options.destination);
    const project=await this.store.read();return kind==='project'?clone(project):compileProject(project,this.packs);
  }
  async dispatch(request){
    keys(request,['method','params'],'request');const methods=['load','observe','apply','seek','export','voice'];check(methods.includes(request.method),'METHOD','Unknown method.','method',{allowed:methods});
    const params=request.params??{};if(request.method==='load')keys(params,[],'load');if(request.method==='seek')keys(params,['beatId','frameId','view','sceneId','entryId'],'seek');
    return this[request.method](params);
  }
}
