import {check} from '../errors.mjs';

const object=(value,path)=>check(value&&typeof value==='object'&&!Array.isArray(value),'SOUND','Expected sound settings.',path);
function keys(value,allowed,path){object(value,path);for(const key of Object.keys(value))check(allowed.includes(key),'UNKNOWN_FIELD',`Unknown sound field: ${key}`,path+'/'+key);}
function number(value,min,max,path){check(Number.isFinite(value)&&value>=min&&value<=max,'SOUND','Sound value is outside its supported range.',path,{min,max});}
export function soundSchema(value,path='sound'){
  keys(value,['effects','bed','voiceGainDB','ducking','loudness'],path);
  if(value.effects!==undefined){keys(value.effects,['enabled','volume'],path+'/effects');check(typeof value.effects.enabled==='boolean','SOUND','Set effects.enabled explicitly.',path+'/effects/enabled');if(value.effects.volume!==undefined)number(value.effects.volume,0,1,path+'/effects/volume');}
  if(value.bed!==undefined&&value.bed!==null){keys(value.bed,['assetId','volume','start','loop'],path+'/bed');check(/^[a-f0-9]{64}$/.test(value.bed.assetId),'ASSET_ID','Use an imported audio asset.',path+'/bed/assetId');if(value.bed.volume!==undefined)number(value.bed.volume,0,1,path+'/bed/volume');if(value.bed.start!==undefined)number(value.bed.start,0,86400,path+'/bed/start');if(value.bed.loop!==undefined)check(typeof value.bed.loop==='boolean','SOUND','loop must be boolean.',path+'/bed/loop');}
  if(value.voiceGainDB!==undefined)number(value.voiceGainDB,-24,12,path+'/voiceGainDB');
  if(value.ducking!==undefined){keys(value.ducking,['enabled','reductionDB','attack','release'],path+'/ducking');if(value.ducking.enabled!==undefined)check(typeof value.ducking.enabled==='boolean','SOUND','enabled must be boolean.',path+'/ducking/enabled');if(value.ducking.reductionDB!==undefined)number(value.ducking.reductionDB,0,30,path+'/ducking/reductionDB');if(value.ducking.attack!==undefined)number(value.ducking.attack,.001,1,path+'/ducking/attack');if(value.ducking.release!==undefined)number(value.ducking.release,.01,3,path+'/ducking/release');}
  if(value.loudness!==undefined&&value.loudness!==null){keys(value.loudness,['integrated','truePeak','range'],path+'/loudness');number(value.loudness.integrated,-30,-10,path+'/loudness/integrated');number(value.loudness.truePeak,-6,-1,path+'/loudness/truePeak');if(value.loudness.range!==undefined)number(value.loudness.range,1,20,path+'/loudness/range');}
}
export function beatSoundSchema(value,path='beat/sound'){
  keys(value,['quiet','effects'],path);
  if(value.quiet!==undefined)check(typeof value.quiet==='boolean','SOUND','quiet must be boolean.',path+'/quiet');
  if(value.effects!==undefined){check(Array.isArray(value.effects)&&value.effects.length<=40,'SOUND','Use at most 40 sound cues.',path+'/effects');for(const [i,event]of value.effects.entries()){const p=path+'/effects/'+i;keys(event,['kind','at','volume'],p);check(['deal','bet','collect','payout'].includes(event.kind),'SOUND','Unknown effect.',p+'/kind');number(event.at,0,86400,p+'/at');if(event.volume!==undefined)number(event.volume,0,1,p+'/volume');}}
}
const durations={deal:.19,bet:.18,collect:.32,payout:.55};
export function compileSound(plan,project){
  if(!project.sound&&!project.lesson.scenes.some(s=>[...s.beats,...(s.branches??[]).flatMap(b=>b.beats)].some(b=>b.sound)))return plan;
  const settings=project.sound??{},events=[],quiet=[],seen=new Set(),seenBeat=new Set(),beatBounds=new Map();
  for(const frame of plan.frames){const key=JSON.stringify([frame.entryId,frame.sceneId,frame.beatId]);const bounds=beatBounds.get(key);if(bounds)bounds[1]=frame.end;else beatBounds.set(key,[frame.start,frame.end]);}
  const add=(kind,start,volume=.3)=>{if(start>=0&&start<plan.duration)events.push({kind,start,duration:Math.min(durations[kind],plan.duration-start),volume});};
  for(const frame of plan.frames){
    const scene=project.lesson.scenes.find(s=>s.id===frame.sceneId),beat=[...scene.beats,...(scene.branches??[]).flatMap(b=>b.beats)].find(b=>b.id===frame.beatId);
    const beatKey=JSON.stringify([frame.entryId,frame.sceneId,frame.beatId]);
    if(beat?.sound?.quiet)quiet.push([frame.start,frame.end]);
    if(!seenBeat.has(beatKey)){
      seenBeat.add(beatKey);const [start,end]=beatBounds.get(beatKey);
      for(const cue of beat?.sound?.effects??[]){
        if(start+cue.at>=end)plan.issues.push({code:'SOUND_TIMING',path:`scenes/${scene.id}/beats/${beat.id}/sound/effects`,message:'Sound cue must start inside its own passage; review it after changing the passage duration.',retryable:false,target:{sceneId:frame.sceneId,entryId:frame.entryId,beatId:frame.beatId}});
        else add(cue.kind,start+cue.at,cue.volume??settings.effects?.volume??.3);
      }
    }
    const event=frame.stateEvent,key=JSON.stringify([frame.entryId,frame.sceneId,frame.stateStart,event]);
    if(!settings.effects?.enabled||!event||seen.has(key)||beat?.sound?.quiet)continue;seen.add(key);
    const volume=settings.effects.volume??.3;
    if(event.type==='deal'){add('collect',frame.stateStart,volume*.7);add('deal',frame.stateStart+.12,volume);}
    else if(['bet','raise','call','allin'].includes(event.type))add('bet',frame.stateStart,volume);
    if(frame.state.settled)add('payout',frame.stateStart+.12,volume);
  }
  const bed=settings.bed?{...settings.bed,...project.assets[settings.bed.assetId]}:null;
  if(settings.bed&&!project.assets[settings.bed.assetId])plan.issues.push({code:'ASSET_MISSING',path:'sound/bed',message:'Background audio is missing.',retryable:false});
  const quietIntervals=[];for(const interval of quiet){const last=quietIntervals.at(-1);if(last&&interval[0]<=last[1]+1e-9)last[1]=Math.max(last[1],interval[1]);else quietIntervals.push([...interval]);}
  plan.sound={...settings,bed,events,quiet:quietIntervals};return plan;
}

