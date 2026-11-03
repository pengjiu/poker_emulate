import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {extractVideoFrames,verifyMedia} from '../scripts/verify-media.mjs';
import {temp} from './helpers.mjs';
const exec=promisify(execFile);
test('Real frame extraction handles more than100 noncontiguous selections without parser overflow',async t=>{
  const dir=await temp(t),video=join(dir,'source.mp4');await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=size=64x64:rate=30','-t','9','-threads','1',video]);
  const indices=Array.from({length:130},(_,i)=>i*2),frames=await extractVideoFrames(video,indices,join(dir,'frames'));assert.equal(frames.length,130);assert.equal((await readdir(join(dir,'frames'))).length,130);assert.deepEqual(frames.map(f=>f.frame),indices);
  const last=join(dir,'last.png');await exec('ffmpeg',['-y','-v','error','-threads','1','-i',video,'-vf',"select='eq(n,258)'",'-frames:v','1','-threads','1',last]);assert.deepEqual(await readFile(frames.at(-1).file),await readFile(last));assert.notDeepEqual(await readFile(frames[0].file),await readFile(last));
});

test('Media verification rejects a missing middle passage even when speech head and tail survive',async t=>{
  const dir=await temp(t),source=join(dir,'source.wav'),video=join(dir,'video.mp4');
  await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=437:duration=12','-ar','24000',source]);
  const encode=async filter=>exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=size=64x64:rate=30:duration=12','-i',source,...(filter?['-af',filter]:[]),'-c:a','aac','-threads','1',video]);
  await encode();await exec('ffmpeg',['-y','-v','error','-i',video,'-frames:v','1',join(dir,'frame.png')]);
  await writeFile(join(dir,'project.json'),JSON.stringify({assets:{voice:{path:'source.wav'}}}));
  await writeFile(join(dir,'receipt.json'),JSON.stringify({fps:30,validation:{keyframes:[{frame:0,file:'frame.png'}]},audioSources:[{kind:'voice',assetId:'voice',start:0}]}));
  const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../scripts/verify-media.mjs',import.meta.url)),dir,dir]);
  const intact=JSON.parse(stdout);assert.equal(intact.status,'PASS');assert.ok(intact.audio[0].continuous.windows.length>=6);
  await encode("volume=0:enable='between(t,5,7)'");
  await assert.rejects(verifyMedia(dir,dir),/Complete narration correlation failed|Narration interior correlation failed/);
});
