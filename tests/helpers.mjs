import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newProject,createProject} from '../src/project/store.mjs';
import {localePacks} from '../src/locales.mjs';
export const packs=await localePacks();
export const legacy=JSON.parse(await readFile(new URL('./fixtures/legacy.json',import.meta.url),'utf8'));
export const words=s=>Object.fromEntries(['zh-CN','en-US','ja-JP'].map(l=>[l,s]));
export function fixture(output={}){
  const lesson={scenes:structuredClone(legacy.scenes)};
  for(const s of lesson.scenes)for(const b of [...s.beats,...(s.branches??[]).flatMap(b=>b.beats)])delete b.audio;
  return newProject(lesson,output);
}
export async function temp(t){const dir=await mkdtemp(join(tmpdir(),'river-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
export async function stored(t,output={}){const dir=await temp(t);return createProject(join(dir,'project'),fixture(output));}
