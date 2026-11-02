import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
export async function extractVideoFrames(video,indices,directory){
  const frames=[...new Set(indices)].sort((a,b)=>a-b);assert.ok(frames.length&&frames.every(i=>Number.isSafeInteger(i)&&i>=0),'Use nonnegative frame indices.');await mkdir(directory,{recursive:true});
  // FFmpeg's expression parser has a recursion limit. Bound each selection tree, not the lesson length.
  for(let start=0;start<frames.length;start+=64){const batch=frames.slice(start,start+64);await exec('ffmpeg',['-y','-v','error','-threads','1','-i',video,'-filter_threads','1','-vf',`select='${batch.map(i=>`eq(n,${i})`).join('+')}'`,'-fps_mode','vfr','-threads','1','-frames:v',String(batch.length),'-start_number',String(start+1),join(directory,'%03d.png')],{timeout:90000,maxBuffer:1024*1024});}
  return frames.map((frame,i)=>({frame,file:join(directory,String(i+1).padStart(3,'0')+'.png')}));
}
async function pcm(file){
  const {stdout}=await exec('ffmpeg',['-v','error','-i',file,'-vn','-ar','4000','-ac','1','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:64*1024*1024});
  return new Float32Array(stdout.buffer,stdout.byteOffset,stdout.byteLength/4);
}
function correlate(source,video,offset,start,length){
  const count=Math.min(length,source.length-start);let best={correlation:-1,lagSamples:null};
  for(let lag=-400;lag<=400;lag++){
    let cross=0,aa=0,bb=0;
    for(let j=start;j<start+count;j++){const a=source[j],b=video[offset+j+lag]??0;cross+=a*b;aa+=a*a;bb+=b*b;}
    const correlation=aa&&bb?cross/Math.sqrt(aa*bb):0;if(correlation>best.correlation)best={correlation,lagSamples:lag};
  }return {...best,lagSeconds:best.lagSamples/4000};
}
export async function verifyMedia(directory,projectDirectory){
  const receipt=JSON.parse(await readFile(join(directory,'receipt.json'),'utf8')),project=JSON.parse(await readFile(join(projectDirectory,'project.json'),'utf8')),video=join(directory,'video.mp4');
  const out=join(directory,'decoded');await mkdir(out,{recursive:true});
  const keys=receipt.validation.keyframes;
  const extracted=await extractVideoFrames(video,keys.map(k=>k.frame),out);assert.deepEqual(extracted.map(x=>x.frame),keys.map(k=>k.frame));
  const frames=[];
  for(const [i,k]of keys.entries()){
    const file=join(out,String(i+1).padStart(3,'0')+'.png'),{stderr}=await exec('ffmpeg',['-hide_banner','-i',join(directory,k.file),'-i',file,'-lavfi','ssim','-f','null','-'],{timeout:10000,maxBuffer:1024*1024});
    const ssim=Number(stderr.match(/All:([\d.]+)/)?.[1]);assert.ok(ssim>=.97,`Encoded keyframe ${k.frame} SSIM=${ssim}`);frames.push({frame:k.frame,file:'decoded/'+String(i+1).padStart(3,'0')+'.png',ssim});
  }
  const audio=[],voiceSources=receipt.audioSources.filter(source=>source.kind==='voice'||!source.kind&&source.assetId);
  if(voiceSources.length){const decoded=await pcm(video);
    for(const source of voiceSources){
      const input=await pcm(join(projectDirectory,project.assets[source.assetId].path)),offset=Math.round(source.start*4000),head=correlate(input,decoded,offset,0,16000),tail=correlate(input,decoded,offset,Math.max(0,input.length-8000),8000);
      assert.ok(head.correlation>.95&&tail.correlation>.95,'Audio content/tail correlation failed');assert.ok(Math.abs(head.lagSeconds)<=1/receipt.fps&&Math.abs(tail.lagSeconds)<=1/receipt.fps,'Audio lag exceeds one frame');
      audio.push({...source,head,tail});
    }
  }
  const report={status:'PASS',method:'Decode actual MP4; SSIM against rendered action/key frames; independent PCM cross-correlation against source narration. Generated effects and background tracks are reported separately from speech.',frames,audio,ambientSources:receipt.audioSources.filter(source=>source.kind&&source.kind!=='voice').length,loudness:receipt.validation.loudness??null,languageReview:'Requires transcript/audio content review; waveform matching alone does not identify language.'};
  await writeFile(join(directory,'decoded-validation.json'),JSON.stringify(report,null,2)+'\n');return report;
}
