import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisSchema, resolveDecision, decisionFingerprint, confirmAnalysis, compileAnalysis, verifyRiverEquilibrium, verifyRiverTypes} from '../src/analysis/index.mjs';
import {transition, observe} from '../src/poker/rules.mjs';

const words = text => ({'zh-CN': text, 'en-US': text, 'ja-JP': text});
const beat = (id, actions = []) => ({id, label: words(id), actions});
function scene() {
  return {
    id: 'river-price', title: words('River price'),
    start: {street: 'preflop', button: 'BTN', hero: 'BTN', actor: 'UTG', seats: [
      {id: 'BTN', stack: 100, hole: ['Ah', 'Qh']},
      {id: 'SB', stack: 99.5, contributed: .5, streetBet: .5},
      {id: 'BB', stack: 99, contributed: 1, streetBet: 1, hole: ['Jd', 'Ts']},
      {id: 'UTG', stack: 100}, {id: 'HJ', stack: 100}, {id: 'CO', stack: 100}
    ]},
    beats: [
      beat('preflop', [{type: 'fold', seat: 'UTG'}, {type: 'fold', seat: 'HJ'}, {type: 'fold', seat: 'CO'}, {type: 'raise', seat: 'BTN', to: 2.5}, {type: 'fold', seat: 'SB'}, {type: 'call', seat: 'BB'}]),
      beat('flop', [{type: 'deal', cards: ['Qd', '7c', '2s']}, {type: 'check', seat: 'BB'}, {type: 'bet', seat: 'BTN', to: 1.8}, {type: 'call', seat: 'BB'}]),
      beat('turn', [{type: 'deal', cards: ['Tc']}, {type: 'check', seat: 'BB'}, {type: 'check', seat: 'BTN'}]),
      beat('river', [{type: 'deal', cards: ['4d']}]),
      beat('facing', [{type: 'bet', seat: 'BB', to: 6}]),
      beat('response', [{type: 'call', seat: 'BTN'}])
    ]
  };
}
const material = () => ({id: 'price', node: {beatId: 'facing'}, title: words('Price is not equity'), calculation: 'potOdds', assumptions: words('Heads-up; no rake; no further betting.')});

test('analysis replays one engine decision and derives a price without revealing hidden cards', () => {
  const source = scene(), original = structuredClone(source), item = confirmAnalysis(source, material());
  const compiled = compileAnalysis(source, item, 'zh-CN');
  assert.equal(compiled.status, 'current'); assert.deepEqual(compiled.issues, []);
  assert.deepEqual(compiled.calculation, {kind: 'potOdds', call: 6, pot: 15.1, total: 21.1, threshold: 6 / 21.1, applicable: true});
  assert.equal(compiled.decision.actor, 'BTN');
  assert.deepEqual(compiled.decision.seats.find(seat => seat.id === 'BB').hole, [null, null]);
  assert.equal(compiled.decision.seats.find(seat => seat.id === 'BTN').stack, 9570);
  assert.deepEqual(source, original, 'Reading and reviewing analysis never executes an action on source data.');
  const partial = resolveDecision(source, {beatId: 'flop', actionIndex: 1});
  assert.equal(partial.actor, 'BTN'); assert.equal(observe(partial).pot, 550);
  assert.throws(() => resolveDecision(source, {beatId: 'flop', actionIndex: 9}), {code: 'ANALYSIS_NODE'});
});

test('condition variants recompute 9.1 BB price and invalidate reviewed material', () => {
  const source = scene(), item = confirmAnalysis(source, material());
  source.beats.find(beat => beat.id === 'facing').actions[0].to = 9.1;
  const changed = compileAnalysis(source, item, 'zh-CN');
  assert.equal(changed.status, 'stale'); assert.equal(changed.issues[0].code, 'ANALYSIS_STALE');
  assert.equal(changed.calculation.pot, 18.2); assert.equal(changed.calculation.total, 27.3);
  assert.ok(Math.abs(changed.calculation.threshold - 1 / 3) < 1e-12);
  assert.equal(compileAnalysis(source, confirmAnalysis(source, item), 'zh-CN').status, 'current');
  item.assumptions['zh-CN'] = 'Changed range premise';
  assert.equal(compileAnalysis(scene(), item, 'zh-CN').status, 'stale');
  assert.equal(compileAnalysis(scene(), material(), 'zh-CN').issues[0].code, 'ANALYSIS_UNREVIEWED');
});

