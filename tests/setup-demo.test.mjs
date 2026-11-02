import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setupDemo} from '../scripts/setup-demo.mjs';
import {ProjectStore} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {validateProject} from '../src/compiler.mjs';
import {temp,packs} from './helpers.mjs';

test('A fresh checkout can create a render-ready demo without models or generated files',async t=>{
  const directory=join(await temp(t),'projects/demo'),result=await setupDemo(directory),project=await new ProjectStore(directory).read();
  assert.equal(result.created,true);
  for(const locale of Object.keys(packs))for(const aspect of ['landscape','portrait']){
    const report=await validateProject(project,packs,{directory,output:{locale,aspect},media:true});
    assert.equal(report.ready,true,JSON.stringify(report));
  }
  const director=await Director.open(directory);
  await director.apply({requestId:'keep-local-output',expectedRevision:project.revision,commands:[{type:'output.set',value:{aspect:'portrait'}}]});
  const before=await readFile(join(directory,'project.json'));
  assert.equal((await setupDemo(directory)).created,false);
  assert.deepEqual(await readFile(join(directory,'project.json')),before);
});

test('An existing invalid demo is reported without overwriting local work',async t=>{
  const directory=join(await temp(t),'demo');await setupDemo(directory);
  const file=join(directory,'project.json'),original='unfinished local edit';await writeFile(file,original);
  await assert.rejects(()=>setupDemo(directory),error=>error.code==='PROJECT_CORRUPT');
  assert.equal(await readFile(file,'utf8'),original);
});
