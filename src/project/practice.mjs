import {check,errorJSON} from '../errors.mjs';
import {clone,hash,id} from '../util.mjs';
import {observe,displayState} from '../poker/rules.mjs';
import {resolveDecision,decisionFingerprint} from '../analysis/index.mjs';

function keys(value,allowed,path) {
  check(value&&typeof value==='object'&&!Array.isArray(value),'PRACTICE','Expected an object.',path);
  for(const key of Object.keys(value))check(allowed.includes(key),'UNKNOWN_FIELD',`Unknown practice field: ${key}`,path+'/'+key);
}
const text=(value,path)=>check(typeof value==='string'&&value.trim(),'PRACTICE','Use nonempty text.',path);
function textMap(value,path){keys(value,Object.keys(value??{}),path);check(Object.keys(value).length,'PRACTICE','Provide localized text.',path);for(const [locale,label]of Object.entries(value))text(label,path+'/'+locale);}
const uniqueStrings=(value,path)=>check(Array.isArray(value)&&value.length>0&&value.every(v=>typeof v==='string'&&v.trim())&&new Set(value).size===value.length,'PRACTICE','Use distinct nonempty IDs.',path);
const localized=(map,locale,path)=>{check(typeof map?.[locale]==='string'&&map[locale].trim(),'TRANSLATION_MISSING','Missing selected-language exercise text.',path+'/'+locale);return map[locale];};

