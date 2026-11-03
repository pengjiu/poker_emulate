import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {build} from '../scripts/build.mjs';
import {compileProject} from '../src/compiler.mjs';
import {betPreset,subtitleCues} from '../src/client/render.mjs';
import {fixture,packs,words} from './helpers.mjs';

test('Raise presets size the raise after accounting for the call',()=>{
  const state={pot:20,seats:[{streetBet:0},{streetBet:5}],legalActions:[{type:'call',amount:5},{type:'raise',minTo:10,maxTo:50}]};
  assert.equal(betPreset(state,.5),17.5);assert.equal(betPreset(state,1),30);assert.equal(betPreset(state,'all'),50);assert.equal(betPreset(state,2),50);assert.equal(betPreset(state,'invalid'),null);assert.equal(betPreset({...state,legalActions:[]},.5),null);
});

test('Localized captions fit two comfortable lines in both full-resolution deliveries',async t=>{
  await build();const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
  await page.goto(pathToFileURL(resolve('dist/client.html')).href);await page.waitForFunction(()=>window.__riverReady);
  const passages={
    'zh-CN':'先看这枪的价格，再看我们能赢哪些牌。跟完底池是18.1BB，门槛大约24.86%。位置不变，换个下注尺度，决定就可能不同。',
    'en-US':'First look at the price, then at the hands we can beat. Calling makes the pot 18.1BB and requires about 24.86% equity. A different bet size can change our decision.',
    'ja-JP':'まずコールの価格を見て、勝てるハンドを考えます。コール後のポットは18.1BB、必要な勝率は約24.86%です。ベットサイズが変われば、判断も変わります。'
  };
  for(const aspect of ['landscape','portrait'])for(const [locale,text]of [...Object.entries(passages),['en-US','W'.repeat(72)],['en-US','GAMMA '.repeat(20)]]){
    await page.setViewportSize(aspect==='portrait'?{width:1080,height:1920}:{width:1920,height:1080});
    const plan=compileProject(fixture({sceneId:'button-vs-blind',locale,aspect,captions:true,profile:'final'}),packs),frame=structuredClone(plan.frames[0]);
    Object.assign(frame,{start:0,duration:20,startFrame:0,endFrame:600,narration:text,narrationStart:0,narrationDuration:20,audio:{duration:20},captionCues:null});plan.frames=[frame];plan.totalFrames=600;
    await page.evaluate(p=>window.riverFrame.load(p),plan);await page.evaluate(()=>document.fonts.ready);
    for(const cue of subtitleCues(plan)){
      await page.evaluate(i=>window.riverFrame.render(i),Math.floor((cue.start+cue.end)/2*plan.fps));
      const geometry=await page.locator('.caption-text').evaluate(el=>{
        const r=el.getBoundingClientRect(),lane=el.parentElement.getBoundingClientRect(),style=getComputedStyle(el);
        const overlaps=[...document.querySelectorAll('.game-surface .card,.game-surface .action-buttons')].some(other=>{const b=other.getBoundingClientRect();return r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;});
        return {font:parseFloat(style.fontSize),height:r.height,line:parseFloat(style.lineHeight),fits:r.left>=lane.left-1&&r.right<=lane.right+1&&r.top>=lane.top-1&&r.bottom<=lane.bottom+1,overlaps};
      });
      assert.ok(geometry.font>=40,`${aspect}/${locale}: subtitles are too small`);
      assert.ok(geometry.height<=2*geometry.line+2,`${aspect}/${locale}: more than two lines`);
      assert.ok(geometry.fits,`${aspect}/${locale}: caption escapes its safe lane`);assert.equal(geometry.overlaps,false,`${aspect}/${locale}: caption covers cards or actions`);
    }
  }
});

test('Dealer marker stays inside the client for every button position at2–9 seats',async t=>{
  await build();const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(pathToFileURL(resolve('dist/client.html')).href);await page.waitForFunction(()=>window.__riverReady);
  for(const aspect of ['landscape','portrait']){
    await page.setViewportSize(aspect==='portrait'?{width:1080,height:1920}:{width:1920,height:1080});
    for(let count=2;count<=9;count++)for(let button=0;button<count;button++){
      const seats=Array.from({length:count},(_,i)=>({id:'p'+i,name:'Player'+i,stack:100,hole:[]})),sb=count===2?button:(button+1)%count,bb=(button+(count===2?1:2))%count;
      for(const [index,amount]of [[sb,.5],[bb,1]])Object.assign(seats[index],{stack:100-amount,contributed:amount,streetBet:amount});
      const p=fixture({locale:'en-US',aspect,profile:'final'});p.output.sceneId='dealer';p.output.branchId=null;p.lesson.scenes=[{id:'dealer',title:words('Table'),start:{street:'preflop',button:'p'+button,hero:'p0',actor:'p'+(count===2?button:(button+3)%count),seats},beats:[{id:'still',label:words('Ready'),hold:1}]}];
      await page.evaluate(p=>window.riverFrame.load(p),compileProject(p,packs));
      const fits=await page.locator('.dealer').evaluate(el=>{const r=el.getBoundingClientRect(),c=el.closest('.client').getBoundingClientRect();return r.left>=c.left-.5&&r.right<=c.right+.5&&r.top>=c.top-.5&&r.bottom<=c.bottom+.5;});
      assert.ok(fits,`${aspect},${count} seats,button${button} is clipped`);
    }
  }
});

