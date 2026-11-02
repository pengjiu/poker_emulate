import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildFullCourse} from '../scripts/build-full-course.mjs';
import {Director} from '../src/director.mjs';
import {compileAnalysis,resolveDecision} from '../src/analysis/index.mjs';
import {bankroll,observe} from '../src/poker/rules.mjs';
import {sessionIssues,resolveSessionObservations} from '../src/project/session.mjs';
import {answerPractice} from '../src/project/practice.mjs';

test('The complete authoring builder prepares every delivery with only voice pending and verified numerical/continuity evidence',async t=>{
  const base=await mkdtemp(join(tmpdir(),'river-full-course-'));t.after(()=>rm(base,{recursive:true,force:true}));const directory=join(base,'project'),report=await buildFullCourse(directory);
  assert.equal(report.voiceRequested,false);assert.equal(report.deliveries.length,24);assert.ok(report.deliveries.every(d=>d.nonAudioIssues===0&&d.pendingVoice>0));
  assert.deepEqual(report.allRouteChecks,{count:33,nonAudioIssues:0});
  for(const id of ['episode-1-landscape','episode-2-landscape','episode-3-landscape']){const d=report.deliveries.find(d=>d.id===id);assert.ok(d.draftSeconds>=180&&d.draftSeconds<=360);}
  assert.equal(report.deliveries.find(d=>d.id==='episode-3-landscape').scenes.length,2);
  assert.deepEqual(report.deliveries.filter(d=>d.id.startsWith('probe-')).map(d=>d.locale),['en-US','en-US','ja-JP','ja-JP']);
  const director=await Director.open(directory),project=await director.export(),scene=project.lesson.scenes.find(s=>s.id==='full-price');
  for(const locale of ['zh-CN','en-US','ja-JP']){
    const episodes=report.deliveries.filter(d=>d.id.startsWith('episode-')&&d.locale===locale);
    assert.equal(episodes.length,6);assert.equal(new Set(episodes.flatMap(d=>d.scenes)).size,4);
    const html=await readFile(join(directory,report.practice[locale]),'utf8');assert.ok(html.includes(`lang="${locale}"`));assert.ok(html.includes('id="feedback" hidden'));
  }
  const visit=value=>{if(!value||typeof value!=='object')return;if(typeof value['zh-CN']==='string'){for(const locale of ['en-US','ja-JP'])assert.ok(value[locale]?.trim(),`Missing ${locale}: ${value['zh-CN']}`);assert.doesNotMatch(value['en-US'],/[\u3400-\u9fff]/);assert.ok(!value['zh-CN'].includes('全下'));}else Object.values(value).forEach(visit);};visit(project.lesson);
  for(const s of project.lesson.scenes)for(const b of s.beats)if(b.narration){assert.equal(b.hold,1.2);for(const locale of ['zh-CN','en-US','ja-JP'])assert.ok(b.rehearsalDuration[locale]>0);}
  assert.notEqual(report.deliveries.find(d=>d.id==='episode-1-en-US-landscape').draftSeconds,report.deliveries.find(d=>d.id==='episode-1-ja-JP-landscape').draftSeconds);
  const rich=compileAnalysis(scene,scene.analysis.find(a=>a.id==='weighted'),'zh-CN'),lean=compileAnalysis(scene,scene.analysis.find(a=>a.id==='low-bluff'),'zh-CN');
  assert.ok(Math.abs(rich.metrics.find(m=>m.kind==='equity').value-1/3)<1e-12);assert.ok(rich.metrics.find(m=>m.kind==='callEV').value>0);assert.equal(rich.range.matrix.length,169);
  assert.equal(lean.metrics.find(m=>m.kind==='equity').value,.25);assert.ok(lean.metrics.find(m=>m.kind==='callEV').value<0);assert.equal(rich.calculation.threshold,6/21.1);
  const model=project.lesson.scenes.find(s=>s.id==='full-equilibrium'),strategy=compileAnalysis(model,model.analysis.find(a=>a.id==='strategy-import'),'zh-CN');assert.equal(strategy.solver.model.accuracy.value,0);assert.equal(strategy.range.combos[0].actions.call,.5);
  assert.deepEqual(sessionIssues(project),[]);const notes=resolveSessionObservations(project);assert.equal(notes.length,1);assert.equal(notes[0].current,true);assert.deepEqual(notes[0].publicState.seats.find(s=>s.id==='bb').hole,['Ks','Jh']);
  for(const s of project.lesson.scenes.filter(s=>['full-price','full-session-2','full-session-3'].includes(s.id))){const state=resolveDecision(s,{beatId:s.beats.at(-1).id});assert.equal(bankroll(state),60000);assert.equal(state.settled,true);}
  const second=project.lesson.scenes.find(s=>s.id==='full-session-2'),end=observe(resolveDecision(second,{beatId:'no-reveal'}));assert.deepEqual(end.seats.find(s=>s.id==='bb').hole,[null,null]);
  const tournament=project.lesson.scenes.find(s=>s.id==='tournament-boundary'),icm=compileAnalysis(tournament,tournament.analysis[0],'zh-CN');assert.equal(icm.tournament.totalChips,100);assert.equal(icm.tournament.expected.chipDelta,0);assert.ok(icm.tournament.expected.icmDelta<0);
  const raked=project.lesson.scenes.find(s=>s.id==='rake-boundary'),price=compileAnalysis(raked,raked.analysis[0],'zh-CN');assert.equal(price.calculation.total,29);assert.equal(price.calculation.rake,1);assert.equal(price.calculation.threshold,10/29);
  assert.equal(answerPractice(project,{questionId:'price-versus-range',choiceIds:['call']}).correct,true);assert.equal(answerPractice(project,{questionId:'new-range',choiceIds:['fold']}).correct,true);assert.equal(answerPractice(project,{questionId:'history',choiceIds:['observed','sample']}).correct,true);
  const proof=JSON.parse(await readFile(join(directory,'evidence/river-equilibrium.json'),'utf8'));assert.equal(proof.verified,true);assert.equal(proof.cards.valueWins,true);assert.equal(proof.cards.bluffLoses,true);
  assert.ok((await readFile(join(directory,'evidence/practice.html'),'utf8')).includes('id="feedback" hidden'));
});
