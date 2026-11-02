import http from 'node:http';
import {readFile,writeFile,mkdir,rm,stat,rename} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join,resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import lockfile from 'proper-lockfile';
import {Director} from './director.mjs';
import {atomicJSON} from './project/store.mjs';
import {compileProject,validateProject} from './compiler.mjs';
import {renderVideo} from './media/render.mjs';
import {keys} from './project/schema.mjs';
import {check,errorJSON,fail} from './errors.mjs';
import {hash,id} from './util.mjs';
import {patterns} from './direction/index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.mp4':'video/mp4','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4','.png':'image/png','.srt':'text/plain','.gz':'application/gzip'};
async function fileResponse(req,res,path,download){
  const info=await stat(path);check(info.isFile(),'FILE','File not found.');let start=0,end=info.size-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416);res.end();return;}start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end){res.writeHead(416);res.end();return;}status=206;}
  const headers={'Content-Type':types[extname(path)]??'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;if(download)headers['Content-Disposition']=`attachment; filename="${download}"`;
  res.writeHead(status,headers);if(req.method==='HEAD')res.end();else createReadStream(path,{start,end}).on('error',()=>res.destroy()).pipe(res);
}
export async function serve(directory,{port=4174}={}){
  const d=await Director.open(directory),runtime=join(d.store.directory,'.runtime');await mkdir(runtime,{recursive:true});
  let release;try{release=await lockfile.lock(runtime,{stale:10000,update:2000,retries:0});}catch(e){fail('RUNTIME_BUSY','This project already has a running studio.','project',{},true);}
  const token=id(),runtimePath=join(d.store.directory,'.runtime.json');let url,job=null,jobPromise=null,jobAbort=null;
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(req.method==='POST'){
        check(req.headers['x-river-token']===token,'SESSION','Studio session token is required.');
        let raw='',size=0;for await(const chunk of req){size+=chunk.length;check(size<=32*1024*1024,'REQUEST_SIZE','Request exceeds 32 MiB; import large audio through the local CLI.');raw+=chunk.toString();}
        let body;try{body=JSON.parse(raw||'{}');}catch{fail('JSON','Request JSON is invalid.');}
        if(pathname==='/api/rpc'){json(res,200,{ok:true,value:await d.dispatch(body)});return;}
        if(pathname==='/api/render'){
          keys(body,[],'render');check(!jobPromise,'RENDER_BUSY','A render is already running.');
          jobAbort=new AbortController();job={status:'running',progress:null};
          jobPromise=renderVideo(d.store.directory,{signal:jobAbort.signal,onProgress:p=>{job.progress=p;}}).then(result=>{job={status:'complete',result,videoUrl:`/artifacts/${result.fingerprint}/video.mp4`};},error=>{job={status:'failed',error:errorJSON(error)};}).finally(()=>{jobPromise=null;jobAbort=null;});json(res,202,{ok:true,value:job});return;
        }
        if(pathname==='/api/cancel'){keys(body,[],'cancel');jobAbort?.abort();json(res,200,{ok:true});return;}
        if(pathname==='/api/export'){
          keys(body,[],'export');const project=await d.store.read(),exportRoot=join(dirname(d.store.directory),'exports');await mkdir(exportRoot,{recursive:true});
          const name=`${project.projectId}-${project.revision}-${hash(project).slice(0,12)}`,archive=join(exportRoot,name+'.tar.gz');
          try{await stat(archive);}catch(e){if(e.code!=='ENOENT')throw e;const folder=join(exportRoot,name+'-'+id());await d.export({destination:folder});try{await exec('tar',['-czf',archive+'.tmp','-C',folder,'.'],{timeout:120000});await rename(archive+'.tmp',archive);}finally{await rm(folder,{recursive:true,force:true});}}
          json(res,200,{ok:true,url:'/export/'+name+'.tar.gz'});return;
        }
        fail('ROUTE','Unknown endpoint.');
      }
      check(['GET','HEAD'].includes(req.method),'METHOD','Use GET or POST.');
      if(pathname==='/api/snapshot'){
        const project=await d.store.read(),observation=await d.observe({view:'director'});let plan=null;
        try{plan=compileProject(project,d.packs);}catch{}
        json(res,200,{project,observation,plan,patterns:patterns(),locales:Object.keys(d.packs),dictionaries:d.packs,dictionary:d.packs[project.output.locale],job,voice:await d.voice({action:'status'})});return;
      }
      if(pathname==='/api/plan'){json(res,200,{plan:await d.export({kind:'plan'}),observation:await d.observe()});return;}
      if(pathname==='/'){
        const html=await readFile(root+'src/studio/index.html','utf8');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html.replace('__SESSION_TOKEN__',JSON.stringify(token)));return;
      }
      const staticFiles={'/studio.js':'src/studio/app.mjs','/style.css':'src/client/style.css','/client/render.mjs':'src/client/render.mjs'};
      if(staticFiles[pathname]){await fileResponse(req,res,root+staticFiles[pathname]);return;}
      if(/^\/assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(pathname)){const p=await d.store.read();check(Object.values(p.assets).some(a=>'/'+a.path===pathname),'ASSET_MISSING','Unknown asset.');await fileResponse(req,res,d.store.directory+pathname);return;}
      if(/^\/artifacts\/[a-f0-9]{64}\/(video\.mp4|captions\.srt|receipt\.json)$/.test(pathname)){await fileResponse(req,res,d.store.directory+pathname);return;}
      if(/^\/export\/[a-f0-9-]+\.tar\.gz$/.test(pathname)){await fileResponse(req,res,join(dirname(d.store.directory),'exports',pathname.split('/').pop()),'river-project.tar.gz');return;}
      json(res,404,{ok:false,error:{code:'NOT_FOUND'}});
    }catch(error){if(!res.headersSent)json(res,error.code==='PROJECT_BUSY'||error.code==='RENDER_BUSY'?409:400,{ok:false,error:errorJSON(error)});else res.destroy();}
  });
  try{
    await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});url=`http://127.0.0.1:${server.address().port}`;d.previewUrl=url;
    await atomicJSON(runtimePath,{url,token,pid:process.pid,projectId:(await d.store.read()).projectId});
  }catch(e){await release();throw e;}
  let closing=false;return {url,director:d,async close(){if(closing)return;closing=true;jobAbort?.abort();await d.voice({action:'cancel'});await jobPromise;server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));await rm(runtimePath,{force:true});await release();}};
}
