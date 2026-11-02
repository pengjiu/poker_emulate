import {Director} from '../../src/director.mjs';
const [directory,phase]=process.argv.slice(2);
const die=()=>process.kill(process.pid,'SIGKILL');
const director=await Director.open(directory,{faults:{[phase]:die}});
await director.apply({requestId:'crash-request',expectedRevision:0,commands:[{type:'output.set',value:{locale:'ja-JP',aspect:'portrait'}}]});
