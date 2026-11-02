import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {analysisSchema, confirmAnalysis, compileAnalysis, decisionFingerprint, expandRange, filterRange, equityAgainstRange, nextCardOuts, independentChipModel, importSolverAnalysis, solverRequest} from '../src/analysis/index.mjs';
import {bindEvidence, verifyEvidence} from '../src/analysis/evidence.mjs';

const words = text => ({'zh-CN': text, 'en-US': text, 'ja-JP': text});
const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
function source() {
  return {id: 'metrics', title: words('Weighted analysis'), start: {street: 'river', board: ['Qd', '7c', '2s', 'Tc', '4d'], button: 'hero', hero: 'hero', actor: 'villain', seats: [{id: 'hero', stack: 20, contributed: 5, hole: ['Ah', 'Qh']}, {id: 'villain', stack: 20, contributed: 5, hole: ['8c', '9c']}]}, beats: [{id: 'facing', label: words('Bet'), actions: [{type: 'bet', seat: 'villain', to: 10}]}]};
}
function item() { return {id: 'weighted', node: {beatId: 'facing'}, title: words('Price and assumptions'), range: {seat: 'villain', entries: [{hand: 'KsKd', weight: .5}, {hand: 'JdTs', weight: 1}]}, metrics: ['spr', 'equity', 'callEV']}; }

test('weighted matrix keeps physical combinations, inclusion weights and action frequencies separate', () => {
  const range = expandRange([{hand: 'AKs', weight: .5, actions: {call: .25, raise: .75}, equity: .6}, {hand: 'QQ', weight: 1, actions: {call: 1}, equity: .8}], {blocked: ['As', 'Qh']});
  assert.equal(range.matrix.length, 169); assert.equal(range.combinationCount, 6); assert.equal(range.blockedCount, 4);
  near(range.weightedCount, 4.5);
  const aks = range.matrix.find(cell => cell.hand === 'AKs');
  assert.equal(aks.combinationCount, 3); near(aks.weight, .5); near(aks.rangeShare, 1 / 3); near(aks.actions.raise, .75);
  near(range.actions.raise, .25); near(range.equity, 11 / 15);
  near(range.matrix.reduce((n, cell) => n + cell.rangeShare, 0), 1);
  const filtered = filterRange(range, {hand: 'AKs'});
  near(filtered.shareOfOriginalRange, 1 / 3); assert.equal(filtered.normalization, 'originalRange');
  assert.equal(range.units.actions, 'conditionalActionFrequency');
  assert.throws(() => expandRange([{hand: 'AK', weight: 1}, {hand: 'AsKs', weight: .5}]), {code: 'ANALYSIS_RANGE_OVERLAP'});
  assert.throws(() => expandRange([{hand: 'AA', weight: 1, actions: {call: .8}}]), {code: 'ANALYSIS_RANGE_ACTIONS'});
  assert.throws(() => expandRange([{hand: 'AA', weight: NaN}]), {code: 'ANALYSIS_RANGE_WEIGHT'});
});

test('public blockers and made-hand categories do not inspect undisclosed opponent holdings', () => {
  const scene = source(), material = item();
  material.range.entries = [{hand: '98s', weight: 1}]; material.metrics = ['equity'];
  let result = compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN');
  assert.equal(result.range.combinationCount, 4, 'Assigned 8c9c remains unknown at this decision.');
  assert.ok(result.range.combos.every(combo => typeof combo.madeHand === 'string'));
  scene.start.seats[1].hole = ['6c', '5c'];
  const changed = compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN');
  assert.deepEqual(changed.range, result.range); assert.deepEqual(changed.metrics, result.metrics);
});

