import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {hash} from '../src/util.mjs';
import {localePacks} from '../src/locales.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildFingerprint(){
  const sources={};for(const name of ['src/client/render.mjs','src/client/style.css','scripts/build.mjs'])sources[name]=hash(await readFile(root+name));
  sources.locales=hash(await localePacks());return {hash:hash(sources),sources};
}
export async function build(){
  const fingerprint=await buildFingerprint(),renderer=await readFile(root+'src/client/render.mjs','utf8'),style=await readFile(root+'src/client/style.css','utf8');
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>River</title><style>${style}</style></head><body class="viewer"><div id="app"></div><script type="module">${renderer.replace(/^export /gm,'')}
  window.RIVER_BUILD=${JSON.stringify(fingerprint.hash)};let plan,markup;
  window.riverFrame={load:p=>{if(p.format!=='river.plan'||p.version!==2||p.frames.some(f=>f.state.unit!=='BB'))throw new Error('Expected river.plan v2 with BB amounts');plan=p;markup=null;document.documentElement.lang=p.locale;return window.riverFrame.render(0);},render:i=>{const next=renderFrame(plan,i);window.riverFrame.changed=next!==markup;if(window.riverFrame.changed)document.getElementById('app').innerHTML=next;markup=next;return frameAt(plan,i).id;},inspect:()=>plan};
  window.__riverReady=true;
  </script></body></html>`;
  await mkdir(root+'dist',{recursive:true});await writeFile(root+'dist/client.html',html);await writeFile(root+'dist/build.json',JSON.stringify(fingerprint,null,2)+'\n');return fingerprint;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length){if(args.length!==2||args[0]!=='--lesson')throw new Error('Usage: build.mjs [--lesson path]');JSON.parse(await readFile(args[1],'utf8'));}
    console.log(JSON.stringify(await build()));
  }catch(error){console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}
