import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {extractVideoFrames} from '../scripts/verify-media.mjs';
import {temp} from './helpers.mjs';
const exec=promisify(execFile);
test('Real frame extraction handles more than100 noncontiguous selections without parser overflow',async t=>{
  const dir=await temp(t),video=join(dir,'source.mp4');await exec('ffmpeg',['-y','-v','error','-f','lavfi','-i','testsrc2=size=64x64:rate=30','-t','9','-threads','1',video]);
  const indices=Array.from({length:130},(_,i)=>i*2),frames=await extractVideoFrames(video,indices,join(dir,'frames'));assert.equal(frames.length,130);assert.equal((await readdir(join(dir,'frames'))).length,130);assert.deepEqual(frames.map(f=>f.frame),indices);
  const last=join(dir,'last.png');await exec('ffmpeg',['-y','-v','error','-threads','1','-i',video,'-vf',"select='eq(n,258)'",'-frames:v','1','-threads','1',last]);assert.deepEqual(await readFile(frames.at(-1).file),await readFile(last));assert.notDeepEqual(await readFile(frames[0].file),await readFile(last));
});