test('knowledge fingerprint ignores cosmetics, future actions and unrevealed opponent cards', () => {
  const source = scene(), node = {beatId: 'facing'}, initial = decisionFingerprint(source, node);
  source.start.seats[2].hole = ['8d', '9s']; source.start.seats[2].name = 'New nickname';
  source.beats.at(-1).actions = [{type: 'raise', seat: 'BTN', to: 18}];
  assert.equal(decisionFingerprint(source, node), initial);
  source.beats.find(beat => beat.id === 'facing').view = {reveal: ['BB']};
  assert.notEqual(decisionFingerprint(source, node), initial);
  source.beats.find(beat => beat.id === 'facing').view = {reveal: []};
  source.beats.find(beat => beat.id === 'river').view = {reveal: ['BB']};
  assert.notEqual(decisionFingerprint(source, node), initial, 'Hiding cards again does not erase an earlier reveal.');
});

test('public action history stays part of a decision even at identical final chip positions', () => {
  const base = {id: 'history', start: {street: 'river', board: ['Ac', 'Kd', '7h', '2s', '3c'], button: 'hero', hero: 'hero', actor: 'villain', seats: [{id: 'hero', stack: 20, contributed: 5, hole: ['Qc', 'Qd']}, {id: 'villain', stack: 20, contributed: 5}]}};
  const a = {...base, beats: [beat('end', [{type: 'check', seat: 'villain'}, {type: 'bet', seat: 'hero', to: 5}, {type: 'call', seat: 'villain'}])]};
  const b = {...base, beats: [beat('end', [{type: 'bet', seat: 'villain', to: 5}, {type: 'call', seat: 'hero'}])]};
  const snapshot = scene => observe(resolveDecision(scene, {beatId: 'end'}));
  assert.deepEqual(snapshot(a).seats.map(({stack, contributed, streetBet}) => ({stack, contributed, streetBet})), snapshot(b).seats.map(({stack, contributed, streetBet}) => ({stack, contributed, streetBet})));
  assert.notEqual(decisionFingerprint(a, {beatId: 'end'}), decisionFingerprint(b, {beatId: 'end'}));
});

test('branch decisions use their actual prefix; reading a branch does not continue the main line', () => {
  const source = scene();
  source.branches = [{id: 'raise-line', from: 'facing', label: words('Raise'), beats: [beat('raise', [{type: 'raise', seat: 'BTN', to: 18}])]}];
  const branch = observe(resolveDecision(source, {beatId: 'raise'}));
  assert.equal(branch.actor, 'BB'); assert.equal(branch.pot, 3310);
  assert.equal(branch.legalActions.find(action => action.type === 'call').amount, 12);
  assert.equal(observe(resolveDecision(source, {beatId: 'facing'})).pot, 1510);
});

test('pot odds refuses multiway and non-river decisions', () => {
  const source = scene(), flop = {...material(), node: {beatId: 'flop', actionIndex: 2}};
  const compiled = compileAnalysis(source, confirmAnalysis(source, flop), 'zh-CN');
  assert.equal(compiled.calculation.applicable, false); assert.equal(compiled.issues[0].code, 'ANALYSIS_CALCULATION');
  const multi = {id: 'multi', start: {street: 'river', board: ['Ac', 'Kd', '7h', '2s', '3c'], button: 'hero', hero: 'hero', actor: 'hero', seats: [{id: 'hero', stack: 10, contributed: 5}, {id: 'one', stack: 0, contributed: 15, streetBet: 10}, {id: 'two', stack: 20, contributed: 5}]}, beats: [beat('pending')]};
  const item = {...material(), node: {beatId: 'pending'}};
  assert.equal(compileAnalysis(multi, confirmAnalysis(multi, item), 'zh-CN').calculation.applicable, false);
});

test('short all-in call prices the contestable pot after the engine refunds an unmatched bet', () => {
  const source = scene(); source.start.seats[0].stack = 6.3;
  const item = confirmAnalysis(source, material()), result = compileAnalysis(source, item, 'zh-CN');
  assert.equal(result.calculation.call, 2);
  assert.equal(result.calculation.pot, 15.1, 'The pending table still includes the oversized six-BB bet.');
  assert.equal(result.calculation.total, 13.1, 'Four unmatched BB return to the opponent on the call.');
  assert.equal(result.calculation.threshold, 2 / 13.1);
  assert.equal(result.calculation.applicable, true);
  assert.notEqual(result.calculation.total, result.calculation.pot + result.calculation.call);
});

