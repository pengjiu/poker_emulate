import catalog from './patterns.json' with {type:'json'};
import {check} from '../errors.mjs';
import {clone,hash} from '../util.mjs';

const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function fields(value,allowed,path){check(object(value),'DIRECTION','Expected an object.',path);for(const k of Object.keys(value))check(allowed.includes(k),'UNKNOWN_FIELD','Unknown direction field.',path+'/'+k,{allowed});}
function translations(value,path,lists=false){
  check(object(value)&&Object.keys(value).length>0,'DIRECTION','Provide localized text.',path);
  for(const [locale,text]of Object.entries(value))check(lists?Array.isArray(text)&&text.length>0&&text.every(x=>typeof x==='string'&&x.trim()):typeof text==='string'&&text.trim(),'DIRECTION','Expected nonempty localized guidance.',path+'/'+locale);
}
export function directionSchema(value,path='direction'){
  fields(value,['profile','origin'],path);const p=value.profile;
  fields(p,['id','name','summary','perspective','structure','guidance','checks','delivery','sources'],path+'/profile');
  check(typeof p.id==='string'&&p.id.trim()&&typeof p.perspective==='string'&&p.perspective.trim(),'DIRECTION','Provide an ID and information perspective.',path+'/profile');
  for(const key of ['name','summary'])translations(p[key],path+'/profile/'+key);
  for(const key of ['guidance','checks'])translations(p[key],path+'/profile/'+key,true);
  check(Array.isArray(p.structure)&&p.structure.length>0&&p.structure.every(s=>typeof s==='string'&&s.trim()),'DIRECTION','Provide the narrative structure.',path+'/profile/structure');
  fields(p.delivery,['speed','emotion','emotionStrength'],path+'/profile/delivery');
  check(typeof p.delivery.speed==='number'&&Number.isFinite(p.delivery.speed)&&p.delivery.speed>=.5&&p.delivery.speed<=2,'DIRECTION','Invalid suggested speech speed.',path+'/profile/delivery/speed');
  check(typeof p.delivery.emotionStrength==='number'&&Number.isFinite(p.delivery.emotionStrength)&&p.delivery.emotionStrength>=0&&p.delivery.emotionStrength<=1&&Array.isArray(p.delivery.emotion)&&p.delivery.emotion.length===8&&p.delivery.emotion.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1),'DIRECTION','Invalid suggested emotion.',path+'/profile/delivery');
  check(Array.isArray(p.sources)&&p.sources.every(s=>typeof s==='string'&&/^https?:\/\//.test(s)),'DIRECTION','Use source URLs.',path+'/profile/sources');
  if(value.origin!==undefined){fields(value.origin,['patternId','catalogVersion','profileHash'],path+'/origin');check(typeof value.origin.patternId==='string'&&Number.isSafeInteger(value.origin.catalogVersion)&&value.origin.catalogVersion>0&&/^[a-f0-9]{64}$/.test(value.origin.profileHash),'DIRECTION','Invalid catalog provenance.',path+'/origin');}
  return value;
}
function merge(base,overrides){const result=clone(base);for(const [key,value]of Object.entries(overrides)){result[key]=object(value)&&object(result[key])?merge(result[key],value):clone(value);}return result;}
export function selectDirection(value){
  if(value===null)return null;
  fields(value,['patternId','overrides','profile'],'direction.set/value');
  check((typeof value.patternId==='string')!==Object.hasOwn(value,'profile'),'DIRECTION','Select a pattern or supply a custom profile.','direction.set/value');
  if(value.profile!==undefined){check(value.overrides===undefined,'DIRECTION','Edit the custom profile directly.','direction.set/value');return directionSchema({profile:clone(value.profile)});}
  const profile=catalog.patterns.find(p=>p.id===value.patternId);check(profile,'PATTERN_UNKNOWN','Read the available patterns through export.','direction.set/value/patternId');
  if(value.overrides!==undefined)check(object(value.overrides),'DIRECTION','overrides must be an object.','direction.set/value/overrides');
  return directionSchema({profile:merge(profile,value.overrides??{}),origin:{patternId:profile.id,catalogVersion:catalog.version,profileHash:hash(profile)}});
}
export function patterns(patternId){
  if(patternId!==undefined){const profile=catalog.patterns.find(p=>p.id===patternId);check(profile,'PATTERN_UNKNOWN','Unknown pattern.','export/patternId');return {version:catalog.version,profile:clone(profile)};}
  return {version:catalog.version,patterns:catalog.patterns.map(({id,name,summary,perspective,structure})=>clone({id,name,summary,perspective,structure}))};
}
export const effectiveDirection=(project,scene)=>scene?.direction??project.direction??null;