test('analysis remembers a public reveal even after the table hides its cards again', () => {
  const scene = source(); scene.start.seats[1].hole = ['8c', '9c'];
  scene.beats.unshift({id: 'reveal', label: words('Already revealed'), actions: [], view: {reveal: ['villain']}});
  scene.beats[1].view = {reveal: []};
  const material = {id: 'hero-range', node: {beatId: 'facing'}, title: words('Known blockers'), range: {seat: 'hero', entries: [{hand: '98s', weight: 1}]}};
  const result = compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN');
  assert.deepEqual(result.decision.seats.find(player => player.id === 'villain').hole, ['8c', '9c']);
  assert.equal(result.range.combinationCount, 3);
});

test('exact river equity and incremental call EV use weighted outcomes, including ties', () => {
  const scene = source(), result = compileAnalysis(scene, confirmAnalysis(scene, item()), 'zh-CN');
  assert.deepEqual(result.issues, []);
  near(result.metrics.find(metric => metric.kind === 'equity').value, 2 / 3);
  const ev = result.metrics.find(metric => metric.kind === 'callEV'); near(ev.value, 10); assert.equal(ev.unit, 'BB');
  near(result.metrics.find(metric => metric.kind === 'spr').value, .5);
  const split = equityAgainstRange({hero: ['2c', '3d'], board: ['Ah', 'Kh', 'Qh', 'Jh', 'Th'], entries: [{hand: 'AcAd', weight: 1}]});
  assert.equal(split.method, 'exact'); assert.equal(split.tie, 1); assert.equal(split.equity, .5);
});

test('turn enumeration and clean outs agree on a known straight/flush draw', () => {
  const input = {hero: ['Ah', 'Kh'], board: ['Qh', 'Jh', '2c', '3d'], entries: [{hand: 'AdAc', weight: 1}]};
  const equity = equityAgainstRange(input), outs = nextCardOuts(input);
  assert.equal(equity.method, 'exact'); assert.equal(equity.samples, 44);
  near(equity.equity, 12 / 44); assert.equal(outs.clean.length, 12); assert.equal(outs.dirty.length, 0);
  near(outs.cleanProbability, 12 / 44); near(outs.cards.reduce((n, card) => n + card.probability, 0), 1);
  assert.ok(outs.clean.includes('Th') && outs.clean.includes('Ts'));
  assert.ok(outs.definition.includes('river'));
  const flop = nextCardOuts({...input, board: input.board.slice(0, 3)});
  assert.ok(flop.definition.includes('redraws'));
});

test('sampled equity is deterministic and reports finite-sample uncertainty; huge exact work is rejected', () => {
  const input = {hero: ['As', 'Ah'], board: [], entries: [{hand: 'KcKd', weight: 1}], options: {method: 'sample', samples: 200, seed: 42}};
  const a = equityAgainstRange(input), b = equityAgainstRange(input);
  assert.deepEqual(a, b); assert.equal(a.method, 'sample'); assert.equal(a.samples, 200); assert.equal(a.seed, 42);
  assert.ok(a.equity > .65 && a.equity < .95); assert.ok(a.confidence95[0] < a.equity && a.confidence95[1] > a.equity);
  assert.throws(() => equityAgainstRange({...input, options: {method: 'exact'}}), {code: 'ANALYSIS_BUDGET'});
});

test('rake and chips units reach price and EV through the same actual call state', () => {
  const scene = source(); scene.start.rake = {rate: .1, cap: 2, noFlopNoDrop: true}; scene.start.unit = 'chips';
  const material = {...item(), calculation: 'potOdds'}, result = compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN');
  assert.deepEqual(result.issues, []);
  assert.equal(result.calculation.grossTotal, 30); assert.equal(result.calculation.rake, 2); assert.equal(result.calculation.total, 28); assert.equal(result.calculation.unit, 'chips');
  near(result.calculation.threshold, 10 / 28);
  const ev = result.metrics.find(metric => metric.kind === 'callEV'); near(ev.value, 2 / 3 * 28 - 10); assert.equal(ev.unit, 'chips');
  const before = decisionFingerprint(scene, material.node); scene.start.rake.cap = 1;
  assert.notEqual(decisionFingerprint(scene, material.node), before);
});

