import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {newProject} from '../src/project/store.mjs';
import {compileProject} from '../src/compiler.mjs';
import {localePacks} from '../src/locales.mjs';
import {build} from './build.mjs';
const words=x=>({'zh-CN':x,'en-US':x,'ja-JP':x});
function layoutScene(n){
  const board=['Ac','Kd','7h','2s','3c'],hands=[['Ah','Ad'],['Kh','Ks'],['Qh','Qd']],used=new Set([...board,...hands.flat()]),deck=[];
  for(const r of '23456789TJQKA')for(const s of 'cdhs')if(!used.has(r+s))deck.push(r+s);
  const seats=Array.from({length:n},(_,i)=>({id:`p${i}`,name:i===n-1?'riverpilot':`Player_${i+1}`,stack:i===0?30:i===1?60:i===n-1?100:100,contributed:10,hole:i===0?hands[0]:i===1?hands[1]:i===n-1?hands[2]:[deck.pop(),deck.pop()],folded:![0,1,n-1].includes(i)}));
  const actions=n===2?[{seat:'p0',type:'allin'},{seat:'p1',type:'call'}]:[{seat:'p0',type:'allin'},{seat:'p1',type:'call'},{seat:`p${n-1}`,type:'allin'},{seat:'p1',type:'call'}];
  return {id:`layout-${n}`,title:words('Table'),start:{street:'river',board,button:`p${n-1}`,hero:`p${n-1}`,actor:'p0',seats},beats:[{id:'acting',label:words('Action'),hold:1},...actions.map((a,i)=>({id:'action-'+i,label:words('Action'),actions:[a],hold:1})),{id:'closed',label:words('Closed'),hold:1},{id:'showdown',label:words('Showdown'),actions:[{type:'showdown'}],hold:1}]};
}
export async function visualCheck(out='artifacts/visual'){
  await mkdir(out,{recursive:true});await build();const packs=await localePacks(),browser=await chromium.launch({headless:true}),results=[];
  try{
    const page=await browser.newPage();await page.goto(pathToFileURL(resolve('dist/client.html')).href);await page.waitForFunction(()=>window.__riverReady);
    for(const count of [2,3,6,9])for(const locale of Object.keys(packs))for(const aspect of ['landscape','portrait'])for(const captions of [false,true]){
      const scene=layoutScene(count),project=newProject({scenes:[scene]},{locale,aspect,captions});let plan=compileProject(project,packs);
      // Layout test uses authored text only; no audio output is claimed here.
      for(const f of plan.frames)f.narration=packs[locale].strings.ruleNote;
      await page.setViewportSize({width:plan.width,height:plan.height});await page.evaluate(p=>window.riverFrame.load(p),plan);
      for(const phase of ['acting','closed','showdown']){
        const f=plan.frames.find(f=>f.beatId===phase),index=Math.min(f.endFrame-1,f.startFrame+12);await page.evaluate(i=>window.riverFrame.render(i),index);
        const violations=await page.evaluate(()=>{
          const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
          const bad=[],panels=[...document.querySelectorAll('.seat-panel')].map(rect),cards=rect(document.querySelector('.board-cards')),controls=rect(document.querySelector('.bet-controls'));
          for(const [i,p]of panels.entries()){if(p.x<-.5||p.y<-.5||p.right>innerWidth+.5||p.bottom>innerHeight+.5)bad.push('seat-bounds-'+i);if(overlap(p,cards))bad.push('board-seat-'+i);if(overlap(p,controls))bad.push('controls-seat-'+i);for(let j=i+1;j<panels.length;j++)if(overlap(p,panels[j]))bad.push('seats-'+i+'-'+j);}
          const caption=document.querySelector('.caption-lane');if(caption){const r=rect(caption);if(caption.scrollHeight>caption.clientHeight+1)bad.push('caption-overflow');for(const [i,p]of panels.entries())if(overlap(r,p))bad.push('caption-seat-'+i);if(overlap(r,controls))bad.push('caption-controls');}
          const seats=[...document.querySelectorAll('.seat')];
          for(const e of document.querySelectorAll('.dealer')){const r=rect(e),c=rect(e.closest('.client'));if(r.x<c.x-.5||r.right>c.right+.5||r.y<c.y-.5||r.bottom>c.bottom+.5)bad.push('dealer-bounds');}
          for(const e of document.querySelectorAll('.seat-action')){const r=rect(e);if(r.x<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)bad.push('action-bounds-'+e.textContent);if(overlap(r,cards))bad.push('board-action');if(overlap(r,controls))bad.push('controls-action');for(const [i,p]of panels.entries())if(seats[i]!==e.closest('.seat')&&overlap(r,p))bad.push('action-over-other-seat-'+i);}
          return bad;
        });
        const name=`${count}-${locale}-${aspect}-${phase}-${captions?'captions':'clean'}`;results.push({name,status:violations.length?'FAIL':'PASS',violations});
        if(violations.length||count===9&&locale==='ja-JP'&&aspect==='portrait'||count===6&&locale==='zh-CN'&&phase==='acting')await page.screenshot({path:join(out,name+'.png')});
      }
    }
    const actionChecks=[];
    for(const count of [2,3,6,9])for(const locale of Object.keys(packs))for(const aspect of ['portrait','landscape']){
      const project=newProject({scenes:[layoutScene(count)]},{locale,aspect,captions:true}),plan=compileProject(project,packs);await page.setViewportSize({width:plan.width,height:plan.height});await page.evaluate(p=>window.riverFrame.load(p),plan);
      for(const frame of plan.frames){await page.evaluate(i=>window.riverFrame.render(i),Math.min(frame.endFrame-1,frame.startFrame+12));
        const violations=await page.evaluate(()=>{
          const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
          const blockers=[...document.querySelectorAll('.hole-cards,.board-cards,.seat-panel,.seat-action,.pot-chips .chip')],bad=[];
          for(const e of document.querySelectorAll('.pots-list span,.bet-bubble'))for(const b of blockers)if(overlap(e.getBoundingClientRect(),b.getBoundingClientRect()))bad.push(e.textContent+' overlaps '+b.className);
          return bad;
        });const name=`chips-${count}-${locale}-${aspect}-${frame.id}`;actionChecks.push({name,status:violations.length?'FAIL':'PASS',violations});if(violations.length)await page.screenshot({path:join(out,name.replaceAll(':','-')+'.png')});
      }
    }
    const phoneChecks=[];
    for(const captions of [false,true]){
      const s=layoutScene(9);s.start.seats[3].name='Extremely_Long_Player_Nickname';s.start.seats[3].stack=1234567.89;
      const p=newProject({scenes:[s]},{locale:'ja-JP',aspect:'portrait',profile:'final',captions}),plan=compileProject(p,packs);for(const f of plan.frames)f.narration=packs['ja-JP'].strings.ruleNote;
      await page.setViewportSize({width:plan.width,height:plan.height});await page.evaluate(p=>window.riverFrame.load(p),plan);await page.evaluate(i=>window.riverFrame.render(i),plan.frames.at(-1).startFrame+12);
      const sizes=await page.evaluate(()=>{
        const client=document.querySelector('.client'),scale=client.getBoundingClientRect().width/client.offsetWidth*360/innerWidth;
        return [...document.querySelectorAll('.nickname,.balance,.hole-cards .rank,.board-cards .rank,.seat-action,.pot-label strong,.action-buttons button')].filter(e=>e.textContent.trim()).map(e=>({selector:e.className||e.tagName,text:e.textContent,fontAt360:parseFloat(getComputedStyle(e).fontSize)*scale}));
      });
      const violations=sizes.filter(x=>x.fontAt360<11.95);phoneChecks.push({captions,status:violations.length?'FAIL':'PASS',violations});
      await page.screenshot({path:join(out,`phone-final-${captions?'captions':'clean'}.png`)});
    }
    await writeFile(join(out,'report.json'),JSON.stringify({checks:results.length,passed:results.filter(r=>r.status==='PASS').length,results,phoneChecks,actionChecks},null,2)+'\n');return [...results,...phoneChecks,...actionChecks];
  }finally{await browser.close();}
}
if(process.argv[1]===new URL(import.meta.url).pathname){const results=await visualCheck(process.argv[2]);console.log(JSON.stringify({checks:results.length,failed:results.filter(r=>r.status==='FAIL')}));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;}
