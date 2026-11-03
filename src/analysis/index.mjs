import {check} from '../errors.mjs';
import {loadState, transition, observe, evaluate} from '../poker/rules.mjs';
import {clone, hash} from '../util.mjs';
import {route} from '../project/routes.mjs';
import {combinations, rangeEntriesSchema, expandRange} from './range.mjs';
import {equityOptionsSchema, compileMetrics} from './metrics.mjs';
import {tournamentSchema, compileTournament} from './tournament.mjs';
import {solverSchema, compileSolver, importSolverData, solverDecision, rangeIdentity} from './solver.mjs';
import {rakeAmount} from '../poker/rules.mjs';

export {combinations, expandRange, filterRange} from './range.mjs';
export {equityAgainstRange, nextCardOuts} from './metrics.mjs';
export {independentChipModel} from './tournament.mjs';

const object = (value, path) => check(value && typeof value === 'object' && !Array.isArray(value), 'ANALYSIS_SCHEMA', 'Expected an object.', path);
function keys(value, allowed, path) {
  object(value, path);
  for (const key of Object.keys(value)) check(allowed.includes(key), 'UNKNOWN_FIELD', `Unknown analysis field: ${key}`, `${path}/${key}`);
}
const nonempty = (value, path) => check(typeof value === 'string' && value.trim(), 'ANALYSIS_SCHEMA', 'Expected nonempty text.', path);
function textMap(value, path) {
  object(value, path);
  check(Object.keys(value).length, 'ANALYSIS_SCHEMA', 'Provide at least one language.', path);
  for (const [locale, text] of Object.entries(value)) nonempty(text, `${path}/${locale}`);
}

const orderedCombo = cards => [...cards].sort().join('');

export function analysisSchema(items, path = 'analysis') {
  check(Array.isArray(items), 'ANALYSIS_SCHEMA', 'Analysis must be an array.', path);
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    const p = `${path}/${index}`;
    keys(item, ['id', 'node', 'title', 'assumptions', 'conditions', 'takeaway', 'objective', 'range', 'calculation', 'metrics', 'equityOptions', 'solver', 'tournament', 'evidence', 'review'], p);
    nonempty(item.id, `${p}/id`);
    check(!ids.has(item.id), 'ANALYSIS_DUPLICATE', 'Analysis IDs must be unique within a scene.', `${p}/id`);
    ids.add(item.id);
    keys(item.node, ['beatId', 'actionIndex'], `${p}/node`);
    nonempty(item.node.beatId, `${p}/node/beatId`);
    if (item.node.actionIndex !== undefined) check(Number.isSafeInteger(item.node.actionIndex) && item.node.actionIndex >= 0, 'ANALYSIS_NODE', 'actionIndex is a zero-based completed action.', `${p}/node/actionIndex`);
    textMap(item.title, `${p}/title`);
    for (const field of ['assumptions', 'conditions', 'takeaway', 'objective']) if (item[field] !== undefined) textMap(item[field], `${p}/${field}`);
    if (item.calculation !== undefined) check(item.calculation === 'potOdds', 'ANALYSIS_CALCULATION', 'Supported calculation: potOdds.', `${p}/calculation`);
    if (item.metrics !== undefined) check(Array.isArray(item.metrics) && item.metrics.length > 0 && new Set(item.metrics).size === item.metrics.length && item.metrics.every(metric => ['spr', 'equity', 'outs', 'callEV'].includes(metric)), 'ANALYSIS_CALCULATION', 'Use distinct spr, equity, outs or callEV metrics.', `${p}/metrics`);
    if (item.equityOptions !== undefined) equityOptionsSchema(item.equityOptions, `${p}/equityOptions`);
    if (item.solver !== undefined) solverSchema(item.solver, `${p}/solver`);
    if (item.tournament !== undefined) tournamentSchema(item.tournament, `${p}/tournament`);
    if (item.range !== undefined) {
      keys(item.range, ['seat', 'groups', 'entries'], `${p}/range`);
      nonempty(item.range.seat, `${p}/range/seat`);
      check(item.range.groups !== undefined || item.range.entries !== undefined, 'ANALYSIS_RANGE', 'Provide illustrative groups or explicit weighted entries.', `${p}/range`);
      if (item.range.groups !== undefined) check(Array.isArray(item.range.groups) && item.range.groups.length > 0, 'ANALYSIS_RANGE', 'Provide illustrative range groups.', `${p}/range/groups`);
      if (item.range.entries !== undefined) rangeEntriesSchema(item.range.entries, `${p}/range/entries`);
      const groupIds = new Set();
      for (const [i, group] of (item.range.groups ?? []).entries()) {
        const gp = `${p}/range/groups/${i}`;
        keys(group, ['id', 'label', 'hands'], gp);
        nonempty(group.id, `${gp}/id`);
        check(!groupIds.has(group.id), 'ANALYSIS_RANGE', 'Group IDs must be unique.', `${gp}/id`);
        groupIds.add(group.id); textMap(group.label, `${gp}/label`);
        check(Array.isArray(group.hands) && group.hands.length > 0, 'ANALYSIS_RANGE', 'Provide candidate hands or exact combinations.', `${gp}/hands`);
        for (const hand of group.hands) check(typeof hand === 'string' && combinations(hand).length > 0, 'ANALYSIS_RANGE', 'Use hands such as AA, KQs, KQo, KQ or AsKd.', `${gp}/hands`);
      }
    }
    if (item.evidence !== undefined) {
      keys(item.evidence, ['kind', 'source', 'model', 'detail'], `${p}/evidence`);
      check(['hypothesis', 'derivation', 'solver'].includes(item.evidence.kind), 'ANALYSIS_EVIDENCE', 'Evidence kind must be hypothesis, derivation or solver.', `${p}/evidence/kind`);
      if (item.evidence.kind !== 'hypothesis' || item.evidence.source !== undefined) nonempty(item.evidence.source, `${p}/evidence/source`);
      if (item.evidence.kind !== 'hypothesis' || item.evidence.model !== undefined) textMap(item.evidence.model, `${p}/evidence/model`);
      if (item.evidence.detail !== undefined) textMap(item.evidence.detail, `${p}/evidence/detail`);
    }
    if (item.review !== undefined) {
      keys(item.review, ['decisionHash', 'materialHash', 'evidenceHash'], `${p}/review`);
      for (const field of ['decisionHash', 'materialHash']) check(typeof item.review[field] === 'string' && /^[a-f0-9]{64}$/.test(item.review[field]), 'ANALYSIS_REVIEW', 'Review fingerprints are produced by analysis.confirm.', `${p}/review/${field}`);
      if (item.review.evidenceHash !== undefined) check(typeof item.review.evidenceHash === 'string' && /^[a-f0-9]{64}$/.test(item.review.evidenceHash), 'ANALYSIS_REVIEW', 'Evidence fingerprints are produced by analysis.confirm.', `${p}/review/evidenceHash`);
    }
  }
}

