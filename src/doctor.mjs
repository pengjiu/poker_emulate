import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat,readFile} from 'node:fs/promises';
import {platform,release,arch,totalmem,cpus} from 'node:os';
const exec=promisify(execFile);
export async function doctor(){
  const checks=[];checks.push({name:'node',ok:Number(process.versions.node.split('.')[0])===24,version:process.version});
  for(const tool of ['ffmpeg','ffprobe']){try{const {stdout}=await exec(tool,['-version'],{timeout:10000});checks.push({name:tool,ok:true,version:stdout.split('\n')[0]});}catch(e){checks.push({name:tool,ok:false,action:`Install ${tool}.`,error:e.code});}}
  let pkg={version:null},chromium;
  try{pkg=JSON.parse(await readFile(new URL('../node_modules/playwright/package.json',import.meta.url),'utf8'));chromium=(await import('playwright')).chromium;checks.push({name:'playwright-package',ok:true});}
  catch(e){checks.push({name:'playwright-package',ok:false,action:'Run npm ci in this project.',error:e.code});}
  try{await import('proper-lockfile');checks.push({name:'project-lock-package',ok:true});}catch(e){checks.push({name:'project-lock-package',ok:false,action:'Run npm ci in this project.',error:e.code});}
  if(chromium)try{await stat(chromium.executablePath());checks.push({name:'chromium',ok:true,path:chromium.executablePath()});}catch{checks.push({name:'chromium',ok:false,action:'Run npx playwright install chromium.'});}
  return {ok:checks.every(c=>c.ok),checks,toolchain:{node:process.version,playwright:pkg.version,platform:platform(),osRelease:release(),arch:arch(),cpu:cpus()[0]?.model,memoryBytes:totalmem()}};
}
