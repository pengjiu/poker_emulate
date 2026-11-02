import test from 'node:test';
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {stored,temp} from './helpers.mjs';
import {serve} from '../src/server.mjs';
const exec=promisify(execFile);
test('Real studio operation chain, CLI handoff and portable download (A02/A14)',async t=>{
  const store=await stored(t,{locale:'en-US'}),server=await serve(store.directory,{port:0}),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  let archivePath;page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();await server.close();});
  await page.goto(server.url);await page.waitForSelector('#scene-select');
  const revision=async()=>Number((await store.read()).revision);
  const change=async action=>{const before=await revision();await action();await page.waitForFunction(r=>document.querySelector('.stage-top')?.textContent.includes('r'+(r+1)),before);assert.equal(await revision(),before+1);};
  await t.test('CLI seeks the browser cursor; player cards stay hidden',async()=>{
    const {stdout}=await exec(process.execPath,['bin/river.mjs','inspect','--project',store.directory,'--beat','decision']);const observation=JSON.parse(stdout);assert.equal(observation.previewUrl,server.url);
    assert.equal(observation.state.seats.find(p=>p.id==='bb').hole[0],null);
    await page.waitForSelector('[data-frame="decision"].active');assert.ok(await page.locator('#stage .card.back').count()>0);
  });
  await t.test('Narration save pauses playback and persists',async()=>{
    await page.locator('[data-ui="play"]').click();await page.locator('#narration').fill('We are on the button. After the big blind checks, consider their continuing range and the purpose of betting. Let us see how different choices change the hand.');
    await change(()=>page.locator('[data-ui="save-narration"]').click());assert.match((await store.read()).lesson.scenes[0].beats[2].narration['en-US'],/purpose/);
    assert.equal(await page.locator('[data-ui="play"] path').getAttribute('d'),'M8 5l11 7-11 7z');
  });
  await t.test('WAV and MP3 picker imports work through the real browser',async()=>{
    const dir=await temp(t),wav=resolve('examples/legacy/assets/audio/en-US.wav'),mp3=join(dir,'voice.mp3');await exec('ffmpeg',['-y','-v','error','-i',wav,mp3]);
    for(const path of [wav,mp3])await change(async()=>{const chooser=page.waitForEvent('filechooser');await page.locator('[data-ui="audio"]').click();await (await chooser).setFiles(path);});
    const p=await store.read();assert.equal(Object.keys(p.assets).length,2);const {stdout}=await exec(process.execPath,['bin/river.mjs','validate','--project',store.directory,'--render']);assert.equal(JSON.parse(stdout).ready,true);
  });
  await t.test('Seat editor and duplicate-disabling card picker persist',async()=>{
    await page.locator('#stage [data-seat="btn"] .seat-panel').click();await page.locator('#seat-name').fill('My River');await change(()=>page.locator('[data-ui="save-seat"]').click());
    await page.locator('[data-ui="pick-seat"]').click();assert.equal(await page.locator('[data-card-pick="Qd"]').isDisabled(),true);
    await page.locator('[data-card-pick="As"]').click();await page.locator('[data-card-pick="Ac"]').click();await change(()=>page.locator('[data-save]').click());
    assert.deepEqual((await store.read()).lesson.scenes[0].start.seats.find(p=>p.id==='btn').hole,['Qs','Ac']);await page.locator('[data-ui="back"]').click();
  });
  await t.test('All-in preset selects a size without committing an action',async()=>{
    await page.locator('[data-frame="decision"]').click();const before=await store.read();await page.locator('#stage [data-size="all"]').click();await page.waitForSelector('#stage [data-act="allin"]');
    const slider=await page.locator('#stage .bet-slider').evaluate(el=>({value:Number(el.value),max:Number(el.max)}));assert.equal(slider.value,slider.max);assert.deepEqual(await store.read(),before);
    await page.locator('#stage [data-size="0.5"]').click();assert.equal(await page.locator('#stage [data-act="allin"]').count(),0);assert.deepEqual(await store.read(),before);
  });
  await t.test('A genuine action creates a localized branch and changes chips',async()=>{
    await page.locator('[data-frame="decision"]').click();await change(()=>page.locator('#stage [data-act="check"]').click());
    const p=await store.read(),b=p.lesson.scenes[0].branches.find(b=>b.id===p.output.branchId);assert.equal(b.beats.at(-1).actions[0].type,'check');assert.notEqual(b.label['ja-JP'],b.label['en-US']);
    await page.waitForSelector(`[data-frame="${b.beats.at(-1).id}::0"].active`);
  });
  await t.test('Language, aspect, profile, captions save; invalid edit is localized',async()=>{
    await change(()=>page.selectOption('#locale-select','ja-JP'));await change(()=>page.locator('[data-aspect="portrait"]').click());await change(()=>page.selectOption('#profile-select','final'));await change(()=>page.locator('[data-ui="captions"]').click());
    assert.equal(await page.locator('html').getAttribute('lang'),'ja-JP');assert.equal((await store.read()).output.aspect,'portrait');
    await page.locator('#stage [data-seat="btn"] .seat-panel').click();await page.locator('#seat-stack').fill('-1');const before=await revision();await page.locator('[data-ui="save-seat"]').click();await page.waitForSelector('.toast');assert.equal(await revision(),before);assert.match(await page.locator('.toast').last().textContent(),/[\u3040-\u30ff\u4e00-\u9fff]/);
    await page.locator('[data-ui="back"]').click();
  });
  await t.test('Export button downloads a portable archive with content-hashed audio',async()=>{
    const download=page.waitForEvent('download');await page.locator('[data-ui="export"]').click();const file=await download,path=join(await temp(t),'project.tar.gz');await file.saveAs(path);archivePath=path;const {stdout}=await exec('tar',['-tzf',path]);assert.match(stdout,/project.json/);assert.match(stdout,/assets\/[a-f0-9]{64}\.mp3/);
  });
  await t.test('Clean client excludes director UI; output survives reopening',async()=>{
    const clean=await browser.newPage();await clean.goto(server.url+'/?view=client');await clean.waitForSelector('.client');assert.equal(await clean.locator('.topbar,.inspector').count(),0);assert.doesNotMatch(await clean.locator('body').textContent(),/RIVER STUDIO|教学演示|玩家视角|HERO/);
    await clean.close();await page.reload();await page.waitForSelector('#locale-select');assert.equal(await page.locator('#locale-select').inputValue(),'ja-JP');assert.equal(await page.locator('#profile-select').inputValue(),'final');
  });
  await t.test('Downloaded browser project moves and renders through the actual CLI',async()=>{
    const dir=await temp(t),moved=join(dir,'移交 project');await mkdir(moved);await exec('tar',['-xzf',archivePath,'-C',moved]);
    const {stdout}=await exec(process.execPath,['bin/river.mjs','render','--project',moved,'--locale','en-US','--profile','draft','--out',join(dir,'video')],{timeout:180000,maxBuffer:4*1024*1024});const result=JSON.parse(stdout);assert.equal(result.ok,true);assert.equal(result.aspect,'portrait');assert.equal(result.validation.audioNonSilent,true);assert.ok((await readFile(join(result.directory,'video.mp4'))).length>1000);
  });
  assert.deepEqual(errors,[]);
});