// Short procedural Foley signals: deterministic local assets, never speech.
export function effectWav(kind){
  check(kind in durations,'SOUND','Unknown effect.');const rate=48000,count=Math.ceil(durations[kind]*rate),bytes=Buffer.alloc(44+count*2);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(count*2,40);
  let seed=kind.split('').reduce((s,c)=>s+c.charCodeAt(0),1),low=0;
  for(let i=0;i<count;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/rate;low=.75*low+.25*noise;const pulses=kind==='payout'?Math.pow(Math.sin(t*43),2):kind==='collect'?Math.pow(Math.sin(t*31),2):1;const decay=Math.exp(-t/(kind==='deal'?.04:kind==='bet'?.025:.13)),tone=kind==='deal'?0:Math.sin(t*2*Math.PI*(kind==='bet'?1750:1100))*.3;const sample=Math.min(1,t/.003)*decay*pulses*(low+tone)*.5;bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*2);}
  return bytes;
}

export function mixGraph(sources,plan){
  const settings=plan.sound,filters=[],voice=[],ambient=[];
  for(const [i,source]of sources.entries()){
    const label=`sound${i}`,gain=source.kind==='voice'?Math.pow(10,(settings?.voiceGainDB??0)/20):(source.volume??1);
    filters.push(`[${i+2}:a]aresample=48000,atrim=duration=${source.duration},asetpts=PTS-STARTPTS,volume=${gain},adelay=${Math.round(source.start*1000)}:all=1[${label}]`);
    (source.kind==='voice'?voice:ambient).push(`[${label}]`);
  }
  if(!settings){filters.push(`[1:a]${voice.join('')}amix=inputs=${voice.length+1}:duration=first:normalize=0,alimiter=limit=0.95:latency=1[mixed]`);return filters.join(';');}
  filters.push(`[1:a]asplit=2[zeroV][zeroA]`);
  filters.push(`[zeroV]${voice.join('')}amix=inputs=${voice.length+1}:duration=first:normalize=0[voices]`);
  filters.push(`[zeroA]${ambient.join('')}amix=inputs=${ambient.length+1}:duration=first:normalize=0[ambient0]`);
  const reduction=Math.pow(10,-(settings.ducking?.reductionDB??12)/20),attack=settings.ducking?.attack??.08,release=settings.ducking?.release??.25;
  const intervals=[];for(const source of sources.filter(s=>s.kind==='voice').sort((a,b)=>a.start-b.start)){const start=Math.max(0,source.start-attack),end=source.start+source.duration+release,last=intervals.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else intervals.push([start,end]);}
  const envelopes=intervals.map(([start,end])=>`if(between(t,${start},${end}),min(1,min((t-${start})/${attack},(${end}-t)/${release})),0)`);
  const envelope=envelopes.reduce((left,right)=>`max(${left},${right})`,'0');
  let expression=settings.ducking?.enabled===false||!envelopes.length?'1':`1-${1-reduction}*${envelope}`;
  for(const [start,end]of plan.sound.quiet??[])expression=`if(between(t,${start},${end}),0,${expression})`;
  filters.push(`[ambient0]volume='${expression}':eval=frame[ambient]`);
  const loudness=settings.loudness,post=loudness?`,loudnorm=I=${loudness.integrated}:TP=${loudness.truePeak}:LRA=${loudness.range??11},aresample=48000`:`,alimiter=limit=0.95:latency=1`;
  filters.push(`[voices][ambient]amix=inputs=2:duration=first:normalize=0${post}[mixed]`);return filters.join(';');
}
