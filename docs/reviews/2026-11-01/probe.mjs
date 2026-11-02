// Read-only application review. All mutated fixtures live in an OS temporary directory.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Director,compile,loadState,transition} from '../../../prototype/engine.mjs';
import {renderVideo} from '../../../prototype/render.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const dest=resolve(process.argv[2]??fileURLToPath(new URL('./findings.json',import.meta.url)));
const temp=await mkdtemp(join(tmpdir(),'river-review-'));
const names=['engine.mjs','cli.mjs','render.mjs','runtime.mjs','build.mjs','view.js','i18n.mjs','style.css','examples.mjs','lesson.json','validate.mjs','stress.mjs'];
const hashes={};
const results=[];
const languages=['zh-CN','en-US','ja-JP'];
const localized=text=>Object.fromEntries(languages.map(l=>[l,text]));
const clone=x=>structuredClone(x);
function run(file,args=[],input){
  const r=spawnSync(process.execPath,[join(temp,'prototype',file),...args],{cwd:temp,input,encoding:'utf8',timeout:30000});
  if(r.error)throw r.error;
  return {exitCode:r.status,stdout:r.stdout.trim(),stderr:r.stderr.trim()};
}
async function probe(id,title,fn){
  try{results.push({id,title,status:'REPRODUCED',detail:await fn()});}
  catch(error){results.push({id,title,status:'NOT_REPRODUCED',error:error.stack});}
}
let baseline;
try{
  await mkdir(join(temp,'prototype','output'),{recursive:true});
  for(const name of names){
    const source=join(root,'prototype',name);
    hashes['prototype/'+name]=createHash('sha256').update(await readFile(source)).digest('hex');
    await copyFile(source,join(temp,'prototype',name));
  }
  const lesson=JSON.parse(await readFile(join(root,'prototype','lesson.json'),'utf8'));
  const rules=run('validate.mjs'),stress=run('stress.mjs');
  assert.equal(rules.exitCode,0);assert.equal(stress.exitCode,0);
  const ruleReport=JSON.parse(await readFile(join(temp,'prototype/output/validation.json'),'utf8'));
  const stressReport=JSON.parse(await readFile(join(temp,'prototype/output/stress-validation.json'),'utf8'));
  baseline={rules:{passed:ruleReport.passed,failed:ruleReport.failed},simulation:stressReport};

  await probe('R01','Saving and reopening loses selected output',async()=>{
    const req={method:'apply',params:{requestId:'review-output',expectedRevision:1,commands:[{type:'output.set',value:{locale:'ja-JP',aspect:'portrait',sceneId:'side-pots',branchId:null}}]}};
    const saved=join(temp,'saved.json');
    const session=run('cli.mjs',['session','--save',saved],JSON.stringify(req)+'\n');
    assert.equal(JSON.parse(session.stdout).ok,true);
    const reopened=run('cli.mjs',['inspect','--lesson',saved]);
    assert.equal(reopened.exitCode,0);
    const output=JSON.parse(reopened.stdout).output;
    assert.equal(output.locale,'zh-CN');assert.equal(output.aspect,'landscape');assert.equal(output.sceneId,lesson.scenes[0].id);
    return {selected:req.params.commands[0].value,reopened:output,outputPersisted:!!JSON.parse(await readFile(saved,'utf8')).output};
  });
  await probe('R02','Browser-style embedded audio is rejected by the renderer',async()=>{
    const copy=clone(lesson),beat=copy.scenes[0].beats.find(b=>b.narration);
    beat.audio['zh-CN'].src='data:audio/wav;base64,UklGRg==';
    let error;try{await renderVideo(copy,{locale:'zh-CN',out:join(temp,'probe.mp4')});}catch(e){error=e.message;}
    assert.match(error,/materialize external audio/);
    return {acceptedByCompile:!!compile(copy).frames.find(f=>f.id===beat.id).audio,renderError:error,scope:'The browser audio picker produces this source kind; the renderer rejects it before media decoding.'};
  });
  await probe('R03','Selected-branch missing audio is absent from CLI validation report',async()=>{
    const copy=clone(lesson),scene=copy.scenes[0];
    scene.branches.push({id:'review-branch',from:scene.beats[0].id,label:localized('Review'),beats:[{id:'review-narration',label:localized('Narration'),narration:localized('A new explanation'),hold:1}]});
    const file=join(temp,'branch.json');await writeFile(file,JSON.stringify(copy));
    const check=run('cli.mjs',['validate','--lesson',file,'--branch','review-branch']);
    const report=JSON.parse(check.stdout);assert.equal(check.exitCode,0);assert.equal(report.valid,true);
    assert.ok(report.scenes.every(s=>s.missingAudio.length===0));
    let code;try{compile(copy,{branchId:'review-branch',requireAudio:true});}catch(e){code=e.code;}
    assert.equal(code,'AUDIO_MISSING');
    return {validateExit:check.exitCode,reportedValid:report.valid,reportedMissingAudio:report.scenes.flatMap(s=>s.missingAudio),renderCompileError:code};
  });
  await probe('R04','Duplicate beat IDs across branches edit the wrong branch',async()=>{
    const copy=clone(lesson),scene=copy.scenes[0];
    scene.branches=['a','b'].map(id=>({id,from:scene.beats[0].id,label:localized(id),beats:[{id:'shared-note',label:localized('Note'),narration:localized(id),hold:1}]}));
    const d=new Director(copy,{branchId:'b'});
    d.apply({requestId:'review-edit',expectedRevision:1,commands:[{type:'narration.set',beatId:'shared-note',text:'changed'}]});
    const after=d.lesson.scenes[0].branches.map(b=>({branch:b.id,narration:b.beats[0].narration['zh-CN']}));
    assert.deepEqual(after,[{branch:'a',narration:'changed'},{branch:'b',narration:'b'}]);
    return {selectedBranch:'b',acceptedDuplicateIds:true,after};
  });
  await probe('R05','Unused main-line tail blocks an otherwise valid selected branch',async()=>{
    const copy=clone(lesson);const prior=compile(copy,{branchId:'check-line'});
    copy.scenes[0].beats[3].actions=[{seat:'nonexistent',type:'check'}];
    let code;try{compile(copy,{branchId:'check-line'});}catch(e){code=e.code;}
    assert.equal(code,'OUT_OF_TURN');
    return {branch:'check-line',previousBranchFrames:prior.frames.map(f=>f.id),corruptedUnusedBeat:copy.scenes[0].beats[3].id,error:code};
  });
  await probe('R06','Closed snapshot can skip an unpaid live-player response',async()=>{
    const input={street:'flop',board:['2c','3d','4h'],button:'a',hero:'a',actor:null,roundClosed:true,seats:[{id:'a',stack:90,contributed:10,streetBet:10,hole:['As','Ad']},{id:'b',stack:100,contributed:0,streetBet:0,hole:['Ks','Kd']}]};
    const s=loadState(input),next=transition(s,{type:'deal',cards:['5s']});
    assert.equal(next.street,'turn');assert.equal(next.seats[1].contributed,0);
    return {input,accepted:true,dealtNextStreet:next.street,refunds:next.refunds,unansweredBetBB:10};
  });
  await probe('R07','One multi-action beat collapses both visible actions into its final state',async()=>{
    const copy=clone(lesson),scene=copy.scenes[0];scene.branches=[];
    scene.beats=[{id:'two-checks',label:localized('Checks'),actions:[{seat:'bb',type:'check'},{seat:'btn',type:'check'}],hold:2}];
    copy.scenes=[scene];const p=compile(copy);
    assert.equal(p.frames.length,1);assert.equal(p.frames[0].event.seat,'btn');
    return {scriptedActions:2,renderedStates:p.frames.length,onlyVisualEvent:p.frames[0].event,roundClosed:p.frames[0].state.roundClosed};
  });
  await probe('R08','Unknown CLI option silently falls back to Chinese',async()=>{
    const r=run('cli.mjs',['inspect','--loclae','en-US']);assert.equal(r.exitCode,0);
    const output=JSON.parse(r.stdout).output;assert.equal(output.locale,'zh-CN');
    return {command:'inspect --loclae en-US',exitCode:r.exitCode,output};
  });
  await probe('R09','Build overwrites a corrupt lesson with the example',async()=>{
    const file=join(temp,'prototype/lesson.json'),before='{"version": 1, "scenes": [';
    await writeFile(file,before);const r=run('build.mjs');
    assert.equal(r.exitCode,0);const after=await readFile(file,'utf8');assert.notEqual(after,before);
    const replacement=JSON.parse(after);assert.equal(replacement.scenes.length,4);
    return {exitCode:r.exitCode,originalPreserved:false,replacementScenes:replacement.scenes.map(s=>s.id),scope:'Executed only in the isolated temporary copy.'};
  });
  await probe('R10','Duplicate scene IDs are accepted on load',async()=>{
    const copy=clone(lesson);copy.scenes=[copy.scenes[0],clone(copy.scenes[0])];
    const d=new Director(copy);assert.equal(d.lesson.scenes[0].id,d.lesson.scenes[1].id);
    return {accepted:true,sceneIds:d.lesson.scenes.map(s=>s.id)};
  });
  for(const [path,before]of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(join(root,path))).digest('hex'),before,`Source changed: ${path}`);
  const report={reviewDate:'2026-11-01',scope:'Current source snapshot, not a git diff; targeted local reproductions, no application fixes.',sourceSha256:hashes,baseline,probes:results,sourceUnchanged:true};
  await mkdir(resolve(dest,'..'),{recursive:true});await writeFile(dest,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({report:dest,baseline:baseline.rules,simulations:baseline.simulation.completeHands,reproduced:results.filter(r=>r.status==='REPRODUCED').length,total:results.length,sourceUnchanged:true},null,2));
  if(results.some(r=>r.status!=='REPRODUCED'))process.exitCode=1;
}finally{await rm(temp,{recursive:true,force:true});}
