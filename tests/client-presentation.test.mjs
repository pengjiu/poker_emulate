import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {build} from '../scripts/build.mjs';
import {compileProject} from '../src/compiler.mjs';
import {confirmAnalysis} from '../src/analysis/index.mjs';
import {newProject} from '../src/project/store.mjs';
import {renderFrame} from '../src/client/render.mjs';
import {priceLesson} from '../examples/teaching/course.mjs';
import {packs} from './helpers.mjs';
import {createHand} from '../src/poker/rules.mjs';

test('chip-denominated tables label editable wager amounts in the declared denomination',()=>{
  const start=createHand({seats:[{id:'hero',stack:100},{id:'other',stack:100}],button:'hero',hero:'hero',bigBlind:2,unit:'chips'}),p=newProject({scenes:[{id:'chips',title:{'zh-CN':'筹码桌'},start,beats:[{id:'setup',label:{'zh-CN':'当前决定'}}]}]});
  const plan=compileProject(p,packs),html=renderFrame(plan,0);assert.equal(plan.frames[0].state.unit,'chips');assert.match(html,/class="bet-amount">4\.00 筹码<\/span>/);assert.doesNotMatch(html,/4\.00 BB/);
});

function project(aspect='landscape',seatCount=6,revealed=false){
  const scene=priceLesson();
  for(let i=scene.start.seats.length;i<seatCount;i++)scene.start.seats.push({id:'extra-'+i,name:'Guest_'+i,stack:100,folded:true});
  if(revealed)scene.beats.find(beat=>beat.id==='river-bet').view={reveal:['bb']};
  scene.analysis=scene.analysis.map(item=>confirmAnalysis(scene,item));
  return newProject({scenes:[scene]},{locale:'zh-CN',aspect,profile:'final'});
}

test('pending decisions never prefill an authored future raise',()=>{
  const p=project(),s=p.lesson.scenes[0],a=compileProject(p,packs),frame=a.frames.find(f=>f.beatId==='choice');
  const before=renderFrame(a,frame.startFrame,{presentation:false});
  s.beats=s.beats.slice(0,s.beats.findIndex(b=>b.id==='call')+1);
  s.beats.at(-1).actions=[{seat:'btn',type:'raise',to:18}];
  const b=compileProject(p,packs);
  assert.equal(renderFrame(b,b.frames.find(f=>f.beatId==='choice').startFrame,{presentation:false}),before);
});

test('active unassigned holdings show two backs until that player folds',()=>{
  for(const aspect of ['landscape','portrait']){
    const plan=compileProject(project(aspect),packs);
    const opening=renderFrame(plan,0,{presentation:false});
    assert.equal((opening.match(/class="card back"/g)??[]).length,10);
    assert.match(opening,/data-card="Ah"/);assert.match(opening,/data-card="Qh"/);
    assert.doesNotMatch(opening,/data-card="Ks"|data-card="Jh"/);
    const folded=plan.frames.find(frame=>frame.event?.seat==='utg'&&frame.event.type==='fold');
    assert.equal((renderFrame(plan,folded.startFrame,{presentation:false}).match(/class="card back"/g)??[]).length,8);
    assert.deepEqual(plan.frames[0].state.seats.find(seat=>seat.id==='utg').hole,[],'Rendering does not assign invented cards.');
  }
});