export function practiceSchema(value,path='lesson/practice') {
  keys(value,['id','title','questions','attempts'],path);text(value.id,path+'/id');textMap(value.title,path+'/title');
  check(Array.isArray(value.questions)&&value.questions.length>0,'PRACTICE','Provide at least one question.',path+'/questions');
  const seen=new Set();
  for(const [i,q]of value.questions.entries()){
    const p=path+'/questions/'+i;keys(q,['id','sceneId','node','analysisId','prompt','choices','correctChoiceIds','explanation','objective'],p);
    for(const key of ['id','sceneId'])text(q[key],p+'/'+key);check(!seen.has(q.id),'PRACTICE','Question IDs must be unique.',p+'/id');seen.add(q.id);
    keys(q.node,['beatId','actionIndex'],p+'/node');text(q.node.beatId,p+'/node/beatId');
    if(q.node.actionIndex!==undefined)check(Number.isSafeInteger(q.node.actionIndex)&&q.node.actionIndex>=0,'PRACTICE','Use a completed zero-based action.',p+'/node/actionIndex');
    if(q.analysisId!==undefined)text(q.analysisId,p+'/analysisId');
    for(const key of ['prompt','explanation'])textMap(q[key],p+'/'+key);if(q.objective!==undefined)textMap(q.objective,p+'/objective');
    check(Array.isArray(q.choices)&&q.choices.length>=2&&q.choices.length<=12,'PRACTICE','Provide 2–12 choices.',p+'/choices');const choices=new Set();
    for(const [j,choice]of q.choices.entries()){keys(choice,['id','text'],p+'/choices/'+j);text(choice.id,p+'/choices/'+j+'/id');textMap(choice.text,p+'/choices/'+j+'/text');check(!choices.has(choice.id),'PRACTICE','Choice IDs must be unique.',p+'/choices');choices.add(choice.id);}
    uniqueStrings(q.correctChoiceIds,p+'/correctChoiceIds');check(q.correctChoiceIds.every(id=>choices.has(id)),'PRACTICE','Every correct answer must name an existing choice.',p+'/correctChoiceIds');
  }
  if(value.attempts!==undefined){check(Array.isArray(value.attempts),'PRACTICE','Attempts must be an array.',path+'/attempts');const ids=new Set();
    for(const [i,a]of value.attempts.entries()){const p=path+'/attempts/'+i;keys(a,['id','questionId','questionHash','choiceIds','correct','learnerId','answeredAt'],p);for(const key of ['id','questionId','learnerId','answeredAt'])text(a[key],p+'/'+key);check(!ids.has(a.id),'PRACTICE','Attempt IDs must be unique.',p+'/id');ids.add(a.id);uniqueStrings(a.choiceIds,p+'/choiceIds');check(/^[a-f0-9]{64}$/.test(a.questionHash)&&typeof a.correct==='boolean'&&Number.isFinite(Date.parse(a.answeredAt)),'PRACTICE','Attempt version, result and time are required.',p);}
  }
}
function questionContext(project,question) {
  const scene=project.lesson.scenes.find(s=>s.id===question.sceneId);check(scene,'SCENE_UNKNOWN','Practice references a missing scene.','practice/'+question.id+'/sceneId');
  const state=resolveDecision(scene,question.node),decisionHash=decisionFingerprint(scene,question.node);
  const material=question.analysisId?scene.analysis?.find(a=>a.id===question.analysisId):null;
  check(!question.analysisId||material,'ANALYSIS_UNKNOWN','Practice references missing analysis.','practice/'+question.id+'/analysisId');
  if(material)check(decisionFingerprint(scene,material.node)===decisionHash,'PRACTICE_NODE','The practice and its analysis must address the same public decision.','practice/'+question.id+'/analysisId');
  const {review,...analysis}=material??{};
  return {state:displayState(observe(state)),questionHash:hash({question,decisionHash,analysis:material?analysis:null})};
}
export function questionVersion(project,question) { return questionContext(project,question).questionHash; }
export function answerPractice(project,value) {
  keys(value,['questionId','choiceIds','learnerId','answeredAt'],'practice.answer');text(value.questionId,'practice.answer/questionId');uniqueStrings(value.choiceIds,'practice.answer/choiceIds');
  const practice=project.lesson.practice;check(practice,'PRACTICE','No practice set is attached.','lesson/practice');practiceSchema(practice);
  const question=practice.questions.find(q=>q.id===value.questionId);check(question,'PRACTICE_QUESTION','Unknown question.','practice.answer/questionId');
  check(value.choiceIds.every(id=>question.choices.some(c=>c.id===id)),'PRACTICE_CHOICE','The answer contains an unknown choice.','practice.answer/choiceIds');
  const learnerId=value.learnerId??'local',answeredAt=value.answeredAt??new Date().toISOString();text(learnerId,'practice.answer/learnerId');check(Number.isFinite(Date.parse(answeredAt)),'PRACTICE','Use an ISO date for the answer time.','practice.answer/answeredAt');
  const choiceIds=[...value.choiceIds].sort(),expected=[...question.correctChoiceIds].sort();
  return {id:id(),questionId:question.id,questionHash:questionVersion(project,question),choiceIds,correct:hash(choiceIds)===hash(expected),learnerId,answeredAt};
}
export function practiceSummary(project) {
  const practice=project.lesson.practice;if(!practice)return {questions:0,attempts:0,current:0,correct:0,stale:0,results:[]};practiceSchema(practice);
  const versions=new Map(practice.questions.map(q=>[q.id,questionVersion(project,q)])),results=(practice.attempts??[]).map(a=>({...clone(a),current:versions.get(a.questionId)===a.questionHash}));
  const current=results.filter(a=>a.current);
  return {questions:practice.questions.length,attempts:results.length,current:current.length,correct:current.filter(a=>a.correct).length,stale:results.length-current.length,results};
}
export function practiceIssues(project) {
  const practice=project.lesson.practice,issues=[];if(!practice)return issues;practiceSchema(practice);
  for(const question of practice.questions){try{questionContext(project,question);}catch(error){const e=errorJSON(error);issues.push({...e,target:{sceneId:question.sceneId,beatId:question.node.beatId}});}}
  // Old answers are historical records, not a reason to block a new video.
  return issues;
}

