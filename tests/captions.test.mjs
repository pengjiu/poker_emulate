import test from 'node:test';
import assert from 'node:assert/strict';
import {captionPages,renderFrame} from '../src/client/render.mjs';
import {fixture,packs} from './helpers.mjs';
import {compileProject} from '../src/compiler.mjs';

test('Unequal caption pages receive reading time proportional to their text',()=>{
  const first='先'.repeat(100),last='尾'.repeat(20),pages=captionPages(first+last,false);
  assert.deepEqual(pages.map(p=>p.text),[first,last]);assert.equal(pages[0].startFraction,0);assert.equal(pages[0].endFraction,5/6);assert.equal(pages[1].startFraction,5/6);assert.equal(pages[1].endFraction,1);
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
  const sentence='这是针对对手的调整，不是宣称A皇后在这个牌面上，GTO一定弃牌。';
  const pages=captionPages('先讲清楚范围。'.repeat(5)+sentence,true);
  assert.ok(pages.some(p=>p.text.includes(sentence)));
});

test('Frame rendering keeps a longer page visible and clears captions after audio',()=>{
  const p=compileProject(fixture({sceneId:'button-vs-blind',locale:'zh-CN',captions:true,profile:'final'}),packs),base=structuredClone(p.frames[0]);
  Object.assign(base,{start:0,duration:12,startFrame:0,endFrame:360,narration:'先'.repeat(100)+'尾'.repeat(20),audio:{duration:10}});p.frames=[base];p.totalFrames=360;
  assert.match(renderFrame(p,210),new RegExp('先'.repeat(100)));assert.doesNotMatch(renderFrame(p,210),new RegExp('尾'.repeat(20)));
  assert.match(renderFrame(p,285),new RegExp('尾'.repeat(20)));assert.match(renderFrame(p,315),/class="caption-lane"><\/div>/);
});
