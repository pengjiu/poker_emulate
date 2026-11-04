import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Director} from '../src/director.mjs';
import {storyboard} from '../src/direction/storyboard.mjs';
import {newProject,createProject} from '../src/project/store.mjs';
import {confirmAnalysis} from '../src/analysis/index.mjs';
import {narrationCues,subtitleCues} from '../src/client/render.mjs';
import {fixture,temp,words} from './helpers.mjs';
import {hash} from '../src/util.mjs';

const locale='zh-CN';
function flow(){
  const project=fixture(),scene=project.lesson.scenes[0];project.lesson.scenes=[scene];scene.branches=[];project.output.captions=true;
  scene.beats=[{id:'flow',label:words('连续行动'),speaker:'解说',hold:.2,actionHold:.2,rehearsalDuration:{[locale]:1},narration:words('先看行动，再看下一张牌。'),
    actions:[{type:'check',seat:'bb'},{type:'check',seat:'btn'},{type:'deal',cards:['2h']},{type:'check',seat:'bb'}],
    presentation:{surface:'table',focus:['board']}}];
  return project;
}
async function open(t,project){const store=await createProject(join(await temp(t),'project'),project);return {store,director:await Director.open(store.directory)};}
async function running(t){
  const context=await open(t,flow());await context.director.apply({requestId:'schedule',expectedRevision:0,commands:[
    {type:'timing.set',beatId:'flow',value:{locale,timing:{actions:[0,.75,1.5,1.75],narration:.5}}},
    {type:'captions.set',beatId:'flow',value:{locale,cues:[{start:0,end:.5,text:'先看行动，'},{start:.5,end:1,text:'再看下一张牌。'}]}},
    {type:'presentation.cues',beatId:'flow',value:{locale,cues:[{at:.1,focus:['hero']},{at:.4,focus:['pot']}]}}
  ]});return context;
}
const exportBoard=director=>director.dispatch({method:'export',params:{kind:'storyboard'}});

test('public storyboard groups timed speech once and locates real actions around its continuous clock',async t=>{
  const {director,store}=await running(t),project=await store.read(),plan=await director.export({kind:'plan'}),board=await exportBoard(director),beat=board.beats[0],cue=narrationCues(plan)[0];
  assert.equal(board.format,'river.storyboard');assert.equal(board.revision,plan.revision);assert.equal(board.beats.length,1);
  assert.deepEqual(beat.narration,{start:cue.start,end:cue.start+cue.duration,text:cue.text,estimated:true});
  assert.equal(beat.label,plan.frames[0].label);assert.equal(beat.role,plan.frames.find(f=>f.narration).speaker);
  assert.equal(beat.start,plan.frames[0].start);assert.equal(beat.end,plan.frames.at(-1).end);
  assert.deepEqual(beat.actions.map(a=>a.narrationPhase),['before','during','after','after']);
  assert.deepEqual(beat.actions.map(a=>a.at),[0,.75,1.5,1.75]);
  const events=plan.frames.filter(f=>f.event);assert.deepEqual(beat.actions.map(a=>a.event),events.map(f=>f.event));
  assert.ok(plan.frames.length>events.length,'Presentation boundaries create extra frames, not extra actions.');
  assert.equal(beat.actions.length,project.lesson.scenes[0].beats[0].actions.length);
  assert.deepEqual(beat.captions,subtitleCues(plan));
  const spoken=plan.frames.find(f=>f.narration);assert.equal(beat.state.at,cue.start);assert.equal(beat.state.actor,spoken.state.actor);
  assert.deepEqual(beat.state.board,spoken.state.board);assert.deepEqual(beat.state.seats.find(s=>s.id===spoken.state.hero).hole,spoken.state.seats.find(s=>s.id===spoken.state.hero).hole);
  assert.ok(beat.state.seats.filter(s=>s.id!==beat.state.hero).every(s=>s.hole.every(card=>card===null)));
  assert.deepEqual(beat.visuals.map(v=>v.focus),[['board'],['hero'],['pot']]);
  assert.deepEqual(beat.visuals.map(v=>v.start),[0,Math.ceil(.6*plan.fps)/plan.fps,Math.ceil(.9*plan.fps)/plan.fps]);
  assert.ok(beat.visuals.every(v=>v.surface==='table'&&v.show.length===0));
  assert.deepEqual(await store.read(),project,'Read-only export must not commit a revision or mutate authoring data.');
});

test('repeated sequence entries retain their own identity, timing and player knowledge',async t=>{
  const {director}=await running(t),project=await director.export(),sceneId=project.lesson.scenes[0].id;
  await director.apply({requestId:'repeat',expectedRevision:1,commands:[{type:'output.set',value:{sequence:[{id:'first',sceneId},{id:'again',sceneId}]}}]});
  await director.observe({view:'director'});const plan=await director.export({kind:'plan'}),board=await exportBoard(director);
  assert.deepEqual(board.beats.map(b=>b.entryId),['first','again']);assert.equal(board.beats.length,2);
  const [first,again]=board.beats;assert.equal(again.sceneId,first.sceneId);assert.equal(again.beatId,first.beatId);
  assert.equal(again.start,first.end);assert.ok(Math.abs(again.narration.start-(again.start+first.narration.start))<1e-9);
  assert.deepEqual(again.actions.map(a=>a.narrationPhase),first.actions.map(a=>a.narrationPhase));
  for(const [index,action]of again.actions.entries())assert.ok(Math.abs(action.at-again.start-first.actions[index].at)<1e-9);
  for(const beat of board.beats){const expected=plan.frames.find(f=>f.entryId===beat.entryId&&f.narration).state;assert.equal(beat.state.pot,expected.pot);
    assert.ok(beat.state.seats.filter(s=>s.id!==beat.state.hero).every(s=>s.hole.every(card=>card===null)));}
  assert.deepEqual(board.issues,plan.issues);
});