test('ICM exact equal-stack, winner-take-all and elimination cases conserve prize money', () => {
  const equal = independentChipModel([{id: 'a', stack: 100}, {id: 'b', stack: 100}, {id: 'c', stack: 100}], [50, 30, 20]);
  for (const player of equal.players) { near(player.equity, 100 / 3); near(player.finishProbabilities.reduce((a, b) => a + b, 0), 1); }
  near(equal.equitySum, 100);
  const winner = independentChipModel([{id: 'a', stack: 60}, {id: 'b', stack: 30}, {id: 'c', stack: 10}], [100]);
  for (const player of winner.players) near(player.equity, player.stack);
  const out = independentChipModel([{id: 'a', stack: 0}, {id: 'b', stack: 50}, {id: 'c', stack: 50}], [50, 30, 20]);
  near(out.players[0].equity, 20); near(out.players[1].equity, 40); near(out.equitySum, 100);
  assert.throws(() => independentChipModel([{id: 'a', stack: 10}, {id: 'a', stack: 20}], [100]), {code: 'ICM_STACKS'});
});

test('tournament comparisons derive baseline chips from the engine and expose hypothetical chip versus prize EV', () => {
  const scene = source(), material = item(); delete material.range; delete material.metrics;
  material.tournament = {unit: 'USD', payouts: [50, 30, 20], otherStacks: [{id: 'other', stack: 50}], outcomes: [
    {id: 'win', label: words('Win'), probability: .5, stacks: [{id: 'hero', stack: 50}, {id: 'villain', stack: 0}, {id: 'other', stack: 50}]},
    {id: 'lose', label: words('Lose'), probability: .5, stacks: [{id: 'hero', stack: 0}, {id: 'villain', stack: 50}, {id: 'other', stack: 50}]}
  ]};
  const result = compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN');
  assert.deepEqual(result.issues, []); assert.equal(result.tournament.totalChips, 100); assert.equal(result.tournament.baseline, 'stacksBeforeThisHandContributions');
  near(result.tournament.expected.chipDelta, 0); assert.ok(result.tournament.expected.icmDelta < 0);
  assert.ok(result.tournament.outcomes.every(outcome => outcome.hypothesis));
  material.tournament.outcomes[0].stacks[0].stack = 60;
  assert.ok(compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN').issues.some(issue => issue.code === 'ICM_CONSERVATION'));
});

test('ICM reconstructs posted antes from their ledger and rejects unassigned dead money', () => {
  const scene = source(), material = {id: 'antes', node: {beatId: 'facing'}, title: words('Antes'), tournament: {unit: 'USD', payouts: [70, 30]}};
  scene.start.deadPot = 2; scene.start.antePaid = {hero: 1, villain: 1};
  const withAnte = compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN');
  assert.deepEqual(withAnte.issues, []); assert.equal(withAnte.tournament.totalChips, 52);
  assert.deepEqual(withAnte.tournament.players.map(player => player.stack), [26, 26]);
  delete scene.start.antePaid;
  assert.ok(compileAnalysis(scene, confirmAnalysis(scene, material), 'zh-CN').issues.some(issue => issue.code === 'ICM_ANTES'));
});

test('solver import binds external JSON bytes, the actual node and legal model action space', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'river-solver-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const scene = source(), material = {id: 'solver', node: {beatId: 'facing'}, title: words('Imported strategy')}, request = solverRequest(scene, material.node);
  await assert.rejects(importSolverAnalysis(directory, scene, material, {path: join(directory, 'missing.json')}), {code: 'SOLVER_SOURCE'});
  const payload = {version: 1, decision: request.decision, model: {game: 'NLHE', units: 'BB', rake: null, algorithm: 'External example, not an optimality certificate', actions: [{id: 'fold', type: 'fold'}, {id: 'call', type: 'call'}]}, strategy: {seat: 'hero', entries: [{hand: 'AQs', weight: 1, actions: {fold: .2, call: .8}, equity: .6}]}};
  const imported = await importSolverAnalysis(directory, scene, material, {data: payload});
  assert.equal(imported.review, undefined); assert.match(imported.evidence.source, /^evidence\/solver-[a-f0-9]{64}\.json$/);
  const evidenceHash = await bindEvidence(directory, imported), confirmed = confirmAnalysis(scene, imported, {evidenceHash});
  const result = compileAnalysis(scene, confirmed, 'zh-CN');
  assert.deepEqual(result.issues, []); assert.equal(result.solver.source, 'external'); assert.equal(result.range.matrix.length, 169);
  await verifyEvidence(directory, result.evidence);
  const hidden=scene.start.seats[1].hole;delete scene.start.seats[1].hole;
  assert.deepEqual(solverRequest(scene,material.node).decision,request.decision,'Unassigned and assigned hidden holdings are the same public input.');assert.deepEqual(compileAnalysis(scene,confirmed,'zh-CN').issues,[]);scene.start.seats[1].hole=hidden;
  const fractional=source();fractional.start.seats[0].stack=30;const bad={...structuredClone(payload),decision:solverRequest(fractional,material.node).decision};bad.model.actions=[{id:'raise',type:'raise',to:20.001}];bad.strategy.entries=[{hand:'AQs',actions:{raise:1}}];await assert.rejects(importSolverAnalysis(directory,fractional,material,{data:bad}),{code:'SOLVER_ACTION'});
  const complete = structuredClone(payload);
  complete.model.ranges = [{seat: 'hero', entries: [{hand: 'AQs', weight: 1}]}, {seat: 'villain', entries: [{hand: 'KK', weight: 1}]}];
  const fullImport = await importSolverAnalysis(directory, scene, material, {data: complete});
  fullImport.range = {seat: 'villain', entries: [{hand: 'KK', weight: .5}]};
  const mismatch = compileAnalysis(scene, confirmAnalysis(scene, fullImport, {evidenceHash: await bindEvidence(directory, fullImport)}), 'zh-CN');
  assert.ok(mismatch.issues.some(issue => issue.code === 'SOLVER_RANGE_MISMATCH'), 'Reconfirming new teaching assumptions must not certify a mismatched solver range.');
  complete.model.ranges[0].entries[0].weight = .5;
  await assert.rejects(importSolverAnalysis(directory, scene, material, {data: complete}), {code: 'SOLVER_RANGE_MISMATCH'});
  const replacement = structuredClone(confirmed); replacement.solver.data.strategy.entries[0].actions = {fold: .9, call: .1};
  const inconsistent = compileAnalysis(scene, confirmAnalysis(scene, replacement, {evidenceHash}), 'zh-CN');
  await assert.rejects(verifyEvidence(directory, inconsistent.evidence), {code: 'SOLVER_EVIDENCE'});
  scene.beats[0].actions[0].to = 12;
  assert.ok(compileAnalysis(scene, confirmAnalysis(scene, confirmed), 'zh-CN').issues.some(issue => issue.code === 'SOLVER_STALE'));
  await assert.rejects(importSolverAnalysis(directory, scene, material, {data: payload}), {code: 'SOLVER_STATE'});
  scene.beats[0].actions[0].to = 10; payload.model.units = 'chips';
  await assert.rejects(importSolverAnalysis(directory, scene, material, {data: payload}), {code: 'SOLVER_UNITS'});
});

test('weighted material and algorithm settings participate in review invalidation', () => {
  const scene = source(), reviewed = confirmAnalysis(scene, item());
  reviewed.range.entries[0].weight = .75;
  assert.equal(compileAnalysis(scene, reviewed, 'zh-CN').status, 'stale');
  const invalid = {...item(), metrics: ['equity', 'equity']}; assert.throws(() => analysisSchema([invalid]), {code: 'ANALYSIS_CALCULATION'});
});