function decision(scene, node) {
  const branch = scene.branches?.find(candidate => candidate.beats.some(beat => beat.id === node.beatId));
  const beats = route(scene, branch?.id);
  let state = loadState(scene.start), revealed = [], history = [];
  const knownRevealed = new Set();
  for (const beat of beats) {
    if (beat.view) {
      revealed = beat.view.reveal;
      for (const id of revealed) {
        const seat = state.seats.find(candidate => candidate.id === id);
        check(seat, 'REVEAL', 'Unknown revealed seat.', `analysis/${node.beatId}`);
        // An earlier reveal remains part of the viewer's knowledge even if hidden later.
        knownRevealed.add(id);
        history.push({type: 'reveal', seat: id, hole: clone(seat.hole)});
      }
    }
    const actions = beat.actions ?? [];
    const last = beat.id === node.beatId && node.actionIndex !== undefined ? node.actionIndex : actions.length - 1;
    check(last < actions.length, 'ANALYSIS_NODE', 'Decision action no longer exists.', `analysis/${node.beatId}/actionIndex`);
    for (let index = 0; index <= last; index++) {
      state = transition(state, actions[index]);
      history.push(clone(actions[index]));
    }
    if (beat.id === node.beatId) {
      const result = clone(state);
      result.revealed = [...new Set([...state.revealed, ...knownRevealed])];
      for (const seat of result.revealed) check(state.seats.some(p => p.id === seat), 'REVEAL', 'Unknown revealed seat.', `analysis/${node.beatId}`);
      return {state: result, history};
    }
  }
  check(false, 'ANALYSIS_NODE', 'Referenced decision beat does not exist.', `analysis/${node.beatId}`);
}

/** Read only; actions execute on a fresh engine state, never on the live cursor. */
export const resolveDecision = (scene, node) => decision(scene, node).state;

