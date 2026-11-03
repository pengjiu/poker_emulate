#!/usr/bin/env node
// Controlled protocol/failure fixture. It is not speech or IndexTTS acceptance evidence.
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const file=process.argv[process.argv.indexOf('--request')+1],request=JSON.parse(await readFile(file,'utf8'));
if(process.env.RIVER_TEST_VOICE_COUNTER)await appendFile(process.env.RIVER_TEST_VOICE_COUNTER,JSON.stringify(request)+'\n');
console.log('RIVER_VOICE '+JSON.stringify({phase:'synthesizing',index:0,total:request.clips.length}));
await new Promise(resolve=>setTimeout(resolve,Number(process.env.RIVER_TEST_VOICE_DELAY??100)));
if(process.env.RIVER_TEST_VOICE_MODE==='fail'){console.error('controlled engine failure');process.exit(2);}
if(process.env.RIVER_TEST_VOICE_MODE==='signal')process.kill(process.pid,'SIGKILL');
for(const clip of request.clips)execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.3','-ar','22050',clip.output]);
await writeFile(request.result,JSON.stringify({engine:'CONTROLLED_FIXTURE_NOT_INDEXTTS',device:'fixture',seconds:.1,clips:request.clips.map(c=>({beatId:c.beatId,output:c.output}))}));
