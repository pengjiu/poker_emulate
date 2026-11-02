import {readFile,writeFile,mkdir,rename,rm,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ProjectStore,atomicJSON} from '../project/store.mjs';
import {compileProject} from '../compiler.mjs';
import {localePacks} from '../locales.mjs';
import {narrationCues} from '../client/render.mjs';
import {verifyAudio} from './audio.mjs';
import {effectWav,mixGraph} from './sound.mjs';
import {hash,id} from '../util.mjs';
import {check} from '../errors.mjs';
const exec=promisify(execFile);

export async function freezeSoundInputs(project,plan,directory,stage){
  await mkdir(stage,{recursive:true});const inputs=new Map(),sources=[];
  async function assetPath(id){if(inputs.has(id))return inputs.get(id);const asset=project.assets[id];check(asset,'ASSET_MISSING','Sound asset is missing.',id);await verifyAudio(directory,asset);const bytes=await readFile(join(directory,asset.path));check(hash(bytes)===id,'ASSET_CHANGED','Audio changed before input freeze.',asset.path);const path=join(stage,asset.path.split('/').pop());await writeFile(path,bytes);inputs.set(id,path);return path;}
  for(const cue of narrationCues(plan))if(cue.audio){const asset=project.assets[cue.audio.assetId];sources.push({kind:'voice',cueId:cue.id,assetId:cue.audio.assetId,path:await assetPath(cue.audio.assetId),start:cue.start,duration:cue.audio.duration,sha256:asset.sha256,locale:plan.locale});}
  const effects=new Map();for(const event of plan.sound?.events??[]){if(!effects.has(event.kind)){const path=join(stage,'effect-'+event.kind+'.wav');await writeFile(path,effectWav(event.kind));effects.set(event.kind,path);}sources.push({...event,path:effects.get(event.kind),kind:'effect',effect:event.kind});}
  if(plan.sound?.bed){const bed=plan.sound.bed,asset=project.assets[bed.assetId],start=bed.start??0;if(start<plan.duration)sources.push({kind:'bed',assetId:bed.assetId,path:await assetPath(bed.assetId),start,duration:Math.min(plan.duration-start,bed.loop?plan.duration:asset.duration),loop:bed.loop??false,volume:bed.volume??.12,sha256:asset.sha256});}
  return sources;
}
export function audioInputArguments(sources){return sources.flatMap(source=>[...(source.loop?['-stream_loop','-1']:[]),'-i',source.path]);}

// The studio auditions the same mixed stream as the final mux, including voice
// gain, Foley, quiet passages, background ducking and loudness processing.
export async function renderMixedAudio(directory,{output,signal}={}){
  const store=new ProjectStore(directory),project=await store.read(),plan=compileProject(project,await localePacks(),{output});
  const code=hash([await readFile(new URL('./sound.mjs',import.meta.url)),await readFile(new URL('./mix.mjs',import.meta.url))]),toolchain=(await exec('ffmpeg',['-version'],{timeout:10000,maxBuffer:1024*1024})).stdout,fingerprint=hash({code,toolchain,duration:plan.duration,cues:narrationCues(plan),sound:plan.sound});
  const base=join(store.directory,'.runtime','audio'),stage=await mkdtemp(join(tmpdir(),'river-mix-'));await mkdir(base,{recursive:true});
  try{
    const sources=await freezeSoundInputs(project,plan,store.directory,stage),destination=join(base,fingerprint+'.m4a'),receiptPath=join(base,fingerprint+'.json');
    try{const prior=JSON.parse(await readFile(receiptPath,'utf8'));check(prior.fingerprint===fingerprint&&hash(await readFile(destination))===prior.sha256,'CACHE_INVALID','Mixed preview changed.','preview');return {...prior,revision:project.revision,cached:true};}catch(error){if(error.code!=='ENOENT')throw error;}
    const temporary=join(stage,'mixed.m4a');
    await exec('ffmpeg',['-y','-hide_banner','-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-f','lavfi','-i','anullsrc=r=48000:cl=stereo',...audioInputArguments(sources),'-filter_complex',mixGraph(sources,plan),'-map','[mixed]','-c:a','aac','-b:a','160k','-t',String(plan.duration),temporary],{timeout:120000,maxBuffer:2*1024*1024,signal});
    const bytes=await readFile(temporary),staged=destination+'.tmp-'+id();await writeFile(staged,bytes);await rename(staged,destination);
    const receipt={fingerprint,implementationHash:code,toolchainHash:hash(toolchain),sha256:hash(bytes),duration:plan.duration,revision:project.revision,url:'/preview-audio/'+fingerprint+'.m4a',pendingVoice:plan.issues.filter(i=>i.code==='AUDIO_MISSING').length};await atomicJSON(receiptPath,receipt);return {...receipt,cached:false};
  }finally{await rm(stage,{recursive:true,force:true});}
}
