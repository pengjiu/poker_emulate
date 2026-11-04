import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {patterns} from '../src/direction/index.mjs';
import {stored,temp} from './helpers.mjs';

const cli=fileURLToPath(new URL('../bin/river.mjs',import.meta.url));
const run=(cwd,args,input)=>spawnSync(process.execPath,[cli,...args],{cwd,input,encoding:'utf8'});

test('patterns discovers the same catalogue and full profile as public session export without a project',async t=>{
  const directory=await temp(t),id=patterns().patterns[0].id;
  const index=run(directory,['patterns']),profile=run(directory,['patterns','--id',id]);
  assert.equal(index.status,0,index.stdout+index.stderr);assert.equal(profile.status,0,profile.stdout+profile.stderr);
  assert.deepEqual(JSON.parse(index.stdout),patterns());assert.deepEqual(JSON.parse(profile.stdout),patterns(id));
  assert.deepEqual(await readdir(directory),[],'Discovering modes must not create a seed project or any local work.');
  const store=await stored(t),before=await readFile(store.path),requests=[{method:'export',params:{kind:'patterns'}},{method:'export',params:{kind:'patterns',patternId:id}}];
  const session=run(directory,['session','--project',store.directory],requests.map(request=>JSON.stringify(request)).join('\n')+'\n');
  assert.equal(session.status,0,session.stdout+session.stderr);
  const replies=session.stdout.trim().split('\n').map(line=>JSON.parse(line));assert.equal(replies.length,2);assert.ok(replies.every(reply=>reply.ok));
  assert.deepEqual(JSON.parse(index.stdout),replies[0].value);assert.deepEqual(JSON.parse(profile.stdout),replies[1].value);
  assert.deepEqual(await readFile(store.path),before);assert.deepEqual(await readdir(directory),[]);
});

test('patterns rejects unknown options, missing values, duplicate options and unknown IDs without writing files',async t=>{
  const directory=await temp(t),id=patterns().patterns[0].id;
  for(const [args,code]of [
    [['patterns','--project','unused'],'UNKNOWN_OPTION'],
    [['patterns','--unknown'],'UNKNOWN_OPTION'],
    [['patterns',id],'UNKNOWN_OPTION'],
    [['patterns','--id'],'OPTION_VALUE'],
    [['patterns','--id',''],'OPTION_VALUE'],
    [['patterns','--id','--json'],'OPTION_VALUE'],
    [['patterns','--id',id,'--id',id],'DUPLICATE_OPTION'],
    [['patterns','--id','unknown-pattern-id'],'PATTERN_UNKNOWN']
  ]){
    const result=run(directory,args);assert.equal(result.status,1,result.stdout+result.stderr);const reply=JSON.parse(result.stdout);
    assert.equal(reply.ok,false);assert.equal(reply.error.code,code);
  }
  assert.deepEqual(await readdir(directory),[]);
});

test('help lists the project-free shortcut while retaining the existing six session methods',async t=>{
  const result=run(await temp(t),['help']);assert.equal(result.status,0,result.stdout+result.stderr);const help=JSON.parse(result.stdout);
  assert.deepEqual(help.commands.patterns,['id']);assert.deepEqual(help.sessionMethods,['load','observe','apply','seek','export','voice']);
});
