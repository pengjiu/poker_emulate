import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createProject,newProject} from '../src/project/store.mjs';
import {confirmAnalysis} from '../src/analysis/index.mjs';
import {serve} from '../src/server.mjs';
import {priceLesson} from '../examples/teaching/course.mjs';
import {temp} from './helpers.mjs';

test('director edits presentation and reveal timing through the existing atomic API',async t=>{
  const scene=priceLesson();scene.analysis=scene.analysis.map(item=>confirmAnalysis(scene,item));
  const originalFocus=['card:Qh','seat:btn','seat:utg'];scene.beats.find(b=>b.id==='range').presentation.focus=originalFocus;
  const store=await createProject(join(await temp(t),'project'),newProject({scenes:[scene]},{locale:'zh-CN'}));
  const server=await serve(store.directory,{port:0}),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();await server.close();});
  await page.goto(server.url);await page.waitForSelector('#scene-select');
  await page.locator('[data-frame="range"]').click();await page.waitForSelector('[data-frame="range"].active');
  await page.locator('#presentation-title').fill('当前范围的三组候选');
  await page.locator('[name="presentation-show"][value="takeaway"]').check();
  await page.locator('[data-ui="save-presentation"]').click();
  await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r1'));
  const saved=(await store.read()).lesson.scenes[0].beats.find(b=>b.id==='range');
  assert.equal(saved.presentation.title['zh-CN'],'当前范围的三组候选');assert.ok(saved.presentation.show.includes('takeaway'));
  assert.deepEqual(new Set(saved.presentation.focus),new Set(originalFocus),'Editing a heading must preserve hero-card and folded-seat anchors authored through the API.');
  await page.locator('[data-ui="presentation-cues"]').click();await page.locator('[data-add-cue]').click();
  await page.locator('[data-cue-row] input[type="number"]').fill('4');
  await page.locator('[data-cue-row] [value="takeaway"]').uncheck();
  await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r2'));
  const binding=(await store.read()).lesson.scenes[0].beats.find(b=>b.id==='range').presentation.cues['zh-CN'];
  assert.equal(binding.audioHash,null,'A missing audio take cannot pretend timing was synchronized.');assert.equal(binding.cues[0].at,4);assert.ok(!binding.cues[0].show.includes('takeaway'));
  assert.equal(await page.locator('#stage [data-teaching-surface="analysis"]').count(),1);
  const clean=await browser.newPage();await clean.goto(server.url+'/?view=client');await clean.waitForSelector('.client');assert.equal(await clean.locator('[data-teaching-surface],.inspector,.caption-lane').count(),0);await clean.close();
  const output=await browser.newPage();await output.goto(server.url+'/?view=output');await output.waitForSelector('[data-teaching-surface="analysis"]');assert.equal(await output.locator('.inspector').count(),0);await output.close();
  await page.setViewportSize({width:360,height:800});await page.reload();await page.waitForSelector('#presentation-title');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'The director should not require horizontal page scrolling.');
  for(const width of [1440,360]){
    await page.setViewportSize({width,height:1000});
    await page.locator('[data-frame="wrap"]').click();await page.waitForSelector('[data-frame="wrap"].active');
    const visible=await page.evaluate(()=>{
      const footer=document.querySelector('.footer-strip'),transport=document.querySelector('.transport'),timeline=document.querySelector('.beat-timeline'),active=timeline.querySelector('.beat-chip.active');
      const inside=(element,container)=>{const a=element.getBoundingClientRect(),b=container.getBoundingClientRect();return a.left>=b.left-.5&&a.right<=b.right+.5&&a.top>=b.top-.5&&a.bottom<=b.bottom+.5;};
      return {transport:inside(transport,footer),active:inside(active,timeline),outerScroll:footer.scrollLeft};
    });
    assert.deepEqual(visible,{transport:true,active:true,outerScroll:0},`${width}px: selecting a late clip must keep playback controls and the clip visible.`);
  }
  assert.deepEqual(errors,[]);
});