test('range groups expose examples and overlap, with only public blockers', () => {
  const source = scene(), item = {...material(), range: {seat: 'BB', groups: [{id: 'one', label: words('Candidate'), hands: ['QJ', 'JdTs']}, {id: 'two', label: words('Overlap'), hands: ['QJs']}]}};
  const result = compileAnalysis(source, confirmAnalysis(source, item), 'zh-CN');
  assert.equal(result.range.coverage, 'examples'); assert.equal(result.range.overlaps, true);
  assert.equal(result.range.groups[0].combinationCount, 9, 'Two unblocked queens × four jacks, plus one exact combo.');
  assert.deepEqual(result.issues, []);
  item.range.groups[0].hands = ['AhKd'];
  const blocked = compileAnalysis(source, confirmAnalysis(source, item), 'zh-CN');
  assert.ok(blocked.issues.some(issue => issue.code === 'ANALYSIS_RANGE_BLOCKED'));
  assert.throws(() => analysisSchema([{...item, range: {seat: 'BB', groups: [{id: 'bad', label: words('Invalid'), hands: ['AsAs']}]}}]), {code: 'ANALYSIS_RANGE'});
});

test('evidence requires model conditions and remains author-provided after confirmation', () => {
  const source = scene(), item = {...material(), evidence: {kind: 'solver', source: 'evidence/solver.json'}};
  assert.throws(() => analysisSchema([item]), {code: 'ANALYSIS_SCHEMA'});
  item.evidence.model = words('Heads-up river, fixed inputs and explicit action tree.');
  const compiled = compileAnalysis(source, confirmAnalysis(source, item), 'zh-CN');
  assert.equal(compiled.evidence.authorProvided, true);
  delete item.title['ja-JP'];
  assert.ok(compileAnalysis(source, confirmAnalysis(source, item), 'ja-JP').issues.some(issue => issue.code === 'TRANSLATION_MISSING'));
});

test('bounded river equilibrium has zero exhaustive best-response gain; plausible wrong frequencies fail', () => {
  const model = {pot: 10, bet: 10, valueProbability: .5};
  const strategy = {valueBet: 1, bluffBet: .5, call: .5};
  const result = verifyRiverEquilibrium(model, strategy);
  assert.equal(result.verified, true); assert.equal(result.bettorPolicies.length, 4); assert.equal(result.defenderPolicies.length, 2);
  assert.deepEqual(result.bestResponseGain, {bettor: 0, defender: 0}); assert.equal(result.bettorPayoff, 7.5);
  assert.equal(result.bluffShareWhenBet, 1 / 3); assert.equal(result.requiredEquity, 1 / 3); assert.notEqual(strategy.call, result.requiredEquity);
  assert.equal(verifyRiverEquilibrium(model, {...strategy, call: 1 / 3}).verified, false);
  assert.equal(verifyRiverEquilibrium(model, {...strategy, bluffBet: 1}).verified, false);
  assert.deepEqual(verifyRiverTypes(['Ac', 'Kd', '7h', '2s', '3c'], ['Qc', 'Qd'], ['As', 'Ad'], ['Jh', 'Th']), {valueWins: true, bluffLoses: true});
  assert.throws(() => verifyRiverTypes(['Ac', 'Kd', '7h', '2s', '3c'], ['Qc', 'Qd'], ['Ac', 'Ad'], ['Jh', 'Th']), {code: 'EQUILIBRIUM_CARDS'});
  assert.throws(() => verifyRiverTypes(['Ac', 'Kd', '7h', '2s', '3c'], ['Qc', 'Qd'], ['As', 'Ad'], ['Jx', 'Th']), {code: 'EQUILIBRIUM_CARDS'});
  const source = {id: 'bounded', start: {street: 'river', board: ['Ac', 'Kd', '7h', '2s', '3c'], button: 'hero', hero: 'hero', actor: 'villain', seats: [{id: 'hero', stack: 10, contributed: 5, hole: ['Qc', 'Qd']}, {id: 'villain', stack: 10, contributed: 5, hole: ['As', 'Ad']}]}, beats: [beat('bet', [{type: 'allin', seat: 'villain'}])]};
  const pending = resolveDecision(source, {beatId: 'bet'}), closed = transition(pending, {type: 'call', seat: 'hero'});
  assert.equal(closed.roundClosed, true); assert.equal(observe(closed).pot, 3000);
  assert.equal(observe(pending).legalActions.some(action => action.type === 'raise'), false);
});