export function decisionFingerprint(scene, node) {
  const {state, history} = decision(scene, node), visible = observe(state);
  // Names, avatars, undisclosed opponent cards and future actions do not change knowledge.
  const {street, board, button, actor, hero, bigBlind, lastFullRaise, actedAt, roundClosed, settled} = visible;
  const seats = visible.seats.map(({id, stack, contributed, streetBet, folded, hole}) => ({
    id, stack, contributed, streetBet, folded,
    hole: id === hero || state.revealed.includes(id) ? hole : null
  }));
  const extra = {};
  for (const name of ['smallBlind', 'rake', 'rakeTaken', 'deadPot', 'antePaid', 'forcedBet', 'displayUnit']) if (visible[name] !== undefined) extra[name] = clone(visible[name]);
  return hash({street, board, button, actor, hero, bigBlind, lastFullRaise, actedAt, roundClosed, settled, seats, history, ...extra});
}

export function solverRequest(scene, node) {
  const state = resolveDecision(scene, node);
  return {version: 1, decisionHash: decisionFingerprint(scene, node), decision: solverDecision(state)};
}

export async function importSolverAnalysis(directory, scene, item, source) {
  return importSolverData(directory, resolveDecision(scene, item.node), decisionFingerprint(scene, item.node), item, source);
}

const materialFingerprint = item => { const {review, ...material} = item; return hash(material); };

/** Preserve a review only when copying references leaves the reviewed facts intact. */
export function remapAnalysis(scene, item, {id, node}) {
  const copy = {...clone(item), id, node: clone(node)};
  if (item.review?.materialHash === materialFingerprint(item) && item.review.decisionHash === decisionFingerprint(scene, node)) {
    copy.review.materialHash = materialFingerprint(copy);
  }
  return copy;
}

export function confirmAnalysis(scene, item, {evidenceHash} = {}) {
  analysisSchema([item]);
  if (evidenceHash !== undefined && evidenceHash !== null) check(typeof evidenceHash === 'string' && /^[a-f0-9]{64}$/.test(evidenceHash), 'ANALYSIS_REVIEW', 'Evidence confirmation needs a SHA-256 from the actual file.', `analysis/${item.id}/review/evidenceHash`);
  return {...clone(item), review: {decisionHash: decisionFingerprint(scene, item.node), materialHash: materialFingerprint(item), ...(evidenceHash && item.evidence?.source?.startsWith('evidence/') ? {evidenceHash} : {})}};
}

function potOdds(state) {
  const visible = observe(state), call = visible.legalActions.find(action => action.type === 'call');
  const base = {kind: 'potOdds', call: call?.amount ?? 0, pot: visible.pot / 100, total: 0, threshold: 0};
  if (state.street !== 'river' || state.settled || state.actor !== state.hero || state.seats.filter(seat => !seat.folded).length !== 2 || !call) {
    return {...base, applicable: false, reason: 'Requires a pending hero call on the river with two live players.'};
  }
  const after = observe(transition(state, {type: 'call', seat: state.hero}));
  if (!after.roundClosed || after.pots.length !== 1 || after.pots[0].eligible.length !== 2) {
    return {...base, applicable: false, reason: 'Requires one shared pot and no betting after the call.'};
  }
  const grossTotal = after.pot / 100, rake = rakeAmount(after) / 100, total = grossTotal - rake;
  return {...base, total, threshold: total > 0 ? call.amount / total : null, applicable: total > 0, ...(rake ? {grossTotal, rake} : {}), ...(state.displayUnit ? {unit: state.displayUnit} : {}), ...(total <= 0 ? {reason: 'No contestable pot remains after rake.'} : {})};
}

