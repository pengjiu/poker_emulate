import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {Director} from '../src/director.mjs';
import {newProject, createProject} from '../src/project/store.mjs';
import {compileProject} from '../src/compiler.mjs';
import {confirmAnalysis} from '../src/analysis/index.mjs';
import {narrationCues, renderFrame, frameAt} from '../src/client/render.mjs';
import {hash} from '../src/util.mjs';
import {temp, packs, words} from './helpers.mjs';

function lesson() {
  const scene = {
    id: 'river', title: words('Price and range'),
    start: {street: 'river', board: ['Qd', '7c', '2s', 'Tc', '4d'], button: 'hero', hero: 'hero', actor: 'villain', seats: [
      {id: 'villain', name: 'North', stack: 95.45, contributed: 4.55, hole: ['Kc', 'Jh']},
      {id: 'hero', name: 'River', stack: 95.45, contributed: 4.55, hole: ['Ah', 'Qh']}
    ]},
    beats: [
      {id: 'bet', label: words('Bet'), actions: [{type: 'bet', seat: 'villain', to: 6}], hold: .5},
      {id: 'think', label: words('Think'), hold: 5, presentation: {surface: 'analysis', analysisId: 'price', show: [], focus: ['hero'], cues: {'zh-CN': {audioHash: null, cues: [{at: 2, show: ['calculation']}, {at: 4, show: ['calculation', 'takeaway']}]}}}},
      {id: 'return', label: words('Return'), hold: 1, presentation: {surface: 'table', focus: ['pot']}},
      {id: 'call', label: words('Call'), actions: [{type: 'call', seat: 'hero'}]}
    ]
  };
  scene.analysis = [confirmAnalysis(scene, {id: 'price', node: {beatId: 'bet'}, title: words('Price is not equity'), calculation: 'potOdds', takeaway: words('First specify the opponent range.')})];
  return {scenes: [scene]};
}
function project(output = {}) { return newProject(lesson(), {locale: 'zh-CN', ...output}); }
async function director(t) {
  const directory = join(await temp(t), 'project');
  await createProject(directory, project()); return Director.open(directory);
}
async function apply(d, commands, requestId) {
  return d.apply({requestId: requestId ?? `edit-${(await d.store.read()).revision}`, expectedRevision: (await d.store.read()).revision, commands});
}

test('presentation cues preserve a pending decision and seeking never executes an action', () => {
  const p = project(), before = structuredClone(p), plan = compileProject(p, packs);
  assert.deepEqual(plan.issues, []);
  const frames = plan.frames.filter(f => f.beatId === 'think');
  assert.equal(frames.length, 3);
  assert.deepEqual(frames.map(f => f.presentation.show), [[], ['calculation'], ['calculation', 'takeaway']]);
  assert.equal(frames[1].startFrame - frames[0].startFrame, 2 * plan.fps);
  for (const f of frames) assert.deepEqual(f.state, frames[0].state);
  assert.deepEqual(plan.frames.find(f => f.beatId === 'return').state, frames[0].state);
  assert.equal(frames[0].state.pot, 15.1);
  assert.equal(plan.frames.find(f => f.beatId === 'call').state.pot, 21.1);
  const direct = renderFrame(plan, frames[2].startFrame);
  renderFrame(plan, plan.totalFrames - 1); renderFrame(plan, 0);
  assert.equal(renderFrame(plan, frames[2].startFrame), direct);
  assert.deepEqual(p, before);
});

