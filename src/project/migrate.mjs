import {readFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newProject,atomicJSON,ProjectStore} from './store.mjs';
import {importAudio} from '../media/audio.mjs';
import {clone,hash,id} from '../util.mjs';
import {check,fail} from '../errors.mjs';
import {projectSchema} from './schema.mjs';

export async function migrateLegacy(file,destination,output={}){
  const source=resolve(file),dest=resolve(destination),temporary=dest+'.import-'+id();
  let old;try{old=JSON.parse(await readFile(source,'utf8'));}catch(e){fail('PROJECT_CORRUPT','Legacy JSON is invalid; source is untouched.','lesson',{cause:e.message});}
  check(old.version===1,'SCHEMA_VERSION','Migration accepts version 1 lessons.','lesson/version');
  await mkdir(temporary,{recursive:true});
  try{
    const lesson={scenes:clone(old.scenes),...(old.title?{title:old.title}:{})},attachments=[];
    for(const scene of lesson.scenes)for(const beat of [...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)]){
      for(const [locale,a]of Object.entries(beat.audio??{}))attachments.push({beat,locale,src:a.src});delete beat.audio;
    }
    const project=newProject(lesson,output);
    for(const {beat,locale,src}of attachments){
      const sourceInput=src.startsWith('data:')?{data:src}:{path:src.startsWith('file:')?fileURLToPath(src):resolve(dirname(source),src)};
      const imported=await importAudio(temporary,sourceInput);project.assets[imported.assetId]=imported.asset;
      beat.audio??={};beat.audio[locale]={assetId:imported.assetId,locale,textHash:hash(beat.narration?.[locale]??'')};
    }
    // newProject clones the lesson; copy back imported attachment references.
    project.lesson=lesson;projectSchema(project);await atomicJSON(join(temporary,'project.json'),project);
    await mkdir(join(temporary,'evidence'),{recursive:true});
    await atomicJSON(join(temporary,'evidence/migration.json'),{sourceHash:hash(await readFile(source)),sourceVersion:1,sourceUnchanged:true,selectedOutput:project.output,defaultsApplied:['locale','aspect','profile','sceneId','branchId','captions'].filter(k=>output[k]===undefined)});
    // mkdir reserves the destination without replacing an existing project.
    try{await mkdir(dest);}catch(e){if(e.code==='EEXIST')fail('DESTINATION_EXISTS','Migration destination already exists.','project');throw e;}
    try{await rename(temporary,dest);}catch(e){await rm(dest,{recursive:true,force:true});throw e;}
    return new ProjectStore(dest);
  }finally{await rm(temporary,{recursive:true,force:true});}
}