/** Localized, derived view; review binds assumptions to a decision, not evidence truth. */
export function compileAnalysis(scene, item, locale) {
  analysisSchema([item]);
  const state = resolveDecision(scene, item.node), fingerprint = decisionFingerprint(scene, item.node), issues = [];
  const issue = (code, message, suffix = '') => issues.push({code, message, path: `scenes/${scene.id}/analysis/${item.id}${suffix}`, retryable: false});
  const text = (map, suffix) => {
    if (typeof map?.[locale] === 'string' && map[locale].trim()) return map[locale];
    issue('TRANSLATION_MISSING', 'Missing selected-language analysis text.', `${suffix}/${locale}`); return '…';
  };
  let status = 'current';
  if (!item.review) { status = 'unreviewed'; issue('ANALYSIS_UNREVIEWED', 'Review the current decision and material through analysis.confirm.'); }
  else if (item.review.decisionHash !== fingerprint || item.review.materialHash !== materialFingerprint(item)) {
    status = 'stale'; issue('ANALYSIS_STALE', 'Decision or analysis material changed; review conclusions and dependent narration before analysis.confirm.');
  }
  const result = {id: item.id, node: clone(item.node), title: text(item.title, '/title'), decision: observe(state), decisionHash: fingerprint, status, issues};
  for (const field of ['assumptions', 'conditions', 'takeaway', 'objective']) if (item[field]) result[field] = text(item[field], `/${field}`);
  if (item.calculation) {
    result.calculation = potOdds(state);
    if (!result.calculation.applicable) issue('ANALYSIS_CALCULATION', result.calculation.reason, '/calculation');
  }
  if (item.range) {
    check(state.seats.some(seat => seat.id === item.range.seat), 'ANALYSIS_RANGE', 'Range seat does not exist.', `analysis/${item.id}/range/seat`);
    const known = observe(state), blocked = new Set([...known.board, ...known.seats.filter(seat => seat.id !== item.range.seat).flatMap(seat => seat.hole).filter(Boolean)]);
    const seen = new Set(); let overlaps = false;
    const groups = (item.range.groups ?? []).map(group => {
      const combos = new Set();
      for (const hand of group.hands) {
        const available = combinations(hand).filter(cards => cards.every(card => !blocked.has(card)));
        if (!available.length) issue('ANALYSIS_RANGE_BLOCKED', `Candidate ${hand} is blocked by known cards.`, `/range/groups/${group.id}`);
        for (const cards of available) combos.add(orderedCombo(cards));
      }
      for (const combo of combos) { if (seen.has(combo)) overlaps = true; seen.add(combo); }
      return {id: group.id, label: text(group.label, `/range/groups/${group.id}/label`), hands: clone(group.hands), combinationCount: combos.size};
    });
    result.range = {seat: item.range.seat, groups, coverage: 'examples', overlaps, combinationCount: seen.size};
    if (item.range.entries) {
      const expanded = expandRange(item.range.entries, {blocked: [...blocked], board: known.board, unit: state.displayUnit ?? 'BB'});
      result.range = {...result.range, ...expanded, overlaps};
      if (!expanded.weightedCount) issue('ANALYSIS_RANGE_EMPTY', 'The assumed range has no unblocked positive-weight combinations.', '/range/entries');
    }
  }
  if (item.metrics) {
    result.metrics = compileMetrics(state, item);
    for (const metric of result.metrics) if (!metric.applicable) issue(metric.errorCode ?? 'ANALYSIS_CALCULATION', metric.reason, '/metrics/' + metric.kind);
  }
  if (item.solver) {
    try {
      result.solver = compileSolver(state, fingerprint, item.solver);
      const assumed = item.solver.data.model.ranges?.find(range => range.seat === item.range?.seat);
      if (assumed && item.range.entries) check(rangeIdentity(state, assumed.seat, assumed.entries) === rangeIdentity(state, assumed.seat, item.range.entries), 'SOLVER_RANGE_MISMATCH', 'The teaching range differs from the solver input range; import a solve for the changed assumption.', 'solver/model/ranges');
      if (!item.range) result.range = {seat: result.solver.seat, groups: [], overlaps: false, ...result.solver.range};
    } catch (error) { if (!error.code) throw error; issue(error.code, error.message, '/solver'); }
    if (item.evidence?.kind !== 'solver' || !item.evidence.source?.startsWith('evidence/')) issue('SOLVER_EVIDENCE', 'Solver results require their imported local evidence attachment.', '/solver');
  }
  if (item.tournament) {
    try { result.tournament = compileTournament(state, item.tournament, locale); }
    catch (error) { if (!error.code) throw error; issue(error.code, error.message, '/tournament'); }
  }
  if (item.evidence) {
    result.evidence = {kind: item.evidence.kind, authorProvided: true};
    if (item.evidence.source !== undefined) result.evidence.source = item.evidence.source;
    if (item.evidence.source?.startsWith('evidence/')) {
      if (item.review?.evidenceHash) result.evidence.sha256 = item.review.evidenceHash;
      else issue('EVIDENCE_UNBOUND', 'Confirm analysis to bind the referenced local evidence file.', '/evidence/source');
    }
    if (item.solver) result.evidence.solverDataHash = hash(item.solver.data);
    for (const field of ['model', 'detail']) if (item.evidence[field]) result.evidence[field] = text(item.evidence[field], `/evidence/${field}`);
  }
  return result;
}