test('future zero-action revelations and other branches are withheld even in draft previews', () => {
  const p = project(), scene = p.lesson.scenes[0];
  scene.beats.splice(2, 0, {id: 'future-reveal', label: words('Later reveal'), view: {reveal: ['villain']}});
  scene.analysis[0] = confirmAnalysis(scene, {...scene.analysis[0], node: {beatId: 'future-reveal'}});
  let plan = compileProject(p, packs);
  assert.ok(plan.issues.some(i => i.code === 'ANALYSIS_FUTURE'));
  assert.equal(plan.frames.find(f => f.beatId === 'think').presentation.analysis, undefined);
  scene.branches = [{id: 'alternative', from: 'bet', label: words('Alternate'), beats: [{id: 'branch-call', label: words('Call'), actions: [{type: 'call', seat: 'hero'}]}]}];
  scene.analysis[0] = confirmAnalysis(scene, {...scene.analysis[0], calculation: undefined, node: {beatId: 'branch-call'}});
  delete scene.analysis[0].calculation;
  plan = compileProject(p, packs);
  assert.ok(plan.issues.some(i => i.code === 'ANALYSIS_ROUTE'));
  assert.equal(plan.frames.find(f => f.beatId === 'think').presentation.analysis, undefined);
});

test('analysis and presentation commands are atomic, idempotent and require review after edits', async t => {
  const d = await director(t), initial = await d.store.read();
  const changed = {...initial.lesson.scenes[0].analysis[0], assumptions: words('A new opponent assumption')};
  const request = {requestId: 'analysis-change', expectedRevision: 0, commands: [{type: 'analysis.put', value: changed}]};
  const receipt = await d.apply(request);
  assert.deepEqual(await d.apply(request), receipt);
  assert.ok((await d.export({kind: 'plan'})).issues.some(i => i.code === 'ANALYSIS_UNREVIEWED'));
  await apply(d, [{type: 'analysis.confirm', analysisId: 'price'}, {type: 'presentation.set', beatId: 'think', value: {surface: 'analysis', analysisId: 'price', show: ['conditions']}}]);
  assert.equal((await d.export({kind: 'plan'})).issues.length, 0);
  assert.equal((await d.store.read()).lesson.scenes[0].beats[1].presentation.cues['zh-CN'].cues.length, 2, 'Base edits retain confirmed cues.');
  const saved = await d.store.read();
  await assert.rejects(apply(d, [{type: 'presentation.cues', beatId: 'think', value: {cues: [{at: 2, show: []}, {at: 1, show: ['takeaway']}]}}]), {code: 'PRESENTATION_TIMING'});
  assert.deepEqual(await d.store.read(), saved);
});

test('condition variants replay the engine, isolate their source and reject illegal changes', async t => {
  const d = await director(t), source = structuredClone((await d.store.read()).lesson.scenes[0]);
  const command = {type: 'scene.variant', sourceSceneId: 'river', value: {id: 'larger', title: words('Larger bet'), change: {beatId: 'bet', actionIndex: 0, action: {type: 'bet', seat: 'villain', to: 9.1}}}};
  await apply(d, [command, {type: 'output.set', value: {sceneId: 'larger'}}]);
  let plan = await d.export({kind: 'plan'});
  assert.ok(plan.issues.some(i => i.code === 'VARIANT_REVIEW'));
  assert.ok(plan.issues.some(i => i.code === 'ANALYSIS_STALE'));
  const frame = plan.frames.find(f => f.beatId === 'think');
  assert.equal(frame.state.pot, 18.2); assert.equal(frame.presentation.analysis.calculation.total, 27.3);
  assert.ok(Math.abs(frame.presentation.analysis.calculation.threshold - 1 / 3) < 1e-12);
  assert.deepEqual((await d.store.read()).lesson.scenes[0], source);
  await apply(d, [{type: 'analysis.confirm', analysisId: 'price'}, {type: 'scene.review', sceneId: 'larger'}]);
  assert.equal((await d.export({kind: 'plan'})).issues.length, 0);
  const stored = await d.store.read();
  await assert.rejects(apply(d, [{...command, value: {...command.value, id: 'illegal', change: {...command.value.change, action: {type: 'bet', seat: 'hero', to: 9.1}}}}]), {code: 'OUT_OF_TURN'});
  assert.deepEqual(await d.store.read(), stored);
  await apply(d, [{type: 'narration.set', beatId: 'think', text: '改变后的判断需要重新复核。'}]);
  assert.ok((await d.export({kind: 'plan'})).issues.some(i => i.code === 'VARIANT_REVIEW'));
});

