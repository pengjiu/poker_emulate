import test from 'node:test';
import assert from 'node:assert/strict';
import {captionPages,renderFrame,subtitleCues} from '../src/client/render.mjs';
import {fixture,packs} from './helpers.mjs';
import {compileProject} from '../src/compiler.mjs';

test('Unequal caption pages receive reading time proportional to their text',()=>{
  const first='先'.repeat(28)+'。',last='尾'.repeat(12)+'。',pages=captionPages(first+last,false);
  assert.deepEqual(pages.map(p=>p.text),[first,last]);assert.equal(pages[0].startFraction,0);assert.equal(pages[0].endFraction,29/42);assert.equal(pages[1].startFraction,29/42);assert.equal(pages[1].endFraction,1);
  assert.deepEqual(captionPages('',true),[]);
});

test('Long Chinese and English narration retains all text across both layouts',()=>{
  for(const portrait of [false,true])for(const text of ['底池二十，下注十。先算价格，再看范围；一个结果不能证明整套策略。'.repeat(9),'The price of a call and the range behind a bet answer different questions. '.repeat(9)]){
    const pages=captionPages(text,portrait),total=pages.reduce((n,p)=>n+p.text.length,0);assert.ok(pages.length>1);assert.equal(pages.map(p=>p.text).join('').replace(/\s/g,''),text.replace(/\s/g,''));
    assert.equal(pages[0].startFraction,0);assert.equal(pages.at(-1).endFraction,1);
    for(const [i,p]of pages.entries()){assert.ok(p.endFraction>p.startFraction);if(i)assert.equal(p.startFraction,pages[i-1].endFraction);assert.ok(total>0);}
  }
});

test('A sentence that fits a page remains whole rather than leaving a fragment',()=>{
  const sentence='这是针对对手的调整，不能说AQ在这里必然弃牌。';
  const pages=captionPages('先讲清楚范围。'.repeat(5)+sentence,true);
  assert.ok(pages.some(p=>p.text.includes(sentence)));
});

test('Frame rendering keeps a longer page visible and clears captions after audio',()=>{
  const p=compileProject(fixture({sceneId:'button-vs-blind',locale:'zh-CN',captions:true,profile:'final'}),packs),base=structuredClone(p.frames[0]);
  Object.assign(base,{start:0,duration:12,startFrame:0,endFrame:360,narration:'先'.repeat(28)+'。'+'尾'.repeat(12)+'。',audio:{duration:10}});p.frames=[base];p.totalFrames=360;
  assert.match(renderFrame(p,150),new RegExp('先'.repeat(28)));assert.doesNotMatch(renderFrame(p,150),new RegExp('尾'.repeat(12)));
  assert.match(renderFrame(p,285),new RegExp('尾'.repeat(12)));assert.match(renderFrame(p,315),/class="caption-lane"><\/div>/);
});

test('Exported subtitles match the visible pages in both layouts, preserving precise gaps',()=>{
  for(const aspect of ['landscape','portrait'])for(const precise of [false,true]){
    const plan=compileProject(fixture({sceneId:'button-vs-blind',locale:'zh-CN',captions:true,profile:'final',aspect}),packs);
    const text='先看价格，再看范围。'.repeat(40),frame=structuredClone(plan.frames[0]);
    Object.assign(frame,{start:0,end:22,duration:22,startFrame:0,endFrame:660,narration:text,narrationStart:0,narrationDuration:20,audio:{duration:20},captionCues:precise?[{start:1,end:9,text:text.slice(0,text.length/2)},{start:11,end:20,text:text.slice(text.length/2)}]:null});
    plan.frames=[frame];plan.totalFrames=660;
    const cues=subtitleCues(plan);assert.ok(cues.length>2);assert.equal(cues.map(c=>c.text).join(''),text);
    for(const cue of cues)assert.ok(renderFrame(plan,Math.floor((cue.start+cue.end)/2*plan.fps)).includes(`class="caption-text">${cue.text}</span>`));
    if(precise){assert.ok(cues.every(c=>c.end<=9||c.start>=11));assert.match(renderFrame(plan,300),/class="caption-lane"><\/div>/);}
  }
});

test('Short captions retain numeric terms and avoid a tiny final flash',()=>{
  for(const portrait of [false,true]){
    const text='先看对手这枪的价格，再比较我们能赢的那些牌。跟完是18.1BB，4.5除以18.1，门槛约24.86%。',pages=captionPages(text,portrait);
    assert.ok(pages.length>1);assert.equal(pages.map(p=>p.text).join(''),text);
    assert.ok(pages.some(p=>p.text.includes('24.86%')));assert.equal(pages.flatMap(p=>p.text.match(/18\.1/g)??[]).length,2);
    assert.ok([...pages.at(-1).text].length>=8);
  }
});

test('Balancing an English tail preserves spaces inside the redistributed pages',()=>{
  const text='Consider the range before calling this bet. The price changed.',pages=captionPages(text,true);
  assert.ok(pages.some(p=>p.text.includes('price changed.')));assert.ok(pages.every(p=>!p.text.includes('pricechanged')));
  assert.equal(pages.map(p=>p.text).join('').replace(/\s/g,''),text.replace(/\s/g,''));
});

test('Caption speaker identity follows the current turn, escapes text and clears with narration',()=>{
  const plan=compileProject(fixture({sceneId:'button-vs-blind',locale:'zh-CN',captions:true,profile:'final'}),packs),frame=structuredClone(plan.frames[0]);
  Object.assign(frame,{start:0,duration:3,startFrame:0,endFrame:90,narration:'这次先看哪些更差的牌会跟。',narrationStart:0,narrationDuration:2,audio:null,speaker:'老周 <教练>'});plan.frames=[frame];plan.totalFrames=90;
  assert.match(renderFrame(plan,10),/class="caption-speaker">老周 &lt;教练&gt;<\/span>/);assert.doesNotMatch(renderFrame(plan,75),/caption-speaker/);
  frame.speaker='阿哲';assert.match(renderFrame(plan,10),/class="caption-speaker">阿哲<\/span>/);
});
