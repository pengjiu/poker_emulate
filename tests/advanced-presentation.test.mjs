import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {compileProject} from '../src/compiler.mjs';
import {confirmAnalysis} from '../src/analysis/index.mjs';
import {presentationSchema,validateArtwork} from '../src/presentation.mjs';
import {newProject} from '../src/project/store.mjs';
import {renderFrame,frameAt} from '../src/client/render.mjs';
import {build} from '../scripts/build.mjs';
import {packs,words} from './helpers.mjs';

function scene(){
  const s={id:'river',title:words('Decision laboratory'),start:{street:'river',board:['Qd','7c','2s','Tc','4d'],button:'hero',hero:'hero',actor:'villain',seats:[{id:'villain',name:'North',stack:95.45,contributed:4.55,hole:['Kc','Jh']},{id:'hero',name:'River',stack:95.45,contributed:4.55,hole:['Ah','Qh']}]},beats:[
    {id:'bet',label:words('Bet'),actions:[{type:'bet',seat:'villain',to:6}],hold:.7,presentation:{surface:'table',motion:true}},
    {id:'think',label:words('Think'),hold:4,presentation:{surface:'analysis',analysisId:'price',show:['calculation','range','conditions'],annotations:[{id:'price-ring',type:'circle',target:'pot'},{id:'connection',type:'arrow',from:'card:Ah',to:'calculation'},{id:'reason',type:'label',target:'hero',text:words('Price requires a range.')}]}},
    {id:'return',label:words('Return'),hold:1,presentation:{surface:'table',camera:null,annotations:[]}},
    {id:'call',label:words('Call'),actions:[{type:'call',seat:'hero'}],hold:1,presentation:{surface:'table',motion:true}},
    {id:'showdown',label:words('Showdown'),actions:[{type:'showdown'}],hold:2,presentation:{surface:'table',motion:true}}
  ],branches:[{id:'fold-route',from:'bet',label:words('Fold'),beats:[{id:'fold',label:words('Fold'),actions:[{type:'fold',seat:'hero'}],hold:1}]}]};
  s.analysis=[{id:'price',node:{beatId:'bet'},title:words('Price and range'),calculation:'potOdds',conditions:words('River, heads-up, no further bets'),range:{seat:'villain',groups:[{id:'value',label:words('Value'),hands:['77','22']},{id:'bluff',label:words('Missed draws'),hands:['KJ','J9']}]}},{id:'call-end',node:{beatId:'call'},title:words('Call continuation')},{id:'fold-end',node:{beatId:'fold'},title:words('Fold continuation')}].map(a=>confirmAnalysis(s,a));
  return s;
}
function project(aspect='landscape'){return newProject({scenes:[scene()]},{locale:'zh-CN',profile:'final',aspect});}
function comparison(s){return {mode:'choices',origin:{sceneId:s.id,analysisId:'price'},routes:[{id:'call',label:words('Call'),sceneId:s.id,startAnalysisId:'price',endAnalysisId:'call-end'},{id:'fold',label:words('Fold'),sceneId:s.id,startAnalysisId:'price',endAnalysisId:'fold-end'}]};}
const validSVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 50 L90 50" stroke="#ffe0aa"/><text x="20" y="40" fill="#ffffff">A &amp; B</text></svg>';

test('semantic drawings, camera changes and clearing are complete per-frame snapshots',()=>{
  const p=project(),s=p.lesson.scenes[0],b=s.beats.find(b=>b.id==='think');
  b.presentation.cues={'zh-CN':{audioHash:null,cues:[{at:1,camera:{target:'hero',scale:1.8,duration:.3}},{at:2,annotations:[]},{at:3,camera:null}]}};
  const before=structuredClone(p),plan=compileProject(p,packs),f=plan.frames.find(f=>f.beatId==='think');
  assert.deepEqual(plan.issues,[]);assert.equal(frameAt(plan,f.startFrame).presentation.annotations.length,3);
  assert.equal(frameAt(plan,f.startFrame+60).presentation.annotations.length,0);
  assert.equal(frameAt(plan,f.startFrame+90).presentation.camera,null);
  const selected=f.startFrame+40,expected=renderFrame(plan,selected);renderFrame(plan,plan.totalFrames-1);renderFrame(plan,0);assert.equal(renderFrame(plan,selected),expected);assert.deepEqual(p,before);
  assert.doesNotMatch(renderFrame(plan,selected,{presentation:false}),/annotation-layer|data-layout|Price requires a range/);
});

