import {check, errorJSON} from './errors.mjs';
import {clone,hash} from './util.mjs';

const surfaces = ['table', 'analysis'];
const sections = ['range', 'calculation', 'conditions', 'takeaway', 'evidence', 'comparison', 'metrics'];
const visualFields = ['surface','focus','show','annotations','camera','rangeView','comparison','motion'];
const object = (value, path) => check(value && typeof value === 'object' && !Array.isArray(value), 'SCHEMA', 'Expected an object.', path);
function keys(value, allowed, path) {
  object(value, path);
  for (const key of Object.keys(value)) check(allowed.includes(key), 'UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}/${key}`);
}
function textMap(value, path) {
  object(value, path);
  for (const [locale, text] of Object.entries(value)) check(typeof text === 'string', 'SCHEMA', 'Expected localized text.', `${path}/${locale}`);
}
function selection(value, choices, path) {
  check(Array.isArray(value) && value.every(x => choices.includes(x)) && new Set(value).size === value.length, 'PRESENTATION', 'Use distinct supported sections.', path, {allowed: choices});
}
const targetValid = x => typeof x === 'string' && (['hero','board','pot','calculation'].includes(x) || /^(seat|bet|stack|range):[^\s]+$/.test(x) || /^card:[2-9TJQKA][shdc]$/.test(x) || /^hand:[2-9TJQKA]{2}[so]?$/.test(x));
const unit = value => Number.isFinite(value) && value >= 0 && value <= 1;
function focusSchema(value, path) { check(Array.isArray(value) && new Set(value).size === value.length && value.every(targetValid), 'PRESENTATION_TARGET', 'Use a semantic player, card, range or calculation target.', path); }
function anchorSchema(value,path) { check(targetValid(value) || Array.isArray(value) && value.length === 2 && value.every(unit), 'PRESENTATION_TARGET', 'Use a semantic target or normalized [x,y] point.', path); }
function boxSchema(value,path) { keys(value,['x','y','width','height'],path); check(Object.values(value).length === 4 && Object.values(value).every(unit) && value.width > 0 && value.height > 0 && value.x + value.width <= 1 + 1e-9 && value.y + value.height <= 1 + 1e-9,'PRESENTATION_ASSET','Keep the normalized artwork box inside the frame.',path); }

/** A small static SVG subset, without executable or network-capable constructs. */
export function validateArtwork(source,type,path='presentation/annotations/source') {
  check(typeof source === 'string' && source.length <= 2800000,'PRESENTATION_ASSET','Artwork must be embedded and smaller than 2 MiB.',path);
  if(type === 'image') {
    const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
    check(m && m[2].length % 4 === 0,'PRESENTATION_ASSET','Use an embedded PNG, JPEG or WebP image.',path);
    const bytes=Buffer.from(m[2],'base64');
    const signature=m[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    check(bytes.length >= 24 && bytes.length <= 2*1024*1024 && signature && bytes.toString('base64')===m[2],'PRESENTATION_ASSET','Image bytes do not match the declared image format.',path);
    let width,height;
    if(m[1]==='png'&&bytes.toString('ascii',12,16)==='IHDR'){
      width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
      for(let at=8;at+12<=bytes.length;){const length=bytes.readUInt32BE(at),kind=bytes.toString('ascii',at+4,at+8);check(kind!=='acTL','PRESENTATION_ASSET','Use a still PNG, not an asynchronous animation.',path);check(at+12+length<=bytes.length,'PRESENTATION_ASSET','Truncated PNG chunk.',path);at+=12+length;if(kind==='IEND')break;}
    }
    else if(m[1]==='jpeg'){
      for(let at=2;at+4<bytes.length;){if(bytes[at]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;if(at+2>bytes.length)break;const size=bytes.readUInt16BE(at);if(size<2||at+size>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=7){height=bytes.readUInt16BE(at+3);width=bytes.readUInt16BE(at+5);break;}at+=size;}
    }else if(m[1]==='webp'){
      const kind=bytes.toString('ascii',12,16);
      if(kind==='VP8X'&&bytes.length>=30){width=1+bytes.readUIntLE(24,3);height=1+bytes.readUIntLE(27,3);check((bytes[20]&2)===0,'PRESENTATION_ASSET','Use a still WebP, not an asynchronous animation.',path);}
      else if(kind==='VP8L'&&bytes.length>=25&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);}
      else if(kind==='VP8 '&&bytes.length>=30&&bytes.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a]))){width=bytes.readUInt16LE(26)&0x3fff;height=bytes.readUInt16LE(28)&0x3fff;}
    }
    check(width>0&&height>0&&width<=4096&&height<=4096&&width*height<=16777216,'PRESENTATION_ASSET','Use a still image no larger than 4096 × 4096 pixels.',path);return;
  }
  check(source.length <= 200000 && !/<!|<\?|\b(?:javascript|data):|\bon[a-z]+\s*=|\bstyle\s*=|\bhref\s*=/i.test(source),'PRESENTATION_ASSET','SVG must contain only static, local geometry.',path);
  const tags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','lineargradient','radialgradient','stop','title','desc']);
  const attrs=new Set(['xmlns','viewbox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','fill-opacity','stroke-opacity','transform','text-anchor','dominant-baseline','font-size','font-family','font-weight','id','offset','stop-color','stop-opacity','gradientunits','gradienttransform','fx','fy']);
  const token=/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g,stack=[];let cursor=0,root=false,match;
  while((match=token.exec(source))) {
    check(!/[<>]/.test(source.slice(cursor,match.index)),'PRESENTATION_ASSET','Malformed SVG text.',path);cursor=token.lastIndex;
    const m=/^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9]*)\b([\s\S]*?)(\/?)\s*>$/.exec(match[0]);
    check(m&&tags.has(m[2].toLowerCase()),'PRESENTATION_ASSET','Unsupported SVG element.',path);
    const name=m[2].toLowerCase();
    if(m[1]) {check(!m[3].trim() && stack.pop()===name,'PRESENTATION_ASSET','Unbalanced SVG element.',path);continue;}
    if(!root) {check(name==='svg','PRESENTATION_ASSET','Artwork must have one SVG root.',path);root=true;} else check(stack.length>0,'PRESENTATION_ASSET','Artwork must have one SVG root.',path);
    let rest=m[3],attribute;
    while(rest.trim()) {
      attribute=/^\s*([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
      check(attribute&&attrs.has(attribute[1].toLowerCase()),'PRESENTATION_ASSET','Unsupported SVG attribute.',path);
      const key=attribute[1].toLowerCase(),value=attribute[2]??attribute[3];
      check(!/[<>&]/.test(value),'PRESENTATION_ASSET','SVG attributes cannot use markup or entity escapes.',path);
      if(key==='xmlns')check(value==='http://www.w3.org/2000/svg','PRESENTATION_ASSET','Use the SVG namespace.',path);
      if(/url\s*\(/i.test(value))check(/^url\(#[A-Za-z][\w-]*\)$/.test(value),'PRESENTATION_ASSET','SVG may reference only its own gradient IDs.',path);
      rest=rest.slice(attribute[0].length);
    }
    if(!m[4])stack.push(name);
  }
  check(root&&!stack.length&&!source.slice(cursor).trim(),'PRESENTATION_ASSET','Malformed SVG artwork.',path);
}
function annotationsSchema(value,path) {
  check(Array.isArray(value)&&value.length<=40,'PRESENTATION','Use at most 40 annotations.',path);const ids=new Set();
  for(const [i,a] of value.entries()) {
    const p=`${path}/${i}`;keys(a,['id','type','from','to','target','text','points','color','width','source','box'],p);
    check(typeof a.id==='string'&&a.id.trim()&&!ids.has(a.id),'PRESENTATION','Annotation IDs must be nonempty and unique.',p+'/id');ids.add(a.id);
    check(['arrow','circle','label','path','image','svg'].includes(a.type),'PRESENTATION','Unsupported annotation type.',p+'/type');
    if(a.color!==undefined)check(/^#[\da-fA-F]{6}$/.test(a.color),'PRESENTATION','Use a six-digit hex color.',p+'/color');
    if(a.width!==undefined)check(Number.isFinite(a.width)&&a.width>=1&&a.width<=8,'PRESENTATION','Use a pen width from 1 to 8.',p+'/width');
    if(a.type==='arrow'){anchorSchema(a.from,p+'/from');anchorSchema(a.to,p+'/to');}
    if(['circle','label'].includes(a.type))anchorSchema(a.target,p+'/target');
    if(a.type==='label'){textMap(a.text,p+'/text');check(Object.values(a.text).every(x=>x.length<=140),'PRESENTATION','Keep an annotation under 140 characters.',p+'/text');}
    if(a.type==='path')check(Array.isArray(a.points)&&a.points.length>=2&&a.points.length<=500&&a.points.every(point=>Array.isArray(point)&&point.length===2&&point.every(unit)),'PRESENTATION','Use 2–500 normalized drawing points.',p+'/points');
    if(['image','svg'].includes(a.type)){validateArtwork(a.source,a.type,p+'/source');boxSchema(a.box,p+'/box');}
  }
}
function comparisonSchema(value,path) {
  keys(value,['mode','origin','routes'],path);check(['choices','conditions'].includes(value.mode),'PRESENTATION_COMPARE','Choose choices or conditions comparison.',path+'/mode');
  keys(value.origin,['sceneId','analysisId'],path+'/origin');for(const key of ['sceneId','analysisId'])check(typeof value.origin[key]==='string'&&value.origin[key].trim(),'PRESENTATION_COMPARE','Reference a decision analysis.',path+'/origin/'+key);
  check(Array.isArray(value.routes)&&value.routes.length>=2&&value.routes.length<=3,'PRESENTATION_COMPARE','Compare two or three routes.',path+'/routes');const ids=new Set();
  for(const [i,r]of value.routes.entries()){const p=path+'/routes/'+i;keys(r,['id','label','sceneId','startAnalysisId','endAnalysisId'],p);for(const k of ['id','sceneId','startAnalysisId','endAnalysisId'])check(typeof r[k]==='string'&&r[k].trim(),'PRESENTATION_COMPARE','Reference a route and its start/end analyses.',p+'/'+k);check(!ids.has(r.id),'PRESENTATION_COMPARE','Route IDs must be unique.',p+'/id');ids.add(r.id);textMap(r.label,p+'/label');}
}
function visualSchema(value, path) {
  if (value.surface !== undefined) check(surfaces.includes(value.surface), 'PRESENTATION', 'Use table or analysis.', `${path}/surface`);
  if (value.focus !== undefined) focusSchema(value.focus, `${path}/focus`);
  if (value.show !== undefined) selection(value.show, sections, `${path}/show`);
  if(value.annotations!==undefined)annotationsSchema(value.annotations,path+'/annotations');
  if(value.camera!==undefined&&value.camera!==null){keys(value.camera,['target','scale','duration'],path+'/camera');check(targetValid(value.camera.target)&&Number.isFinite(value.camera.scale)&&value.camera.scale>=1&&value.camera.scale<=3,'PRESENTATION_CAMERA','Use a semantic target and scale from 1 to 3.',path+'/camera');if(value.camera.duration!==undefined)check(Number.isFinite(value.camera.duration)&&value.camera.duration>=0&&value.camera.duration<=1.5,'PRESENTATION_CAMERA','Camera transition lasts 0–1.5 seconds.',path+'/camera/duration');}
  if(value.rangeView!==undefined){const r=value.rangeView,p=path+'/rangeView';keys(r,['mode','metric','action','hand','filter','page'],p);check(['groups','matrix','combos'].includes(r.mode),'PRESENTATION_RANGE','Choose groups, matrix or combos.',p+'/mode');if(r.metric!==undefined)check(['weight','rangeShare','frequency','equity','ev'].includes(r.metric),'PRESENTATION_RANGE','Choose an explicit range metric.',p+'/metric');if(['frequency','ev'].includes(r.metric))check(typeof r.action==='string'&&r.action.trim(),'PRESENTATION_RANGE','Action frequency requires its action.',p+'/action');if(r.hand!==undefined)check(/^[2-9TJQKA]{2}[so]?$/.test(r.hand),'PRESENTATION_RANGE','Choose a hand class such as AKs.',p+'/hand');if(r.page!==undefined)check(Number.isSafeInteger(r.page)&&r.page>=0,'PRESENTATION_RANGE','Page must be a nonnegative integer.',p+'/page');if(r.filter!==undefined){keys(r.filter,['category','minWeight'],p+'/filter');if(r.filter.category!==undefined)check(['pair','suited','offsuit'].includes(r.filter.category),'PRESENTATION_RANGE','Unknown hand category.',p+'/filter/category');if(r.filter.minWeight!==undefined)check(unit(r.filter.minWeight),'PRESENTATION_RANGE','Weight filter must lie in [0,1].',p+'/filter/minWeight');}}
  if(value.comparison!==undefined&&value.comparison!==null)comparisonSchema(value.comparison,path+'/comparison');
  if(value.motion!==undefined&&value.motion!==true&&value.motion!==false){const m=value.motion,p=path+'/motion';keys(m,['duration','deal','bet','collect','payout'],p);if(m.duration!==undefined)check(Number.isFinite(m.duration)&&m.duration>=.15&&m.duration<=1.5,'PRESENTATION_MOTION','Motion lasts 0.15–1.5 seconds.',p+'/duration');for(const k of ['deal','bet','collect','payout'])if(m[k]!==undefined)check(typeof m[k]==='boolean','PRESENTATION_MOTION','Motion switches are boolean.',p+'/'+k);}
}
export function presentationCueSchema(cues, path = 'presentation/cues') {
  check(Array.isArray(cues), 'PRESENTATION_TIMING', 'Provide a cue array.', path);
  for (const [i, cue] of cues.entries()) {
    keys(cue, ['at', ...visualFields], `${path}/${i}`);
    check(Number.isFinite(cue.at) && cue.at >= 0 && cue.at <= 86400 && (i === 0 || cue.at > cues[i - 1].at), 'PRESENTATION_TIMING', 'Cue times must strictly increase from zero.', `${path}/${i}/at`);
    check(visualFields.some(k => cue[k] !== undefined), 'PRESENTATION_TIMING', 'A cue must change the presentation.', `${path}/${i}`);
    visualSchema(cue, `${path}/${i}`);
  }
}
export function presentationSchema(value, path = 'presentation') {
  keys(value, ['analysisId', 'title', 'question', 'cues', ...visualFields], path);
  check(surfaces.includes(value.surface), 'PRESENTATION', 'Use table or analysis.', `${path}/surface`);
  visualSchema(value, path);
  if (value.analysisId !== undefined) check(typeof value.analysisId === 'string' && value.analysisId.trim(), 'PRESENTATION', 'Use an analysis ID.', `${path}/analysisId`);
  for (const key of ['title', 'question']) if (value[key] !== undefined) textMap(value[key], `${path}/${key}`);
  if (value.cues !== undefined) {
    object(value.cues, `${path}/cues`);
    for (const [locale, binding] of Object.entries(value.cues)) {
      const p = `${path}/cues/${locale}`;
      keys(binding, ['audioHash', 'cues'], p);
      check(binding.audioHash === null || /^[a-f0-9]{64}$/.test(binding.audioHash), 'PRESENTATION_TIMING', 'Cue binding needs an audio fingerprint or an explicit draft.', `${p}/audioHash`);
      presentationCueSchema(binding.cues, `${p}/cues`);
    }
  }
}

function publicDifferences(a,b) {
  const result=[],add=(field,before,after)=>{if(JSON.stringify(before)!==JSON.stringify(after))result.push({field,before,after});};
  for(const key of ['street','board','pot','actor','hero','button','unit'])add(key,a.decision[key],b.decision[key]);
  for(const seat of a.decision.seats){const next=b.decision.seats.find(x=>x.id===seat.id);for(const key of ['stack','streetBet','contributed','folded','hole'])add(`seat:${seat.id}/${key}`,seat[key],next?.[key]??null);}
  for(const seat of b.decision.seats)if(!a.decision.seats.some(x=>x.id===seat.id))add(`seat:${seat.id}`,null,{stack:seat.stack,hole:seat.hole});
  for(const key of ['assumptions','conditions'])add(key,a[key]??null,b[key]??null);
  if(hash(a.range??null)!==hash(b.range??null)){
    const summary=range=>range?{combinationCount:range.combinationCount??range.combos?.length??0,weightedCount:range.weightedCount??null}:null;
    const combos=range=>new Map((range?.combos??[]).map(combo=>[[...combo.cards].sort().join(''),{hand:combo.hand,weight:combo.weight,actions:combo.actions,equity:combo.equity,ev:combo.ev}]));
    const before=combos(a.range),after=combos(b.range),changed=[...new Set([...before.keys(),...after.keys()])].filter(key=>hash(before.get(key)??null)!==hash(after.get(key)??null));
    const changedFields=['weight','actions','equity','ev'].filter(field=>changed.some(key=>hash(before.get(key)?.[field]??null)!==hash(after.get(key)?.[field]??null)));
    result.push({field:'range',before:summary(a.range),after:summary(b.range),rangeChanged:true,changedCombinations:changed.length,changedHands:[...new Set(changed.map(key=>after.get(key)?.hand??before.get(key)?.hand))],changedFields});
  }
  return result;
}
function continuation(scene,start,end,route) {
  const branch=scene.branches?.find(b=>b.beats.some(beat=>beat.id===end.node.beatId)),beats=route(scene,branch?.id);let seen=false,actions=[];
  for(const beat of beats){
    const list=beat.actions??[],last=beat.id===end.node.beatId?(end.node.actionIndex??list.length-1):list.length-1;
    const first=beat.id===start.node.beatId?(start.node.actionIndex??list.length-1)+1:0;
    if(beat.id===start.node.beatId)seen=true;
    if(seen)actions.push(...list.slice(first,last+1));
    if(beat.id===end.node.beatId){check(seen&&(beat.id!==start.node.beatId||last>=first-1),'PRESENTATION_COMPARE','Route end must follow its declared start.','comparison/routes');return clone(actions);}
  }
  check(false,'PRESENTATION_COMPARE','Route start/end must be on the same route.','comparison/routes');
}

// Resolve once in the compiler. Every emitted frame is a complete, seekable view;
// neither the player nor FFmpeg needs to replay presentation events.
export function compilePresentations(plan, project, {compileAnalysis, stateInBB, route, timingBindingCurrent}) {
  if (!project.lesson.scenes.some(scene => [...scene.beats, ...(scene.branches ?? []).flatMap(b => b.beats)].some(beat => beat.presentation))) return plan;
  const issues = plan.issues, resolved = new Map(), analyses = new Map(), comparisons=new Map(), timing = new Map(), output = [];
  const at = seconds => Math.ceil(seconds * plan.fps - 1e-9);
  for (const frame of plan.frames) {
    const scene = project.lesson.scenes.find(s => s.id === frame.sceneId);
    const beat = [...scene.beats, ...(scene.branches ?? []).flatMap(b => b.beats)].find(b => b.id === frame.beatId);
    const value = beat.presentation;
    if (!value) { output.push(frame); continue; }
    const location = {sceneId: frame.sceneId, entryId: frame.entryId, beatId: frame.beatId};
    const issue = (code, path, message) => issues.push({code, path, message, retryable: false, target: location});
    const key = JSON.stringify([frame.entryId, scene.id, beat.id]);
    const path = `scenes/${scene.id}/beats/${beat.id}/presentation`;
    if (!resolved.has(key)) {
      const localized = (map, name) => {
        if (map === undefined) return undefined;
        if (!map[plan.locale]?.trim()) { issue('TRANSLATION_MISSING', `${path}/${name}/${plan.locale}`, 'Missing presentation translation.'); return '…'; }
        return map[plan.locale];
      };
      const base = {surface: value.surface, focus: value.focus ?? [], show: value.show ?? ['range', 'calculation', 'conditions']};
      for(const name of ['annotations','camera','rangeView','comparison','motion'])if(value[name]!==undefined)base[name]=clone(value[name]);
      for (const name of ['title', 'question']) if (value[name] !== undefined) base[name] = localized(value[name], name);
      let nodeIndex = null, nodeBeatIndex = null;
      if (value.analysisId) {
        const material = scene.analysis?.find(a => a.id === value.analysisId);
        if (!material) issue('ANALYSIS_UNKNOWN', `${path}/analysisId`, 'Choose an analysis record in this scene.');
        else {
          try {
            const analysisKey = JSON.stringify([scene.id, material.id]);
            if (!analyses.has(analysisKey)) analyses.set(analysisKey, compileAnalysis(scene, material, plan.locale));
            const result = analyses.get(analysisKey);
            const {issues: analysisIssues, ...analysis} = result;
            base.analysis = {...analysis, decision: stateInBB(analysis.decision)};
            for (const problem of analysisIssues ?? []) issues.push({...problem, path: `${path}/analysisId`, detail: {analysisId: material.id, sourcePath: problem.path}, target: location});
            let count = 0;
            for (const [index, b] of route(scene, frame.branchId).entries()) {
              if (b.id === material.node.beatId) { nodeBeatIndex = index; nodeIndex = count + (material.node.actionIndex === undefined ? (b.actions ?? []).length : material.node.actionIndex + 1); break; }
              count += (b.actions ?? []).length;
            }
            if (nodeIndex === null) { issue('ANALYSIS_ROUTE', `${path}/analysisId`, 'The decision is not on this route.'); delete base.analysis; }
          } catch (error) { issues.push({...errorJSON(error), path: `${path}/analysis/${material.id}`, target: location}); }
        }
      }
      if (base.surface === 'analysis' && !value.analysisId) issue('ANALYSIS_UNKNOWN', path, 'An analysis canvas needs a decision reference.');
      resolved.set(key, {base, nodeIndex, nodeBeatIndex});
      const frames = plan.frames.filter(f => f.entryId === frame.entryId && f.sceneId === frame.sceneId && f.beatId === beat.id);
      const first = frames[0].startFrame, end = frames.at(-1).endFrame;
      const speech = frames.find(f => f.narration);
      const origin = speech ? at(speech.narrationStart ?? speech.start) : first;
      const binding = value.cues?.[plan.locale];
      if (Object.values(value.cues ?? {}).some(b => b.cues.length) && !binding) issue('PRESENTATION_STALE', `${path}/cues/${plan.locale}`, 'Review cue timing for this language; another language cannot supply it.');
      if (binding?.cues.length && beat.narration?.[plan.locale] && !timingBindingCurrent(beat, plan.locale, binding.audioHash)) issue('PRESENTATION_STALE', `${path}/cues/${plan.locale}`, 'Review the presentation cues against the current audio or explicit rehearsal estimate through presentation.cues.');
      const cues = (binding?.cues ?? []).map(cue => ({...cue, tick: origin + at(cue.at)}));
      base.layoutSections=[...new Set([...(base.show??[]),...cues.flatMap(c=>c.show??[])])];
      if (cues.some(cue => cue.tick >= end) || new Set(cues.map(c => c.tick)).size !== cues.length) issue('PRESENTATION_TIMING', `${path}/cues/${plan.locale}`, 'Every cue must cover a distinct visible frame inside this passage.');
      timing.set(key, {cues,first});
    }
    const {base, nodeIndex, nodeBeatIndex} = resolved.get(key);
    // A previous decision can be revisited. A future decision cannot be exposed.
    if (nodeIndex !== null && (nodeIndex > (frame.nodeIndex ?? -1) || nodeBeatIndex > route(scene, frame.branchId).findIndex(b => b.id === beat.id))) {
      issue('ANALYSIS_FUTURE', path, 'Analysis cannot reveal a decision that has not happened on this route.');
      output.push({...frame, presentation: {...base, analysis: undefined,comparison:null}});
      continue;
    }
    const {cues,first} = timing.get(key);
    const boundaries = [...new Set([frame.startFrame, ...cues.map(c => c.tick).filter(t => t > frame.startFrame && t < frame.endFrame), frame.endFrame])].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startFrame = boundaries[i], endFrame = boundaries[i + 1];
      const presentation = clone(base);
      presentation.cameraStart=first/plan.fps;
      for (const cue of cues) if (cue.tick <= startFrame) for (const name of visualFields) if (cue[name] !== undefined) {presentation[name] = clone(cue[name]);if(name==='camera')presentation.cameraStart=cue.tick/plan.fps;}
      for(const a of presentation.annotations??[])if(a.type==='label'){if(!a.text[plan.locale]?.trim()){issue('TRANSLATION_MISSING',path+'/annotations/'+a.id+'/text/'+plan.locale,'Missing annotation translation.');a.text='…';}else a.text=a.text[plan.locale];}
      if(presentation.comparison){
        const raw=presentation.comparison,comparisonKey=hash([raw,presentation.analysis?.decisionHash]);
        try{
          if(!comparisons.has(comparisonKey)){
            const resolve=(sceneId,analysisId)=>{
              const other=project.lesson.scenes.find(s=>s.id===sceneId),item=other?.analysis?.find(a=>a.id===analysisId);
              check(item,'PRESENTATION_COMPARE','Comparison references a missing analysis.','comparison');
              const cacheKey=JSON.stringify([sceneId,analysisId]);if(!analyses.has(cacheKey))analyses.set(cacheKey,compileAnalysis(other,item,plan.locale));
              const {issues:problems,...a}=analyses.get(cacheKey);for(const problem of problems??[])issues.push({...problem,path:path+'/comparison',detail:{sceneId,analysisId,sourcePath:problem.path},target:location});
              return {scene:other,item,analysis:{...a,decision:stateInBB(a.decision)}};
            };
            const origin=resolve(raw.origin.sceneId,raw.origin.analysisId);
            check(presentation.analysis&&origin.analysis.decisionHash===presentation.analysis.decisionHash,'PRESENTATION_COMPARE','Comparison origin must match the currently referenced decision.','comparison/origin');
            const alternatives=raw.routes.map(r=>{
              const start=resolve(r.sceneId,r.startAnalysisId),end=resolve(r.sceneId,r.endAnalysisId);
              if(raw.mode==='choices')check(start.analysis.decisionHash===origin.analysis.decisionHash,'PRESENTATION_COMPARE','Choice routes must share the exact public decision and action history.','comparison/routes/'+r.id);
              const label=r.label[plan.locale];if(!label?.trim())issue('TRANSLATION_MISSING',path+'/comparison/routes/'+r.id+'/label/'+plan.locale,'Missing route label.');
              return {id:r.id,label:label??'…',start:start.analysis,end:end.analysis,actions:continuation(start.scene,start.item,end.item,route),differences:publicDifferences(origin.analysis,start.analysis)};
            });
            comparisons.set(comparisonKey,{mode:raw.mode,origin:origin.analysis,routes:alternatives});
          }
          presentation.comparison=clone(comparisons.get(comparisonKey));
        }catch(error){issues.push({...errorJSON(error),path:path+'/comparison',target:location});presentation.comparison=null;}
      }
      const context = presentation.surface === 'analysis' ? presentation.analysis?.decision ?? frame.state : frame.state;
      // Director observation may expose every holding; focus still targets player output.
      const visibleSeats = context.seats.filter(seat => seat.id === context.hero || context.revealed.includes(seat.id));
      const visibleCards = new Set([...context.board, ...visibleSeats.flatMap(seat => seat.hole).filter(Boolean)]);
      const targets=[...presentation.focus,...(presentation.camera?[presentation.camera.target]:[]),...(presentation.annotations??[]).flatMap(a=>[a.from,a.to,a.target]).filter(x=>typeof x==='string')];
      for (const target of targets) {
        if (/^(seat|bet|stack):/.test(target) && !context.seats.some(s => s.id === target.slice(target.indexOf(':')+1))) issue('PRESENTATION_TARGET', path, 'Annotation or focus references a missing seat.');
        if(target.startsWith('bet:')&&!context.seats.some(s=>s.id===target.slice(4)&&s.streetBet>0))issue('PRESENTATION_TARGET',path,'Bet targets require a current, positive street commitment.');
        if (target.startsWith('card:') && !visibleCards.has(target.slice(5))) issue('PRESENTATION_TARGET', path, 'Focus must reference a currently visible card.');
        if(target.startsWith('range:')&&!presentation.analysis?.range?.groups?.some(g=>g.id===target.slice(6)))issue('PRESENTATION_TARGET',path,'Annotation references a missing range group.');
        if(target.startsWith('hand:')&&!presentation.analysis?.range?.matrix?.some(g=>g.hand===target.slice(5)))issue('PRESENTATION_TARGET',path,'Annotation references a missing range hand.');
        if((target.startsWith('range:')||target.startsWith('hand:'))&&(presentation.surface!=='analysis'||!presentation.show.includes('range')))issue('PRESENTATION_TARGET',path,'Reveal the range before pointing to it.');
        if(target==='calculation'&&!presentation.analysis?.calculation&&!presentation.analysis?.metrics?.length&&!presentation.analysis?.tournament)issue('PRESENTATION_TARGET',path,'Annotation references a missing calculation.');
        if(target==='calculation'&&(presentation.surface!=='analysis'||!presentation.show.some(s=>['calculation','metrics'].includes(s))))issue('PRESENTATION_TARGET',path,'Reveal the calculation before pointing to it.');
      }
      if (presentation.surface === 'analysis' && !presentation.analysis) issue('ANALYSIS_UNKNOWN', path, 'An analysis canvas needs a resolved decision.');
      output.push({...frame, id: i === 0 ? frame.id : `${frame.id}::p${startFrame}`, event: i === 0 ? frame.event : null, startFrame, endFrame, start: startFrame / plan.fps, end: endFrame / plan.fps, duration: (endFrame - startFrame) / plan.fps, presentation});
    }
  }
  plan.frames = output;
  plan.issues = [...new Map(issues.map(x => [JSON.stringify(x), x])).values()];
  return plan;
}
