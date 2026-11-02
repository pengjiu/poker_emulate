import {readFile,writeFile,mkdir,cp,readdir,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {ProjectStore} from '../src/project/store.mjs';
import {migrateLegacy} from '../src/project/migrate.mjs';
import {Director} from '../src/director.mjs';
import {compileProject} from '../src/compiler.mjs';
import {localePacks} from '../src/locales.mjs';
import {renderVideo} from '../src/media/render.mjs';
import {visualCheck} from './visual-check.mjs';
import {verifyMedia} from './verify-media.mjs';
import {performanceCheck} from './performance-check.mjs';
import {hash} from '../src/util.mjs';
const exec=promisify(execFile),args=process.argv.slice(2);
assert.ok(args.length===2&&args[0]==='--out','Usage: node scripts/acceptance.mjs --out <new-run-directory>');
const out=resolve(args[1]);await mkdir(dirname(out),{recursive:true});await mkdir(out,{recursive:false});
const report={version:1,runId:out.split('/').pop(),startedAt:new Date().toISOString(),status:'RUNNING',gates:Object.fromEntries(Array.from({length:17},(_,i)=>['A'+String(i+1).padStart(2,'0'),{status:'NOT_RUN',evidence:[]}]))};
const save=()=>writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const gate=(ids,evidence)=>{for(const id of ids)report.gates[id]={status:'PASS',evidence};};
async function suite(name,files){console.log('CHECK '+name);const r=await exec(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap','--test-timeout=240000',...files],{timeout:360000,maxBuffer:8*1024*1024}).catch(e=>e);await writeFile(join(out,name+'.tap'),(r.stdout??'')+(r.stderr??''));assert.ok(!r.code,`${name} failed; inspect ${name}.tap`);return name+'.tap';}
async function sourceHash(){const result={};async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())await scan(path);else result[path]=hash(await readFile(path));}}for(const dir of ['src','bin','locales','.agents/skills/poker-director'])await scan(dir);for(const f of ['package.json','package-lock.json','scripts/build.mjs'])result[f]=hash(await readFile(f));return {hash:hash(result),files:result};}
const source=await sourceHash();await writeFile(join(out,'source-fingerprint.json'),JSON.stringify(source,null,2));
try{
  await suite('core-contract',['tests/core.test.mjs','tests/contract.test.mjs']);gate(['A01','A03','A04','A05','A06','A07','A08','A10'],['core-contract.tap']);await save();
  await suite('media',['tests/media.test.mjs','tests/render-contract.test.mjs']);gate(['A09','A12','A13'],['core-contract.tap','media.tap']);await save();
  await suite('studio',['tests/studio.test.mjs']);gate(['A02'],['media.tap','studio.tap']);
  console.log('CHECK visual matrix');const visuals=await visualCheck(join(out,'visual'));assert.ok(visuals.length>=146);assert.ok(visuals.every(r=>r.status==='PASS'));gate(['A14'],['visual/report.json','studio.tap']);await save();
  console.log('CHECK clean install');
  const clean=join(out,'clean-project');await mkdir(clean);
  for(const name of ['src','bin','scripts','locales','.agents','package.json','package-lock.json','README.md','examples'])await cp(name,join(clean,name),{recursive:true});
  const toolchain=resolve(process.env.RIVER_ACCEPTANCE_NODE_DIR??dirname(process.execPath)),node=join(toolchain,'node'),npm=process.env.RIVER_ACCEPTANCE_NODE_DIR?resolve(toolchain,'../lib/node_modules/npm/bin/npm-cli.js'):(process.env.npm_execpath??resolve(toolchain,'../lib/node_modules/npm/bin/npm-cli.js'));
  const env={...process.env,PATH:toolchain+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'};delete env.NODE_PATH;delete env.NODE_OPTIONS;
  const install=await exec(node,[npm,'ci','--ignore-scripts'],{cwd:clean,env,timeout:180000,maxBuffer:4*1024*1024});await writeFile(join(out,'clean-install.log'),install.stdout+install.stderr);
  const cleanDoctor=JSON.parse((await exec(node,['bin/river.mjs','doctor','--json'],{cwd:clean,env})).stdout);assert.equal(cleanDoctor.ok,true);
  await exec(node,['scripts/build.mjs'],{cwd:clean,env});
  await writeFile(join(out,'clean-install.json'),JSON.stringify({status:'PASS',node,dependencyRoot:join(clean,'node_modules'),environmentPATH:env.PATH,doctor:cleanDoctor},null,2));
  console.log('RENDER formal language/aspect matrix');
  const project=join(out,'formal-project');await migrateLegacy('examples/legacy/lesson.json',project);const d=await Director.open(project);await d.apply({requestId:'formal-output',expectedRevision:(await d.observe()).revision,commands:[{type:'output.set',value:{profile:'final',captions:true,sceneId:'button-vs-blind',branchId:null}}]});
  const media=[];
  for(const locale of ['zh-CN','en-US','ja-JP'])for(const aspect of ['landscape','portrait']){
    console.log(`RENDER ${locale} ${aspect}`);const receipt=await renderVideo(project,{out:join(out,'media'),output:{locale,aspect},onProgress:p=>{if(p.frame%300===0)console.log(JSON.stringify({locale,aspect,...p}));}});
    const decoded=await verifyMedia(receipt.directory,project);media.push({locale,aspect,project,directory:receipt.directory,fingerprint:receipt.fingerprint,receipt,decoded});await writeFile(join(out,'media-index.json'),JSON.stringify(media,null,2));
  }
  console.log('RENDER complex side pots');
  const complexProject=join(out,'complex-project');await new ProjectStore(project).copyTo(complexProject);const cd=await Director.open(complexProject);
  const p=await cd.export(),scene=structuredClone(p.lesson.scenes.find(s=>s.id==='side-pots')),words={'zh-CN':'摊牌结算','en-US':'Settlement','ja-JP':'精算'};
  scene.beats.at(-1).label=words;scene.beats.at(-1).narration={'zh-CN':'主池一百二十个大盲归 A，边池六十个大盲归 B。C 多出的四十个大盲没有被跟注，已经退回。'};
  const textFile=join(out,'sidepot-narration.txt'),voiceFile=join(out,'sidepot-voice.aiff');await writeFile(textFile,scene.beats.at(-1).narration['zh-CN']);await exec('say',['-v','Tingting','-f',textFile,'-o',voiceFile],{timeout:30000});
  await cd.apply({requestId:'formal-sidepot',expectedRevision:(await cd.observe()).revision,commands:[{type:'scene.put',value:scene},{type:'output.set',value:{sceneId:'side-pots',locale:'zh-CN',aspect:'portrait'}},{type:'audio.attach',sceneId:'side-pots',beatId:scene.beats.at(-1).id,value:{locale:'zh-CN',source:{path:voiceFile}}}]});
  const complex=await renderVideo(complexProject,{out:join(out,'media')});media.push({locale:'zh-CN',aspect:'portrait',kind:'complex',project:complexProject,directory:complex.directory,receipt:complex,decoded:await verifyMedia(complex.directory,complexProject)});await writeFile(join(out,'media-index.json'),JSON.stringify(media,null,2));
  gate(['A07'],['core-contract.tap','media-index.json']);for(const id of ['A11','A15'])report.gates[id]={status:'NOT_RUN',evidence:['media.tap','media-index.json'],pending:'Actual speech content and visual review'};await save();
  console.log('CHECK 60-second performance');
  const perfProject=join(out,'performance-project');await new ProjectStore(project).copyTo(perfProject);const pd=await Director.open(perfProject),pp=await pd.export(),ps=structuredClone(pp.lesson.scenes.find(s=>s.id==='button-vs-blind'));
  const packs=await localePacks();let duration=compileProject(pp,packs,{output:{sceneId:ps.id,locale:'en-US',aspect:'landscape',profile:'final'}}).duration;
  const nonNarrated=ps.beats.filter(b=>!b.narration);for(const b of nonNarrated)b.hold=(b.hold??1.2)+(60-duration)/nonNarrated.length;
  pp.lesson.scenes=pp.lesson.scenes.map(s=>s.id===ps.id?ps:s);duration=compileProject(pp,packs,{output:{sceneId:ps.id,locale:'en-US',aspect:'landscape',profile:'final'}}).duration;
  ps.beats.at(-1).hold-=duration-60;
  await pd.apply({requestId:'benchmark-60',expectedRevision:pp.revision,commands:[{type:'scene.put',value:ps},{type:'output.set',value:{sceneId:ps.id,locale:'en-US',aspect:'landscape',profile:'final'}}]});
  assert.equal(compileProject(await pd.export(),packs).totalFrames,1800);await performanceCheck(perfProject,join(out,'performance'));
  // The portable project runs in the clean installation with normal Node and local dependencies.
  const smokeScene=structuredClone(ps);smokeScene.id='clean-smoke';smokeScene.beats=[{id:'still',label:{'en-US':'Ready'},hold:.35}];smokeScene.branches=[];const smokeFile=join(clean,'scene.json');await writeFile(smokeFile,JSON.stringify(smokeScene));
  await exec(node,['bin/river.mjs','init','--scene',smokeFile,'--project','smoke','--locale','en-US'],{cwd:clean,env});
  const cleanRender=JSON.parse((await exec(node,['bin/river.mjs','render','--project','smoke','--out','smoke-media'],{cwd:clean,env,timeout:120000,maxBuffer:4*1024*1024})).stdout);assert.equal(cleanRender.ok,true);await writeFile(join(out,'clean-render.json'),JSON.stringify(cleanRender,null,2));gate(['A16'],['clean-install.json','clean-render.json','performance/report.json']);
  // Re-render unchanged cold-task projects affected by the final landscape label fix.
  // Independent task authors review these new actual videos separately; this is not an A17 auto-pass.
  const coldRefresh=[];
  for(const [task,project,scene,locale,branch]of [
    ['01','artifacts/cold-v2/01/project','first-hand-six','zh-CN','main'],
    ['02','artifacts/cold-v2/02/project','heads-up-order','en-US','main'],
    ['04-single','artifacts/cold-v2/04/portable-project','single-short','en-US','main'],
    ['04-cumulative','artifacts/cold-v2/04/portable-project','cumulative-short','en-US','main'],
    ['05-main','artifacts/cold-v2/05/project','quiet-river','en-US','main'],
    ['05-branch','artifacts/cold-v2/05/project','quiet-river','ja-JP','check-back']
  ]){
    try{await readFile(join(project,'project.json'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
    console.log('RENDER cold refresh '+task);
    const {stdout}=await exec(process.execPath,['bin/river.mjs','render','--project',project,'--scene',scene,'--locale',locale,'--branch',branch,'--aspect','landscape','--profile','draft','--out',join(out,'cold-refresh',task)],{timeout:720000,maxBuffer:4*1024*1024});
    const receipt=JSON.parse(stdout);assert.equal(receipt.ok,true);coldRefresh.push({task,project:resolve(project),directory:receipt.directory,receipt,decoded:await verifyMedia(receipt.directory,project)});await writeFile(join(out,'cold-refresh.json'),JSON.stringify(coldRefresh,null,2));
  }
  assert.equal((await sourceHash()).hash,source.hash,'Runtime changed during acceptance');
  // Audio-language content review and independent cold tasks are external evidence, never inferred from metadata.
  report.gates.A11.status='NOT_RUN';report.gates.A15.status='NOT_RUN';report.gates.A11.pending='Actual speech content review';report.gates.A15.pending='Actual speech content and visual review';
  report.status='AUTOMATED_CHECKS_COMPLETE_REVIEW_PENDING';report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({out,status:report.status}));
}catch(error){report.status='FAIL';report.failure={message:error.message,stack:error.stack};await save();console.error(error);process.exitCode=1;}