test('all visual references obey public knowledge in player and director views',()=>{
  const p=project(),b=p.lesson.scenes[0].beats[1];b.presentation.annotations=[{id:'hidden',type:'arrow',from:'hero',to:'card:Kc'}];b.presentation.camera={target:'card:Jh',scale:2};
  for(const view of ['player','director']){const plan=compileProject(p,packs,{view});assert.ok(plan.issues.some(i=>i.code==='PRESENTATION_TARGET'));}
  b.view={reveal:['villain']};p.lesson.scenes[0].analysis[0]=confirmAnalysis(p.lesson.scenes[0],{...p.lesson.scenes[0].analysis[0],node:{beatId:'think'}});
  assert.ok(!compileProject(p,packs).issues.some(i=>i.code==='PRESENTATION_TARGET'));
});

test('portable artwork accepts static SVG and rejects executable or remote content',()=>{
  assert.doesNotThrow(()=>validateArtwork(validSVG,'svg'));
  for(const source of ['<svg><script>alert(1)</script></svg>','<svg onload="alert(1)"></svg>','<svg><foreignObject/></svg>','<svg><image href="https://example.com/a.png"/></svg>','<svg><path fill="url(https://example.com/a)"/></svg>','<!DOCTYPE svg><svg/>','<svg><g></svg>'])assert.throws(()=>validateArtwork(source,'svg'),{code:'PRESENTATION_ASSET'});
  assert.throws(()=>validateArtwork('https://example.com/photo.png','image'),{code:'PRESENTATION_ASSET'});
  const p={surface:'table',annotations:[{id:'free',type:'path',points:[[.1,.2],[.5,.6],[.8,.3]],color:'#85d7bb'},{id:'art',type:'svg',source:validSVG,box:{x:.1,y:.1,width:.2,height:.2}}]};
  assert.doesNotThrow(()=>presentationSchema(p));p.annotations[1].box.x=.9;assert.throws(()=>presentationSchema(p),{code:'PRESENTATION_ASSET'});
});

test('route comparison checks its common origin and derives condition differences',()=>{
  const p=project(),s=p.lesson.scenes[0],b=s.beats[1];b.presentation={surface:'analysis',analysisId:'price',show:['comparison'],comparison:comparison(s)};
  let plan=compileProject(p,packs),f=plan.frames.find(f=>f.beatId==='think');assert.deepEqual(plan.issues,[]);
  assert.deepEqual(f.presentation.comparison.routes.map(r=>r.actions.map(a=>a.type)),[['call'],['fold']]);
  assert.equal(f.presentation.comparison.routes[0].end.decision.pot,21.1);assert.equal(f.state.pot,15.1);
  const other=scene();other.id='larger';other.beats[0].actions[0].to=9.1;other.analysis=other.analysis.map(a=>confirmAnalysis(other,a));p.lesson.scenes.push(other);b.presentation.comparison.routes[1]={id:'larger',label:words('Larger bet'),sceneId:'larger',startAnalysisId:'price',endAnalysisId:'call-end'};
  assert.ok(compileProject(p,packs).issues.some(i=>i.code==='PRESENTATION_COMPARE'));
  b.presentation.comparison.mode='conditions';plan=compileProject(p,packs);assert.deepEqual(plan.issues,[]);f=plan.frames.find(f=>f.beatId==='think');const changed=f.presentation.comparison.routes[1];assert.ok(changed.differences.some(d=>d.field==='pot'&&d.before===15.1&&d.after===18.2));
  assert.match(renderFrame(plan,f.startFrame),/不代表 EV/);
});