test('one narration survives cue splits, and replacing audio or language invalidates cue timing', () => {
  const p = project(), beat = p.lesson.scenes[0].beats[1], assetId = 'a'.repeat(64);
  beat.narration = words('One continuous spoken explanation.');
  beat.audio = {'zh-CN': {assetId, locale: 'zh-CN', textHash: hash(beat.narration['zh-CN'])}};
  p.assets[assetId] = {path: `assets/${assetId}.wav`, sha256: assetId, duration: 5, bytes: 100, mime: 'audio/wav'};
  beat.presentation.cues['zh-CN'].audioHash = assetId;
  let plan = compileProject(p, packs);
  assert.equal(plan.issues.length, 0); assert.equal(narrationCues(plan).length, 1);
  assert.equal(narrationCues(plan)[0].duration, 5);
  const secondId = 'b'.repeat(64); p.assets[secondId] = {...p.assets[assetId], path: `assets/${secondId}.wav`, sha256: secondId};
  beat.audio['zh-CN'].assetId = secondId;
  assert.ok(compileProject(p, packs).issues.some(i => i.code === 'PRESENTATION_STALE'));
  plan = compileProject(p, packs, {output: {locale: 'en-US'}});
  assert.ok(plan.issues.some(i => i.code === 'PRESENTATION_STALE'));
});

test('cue boundaries quantize once to visible frames and do not reveal takeaway early', () => {
  const p = project({profile: 'final'}), beat = p.lesson.scenes[0].beats[1];
  beat.presentation.cues['zh-CN'].cues = [{at: 1.015, show: ['takeaway']}];
  const plan = compileProject(p, packs), start = plan.frames.find(f => f.beatId === 'think').startFrame;
  const reveal = start + Math.ceil(1.015 * plan.fps);
  assert.deepEqual(frameAt(plan, reveal - 1).presentation.show, []);
  assert.deepEqual(frameAt(plan, reveal).presentation.show, ['takeaway']);
  assert.ok(reveal / plan.fps - start / plan.fps - 1.015 < 1 / plan.fps);
});

test('timed action frames retain the action index referenced by an analysis node', () => {
  const p = project(), scene = p.lesson.scenes[0], bet = scene.beats[0];
  bet.timing = {actions: [.25]};
  scene.analysis[0] = confirmAnalysis(scene, {...scene.analysis[0], node: {beatId: 'bet', actionIndex: 0}});
  const plan = compileProject(p, packs), frame = plan.frames.find(f => f.beatId === 'bet' && f.actionIndex === 0);
  assert.equal(frame.startFrame, Math.ceil(.25 * plan.fps));
  assert.equal(frame.state.pot, 15.1);
  assert.equal(plan.frames.find(f => f.beatId === 'think').presentation.analysis.decision.pot, frame.state.pot);
});

test('course authoring is optional metadata and does not claim learner mastery', async t => {
  const d = await director(t);
  await apply(d, [{type: 'course.set', value: {id: 'course', title: words('Decision method'), prerequisites: words('Knows betting order'), objectives: words('Distinguish price from equity'), episodes: [{id: 'one', sceneId: 'river', objective: words('Compute a call threshold'), check: words('What changes when the bet is larger?')}]}}]);
  assert.equal((await d.export()).lesson.course.episodes.length, 1);
  const current = await d.store.read();
  await assert.rejects(apply(d, [{type: 'course.set', value: {...current.lesson.course, mastered: true}}]), {code: 'UNKNOWN_FIELD'});
  await apply(d, [{type: 'output.set', value: {sequence: [{id: 'first', sceneId: 'river'}, {id: 'repeat', sceneId: 'river'}]}}]);
  const observation = await d.observe();
  assert.equal(observation.advisories[0].code, 'COURSE_ORDER_REVIEW');
  assert.equal(observation.readiness.ready, true, 'An editorial suggestion does not masquerade as a mechanical render failure.');
});

