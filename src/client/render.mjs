export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));



export const clock=sec=>`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
const icons={play:'<path d="M8 5l11 7-11 7z"/>',pause:'<path d="M8 5v14M16 5v14"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',chevron:'<path d="m9 5 7 7-7 7"/>',music:'<path d="M9 18V5l10-2v13M9 9l10-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="16" cy="16" rx="3" ry="2"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',expand:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/>',sound:'<path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8"/>',history:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',edit:'<path d="m5 16 11-11 3 3L8 19H5zM14 7l3 3"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',plus:'<path d="M12 4v16M4 12h16"/>',back:'<path d="m15 5-7 7 7 7"/>'};
export const icon=k=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[k]??icons.settings}</svg>`;
const suit={s:'♠',h:'♥',d:'♦',c:'♣'};
export const unitLabel=(plan,state)=>state?.unit==='chips'?({'zh-CN':'筹码','ja-JP':'チップ'}[plan.locale]??'chips'):'BB';
function teachingText(plan,key){
  const words={
    en:{ev:'Action EV',weight:'Combination weight',rangeShare:'Share of full range',frequency:'Action frequency',equity:'Showdown equity',matrix:'Range matrix',combos:'Combinations',filtered:'Filtered; full-range probabilities retained',noData:'No value supplied',choices:'Same decision · alternative routes',conditions:'Changed conditions',routeNote:'Illustrative continuations; outcomes are not EV or frequencies.',start:'Start',end:'Continuation',changes:'Changed inputs',unchanged:'Same public state',metrics:'Decision calculations',spr:'Stack-to-pot ratio',outs:'Next-card improvements',callEV:'Call EV',tournament:'Tournament equity',scenario:'Scenario',range:'Range',assumptions:'Assumptions',conditionsField:'Conditions',more:'More on the next page',page:'Page',empty:'No matching combinations',cards:'cards',estimated:'Estimate',exact:'Exact',unavailable:'Not applicable'},
    'zh-CN':{ev:'行动 EV',weight:'组合权重',rangeShare:'占完整范围比例',frequency:'行动频率',equity:'摊牌权益',matrix:'范围矩阵',combos:'具体组合',filtered:'筛选后仍使用完整范围概率',noData:'未提供此数值',choices:'同一起点 · 路线对照',conditions:'改变条件',routeNote:'路线是可能的后续示例；结果不代表 EV 或行动频率。',start:'起点',end:'后续路线',changes:'改变的条件',unchanged:'公开状态相同',metrics:'决策计算',spr:'筹码底池比',outs:'下一张牌的改善',callEV:'跟注 EV',tournament:'锦标赛权益',scenario:'情景',range:'范围',assumptions:'假设',conditionsField:'适用条件',more:'下一页继续',page:'页',empty:'没有符合条件的组合',cards:'张',estimated:'估计',exact:'精确',unavailable:'不适用'},
    'ja-JP':{ev:'アクション EV',weight:'コンボの重み',rangeShare:'全レンジ内の比率',frequency:'アクション頻度',equity:'ショーダウン・エクイティ',matrix:'レンジ表',combos:'具体的なコンボ',filtered:'絞り込み後も全レンジの確率を使用',noData:'値は未提供',choices:'同じ判断点からの比較',conditions:'条件の変更',routeNote:'継続ラインの一例です。結果はEVや頻度を表しません。',start:'開始点',end:'継続ライン',changes:'変更した条件',unchanged:'公開状態は同一',metrics:'判断の計算',spr:'スタック対ポット比',outs:'次のカードによる改善',callEV:'コール EV',tournament:'トーナメント・エクイティ',scenario:'シナリオ',range:'レンジ',assumptions:'仮定',conditionsField:'適用条件',more:'次のページへ',page:'ページ',empty:'該当するコンボはありません',cards:'枚',estimated:'推定',exact:'厳密',unavailable:'適用外'}
  };return (words[plan.locale]??words.en)[key]??words.en[key]??key;
}
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
  const s=frame.state,portrait=plan.aspect==='portrait',heroIndex=s.seats.findIndex(p=>p.id===s.hero),focus=options.focus??[];
  const unit=unitLabel(plan,s),motion=frame.presentation?.motion,move=motion===true?{}:motion||null,moveDuration=move?.duration??.45,elapsed=Math.max(0,time-visualStart);
  const focuses=(kind,id)=>focus.includes(kind)||focus.includes(kind+':'+id);
  const focusedCard=c=>focus.includes('card:'+c)?'is-focused':'';
  const seatMarkup=s.seats.map((p,i)=>{
    const pos=coords(i,heroIndex,s.seats.length,portrait),hero=p.id===s.hero,acting=p.id===s.actor;
    const paid=s.payouts.filter(x=>x.seat===p.id).reduce((n,x)=>n+x.amount,0);
    const actionAmount=p.action?.type==='call'?p.action.amount:p.action?.to;
    const action=paid?`${t('won')} ${compact(paid)}`:p.action?(t(p.action.type)+(['bet','raise','call','allin'].includes(p.action.type)&&actionAmount?` ${compact(actionAmount)}`:'')):p.folded?t('fold'):p.stack===0&&!s.settled?t('allin'):'';
    const hue=['#6a84a0','#8d736f','#6a7b65','#458e83','#8a87a7','#5d759d','#7c748c','#7f9a8a','#936c6c'][i];
    // Unassigned holdings are unknown values, not a player dealt zero cards.
    const hole=p.hole.length?p.hole:[null,null];
    const initialDeal=move&&move.deal!==false&&!frame.previousState&&!visualEvent&&frame.startFrame===0?Math.max(0,1-(time-frame.start)/moveDuration):0;
    return `<div class="seat ${hero?'hero':''} ${p.folded?'folded':''} ${acting?'acting':''} ${focuses('seat',p.id)||(hero&&focus.includes('hero'))||p.hole.some(c=>focus.includes('card:'+c))?'is-focused':''}" data-seat="${esc(p.id)}" style="left:${pos.x}%;top:${pos.y}%;--avatar:${hue}">
      ${!p.folded?`<div class="hole-cards" ${initialDeal?`style="opacity:${1-initialDeal};translate:${(50-pos.x)*initialDeal}cqw ${(20-pos.y)*initialDeal}cqh"`:''}>${hole.map(c=>card(c,focusedCard(c))).join('')}</div>`:''}
      <div class="seat-panel"><div class="avatar">${esc(p.avatar??p.name.slice(0,1).toUpperCase())}</div><div class="seat-info"><div class="nickname" title="${esc(p.name)}">${esc(p.name)}</div><div class="balance ${focus.includes('stack:'+p.id)?'is-focused':''}" data-target="${esc('stack:'+p.id)}">${fmt(p.stack)} <small style="font-size:.66em;color:inherit">${unit}</small></div></div></div>
      ${p.id===s.button?`<div class="dealer ${pos.x>50?'left':''}">D</div>`:''}
      ${action?`<div class="seat-action ${paid?'won':p.folded?'fold':p.stack===0?'allin':''}">${esc(action)}</div>`:''}
    </div>`;
  }).join('');
  const streetBetTotal=s.seats.reduce((a,p)=>a+p.streetBet,0),centralPot=s.settled?0:s.roundClosed?s.pot:s.pot-streetBetTotal;
  const collectDuration=move&&move.collect!==false?moveDuration:.35;
  const bubbleMarkup=s.settled||(s.roundClosed&&elapsed>collectDuration)?'':s.seats.filter(p=>p.streetBet>0).map(p=>{
    const i=s.seats.indexOf(p),pos=coords(i,heroIndex,s.seats.length,portrait),progress=visualEvent?.seat===p.id?Math.min(1,elapsed/(move&&move.bet!==false?moveDuration:.35)):1;
    let target={x:50+(pos.x-50)*.65,y:47+(pos.y-47)*.63};
    if(!portrait&&p.id===s.hero)target={x:50,y:58};
    if(portrait){const left=pos.x<50;target=p.id===s.hero?{x:50,y:57}:pos.y<=22?{x:pos.x,y:31}:pos.y<=35?{x:left?42:58,y:36}:pos.y<=52?{x:left?28:72,y:57.5}:{x:left?39:61,y:57};}
    let x=pos.x+(target.x-pos.x)*progress,y=pos.y+(target.y-pos.y)*progress;
    if(move&&move.collect!==false&&s.roundClosed){const q=Math.min(1,elapsed/collectDuration);x=target.x+(50-target.x)*q;y=target.y+((portrait?51:51)-target.y)*q;}
    return `<div class="bet-bubble ${focus.includes('bet:'+p.id)?'is-focused':''}" data-target="${esc('bet:'+p.id)}" style="--x:${x}%;--y:${y}%"><i class="chip"></i>${compact(p.streetBet)}</div>`;
  }).join('');
  const payoutMarkup=move&&move.payout!==false&&s.settled&&s.payouts.length&&elapsed<moveDuration?s.payouts.map(payout=>{const pos=coords(s.seats.findIndex(x=>x.id===payout.seat),heroIndex,s.seats.length,portrait),q=Math.min(1,elapsed/moveDuration);return `<div class="payout-flight" data-motion="payout" style="left:${50+(pos.x-50)*q}%;top:${50+(pos.y-50)*q}%;opacity:${1-q*.35}"><i class="chip"></i><i class="chip"></i><b>${compact(payout.amount)}</b></div>`;}).join(''):'';
  const legal=frame.state.legalActions,mine=s.actor===s.hero,call=legal.find(x=>x.type==='call'),raise=legal.find(x=>x.type==='raise'||x.type==='bet');
  const next=plan.frames[plan.frames.findIndex(x=>x.id===frame.id)+1],sameEntry=next?.entryId===frame.entryId&&next?.sceneId===frame.sceneId;
  const blocked=editing&&sameEntry&&next?.beatId===frame.beatId;
  // Future authored actions must not prefill a pending player decision.
  const amount=raise?Math.min(raise.maxTo,Math.max(raise.minTo,betDraft??betPreset(s,.33))):0;
  const progress=raise&&raise.maxTo>raise.minTo?(amount-raise.minTo)/(raise.maxTo-raise.minTo)*100:0;
  const hero=s.seats[heroIndex],callAllin=!!call&&call.amount>=hero.stack;
  const allinSize=!!raise&&amount===raise.maxTo&&legal.some(x=>x.type==='allin');
  const actor=frame.state.seats.find(p=>p.id===s.actor);
  const potOffset=s.pots.length>2?Math.floor(Math.max(0,time-visualStart)/2)%Math.ceil(s.pots.length/2)*2:0;
  const visiblePots=s.pots.length>2?s.pots.slice(potOffset,potOffset+2):s.pots;
  const actionLabel=s.settled?t('done'):s.roundClosed?(s.board.length===5?t('showdown'):t('closed')):!mine?t('waitingForAction').replace('{name}',actor?.name??''):null;
  const enter=visualEvent?.type==='deal'?Math.max(0,1-(time-visualStart)/.35):0;
  const controlsBlocked=blocked?'disabled':'';
  return `<div class="client ${portrait?'portrait':''} seats-${s.seats.length} ${editing?'editing':''} ${focus.length?'has-focus':''}" data-locale="${plan.locale}" data-aspect="${plan.aspect}">
    <div class="client-header"><span class="tiny-spade">♠</span><span class="table-name">${esc((frame.appearance??plan.appearance).tableName)}</span><span class="game-name">${t('game')} · ${fmt(s.bigBlind/2)} / ${fmt(s.bigBlind)}</span></div>
    <div class="felt" style="--felt:${esc((frame.appearance??plan.appearance).felt)}"></div>${bubbleMarkup}${seatMarkup}${payoutMarkup}
    <div class="board-area ${focus.includes('board')||focus.includes('pot')||s.board.some(c=>focus.includes('card:'+c))?'is-focused':''}" data-edit-board="true"><div class="pot-label ${focus.includes('pot')?'is-focused':''}" ${s.settled?'style="visibility:hidden" aria-hidden="true"':''}>${t('pot')}<strong>${fmt(s.pot)} ${unit}</strong></div><div class="board-cards">${Array.from({length:5},(_,i)=>{const fresh=move&&move.deal!==false&&visualEvent?.type==='deal'&&i>=(frame.previousState?.board.length??Math.max(0,s.board.length-(visualEvent.cards?.length??1)))&&i<s.board.length;return fresh?`<span class="dealt-card" data-motion="deal" style="translate:${(2-i)*Math.max(0,1-elapsed/moveDuration)*3}cqw ${-Math.max(0,1-elapsed/moveDuration)*9}cqw;opacity:${Math.min(1,elapsed/moveDuration)}">${card(s.board[i],focusedCard(s.board[i]))}</span>`:card(s.board[i],(i===s.board.length-1&&!move?'movement ':'')+focusedCard(s.board[i]));}).join('')}</div><div class="pot-chips">${centralPot>0?'<i class="chip"></i><i class="chip"></i><i class="chip"></i>':''}</div>${!s.settled&&!s.potsProvisional&&s.pots.length>1&&(!s.roundClosed||time-visualStart>.35)?`<div class="pots-list ${s.pots.length>2?'many':''}">${visiblePots.map((p,j)=>{const i=j+potOffset;return `<span>${t(i?'sidePot':'mainPot')} ${i>1?i:''} · ${compact(p.amount)} ${unit}</span>`;}).join('')}</div>`:''}</div>
    <div class="bet-controls">${!actionLabel&&raise?`<div class="presets">${[.33,.5,.75,1].map(p=>`<button data-size="${p}" ${blocked?'disabled':''}>${p===1?t('pot'):Math.round(p*100)+'%'}</button>`).join('')}<button data-size="all" ${!blocked&&legal.some(x=>x.type==='allin')?'':'disabled'}>${t('allin')}</button></div><div class="amount-row"><input aria-label="${t('customAmount')}" class="bet-slider" type="range" min="${raise.minTo}" max="${raise.maxTo}" step="0.01" value="${amount}" style="--bet-progress:${progress}%" ${editing&&!blocked?'':'disabled'}><span class="bet-amount">${fmt(amount)} ${unit}</span></div>`:''}<div class="action-buttons">${actionLabel?`<button disabled>${esc(actionLabel)}</button>`:`<button data-act="fold" ${controlsBlocked}>${t('fold')}</button><button data-act="${call?'call':'check'}" ${controlsBlocked}>${call?`${t('call')} ${compact(call.amount)}${callAllin?` (${t('allin')})`:''}`:t('check')}</button>${raise?`<button class="aggressive" data-act="${allinSize?'allin':raise.type}" ${allinSize?'':`data-to="${amount}"`} ${controlsBlocked}>${allinSize?t('allin'):`${t(raise.type)} ${compact(amount)}`}</button>`:!callAllin&&legal.some(x=>x.type==='allin')?`<button class="aggressive" data-act="allin" ${controlsBlocked}>${t('allin')}</button>`:''}`}</div></div>

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
function rangeStudyMarkup(plan,range,view){
  const metric=view.metric??'weight',label=teachingText(plan,metric)+(['frequency','ev'].includes(metric)?` · ${plan.dictionary.strings[view.action]??view.action}`:''),percent=n=>Number.isFinite(n)?new Intl.NumberFormat(plan.locale,{style:'percent',maximumFractionDigits:1}).format(n):'—';
  const value=entry=>metric==='ev'?entry.ev?.[view.action]:metric==='frequency'?entry.actions?.[view.action]:metric==='rangeShare'?(entry.rangeShare??entry.probability):entry[metric];
  const formatted=n=>metric==='ev'?(Number.isFinite(n)?new Intl.NumberFormat(plan.locale,{maximumFractionDigits:2}).format(n)+' '+unitLabel(plan,{unit:range.units?.ev}):'—'):percent(n);
  const maxEV=Math.max(1e-9,...(range.matrix??[]).map(entry=>Math.abs(value(entry)??0)));
  const matches=entry=>(!view.hand||entry.hand===view.hand)&&(!view.filter?.category||entry.category===view.filter.category)&&(view.filter?.minWeight===undefined||entry.weight>=view.filter.minWeight);
  const header=`<div class="analysis-kicker">${teachingText(plan,view.mode)}<span>${esc(label)}</span></div>`;
  if(view.mode==='matrix')return `${header}<div class="range-matrix" role="table" aria-label="${esc(label)}">${(range.matrix??[]).map(entry=>{const number=value(entry),matched=matches(entry);return `<div class="range-cell ${entry.category} ${entry.weight===0?'range-empty':''} ${matched?'':'range-filtered'} ${view.hand===entry.hand?'selected':''}" role="cell" data-hand="${esc(entry.hand)}" data-target="hand:${esc(entry.hand)}" data-value="${Number.isFinite(number)?number:''}" style="--range-value:${Math.max(0,Math.min(1,metric==='ev'?Math.abs(number??0)/maxEV:number??0))};--range-color:${number<0?'#8a4a4c':'#417f6a'}" title="${esc(entry.hand+' · '+label+' '+formatted(number)+' · '+entry.combinationCount)}"><b>${esc(entry.hand)}</b><span>${entry.weight===0&&metric!=='ev'?'':formatted(number)}</span></div>`;}).join('')}</div><p class="range-unit-note">${esc(label)}${view.filter||view.hand?' · '+teachingText(plan,'filtered'):''}</p>`;
  const combos=(range.combos??[]).filter(matches),pageSize=12,totalPages=Math.max(1,Math.ceil(combos.length/pageSize)),page=Math.min(view.page??0,totalPages-1),selected=combos.slice(page*pageSize,(page+1)*pageSize);
  return `${header}<div class="combo-grid">${selected.map(entry=>`<div class="combo-item" data-target="hand:${esc(entry.hand)}" data-combo="${entry.cards.join('')}"><div class="combo-cards">${entry.cards.map(c=>card(c)).join('')}</div><div><b>${formatted(value(entry))}</b><small>${esc(entry.hand)}</small></div></div>`).join('')||`<p>${teachingText(plan,'empty')}</p>`}</div><p class="range-unit-note">${esc(label)} · ${teachingText(plan,'page')} ${page+1}/${totalPages}${view.filter||view.hand?' · '+teachingText(plan,'filtered'):''}</p>`;
}
function metricsMarkup(plan,analysis){
  const metrics=analysis.metrics??[],fmt=n=>new Intl.NumberFormat(plan.locale,{maximumFractionDigits:3}).format(n);
  const cards=metrics.map(m=>{const value=!m.applicable?'—':m.unit==='probability'?new Intl.NumberFormat(plan.locale,{style:'percent',maximumFractionDigits:2}).format(m.value):fmt(m.value);const unit=['BB','chips'].includes(m.unit)?unitLabel(plan,analysis.decision):m.unit==='cards'?teachingText(plan,'cards'):'';const exact=m.method==='exact'||m.exact===true;const detail=m.method?(exact?teachingText(plan,'exact'):teachingText(plan,'estimated')):'';return `<div class="metric-card" data-metric="${esc(m.kind)}"><span>${esc(teachingText(plan,m.kind))}</span><b>${value} <small>${unit}</small></b><p>${esc(m.applicable?(m.note??detail):m.reason??teachingText(plan,'unavailable'))}</p>${!exact&&m.standardError!==undefined?`<small>${esc({'zh-CN':'标准误差','ja-JP':'標準誤差'}[plan.locale]??'Standard error')} ${new Intl.NumberFormat(plan.locale,{style:'percent',maximumFractionDigits:2}).format(m.standardError)}</small>`:''}${!exact&&m.samples?`<small>${esc({'zh-CN':'样本','ja-JP':'サンプル'}[plan.locale]??'Samples')} ${m.samples}</small>`:''}</div>`;}).join('');
  const tm=analysis.tournament;if(!tm)return cards;
  const unit=esc(tm.unit==='prize units'?({'zh-CN':'奖金单位','ja-JP':'賞金単位'}[plan.locale]??tm.unit):tm.unit),chipUnit=unitLabel(plan,analysis.decision),percent=n=>new Intl.NumberFormat(plan.locale,{style:'percent',maximumFractionDigits:1}).format(n),label={
    'zh-CN':{name:'玩家',stack:'筹码量',share:'筹码占比',icm:'ICM 奖金权益',chop:'按筹码分奖',outcomes:'明确假设的后续情景',chance:'概率',delta:'ICM 变化',expected:'加权预期变化',note:'ICM 按筹码量估计名次概率；筹码收益与奖金权益使用不同单位。',pending:'当前下注尚未结算：基准使用本手投入前筹码。'},
    'ja-JP':{name:'プレイヤー',stack:'スタック',share:'チップ比率',icm:'ICM 賞金エクイティ',chop:'チップ比例の賞金',outcomes:'明示した仮定のシナリオ',chance:'確率',delta:'ICM の変化',expected:'加重期待値の変化',note:'ICM はチップ量から順位確率を推定します。チップ利益と賞金エクイティは別の単位です。',pending:'未決着のポット：このハンドへの投入前スタックが基準です。'},
    'en-US':{name:'Player',stack:'Stack',share:'Chip share',icm:'ICM prize equity',chop:'Chip-proportional prize',outcomes:'Explicit hypothetical outcomes',chance:'Probability',delta:'ICM change',expected:'Expected change',note:'ICM estimates finishing probabilities from stacks. Chip gain and prize equity use different units.',pending:'Unsettled hand: baseline uses stacks before this hand’s contributions.'}
  }[plan.locale]??{};
  const rows=tm.players.map(player=>`<tr class="${player.id===tm.hero?'icm-hero':''}"><th>${esc(analysis.decision.seats.find(s=>s.id===player.id)?.name??player.id)}</th><td>${fmt(player.stack)} ${chipUnit}</td><td>${percent(player.chipShare)}</td><td>${fmt(player.equity)} ${unit}</td><td>${fmt(player.chipChop)} ${unit}</td></tr>`).join('');
  const outcomes=tm.outcomes?.length?`<div class="icm-outcomes"><h3>${label.outcomes}</h3>${tm.outcomes.map(o=>`<div><span>${esc(o.label??o.id)}</span><b>${percent(o.probability)}</b><span>${label.delta}: ${fmt(o.icmDelta)} ${unit}</span><span>Δ ${fmt(o.chipDelta)} ${chipUnit}</span></div>`).join('')}</div>`:'';
  const expected=tm.expected?`<p class="icm-expected">${label.expected}: ${fmt(tm.expected.icmDelta)} ${unit} · Δ ${fmt(tm.expected.chipDelta)} ${chipUnit}</p>`:'';
  return cards+`<section class="tournament-study" data-metric="icm"><div class="analysis-kicker">${teachingText(plan,'tournament')}<span>${tm.payouts.map(fmt).join(' / ')} ${unit}</span></div><table><thead><tr>${['name','stack','share','icm','chop'].map(k=>`<th>${label[k]??k}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${outcomes}${expected}<p class="icm-note">${label.note??''}${tm.baseline==='stacksBeforeThisHandContributions'?' '+label.pending:''}</p></section>`;
}
function comparisonMarkup(plan,comparison){
  const fmt=n=>new Intl.NumberFormat(plan.locale,{maximumFractionDigits:2}).format(n),t=key=>plan.dictionary.strings[key]??teachingText(plan,key),shown=value=>Array.isArray(value)?value.map(x=>typeof x==='string'&&/^[2-9TJQKA][shdc]$/.test(x)?x[0]+suit[x[1]]:String(x)).join(' '):value===null?'—':typeof value==='object'?JSON.stringify(value):String(value),money=state=>fmt(state.pot)+' '+unitLabel(plan,state);
  const labels=plan.locale==='zh-CN'?{street:'街道',actor:'当前行动者',hero:'第一视角',button:'按钮位',unit:'单位',streetBet:'本街投入',contributed:'本手投入',folded:'已弃牌',hole:'手牌',rangeChange:'范围资料已改变',yes:'是',no:'否'}:plan.locale==='ja-JP'?{street:'ストリート',actor:'アクションする人',hero:'ヒーロー',button:'ボタン',unit:'単位',streetBet:'現在のベット',contributed:'投入額',folded:'フォールド済み',hole:'ホールカード',rangeChange:'レンジデータを変更',yes:'はい',no:'いいえ'}:{street:'Street',actor:'Acting player',hero:'Hero',button:'Button',unit:'Unit',streetBet:'Street commitment',contributed:'Total commitment',folded:'Folded',hole:'Hole cards',rangeChange:'Range data changed',yes:'Yes',no:'No'};
  const playerName=id=>comparison.origin.decision.seats.find(seat=>seat.id===id)?.name??comparison.routes.flatMap(route=>route.start.decision.seats).find(seat=>seat.id===id)?.name??id;
  const difference=d=>{
    if(d.field==='range'){
      const summary=value=>value?`${fmt(value.combinationCount)} ${t('combos')}${value.weightedCount===null?'':` · ${t('weight')} ${fmt(value.weightedCount)}`}`:'—';
      const fields=(d.changedFields??[]).map(field=>t(field==='actions'?'frequency':field)).join(' / '),hands=(d.changedHands??[]).slice(0,4).join(', ')+((d.changedHands?.length??0)>4?'…':'');
      return `<p><span>${t('range')}</span> ${esc(summary(d.before))} → ${esc(summary(d.after))}</p><p>${esc(labels.rangeChange)}${fields?' · '+esc(fields):''}${hands?' · '+esc(hands):''}</p>`;
    }
    const seat=d.field.match(/^seat:(.+?)(?:\/(stack|streetBet|contributed|folded|hole))?$/),key=seat?.[2]??d.field,label=seat?playerName(seat[1])+(seat[2]?' · '+(labels[key]??t(key)):''):(labels[key]??t(key));
    const value=x=>x===null?'—':typeof x==='boolean'?labels[x?'yes':'no']:['actor','hero','button'].includes(key)?playerName(x):key==='street'?t(x):key==='unit'?unitLabel(plan,{unit:x}):Array.isArray(x)?x.map(card=>card===null?'••':card[0]+(suit[card[1]]??'')).join(' '):x&&typeof x==='object'&&'stack'in x?`${t('stack')} ${fmt(x.stack)}`:shown(x);
    return `<p><span>${esc(label)}</span> ${esc(value(d.before))} → ${esc(value(d.after))}</p>`;
  };
  const routeCards=comparison.routes.map(r=>{
    const from=r.start.decision,to=r.end.decision,hero=to.seats.find(s=>s.id===to.hero);
    const actions=r.actions.map(a=>a.type==='deal'?`${t(a.street??'board')}: ${(a.cards??[]).map(c=>c[0]+suit[c[1]]).join(' ')}`:`${from.seats.find(s=>s.id===a.seat)?.name??''} ${t(a.type)}${Number.isFinite(a.to)?' '+fmt(a.to):''}`).filter(Boolean);
    return `<article class="comparison-route" data-route="${esc(r.id)}"><h2>${esc(r.label)}</h2><div class="comparison-start"><span>${teachingText(plan,'start')}</span><b>${money(from)}</b><div>${from.board.map(c=>`<span class="comparison-card ${'hd'.includes(c[1])?'red':''}">${c[0]}${suit[c[1]]}</span>`).join('')}</div></div><ol class="comparison-actions">${actions.map(x=>`<li>${esc(x)}</li>`).join('')||`<li>${teachingText(plan,'unchanged')}</li>`}</ol><dl class="comparison-result"><div><dt>${teachingText(plan,'end')} · ${t('pot')}</dt><dd>${money(to)}</dd></div><div><dt>${esc(hero?.name??t('hero'))} · ${t('stack')}</dt><dd>${fmt(hero?.stack??0)} ${unitLabel(plan,to)}</dd></div></dl>${r.differences.length?`<div class="comparison-differences"><h3>${teachingText(plan,'changes')}</h3>${r.differences.map(difference).join('')}</div>`:''}${r.end.takeaway?`<p class="route-takeaway">${esc(r.end.takeaway)}</p>`:''}</article>`;
  }).join('');
  return `<section class="comparison-study" data-reveal="comparison"><div class="analysis-kicker">${teachingText(plan,comparison.mode)}</div><div class="comparison-routes" style="--route-count:${comparison.routes.length}">${routeCards}</div><p class="comparison-note">${teachingText(plan,'routeNote')}</p></section>`;
}
function presentationLayout(markup,plan,p,time){
  if(!p.annotations?.length&&!p.camera)return markup;
  const duration=p.camera?.duration??0,elapsed=time-(p.cameraStart??time),q=duration?Math.max(0,Math.min(1,elapsed/duration)):1;
  const settings={annotations:p.annotations??[],camera:p.camera?{target:p.camera.target,scale:1+(p.camera.scale-1)*q*q*(3-2*q)}:null};
  return `<div class="presentation-stage ${plan.aspect}" data-layout="${esc(JSON.stringify(settings))}"><div class="camera-world">${markup}</div><svg class="annotation-layer" aria-hidden="true"></svg></div>`;
}
// A teaching frame is a complete snapshot. Seeking never changes game or reveal state.
export function presentationMarkup(plan,frame,time,options={}){
  const p=frame.presentation,t=key=>plan.dictionary.strings[key]??key;
  if(!p||options.presentation===false)return clientMarkup(plan,frame,time,options);
  if(p.surface==='table'){
    const table=clientMarkup(plan,frame,time,{...options,focus:p.focus??[]}),brief=p.title||p.question;
    return presentationLayout(`<div class="teaching-table ${plan.aspect} ${brief?'has-brief':''}" data-teaching-surface="table">${brief?`<header class="table-brief"><span>${esc(p.title??t('teachingQuestion'))}</span>${p.question?`<p>${esc(p.question)}</p>`:''}</header><div class="table-remainder">${table}</div>`:table}</div>`,plan,p,time);
  }
  const a=p.analysis??{},s=a.decision??p.context??frame.state,hero=s.seats.find(seat=>seat.id===s.hero),actor=s.seats.find(seat=>seat.id===s.actor),shown=new Set(p.show??['range','calculation','conditions']),range=a.range,calc=a.calculation;
  const stateKey=value=>JSON.stringify([value.street,value.board,value.pot,value.actor,value.roundClosed,value.settled,value.seats.map(seat=>[seat.id,seat.stack,seat.contributed,seat.streetBet,seat.folded])]),replay=!!a.decision&&stateKey(a.decision)!==stateKey(frame.state);
  const focus=p.focus??[],cardFocus=c=>focus.includes('card:'+c)?'is-focused':'',boardFocus=focus.includes('board')||s.board.some(c=>focus.includes('card:'+c)),heroFocus=focus.includes('hero')||focus.includes('seat:'+s.hero)||(hero?.hole??[]).some(c=>focus.includes('card:'+c));
  const unit=unitLabel(plan,s),fmt=n=>new Intl.NumberFormat(plan.locale,{maximumFractionDigits:2}).format(n),show=(key,exists=true)=>`class="analysis-panel ${shown.has(key)&&exists?'':'concealed'}" data-reveal="${key}" ${shown.has(key)&&exists?'':'aria-hidden="true"'}`;
  const threshold=calc?.applicable?new Intl.NumberFormat(plan.locale,{style:'percent',maximumFractionDigits:2}).format(calc.threshold):null;
  const seats=`<div class="analysis-seats">${s.seats.map(seat=>`<div class="analysis-seat ${seat.folded?'folded':''} ${focus.includes('seat:'+seat.id)?'is-focused':''}" data-focus-target="${esc('seat:'+seat.id)}" aria-label="${esc(seat.name)} · ${fmt(seat.stack)} ${unit}${seat.folded?' · '+t('fold'):''}"><span>${esc(seat.name)}</span><b data-target="${esc('stack:'+seat.id)}">${fmt(seat.stack)}<small> ${unit}</small></b>${seat.streetBet>0?`<em data-target="${esc('bet:'+seat.id)}">${fmt(seat.streetBet)}</em>`:''}${seat.folded?`<em>${t('fold')}</em>`:''}${seat.id!==s.hero&&seat.hole.some(Boolean)?`<div class="analysis-seat-cards">${seat.hole.filter(Boolean).map(c=>`<span class="analysis-public-card ${'hd'.includes(c[1])?'red':''} ${cardFocus(c)}" data-card="${c}" data-focus-target="card:${c}">${c[0]==='T'?'10':c[0]}${suit[c[1]]}</span>`).join('')}</div>`:''}</div>`).join('')}</div>`;
  const context=`<aside class="analysis-context ${focus.length?'has-focus':''}"><div class="context-eyebrow">${t(s.street)} <span>${s.seats.filter(seat=>!seat.folded).length} ${t('teachingPlayers')}</span></div><div class="analysis-board ${boardFocus?'is-focused':''}">${Array.from({length:5},(_,i)=>card(s.board[i],cardFocus(s.board[i]))).join('')}</div><div class="analysis-hero ${heroFocus?'is-focused':''}"><div><span>${t('hole')}</span><b>${esc(hero?.name??t('hero'))}</b></div><div class="analysis-hole">${(hero?.hole??[]).map(c=>card(c,cardFocus(c))).join('')}</div></div><dl class="analysis-facts"><div data-target="pot" class="${focus.includes('pot')?'is-focused':''}"><dt>${t('pot')}</dt><dd>${fmt(s.pot)} <small>${unit}</small></dd></div><div data-target="${esc('stack:'+s.hero)}"><dt>${t('stack')}</dt><dd>${fmt(hero?.stack??0)} <small>${unit}</small></dd></div>${s.legalActions.find(action=>action.type==='call')?`<div><dt>${t('call')}</dt><dd>${fmt(s.legalActions.find(action=>action.type==='call').amount)} <small>${unit}</small></dd></div>`:''}<div class="${focus.includes('seat:'+s.actor)?'is-focused':''}"><dt>${t('actor')}</dt><dd>${esc(actor?.name??t('closed'))}</dd></div></dl>${seats}<div class="context-footnote">${t(replay?'teachingReplayContext':'teachingContext')}</div></aside>`;
  const groups=(range?.groups??[]).map((group,i)=>`<div class="range-group" data-group="${esc(group.id)}"><span class="range-dot tone-${i%4}"></span><div><h3>${esc(group.label)}</h3><div class="range-hands">${group.hands.map(hand=>`<span>${esc(hand)}</span>`).join('')}</div></div></div>`).join('');
  const calculation=calc?`<div ${show('calculation')}><div class="analysis-kicker">${t('teachingPrice')}</div>${calc.applicable?`<div class="analysis-equation">${fmt(calc.call)} <span>÷</span> ${fmt(calc.total)} <span>=</span> <strong>${threshold}</strong></div><p>${t('teachingPotOddsNote')}</p>`:`<p class="calculation-unavailable">${t('teachingPriceUnavailable')}</p>`}</div>`:`<div class="analysis-panel concealed" aria-hidden="true"></div>`;
  const sections=new Set(p.layoutSections??p.show??[]),advanced=p.comparison&&sections.has('comparison')||p.rangeView&&p.rangeView.mode!=='groups'||(a.metrics?.length||a.tournament)&&sections.has('metrics');
  if(advanced){
    const question=p.question?`<div class="analysis-question"><span>${t('teachingQuestion')}</span><h2>${esc(p.question)}</h2></div>`:'';
    const compare=p.comparison&&sections.has('comparison');
    const rangeStudy=p.rangeView&&p.rangeView.mode!=='groups'?rangeStudyMarkup(plan,range??{},p.rangeView):groups?`<div class="analysis-kicker">${t('teachingRangeGroups')} <span>${t('teachingAssumptionsLabel')}</span></div><div class="range-groups" style="--range-columns:${Math.max(1,Math.min(3,range?.groups?.length??1))}">${groups}</div>`:'';
    const study=compare?`<div class="comparison-reservation ${shown.has('comparison')?'':'concealed'}">${comparisonMarkup(plan,p.comparison)}</div>`:sections.has('range')&&rangeStudy?`<section class="research-panel ${shown.has('range')?'':'concealed'}" data-reveal="range">${rangeStudy}</section>`:'';
    const metrics=sections.has('metrics')?metricsMarkup(plan,a):'',dense=p.rangeView?.mode==='matrix'&&sections.has('metrics')&&sections.has('calculation');
    return presentationLayout(`<div class="teaching-frame advanced-frame ${dense?'dense-research':''} ${plan.aspect}" data-teaching-surface="analysis"><header class="analysis-heading"><span class="analysis-mode">${t(replay?'teachingReplayPause':'teachingAnalysisPause')}</span><h1>${esc(p.title??a.title??t('teachingAnalysis'))}</h1></header><div class="analysis-layout">${context}<main class="advanced-content">${question}${study}${metrics?`<section class="metrics-grid ${shown.has('metrics')?'':'concealed'}" data-reveal="metrics" data-target="calculation" style="--metric-columns:${Math.max(1,Math.min(3,a.metrics?.length??1))}">${metrics}</section>`:''}${sections.has('calculation')&&calc?calculation:''}${sections.has('conditions')&&(a.conditions||a.assumptions)?`<p class="research-conditions ${shown.has('conditions')?'':'concealed'}" data-reveal="conditions">${esc(a.conditions??a.assumptions)}</p>`:''}${sections.has('takeaway')&&a.takeaway?`<p class="research-takeaway ${shown.has('takeaway')?'':'concealed'}" data-reveal="takeaway">${esc(a.takeaway)}</p>`:''}</main></div><footer class="analysis-evidence ${shown.has('evidence')&&a.evidence?'':'concealed'}">${esc(a.evidence?.model??a.evidence?.source??'')}</footer></div>`,plan,p,time);
  }
  return presentationLayout(`<div class="teaching-frame ${plan.aspect}" data-teaching-surface="analysis"><header class="analysis-heading"><span class="analysis-mode">${t(replay?'teachingReplayPause':'teachingAnalysisPause')}</span><h1>${esc(p.title??a.title??t('teachingAnalysis'))}</h1></header><div class="analysis-layout">${context}<main class="analysis-content"><div class="analysis-question ${p.question?'':'concealed'}" ${p.question?'':'aria-hidden="true"'}><span>${t('teachingQuestion')}</span><h2>${esc(p.question??'')}</h2></div><div ${show('range',!!groups)}><div class="analysis-kicker">${t('teachingRangeGroups')} <span>${t('teachingAssumptionsLabel')}</span></div><div class="range-groups" style="--range-columns:${Math.max(1,Math.min(3,range?.groups?.length??1))}">${groups}</div></div>${calculation}<div ${show('conditions',!!a.conditions||!!a.assumptions)}><div class="analysis-kicker">${t('teachingConditions')}</div><p>${esc(a.conditions??'')}${a.assumptions?`${a.conditions?' · ':''}${esc(a.assumptions)}`:''}</p></div><div ${show('takeaway',!!a.takeaway)}><div class="analysis-kicker">${t('teachingTakeaway')}</div><p class="analysis-takeaway">${esc(a.takeaway??'')}</p></div></main></div><footer class="analysis-evidence ${shown.has('evidence')&&a.evidence?'':'concealed'}" ${shown.has('evidence')&&a.evidence?'':'aria-hidden="true"'}><span>${t('teachingEvidence')} · ${t('teachingEvidence_'+(a.evidence?.kind??'hypothesis'))} · ${t('teachingAuthorProvided')}</span>${esc(a.evidence?.model??a.evidence?.source??'')}</footer></div>`,plan,p,time);
}
export function renderFrame(plan,index,options={}){
  const i=Math.max(0,Math.min(Math.floor(index),plan.totalFrames-1)),frame=frameAt(plan,i),time=i/plan.fps,markup=presentationMarkup(plan,frame,time,options),captions=options.captions??plan.captions;
  const mark=html=>plan.rehearsal?`<div class="rehearsal-wrap ${plan.aspect}">${html}<span class="rehearsal-label">${esc({'zh-CN':'画面排演 · 配音待制作','ja-JP':'映像リハーサル · 音声制作待ち'}[plan.locale]??'Visual rehearsal · narration pending')}</span></div>`:html;
  if(!captions)return mark(markup);
  const cue=narrationAt(plan,i),elapsed=cue?.elapsed??0,explicit=cue?.captionCues?.find(c=>elapsed>=c.start&&elapsed<c.end);
  const passage=cue?.captionCues?(explicit?{text:explicit.text,elapsed:elapsed-explicit.start,duration:explicit.end-explicit.start}:null):cue?{text:cue.text,elapsed,duration:cue.duration}:null;
  const text=passage?captionPages(passage.text,plan.aspect==='portrait').find(p=>passage.elapsed/passage.duration<p.endFraction)?.text??'':'';
  return mark(`<div class="output-frame captions-on ${plan.aspect}"><div class="game-surface">${markup}</div><div class="caption-lane">${esc(text)}</div></div>`);
}

/** Deterministic layout from this frame's actual semantic objects, shared by preview/export. */
export function layoutFrame(root){
  const stages=[...(root.matches?.('.presentation-stage')?[root]:[]),...root.querySelectorAll('.presentation-stage')],ns='http://www.w3.org/2000/svg';
  for(const stage of stages){
    const settings=JSON.parse(stage.dataset.layout),world=stage.querySelector('.camera-world'),svg=stage.querySelector('.annotation-layer');
    world.style.transform='none';svg.replaceChildren();delete stage.dataset.missingTargets;
    const bounds=stage.getBoundingClientRect(),width=bounds.width,height=bounds.height;if(!width||!height)continue;
    const elements=[...world.querySelectorAll('[data-target],[data-card],[data-seat],[data-group],[data-focus-target]')],visible=e=>e&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0;
    const locate=target=>{
      if(target==='calculation')return [...world.querySelectorAll('[data-reveal="calculation"]'),...world.querySelectorAll('[data-reveal="metrics"]')].find(visible)??null;
      const explicit=elements.find(e=>(e.dataset.target===target||e.dataset.focusTarget===target)&&visible(e));if(explicit)return explicit;
      let element;
      if(target==='hero')element=world.querySelector('.analysis-hero')??world.querySelector('.seat.hero .hole-cards');
      else if(target==='board')element=world.querySelector('.analysis-board')??world.querySelector('.board-cards');
      else if(target==='pot')element=world.querySelector('.pot-label');
      else if(target.startsWith('seat:'))element=elements.find(e=>e.dataset.seat===target.slice(5));
      else if(target.startsWith('card:'))element=elements.find(e=>e.dataset.card===target.slice(5));
      else if(target.startsWith('range:')){const group=elements.find(e=>e.dataset.group===target.slice(6));element=group?.querySelector(':scope > div')??group;}
      return visible(element)?element:null;
    };
    const missing=[];
    if(settings.camera){const target=locate(settings.camera.target);if(target){const r=target.getBoundingClientRect(),ratio=width/stage.clientWidth,scale=settings.camera.scale,x=(r.left+r.width/2-bounds.left)/ratio,y=(r.top+r.height/2-bounds.top)/ratio,w=stage.clientWidth,h=stage.clientHeight,tx=Math.max(w-w*scale,Math.min(0,w/2-x*scale)),ty=Math.max(h-h*scale,Math.min(0,h/2-y*scale));world.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;}else missing.push(settings.camera.target);}
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const resolve=target=>{
      if(Array.isArray(target))return {x:target[0]*width,y:target[1]*height,width:0,height:0};
      const e=locate(target);if(!e){missing.push(target);return null;}const r=e.getBoundingClientRect();return {x:r.left+r.width/2-bounds.left,y:r.top+r.height/2-bounds.top,width:r.width,height:r.height};
    };
    const node=(tag,attrs,parent=svg)=>{const e=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))e.setAttribute(key,String(value));parent.append(e);return e;};
    let occupied;
    const labelPosition=(box,font)=>{
      if(!occupied){
        occupied=[];const relative=r=>({x:r.left-bounds.left-2,y:r.top-bounds.top-2,width:r.width+4,height:r.height+4});
        const walker=document.createTreeWalker(world,NodeFilter.SHOW_TEXT);let child;
        while((child=walker.nextNode()))if(child.textContent.trim()&&visible(child.parentElement)){const range=document.createRange();range.selectNodeContents(child);for(const rect of range.getClientRects())if(rect.width&&rect.height)occupied.push(relative(rect));}
        for(const element of world.querySelectorAll('.card'))if(visible(element))occupied.push(relative(element.getBoundingClientRect()));
        for(const element of root.querySelectorAll('.rehearsal-label'))if(visible(element))occupied.push(relative(element.getBoundingClientRect()));
      }
      const margin=width*.015,limitX=width-margin-box.width,limitY=height-margin-box.height,clamp=(n,max)=>Math.max(margin,Math.min(max,n)),candidates=[];
      const add=(x,y)=>candidates.push({x:clamp(x,limitX),y:clamp(y,limitY)});
      add(box.x,box.y);for(const x of [width*.5-box.width/2,margin,limitX])add(x,box.y);
      for(let y=margin;y<=limitY;y+=font*1.5)for(let x=margin;x<=limitX;x+=width*.08)add(x,y);
      const overlap=(p,r)=>Math.max(0,Math.min(p.x+box.width,r.x+r.width)-Math.max(p.x,r.x))*Math.max(0,Math.min(p.y+box.height,r.y+r.height)-Math.max(p.y,r.y));
      let chosen=candidates[0],score=Infinity;
      for(const candidate of candidates){const obstruction=occupied.reduce((sum,r)=>sum+overlap(candidate,r),0),distance=(candidate.x-box.x)**2+(candidate.y-box.y)**2,cost=obstruction*1e6+distance;if(cost<score){score=cost;chosen=candidate;}}
      occupied.push({...chosen,width:box.width,height:box.height});return chosen;
    };
    for(const annotation of settings.annotations){
      const color=annotation.color??'#efc985',stroke=(annotation.width??2)*width/960,g=node('g',{'data-annotation':annotation.id,'data-kind':annotation.type,'stroke-width':stroke,fill:'none'});g.setAttribute('stroke',color);
      if(annotation.type==='arrow'){
        const a=resolve(annotation.from),b=resolve(annotation.to);if(!a||!b){g.remove();continue;}const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1){g.remove();continue;}const ux=dx/len,uy=dy/len,edge=Math.min(len/3,Math.min(b.width/2/(Math.abs(ux)||1e-9),b.height/2/(Math.abs(uy)||1e-9))),x=b.x-ux*edge,y=b.y-uy*edge,head=Math.max(8,width*.012);
        node('line',{x1:a.x,y1:a.y,x2:x,y2:y,'stroke-linecap':'round'},g);node('path',{d:`M ${x-ux*head-uy*head*.45} ${y-uy*head+ux*head*.45} L ${x} ${y} L ${x-ux*head+uy*head*.45} ${y-uy*head-ux*head*.45}`,'stroke-linecap':'round','stroke-linejoin':'round'},g);
      }else if(annotation.type==='circle'){
        const a=resolve(annotation.target);if(!a){g.remove();continue;}node('ellipse',{cx:a.x,cy:a.y,rx:Math.max(width*.018,a.width*.55),ry:Math.max(width*.018,a.height*.58)},g);
      }else if(annotation.type==='label'){
        const a=resolve(annotation.target);if(!a){g.remove();continue;}const font=Math.max(12,width*(stage.classList.contains('portrait')?.029:.014)),lines=captionSegments(annotation.text,stage.classList.contains('portrait')),x=Math.max(width*.03,Math.min(width*.97,a.x)),y=Math.max(font*1.7,Math.min(height-font*1.4,a.y-a.height/2-font*.75)),text=node('text',{x,y,'text-anchor':'middle','font-size':font,'font-family':'inherit',fill:color,stroke:'none'},g);
        lines.slice(0,3).forEach((line,i)=>{const span=node('tspan',{x,dy:i?font*1.35:0},text);span.textContent=line;});let r=text.getBBox();if(r.width>width*.9){text.setAttribute('font-size',font*width*.9/r.width);r=text.getBBox();}const box={x:r.x-font*.45,y:r.y-font*.2,width:r.width+font*.9,height:r.height+font*.4},position=labelPosition(box,font);text.setAttribute('transform',`translate(${position.x-box.x},${position.y-box.y})`);const rect=node('rect',{...position,width:box.width,height:box.height,rx:font*.3,fill:'#101a25',stroke:color,'stroke-width':stroke*.6},g);g.insertBefore(rect,text);
      }else if(annotation.type==='path')node('polyline',{points:annotation.points.map(p=>`${p[0]*width},${p[1]*height}`).join(' '),'stroke-linecap':'round','stroke-linejoin':'round'},g);
      else if(annotation.type==='image'||annotation.type==='svg'){
        const b=annotation.box,source=annotation.type==='svg'?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(annotation.source):annotation.source;
        node('image',{x:b.x*width,y:b.y*height,width:b.width*width,height:b.height*height,href:source,preserveAspectRatio:'xMidYMid meet'},g);
      }
    }
    if(missing.length)stage.dataset.missingTargets=[...new Set(missing)].join(',');
  }
}

const artworkCache=new Map();
/** Decode local artwork before playback/capture, so a corrupt image cannot become a blank final frame. */
export async function prepareArtwork(plan){
  const sources=new Set(plan.frames.flatMap(frame=>(frame.presentation?.annotations??[]).filter(a=>a.type==='image'||a.type==='svg').map(a=>a.type==='svg'?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(a.source):a.source)));
  for(const source of sources){
    if(!artworkCache.has(source)){
      const promise=(async()=>{const image=new Image();image.src=source;await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>4096||image.naturalHeight>4096)throw new Error('PRESENTATION_ASSET: artwork cannot be decoded within the image size limit.');})();
      artworkCache.set(source,promise);promise.catch(()=>artworkCache.delete(source));
    }
    await artworkCache.get(source);
  }
}
