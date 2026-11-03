import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Director} from '../src/director.mjs';
import {createProject, newProject} from '../src/project/store.mjs';
import {compileProject} from '../src/compiler.mjs';
import {confirmAnalysis} from '../src/analysis/index.mjs';
import {temp, words, packs} from './helpers.mjs';

function sourceScene() {
  const scene = {
    id: 'river', title: words('River'),
    start: {street: 'river', board: ['Ac', 'Kd', '7h', '2s', '3c'], button: 'hero', hero: 'hero', actor: 'villain', seats: [
      {id: 'hero', stack: 20, contributed: 5, hole: ['Qc', 'Qd']},
      {id: 'villain', stack: 20, contributed: 5}
    ]},
    beats: [{id: 'start', label: words('Start'), hold: 1}],
    branches: [{id: 'line', from: 'start', label: words('Line'), beats: [
      {id: 'offer', label: words('Bet'), actions: [{type: 'bet', seat: 'villain', to: 6}], hold: 1},
      {id: 'think', label: words('Think'), hold: 3, presentation: {surface: 'analysis', analysisId: 'price', show: [], cues: {'zh-CN': {audioHash: null, cues: [{at: 1, show: ['calculation']}]}}}},
      {id: 'context', label: words('Earlier context'), hold: 1, presentation: {surface: 'analysis', analysisId: 'opening'}},
      {id: 'return', label: words('Return'), hold: 1, presentation: {surface: 'table'}}
    ]}]
  };
  scene.analysis = [
    confirmAnalysis(scene, {id: 'price', node: {beatId: 'offer'}, title: words('Price'), calculation: 'potOdds', assumptions: words('Heads-up, no rake')}),
    confirmAnalysis(scene, {id: 'opening', node: {beatId: 'start'}, title: words('Opening')})
  ];
  return scene;
}

const copyCommand = (value = {}) => ({type: 'branch.put', sceneId: 'river', copyFrom: {branchId: 'line', beatId: 'return'}, value: {
  id: 'fork', from: 'start', label: words('Continue'), beats: [{id: 'call', label: words('Call'), actions: [{type: 'call', seat: 'hero'}], hold: 1}], ...value
}});

async function director(t, scene) {
  const store = await createProject(join(await temp(t), 'project'), newProject({scenes: [scene]}, {branchId: 'line'}));
  return Director.open(store.directory);
}

test('branch copy preserves reviewed decisions, main-line references and reveal cues without altering the source', async t => {
  const scene = sourceScene(), original = structuredClone(scene), d = await director(t, scene);
  await d.apply({requestId: 'fork', expectedRevision: 0, commands: [copyCommand(), {type: 'output.set', value: {branchId: 'fork'}}]});
  const project = await d.store.read(), saved = project.lesson.scenes[0], plan = compileProject(project, packs);
  assert.deepEqual(saved.branches[0], original.branches[0]);
  assert.deepEqual(saved.analysis.slice(0, 2), original.analysis);
  assert.equal(saved.analysis.length, 3, 'Main-line analysis remains shared.');
  const copied = saved.analysis.find(item => item.id === 'fork-price');
  assert.equal(copied.node.beatId, 'fork-offer');
  assert.equal(copied.review.decisionHash, original.analysis[0].review.decisionHash);
  assert.notEqual(copied.review.materialHash, original.analysis[0].review.materialHash);
  assert.equal(saved.branches[1].beats.find(beat => beat.id === 'fork-think').presentation.analysisId, copied.id);
  assert.equal(saved.branches[1].beats.find(beat => beat.id === 'fork-context').presentation.analysisId, 'opening');
  assert.deepEqual(saved.branches[1].beats.find(beat => beat.id === 'fork-think').presentation.cues, original.branches[0].beats[1].presentation.cues);
  assert.deepEqual(plan.issues, []);
  assert.equal(plan.frames.find(frame => frame.beatId === 'fork-think').presentation.analysis.status, 'current');
  assert.equal(plan.frames.at(-1).state.pot, 22);
  assert.deepEqual(compileProject(project, packs, {output: {sceneId: 'river', branchId: 'line'}}).issues, []);
});

test('branch copy cannot upgrade stale or unreviewed material or rebind changed evidence', async t => {
  for (const kind of ['material', 'decision', 'unreviewed', 'evidence']) {
    const scene = sourceScene();
    if (kind === 'material') scene.analysis[0].assumptions = words('Changed premise');
    if (kind === 'decision') scene.branches[0].beats[0].actions[0].to = 7;
    if (kind === 'unreviewed') delete scene.analysis[0].review;
    if (kind === 'evidence') {
      scene.analysis[0].evidence = {kind: 'derivation', source: 'evidence/source.json', model: words('Explicit river model')};
      scene.analysis[0] = confirmAnalysis(scene, scene.analysis[0], {evidenceHash: 'a'.repeat(64)});
    }
    const d = await director(t, scene);
    await d.apply({requestId: 'fork', expectedRevision: 0, commands: [copyCommand(), {type: 'output.set', value: {branchId: 'fork'}}]});
    const project = await d.store.read(), copy = project.lesson.scenes[0].analysis.find(item => item.id === 'fork-price');
    const analysis = compileProject(project, packs).frames.find(frame => frame.beatId === 'fork-think').presentation.analysis;
    if (kind === 'evidence') assert.equal(copy.review.evidenceHash, 'a'.repeat(64), 'Copying must not accept new file bytes or silently re-confirm provenance.');
    else assert.equal(analysis.status, kind === 'unreviewed' ? 'unreviewed' : 'stale', kind);
  }
});

test('invalid branch copy origins, cut points and generated ID collisions roll back atomically', async t => {
  const scene = sourceScene();
  scene.beats.push({id: 'fork-offer', label: words('Reserved by another beat'), hold: 1});
  const d = await director(t, scene), original = await d.store.read();
  const cases = [
    [copyCommand({from: 'fork-offer'}), 'BRANCH_ORIGIN'],
    [{...copyCommand(), copyFrom: {branchId: 'line', beatId: 'start'}}, 'BEAT_UNKNOWN'],
    [copyCommand(), 'ID_DUPLICATE']
  ];
  for (const [command, code] of cases) {
    await assert.rejects(d.apply({requestId: code, expectedRevision: 0, commands: [command]}), {code});
    assert.deepEqual(await d.store.read(), original);
  }
});
