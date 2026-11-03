import {readFile,writeFile,mkdir,stat,mkdtemp,rm,copyFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import lockfile from 'proper-lockfile';
import {keys,voiceProfile,voiceDefaults} from '../project/schema.mjs';
import {compileProject,route,selectedRoutes} from '../compiler.mjs';
import {probeAudio,verifyAudio,importAudio} from './audio.mjs';
import {hash} from '../util.mjs';
import {receiptFor} from '../project/store.mjs';
import {check,errorJSON,fail,RiverError} from '../errors.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const languages={'zh-CN':'ZH','en-US':'EN','ja-JP':'JA'};
const required=['config.yaml','gpt.pth','codec.pth','s2mel.pth','hf_cache/w2v-bert-2.0/model.safetensors','hf_cache/w2v-bert-2.0/config.json','hf_cache/w2v-bert-2.0/preprocessor_config.json','hf_cache/campplus_cn_common.bin','hf_cache/bigvgan/config.json','hf_cache/bigvgan/bigvgan_generator.pt'];
function enginePaths(){const home=resolve(process.env.RIVER_INDEXTTS_HOME??join(root,'.river/index-tts'));return {home,python:process.env.RIVER_INDEXTTS_PYTHON??join(home,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),reference:join(home,'examples/voice_04.wav')};}
export async function voiceEngineStatus(){
  const paths=enginePaths(),missing=[];
  for(const file of [paths.python,join(paths.home,'.river-install.json'),paths.reference,...required.map(p=>join(paths.home,'checkpoints',p))]){
    try{check((await stat(file)).size>0,'VOICE_NOT_READY','Empty engine file.');}catch{missing.push(file);}
  }
  return {engine:'IndexTTS-2.5',available:missing.length===0,locales:Object.keys(languages),missing,defaults:voiceDefaults,setup:'python3 scripts/setup-index-tts.py'};
}
function pronounce(text,map){const names=Object.keys(map).sort((a,b)=>b.length-a.length);if(!names.length)return text;const pattern=names.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');return text.replace(new RegExp(pattern,'gu'),match=>map[match]);}
async function runEngine(request,signal,onProgress){
  check(!signal.aborted,'VOICE_CANCELLED','Voice generation cancelled.');
  const paths=enginePaths(),file=join(request.directory,'request.json'),logPath=join(request.directory,'engine.log');
  await writeFile(file,JSON.stringify(request));
  return new Promise((accept,reject)=>{
    const child=spawn(paths.python,[join(root,'scripts/indextts-bridge.py'),'--request',file],{cwd:paths.home,env:{...process.env,PYTHONUNBUFFERED:'1',PYTORCH_ENABLE_MPS_FALLBACK:'1'},detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    const log=createWriteStream(logPath);let bytes=0,line='',timer,force,timedOut=false;
    const kill=()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGTERM');}catch{}force=setTimeout(()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{}},2000);};
    const append=data=>{if(bytes<8*1024*1024){const part=data.subarray(0,8*1024*1024-bytes);bytes+=part.length;log.write(part);}};
    child.stdout.on('data',data=>{append(data);line+=data.toString();const rows=line.split('\n');line=rows.pop().slice(-16384);for(const row of rows)if(row.startsWith('RIVER_VOICE '))try{onProgress(JSON.parse(row.slice(12)));}catch{}});
    child.stderr.on('data',append);
    signal.addEventListener('abort',kill,{once:true});if(signal.aborted)kill();timer=setTimeout(()=>{timedOut=true;kill();},request.timeoutSeconds*1000);
    let spawnError;child.on('error',error=>{spawnError=error;});
    child.on('close',async(code,exitSignal)=>{
      clearTimeout(timer);clearTimeout(force);signal.removeEventListener('abort',kill);log.end();
      if(signal.aborted){reject(Object.assign(new Error('Voice generation cancelled.'),{code:'VOICE_CANCELLED'}));return;}
      if(timedOut){reject(Object.assign(new Error('Voice generation timed out.'),{code:'VOICE_TIMEOUT'}));return;}
      if(spawnError||code!==0){let tail='';try{tail=(await readFile(logPath,'utf8')).slice(-6000);}catch{}reject(Object.assign(new Error(`IndexTTS worker exited unexpectedly (${exitSignal??'code '+code}).`),{code:'VOICE_FAILED',cause:spawnError?.message,detail:tail,process:{exitCode:code,signal:exitSignal}}));return;}
      try{accept(JSON.parse(await readFile(request.result,'utf8')));}catch(error){reject(error);}
    });
  });
}

export class VoiceController{
  constructor(director){this.director=director;this.job=null;this.abort=null;}
  async dispatch(params){
    const {action='status'}=params;
    if(action==='status'){keys(params,['action'],'voice');return {...await voiceEngineStatus(),job:this.job};}
    if(action==='cancel'){keys(params,['action'],'voice');const cancelled=!!this.abort&&this.job?.status==='running';if(cancelled)this.abort.abort();return {cancelled,status:this.job?.status??null};}
    check(action==='generate','VOICE_ACTION','Use status, generate or cancel.','voice/action');
    keys(params,['action','requestId','expectedRevision','sceneId','branchId','beatIds','locale','force','timeoutSeconds'],'voice');
    const signature=hash({voice:params});
    if(this.abort){const cached=receiptFor(await this.director.store.read(),params.requestId,signature);if(cached)return cached;fail('VOICE_BUSY','Voice generation is already running.','voice',{},true);}
    const abort=new AbortController();this.abort=abort;this.job={status:'running',phase:'preparing',index:0,total:0};
    try{return await this.generate(params,abort,signature);}
    catch(cause){const error=cause instanceof RiverError?cause:new RiverError('VOICE_FAILED',cause.message,'voice');this.job={...this.job,status:error.code==='VOICE_CANCELLED'?'cancelled':'failed',error:errorJSON(error)};throw error;}
    finally{this.abort=null;}
  }
  async generate(params,abort,signature){
    const d=this.director,project=await d.store.read(),cached=receiptFor(project,params.requestId,signature);
    check(!abort.signal.aborted,'VOICE_CANCELLED','Voice generation cancelled.');
    if(cached){this.job={status:'complete',cached:true,revision:cached.revision};return cached;}
    check(typeof params.requestId==='string'&&params.requestId.trim(),'REQUEST_ID','Provide a stable request ID.','requestId');
    check(Number.isSafeInteger(params.expectedRevision)&&params.expectedRevision===project.revision,'REVISION_CONFLICT','Read the current revision before generating.','expectedRevision',{revision:project.revision});
    check(params.force===undefined||typeof params.force==='boolean','VOICE_SETTINGS','force must be boolean.','voice/force');
    const timeoutSeconds=params.timeoutSeconds??1800;check(Number.isFinite(timeoutSeconds)&&timeoutSeconds>=10&&timeoutSeconds<=7200,'VOICE_SETTINGS','Voice timeout must be between10 and7200 seconds.','voice/timeoutSeconds');
    const locale=params.locale??project.output.locale;
    check(languages[locale],'VOICE_LANGUAGE','IndexTTS2.5 supports the installed Chinese, English and Japanese outputs.','voice/locale');
    check(params.branchId===undefined||params.branchId===null||typeof params.branchId==='string','VOICE_SETTINGS','branchId must be null or a string.','voice/branchId');
    check(params.branchId===undefined||params.sceneId!==undefined||!project.output.sequence,'VOICE_SETTINGS','Select a scene when choosing a branch in a sequence.','voice/sceneId');
    const output={locale,...(params.sceneId!==undefined?{sceneId:params.sceneId,branchId:params.branchId===undefined?(params.sceneId===project.output.sceneId?project.output.branchId:null):params.branchId}:params.branchId!==undefined?{branchId:params.branchId}:{})};
    const {entries}=selectedRoutes(project,output);compileProject(project,d.packs,{output});
    if(params.beatIds!==undefined)check(entries.length===1&&Array.isArray(params.beatIds)&&params.beatIds.length>0&&new Set(params.beatIds).size===params.beatIds.length&&params.beatIds.every(id=>typeof id==='string'),'VOICE_SETTINGS','For beatIds select one scene/route and a nonempty unique list.','voice/beatIds');
    const selected=[],seen=new Set();
    for(const {scene,branchId}of entries){
      const beats=route(scene,branchId),chosen=params.beatIds?params.beatIds.map(id=>{const b=beats.find(b=>b.id===id);check(b,'BEAT_UNKNOWN','Beat is not on the selected route.','voice/beatIds',{beatId:id});return b;}):beats.filter(b=>b.narration?.[locale]?.trim());
      for(const b of chosen){const key=scene.id+'::'+b.id;if(!seen.has(key)){seen.add(key);selected.push({sceneId:scene.id,branchId,beat:b});}}
    }
    const sceneId=entries.length===1?entries[0].scene.id:null,profile=voiceProfile(project,locale),targets=[];
    for(const target of selected){
      const b=target.beat;check(b.narration?.[locale]?.trim(),'NARRATION','Set narration before generating voice.','beats/'+b.id+'/narration/'+locale);
      const ref=b.audio?.[locale];let needed=params.force||!ref||!project.assets[ref.assetId]||ref.textHash!==hash(b.narration[locale])||(ref.voiceHash&&ref.voiceHash!==hash(voiceProfile(project,locale,b)));
      if(!needed)try{await verifyAudio(d.store.directory,project.assets[ref.assetId]);}catch{needed=true;}
      check(!abort.signal.aborted,'VOICE_CANCELLED','Voice generation cancelled.');if(needed)targets.push(target);
    }
    check(targets.length>0,'VOICE_UP_TO_DATE','Selected narration already has current audio.');
    const engine=await voiceEngineStatus();check(engine.available,'VOICE_NOT_READY','Install the official voice engine first.','voice',{setup:engine.setup,missing:engine.missing});
    check(!abort.signal.aborted,'VOICE_CANCELLED','Voice generation cancelled.');
    const lock=join(tmpdir(),'river-voice-'+hash(enginePaths().home).slice(0,16));await mkdir(lock,{recursive:true});
    let release;try{release=await lockfile.lock(lock,{stale:10000,update:2000,retries:0});}catch(e){if(e.code==='ELOCKED')fail('VOICE_BUSY','Another local voice generation owns this engine.','voice',{},true);throw e;}
    this.job={status:'running',phase:'preparing',index:0,total:targets.length,sceneId,locale};
    let directory;
    try{
      directory=await mkdtemp(join(tmpdir(),'river-voice-'));
      const speakers=new Map();
      async function freezeSpeaker(referenceAssetId){
        const key=referenceAssetId??'default';if(speakers.has(key))return speakers.get(key);
        const referenceAsset=referenceAssetId?project.assets[referenceAssetId]:null;
        const reference=referenceAsset?(await verifyAudio(d.store.directory,referenceAsset)).path:enginePaths().reference;
        await probeAudio(reference);const referenceHash=hash(await readFile(reference)),speaker=join(directory,'speaker-'+speakers.size+extname(reference));await copyFile(reference,speaker);
        const value={path:speaker,sha256:referenceHash};speakers.set(key,value);return value;
      }
      const baseSpeaker=await freezeSpeaker(profile.referenceAssetId),clips=[];
      for(const {sceneId,branchId,beat:b}of targets){const settings=voiceProfile(project,locale,b),speaker=await freezeSpeaker(settings.referenceAssetId);clips.push({sceneId,branchId,beatId:b.id,narration:b.narration[locale],spokenText:pronounce(b.narration[locale],settings.pronunciations),settings,reference:speaker.path,referenceHash:speaker.sha256,output:join(directory,clips.length+'.wav')});}
      const result=await runEngine({home:enginePaths().home,directory,reference:baseSpeaker.path,lang:languages[locale],clips,result:join(directory,'result.json'),timeoutSeconds},abort.signal,p=>{this.job={...this.job,...p};});
      check(!abort.signal.aborted,'VOICE_CANCELLED','Voice generation cancelled.');
      check(result.clips?.length===clips.length,'VOICE_FAILED','Engine did not return every requested clip.');
      for(const c of clips)await probeAudio(c.output);
      const evidence={engine:result.engine,device:result.device,seconds:result.seconds,...(result.runtime?{runtime:result.runtime}:{}),locale,sceneId,referenceHash:baseSpeaker.sha256,settings:profile,clips:clips.map(({sceneId,beatId,narration,spokenText,settings,referenceHash})=>({sceneId,beatId,narration,spokenText,settings,referenceHash})),source:'https://github.com/index-tts/index-tts',state:'generated; project receipt determines attachment',requestId:params.requestId};
      const value=await d.commit(params,signature,async current=>{
        const imported=await importAudio(d.store.directory,{path:baseSpeaker.path});current.assets[imported.assetId]=imported.asset;
        const finalProfile={...profile,referenceAssetId:imported.assetId};current.voice??={};current.voice[locale]=finalProfile;
        for(const c of clips){
          check(!abort.signal.aborted,'VOICE_CANCELLED','Voice generation cancelled.');
          const imported=await importAudio(d.store.directory,{path:c.output});current.assets[imported.assetId]=imported.asset;
          const b=route(current.lesson.scenes.find(s=>s.id===c.sceneId),c.branchId).find(b=>b.id===c.beatId);
          b.audio??={};b.audio[locale]={assetId:imported.assetId,locale,textHash:hash(c.narration),voiceHash:hash(voiceProfile(current,locale,b))};
        }
        const evidenceDirectory=join(d.store.directory,'evidence/voice');await mkdir(evidenceDirectory,{recursive:true});
        await writeFile(join(evidenceDirectory,signature+'.json'),JSON.stringify(evidence,null,2)+'\n');
      },{beforeCommit:()=>{check(!abort.signal.aborted,'VOICE_CANCELLED','Voice generation cancelled.');this.job={...this.job,status:'committing'};}});
      this.job={status:'complete',index:clips.length,total:clips.length,sceneId,locale,revision:value.revision,engine:result.engine,device:result.device,seconds:result.seconds};return value;
    }catch(cause){
      const error=cause instanceof RiverError?cause:new RiverError(cause.code?.startsWith('VOICE_')?cause.code:'VOICE_FAILED',cause.message,'voice',{detail:cause.detail??cause.cause,...(cause.process?{process:cause.process}:{})});
      this.job={...this.job,status:error.code==='VOICE_CANCELLED'?'cancelled':'failed',error:errorJSON(error)};
      // Preserve a bounded diagnostic outside the temporary worker directory.
      try{const destination=join(d.store.directory,'evidence/voice');await mkdir(destination,{recursive:true});await writeFile(join(destination,'failed-'+signature+'.json'),JSON.stringify({requestId:params.requestId,sceneId,locale,error:errorJSON(error)},null,2)+'\n');const log=await readFile(join(directory,'engine.log'));await writeFile(join(destination,'failed-'+signature+'.log'),log);}catch{}
      throw error;
    }finally{if(directory)await rm(directory,{recursive:true,force:true});await release();}
  }
}