/**
 * Verify one restricted constant-sum river game by exhaustive pure best responses.
 * Bettor has value (always wins) or bluff (always loses); checks end at showdown.
 * A single fixed bet faces call/fold only. This is not a full Hold'em solver.
 */
export function verifyRiverEquilibrium(model, strategy, tolerance = 1e-9) {
  keys(model, ['pot', 'bet', 'valueProbability'], 'model');
  keys(strategy, ['valueBet', 'bluffBet', 'call'], 'strategy');
  for (const field of ['pot', 'bet']) check(Number.isFinite(model[field]) && model[field] > 0, 'EQUILIBRIUM_MODEL', 'Pot and bet must be positive.', `model/${field}`);
  check(Number.isFinite(model.valueProbability) && model.valueProbability > 0 && model.valueProbability < 1, 'EQUILIBRIUM_MODEL', 'Both private types must have positive prior probability.', 'model/valueProbability');
  for (const field of ['valueBet', 'bluffBet', 'call']) check(Number.isFinite(strategy[field]) && strategy[field] >= 0 && strategy[field] <= 1, 'EQUILIBRIUM_STRATEGY', 'Use a probability between zero and one.', `strategy/${field}`);
  check(Number.isFinite(tolerance) && tolerance >= 0 && tolerance <= 1e-6, 'EQUILIBRIUM_MODEL', 'Use a small nonnegative numerical tolerance.', 'tolerance');
  const {pot: p, bet: b, valueProbability: v} = model;
  // Explicit terminal outcome payoffs; sum of the two players' payoffs is p.
  const payoff = ({valueBet, bluffBet, call}) => v * ((1 - valueBet) * p + valueBet * ((1 - call) * p + call * (p + b))) + (1 - v) * bluffBet * ((1 - call) * p - call * b);
  const expectedValue = payoff(strategy);
  const bettorPolicies = [0, 1].flatMap(valueBet => [0, 1].map(bluffBet => ({valueBet, bluffBet, payoff: payoff({...strategy, valueBet, bluffBet})})));
  const defenderPolicies = [0, 1].map(call => ({call, payoff: p - payoff({...strategy, call})}));
  const bettorGain = Math.max(...bettorPolicies.map(policy => policy.payoff)) - expectedValue;
  const defenderGain = Math.max(...defenderPolicies.map(policy => policy.payoff)) - (p - expectedValue);
  const bettingMass = v * strategy.valueBet + (1 - v) * strategy.bluffBet;
  return {
    model: clone(model), strategy: clone(strategy), verified: bettorGain <= tolerance && defenderGain <= tolerance,
    bettorPayoff: expectedValue, defenderPayoff: p - expectedValue,
    bestResponseGain: {bettor: Math.max(0, bettorGain), defender: Math.max(0, defenderGain)},
    bettorPolicies, defenderPolicies,
    bluffShareWhenBet: bettingMass ? (1 - v) * strategy.bluffBet / bettingMass : null,
    requiredEquity: b / (p + 2 * b),
    scope: 'One fixed river bet or check-to-showdown; value always wins, bluff always loses; call/fold only; no rake.'
  };
}

/** Card audit for a claimed two-type model; range probabilities remain hypotheses. */
export function verifyRiverTypes(board, catcher, value, bluff) {
  check(Array.isArray(board) && board.length === 5 && [catcher, value, bluff].every(cards => Array.isArray(cards) && cards.length === 2), 'EQUILIBRIUM_CARDS', 'Provide a river board and three two-card holdings.', 'cards');
  check([...board, ...catcher, ...value, ...bluff].every(card => typeof card === 'string' && /^[2-9TJQKA][cdhs]$/.test(card)), 'EQUILIBRIUM_CARDS', 'Use standard rank-and-suit cards.', 'cards');
  for (const opponent of [value, bluff]) check(new Set([...board, ...catcher, ...opponent]).size === 9, 'EQUILIBRIUM_CARDS', 'Known cards and each possible opponent holding must not collide.', 'cards');
  const rank = evaluate([...board, ...catcher]);
  return {valueWins: evaluate([...board, ...value]) > rank, bluffLoses: evaluate([...board, ...bluff]) < rank};
}
