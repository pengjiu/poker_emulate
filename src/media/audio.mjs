import {readFile,writeFile,mkdir,stat,realpath,rm,rename} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {hash,id} from '../util.mjs';
import {check,fail} from '../errors.mjs';
const exec=promisify(execFile);
export async function probeAudio(path){
  try{
    const {stdout}=await exec('ffprobe',['-v','error','-show_entries','stream=codec_type,duration:format=duration','-of','json',path],{timeout:15000,maxBuffer:1024*1024});
    const probe=JSON.parse(stdout);check(probe.streams?.some(s=>s.codec_type==='audio'),'AUDIO_INVALID','File has no audio track.',path);
    const duration=Number(probe.format?.duration??probe.streams.find(s=>s.codec_type==='audio')?.duration);
    check(Number.isFinite(duration)&&duration>0,'AUDIO_DURATION','Audio duration is not finite and positive.',path);return duration;
  }catch(e){if(e.code?.startsWith?.('AUDIO_'))throw e;fail('AUDIO_INVALID','Audio cannot be decoded.',path,{cause:e.message});}
}
export async function importAudio(directory,source){
  check(source&&typeof source==='object','AUDIO_SOURCE','Provide {path} or {data}.','source');
  check(Object.keys(source).every(k=>['path','data'].includes(k))&&(!!source.path!==!!source.data),'AUDIO_SOURCE','Provide exactly one local path or data URL.','source');
  let bytes,extension;
  if(source.data){const m=/^data:audio\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(source.data);check(m,'AUDIO_SOURCE','Expected a base64 audio data URL.','source/data');extension=({mpeg:'mp3','x-wav':'wav',wave:'wav',mp4:'m4a'})[m[1]]??m[1];bytes=Buffer.from(m[2],'base64');}
  else{let path=source.path;check(typeof path==='string'&&!/^(https?:|blob:|data:)/.test(path),'AUDIO_SOURCE','Use a local audio file.','source/path');if(path.startsWith('file:'))path=fileURLToPath(path);extension=extname(path).slice(1).toLowerCase();try{bytes=await readFile(path);}catch(e){fail('ASSET_MISSING','Cannot read audio file.','source/path',{cause:e.code});}}
  check(['wav','mp3','m4a','aac','ogg','flac','aiff','aif'].includes(extension),'AUDIO_FORMAT','Use WAV, MP3, M4A, AAC, OGG, FLAC or AIFF.','source');
  check(bytes.length>0&&bytes.length<=256*1024*1024,'AUDIO_SIZE','Audio must be between 1 byte and 256 MiB.','source');
  const sha256=hash(bytes),assetPath=`assets/${sha256}.${extension}`,path=resolve(directory,assetPath);await mkdir(join(directory,'assets'),{recursive:true});
  // Validate a staged copy before atomically publishing or repairing the named asset.
  const temporary=join(directory,'assets','.import-'+id()+'.'+extension);let duration;
  try{await writeFile(temporary,bytes,{flag:'wx'});duration=await probeAudio(temporary);await rename(temporary,path);}finally{await rm(temporary,{force:true});}
  return {assetId:sha256,asset:{path:assetPath,sha256,duration,bytes:bytes.length,mime:extension==='mp3'?'audio/mpeg':`audio/${extension}`}};
}
export async function verifyAudio(directory,asset){
  let bytes,path;try{path=await realpath(resolve(directory,asset.path));check(path.startsWith((await realpath(directory))+'/'),'ASSET_PATH','Asset must remain inside its project.',asset.path);bytes=await readFile(path);}catch(e){if(e.code==='ASSET_PATH')throw e;fail('ASSET_MISSING','Referenced audio is missing.',asset.path);}
  check(hash(bytes)===asset.sha256,'ASSET_CHANGED','Audio changed since import.',asset.path);
  const duration=await probeAudio(path);check(Math.abs(duration-asset.duration)<=.02,'AUDIO_DURATION','Audio metadata does not match the file.',asset.path);return {path,duration,sha256:asset.sha256};
}
