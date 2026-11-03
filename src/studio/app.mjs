import {renderFrame,layoutFrame,prepareArtwork,unitLabel,betPreset,frameAt,narrationAt,esc,icon,clock} from '/client/render.mjs';
import {advancedMarkup,handleAdvanced} from '/studio/advanced.mjs';
import {workflowMarkup,handleWorkflow} from '/studio/workflow.mjs';
const app=document.getElementById('app'),viewMode=new URLSearchParams(location.search).get('view'),viewing=['client','output'].includes(viewMode),cleanClient=viewMode==='client';
document.body.classList.toggle('viewer',viewing);
let snapshot,frameIndex=0,selectedSeat=null,collapsed=false,playing=false,raf,started=0,audio=null,audioFrame=null,audioStart=0,lastCursor=null,inspectedBeat=null,requestBusy=false,betDraft=null,playRequest=0,advancedToolsOpen=false,exportPresetId='',exportStarting=false;
const t=k=>snapshot?.dictionary.strings[k]??k;
const current=()=>snapshot.plan?frameAt(snapshot.plan,frameIndex):null;
const scene=()=>snapshot.project.lesson.scenes.find(s=>s.id===(current()?.sceneId??snapshot.project.output.sceneId));
const rawBeat=()=>{const s=scene();return [...s.beats,...(s.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===current()?.beatId);};
async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','x-river-token':window.RIVER_TOKEN},body:JSON.stringify(body)});const data=await r.json();if(!data.ok)throw data.error;return data.value??data;}
async function rpc(method,params={}){return post('/api/rpc',{method,params});}
function notify(error){const messages=snapshot?.dictionary.errors??{};const el=document.createElement('div');el.className='toast';el.textContent=(messages[error.code]??messages.default??error.message)+' '+(error.code?`[${error.code}]`:'');document.body.append(el);setTimeout(()=>el.remove(),6000);}
function stop(){playRequest++;playing=false;cancelAnimationFrame(raf);audio?.pause();audio=null;audioFrame=null;}
async function refresh(force=false){
  const next=await (await fetch('/api/snapshot')).json();
  const changed=force||!snapshot||snapshot.project.revision!==next.project.revision;
  const moved=next.observation.frame!==lastCursor;lastCursor=next.observation.frame;
  if(changed||moved){stop();if(snapshot?.project.output.sceneId!==next.project.output.sceneId)selectedSeat=null;snapshot=next;if(next.plan)try{await prepareArtwork(next.plan);}catch(error){notify({code:'ARTWORK_INVALID',message:error.message});}const f=next.plan?.frames.find(f=>f.id===next.observation.frame);frameIndex=f?.startFrame??0;render();}
  else{snapshot.job=next.job;snapshot.voice=next.voice;const node=document.getElementById('job-status');if(node)node.innerHTML=jobMarkup();const voice=document.getElementById('voice-status');if(voice)voice.innerHTML=voiceJobMarkup();updateVoiceControls();}
}
async function apply(commands){stop();requestBusy=true;try{await rpc('apply',{requestId:crypto.randomUUID(),expectedRevision:snapshot.project.revision,commands});await refresh(true);}finally{requestBusy=false;}}
async function seek(id){stop();await rpc('seek',{frameId:id,view:'director'});await refresh(true);}
function followTimeline(){
  const strip=document.querySelector('.beat-timeline'),active=strip?.querySelector('.beat-chip.active');
  if(!active||strip.dataset.activeFrame===active.dataset.frame)return;
  strip.dataset.activeFrame=active.dataset.frame;const a=active.getBoundingClientRect(),b=strip.getBoundingClientRect();
  if(a.left<b.left||a.right>b.right)strip.scrollLeft+=a.left-b.left-(b.width-a.width)/2;
}
function paint(){if(!snapshot.plan)return;if(!viewing&&inspectedBeat!==JSON.stringify([current().sceneId,current().entryId,current().beatId])){selectedSeat=null;document.querySelector('.inspector').innerHTML=inspector();document.getElementById('scene-select').value=scene().id;document.getElementById('branch-select').innerHTML=`<option value="">${t('main')}</option>${(scene().branches??[]).map(b=>`<option value="${esc(b.id)}" ${b.id===current().branchId?'selected':''}>${esc(b.label[snapshot.project.output.locale]??'…')}</option>`).join('')}`;}const target=viewing?app:document.getElementById('stage');target.innerHTML=renderFrame(snapshot.plan,frameIndex,{editing:!viewing&&!playing,betDraft,...(cleanClient?{presentation:false,captions:false}:{})});layoutFrame(target);if(!viewing){const time=document.getElementById('time-display');if(time)time.textContent=clock(frameIndex/snapshot.plan.fps)+' / '+clock(snapshot.plan.duration);document.querySelectorAll('[data-frame]').forEach(b=>b.classList.toggle('active',b.dataset.frame===current().id));followTimeline();}}
async function play(){
  if(playing){stop();render();return;}if(!snapshot.plan)return;if(frameIndex>=snapshot.plan.totalFrames-1)frameIndex=0;
  const ticket=++playRequest,revision=snapshot.project.revision,mixed=!!snapshot.plan.sound;let preview;
  if(mixed){const button=app.querySelector('[data-ui="play"]');if(button){button.disabled=true;button.textContent='…';}try{preview=await post('/api/audio',{});}finally{if(button)button.disabled=false;}if(ticket!==playRequest||revision!==snapshot.project.revision)return;}
  playing=true;started=performance.now()-frameIndex/snapshot.plan.fps*1000;render();
  if(mixed){audio=new Audio(preview.url);audioStart=0;audioFrame='__mix__';audio.currentTime=frameIndex/snapshot.plan.fps;const source=audio;source.addEventListener('error',()=>{if(audio===source){stop();render();notify({code:'AUDIO_PLAYBACK'});}});try{await audio.play();}catch(error){stop();render();throw error;}}
  const step=()=>{const now=performance.now();if(audio&&!audio.ended)started=now-(audioStart+audio.currentTime)*1000;frameIndex=Math.floor((now-started)/1000*snapshot.plan.fps);if(frameIndex>=snapshot.plan.totalFrames){frameIndex=snapshot.plan.totalFrames-1;stop();render();return;}paint();
    if(!mixed){const cue=narrationAt(snapshot.plan,frameIndex);if(audioFrame!==(cue?.id??null)){audio?.pause();audio=null;audioFrame=cue?.id??null;if(cue?.audio){audio=new Audio('/'+cue.audio.path);audioStart=cue.start;audio.currentTime=Math.max(0,frameIndex/snapshot.plan.fps-cue.start);const source=audio,failed=e=>{if(!playing||audio!==source)return;stop();render();notify(e);};source.addEventListener('error',()=>failed({code:'AUDIO_PLAYBACK'}));source.play().catch(failed);}}}
    raf=requestAnimationFrame(step);};raf=requestAnimationFrame(step);
}
const toolContext=()=>({snapshot,current:current(),scene:scene(),beat:rawBeat(),locale:snapshot.project.output.locale,advancedToolsOpen,t,apply,modal,notify,rpc,post,refresh});

function jobMarkup(){const j=snapshot.job;if(!j)return '';if(j.status==='running'){const p=j.progress;return `<span>${t(j.phase==='voice'?'voiceExportGenerating':'rendering')} ${p?.totalFrames?Math.round(100*p.frame/p.totalFrames)+'%':''}</span> <button data-ui="cancel-render">${t('cancelRender')}</button>`;}if(j.status==='complete')return `<a href="${j.videoUrl}" target="_blank">${t('completed')} ↗</a>`;return `<span>${t('failed')} · ${esc(snapshot.dictionary.errors[j.error.code]??j.error.code)}</span>`;}
function voiceJobMarkup(){const v=snapshot.voice,j=v?.job;if(j?.status==='committing')return t('voiceSaving');if(j?.status==='running')return `${t('voiceGenerating')} ${j.total?Math.min(j.index+1,j.total)+' / '+j.total:t('voicePreparing')} <button data-ui="voice-cancel">${t('cancelRender')}</button>`;if(j?.status==='failed')return `${t('failed')} · ${esc(snapshot.dictionary.errors[j.error?.code]??t('voiceFailure'))}`;if(j?.status==='cancelled')return t('voiceCancelled');return v?.available?`${t('voiceLocalReady')}${j?.status==='complete'?' · '+t('completed'):''}`:`${t('voiceNotInstalled')} <a href="https://github.com/index-tts/index-tts/blob/main/docs/README_zh.md" target="_blank" rel="noreferrer">IndexTTS ↗</a>`;}
const voiceStyles={natural:[.12,0,0,0,0,0,.06,.55],focused:[.05,0,0,0,0,0,0,.85],engaged:[.35,0,0,0,0,0,.15,.4]};
function voiceValues(b,local=false){const p=snapshot.project.voice?.[snapshot.project.output.locale]??{},overrides=local?b?.delivery?.[snapshot.project.output.locale]??{}:{};return {...(snapshot.voice?.defaults??{emotion:voiceStyles.natural,emotionStrength:.5,speed:1,pronunciations:{}}),...p,...overrides,pronunciations:{...p.pronunciations,...overrides.pronunciations}};}
const voiceBusy=()=>exportStarting||snapshot.job?.status==='running'||['running','committing'].includes(snapshot.voice?.job?.status);
function selectedVoicePreset(profile){return snapshot.voice?.presets?.find(p=>p.sha256===profile.referenceAssetId)?.id??'';}
function presetOptions(selected){return (snapshot.voice?.presets??[]).map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''} ${p.available?'':'disabled'}>${esc(p.name[snapshot.project.output.locale]??p.id)}${p.available?'':' · '+t('voicePresetUnavailable')}</option>`).join('');}
function referencePreview(presetId,profile){const preset=snapshot.voice?.presets?.find(p=>p.id===presetId),ref=snapshot.project.assets[profile.referenceAssetId],src=preset?.available?preset.previewUrl:ref?'/'+ref.path:null;return src?`<audio class="voice-preview" controls preload="metadata" src="${esc(src)}" aria-label="${t('voiceReference')}"></audio>`:'';}
function updateReferencePreview(){const preset=document.getElementById('voice-preset'),target=document.getElementById('voice-reference-preview');if(preset&&target)target.innerHTML=referencePreview(preset.value,voiceValues(rawBeat(),document.getElementById('voice-local').checked));}
function exportReady(){
  if(voiceBusy())return false;
  if(!exportPresetId)return snapshot.observation.readiness.ready;
  return !!snapshot.voice?.available&&snapshot.voice.presets?.some(p=>p.id===exportPresetId&&p.available)&&snapshot.observation.readiness.issues.every(i=>['AUDIO_MISSING','AUDIO_STALE'].includes(i.code));
}
function updateVoiceControls(){document.querySelectorAll('[data-ui="voice-generate"],[data-ui="voice-route"]').forEach(b=>b.disabled=!snapshot.voice?.available||voiceBusy()||(b.dataset.ui==='voice-generate'&&!(document.getElementById('narration')?.value??'').trim()));const button=app.querySelector('[data-ui="render"]');if(button)button.disabled=!exportReady();const choice=document.getElementById('export-voice');if(choice)choice.disabled=voiceBusy();}
function voiceMarkup(b){
  const locale=snapshot.project.output.locale,local=!!b?.delivery?.[locale],p=voiceValues(b,local),ref=p.referenceAssetId?snapshot.project.assets[p.referenceAssetId]:null,currentAudio=b?.audio?.[locale],asset=currentAudio?snapshot.project.assets[currentAudio.assetId]:null;
  const emotion=p.emotion??voiceStyles.natural,style=Object.keys(voiceStyles).find(k=>JSON.stringify(voiceStyles[k])===JSON.stringify(emotion))??'custom',disabled=!snapshot.voice?.available||voiceBusy(),presetId=selectedVoicePreset(p);
  return `<div class="section-label">${t('voiceTitle')} <small>IndexTTS 2.5</small></div><div id="voice-status" class="quiet voice-status" aria-live="polite">${voiceJobMarkup()}</div><div class="voice-actions"><button data-ui="voice-generate" ${disabled||!b?.narration?.[locale]?.trim()?'disabled':''}>${t('voiceGenerate')}</button><button data-ui="voice-route" ${disabled?'disabled':''}>${t('voiceCompleteRoute')}</button></div>${asset?`<audio class="voice-preview" controls preload="metadata" src="/${esc(asset.path)}" aria-label="${t('voicePreview')}"></audio>`:''}<details class="voice-settings"><summary>${t('voiceSettings')}</summary><label>${t('voicePreset')}<select id="voice-preset"><option value="">${t('voiceKeepReference')}</option>${presetOptions(presetId)}</select></label><p class="quiet">${t('voicePresetHelp')}</p><div id="voice-reference-preview">${referencePreview(presetId,p)}</div><button class="audio-row" data-ui="voice-reference">${icon('music')} ${ref?t('voiceReferenceReady'):t('voiceDefaultReference')}</button><label class="voice-scope"><span>${t('voiceOnlyBeat')}</span><input id="voice-local" type="checkbox" ${local?'checked':''}></label><label>${t('voiceStyle')}<select id="voice-style">${['natural','focused','engaged','custom'].map(k=>`<option value="${k}" ${style===k?'selected':''}>${t('voiceStyle_'+k)}</option>`).join('')}</select></label><label>${t('voiceSpeed')}<input id="voice-speed" type="number" min=".5" max="2" step=".05" value="${p.speed??1}"></label><label>${t('voiceEmotionStrength')}<input id="voice-strength" type="range" min="0" max="1" step=".05" value="${p.emotionStrength??.5}"></label><details><summary>${t('voicePronunciation')}</summary><p class="quiet">${t('voicePronunciationHelp')}</p><textarea id="voice-pronunciations" rows="3">${esc(Object.entries(p.pronunciations??{}).map(([k,v])=>k+'='+v).join('\n'))}</textarea><label>${t('voiceEmotionVector')}<input id="voice-emotion" value="${esc(JSON.stringify(emotion))}"></label></details><button class="save-text" data-ui="voice-save">${t('save')}</button></details><button class="audio-row" data-ui="audio" ${b?'':'disabled'}>${icon('download')} ${t('chooseAudio')}</button>`;
}
function directionMarkup(){
  const locale=snapshot.project.output.locale,local=!!scene()?.direction,direction=scene()?.direction??snapshot.project.direction,p=direction?.profile;
  return `<details class="voice-settings direction-settings"><summary>${t('directionTitle')} · ${esc(p?.name[locale]??t('directionNone'))}</summary><label>${t('directionPattern')}<select id="direction-pattern"><option value="">${t('directionChoose')}</option>${snapshot.patterns.patterns.map(item=>`<option value="${esc(item.id)}" ${direction?.origin?.patternId===item.id?'selected':''}>${esc(item.name[locale])}</option>`).join('')}</select></label><label class="voice-scope"><span>${t('directionOnlyScene')}</span><input id="direction-local" type="checkbox" ${local?'checked':''}></label>${p?`<p>${esc(p.summary[locale]??'')}</p><ol>${(p.guidance[locale]??[]).map(item=>`<li>${esc(item)}</li>`).join('')}</ol><details><summary>${t('directionChecks')}</summary><ul>${(p.checks[locale]??[]).map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details><button data-ui="direction-voice">${t('directionVoice')}</button><button data-ui="direction-custom">${t('directionCustom')}</button><button class="ghost" data-ui="direction-clear">${t('directionClear')}</button>`:''}<p class="quiet">${t('directionHelp')}</p></details>`;
}
function directionCommand(value){return {type:'direction.set',...(document.getElementById('direction-local')?.checked?{sceneId:scene().id}:{}),value};}
async function setDirection(value){const commands=[],b=rawBeat(),text=document.getElementById('narration')?.value,locale=snapshot.project.output.locale;if(text?.trim()&&text!==b?.narration?.[locale])commands.push({type:'narration.set',sceneId:scene().id,beatId:b.id,locale,text});commands.push(directionCommand(value));await apply(commands);}
function editSequence(){const value=snapshot.project.output.sequence??[{id:'part-1',sceneId:scene().id,branchId:current()?.branchId??null}];modal(t('sequence'),`<p>${t('sequenceHelp')}</p><textarea>${esc(JSON.stringify(value,null,2))}</textarea>`,async el=>apply([{type:'output.set',value:{sequence:JSON.parse(el.querySelector('textarea').value)}}]));}
function editTiming(){
  const b=rawBeat(),sceneId=scene().id,locale=snapshot.project.output.locale;
  const value=Object.hasOwn(b.timing?.overrides??{},locale)?b.timing.overrides[locale]:b.timing?.actions?{actions:b.timing.actions,narration:b.timing.narration??0}:null;
  const layer=modal(t('timing'),`<p>${t('timingHelp')}</p>${value===null?`<button data-enable-timing>${t('createTiming')}</button>`:''}<textarea>${esc(JSON.stringify(value,null,2))}</textarea><details><summary>${t('captionTiming')}</summary><p>${t('captionTimingHelp')}</p><textarea data-caption-cues>${esc(JSON.stringify(b.captionCues?.[locale]?.cues??null,null,2))}</textarea></details>`,async el=>{
    const timing=JSON.parse(el.querySelector('textarea').value),cues=JSON.parse(el.querySelector('[data-caption-cues]').value);
    await apply([{type:'timing.set',sceneId,beatId:b.id,value:{locale,timing}},{type:'captions.set',sceneId,beatId:b.id,value:{locale,cues}}]);
  });
  const create=layer.querySelector('[data-enable-timing]');if(create)create.onclick=()=>{layer.querySelector('textarea').value=JSON.stringify({actions:(b.actions??[]).map((_,i)=>i*(b.actionHold??.7)),narration:0},null,2);create.remove();};
}
const revealOptions=['range','calculation','conditions','takeaway','evidence','metrics','comparison'];
const revealLabel=key=>key==='metrics'?({'zh-CN':'计算与模型','en-US':'Metrics and models','ja-JP':'計算とモデル'}[snapshot.project.output.locale]??'Metrics'):key==='comparison'?({'zh-CN':'路线对照','en-US':'Route comparison','ja-JP':'ライン比較'}[snapshot.project.output.locale]??'Comparison'):t({range:'teachingRangeGroups',calculation:'teachingPrice',conditions:'teachingConditions',takeaway:'teachingTakeaway',evidence:'teachingEvidence',metrics:'advancedMetrics',comparison:'advancedComparison'}[key]);
function revealChecks(selected,name='presentation-show'){
  return `<div class="teaching-checks">${revealOptions.map(key=>`<label><input type="checkbox" name="${name}" value="${key}" ${selected.includes(key)?'checked':''}>${revealLabel(key)}</label>`).join('')}</div>`;
}
function teachingMarkup(b){
  if(!b)return '';
  const p=b.presentation,locale=snapshot.project.output.locale,analysis=scene().analysis??[],a=analysis.find(item=>item.id===p?.analysisId),resolved=current()?.presentation?.analysis,focus=p?.focus??[],state=p?.surface==='analysis'&&resolved?resolved.decision:current().state;
  const cards=[...new Set([...state.board,...state.seats.flatMap(seat=>seat.hole).filter(Boolean)])];
  const anchors=[['hero',t('hole')],['board',t('board')],['pot',t('pot')],...state.seats.map(seat=>['seat:'+seat.id,seat.name]),...cards.map(card=>['card:'+card,card])];
  for(const target of focus)if(!anchors.some(([value])=>value===target))anchors.push([target,target]);
  return `<details class="teaching-settings" ${p?'open':''}><summary>${t('teachingTitle')} · ${t(p?.surface==='analysis'?'teachingAnalysis':p?'teachingTable':'teachingNone')}</summary><label>${t('teachingSurface')}<select id="presentation-surface"><option value="none" ${!p?'selected':''}>${t('teachingNone')}</option><option value="table" ${p?.surface==='table'?'selected':''}>${t('teachingTable')}</option><option value="analysis" ${p?.surface==='analysis'?'selected':''}>${t('teachingAnalysis')}</option></select></label><label>${t('teachingMaterial')}<select id="presentation-analysis"><option value="">${t('teachingNoMaterial')}</option>${analysis.map(item=>`<option value="${esc(item.id)}" ${item.id===p?.analysisId?'selected':''}>${esc(item.title?.[locale]??item.id)}</option>`).join('')}</select></label><label>${t('teachingHeading')}<input id="presentation-title" value="${esc(p?.title?.[locale]??'')}" maxlength="140"></label><label>${t('teachingPrompt')}<textarea id="presentation-question" rows="2">${esc(p?.question?.[locale]??'')}</textarea></label><div class="section-label">${t('teachingFocus')}</div><div class="teaching-checks">${anchors.map(([value,label])=>`<label><input type="checkbox" name="presentation-focus" value="${esc(value)}" ${focus.includes(value)?'checked':''}>${esc(label)}</label>`).join('')}</div><div class="section-label">${t('teachingShow')}</div>${revealChecks(p?.show??['range','calculation','conditions'])}<button class="save-text" data-ui="save-presentation">${t('save')}</button>${p?`<button class="teaching-cues" data-ui="presentation-cues">${t('teachingCues')}</button>`:''}${a?`<div class="teaching-state ${resolved?.status==='current'||resolved?.status==='reviewed'?'':'needs-review'}">● ${t(resolved?.status==='current'||resolved?.status==='reviewed'?'teachingReviewed':'teachingNeedsReview')}</div><button class="teaching-review" data-ui="analysis-confirm">${t('teachingReview')}</button><p class="quiet">${t('teachingReviewHelp')}</p><button class="teaching-review ghost" data-ui="analysis-seek">${t('teachingReplay')}</button>`:''}</details>`;
}
async function savePresentation(){
  const b=rawBeat(),locale=snapshot.project.output.locale,surface=document.getElementById('presentation-surface').value,analysisId=document.getElementById('presentation-analysis').value;
  const value=surface==='none'?null:{...structuredClone(b.presentation??{}),surface,...(analysisId?{analysisId}:{}),focus:[...document.querySelectorAll('[name="presentation-focus"]:checked')].map(input=>input.value),show:[...document.querySelectorAll('[name="presentation-show"]:checked')].map(input=>input.value)};
  if(value&&!analysisId)delete value.analysisId;
  if(value)for(const field of ['title','question']){const map={...b.presentation?.[field]},text=document.getElementById('presentation-'+field).value.trim();if(text)map[locale]=text;else delete map[locale];if(Object.keys(map).length)value[field]=map;else delete value[field];}
  const commands=[],text=document.getElementById('narration').value;if(text.trim()&&text!==b.narration?.[locale])commands.push({type:'narration.set',sceneId:scene().id,beatId:b.id,locale,text});
  commands.push({type:'presentation.set',sceneId:scene().id,beatId:b.id,value});await apply(commands);
}
function editPresentationCues(){
  const b=rawBeat(),sceneId=scene().id,locale=snapshot.project.output.locale,stored=b.presentation?.cues?.[locale],cues=structuredClone(stored?.cues??[]),base=b.presentation?.show??['range','calculation','conditions'];
  const layer=modal(t('teachingCues'),`<p>${t('teachingCueHelp')}</p><div data-presentation-cues></div><button data-add-cue>${icon('plus')} ${t('teachingAddCue')}</button>`,async()=>{
    read();await apply([{type:'presentation.cues',sceneId,beatId:b.id,value:{locale,cues}}]);
  });
  function read(){let visible=base;layer.querySelectorAll('[data-cue-row]').forEach(row=>{const cue=cues[Number(row.dataset.cueRow)];cue.at=Number(row.querySelector('input[type="number"]').value);const selected=[...row.querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value);if(cue.show!==undefined||selected.length!==visible.length||selected.some(key=>!visible.includes(key)))cue.show=selected;visible=cue.show??visible;});}
  function draw(){let visible=base;layer.querySelector('[data-presentation-cues]').innerHTML=cues.map((cue,i)=>{visible=cue.show??visible;return `<div class="teaching-cue-row" data-cue-row="${i}"><label>${t('teachingAt')}<input type="number" min="0" step="0.1" value="${cue.at}" aria-label="${t('teachingAt')}"></label>${revealChecks(visible,'cue-show-'+i)}<button data-remove-cue="${i}" aria-label="${t('teachingRemoveCue')}">${icon('close')}</button></div>`;}).join('');}
  layer.querySelector('[data-add-cue]').onclick=()=>{read();cues.push({at:(cues.at(-1)?.at??0)+3,show:[...base]});draw();};
  layer.querySelector('[data-presentation-cues]').onclick=e=>{const button=e.target.closest('[data-remove-cue]');if(button){read();cues.splice(Number(button.dataset.removeCue),1);draw();}};draw();
}
function issueFrame(issue){
  const target=issue.target;if(!target)return;
  const matches=snapshot.plan?.frames.filter(frame=>frame.sceneId===target.sceneId&&(target.entryId===undefined||frame.entryId===target.entryId)&&(target.beatId===undefined||frame.beatId===target.beatId))??[];
  return (matches.find(frame=>frame.entryId===current()?.entryId)??matches[0])?.id;
}
function inspector(){
  // A seek, background refresh, or playback can rebuild this panel after the
  // user expands it. Keep that view choice independently of the new frame.
  advancedToolsOpen=app.querySelector('.advanced-tools')?.open??advancedToolsOpen;
  inspectedBeat=JSON.stringify([current()?.sceneId,current()?.entryId,current()?.beatId]);
  if(selectedSeat){const p=scene().start.seats.find(s=>s.id===selectedSeat);return `<div class="inspector-title">${t('edit')} <button data-ui="back">${icon('close')}</button></div><h2>${esc(p.name??p.id)}</h2><div class="section-label">${t('name')}</div><input id="seat-name" value="${esc(p.name??p.id)}"><div class="section-label">${t('stack')} · ${unitLabel(snapshot.plan,current()?.state)}</div><input id="seat-stack" type="number" min="0" step=".01" value="${p.stack}"><div class="section-label">${t('hole')}</div><button data-ui="pick-seat">${esc((p.hole??[]).join(' '))||'••'} ${icon('edit')}</button><button class="save-text" data-ui="save-seat">${t('save')}</button>`;}
  const f=current(),b=rawBeat(),issues=snapshot.observation.readiness.issues;
  return `<div class="inspector-title">${t('inspector')}<button class="ghost" data-ui="collapse">${icon('chevron')}</button></div><h2>${esc(f?.label??t('noPlan'))}</h2><div class="section-label">${t('narration')}</div><textarea id="narration" placeholder="${t('emptyNarration')}">${esc(b?.narration?.[snapshot.project.output.locale]??'')}</textarea><button class="save-text" data-ui="save-narration" ${b?'':'disabled'}>${t('save')}</button>${teachingMarkup(b)}${advancedMarkup(toolContext())}${workflowMarkup(toolContext())}${voiceMarkup(b)}${directionMarkup()}<button class="scene-json" data-ui="timing">${t('timing')}</button><div class="toggle-row"><span>${t('subtitles')}</span><button class="toggle ${snapshot.project.output.captions?'on':''}" data-ui="captions"></button></div><div class="section-label">${t('duration')}</div><input id="hold" type="number" min="0.1" step=".1" value="${b?.hold??1.2}"><button class="save-text" data-ui="save-hold" ${b?'':'disabled'}>${t('save')}</button>${snapshot.observation.advisories?.length?`<div class="section-label">${t('teachingAdvisories')}</div>${snapshot.observation.advisories.map(a=>`<p class="quiet">${esc(snapshot.dictionary.errors[a.code]??a.message)}</p>`).join('')}`:''}<div class="section-label">${t('readiness')} · ${issues.length?t('issues'):t('ready')}</div>${issues.length?`<details><summary>${issues.length} · ${t('details')}</summary>${issues.map(i=>`<button class="issue-link" ${issueFrame(i)?`data-issue-frame="${esc(issueFrame(i))}"`:''}>${esc(snapshot.dictionary.errors[i.code]??i.message??snapshot.dictionary.errors.default)}<small>${esc(i.path)}</small></button>`).join('')}</details>`:''}<button class="scene-json" data-ui="scene-json">${icon('settings')} ${t('settings')}</button><button class="scene-json ghost" data-ui="audit">${t('inspect')}</button>`;
}
function render(){
  if(!snapshot)return;document.documentElement.lang=snapshot.project.output.locale;if(viewing){paint();return;}
  const o=snapshot.project.output,s=scene();
  app.innerHTML=`<div class="studio"><header class="topbar"><div class="brand"><span class="spade">♠</span>RIVER STUDIO</div><select id="scene-select" class="scene-select" aria-label="${t('scene')}">${snapshot.project.lesson.scenes.map(s=>`<option value="${esc(s.id)}" ${s.id===scene().id?'selected':''}>${esc(s.title[o.locale]??'…')}</option>`).join('')}</select><div class="toolbar"><select id="locale-select" aria-label="${t('locale')}">${snapshot.locales.map(l=>`<option value="${l}" ${l===o.locale?'selected':''}>${{'zh-CN':'中文','en-US':'English','ja-JP':'日本語'}[l]??l}</option>`).join('')}</select><div class="ratio-toggle"><button data-aspect="landscape" class="${o.aspect==='landscape'?'active':''}">${t('landscape')}</button><button data-aspect="portrait" class="${o.aspect==='portrait'?'active':''}">${t('portrait')}</button></div><select id="profile-select" aria-label="${t('profile')}"><option value="draft" ${o.profile==='draft'?'selected':''}>${t('draft')} · 720p</option><option value="final" ${o.profile==='final'?'selected':''}>${t('final')} · 1080p</option></select><button class="ghost" data-ui="export">${icon('download')}</button><select id="export-voice" aria-label="${t('voiceExportChoice')}" title="${t('voiceExportHelp')}" ${voiceBusy()?'disabled':''}><option value="">${t('voiceKeepNarration')}</option>${presetOptions(exportPresetId)}</select><button class="primary" data-ui="render" title="${t('voiceExportHelp')}" ${exportReady()?'':'disabled'}>${t('exportVideo')}</button></div></header><div class="workspace ${collapsed?'collapsed':''}"><main class="stage-column"><div class="stage-top"><span><i class="status-dot"></i>${t('saved')} · r${snapshot.project.revision}</span><select id="branch-select"><option value="">${t('main')}</option>${(s.branches??[]).map(b=>`<option value="${esc(b.id)}" ${b.id===current()?.branchId?'selected':''}>${esc(b.label[o.locale]??'…')}</option>`).join('')}</select><span class="spacer"></span><button class="ghost" data-ui="sequence" title="${t('sequence')}">${t('sequence')}${o.sequence?' · '+o.sequence.length:''}</button><button class="ghost" data-ui="new-scene">${icon('plus')}</button><button class="ghost" data-ui="scene-json">${icon('settings')} ${t('settings')}</button><button class="ghost" data-ui="viewer" title="${t('teachingOutput')}">${icon('expand')}</button><button class="ghost" data-ui="clean-client" title="${t('teachingCleanClient')}">${icon('history')}</button>${collapsed?`<button data-ui="collapse">${t('edit')}</button>`:''}</div><div class="preview-wrap ${o.aspect}" id="stage">${snapshot.plan?renderFrame(snapshot.plan,frameIndex,{editing:!playing,betDraft}):esc(t('noPlan'))}</div><div class="footer-strip"><div class="transport"><button class="play-circle" data-ui="play">${icon(playing?'pause':'play')}</button><span class="time" id="time-display">${clock(frameIndex/(snapshot.plan?.fps??24))} / ${clock(snapshot.plan?.duration??0)}</span></div><div class="beat-timeline">${(snapshot.plan?.frames??[]).map(f=>`<button class="beat-chip ${f.id===current()?.id?'active':''} ${f.presentation?'has-presentation':''}" data-frame="${esc(f.id)}"><b>${esc(f.label)}${f.event?' · '+t(f.event.type):''}</b><small>${f.duration<60?new Intl.NumberFormat(o.locale,{maximumFractionDigits:1}).format(f.duration)+' s':clock(f.duration)}</small></button>`).join('')}</div></div><div id="job-status">${jobMarkup()}</div></main><aside class="inspector">${inspector()}</aside></div></div>`;layoutFrame(document.getElementById('stage'));followTimeline();
}
function modal(title,body,save){stop();const revision=snapshot.project.revision,layer=document.createElement('div');layer.className='modal-overlay';layer.innerHTML=`<div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button data-close>${icon('close')}</button></div>${body}${save?`<div class="modal-actions"><button class="primary" data-save>${t('apply')}</button></div>`:''}</div>`;document.body.append(layer);layer.querySelector('[data-close]').onclick=()=>layer.remove();if(save)layer.querySelector('[data-save]').onclick=async()=>{try{if(revision!==snapshot.project.revision)throw {code:'REVISION_CONFLICT'};await save(layer);layer.remove();}catch(e){notify(e);}};return layer;}
function editScene(isNew=false){let s=structuredClone(scene());if(isNew){s.id='scene-'+crypto.randomUUID().slice(0,8);s.branches=[];s.beats=[{id:'start',label:Object.fromEntries(snapshot.locales.map(l=>[l,'…'])),hold:2}];delete s.analysis;delete s.variant;}modal(t('editScene'),`<p>${t('ruleNote')}</p><textarea>${esc(JSON.stringify(s,null,2))}</textarea>`,async el=>{const value=JSON.parse(el.querySelector('textarea').value);await apply([{type:'scene.put',value},{type:'output.set',value:{sceneId:value.id,branchId:null}}]);});}
function cardPicker(seatId){
  const s=structuredClone(scene()),original=seatId?s.start.seats.find(p=>p.id===seatId).hole??[]:s.start.board??[],limit=seatId?2:original.length,used=[...(s.start.board??[]),...s.start.seats.flatMap(p=>p.hole??[])].filter(c=>!original.includes(c));let chosen=[...original];
  const suits={s:'♠',h:'♥',d:'♦',c:'♣'};
  const el=modal(t('editCards'),`<div class="selected-cards"></div><div class="card-grid">${Object.keys(suits).flatMap(s=>[...'AKQJT98765432'].map(r=>`<button class="card-pick ${'hd'.includes(s)?'red':''}" data-card-pick="${r+s}" ${used.includes(r+s)?'disabled':''}>${r+suits[s]}</button>`)).join('')}</div><button data-clear>${t('clear')}</button>`,async()=>{if(seatId)s.start.seats.find(p=>p.id===seatId).hole=chosen;else s.start.board=chosen;await apply([{type:'scene.put',value:s}]);});
  const draw=()=>{el.querySelector('.selected-cards').textContent=chosen.map(c=>c[0]+suits[c[1]]).join('  ');el.querySelector('[data-save]').disabled=chosen.length!==limit;el.querySelectorAll('[data-card-pick]').forEach(b=>b.classList.toggle('selected',chosen.includes(b.dataset.cardPick)));};
  el.querySelectorAll('[data-card-pick]').forEach(b=>b.onclick=()=>{const c=b.dataset.cardPick;if(chosen.includes(c))chosen=chosen.filter(x=>x!==c);else if(chosen.length<limit)chosen.push(c);draw();});el.querySelector('[data-clear]').onclick=()=>{chosen=[];draw();};draw();
}
async function audioPicker(reference=false){stop();const beatId=current().beatId,sceneId=scene().id,locale=snapshot.project.output.locale,input=document.createElement('input');input.type='file';input.accept='audio/*';input.onchange=async()=>{try{const file=input.files[0];if(!file)return;const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});await apply([reference?{type:'voice.set',...(document.getElementById('voice-local')?.checked?{sceneId,beatId}:{}),value:{locale,reference:{data}}}:{type:'audio.attach',sceneId,beatId,value:{locale,source:{data}}}]);}catch(e){notify(e);}};input.click();}
function voiceSettings(){
  const pronunciations={};for(const line of document.getElementById('voice-pronunciations').value.split('\n')){if(!line.trim())continue;const i=line.indexOf('=');if(i<=0||!line.slice(i+1).trim())throw {code:'VOICE_SETTINGS'};pronunciations[line.slice(0,i).trim()]=line.slice(i+1).trim();}
  return {locale:snapshot.project.output.locale,speed:Number(document.getElementById('voice-speed').value),emotionStrength:Number(document.getElementById('voice-strength').value),emotion:JSON.parse(document.getElementById('voice-emotion').value),pronunciations};
}
function voiceEdits(){
  const b=rawBeat(),locale=snapshot.project.output.locale,value=voiceSettings(),base=voiceValues(b),local=document.getElementById('voice-local').checked,commands=[];
  const same=(a,p)=>a.speed===p.speed&&a.emotionStrength===p.emotionStrength&&JSON.stringify(a.emotion)===JSON.stringify(p.emotion)&&JSON.stringify(a.pronunciations)===JSON.stringify(p.pronunciations);
  if(local?(!b?.delivery?.[locale]||!same(value,voiceValues(b,true))):!!b?.delivery?.[locale]){
    const s=structuredClone(scene()),target=[...s.beats,...(s.branches??[]).flatMap(b=>b.beats)].find(item=>item.id===b.id);target.delivery??={};
    if(local){const delta=target.delivery[locale]?.referenceAssetId?{referenceAssetId:target.delivery[locale].referenceAssetId}:{};for(const k of ['speed','emotionStrength','emotion'])if(JSON.stringify(value[k])!==JSON.stringify(base[k]))delta[k]=value[k];const pronunciations=Object.fromEntries(Object.entries(value.pronunciations).filter(([k,v])=>base.pronunciations[k]!==v));if(Object.keys(pronunciations).length)delta.pronunciations=pronunciations;target.delivery[locale]=delta;}else delete target.delivery[locale];
    commands.push({type:'scene.put',value:s});
  }
  if(!local&&!same(value,base))commands.push({type:'voice.set',value});
  const presetId=document.getElementById('voice-preset').value,preset=snapshot.voice?.presets?.find(p=>p.id===presetId);
  if(presetId&&preset?.sha256!==(local?b?.delivery?.[locale]?.referenceAssetId:base.referenceAssetId))commands.push({type:'voice.set',...(local?{sceneId:scene().id,beatId:b.id}:{}),value:{locale,presetId}});
  const text=document.getElementById('narration').value;if(b?.narration?.[locale]!==text&&text.trim())commands.push({type:'narration.set',sceneId:scene().id,beatId:b.id,locale,text});
  return commands;
}
function fillVoiceValues(local){const p=voiceValues(rawBeat(),local);document.getElementById('voice-speed').value=p.speed;document.getElementById('voice-strength').value=p.emotionStrength;document.getElementById('voice-emotion').value=JSON.stringify(p.emotion);document.getElementById('voice-pronunciations').value=Object.entries(p.pronunciations).map(([k,v])=>k+'='+v).join('\n');document.getElementById('voice-style').value=Object.keys(voiceStyles).find(k=>JSON.stringify(voiceStyles[k])===JSON.stringify(p.emotion))??'custom';document.getElementById('voice-preset').value=selectedVoicePreset(p);updateReferencePreview();}
async function generateVoice(all=false){
  stop();const beatId=current()?.beatId,sceneId=scene().id,locale=snapshot.project.output.locale,commands=voiceEdits();
  if(commands.length)await apply(commands);
  const pending=rpc('voice',{action:'generate',requestId:crypto.randomUUID(),expectedRevision:snapshot.project.revision,...(all&&snapshot.project.output.sequence?{}:{sceneId,branchId:current()?.branchId??null}),locale,...(all?{}:{beatIds:[beatId],force:true})});
  snapshot.voice.job={status:'running',index:0,total:all?scene().beats.filter(b=>b.narration?.[locale]?.trim()).length:1};render();
  pending.then(()=>refresh(true)).catch(async error=>{await refresh();notify(error);});
}
async function startVideoExport(){
  if(!exportReady())return;stop();exportStarting=true;updateVoiceControls();
  try{await post('/api/render',exportPresetId?{voicePresetId:exportPresetId,expectedRevision:snapshot.project.revision}:{});await refresh();}
  finally{exportStarting=false;updateVoiceControls();}
}
async function act(type,to){
  const s=scene(),f=current(),branchId='play-'+crypto.randomUUID().slice(0,8),original=s.branches?.find(b=>b.id===current()?.branchId);
  const last=snapshot.plan.frames.filter(x=>x.beatId===f.beatId&&x.sceneId===f.sceneId&&x.entryId===f.entryId).at(-1);
  if(last.id!==f.id){await seek(last.id);return;}
  const label=key=>Object.fromEntries(snapshot.locales.map(l=>[l,snapshot.dictionaries[l].strings[key]]));
  const copyFrom=original?.beats.some(b=>b.id===f.beatId)?{branchId:original.id,beatId:f.beatId}:undefined;
  const branch={id:branchId,from:copyFrom?original.from:f.beatId,label:label('branch'),beats:[]};
  branch.beats.push({id:branchId+'-action',label:label(type),actions:[{seat:f.state.actor,type,...(to!==undefined?{to}:{})}],hold:2});
  await apply([{type:'branch.put',sceneId:s.id,value:branch,...(copyFrom?{copyFrom}:{})},{type:'output.set',value:{sceneId:s.id,branchId}}]);await seek(snapshot.plan.frames.at(-1).id);
}
app.addEventListener('focusin',e=>{if(playing&&e.target.closest('.inspector')){stop();paint();const button=app.querySelector('[data-ui="play"]');if(button)button.innerHTML=icon('play');}});
app.addEventListener('change',async e=>{try{
  if(e.target.id==='locale-select')await apply([{type:'output.set',value:{locale:e.target.value}}]);
  if(e.target.id==='scene-select')await apply([{type:'output.set',value:{sceneId:e.target.value,branchId:null}}]);
  if(e.target.id==='branch-select')await apply([{type:'output.set',value:{sceneId:scene().id,branchId:e.target.value||null}}]);
  if(e.target.id==='profile-select')await apply([{type:'output.set',value:{profile:e.target.value}}]);
  if(e.target.id==='direction-pattern'&&e.target.value)await setDirection({patternId:e.target.value});
  if(e.target.id==='voice-style'&&voiceStyles[e.target.value])document.getElementById('voice-emotion').value=JSON.stringify(voiceStyles[e.target.value]);
  if(e.target.id==='voice-local'&&!e.target.checked)fillVoiceValues(false);
  if(e.target.id==='voice-preset')updateReferencePreview();
  if(e.target.id==='export-voice'){exportPresetId=e.target.value;updateVoiceControls();}
  if(e.target.classList.contains('bet-slider')){betDraft=Number(e.target.value);paint();}
}catch(e){notify(e);}});
app.addEventListener('click',async e=>{if(viewing||requestBusy)return;const b=e.target.closest('button');try{
  if(b?.dataset.aspect){await apply([{type:'output.set',value:{aspect:b.dataset.aspect}}]);return;}
  if(b?.dataset.frame||b?.dataset.issueFrame){await seek(b.dataset.frame??b.dataset.issueFrame);betDraft=null;return;}
  if(b?.dataset.act){await act(b.dataset.act,b.dataset.to===undefined?undefined:Number(b.dataset.to));return;}
  if(b?.dataset.size){const amount=betPreset(current().state,b.dataset.size);if(amount!==null){betDraft=amount;paint();}return;}
  const action=b?.dataset.ui;
  if(await handleAdvanced(action,toolContext())||await handleWorkflow(action,toolContext()))return;
  if(action==='play')await play();else if(action==='collapse'){collapsed=!collapsed;render();}else if(action==='viewer')window.open('/?view=output','river-output');else if(action==='clean-client')window.open('/?view=client','river-client');
  else if(action==='captions')await apply([{type:'output.set',value:{captions:!snapshot.project.output.captions}}]);
  else if(action==='scene-json')editScene();else if(action==='new-scene')editScene(true);else if(action==='audio')await audioPicker();
  else if(action==='sequence')editSequence();else if(action==='timing')editTiming();
  else if(action==='save-presentation')await savePresentation();else if(action==='presentation-cues')editPresentationCues();
  else if(action==='analysis-confirm')await apply([{type:'analysis.confirm',sceneId:scene().id,analysisId:rawBeat().presentation.analysisId}]);
  else if(action==='analysis-seek'){const a=scene().analysis.find(item=>item.id===rawBeat().presentation.analysisId),f=snapshot.plan.frames.filter(frame=>frame.sceneId===scene().id&&frame.entryId===current().entryId&&frame.beatId===a.node.beatId&&(a.node.actionIndex===undefined||frame.actionIndex===a.node.actionIndex)).at(-1);if(f)await seek(f.id);}
  else if(action==='direction-clear')await setDirection(null);
  else if(action==='direction-custom'){const value=scene().direction??snapshot.project.direction,command=directionCommand({profile:value.profile});modal(t('directionCustom'),`<textarea>${esc(JSON.stringify(value.profile,null,2))}</textarea>`,async el=>{command.value.profile=JSON.parse(el.querySelector('textarea').value);await apply([command]);});}
  else if(action==='direction-voice'){const p=(scene().direction??snapshot.project.direction).profile;await apply([{type:'voice.set',value:{locale:snapshot.project.output.locale,...p.delivery}}]);}
  else if(action==='voice-reference')await audioPicker(true);
  else if(action==='voice-save'){const commands=voiceEdits();if(commands.length)await apply(commands);}
  else if(action==='voice-generate')await generateVoice();else if(action==='voice-route')await generateVoice(true);
  else if(action==='voice-cancel'){if(snapshot.job?.status==='running')await post('/api/cancel',{});else await rpc('voice',{action:'cancel'});await refresh();}
  else if(action==='save-narration')await apply([{type:'narration.set',sceneId:scene().id,beatId:current().beatId,text:document.getElementById('narration').value}]);
  else if(action==='save-hold'){const s=structuredClone(scene());[...s.beats,...(s.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===current().beatId).hold=Number(document.getElementById('hold').value);await apply([{type:'scene.put',value:s}]);}
  else if(action==='render')await startVideoExport();else if(action==='cancel-render'){await post('/api/cancel',{});await refresh();}
  else if(action==='export'){const result=await post('/api/export',{});location.assign(result.url);}
  else if(action==='audit')modal(t('inspect'),`<pre class="audit">${esc(JSON.stringify(snapshot.observation,null,2))}</pre>`);
  else if(action==='back'){selectedSeat=null;render();}else if(action==='pick-seat')cardPicker(selectedSeat);
  else if(action==='save-seat'){const s=structuredClone(scene()),p=s.start.seats.find(p=>p.id===selectedSeat);p.name=document.getElementById('seat-name').value;p.stack=Number(document.getElementById('seat-stack').value);await apply([{type:'scene.put',value:s}]);}
  else if(e.target.closest('[data-edit-board]'))cardPicker();else if(e.target.closest('[data-seat]')){selectedSeat=e.target.closest('[data-seat]').dataset.seat;collapsed=false;render();}
}catch(e){notify(e);}});
window.addEventListener('resize',()=>layoutFrame(viewing?app:document.getElementById('stage')));
await refresh(true);setInterval(()=>{if(!requestBusy)refresh().catch(notify);},1000);