test('Client presentation follows decisions rather than narration or decorative controls',async t=>{
  await build();const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto(pathToFileURL(resolve('dist/client.html')).href);await page.waitForFunction(()=>window.__riverReady);
  const p=fixture({locale:'zh-CN'});p.lesson.scenes[0].beats.unshift(...['one','two'].map(id=>({id:'explain-'+id,label:words('Explain'),narration:words('同一个决策，分段讲解。'),hold:8})));
  const plan=compileProject(p,packs),load=async value=>{await page.evaluate(p=>window.riverFrame.load(p),value);await page.evaluate(()=>document.fonts.ready);},render=async index=>page.evaluate(i=>window.riverFrame.render(i),index);await load(plan);
  await t.test('The active seat is visually stable during and across explanation beats',async()=>{
    const [a,b]=plan.frames;await render(a.startFrame+2);const first=await page.locator('.seat.acting').screenshot();await render(a.endFrame-2);assert.equal(await page.evaluate(()=>window.riverFrame.changed),false);assert.deepEqual(await page.locator('.seat.acting').screenshot(),first);await render(b.startFrame+2);assert.equal(await page.evaluate(()=>window.riverFrame.changed),false);assert.deepEqual(await page.locator('.seat.acting').screenshot(),first);assert.equal(await page.locator('.seat.acting').count(),1);
  });
  await t.test('Waiting states have no fictitious bet amount or slider',async()=>{
    await render(0);assert.equal(await page.locator('.bet-slider,.bet-amount').count(),0);assert.match(await page.locator('.bet-controls').innerText(),/等待.*行动/);
  });
  await t.test('An available bet uses one real range control without decorative thumbs',async()=>{
    const f=plan.frames.find(f=>f.state.actor===f.state.hero&&f.state.legalActions.some(a=>['bet','raise'].includes(a.type)));await render(f.startFrame+2);assert.equal(await page.locator('.bet-slider').count(),1);
    const control=await page.locator('.bet-slider').evaluate(el=>({value:el.valueAsNumber,min:Number(el.min),max:Number(el.max),before:getComputedStyle(el,'::before').content,after:getComputedStyle(el,'::after').content,fill:Number(el.style.getPropertyValue('--bet-progress').replace('%',''))}));
    assert.ok(control.value>=control.min&&control.value<=control.max);assert.equal(control.before,'none');assert.equal(control.after,'none');assert.ok(Math.abs(control.fill-(control.value-control.min)/(control.max-control.min)*100)<.01);
  });
  const allin=fixture({locale:'zh-CN'});allin.output.sceneId='allin';allin.lesson.scenes=[{id:'allin',title:words('All-in'),start:{street:'river',board:['2c','2d','2h','3s','3c'],button:'hero',hero:'hero',actor:'oop',seats:[{id:'oop',name:'North',stack:10,contributed:5,hole:['Ah','Ad']},{id:'hero',name:'River',stack:10,contributed:5,hole:['Kh','Kd']}]},beats:[{id:'push',label:words('Push'),actions:[{seat:'oop',type:'allin'}]},{id:'decision',label:words('Decision'),hold:4},{id:'call',label:words('Call'),actions:[{seat:'hero',type:'call'}]},{id:'show',label:words('Show'),actions:[{type:'showdown'}]}]}];const ap=compileProject(allin,packs);
  await t.test('Calling off the stack does not offer the same all-in twice',async()=>{
    await load(ap);const f=ap.frames.find(f=>f.state.actor==='hero'&&f.state.legalActions.some(a=>a.type==='call'));await render(f.startFrame+2);assert.equal(await page.locator('[data-act="call"]').count(),1);assert.equal(await page.locator('[data-act="allin"]').count(),0);assert.equal(await page.locator('.bet-slider').count(),0);assert.match(await page.locator('[data-act="call"]').innerText(),/跟注.*10.*全下/);
  });
  await t.test('Paid-out chips are no longer also shown in the central pot',async()=>{
    await render(ap.frames.at(-2).startFrame+2);const before=await page.locator('.board-cards').boundingBox();await render(ap.totalFrames-1);assert.equal(await page.locator('.pot-label').isVisible(),false);assert.equal(await page.locator('.pot-chips .chip').count(),0);assert.deepEqual(await page.locator('.board-cards').boundingBox(),before);assert.match(await page.locator('.seat-action.won').innerText(),/30/);assert.equal(await page.locator('.bet-slider,.bet-amount').count(),0);assert.match(await page.locator('.bet-controls').innerText(),/本手结束/);
  });
});
