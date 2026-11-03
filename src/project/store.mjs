import {readFile,writeFile,mkdir,open,rename,rm,cp,stat,readdir} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import lockfile from 'proper-lockfile';
import {projectSchema} from './schema.mjs';
import {check,fail} from '../errors.mjs';
import {id,clone,hash} from '../util.mjs';

// The manifest is the commit record: revision and receipt are replaced together.
export async function atomicJSON(path,value,{beforeRename,afterRename}={}){
  const temporary=path+'.tmp-'+id();await mkdir(dirname(path),{recursive:true});
  const handle=await open(temporary,'wx');
  try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  try{await beforeRename?.();await rename(temporary,path);const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}await afterRename?.();}
  finally{await rm(temporary,{force:true});}
}
export async function withProjectLock(directory,fn){
  let release;try{release=await lockfile.lock(directory,{realpath:true,stale:10000,update:2000,retries:0});}
  catch(e){if(e.code==='ELOCKED')fail('PROJECT_BUSY','Another writer owns this project.','project',{},true);throw e;}
  try{return await fn();}finally{await release();}
}
export function receiptFor(project,requestId,signature){
  const receipt=project.receipts.find(r=>r.requestId===requestId);
  if(receipt)check(receipt.signature===signature,'REQUEST_CONFLICT','Request ID already used for different content.','requestId');
  return receipt?clone(receipt.value):null;
}
async function removeUnusedBrokenAssets(directory,project){
  const used=new Set(Object.values(project.voice??{}).map(p=>p.referenceAssetId));
  if(project.sound?.bed)used.add(project.sound.bed.assetId);
  for(const scene of project.lesson.scenes)for(const beat of [...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)]){for(const audio of Object.values(beat.audio??{}))used.add(audio.assetId);for(const settings of Object.values(beat.delivery??{}))used.add(settings.referenceAssetId);}
  for(const [id,asset]of Object.entries(project.assets))if(!used.has(id)){
    try{if(hash(await readFile(resolve(directory,asset.path)))===asset.sha256)continue;}
    catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))continue;}
    // Keep valid library assets and all referenced drafts. Only drop unusable, unreferenced index entries.
    delete project.assets[id];
  }
}
export class ProjectStore{
  constructor(directory,{faults={}}={}){this.directory=resolve(directory);this.path=join(this.directory,'project.json');this.faults=faults;}
  async read(){let project;try{project=JSON.parse(await readFile(this.path,'utf8'));}catch(e){fail(e.code==='ENOENT'?'PROJECT_MISSING':'PROJECT_CORRUPT','Cannot read project.json; the original file has not been changed.',this.path,{cause:e.message});}return projectSchema(project);}
  async update(fn,{beforeCommit}={}){return withProjectLock(this.directory,async()=>{const before=await this.read();for(const name of await readdir(this.directory))if(name.startsWith('project.json.tmp-'))await rm(join(this.directory,name),{force:true});const result=await fn(clone(before));if(result.project){projectSchema(result.project);await removeUnusedBrokenAssets(this.directory,result.project);await atomicJSON(this.path,result.project,{...this.faults,beforeRename:async()=>{await this.faults.beforeRename?.();beforeCommit?.();}});}return result.value;});}
  async copyTo(destination){
    const dest=resolve(destination);check(dest!==this.directory&&!dest.startsWith(this.directory+'/'),'EXPORT_PATH','Choose a destination outside the current project.','destination');
    try{await stat(dest);fail('DESTINATION_EXISTS','The export destination already exists.','destination');}catch(e){if(e.code!=='ENOENT')throw e;}
    const temporary=dest+'.tmp-'+id();await mkdir(temporary,{recursive:true});
    try{
      const project=await this.read();
      for(const asset of Object.values(project.assets)){const source=resolve(this.directory,asset.path);await mkdir(dirname(join(temporary,asset.path)),{recursive:true});const content=await readFile(source);check(hash(content)===asset.sha256,'ASSET_CHANGED','Asset hash differs from manifest.',asset.path);await writeFile(join(temporary,asset.path),content);}
      try{await cp(join(this.directory,'evidence'),join(temporary,'evidence'),{recursive:true,errorOnExist:true});}catch(e){if(e.code!=='ENOENT')throw e;}
      await mkdir(join(temporary,'assets'),{recursive:true});
      await mkdir(join(temporary,'evidence'),{recursive:true});
      await atomicJSON(join(temporary,'project.json'),project);await rename(temporary,dest);return {directory:dest,projectId:project.projectId,revision:project.revision};
    }finally{await rm(temporary,{recursive:true,force:true});}
  }
}
export function newProject(lesson,output={}){
  const project={format:'river.project',version:2,projectId:id(),revision:0,lesson:clone(lesson),output:{locale:'zh-CN',aspect:'landscape',profile:'draft',sceneId:lesson.scenes[0]?.id,branchId:null,captions:false,...output},assets:{},receipts:[]};
  projectSchema(project);return project;
}
export async function createProject(directory,project){
  const dest=resolve(directory);await mkdir(dirname(dest),{recursive:true});
  try{await mkdir(dest);}catch(e){if(e.code==='EEXIST')fail('DESTINATION_EXISTS','Project destination already exists.','project');throw e;}
  try{projectSchema(project);await mkdir(join(dest,'assets'));await mkdir(join(dest,'evidence'));await atomicJSON(join(dest,'project.json'),project);return new ProjectStore(dest);}
  catch(e){await rm(dest,{recursive:true,force:true});throw e;}
}