test('future comparison material is withheld without breaking draft preview',()=>{
  const p=project(),s=p.lesson.scenes[0],b=s.beats[1];b.presentation={surface:'analysis',analysisId:'call-end',show:['comparison'],comparison:comparison(s)};
  const plan=compileProject(p,packs),frame=plan.frames.find(f=>f.beatId==='think');assert.ok(plan.issues.some(i=>i.code==='ANALYSIS_FUTURE'));assert.equal(frame.presentation.comparison,null);assert.doesNotThrow(()=>renderFrame(plan,frame.startFrame));assert.doesNotMatch(renderFrame(plan,frame.startFrame),/data-route=/);
});

test('condition comparison reports equal-count weight changes and names public fields for viewers',()=>{
  const p=project(),s=p.lesson.scenes[0];s.analysis[0].range={seat:'villain',entries:[{hand:'KsKd',weight:1},{hand:'Js9s',weight:.5}]};s.analysis=s.analysis.map(a=>confirmAnalysis(s,a));
  const changed=structuredClone(s);changed.id='changed';changed.start.seats.find(seat=>seat.id==='hero').stack=80;changed.analysis[0].range.entries[0].weight=.5;changed.analysis[0].range.entries[1].weight=1;changed.analysis=changed.analysis.map(a=>confirmAnalysis(changed,a));p.lesson.scenes.push(changed);
  const value=comparison(s);value.mode='conditions';value.routes[1]={id:'weight-change',label:words('Reweighted assumption'),sceneId:changed.id,startAnalysisId:'price',endAnalysisId:'call-end'};s.beats[1].presentation={surface:'analysis',analysisId:'price',show:['comparison'],comparison:value};
  const plan=compileProject(p,packs),frame=plan.frames.find(f=>f.beatId==='think'),diff=frame.presentation.comparison.routes[1].differences.find(d=>d.field==='range');assert.deepEqual(plan.issues,[]);assert.deepEqual(diff.before,diff.after);assert.equal(diff.rangeChanged,true);assert.equal(diff.changedCombinations,2);assert.deepEqual(diff.changedFields,['weight']);assert.deepEqual(diff.changedHands,['KK','J9s']);
  const html=renderFrame(plan,frame.startFrame);assert.match(html,/范围资料已改变/);assert.match(html,/River · 筹码/);assert.doesNotMatch(html,/seat:hero\/stack/);
});

test('motions terminate at a stable frame and never modify action or chip state',()=>{
  const plan=compileProject(project(),packs),before=structuredClone(plan),call=plan.frames.find(f=>f.beatId==='call'),show=plan.frames.find(f=>f.beatId==='showdown');
  assert.notEqual(renderFrame(plan,call.startFrame+1),renderFrame(plan,call.startFrame+10));
  assert.equal(renderFrame(plan,call.startFrame+20),renderFrame(plan,call.startFrame+25));
  assert.match(renderFrame(plan,show.startFrame+1),/data-motion="payout"/);assert.doesNotMatch(renderFrame(plan,show.startFrame+20),/data-motion="payout"/);
  assert.deepEqual(plan,before);
  plan.rehearsal=true;assert.match(renderFrame(plan,call.startFrame),/画面排演 · 配音待制作/);
});

