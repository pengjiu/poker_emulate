#!/usr/bin/env node
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {newProject,createProject} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {compileProject,validateProject} from '../src/compiler.mjs';
import {localePacks} from '../src/locales.mjs';
import {verifyRiverEquilibrium,verifyRiverTypes,resolveDecision,decisionFingerprint} from '../src/analysis/index.mjs';
import {observe} from '../src/poker/rules.mjs';
import {scenes,course,verticalSlice,localizedProbe} from '../examples/teaching/course.mjs';

const args=process.argv.slice(2),options={kind:'course',locale:'zh-CN',aspect:'landscape'};
if(args.includes('--help')){
  console.log('Usage: node scripts/build-teaching-demo.mjs --project <new-directory> [--kind course|slice|probe] [--locale zh-CN|en-US|ja-JP] [--aspect landscape|portrait] [--voice] [--render] [--out <render-directory>]');
  console.log('Creates reproducible draft inputs. --voice uses installed official IndexTTS; --render requires readiness. Existing directories are preserved.');
  process.exit(0);
}
for(let i=0;i<args.length;i++){
  const key=args[i].slice(2);
  if(!args[i].startsWith('--')||!['project','kind','locale','aspect','voice','render','out'].includes(key))throw new Error(`Unknown option: ${args[i]}`);
  if(['voice','render'].includes(key))options[key]=true;
  else if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for --${key}`);
  else options[key]=args[++i];
}
if(!options.project)throw new Error('Provide a new --project directory.');
if(!['course','slice','probe'].includes(options.kind))throw new Error('Use --kind course, slice or probe.');
if(!['zh-CN','en-US','ja-JP'].includes(options.locale))throw new Error('Unsupported locale.');
if(options.kind!=='probe'&&options.locale!=='zh-CN')throw new Error('Full pilot scripts are Chinese; use --kind probe for English/Japanese acceptance.');
const chosen=options.kind==='slice'?[verticalSlice()]:options.kind==='probe'?[localizedProbe()]:scenes();
const project=newProject({scenes:chosen,...(options.kind==='course'?{course}:{} )},{locale:options.locale,aspect:options.aspect,profile:'final',captions:true});
const directory=resolve(options.project);await createProject(directory,project);
const director=await Director.open(directory);
let serial=0;
async function apply(commands){const {revision}=await director.observe({view:'director'});return director.apply({requestId:`teaching-build-${++serial}`,expectedRevision:revision,commands});}
await apply([{type:'direction.set',value:{patternId:'think-aloud'}},...(options.kind==='course'?[{type:'direction.set',sceneId:'bounded-equilibrium',value:{patternId:'range-lab'}},{type:'direction.set',sceneId:'conditions-transfer',value:{patternId:'decision-quiz'}}]:[])]);
if(options.kind==='course')await apply([{type:'output.set',value:{sequence:course.episodes.map(episode=>({id:episode.id,sceneId:episode.sceneId,branchId:null}))}}]);
const modelScene=chosen.find(scene=>scene.id==='bounded-equilibrium');
if(modelScene){
const beforeNode={beatId:'model'},afterNode={beatId:'model-bet'};
const before=observe(resolveDecision(modelScene,beforeNode)),after=observe(resolveDecision(modelScene,afterNode));
const pot=before.pot/100,bet=after.legalActions.find(action=>action.type==='call')?.amount;
if(pot!==10||bet!==10)throw new Error('The authored model changed; revise its narration and independent equilibrium evidence.');
const holding=before.seats.find(seat=>seat.id===before.hero).hole;
const groups=modelScene.analysis.find(item=>item.id==='polar-model').range.groups;
const split=hand=>[hand.slice(0,2),hand.slice(2)];
const equilibrium={...verifyRiverEquilibrium({pot,bet,valueProbability:.5},{valueBet:1,bluffBet:.5,call:.5}),cards:verifyRiverTypes(before.board,holding,split(groups.find(group=>group.id==='value').hands[0]),split(groups.find(group=>group.id==='bluff').hands[0])),nodes:{before:{sceneId:modelScene.id,...beforeNode,fingerprint:decisionFingerprint(modelScene,beforeNode)},after:{sceneId:modelScene.id,...afterNode,fingerprint:decisionFingerprint(modelScene,afterNode)}},authorship:'Original restricted-game derivation; no commercial solver output',limitations:['The type prior is an explicit model assumption.','Bettor may check to immediate showdown or bet exactly 10 BB.','Defender may only call or fold.','This does not solve unrestricted no-limit Hold’em.']};
if(!equilibrium.verified||!equilibrium.cards.valueWins||!equilibrium.cards.bluffLoses)throw new Error('The restricted-game evidence did not verify.');
await mkdir(join(directory,'evidence'),{recursive:true});
await writeFile(join(directory,'evidence','river-equilibrium.json'),JSON.stringify(equilibrium,null,2)+'\n');
}
await writeFile(join(directory,'evidence','production-brief.json'),JSON.stringify({kind:options.kind,locale:options.locale,audience:'熟悉基本规则的中文德州学习者',duration:'Draft holds target 3–6 minutes per full episode; final duration comes from actual audio.',knowledgeBoundary:'Player view; opponent cards and future boards cannot inform the pending decision.',goals:course,review:{engineering:'pending',editorial:'authored; independent review pending',naturalSpeech:'pending',learningOutcome:'not measured'}},null,2)+'\n');
await apply(chosen.flatMap(scene=>(scene.analysis??[]).map(item=>({type:'analysis.confirm',sceneId:scene.id,analysisId:item.id}))));
if(options.voice){
  await apply([{type:'voice.set',value:{locale:options.locale,speed:1,emotionStrength:.4,...(options.locale==='zh-CN'?{pronunciations:{'A Q':'A，Q','K J':'K，J'}}:{})}}]);
  const {revision}=await director.observe({view:'director'});
  await director.voice({action:'generate',requestId:'teaching-build-voice',expectedRevision:revision,locale:options.locale,timeoutSeconds:7200});
  // Draft reading estimates must not turn into long silent tails after real speech.
  const voiced=await director.export();
  const updates=voiced.lesson.scenes.filter(scene=>chosen.some(input=>input.id===scene.id)).map(scene=>{
    for(const beat of [...scene.beats,...(scene.branches??[]).flatMap(branch=>branch.beats)])if(beat.audio?.[options.locale])beat.hold=1.2;
    return {type:'scene.put',value:scene};
  });
  await apply(updates);
}
const current=await director.export(),packs=await localePacks(),plan=compileProject(current,packs);
await writeFile(join(directory,'evidence','draft-plan.json'),JSON.stringify(plan,null,2)+'\n');
const validation=await validateProject(current,packs,{directory,media:true});
await writeFile(join(directory,'evidence','build-validation.json'),JSON.stringify(validation,null,2)+'\n');
console.log(JSON.stringify({project:directory,kind:options.kind,duration:plan.duration,ready:validation.ready,issues:validation.results.flatMap(result=>result.issues),voiceRequested:!!options.voice}));
if(options.render){
  if(!validation.ready)throw new Error('Rendering is blocked by readiness issues; draft silence is not a narrated course.');
  const {renderVideo}=await import('../src/media/render.mjs');
  console.log(JSON.stringify(await renderVideo(directory,{out:options.out??join('artifacts','teaching',options.kind),onProgress:p=>process.stderr.write(JSON.stringify(p)+'\n')})));
}
