import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {stored,words} from './helpers.mjs';
import {Director} from '../src/director.mjs';
import {serve} from '../src/server.mjs';

test('Director modes, local overrides and preview preserve one audio instance across timed actions',async t=>{
  const store=await stored(t),d=await Director.open(store.directory),s=(await store.read()).lesson.scenes[0];s.branches=[];
  s.beats=[{id:'flow',label:words('Flow'),narration:words('两家先后过牌。'),actions:[{type:'check',seat:'bb'},{type:'check',seat:'btn'}],timing:{actions:[.2,.5],narration:0},hold:2}];
  await d.apply({requestId:'setup',expectedRevision:0,commands:[{type:'scene.put',value:s},{type:'audio.attach',sceneId:s.id,beatId:'flow',value:{locale:'zh-CN',source:{path:resolve('examples/legacy/assets/audio/zh-CN.wav')}}}]});
  const server=await serve(store.directory,{port:0}),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();await server.close();});
  await page.addInitScript(()=>{window.audioStarts=[];window.Audio=class extends EventTarget {constructor(src){super();window.latestAudio=this;this.offset=0;this.started=0;this.playing=false;this.ended=false;window.audioStarts.push(src);}get currentTime(){return this.offset+(this.playing?(performance.now()-this.started)/1000:0);}set currentTime(value){this.offset=value;this.started=performance.now();}async play(){await new Promise(r=>setTimeout(r,650));this.started=performance.now();this.playing=true;}pause(){this.offset=this.currentTime;this.playing=false;}};});
  await page.goto(server.url);await page.waitForSelector('#direction-pattern',{state:'attached'});await page.locator('.direction-settings').evaluate(el=>{el.open=true;});await page.selectOption('#direction-pattern','think-aloud');
  await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r2'));assert.equal((await store.read()).direction.profile.id,'think-aloud');
  await page.locator('.direction-settings').evaluate(el=>{el.open=true;});await page.locator('#direction-local').check();await page.selectOption('#direction-pattern','decision-quiz');
  await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r3'));assert.equal((await store.read()).lesson.scenes[0].direction.profile.id,'decision-quiz');
  await page.locator('[data-ui="play"]').click();await page.waitForTimeout(350);assert.equal(await page.locator('#stage .seat[data-seat="btn"] .seat-action').count(),0);await page.waitForFunction(()=>document.querySelector('#stage .seat[data-seat="btn"] .seat-action')?.textContent.includes('过牌'));await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>window.audioStarts.length),1);await page.evaluate(()=>window.latestAudio.dispatchEvent(new Event('error')));await page.waitForSelector('.toast');assert.equal(await page.locator('[data-ui="play"] path').getAttribute('d'),'M8 5l11 7-11 7z');
  assert.equal((await store.read()).revision,3);assert.deepEqual(errors,[]);
  await page.locator('[data-ui="sequence"]').click();await page.locator('.modal textarea').fill(JSON.stringify([{id:'first',sceneId:s.id},{id:'again',sceneId:s.id}]));await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r4'));
  assert.equal((await store.read()).output.sequence.length,2);await page.locator('[data-frame="again::flow::t0"]').click();await page.waitForFunction(()=>document.querySelector('[data-frame="again::flow::t0"]')?.classList.contains('active'));
  assert.equal((await server.director.observe()).entryId,'again');assert.deepEqual(errors,[]);
});