test('browser drawing anchors, zoom, matrix, comparison and subtitles fit both aspects',async t=>{
  await build();const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  for(const aspect of ['landscape','portrait']){
    const p=project(aspect),s=p.lesson.scenes[0],plan=compileProject(p,packs),f=plan.frames.find(f=>f.beatId==='think');
    const page=await browser.newPage({viewport:{width:plan.width,height:plan.height}});t.after(()=>page.close());
    await page.goto(pathToFileURL(resolve('dist/client.html')).href);await page.waitForFunction(()=>window.__riverReady);await page.evaluate(p=>window.riverFrame.load(p),plan);await page.evaluate(()=>document.fonts.ready);
    const draw=i=>page.evaluate(i=>window.riverFrame.render(i),i);await draw(f.startFrame);
    assert.equal(await page.locator('[data-missing-targets]').count(),0);
    assert.equal(await page.locator('[data-annotation]').count(),3);
    const circle=await page.locator('[data-annotation="price-ring"] ellipse').boundingBox(),pot=await page.locator('[data-target="pot"]').boundingBox();assert.ok(Math.abs(circle.x+circle.width/2-pot.x-pot.width/2)<1);assert.ok(Math.abs(circle.y+circle.height/2-pot.y-pot.height/2)<1);
    const covered=await page.locator('.presentation-stage').evaluate(stage=>{const label=stage.querySelector('[data-annotation="reason"] rect').getBoundingClientRect(),nodes=[...stage.querySelectorAll('.context-eyebrow,.analysis-board .card,.analysis-hole .card,.analysis-facts dt,.analysis-facts dd,.analysis-heading h1')];return nodes.filter(e=>{const r=e.getBoundingClientRect();return Math.min(r.right,label.right)>Math.max(r.left,label.left)&&Math.min(r.bottom,label.bottom)>Math.max(r.top,label.top);}).map(e=>e.className||e.tagName);});assert.deepEqual(covered,[],aspect+' label leaves cards and decision facts readable');
    const snapshot=await page.screenshot();await draw(plan.totalFrames-1);await draw(f.startFrame);assert.deepEqual(await page.screenshot(),snapshot);
    const source=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png');});assert.doesNotThrow(()=>validateArtwork(source,'image'));
    f.presentation.annotations.push({id:'portable-image',type:'image',source,box:{x:.8,y:.05,width:.1,height:.1}},{id:'portable-svg',type:'svg',source:validSVG,box:{x:.8,y:.2,width:.1,height:.1}});await page.evaluate(p=>window.riverFrame.load(p),plan);await page.evaluate(()=>window.riverFrame.prepare());await draw(f.startFrame);assert.equal(await page.locator('[data-annotation] image').count(),2);
    f.presentation.camera={target:'hero',scale:1.8};await page.evaluate(p=>window.riverFrame.load(p),plan);await draw(f.startFrame);assert.match(await page.locator('.camera-world').getAttribute('style'),/scale\(1.8\)/);assert.equal(await page.locator('[data-missing-targets]').count(),0);
    // The renderer consumes the analysis module's stable result contract.
    const ranks='AKQJT98765432';f.presentation.camera=null;f.presentation.annotations=[];f.presentation.show=['range'];f.presentation.rangeView={mode:'matrix',metric:'ev',action:'call'};f.presentation.analysis.range={units:{ev:'BB'},matrix:[...ranks].flatMap((a,row)=>[...ranks].map((b,column)=>({hand:a===b?a+b:row<column?a+b+'s':b+a+'o',row,column,category:a===b?'pair':row<column?'suited':'offsuit',weight:.5,combinationCount:a===b?6:row<column?4:12,ev:{call:row===column?2:-1},actions:{call:.5,fold:.5}})))};
    await page.evaluate(p=>window.riverFrame.load(p),plan);await draw(f.startFrame);assert.equal(await page.locator('.range-cell').count(),169);assert.match(await page.locator('.range-cell').first().innerText(),/2 BB/);assert.doesNotMatch(await page.locator('.range-cell').first().innerText(),/%/);
    let overflow=await page.locator('.teaching-frame').evaluate(root=>[...root.querySelectorAll('.analysis-layout,.advanced-content,.range-matrix,.analysis-context')].filter(e=>{const a=e.getBoundingClientRect(),b=root.getBoundingClientRect();return a.bottom>b.bottom+1||a.right>b.right+1||e.scrollHeight>e.clientHeight+2;}).map(e=>e.className));assert.deepEqual(overflow,[],aspect+' range layout');
    f.presentation.analysis.metrics=[{kind:'spr',applicable:true,value:5.94,unit:'ratio'},{kind:'equity',applicable:true,value:1/3,unit:'probability',method:'exact',samples:9,standardError:0},{kind:'callEV',applicable:true,value:1.033,unit:'BB',method:'exact'}];
    f.presentation.analysis.decision.seats.push(...Array.from({length:4},(_,i)=>({...structuredClone(f.presentation.analysis.decision.seats[0]),id:'folded-'+i,name:'Seat '+(i+3),stack:100,contributed:0,streetBet:0,folded:true,hole:[null,null]})));
    f.presentation.layoutSections=['range','metrics','conditions'];f.presentation.show=['range'];
    await page.evaluate(p=>window.riverFrame.load(p),plan);await draw(f.startFrame);const reserved=await page.locator('.range-matrix').boundingBox();
    f.presentation.show=['range','metrics','conditions'];await page.evaluate(p=>window.riverFrame.load(p),plan);await draw(f.startFrame);assert.deepEqual(await page.locator('.range-matrix').boundingBox(),reserved,aspect+' reveal retains matrix geometry');
    const matrix=await page.locator('.range-matrix').boundingBox(),metrics=await page.locator('.metrics-grid').boundingBox();assert.ok(matrix.y+matrix.height<=metrics.y,aspect+' matrix does not overlap metrics');
    overflow=await page.locator('.teaching-frame').evaluate(root=>[...root.querySelectorAll('.research-panel,.metrics-grid,.metric-card,.research-conditions')].filter(e=>{const a=e.getBoundingClientRect(),b=root.getBoundingClientRect();return a.bottom>b.bottom+1||a.right>b.right+1||e.scrollHeight>e.clientHeight+2;}).map(e=>e.className));assert.deepEqual(overflow,[],aspect+' matrix and three metrics layout');
    f.presentation.layoutSections.push('calculation');f.presentation.show.push('calculation');await page.evaluate(p=>window.riverFrame.load(p),plan);await draw(f.startFrame);
    overflow=await page.locator('.teaching-frame').evaluate(root=>[...root.querySelectorAll('.research-panel,.metrics-grid,[data-reveal="calculation"]')].filter(e=>{const a=e.getBoundingClientRect(),b=root.getBoundingClientRect();return a.bottom>b.bottom+1||a.right>b.right+1||e.scrollHeight>e.clientHeight+2;}).map(e=>e.className));assert.deepEqual(overflow,[],aspect+' dense matrix, metrics and price layout');
    f.presentation.rangeView={mode:'groups'};f.presentation.analysis.range.groups=[{id:'assumption',label:'Assumption',hands:['77','22','KJo']}];await page.evaluate(p=>window.riverFrame.load(p),plan);await draw(f.startFrame);assert.equal(await page.locator('[data-group="assumption"]').count(),1);assert.equal(await page.locator('.metric-card').count(),3);
    s.beats[1].presentation={surface:'analysis',analysisId:'price',show:['comparison'],comparison:comparison(s)};const compared=compileProject(p,packs);await page.evaluate(p=>window.riverFrame.load(p),compared);await draw(compared.frames.find(f=>f.beatId==='think').startFrame);assert.equal(await page.locator('.comparison-route').count(),2);
    overflow=await page.locator('.teaching-frame').evaluate(root=>[...root.querySelectorAll('.comparison-route,.comparison-study,.analysis-context')].filter(e=>{const a=e.getBoundingClientRect(),b=root.getBoundingClientRect();return a.bottom>b.bottom+1||a.right>b.right+1||e.scrollHeight>e.clientHeight+2;}).map(e=>e.className));assert.deepEqual(overflow,[],aspect+' comparison layout');
  }
});
