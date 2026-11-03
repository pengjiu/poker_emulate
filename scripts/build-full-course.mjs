#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newProject,createProject} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {compileProject,validateProject} from '../src/compiler.mjs';
import {localePacks} from '../src/locales.mjs';
import {verifyRiverEquilibrium,verifyRiverTypes,resolveDecision,decisionFingerprint} from '../src/analysis/index.mjs';
import {observe} from '../src/poker/rules.mjs';
import {sessionIssues} from '../src/project/session.mjs';
import {practiceIssues} from '../src/project/practice.mjs';
import {fullCourseInputs} from '../examples/teaching/full-course.mjs';

/** Reproducible authoring; intentionally never generates speech. */
export async function buildFullCourse(directory){
  directory=resolve(directory);const input=fullCourseInputs(),project=newProject(input.lesson,{locale:'zh-CN',aspect:'landscape',profile:'final',captions:true});
  await createProject(directory,project);const director=await Director.open(directory);let serial=0;
  const apply=async commands=>{const {revision}=await director.observe({view:'director'});return director.apply({requestId:`full-course-${++serial}`,expectedRevision:revision,commands});};
  await apply([{type:'sound.set',value:input.sound},{type:'delivery.set',value:input.deliverables},{type:'direction.set',value:{patternId:'think-aloud'}},{type:'direction.set',sceneId:'full-equilibrium',value:{patternId:'range-lab'}},{type:'voice.set',value:{locale:'zh-CN',speed:1,emotionStrength:.4,pronunciations:{'A Q':'A，Q','K J':'K，J','ICM':'I，C，M'}}},...['en-US','ja-JP'].map(locale=>({type:'voice.set',value:{locale,speed:1,emotionStrength:.4}}))]);
  const model=input.lesson.scenes.find(s=>s.id==='full-equilibrium'),beforeNode={beatId:'model'},afterNode={beatId:'model-bet'},before=observe(resolveDecision(model,beforeNode)),after=observe(resolveDecision(model,afterNode));
  const pot=before.pot/100,bet=after.legalActions.find(a=>a.type==='call')?.amount;
  if(pot!==10||bet!==10)throw new Error('The teaching model changed; revise its proof and script.');
  const proof={...verifyRiverEquilibrium({pot,bet,valueProbability:.5},{valueBet:1,bluffBet:.5,call:.5}),cards:verifyRiverTypes(before.board,before.seats.find(s=>s.id===before.hero).hole,['As','Ad'],['Jh','Th']),nodes:{before:{sceneId:model.id,...beforeNode,decisionHash:decisionFingerprint(model,beforeNode)},after:{sceneId:model.id,...afterNode,decisionHash:decisionFingerprint(model,afterNode)}},authorship:'An explicit bounded river game with independent exhaustive best-response calculation; not a general NLHE or commercial solver.',limitations:['Value/air prior is an authored 50/50 assumption.','Only check-to-terminal or one fixed all-in size.','Defender chooses call/fold only.','No rake. No inference of real opponent frequencies.']};
  if(!proof.verified||!proof.cards.valueWins||!proof.cards.bluffLoses)throw new Error('The bounded model did not verify.');
  await writeFile(join(directory,'evidence','river-equilibrium.json'),JSON.stringify(proof,null,2)+'\n');
  const request=await director.export({kind:'solver',sceneId:model.id,analysisId:'strategy-import'});
  const payload={...request,model:{game:'NLHE',units:'BB',rake:null,algorithm:'Exhaustive best responses in the authored two-type river game',accuracy:{metric:'additional best-response value in this bounded game',value:0,unit:'BB'},notes:'A normalized attachment generated from evidence/river-equilibrium.json; not a third-party solve or an unrestricted action-tree equilibrium.',actions:[{id:'fold',type:'fold'},{id:'call',type:'call'}]},strategy:{seat:'hero',entries:[{hand:'QcQd',weight:1,actions:{fold:.5,call:.5}}]}};
  await apply([{type:'analysis.importSolver',sceneId:model.id,analysisId:'strategy-import',source:{data:payload}}]);
  const current=await director.export();
  await apply(current.lesson.scenes.flatMap(scene=>[...(scene.analysis??[]).map(item=>({type:'analysis.confirm',sceneId:scene.id,analysisId:item.id})),...(scene.variant?[{type:'scene.review',sceneId:scene.id}]:[])]));
  await apply([{type:'practice.set',value:(await director.export()).lesson.practice}]);
  const practiceFiles={};
  for(const locale of ['zh-CN','en-US','ja-JP']){const file=locale==='zh-CN'?'practice.html':`practice-${locale}.html`;await director.export({kind:'practice',locale,destination:join(directory,'evidence',file)});practiceFiles[locale]=`evidence/${file}`;}
  const final=await director.export(),packs=await localePacks(),deliveries=[];
  const structural=[...sessionIssues(final),...practiceIssues(final)];if(structural.length)throw new Error(JSON.stringify(structural));
  const audit=await validateProject(final,packs,{directory,media:true,all:true}),routeBlockers=audit.results.flatMap(result=>result.issues.filter(issue=>issue.code!=='AUDIO_MISSING').map(issue=>({...issue,output:result.output})));
  if(routeBlockers.length)throw new Error(`Some scene, route or language is invalid: ${JSON.stringify(routeBlockers)}`);
  for(const definition of final.deliverables){
    const plan=compileProject(final,packs,{output:definition.output}),validation=await validateProject(final,packs,{directory,output:definition.output,media:true}),issues=validation.results.flatMap(result=>result.issues);
    const blockers=issues.filter(issue=>issue.code!=='AUDIO_MISSING');
    if(blockers.length)throw new Error(`Delivery ${definition.id} is invalid: ${JSON.stringify(blockers)}`);
    deliveries.push({id:definition.id,locale:plan.locale,aspect:plan.aspect,draftSeconds:plan.duration,totalFrames:plan.totalFrames,scenes:[...new Set(plan.frames.map(f=>f.sceneId))],pendingVoice:issues.filter(issue=>issue.code==='AUDIO_MISSING').length,nonAudioIssues:0});
  }
  const report={project:directory,projectId:final.projectId,revision:final.revision,voiceRequested:false,policy:'Only voice generation is deferred. Rehearsals carry visible voice-pending labels; source takes from different text are never attached.',readingEstimate:'Per-language rehearsalDuration uses 5.6 written Chinese characters/s, 2.7 English words/s, or 5 Japanese characters/s. Each full script is independently authored. These are reading estimates, not final voiced durations; actual speech overrides them automatically, while authored question pauses remain.',course:final.lesson.course,deliveries,allRouteChecks:{count:audit.results.length,nonAudioIssues:0},session:{hands:final.lesson.session.hands,issues:structural},proof:'evidence/river-equilibrium.json',practice:practiceFiles};
  await writeFile(join(directory,'evidence','full-course-build.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  if(args.includes('--help')){
    console.log('Usage: node scripts/build-full-course.mjs --project <new-directory> [--rehearsal --out <delivery-directory>] [--only <delivery-id,...>]');
    console.log('Creates the complete three-language course, continuous hands, variants, analysis evidence, localized exercises and 24 deliveries. Never generates TTS. --rehearsal calls the normal produce pipeline with only AUDIO_MISSING permitted.');
  }else{
    for(let i=0;i<args.length;i++){const key=args[i].slice(2);if(!args[i].startsWith('--')||!['project','rehearsal','out','only'].includes(key))throw new Error(`Unknown option: ${args[i]}`);if(key==='rehearsal')options.rehearsal=true;else{if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing --${key} value.`);options[key]=args[++i];}}
    if(!options.project)throw new Error('Choose a new --project directory.');
    const report=await buildFullCourse(options.project);console.log(JSON.stringify(report));
    if(options.rehearsal){if(!options.out)throw new Error('--rehearsal needs an --out delivery directory.');const {produce}=await import('../src/media/produce.mjs');const receipt=await produce(options.project,{out:options.out,rehearsal:true,only:options.only?.split(','),onProgress:progress=>process.stderr.write(JSON.stringify(progress)+'\n')});console.log(JSON.stringify({directory:receipt.directory,outputs:receipt.outputs}));}
  }
}