test('analysis is a pure view and clean-client rendering remains available',()=>{
  const plan=compileProject(project(),packs),f=plan.frames.find(frame=>frame.beatId==='price'),original=structuredClone(plan);
  const markup=renderFrame(plan,f.startFrame);
  assert.match(markup,/data-teaching-surface="analysis"/);assert.match(markup,/28.44%/);
  assert.doesNotMatch(markup,/data-card="Ks"|data-card="Jh"/);
  const clean=renderFrame(plan,f.startFrame,{presentation:false});
  assert.match(clean,/class="client /);assert.doesNotMatch(clean,/data-teaching-surface|跟注价格与范围判断/);
  assert.equal(renderFrame(plan,f.startFrame),markup);assert.deepEqual(plan,original);
  const replay=structuredClone(plan),later=replay.frames.find(frame=>frame.beatId==='wrap');later.presentation=structuredClone(f.presentation);
  assert.match(renderFrame(replay,later.startFrame),/回看决定/);assert.match(markup,/暂停分析/);
});

test('every analysis seat anchor has a public target even with the range hidden',()=>{
  for(const seatCount of [6,9])for(const aspect of ['landscape','portrait']){
    const plan=compileProject(project(aspect,seatCount),packs),frame=plan.frames.find(f=>f.beatId==='price');
    frame.presentation.show=['calculation','conditions'];
    for(const seat of frame.presentation.analysis.decision.seats){
      frame.presentation.focus=['seat:'+seat.id];
      const markup=renderFrame(plan,frame.startFrame);
      const tags=[...markup.matchAll(/<div class="analysis-seat ([^"]*)" data-focus-target="([^"]*)" aria-label="([^"]*)">/g)];
      assert.equal(tags.length,frame.state.seats.length);
      const focused=tags.filter(tag=>tag[1].includes('is-focused'));
      assert.equal(focused.length,1);assert.equal(focused[0][2],'seat:'+seat.id);
      assert.ok(focused[0][3].includes(seat.name));assert.ok(focused[0][3].includes('BB'));
      if(seat.folded)assert.match(focused[0][3],/弃牌/);
      assert.doesNotMatch(markup,/data-card="Ks"|data-card="Jh"/);
    }
  }
});

test('revealed opponent cards have targets while unknown hole cards stay absent',()=>{
  for(const aspect of ['landscape','portrait']){
    const plan=compileProject(project(aspect,9,true),packs),frame=plan.frames.find(f=>f.beatId==='price');
    frame.presentation.show=['calculation','conditions'];frame.presentation.focus=['card:Ks'];
    const html=renderFrame(plan,frame.startFrame);
    assert.match(html,/<span class="analysis-public-card [^"]*is-focused" data-card="Ks" data-focus-target="card:Ks">K♠<\/span>/);
    assert.match(html,/data-focus-target="card:Jh"/);
    frame.presentation.focus=[];assert.match(renderFrame(plan,frame.startFrame),/data-focus-target="card:Ks"/,'Known cards remain present when focus changes.');
    const hidden=compileProject(project(aspect,9),packs),f=hidden.frames.find(f=>f.beatId==='price');assert.doesNotMatch(renderFrame(hidden,f.startFrame),/data-focus-target="card:Ks"|data-focus-target="card:Jh"/);
  }
});

test('analysis canvas reveals in place and fits both real output aspects',async t=>{
  await build();const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  for(const seatCount of [6,9])for(const aspect of ['landscape','portrait']){
    const plan=compileProject(project(aspect,seatCount,true),packs),source=plan.frames.find(f=>f.beatId==='range'),target=plan.frames.find(f=>f.beatId==='choice');
    // Deliberately reveal the same material without changing content or game state.
    source.presentation.show=['range','calculation','conditions'];target.presentation.show=[...source.presentation.show,'takeaway'];source.presentation.focus=['seat:bb','card:Ks'];target.presentation.focus=[...source.presentation.focus];
    const page=await browser.newPage({viewport:{width:plan.width,height:plan.height}});
    await page.goto(pathToFileURL(resolve('dist/client.html')).href);await page.waitForFunction(()=>window.__riverReady);
    await page.evaluate(plan=>window.riverFrame.load(plan),plan);await page.evaluate(()=>document.fonts.ready);
    const render=i=>page.evaluate(i=>window.riverFrame.render(i),i);await render(source.startFrame);
    assert.equal(await page.locator('[data-reveal="takeaway"]').isVisible(),false);
    const contextBefore=await page.locator('.analysis-context').boundingBox(),rangeBefore=await page.locator('[data-reveal="range"]').boundingBox();
    await render(target.startFrame);assert.equal(await page.locator('[data-reveal="takeaway"]').isVisible(),true);
    assert.deepEqual(await page.locator('.analysis-context').boundingBox(),contextBefore);
    assert.deepEqual(await page.locator('[data-reveal="range"]').boundingBox(),rangeBefore);
    const escaped=await page.locator('.teaching-frame').evaluate(root=>[...root.querySelectorAll('.analysis-context,.analysis-panel,.analysis-board,.analysis-hero,.analysis-facts,.analysis-seats,.analysis-question')].filter(el=>getComputedStyle(el).visibility!=='hidden').filter(el=>{const a=el.getBoundingClientRect(),b=root.getBoundingClientRect();return a.bottom>b.bottom+.5||a.right>b.right+.5||a.left<b.left-.5||el.scrollHeight>el.clientHeight+2;}).map(el=>el.className));
    assert.deepEqual(escaped,[],`${aspect}, ${seatCount} seats: analysis content exceeds its visible bounds`);
    const direct=await page.screenshot();await render(source.startFrame);await render(target.startFrame);assert.deepEqual(await page.screenshot(),direct,'Random seeking must reproduce the same picture.');
    await page.close();
  }
});