const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
/** Self-contained exercise; answer data is offline, but feedback is revealed only after submission. */
export function practiceHTML(project,locale=project.output.locale) {
  const practice=project.lesson.practice;check(practice,'PRACTICE','No practice set is attached.','lesson/practice');practiceSchema(practice);
  const zh=locale.startsWith('zh'),ja=locale.startsWith('ja'),labels=zh?{title:'练习',submit:'提交答案',next:'下一题',again:'重新作答',correct:'回答正确',incorrect:'请再核对条件',select:'请至少选择一项',progress:'题目',saved:'作答记录保存在本机。更改题目后旧记录仍保留，但不计入新版结果。',export:'导出作答记录',multi:'可以选择一项或多项。',history:'本机作答记录',empty:'尚无记录',score:'正确',current:'当前版本',stale:'旧版本',chips:'筹码',pot:'底池',hero:'英雄手牌'}:ja?{title:'練習',submit:'回答する',next:'次の問題',again:'もう一度',correct:'正解',incorrect:'前提を確認してください',select:'選択肢を選んでください',progress:'問題',saved:'回答はこの端末に保存されます。改訂前の回答は新しい結果に含まれません。',export:'回答を出力',multi:'一つ以上選択できます。',history:'回答履歴',empty:'回答はありません',score:'正解',current:'現在の版',stale:'以前の版',chips:'チップ',pot:'ポット',hero:'ヒーローの手札'}:{title:'Practice',submit:'Submit answer',next:'Next question',again:'Try again',correct:'Correct',incorrect:'Review the conditions',select:'Select at least one choice',progress:'Question',saved:'Answers stay on this device. Earlier versions remain in history and do not count toward a revised question.',export:'Export answers',multi:'Select one or more choices.',history:'Answer history',empty:'No answers yet',score:'Correct',current:'Current version',stale:'Earlier version',chips:'chips',pot:'Pot',hero:'Hero cards'};
  labels.actor=zh?'当前行动者':ja?'現在の手番':'Acting player';labels.call=zh?'跟注额':ja?'コール額':'Call amount';
  const streets=zh?{preflop:'翻前',flop:'翻牌',turn:'转牌',river:'河牌'}:ja?{preflop:'プリフロップ',flop:'フロップ',turn:'ターン',river:'リバー'}:{preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River'};
  const questions=practice.questions.map(q=>{const {state,questionHash}=questionContext(project,q);return {id:q.id,version:questionHash,prompt:localized(q.prompt,locale,'practice/'+q.id+'/prompt'),objective:q.objective?localized(q.objective,locale,'practice/'+q.id+'/objective'):null,choices:q.choices.map(c=>({id:c.id,text:localized(c.text,locale,'practice/'+q.id+'/choices/'+c.id)})),correctChoiceIds:q.correctChoiceIds,explanation:localized(q.explanation,locale,'practice/'+q.id+'/explanation'),context:{street:streets[state.street],board:state.board,hero:state.seats.find(s=>s.id===state.hero)?.hole??[],pot:state.pot,toCall:state.legalActions.find(a=>a.type==='call')?.amount??0,actor:state.seats.find(s=>s.id===state.actor)?.name??'—',unit:state.unit==='chips'?labels.chips:state.unit,seats:state.seats.map(s=>({id:s.id,name:s.name,stack:s.stack,folded:s.folded}))}};});
  const title=localized(practice.title,locale,'practice/title'),payload={id:practice.id,title,locale,labels,questions};
  return `<!doctype html><html lang="${escapeHTML(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#0d1720;color:#e9f2f7;font:17px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:900px;margin:36px auto;padding:0 22px}h1{font-size:30px;margin-bottom:10px}.muted{color:#9fb4c5}section{background:#162632;border:1px solid #304654;border-radius:18px;padding:24px;margin:22px 0}.context{display:flex;flex-wrap:wrap;gap:12px 28px;color:#b8dacf}.cards{font-size:24px;letter-spacing:4px}.choices{display:grid;gap:12px}label{display:flex;gap:12px;padding:14px;background:#1c3443;border:1px solid #3b5362;border-radius:10px;cursor:pointer}input{width:20px;height:20px;margin-top:5px;flex-shrink:0}button{padding:11px 20px;background:#8bd9b6;color:#112b25;border:0;border-radius:9px;font:inherit;cursor:pointer;margin:8px 12px 8px 0}button:disabled{opacity:.5;cursor:default}#feedback{border-left:4px solid #8bd9b6;padding:12px 18px;background:#213a38;margin-top:20px}#feedback[hidden]{display:none}ul{padding-left:22px}.history-row{font-size:14px;border-bottom:1px solid #304654;padding:8px 0}.bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}#notice{color:#ffc87a}@media(max-width:500px){main{margin:20px auto;padding:0 14px}section{padding:18px}h1{font-size:25px}}
</style></head><body><main><h1>${escapeHTML(title)}</h1><p class="muted">${escapeHTML(labels.saved)}</p><section><div class="bar"><strong id="progress"></strong><span id="objective" class="muted"></span></div><div id="context" class="context"></div><h2 id="prompt"></h2><p class="muted">${escapeHTML(labels.multi)}</p><form id="form"><div id="choices" class="choices"></div><button id="submit" type="submit">${escapeHTML(labels.submit)}</button><span id="notice" role="status"></span></form><div id="feedback" hidden aria-live="polite"><strong id="result"></strong><p id="explanation"></p></div><button id="next" hidden>${escapeHTML(labels.next)}</button><button id="again" hidden>${escapeHTML(labels.again)}</button></section><section><div class="bar"><h2>${escapeHTML(labels.history)}</h2><button id="export">${escapeHTML(labels.export)}</button></div><div id="history"></div></section></main><script id="practice-data" type="application/json">${safeJSON(payload)}</script><script>
(()=>{'use strict';const data=JSON.parse(document.getElementById('practice-data').textContent),L=data.labels,key='river-practice:'+data.id;let index=0,records=[];const el=id=>document.getElementById(id);try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))records=saved.filter(r=>r&&typeof r.questionId==='string'&&typeof r.version==='string'&&Array.isArray(r.choices)&&typeof r.correct==='boolean');}catch{}
function history(){const box=el('history');box.replaceChildren();if(!records.length){box.textContent=L.empty;return;}for(const r of records.slice().reverse()){const node=document.createElement('div');node.className='history-row';const q=data.questions.find(q=>q.id===r.questionId),current=q&&q.version===r.version;node.textContent=[r.answeredAt,r.questionId,r.correct?L.correct:L.incorrect,current?L.current:L.stale].join(' · ');box.append(node);}}
function show(){const q=data.questions[index];el('progress').textContent=L.progress+' '+(index+1)+' / '+data.questions.length;el('objective').textContent=q.objective||'';el('prompt').textContent=q.prompt;el('context').replaceChildren();for(const text of [q.context.street,L.hero+': '+q.context.hero.join(' '),q.context.board.join(' '),L.pot+': '+q.context.pot+' '+q.context.unit,L.actor+': '+q.context.actor,L.call+': '+q.context.toCall+' '+q.context.unit]){const span=document.createElement('span');span.textContent=text;el('context').append(span);}el('choices').replaceChildren();for(const choice of q.choices){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.name='choice';input.value=choice.id;text.textContent=choice.text;label.append(input,text);el('choices').append(label);}el('feedback').hidden=true;el('result').textContent='';el('explanation').textContent='';el('next').hidden=true;el('again').hidden=true;el('notice').textContent='';el('submit').disabled=false;}
el('form').addEventListener('submit',event=>{event.preventDefault();if(el('submit').disabled)return;const q=data.questions[index],choices=Array.from(document.querySelectorAll('input[name=choice]:checked'),input=>input.value).sort();if(!choices.length){el('notice').textContent=L.select;return;}const correct=JSON.stringify(choices)===JSON.stringify(q.correctChoiceIds.slice().sort()),record={questionId:q.id,version:q.version,choices,correct,answeredAt:new Date().toISOString()};records.push(record);try{localStorage.setItem(key,JSON.stringify(records));}catch{}el('notice').textContent='';el('result').textContent=correct?L.correct:L.incorrect;el('explanation').textContent=q.explanation;el('feedback').hidden=false;el('submit').disabled=true;for(const input of document.querySelectorAll('input[name=choice]'))input.disabled=true;el('next').hidden=index===data.questions.length-1;el('again').hidden=false;history();});el('next').addEventListener('click',()=>{index++;show();});el('again').addEventListener('click',show);el('export').addEventListener('click',()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({practiceId:data.id,attempts:records},null,2)],{type:'application/json'}));a.download='practice-answers.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);});show();history();})();
</script></body></html>`;
}