test('Playback changes the editor context before saving and repeated-beat actions stay in their entry',async t=>{
  const store=await stored(t),d=await Director.open(store.directory),a=(await store.read()).lesson.scenes[0];a.branches=[];a.start.actor='btn';a.start.actedAt={bb:0};a.beats=[{id:'flow',label:words('First'),hold:.5,narration:words('第一手原稿')}];const b=structuredClone(a);b.id='second';b.beats[0].hold=6;b.beats[0].narration=words('第二手原稿');
  await d.apply({requestId:'chapters',expectedRevision:0,commands:[{type:'scene.put',value:a},{type:'scene.put',value:b},{type:'output.set',value:{sequence:[{id:'one',sceneId:a.id},{id:'two',sceneId:b.id}]}}]});
  const server=await serve(store.directory,{port:0}),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}});t.after(async()=>{await browser.close();await server.close();});
  await page.goto(server.url);await page.waitForSelector('#narration');await page.locator('[data-ui="play"]').click();await page.waitForFunction(()=>document.querySelector('#narration')?.value==='第二手原稿');
  await page.locator('#narration').fill('第二手修改稿');await page.locator('[data-ui="save-narration"]').click();await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r2'));
  let saved=await store.read();assert.equal(saved.lesson.scenes.find(s=>s.id===a.id).beats[0].narration['zh-CN'],'第一手原稿');assert.equal(saved.lesson.scenes.find(s=>s.id===b.id).beats[0].narration['zh-CN'],'第二手修改稿');
  await server.director.seek({beatId:'flow',entryId:'one'});await page.waitForSelector('[data-frame="one::flow"].active');assert.equal(await page.locator('#stage [data-act="check"]').isDisabled(),false);
  await page.locator('#stage [data-act="check"]').click();await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r3'));saved=await store.read();assert.equal(saved.output.sceneId,a.id);assert.equal(saved.output.sequence,undefined);assert.ok(saved.lesson.scenes.find(s=>s.id===a.id).branches.length);
});

test('An open timing dialog cannot confirm a newer revision using stale editor values',async t=>{
  const store=await stored(t),server=await serve(store.directory,{port:0}),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}});t.after(async()=>{await browser.close();await server.close();});
  await page.goto(server.url);await page.waitForSelector('[data-ui="timing"]');await page.locator('[data-ui="timing"]').click();await page.waitForSelector('[data-save]');
  await server.director.apply({requestId:'new-voice-settings',expectedRevision:0,commands:[{type:'voice.set',value:{locale:'zh-CN',speed:.9}}]});await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r1'));await page.locator('[data-save]').click();await page.waitForSelector('.toast');assert.match(await page.locator('.toast').last().textContent(),/REVISION_CONFLICT/);assert.equal((await store.read()).revision,1);assert.equal((await store.read()).lesson.scenes[0].beats[0].timing,undefined);
});

test('Saving precise captions preserves untimed action-then-speech order until timing is enabled',async t=>{
  const store=await stored(t),d=await Director.open(store.directory),s=(await store.read()).lesson.scenes[0];s.branches=[];s.beats=[{id:'flow',label:words('Flow'),actions:[{type:'check',seat:'bb'},{type:'check',seat:'btn'}],narration:words('Both checked.')}];
  await d.apply({requestId:'two-checks',expectedRevision:0,commands:[{type:'scene.put',value:s},{type:'audio.attach',beatId:'flow',value:{locale:'zh-CN',source:{path:resolve('examples/legacy/assets/audio/zh-CN.wav')}}}]});
  const before=await d.export({kind:'plan'}),saved=await store.read(),ref=saved.lesson.scenes[0].beats[0].audio['zh-CN'];
  const server=await serve(store.directory,{port:0}),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}});t.after(async()=>{await browser.close();await server.close();});
  await page.goto(server.url);await page.waitForSelector('[data-ui="timing"]');await page.locator('[data-ui="timing"]').click();assert.equal(await page.locator('.modal textarea').first().inputValue(),'null');await page.locator('.modal details').evaluate(el=>{el.open=true;});await page.locator('[data-caption-cues]').fill(JSON.stringify([{start:0,end:saved.assets[ref.assetId].duration,text:'Both checked.'}]));await page.locator('[data-save]').click();await page.waitForFunction(()=>document.querySelector('.stage-top')?.textContent.includes('r2'));
  const after=await server.director.export({kind:'plan'});assert.equal(after.frames.find(f=>f.narration).start,before.frames.find(f=>f.narration).start);assert.equal(after.issues.length,0);
  await page.locator('[data-ui="timing"]').click();await page.locator('[data-enable-timing]').click();assert.deepEqual(JSON.parse(await page.locator('.modal textarea').first().inputValue()),{actions:[0,.7],narration:0});await page.locator('[data-close]').click();assert.equal((await store.read()).revision,2);
});