test('compile issues retain structured targets for repeated entries and IDs containing slashes', () => {
  const p = project(), scene = p.lesson.scenes[0], beat = scene.beats.find(b => b.id === 'think');
  scene.id = 'chapter/river'; beat.id = 'think/now';
  scene.analysis[0].title = {'en-US': 'A missing localized heading'};
  beat.narration = words('This passage still needs audio.');
  beat.presentation.focus = ['seat:missing'];
  p.output.sceneId = scene.id;
  p.output.sequence = [{id: 'first/entry', sceneId: scene.id}, {id: 'repeat/entry', sceneId: scene.id}];
  const plan = compileProject(p, packs);
  for (const code of ['AUDIO_MISSING', 'PRESENTATION_STALE', 'PRESENTATION_TARGET']) {
    assert.deepEqual(plan.issues.filter(issue => issue.code === code).map(issue => issue.target), p.output.sequence.map(entry => ({sceneId: scene.id, entryId: entry.id, beatId: beat.id})), `${code} must preserve the exact scene, entry and beat identifiers.`);
  }
  const analysisIssues = plan.issues.filter(issue => issue.code === 'TRANSLATION_MISSING' && issue.detail?.analysisId === 'price');
  assert.deepEqual(analysisIssues.map(issue => issue.target), p.output.sequence.map(entry => ({sceneId: scene.id, entryId: entry.id, beatId: beat.id})), 'Forwarded analysis issues locate their presentation in each sequence entry.');
});

test('public director readiness validates player-visible focus in both observation views', async t => {
  const d = await director(t);
  await d.dispatch({method: 'apply', params: {requestId: 'focus-hidden-card', expectedRevision: 0, commands: [
    {type: 'presentation.set', beatId: 'return', value: {surface: 'table', focus: ['card:Kc', 'card:Ah', 'card:Qd']}}
  ]}});
  const requests = [
    {name: 'load', method: 'load', director: true},
    {name: 'observe default', method: 'observe'},
    {name: 'observe player', method: 'observe', params: {view: 'player'}},
    {name: 'observe director', method: 'observe', params: {view: 'director'}, director: true},
    {name: 'seek player', method: 'seek', params: {beatId: 'return', view: 'player'}},
    {name: 'seek director', method: 'seek', params: {beatId: 'return', view: 'director'}, director: true},
    {name: 'plan', method: 'export', params: {kind: 'plan'}}
  ];
  async function inspect(ready) {
    for (const {name, method, params, director} of requests) {
      const result = await d.dispatch({method, ...(params ? {params} : {})});
      const readiness = method === 'export' ? {ready: result.issues.length === 0, issues: result.issues} : result.readiness;
      assert.equal(readiness.ready, ready, `${name} follows player output readiness.`);
      assert.deepEqual(readiness.issues.map(issue => issue.code), ready ? [] : ['PRESENTATION_TARGET'], name);
      if (!ready) assert.deepEqual(readiness.issues[0].target, {sceneId: 'river', entryId: null, beatId: 'return'}, name);
      if (director) assert.deepEqual(result.state.seats.find(seat => seat.id === 'villain').hole, ['Kc', 'Jh'], `${name} retains director card visibility.`);
      if (method === 'export') {
        const frame = result.frames.find(frame => frame.beatId === 'return');
        assert.deepEqual(frame.state.seats.find(seat => seat.id === 'villain').hole, ready ? ['Kc', 'Jh'] : [null, null]);
      }
    }
  }
  await inspect(false);
  const saved = await d.dispatch({method: 'export'}), scene = saved.lesson.scenes[0];
  scene.beats.find(beat => beat.id === 'return').view = {reveal: ['villain']};
  await d.dispatch({method: 'apply', params: {requestId: 'reveal-focused-card', expectedRevision: saved.revision, commands: [
    {type: 'scene.put', value: scene}
  ]}});
  await inspect(true);
});
