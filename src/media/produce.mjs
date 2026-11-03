import {mkdir,readFile,writeFile,copyFile,rename,rm,mkdtemp,stat,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {ProjectStore,atomicJSON} from '../project/store.mjs';
import {compileProject} from '../compiler.mjs';
import {localePacks} from '../locales.mjs';
import {hash,id} from '../util.mjs';
import {check} from '../errors.mjs';
import {renderVideo} from './render.mjs';
import {narrationCues,esc} from '../client/render.mjs';

async function deliveryFiles(directory,prefix=''){
  const files={};
  for(const entry of await readdir(join(directory,prefix),{withFileTypes:true})){
    if(!prefix&&entry.name==='delivery.json')continue;
    const path=prefix?prefix+'/'+entry.name:entry.name;
    check(!entry.isSymbolicLink(),'CACHE_INVALID','Delivery files must be regular, portable files.',path);
    if(entry.isDirectory())Object.assign(files,await deliveryFiles(directory,path));
    else{check(entry.isFile(),'CACHE_INVALID','Unsupported delivery file.',path);files[path]=hash(await readFile(join(directory,path)));}
  }
  return files;
}

export async function produce(directory,{out,rehearsal=false,only,signal,onProgress}={}){
  check(typeof out==='string'&&out.trim(),'OUTPUT_PATH','Choose a delivery directory.','out');
  const source=new ProjectStore(directory),initial=await source.read(),packs=await localePacks();
  const definitions=initial.deliverables??[{id:'lesson',title:initial.lesson.title??{},output:initial.output}];
  if(only)check(Array.isArray(only)&&only.length&&only.every(id=>definitions.some(d=>d.id===id)),'DELIVERY','A requested delivery does not exist.','only');
  const selected=definitions.filter(d=>!only||only.includes(d.id));for(const d of selected)check(/^[a-zA-Z0-9_-]{1,80}$/.test(d.id),'DELIVERY','Delivery IDs use letters, numbers, underscores or hyphens.','deliverables/'+d.id);
  const base=resolve(out);await mkdir(base,{recursive:true});const temporary=await mkdtemp(join(tmpdir(),'river-produce-')),frozen=join(temporary,'project'),stage=join(base,'.delivery-'+id());
  await mkdir(stage);const outputs=[];
  try{
    await source.copyTo(frozen);const store=new ProjectStore(frozen),project=await store.read();check(hash(project)===hash(initial),'REVISION_CONFLICT','Project changed while preparing the production snapshot.','produce');
    for(const definition of selected){
      check(!signal?.aborted,'CANCELLED','Production was cancelled.','produce');
      const receipt=await renderVideo(frozen,{out:join(base,'.render-cache'),output:definition.output,rehearsal,signal,onProgress:p=>onProgress?.({deliveryId:definition.id,...p})});
      const stem=definition.id,plan=compileProject(project,packs,{output:definition.output}),files={};
      for(const [name,target]of [['video.mp4',stem+'.mp4'],['captions.srt',stem+'.srt'],['chapters.json',stem+'-chapters.json'],['receipt.json',stem+'-receipt.json']]){
        try{await stat(join(receipt.directory,name));}catch(error){if(error.code==='ENOENT'&&name==='captions.srt')continue;throw error;}
        await copyFile(join(receipt.directory,name),join(stage,target));files[target]=hash(await readFile(join(stage,target)));
      }
      const transcript=narrationCues(plan).map(c=>({start:c.start,end:c.start+c.duration,text:c.text,voiced:!!c.audio}));await atomicJSON(join(stage,stem+'-transcript.json'),transcript);files[stem+'-transcript.json']=hash(await readFile(join(stage,stem+'-transcript.json')));
      outputs.push({id:stem,title:definition.title[plan.locale]??plan.title,locale:plan.locale,aspect:plan.aspect,duration:plan.duration,video:stem+'.mp4',status:receipt.validation.status,pendingVoice:receipt.validation.pendingVoice??[],fingerprint:receipt.fingerprint,files});
    }
    await store.copyTo(join(stage,'project'));
    const practices=[];
    if(project.lesson.practice){
      const {practiceHTML,verifyPractice}=await import('../project/practice.mjs');
      for(const locale of [...new Set(outputs.map(output=>output.locale))]){await verifyPractice(project,frozen,{locale});const file=`practice-${locale}.html`;await writeFile(join(stage,file),practiceHTML(project,locale));practices.push({locale,file});}
      const preferred=practices.find(item=>item.locale===project.output.locale)??practices[0];await copyFile(join(stage,preferred.file),join(stage,'practice.html'));
    }
    const cards=outputs.map(o=>`<article><h2>${esc(o.title)}</h2><p>${esc(o.locale)} · ${esc(o.aspect)} · ${o.duration.toFixed(1)}s${o.status==='VISUAL_PASS'?' · 配音待制作 / Voice pending':''}</p><video controls preload="metadata" src="${o.video}"></video><p><a href="${o.video}">MP4</a> · <a href="${o.id}-transcript.json">Transcript</a> · <a href="${o.id}-chapters.json">Chapters</a></p></article>`).join('');
    await writeFile(join(stage,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>River course delivery</title><style>body{font:16px system-ui;background:#10171f;color:#eef2f5;max-width:1100px;margin:auto;padding:32px}a{color:#8edac0}article{margin:24px 0;padding:24px;background:#1b2731;border-radius:16px}video{width:100%;max-height:70vh}h1{font-size:32px}</style><h1>River · ${rehearsal?'画面排演 / Visual rehearsal':'课程交付 / Course delivery'}</h1>${practices.length?`<p>练习 / Practice: ${practices.map(item=>`<a href="${item.file}">${esc(item.locale)}</a>`).join(' · ')}</p>`:''}${cards}<p>Editable project, assets and strategy evidence: project/</p>`);
    const files=await deliveryFiles(stage),receipt={format:'river.delivery',version:1,projectId:project.projectId,revision:project.revision,projectHash:hash(project),rehearsal,outputs,practices,files,createdAt:new Date().toISOString()};
    await atomicJSON(join(stage,'delivery.json'),receipt);
    const destination=join(base,'delivery-'+hash({project:hash(project),outputs:outputs.map(o=>o.fingerprint),rehearsal,files}).slice(0,16));
    let exists=false;try{await stat(destination);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(exists){
      let prior,actual;try{prior=JSON.parse(await readFile(join(destination,'delivery.json'),'utf8'));actual=await deliveryFiles(destination);}catch(error){check(false,'CACHE_INVALID','Existing delivery is incomplete or unreadable.','out',{cause:error.code??error.message});}
      const {createdAt:ignored,...priorFacts}=prior,{createdAt:now,...facts}=receipt;
      check(hash(priorFacts)===hash(facts)&&hash(actual)===hash(files),'CACHE_INVALID','Delivery content or receipt changed.','out');return {...prior,directory:destination,cached:true};
    }
    await rename(stage,destination);return {...receipt,directory:destination,cached:false};
  }finally{await rm(stage,{recursive:true,force:true});await rm(temporary,{recursive:true,force:true});}
}
