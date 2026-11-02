import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readdir,stat,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
async function bytes(path){let total=0;try{for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);total+=e.isDirectory()?await bytes(p):(await stat(p)).size;}}catch(e){if(e.code!=='ENOENT')throw e;}return total;}
export async function performanceCheck(project,out){
  await mkdir(out,{recursive:true});const started=performance.now(),child=spawn(process.execPath,['bin/river.mjs','render','--project',project,'--profile','final','--out',join(out,'media'),'--timeout','600'],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',sampling=false,monitorFailure=null,peakRSSBytes=0,peakTemporaryBytes=0;
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  async function sample(){if(sampling)return;sampling=true;try{
    const {stdout:ps}=await exec('ps',['-axo','pid=,ppid=,rss='],{maxBuffer:4*1024*1024}),rows=ps.trim().split('\n').map(x=>x.trim().split(/\s+/).map(Number)),ids=new Set([child.pid]);
    let changed=true;while(changed){changed=false;for(const [pid,ppid]of rows)if(ids.has(ppid)&&!ids.has(pid)){ids.add(pid);changed=true;}}
    peakRSSBytes=Math.max(peakRSSBytes,rows.filter(r=>ids.has(r[0])).reduce((n,r)=>n+r[2]*1024,0));
    const dirs=await readdir(join(out,'media')).catch(()=>[]);let temporary=0;for(const d of dirs.filter(x=>x.startsWith('.stage-')))temporary+=await bytes(join(out,'media',d));peakTemporaryBytes=Math.max(peakTemporaryBytes,temporary);
  }catch(e){monitorFailure=e.message;child.kill('SIGTERM');}finally{sampling=false;}}
  const monitor=setInterval(sample,200),deadline=setTimeout(()=>child.kill('SIGTERM'),600000);await sample();
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});clearInterval(monitor);clearTimeout(deadline);
  const wallSeconds=(performance.now()-started)/1000;await writeFile(join(out,'stdout.json'),stdout);await writeFile(join(out,'stderr.ndjson'),stderr);
  const result=JSON.parse(stdout.trim().split('\n').at(-1));const report={status:code===0&&wallSeconds<=600&&peakRSSBytes<=3*1024**3&&peakTemporaryBytes<=1024**3&&!monitorFailure?'PASS':'FAIL',scope:'Independent parent samples the entire CLI render process tree from launch through exit; 200 ms sampling',wallSeconds,peakRSSBytes,peakTemporaryBytes,sampleIntervalMs:200,monitorFailure,limits:{wallSeconds:600,rssBytes:3*1024**3,temporaryBytes:1024**3},receipt:result};
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');assert.equal(report.status,'PASS',JSON.stringify(report));assert.equal(result.duration,60);return report;
}
