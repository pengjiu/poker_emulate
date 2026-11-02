import {readFile,writeFile,mkdir,rm,rename,readdir,stat,copyFile,glob} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {chromium} from 'playwright';
import lockfile from 'proper-lockfile';
import {ProjectStore,atomicJSON} from '../project/store.mjs';
import {compileProject,validateProject} from '../compiler.mjs';
import {narrationCues,subtitleCues} from '../client/render.mjs';
import {localePacks} from '../locales.mjs';
import {doctor} from '../doctor.mjs';
import {hash,id,clone} from '../util.mjs';
import {check,fail,errorJSON,RiverError} from '../errors.mjs';
import {build,buildFingerprint} from '../../scripts/build.mjs';
const exec=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
const MiB=1024*1024;

async function fontFingerprint(){
  const extra=[];for await(const path of glob(['/System/Library/AssetsV2/com_apple_MobileAsset_Font*/**/PingFang.ttc','/System/Library/Fonts/* W3.ttc','/System/Library/Fonts/Hiragino Sans GB.ttc']))extra.push(path);
  const fonts={};for(const path of [...extra,'/System/Library/Fonts/PingFang.ttc','/System/Library/Fonts/SFNS.ttf','/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']){
    try{fonts[path.split('/').pop()]=hash(await readFile(path));}catch(e){if(e.code!=='ENOENT')throw e;}
  }check(Object.keys(fonts).length,'FONT_MISSING','Install the system fonts used by the client.','fonts');return fonts;
}
async function directoryBytes(path){let total=0;for(const entry of await readdir(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())total+=await directoryBytes(child);else total+=(await stat(child)).size;}return total;}
async function processTreeRSS(){
  const {stdout}=await exec('ps',['-axo','pid=,ppid=,rss='],{timeout:3000,maxBuffer:4*MiB});
  const rows=stdout.trim().split('\n').map(x=>x.trim().split(/\s+/).map(Number)),pids=new Set([process.pid]);
  let changed=true;while(changed){changed=false;for(const [pid,ppid]of rows)if(pids.has(ppid)&&!pids.has(pid)){pids.add(pid);changed=true;}}
  return rows.filter(([pid])=>pids.has(pid)).reduce((n,row)=>n+row[2]*1024,0);
}
export async function probeVideo(path){
  const {stdout}=await exec('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels:format=duration,size','-of','json',path],{timeout:15000,maxBuffer:MiB});return JSON.parse(stdout);
}
export async function renderVideo(directory,options={}){
  const started=performance.now(),store=new ProjectStore(directory),project=await store.read(),packs=await localePacks();
  const preflight=await validateProject(project,packs,{directory:store.directory,output:options.output,media:true});
  check(preflight.ready,'PRECHECK','Selected output is not ready.','render',{issues:preflight.results.flatMap(r=>r.issues)});
  const plan=compileProject(project,packs,{output:options.output}),env=await doctor();check(env.ok,'DEPENDENCY','Resolve doctor findings before rendering.','runtime',{checks:env.checks});
  const expectedBuild=await buildFingerprint();let built;try{built=JSON.parse(await readFile(root+'dist/build.json','utf8'));}catch{}
  if(built?.hash!==expectedBuild.hash)await build();
  const fonts=await fontFingerprint(),toolchain={...env.toolchain,tools:env.checks.filter(c=>c.version).map(c=>({name:c.name,version:c.version})),fonts};
  const planHash=hash(plan),fingerprint=hash({planHash,renderer:expectedBuild.hash,toolchain});
  const limit={timeoutSeconds:options.timeoutSeconds??Math.min(7200,Math.max(120,plan.duration*10)),rssBytes:3*1024*MiB,temporaryBytes:1024*MiB};
  check(Number.isFinite(limit.timeoutSeconds)&&limit.timeoutSeconds>0&&limit.timeoutSeconds<=7200,'TIMEOUT','Use a timeout between 0 and 7200 seconds.','timeout');
  const base=resolve(options.out??join(store.directory,'artifacts'));check(!/\.(mp4|json|srt)$/i.test(base),'OUTPUT_PATH','--out is a result directory, not a file.','out');
  await mkdir(base,{recursive:true});const destination=join(base,fingerprint),stage=join(base,'.stage-'+id()),jobLock=join(tmpdir(),'river-render-'+hash(root).slice(0,16));
  await mkdir(jobLock,{recursive:true});let release;
  try{release=await lockfile.lock(jobLock,{stale:10000,update:2000,retries:0});}catch(e){if(e.code==='ELOCKED')fail('RENDER_BUSY','A render is already running. Retry after it completes.','render',{},true);throw e;}
  const controller=new AbortController(),children=new Set(),metrics={wallSeconds:0,peakRSSBytes:0,peakTemporaryBytes:0,sampleIntervalMs:200,capturedFrames:0,reusedFrames:0};
  let browserServer,browser,phase='prepare',monitoring=false,timeout,monitor,stderr='',abortReason;
  const terminate=()=>{for(const child of children){try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}}browserServer?.kill().catch(()=>{});};
  const abort=(reason)=>{if(controller.signal.aborted)return;abortReason=reason;controller.abort();terminate();};
  const onExternalAbort=()=>abort(new RiverError('CANCELLED','Render was cancelled.','render'));
  options.signal?.addEventListener('abort',onExternalAbort,{once:true});
  function running(){if(controller.signal.aborted)throw abortReason;}
  function command(name,args,{pipe=false}={}){
    running();const child=spawn(name,args,{detached:true,stdio:[pipe?'pipe':'ignore','pipe','pipe']});children.add(child);
    let stdout='',error='';child.stdout.on('data',x=>{stdout=(stdout+x.toString()).slice(-2*MiB);});child.stderr.on('data',x=>{error=(error+x.toString()).slice(-2*MiB);stderr=error;});
    child.stdin?.on('error',()=>{});
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{children.delete(child);if(code===0)resolve({stdout,stderr:error});else reject(controller.signal.aborted?abortReason:new RiverError('MEDIA_PROCESS',`${name} failed.`,phase,{exitCode:code,log:error}));});});done.catch(()=>{});return {child,done};
  }
  async function phaseChanged(value){phase=value;options.onProgress?.({phase,jobId:fingerprint});await options.hooks?.onPhase?.(value,{stage,destination,children,abort});running();}
  try{
    if(options.signal?.aborted)onExternalAbort();running();
    try{
      const prior=JSON.parse(await readFile(join(destination,'receipt.json'),'utf8'));
      if(prior.fingerprint===fingerprint&&hash(await readFile(join(destination,'video.mp4')))===prior.videoSha256){const probe=await probeVideo(join(destination,'video.mp4'));check(probe.streams.some(s=>s.codec_type==='video'),'CACHE_INVALID','Cached media is invalid.');return {...prior,cached:true,directory:destination};}
      fail('OUTPUT_CONFLICT','Existing result does not match its fingerprint.','out');
    }catch(e){if(e.code!=='ENOENT')throw e;}
    await mkdir(stage);await mkdir(join(stage,'inputs'));await mkdir(join(stage,'frames'));
    timeout=setTimeout(()=>abort(new RiverError('TIME_LIMIT','Render exceeded its declared timeout.','render',{limitSeconds:limit.timeoutSeconds})),limit.timeoutSeconds*1000);timeout.unref();
    monitor=setInterval(async()=>{
      if(monitoring||controller.signal.aborted)return;monitoring=true;
      try{
        const rss=await processTreeRSS(),bytes=await directoryBytes(stage);metrics.peakRSSBytes=Math.max(metrics.peakRSSBytes,rss);metrics.peakTemporaryBytes=Math.max(metrics.peakTemporaryBytes,bytes);
        if(rss>limit.rssBytes||bytes>limit.temporaryBytes)abort(new RiverError('RESOURCE_LIMIT','Render exceeded its memory or temporary storage limit.','render',{rss,bytes,limit}));
      }catch(e){if(e.code!=='ENOENT')abort(new RiverError('MONITOR_FAILED','Resource monitoring failed.','render',{cause:e.message}));}finally{monitoring=false;}
    },200);monitor.unref();
    const inputs=new Map(),audios=[];
    for(const cue of narrationCues(plan)){if(!cue.audio)continue;const asset=project.assets[cue.audio.assetId];
      if(!inputs.has(cue.audio.assetId)){const bytes=await readFile(join(store.directory,asset.path));check(hash(bytes)===asset.sha256,'ASSET_CHANGED','Audio changed before input freeze.',asset.path);const path=join(stage,'inputs',asset.path.split('/').pop());await writeFile(path,bytes);inputs.set(cue.audio.assetId,path);}
      audios.push({cueId:cue.id,assetId:cue.audio.assetId,path:inputs.get(cue.audio.assetId),start:cue.start,duration:cue.audio.duration,sha256:asset.sha256,locale:plan.locale});
    }
    await copyFile(root+'dist/client.html',join(stage,'client.html'));
    await phaseChanged('frames');browserServer=await chromium.launchServer({headless:true});running();browser=await chromium.connect(browserServer.wsEndpoint());
    const page=await browser.newPage({viewport:{width:plan.width,height:plan.height},deviceScaleFactor:1});const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.goto(pathToFileURL(join(stage,'client.html')).href);await page.waitForFunction(()=>window.__riverReady);
    check(await page.evaluate(()=>window.RIVER_BUILD)===expectedBuild.hash,'BUILD_MISMATCH','Browser renderer fingerprint is stale.','renderer');
    await page.evaluate(plan=>window.riverFrame.load(plan),plan);await page.evaluate(()=>document.fonts.ready);
    const video=command('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate',String(plan.fps),'-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',join(stage,'silent.mp4')],{pipe:true});
    const keyframes=new Set([0,plan.totalFrames-1,...plan.frames.slice(0,62).map(f=>Math.min(f.endFrame-1,f.startFrame+Math.ceil(.4*plan.fps)))]),keyframeHashes=[];
    // Preserve the exact frames on both sides of each teaching reveal. Sampling
    // only 400 ms into a segment cannot prove that an answer was not shown early.
    for(const frame of plan.frames)if(frame.presentation){keyframes.add(Math.max(0,frame.startFrame-1));keyframes.add(frame.startFrame);}
    let pixels;
    for(let frame=0;frame<plan.totalFrames;frame++){
      running();const changed=await page.evaluate(i=>{window.riverFrame.render(i);return window.riverFrame.changed;},frame);
      if(changed||!pixels){pixels=await page.screenshot({type:'png'});metrics.capturedFrames++;}else metrics.reusedFrames++;
      if(keyframes.has(frame)){const name=`${String(frame).padStart(6,'0')}.png`;await writeFile(join(stage,'frames',name),pixels);keyframeHashes.push({frame,file:'frames/'+name,sha256:hash(pixels)});}
      await new Promise((accept,reject)=>{
        const cancelled=()=>reject(abortReason);controller.signal.addEventListener('abort',cancelled,{once:true});
        if(controller.signal.aborted){controller.signal.removeEventListener('abort',cancelled);reject(abortReason);return;}
        video.child.stdin.write(pixels,error=>{controller.signal.removeEventListener('abort',cancelled);if(error)reject(new RiverError('MEDIA_PIPE','Video encoder closed its input.','frames',{cause:error.code}));else accept();});
      });
      if(frame%(plan.fps*5)===0)options.onProgress?.({phase,frame,totalFrames:plan.totalFrames,jobId:fingerprint});
    }
    video.child.stdin.end();await video.done;check(pageErrors.length===0,'BROWSER_ERROR','Client renderer reported errors.','renderer',{errors:pageErrors});
    await browser.close();browser=null;await browserServer.close();browserServer=null;
    await phaseChanged('audio');
    const filters=audios.map((a,i)=>`[${i+2}:a]aresample=48000,adelay=${Math.round(a.start*1000)}:all=1[a${i}]`);
    filters.push(`[1:a]${audios.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${audios.length+1}:duration=first:normalize=0,alimiter=limit=0.95[mixed]`);
    await command('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',join(stage,'silent.mp4'),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo',...audios.flatMap(a=>['-i',a.path]),'-filter_complex',filters.join(';'),'-map','0:v','-map','[mixed]','-c:v','copy','-c:a','aac','-b:a','160k','-t',String(plan.duration),'-movflags','+faststart',join(stage,'video.mp4')]).done;
    await phaseChanged('verify');const probe=await probeVideo(join(stage,'video.mp4')),v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
    check(v?.codec_name==='h264'&&a?.codec_name==='aac'&&v.width===plan.width&&v.height===plan.height&&v.r_frame_rate===`${plan.fps}/1`&&Number(v.nb_frames)===plan.totalFrames&&Math.abs(Number(probe.format.duration)-plan.duration)<=2/plan.fps,'MEDIA_SPEC','Encoded media does not match the selected output.','video',{probe});
    await command('ffmpeg',['-v','error','-i',join(stage,'video.mp4'),'-f','null','-']).done;
    let volume=null;if(audios.length){const result=await command('ffmpeg',['-hide_banner','-i',join(stage,'video.mp4'),'-af','volumedetect','-vn','-f','null','-']).done;volume=Number(result.stderr.match(/max_volume: ([-\d.]+) dB/)?.[1]);check(Number.isFinite(volume)&&volume>-70,'AUDIO_SILENT','Narrated output has a silent audio track.','audio');}
    const stamp=t=>{const ms=Math.round(t*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(x=>String(x).padStart(2,'0')).join(':')+','+String(ms%1000).padStart(3,'0');};
    const voiced=subtitleCues(plan);if(voiced.length)await writeFile(join(stage,'captions.srt'),voiced.map((f,i)=>`${i+1}\n${stamp(f.start)} --> ${stamp(f.end)}\n${f.text}\n`).join('\n'));
    metrics.wallSeconds=(performance.now()-started)/1000;
    const validation={status:'PASS',spec:true,decode:true,audioNonSilent:audios.length?true:null,maxVolumeDB:volume,expectedFrames:plan.totalFrames,keyframes:keyframeHashes,metrics,limits:limit};
    const receipt={version:1,fingerprint,projectId:project.projectId,revision:project.revision,projectHash:plan.projectHash,scene:plan.sceneId,branch:plan.branchId,sequence:plan.sequence??null,locale:plan.locale,aspect:plan.aspect,profile:plan.profile,width:plan.width,height:plan.height,fps:plan.fps,frames:plan.totalFrames,duration:plan.duration,rendererHash:expectedBuild.hash,planHash,toolchain,audioSources:audios.map(({path,...a})=>a),probe,videoSha256:hash(await readFile(join(stage,'video.mp4'))),validation,createdAt:new Date().toISOString()};
    await atomicJSON(join(stage,'validation.json'),validation);await atomicJSON(join(stage,'receipt.json'),receipt);
    await rm(join(stage,'inputs'),{recursive:true});await rm(join(stage,'silent.mp4'));await rm(join(stage,'client.html'));
    await phaseChanged('publish');await options.hooks?.beforePublish?.({stage,destination});running();await rename(stage,destination);
    return {...receipt,directory:destination,cached:false};
  }catch(error){
    const actual=controller.signal.aborted?abortReason:error;terminate();await mkdir(join(base,'failures'),{recursive:true});
    await atomicJSON(join(base,'failures',id()+'.json'),{status:'FAIL',phase,fingerprint,error:errorJSON(actual),metrics:{...metrics,wallSeconds:(performance.now()-started)/1000},log:stderr.slice(-2*MiB)}).catch(()=>{});throw actual;
  }finally{
    clearTimeout(timeout);clearInterval(monitor);options.signal?.removeEventListener('abort',onExternalAbort);terminate();
    await browser?.close().catch(()=>{});await browserServer?.kill().catch(()=>{});
    await rm(stage,{recursive:true,force:true});await release();
  }
}
