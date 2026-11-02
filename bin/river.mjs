#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {doctor} from '../src/doctor.mjs';
import {errorJSON,check,fail} from '../src/errors.mjs';

const specs={doctor:['json'],init:['scene','project','locale','aspect','profile'],migrate:['lesson','project','locale','aspect','profile','scene','branch'],inspect:['project','view','beat'],validate:['project','locale','aspect','profile','scene','branch','all','render'],session:['project'],render:['project','locale','aspect','profile','scene','branch','out','timeout'],serve:['project','port'],help:[]};
const booleans=['json','all','render'];
const report=x=>console.log(JSON.stringify(x));
try{
  const [command='help',...args]=process.argv.slice(2),allowed=specs[command];check(allowed,'COMMAND','Unknown command.','command',{allowed:Object.keys(specs)});
  const opts={};for(let i=0;i<args.length;i++){
    const name=args[i].slice(2);check(args[i].startsWith('--')&&allowed.includes(name),'UNKNOWN_OPTION',`Unknown option: ${args[i]}`,'arguments',{allowed});check(opts[name]===undefined,'DUPLICATE_OPTION','Option repeated.','arguments/'+name);
    if(booleans.includes(name))opts[name]=true;else{check(args[i+1]&&!args[i+1].startsWith('--'),'OPTION_VALUE','Missing option value.','arguments/'+name);opts[name]=args[++i];}
  }
  const required=(...names)=>names.forEach(k=>check(opts[k],'OPTION_REQUIRED',`Provide --${k}.`,'arguments/'+k));
  const output=()=>Object.fromEntries(Object.entries({locale:opts.locale,aspect:opts.aspect,profile:opts.profile,sceneId:opts.scene,branchId:opts.branch==='main'?null:opts.branch}).filter(([,v])=>v!==undefined));
  if(command==='help')report({commands:specs,sessionMethods:['load','observe','apply','seek','export','voice']});
  else if(command==='doctor'){const result=await doctor();report(result);if(!result.ok)process.exitCode=1;}
  else if(command==='init'){
    const {createProject,newProject}=await import('../src/project/store.mjs');
    required('scene','project');const scene=JSON.parse(await readFile(opts.scene,'utf8'));const selected=output();selected.sceneId=scene.id;const store=await createProject(opts.project,newProject({scenes:[scene]},selected));report({ok:true,project:store.directory});
  }else if(command==='migrate'){
    const {migrateLegacy}=await import('../src/project/migrate.mjs');
    required('lesson','project');const store=await migrateLegacy(opts.lesson,opts.project,output());report({ok:true,project:store.directory});
  }else if(command==='render'){
    required('project');const {renderVideo}=await import('../src/media/render.mjs');const controller=new AbortController();const abort=()=>controller.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
    try{report({ok:true,...await renderVideo(opts.project,{output:output(),out:opts.out,timeoutSeconds:opts.timeout?Number(opts.timeout):undefined,signal:controller.signal,onProgress:p=>process.stderr.write(JSON.stringify(p)+'\n')})});}finally{process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);}
  }else if(command==='validate'){
    const {ProjectStore}=await import('../src/project/store.mjs'),{validateProject}=await import('../src/compiler.mjs'),{localePacks}=await import('../src/locales.mjs');
    required('project');const store=new ProjectStore(opts.project),result=await validateProject(await store.read(),await localePacks(),{directory:store.directory,output:output(),media:!!opts.render,all:!!opts.all});report(result);if(!result.ready)process.exitCode=1;
  }else if(command==='serve'){
    required('project');const {serve}=await import('../src/server.mjs');const server=await serve(opts.project,{port:opts.port?Number(opts.port):4174});report({ok:true,url:server.url});
    for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await server.close();});
  }else{
    const {connectDirector}=await import('../src/connect.mjs');
    required('project');const d=await connectDirector(opts.project);
    if(command==='inspect'){if(opts.beat)await d.seek({beatId:opts.beat,view:opts.view??'player'});report(await d.observe({view:opts.view??'player'}));}
    else{
      const cancel=()=>{d.dispatch({method:'voice',params:{action:'cancel'}}).catch(()=>{});process.stdin.destroy();process.exitCode=130;};
      process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
      let generation;
      const handle=async request=>{try{report({ok:true,value:await d.dispatch(request)});}catch(e){report({ok:false,error:errorJSON(e)});process.exitCode=1;}};
      try{for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
        if(!line.trim())continue;let request;try{request=JSON.parse(line);}catch(e){report({ok:false,error:errorJSON(e)});process.exitCode=1;continue;}
        const control=request.method==='voice'&&['status','cancel'].includes(request.params?.action??'status');
        if(generation&&!control)await generation;
        if(request.method==='voice'&&request.params?.action==='generate')generation=handle(request).finally(()=>{generation=null;});else await handle(request);
      }}finally{await generation;process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
    }
  }
}catch(e){report({ok:false,error:errorJSON(e)});process.exitCode=1;}
