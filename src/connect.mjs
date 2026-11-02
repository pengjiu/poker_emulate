import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Director} from './director.mjs';
import {check,RiverError} from './errors.mjs';
export async function connectDirector(directory){
  let runtime;try{runtime=JSON.parse(await readFile(join(resolve(directory),'.runtime.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(runtime){
    let alive=true;try{process.kill(runtime.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
    if(alive){
      check(/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.url),'RUNTIME','Invalid local runtime URL.');
      const dispatch=async request=>{let response;const seconds=request.params?.timeoutSeconds??1800,timeout=request.method==='voice'&&request.params?.action==='generate'&&Number.isFinite(seconds)&&seconds>=10&&seconds<=7200?Math.ceil((seconds+60)*1000):30000;try{response=await fetch(runtime.url+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','x-river-token':runtime.token},body:JSON.stringify(request),signal:AbortSignal.timeout(timeout)});}catch(e){throw new RiverError('RUNTIME_UNAVAILABLE','The existing studio is unreachable.','runtime',{cause:e.message},true);}const r=await response.json();if(!r.ok)throw new RiverError(r.error.code,r.error.message,r.error.path,r.error,r.error.retryable);return r.value;};
      return {dispatch,observe:params=>dispatch({method:'observe',params}),seek:params=>dispatch({method:'seek',params})};
    }
  }
  return Director.open(directory);
}