function analytical(){
  const scene={id:'river',title:words('范围与价格'),start:{street:'river',board:['Qd','7c','2s','Tc','4d'],button:'hero',hero:'hero',actor:'villain',seats:[
    {id:'hero',name:'小舟',stack:20,contributed:5,hole:['Ah','Qh']},{id:'villain',name:'北岸',stack:20,contributed:5,hole:['8c','9c']} ]},
    beats:[{id:'bet',label:words('北岸下注'),actions:[{type:'bet',seat:'villain',to:10}],hold:.2},
      {id:'explain',label:words('核对范围'),speaker:'教练',hold:3,rehearsalDuration:{[locale]:2},narration:words('先核对范围，再比较价格。'),presentation:{surface:'analysis',analysisId:'weighted',show:[],focus:['hero'],question:words('这些条件下值得跟注吗？'),cues:{[locale]:{audioHash:null,cues:[{at:.5,show:['range']},{at:1,show:['calculation','metrics']},{at:1.5,show:['range','calculation','metrics']}]}}}}]};
  scene.analysis=[confirmAnalysis(scene,{id:'weighted',node:{beatId:'bet'},title:words('真实计算'),calculation:'potOdds',range:{seat:'villain',entries:[{hand:'KK',weight:.5},{hand:'JTs',weight:1}]},metrics:['equity','callEV'],takeaway:words('作者尚待审读的结论。')})];
  return newProject({scenes:[scene]},{captions:true});
}

test('storyboard preserves computed analysis, visible reveal times and weighted combination totals without a full matrix',async t=>{
  const {director}=await open(t,analytical()),plan=await director.export({kind:'plan'}),board=await exportBoard(director),beat=board.beats.find(b=>b.beatId==='explain'),frame=plan.frames.find(f=>f.beatId==='explain'),analysis=frame.presentation.analysis,summary=beat.analyses[0];
  assert.deepEqual(summary.calculation,analysis.calculation);assert.deepEqual(summary.metrics,analysis.metrics);
  assert.equal(summary.calculation.threshold,1/3);assert.equal(summary.metrics.find(m=>m.kind==='equity').value,.5);assert.equal(summary.metrics.find(m=>m.kind==='callEV').value,5);
  for(const field of ['combinationCount','weightedCount','blockedCount'])assert.equal(summary.range[field],analysis.range[field]);
  assert.equal(summary.range.combinationCount,9);assert.equal(summary.range.weightedCount,6);assert.equal(summary.range.blockedCount,1);
  assert.deepEqual(summary.range.hands.map(h=>[h.hand,h.combinationCount,h.weightedCount]),[['KK',6,3],['JTs',3,3]]);
  assert.equal(summary.takeaway,undefined);assert.equal(summary.range.matrix,undefined);assert.equal(summary.range.combos,undefined);
  assert.deepEqual(beat.visuals.map(v=>v.show),plan.frames.filter(f=>f.beatId==='explain').map(f=>f.presentation.show));
  assert.ok(beat.visuals.every(v=>v.analysisId===analysis.id&&v.question===frame.presentation.question));
  assert.equal(beat.state.toCall,frame.state.legalActions.find(a=>a.type==='call').amount);assert.equal(beat.state.toCall,10);
  assert.equal(board.beats[0].narration,null);assert.equal(board.beats[0].role,null);assert.equal(board.beats[0].actions[0].narrationPhase,null);
  assert.ok(Buffer.byteLength(JSON.stringify(board))<Buffer.byteLength(JSON.stringify(plan))/2,'Compact output must omit duplicated frame states, dictionaries and the full range matrix.');
});

test('projection follows the latest revision, reports usable audio clocks and cannot mutate its source',async t=>{
  const {director,store}=await running(t),before=await director.export(),plan=await director.export({kind:'plan'}),original=structuredClone(plan);
  const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
  freeze(plan);const projected=storyboard(plan);assert.deepEqual(plan,original);projected.beats[0].state.board.push('As');projected.beats[0].actions[0].event.type='fold';assert.deepEqual(plan,original);
  const text='新的解释保留当前信息。';await director.apply({requestId:'new-script',expectedRevision:1,commands:[{type:'narration.set',beatId:'flow',text}]});
  const latest=await exportBoard(director);assert.equal(latest.revision,2);assert.equal(latest.beats[0].narration.text,text);assert.equal(before.revision,1);
  assert.deepEqual(latest.issues,(await director.export({kind:'plan'})).issues);
  const project=flow(),beat=project.lesson.scenes[0].beats[0],assetId='a'.repeat(64);beat.audio={[locale]:{assetId,locale,textHash:hash(beat.narration[locale])}};project.assets[assetId]={path:`assets/${assetId}.wav`,sha256:assetId,duration:1.25,bytes:100,mime:'audio/wav'};
  await store.update(async()=>({project}));const actual=await exportBoard(director),actualPlan=await director.export({kind:'plan'}),cue=narrationCues(actualPlan)[0];
  assert.equal(actual.beats[0].narration.estimated,false);assert.equal(actual.beats[0].narration.end,actual.beats[0].narration.start+cue.duration);
  await assert.rejects(()=>director.export({kind:'storyboard',destination:'/unused.json'}),{code:'EXPORT_KIND'});
});
