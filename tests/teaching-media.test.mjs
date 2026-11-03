import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {newProject, createProject} from '../src/project/store.mjs';
import {Director} from '../src/director.mjs';
import {compileProject} from '../src/compiler.mjs';
import {renderVideo} from '../src/media/render.mjs';
import {verifyMedia} from '../scripts/verify-media.mjs';
import {temp, packs, words} from './helpers.mjs';

const exec = promisify(execFile);
test('actual encoded teaching reveals and one audio clock match the compiled frame boundaries', async t => {
  const dir = await temp(t), projectDir = join(dir, 'project');
  const scene = {id: 'media-cue', title: words('Controlled integration signal'),
    start: {street: 'river', board: ['Qd', '7c', '2s', 'Tc', '4d'], button: 'hero', hero: 'hero', actor: 'hero', actedAt: {villain: 6}, lastFullRaise: 6, seats: [
      {id: 'villain', name: 'North', stack: 89.45, contributed: 10.55, streetBet: 6},
      {id: 'hero', name: 'River', stack: 95.45, contributed: 4.55, hole: ['Ah', 'Qh']}
    ]},
    beats: [{id: 'think', label: words('Controlled integration signal'), narration: words('Controlled integration signal'), hold: 1.4, presentation: {surface: 'analysis', analysisId: 'price', show: []}}],
    analysis: [{id: 'price', node: {beatId: 'think'}, title: words('Price'), calculation: 'potOdds', evidence: {kind: 'derivation', source: 'evidence/model.json', model: words('Integration fixture, not a strategy claim.')}}]
  };
  await createProject(projectDir, newProject({scenes: [scene]}, {locale: 'en-US', profile: 'final'}));
  await writeFile(join(projectDir, 'evidence/model.json'), '{"fixture":1}\n');
  const signal = join(dir, 'controlled.wav');
  await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:seed=47:duration=1.4:sample_rate=24000:amplitude=0.1', signal]);
  const d = await Director.open(projectDir);
  await d.apply({requestId: 'prepare', expectedRevision: 0, commands: [
    {type: 'audio.attach', beatId: 'think', value: {source: {path: signal}}},
    {type: 'analysis.confirm', analysisId: 'price'},
    {type: 'presentation.cues', beatId: 'think', value: {cues: [{at: .515, show: ['calculation']}]}}
  ]});
  const plan = compileProject(await d.store.read(), packs), reveal = Math.ceil(.515 * plan.fps);
  assert.deepEqual(plan.issues, []);
  const receipt = await renderVideo(projectDir, {out: join(dir, 'exports')});
  assert.equal(receipt.audioSources.length, 1, 'A cue split must not duplicate narration in the mux.');
  const keys = receipt.validation.keyframes.map(key => key.frame);
  assert.ok(keys.includes(reveal - 1) && keys.includes(reveal));
  const decoded = await verifyMedia(receipt.directory, projectDir);
  assert.equal(decoded.status, 'PASS');
  assert.ok(decoded.frames.some(frame => frame.frame === reveal));
  assert.ok(decoded.audio.every(source => Math.abs(source.head.lagSeconds) <= 1 / plan.fps && Math.abs(source.tail.lagSeconds) <= 1 / plan.fps));
  // Validation happens before returning a cached render, so a replaced proof
  // cannot borrow the prior successful receipt.
  await writeFile(join(projectDir, 'evidence/model.json'), '{"fixture":2}\n');
  await assert.rejects(renderVideo(projectDir, {out: join(dir, 'exports')}), error => error.code === 'PRECHECK' && error.detail.issues.some(issue => issue.code === 'EVIDENCE_CHANGED'));
});
