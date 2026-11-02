export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));



export const clock=sec=>`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
const icons={play:'<path d="M8 5l11 7-11 7z"/>',pause:'<path d="M8 5v14M16 5v14"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',chevron:'<path d="m9 5 7 7-7 7"/>',music:'<path d="M9 18V5l10-2v13M9 9l10-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="16" cy="16" rx="3" ry="2"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',expand:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/>',sound:'<path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8"/>',history:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',edit:'<path d="m5 16 11-11 3 3L8 19H5zM14 7l3 3"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',plus:'<path d="M12 4v16M4 12h16"/>',back:'<path d="m15 5-7 7 7 7"/>'};
export const icon=k=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[k]??icons.settings}</svg>`;
const suit={s:'♠',h:'♥',d:'♦',c:'♣'};
function card(c,extra=''){
  if(c===null)return '<div class="card back" aria-label="hidden card"></div>';
  if(!c)return '<div class="card empty"></div>';
  return `<div class="card ${'hd'.includes(c[1])?'red':''} ${extra}" data-card="${c}"><span class="rank">${c[0]==='T'?'10':c[0]}</span><span class="suit">${suit[c[1]]}</span></div>`;
}

function coords(index,hero,n,portrait){
  const relative=(index-hero+n)%n;
  if(portrait&&relative===0)return {x:50,y:71.5};
  const grids={6:[[50,75],[17,61],[17,30],[50,18],[83,30],[83,61]],7:[[50,75],[14,65],[14,35],[35,18],[65,18],[86,35],[86,65]],8:[[50,75],[14,67],[14,48],[14,30],[50,18],[86,30],[86,48],[86,67]],9:[[50,75],[14,67],[14,50],[14,30],[35,18],[65,18],[86,30],[86,50],[86,67]]};
  if(portrait&&grids[n])return {x:grids[n][relative][0],y:grids[n][relative][1]};
  const a=Math.PI/2+relative*2*Math.PI/n;return {x:50+(portrait?32:39)*Math.cos(a),y:(portrait?47:45.5)+(portrait?28:30.5)*Math.sin(a)};
}
export function betPreset(state,size){
  const raise=state.legalActions.find(a=>['bet','raise'].includes(a.type));if(!raise)return null;
  if(size==='all')return raise.maxTo;
  const fraction=Number(size);if(!Number.isFinite(fraction)||fraction<0)return null;
  const call=state.legalActions.find(a=>a.type==='call')?.amount??0,highest=Math.max(...state.seats.map(p=>p.streetBet));
  return Math.min(raise.maxTo,Math.max(raise.minTo,Math.round((highest+(state.pot+call)*fraction)*100)/100));
}
export function clientMarkup(plan,frame,time,options={}){
  const editing=!!options.editing,captions=options.captions??plan.captions,betDraft=options.betDraft??null;
  const t=key=>plan.dictionary.strings[key]??key;
  const fmt=n=>new Intl.NumberFormat(plan.locale,Math.abs(n)>=10000?{notation:'compact',maximumFractionDigits:2}:{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  const compact=n=>new Intl.NumberFormat(plan.locale,{notation:Math.abs(n)>=10000?'compact':'standard',maximumFractionDigits:2}).format(n);
  const visualStart=frame.stateStart??frame.start,visualEvent=frame.stateEvent??frame.event;
  const s=frame.state,portrait=plan.aspect==='portrait',heroIndex=s.seats.findIndex(p=>p.id===s.hero);
  const seatMarkup=s.seats.map((p,i)=>{
    const pos=coords(i,heroIndex,s.seats.length,portrait),hero=p.id===s.hero,acting=p.id===s.actor;
    const paid=s.payouts.filter(x=>x.seat===p.id).reduce((n,x)=>n+x.amount,0);
    const actionAmount=p.action?.type==='call'?p.action.amount:p.action?.to;
    const action=paid?`${t('won')} ${compact(paid)}`:p.action?(t(p.action.type)+(['bet','raise','call','allin'].includes(p.action.type)&&actionAmount?` ${compact(actionAmount)}`:'')):p.folded?t('fold'):p.stack===0&&!s.settled?t('allin'):'';
    const hue=['#6a84a0','#8d736f','#6a7b65','#458e83','#8a87a7','#5d759d','#7c748c','#7f9a8a','#936c6c'][i];
    return `<div class="seat ${hero?'hero':''} ${p.folded?'folded':''} ${acting?'acting':''}" data-seat="${esc(p.id)}" style="left:${pos.x}%;top:${pos.y}%;--avatar:${hue}">
      ${!p.folded?`<div class="hole-cards">${p.hole.map(c=>card(c)).join('')}</div>`:''}
      <div class="seat-panel"><div class="avatar">${esc(p.avatar??p.name.slice(0,1).toUpperCase())}</div><div class="seat-info"><div class="nickname" title="${esc(p.name)}">${esc(p.name)}</div><div class="balance">${fmt(p.stack)} <small style="font-size:.66em;color:inherit">BB</small></div></div></div>
      ${p.id===s.button?`<div class="dealer ${pos.x>50?'left':''}">D</div>`:''}
      ${action?`<div class="seat-action ${paid?'won':p.folded?'fold':p.stack===0?'allin':''}">${esc(action)}</div>`:''}
    </div>`;
  }).join('');
  const streetBetTotal=s.seats.reduce((a,p)=>a+p.streetBet,0),centralPot=s.settled?0:s.roundClosed?s.pot:s.pot-streetBetTotal;
  const bubbleMarkup=s.settled||(s.roundClosed&&time-visualStart>.35)?'':s.seats.filter(p=>p.streetBet>0).map(p=>{
    const i=s.seats.indexOf(p),pos=coords(i,heroIndex,s.seats.length,portrait),progress=visualEvent?.seat===p.id?Math.min(1,(time-visualStart)/.35):1;
    let target={x:50+(pos.x-50)*.65,y:47+(pos.y-47)*.63};
    if(!portrait&&p.id===s.hero)target={x:50,y:58};
    if(portrait){const left=pos.x<50;target=p.id===s.hero?{x:50,y:57}:pos.y<=22?{x:pos.x,y:31}:pos.y<=35?{x:left?42:58,y:36}:pos.y<=52?{x:left?28:72,y:57.5}:{x:left?39:61,y:57};}
    const x=pos.x+(target.x-pos.x)*progress,y=pos.y+(target.y-pos.y)*progress;
    return `<div class="bet-bubble" style="--x:${x}%;--y:${y}%"><i class="chip"></i>${compact(p.streetBet)}</div>`;
  }).join('');
  const legal=frame.state.legalActions,mine=s.actor===s.hero,call=legal.find(x=>x.type==='call'),raise=legal.find(x=>x.type==='raise'||x.type==='bet');
  const next=plan.frames[plan.frames.findIndex(x=>x.id===frame.id)+1],sameEntry=next?.entryId===frame.entryId&&next?.sceneId===frame.sceneId;
  const blocked=editing&&sameEntry&&next?.beatId===frame.beatId;
  const upcoming=sameEntry?next?.event:null;
  const planned=upcoming?.seat===s.hero&&['bet','raise'].includes(upcoming.type)?upcoming.to:null;
  const amount=raise?Math.min(raise.maxTo,Math.max(raise.minTo,betDraft??planned??betPreset(s,.33))):0;
  const progress=raise&&raise.maxTo>raise.minTo?(amount-raise.minTo)/(raise.maxTo-raise.minTo)*100:0;
  const hero=s.seats[heroIndex],callAllin=!!call&&call.amount>=hero.stack;
  const allinSize=!!raise&&amount===raise.maxTo&&legal.some(x=>x.type==='allin');
  const actor=frame.state.seats.find(p=>p.id===s.actor);
  const potOffset=s.pots.length>2?Math.floor(Math.max(0,time-visualStart)/2)%Math.ceil(s.pots.length/2)*2:0;
  const visiblePots=s.pots.length>2?s.pots.slice(potOffset,potOffset+2):s.pots;
  const actionLabel=s.settled?t('done'):s.roundClosed?(s.board.length===5?t('showdown'):t('closed')):!mine?t('waitingForAction').replace('{name}',actor?.name??''):null;
  const enter=visualEvent?.type==='deal'?Math.max(0,1-(time-visualStart)/.35):0;
  const controlsBlocked=blocked?'disabled':'';
  return `<div class="client ${portrait?'portrait':''} seats-${s.seats.length} ${editing?'editing':''}" data-locale="${plan.locale}" data-aspect="${plan.aspect}">
    <div class="client-header"><span class="tiny-spade">♠</span><span class="table-name">${esc((frame.appearance??plan.appearance).tableName)}</span><span class="game-name">${t('game')} · ${fmt(s.bigBlind/2)} / ${fmt(s.bigBlind)}</span></div>
    <div class="felt" style="--felt:${esc((frame.appearance??plan.appearance).felt)}"></div>${bubbleMarkup}${seatMarkup}
    <div class="board-area" data-edit-board="true"><div class="pot-label" ${s.settled?'style="visibility:hidden" aria-hidden="true"':''}>${t('pot')}<strong>${fmt(s.pot)} BB</strong></div><div class="board-cards">${Array.from({length:5},(_,i)=>card(s.board[i],i===s.board.length-1?'movement':'')).join('')}</div><div class="pot-chips">${centralPot>0?'<i class="chip"></i><i class="chip"></i><i class="chip"></i>':''}</div>${!s.settled&&!s.potsProvisional&&s.pots.length>1&&(!s.roundClosed||time-visualStart>.35)?`<div class="pots-list ${s.pots.length>2?'many':''}">${visiblePots.map((p,j)=>{const i=j+potOffset;return `<span>${t(i?'sidePot':'mainPot')} ${i>1?i:''} · ${compact(p.amount)} BB</span>`;}).join('')}</div>`:''}</div>
    <div class="bet-controls">${!actionLabel&&raise?`<div class="presets">${[.33,.5,.75,1].map(p=>`<button data-size="${p}" ${blocked?'disabled':''}>${p===1?t('pot'):Math.round(p*100)+'%'}</button>`).join('')}<button data-size="all" ${!blocked&&legal.some(x=>x.type==='allin')?'':'disabled'}>${t('allin')}</button></div><div class="amount-row"><input aria-label="${t('customAmount')}" class="bet-slider" type="range" min="${raise.minTo}" max="${raise.maxTo}" step="0.01" value="${amount}" style="--bet-progress:${progress}%" ${editing&&!blocked?'':'disabled'}><span class="bet-amount">${fmt(amount)} BB</span></div>`:''}<div class="action-buttons">${actionLabel?`<button disabled>${esc(actionLabel)}</button>`:`<button data-act="fold" ${controlsBlocked}>${t('fold')}</button><button data-act="${call?'call':'check'}" ${controlsBlocked}>${call?`${t('call')} ${compact(call.amount)}${callAllin?` (${t('allin')})`:''}`:t('check')}</button>${raise?`<button class="aggressive" data-act="${allinSize?'allin':raise.type}" ${allinSize?'':`data-to="${amount}"`} ${controlsBlocked}>${allinSize?t('allin'):`${t(raise.type)} ${compact(amount)}`}</button>`:!callAllin&&legal.some(x=>x.type==='allin')?`<button class="aggressive" data-act="allin" ${controlsBlocked}>${t('allin')}</button>`:''}`}</div></div>

    <style>.client .movement{--enter:${enter}}</style>
  </div>`;
}
export function frameAt(plan,index){return plan.frames.find(f=>index>=f.startFrame&&index<f.endFrame)??plan.frames.at(-1);}
export function narrationCues(plan){
  const cues=new Map();for(const f of plan.frames)if(f.narration){const id=f.narrationId??f.id;if(!cues.has(id))cues.set(id,{id,sceneId:f.sceneId,entryId:f.entryId,beatId:f.beatId,speaker:f.speaker??null,text:f.narration,start:f.narrationStart??f.start,duration:f.narrationDuration??f.audio?.duration??f.duration,audio:f.audio,captionCues:f.captionCues??null});}return [...cues.values()];
}
export function subtitleCues(plan){return narrationCues(plan).flatMap(cue=>cue.captionCues?cue.captionCues.map(c=>({text:c.text,start:cue.start+c.start,end:cue.start+c.end})):[{text:cue.text,start:cue.start,end:cue.start+cue.duration}]);}
export function narrationAt(plan,index){
  const frame=frameAt(plan,index);if(!frame?.narration)return null;
  const start=frame.narrationStart??frame.start,duration=frame.narrationDuration??frame.audio?.duration??frame.duration,elapsed=(index-Math.round(start*plan.fps))/plan.fps;
  return elapsed>=0&&elapsed<duration?{id:frame.narrationId??frame.id,text:frame.narration,start,duration,elapsed,audio:frame.audio,captionCues:frame.captionCues??null}:null;
}
const captionWeight=text=>[...text].reduce((n,c)=>n+(/[^\x00-\x7F]/u.test(c)?2:1),0);
export function captionSegments(text,portrait){
  const limit=portrait?72:200,segments=[];let chunk='',weight=0;
  // Keep sentences/clauses intact when they fit, then fall back to words/characters.
  const units=text.split(/(?<=[。！？!?])/u).flatMap(sentence=>captionWeight(sentence)<=limit?[sentence]:sentence.split(/(?<=[，,；;：:])/u).flatMap(clause=>captionWeight(clause)<=limit?[clause]:(clause.match(/\S+\s*|\s+/gu)??[])));
  for(const part of units){
    const pieces=captionWeight(part)>limit?[...part]:[part];
    for(const piece of pieces){const length=captionWeight(piece);if(weight+length>limit&&chunk.trim()){segments.push(chunk.trim());chunk='';weight=0;}chunk+=piece;weight+=length;}
  }if(chunk.trim())segments.push(chunk.trim());return segments;
}
export function captionPages(text,portrait){
  const segments=captionSegments(text,portrait),weights=segments.map(captionWeight),total=weights.reduce((n,w)=>n+w,0);let offset=0;
  return segments.map((text,i)=>{const startFraction=offset/total;offset+=weights[i];return {text,startFraction,endFraction:offset/total};});
}
export function renderFrame(plan,index,options={}){
  const i=Math.max(0,Math.min(Math.floor(index),plan.totalFrames-1)),frame=frameAt(plan,i),time=i/plan.fps,markup=clientMarkup(plan,frame,time,options),captions=options.captions??plan.captions;
  if(!captions)return markup;
  const cue=narrationAt(plan,i),elapsed=cue?.elapsed??0,explicit=cue?.captionCues?.find(c=>elapsed>=c.start&&elapsed<c.end);
  const passage=cue?.captionCues?(explicit?{text:explicit.text,elapsed:elapsed-explicit.start,duration:explicit.end-explicit.start}:null):cue?{text:cue.text,elapsed,duration:cue.duration}:null;
  const text=passage?captionPages(passage.text,plan.aspect==='portrait').find(p=>passage.elapsed/passage.duration<p.endFraction)?.text??'':'';
  return `<div class="output-frame captions-on ${plan.aspect}"><div class="game-surface">${markup}</div><div class="caption-lane">${esc(text)}</div></div>`;
}
