import {readFile, writeFile, mkdir, lstat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {check, RiverError} from '../errors.mjs';
import {hash, clone} from '../util.mjs';
import {observe,displayState,transition} from '../poker/rules.mjs';
import {rangeEntriesSchema, expandRange} from './range.mjs';
import {readEvidenceJSON} from './evidence.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim();
const finite = value => Number.isFinite(value) && value >= 0;
const fingerprint = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const keys = (value, allowed, path) => { check(object(value), 'SOLVER_SCHEMA', 'Expected a structured solver object.', path); for (const field of Object.keys(value)) check(allowed.includes(field), 'UNKNOWN_FIELD', `Unknown solver field: ${field}`, path + '/' + field); };

export function solverDecision(state) {
  const visible = displayState(observe(state));
  return {street: visible.street, board: clone(visible.board), button: visible.button, hero: visible.hero, actor: visible.actor, unit: visible.unit, bigBlind: visible.bigBlind, pot: visible.pot, deadPot: visible.deadPot ?? 0, seats: visible.seats.map(player => ({id: player.id, stack: player.stack, contributed: player.contributed, streetBet: player.streetBet, folded: player.folded, hole: player.id===visible.hero||visible.revealed.includes(player.id)?clone(player.hole):[null,null]}))};
}

export function solverSchema(solver, path = 'solver') {
  keys(solver, ['data', 'boundDecisionHash'], path);
  check(fingerprint(solver.boundDecisionHash), 'SOLVER_BINDING', 'Import a solver attachment to bind its result to the current public decision.', path + '/boundDecisionHash');
  solverPayloadSchema(solver.data, path + '/data');
}

export function solverPayloadSchema(data, path = 'solver') {
  keys(data, ['version', 'decisionHash', 'decision', 'model', 'strategy'], path);
  check(data.version === 1, 'SOLVER_VERSION', 'Supported normalized solver format: version 1.', path + '/version');
  check(fingerprint(data.decisionHash) || object(data.decision), 'SOLVER_BINDING', 'Supply the exported public decision hash or the complete exported solver decision.', path + '/decision');
  if (data.decisionHash !== undefined) check(fingerprint(data.decisionHash), 'SOLVER_BINDING', 'Use the exported decision hash unchanged.', path + '/decisionHash');
  keys(data.model, ['game', 'units', 'rake', 'actions', 'algorithm', 'accuracy', 'notes', 'ranges'], path + '/model');
  check(data.model.game === 'NLHE' && ['BB', 'chips'].includes(data.model.units) && text(data.model.algorithm), 'SOLVER_MODEL', 'Declare NLHE, BB or chips units and the originating solver/algorithm.', path + '/model');
  if (data.model.notes !== undefined) check(text(data.model.notes), 'SOLVER_MODEL', 'Notes must be nonempty text.', path + '/model/notes');
  if (data.model.rake !== null) {
    keys(data.model.rake, ['rate', 'cap', 'minPot', 'noFlopNoDrop'], path + '/model/rake');
    check(finite(data.model.rake.rate) && data.model.rake.rate <= 1 && finite(data.model.rake.cap) && (data.model.rake.minPot === undefined || finite(data.model.rake.minPot)) && typeof data.model.rake.noFlopNoDrop === 'boolean', 'SOLVER_MODEL', 'Declare the exact rake rate, cap and no-flop policy; use null for no rake.', path + '/model/rake');
  }
  if (data.model.accuracy !== undefined) {
    keys(data.model.accuracy, ['metric', 'value', 'unit'], path + '/model/accuracy');
    check(text(data.model.accuracy.metric) && text(data.model.accuracy.unit) && finite(data.model.accuracy.value), 'SOLVER_MODEL', 'Accuracy needs a named metric, finite value and explicit unit.', path + '/model/accuracy');
  }
  if (data.model.ranges !== undefined) {
    check(Array.isArray(data.model.ranges) && data.model.ranges.length > 0 && data.model.ranges.length <= 9, 'SOLVER_RANGE', 'Declare one input range per modeled player.', path + '/model/ranges');
    const seats = new Set();
    for (const [index, range] of data.model.ranges.entries()) {
      const p = `${path}/model/ranges/${index}`; keys(range, ['seat', 'entries'], p);
      check(text(range.seat) && !seats.has(range.seat), 'SOLVER_RANGE', 'Input range seats must be unique.', p + '/seat'); seats.add(range.seat);
      rangeEntriesSchema(range.entries, p + '/entries');
    }
  }
  check(Array.isArray(data.model.actions) && data.model.actions.length > 0 && data.model.actions.length <= 32, 'SOLVER_MODEL', 'Provide the solved action abstraction at this decision.', path + '/model/actions');
  const actions = new Set();
  for (const [index, action] of data.model.actions.entries()) {
    const p = `${path}/model/actions/${index}`; keys(action, ['id', 'type', 'to'], p);
    check(typeof action.id === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(action.id) && !actions.has(action.id) && ['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(action.type), 'SOLVER_MODEL', 'Actions need unique IDs and legal poker action types.', p);
    actions.add(action.id);
    if (['bet', 'raise'].includes(action.type)) check(finite(action.to) && action.to > 0, 'SOLVER_MODEL', 'Bet and raise sizes are total street commitments.', p + '/to');
    else check(action.to === undefined || action.type === 'allin' && finite(action.to), 'SOLVER_MODEL', 'Only bet, raise or allin have a total commitment.', p + '/to');
  }
  keys(data.strategy, ['seat', 'entries'], path + '/strategy'); check(text(data.strategy.seat), 'SOLVER_MODEL', 'Identify the acting player whose strategy is provided.', path + '/strategy/seat');
  rangeEntriesSchema(data.strategy.entries, path + '/strategy/entries');
  for (const [index, entry] of data.strategy.entries.entries()) {
    check(entry.actions && Object.keys(entry.actions).every(action => actions.has(action)), 'SOLVER_ACTION', 'Every solver row needs a complete distribution using declared action IDs.', `${path}/strategy/entries/${index}/actions`);
    if (entry.ev) check(Object.keys(entry.ev).every(action => actions.has(action)), 'SOLVER_ACTION', 'Action EV uses the same declared action IDs.', `${path}/strategy/entries/${index}/ev`);
  }
}

function rakeModel(state) {
  return displayState(observe(state)).rake??null;
}

export function validateSolverBinding(state, decisionHash, solver) {
  solverSchema(solver);
  const data = solver.data, visible = observe(state), decision = solverDecision(state);
  check(solver.boundDecisionHash === decisionHash && (!data.decisionHash || data.decisionHash === decisionHash), 'SOLVER_STALE', 'Solver result is bound to a different public decision or action history; import a matching solve.', 'solver/decisionHash');
  if (data.decision) check(hash(data.decision) === hash(decision), 'SOLVER_STATE', 'Solver public cards, chips, players or units do not match this decision.', 'solver/decision');
  check(data.model.units === decision.unit, 'SOLVER_UNITS', 'Solver chip units must match the scene.', 'solver/model/units');
  const modelRake = data.model.rake && {...data.model.rake, minPot: data.model.rake.minPot ?? 0};
  check(hash(modelRake) === hash(rakeModel(state)), 'SOLVER_RAKE', 'Solver rake assumptions do not match the engine.', 'solver/model/rake');
  check(data.strategy.seat === state.actor, 'SOLVER_ACTOR', 'Imported strategy must belong to the player acting at the referenced node.', 'solver/strategy/seat');
  for (const range of data.model.ranges ?? []) check(state.seats.some(player => player.id === range.seat && !player.folded), 'SOLVER_RANGE', 'Solver ranges must refer to live players at this node.', 'solver/model/ranges/' + range.seat);
  for (const action of data.model.actions) {
    const legal = visible.legalActions.find(candidate => candidate.type === action.type);
    check(legal, 'SOLVER_ACTION', 'The solved action abstraction contains an illegal action.', 'solver/model/actions/' + action.id);
    try{transition(state,{seat:state.actor,type:action.type,...(['bet','raise'].includes(action.type)?{to:action.to}:{})});}
    catch(error){check(false,'SOLVER_ACTION','The solver action cannot be executed by the rules engine.','solver/model/actions/'+action.id,{cause:error.code});}
    if (action.type === 'allin' && action.to !== undefined) check(action.to === legal.to, 'SOLVER_ACTION', 'Solver all-in commitment does not match the stack.', 'solver/model/actions/' + action.id);
  }
  return data;
}

export function rangeIdentity(state, seat, entries) {
  const visible = observe(state), blocked = [...new Set([...visible.board, ...visible.seats.filter(player => player.id !== seat).flatMap(player => player.hole).filter(Boolean)])];
  return hash(expandRange(entries, {blocked}).combos.filter(combo => combo.weight > 0).map(combo => ({cards: [...combo.cards].sort().join(''), weight: combo.weight})).sort((a, b) => a.cards.localeCompare(b.cards)));
}

export function compileSolver(state, decisionHash, solver) {
  const data = validateSolverBinding(state, decisionHash, solver), visible = observe(state), seat = data.strategy.seat;
  const blocked = [...new Set([...visible.board, ...visible.seats.filter(player => player.id !== seat).flatMap(player => player.hole).filter(Boolean)])];
  const range = expandRange(data.strategy.entries, {blocked, board: visible.board, unit: data.model.units});
  check(range.weightedCount > 0, 'SOLVER_RANGE', 'The supplied strategy has no possible weighted combinations at this node.', 'solver/strategy/entries');
  const actorRange = data.model.ranges?.find(range => range.seat === seat);
  if (actorRange) check(rangeIdentity(state, seat, actorRange.entries) === rangeIdentity(state, seat, data.strategy.entries), 'SOLVER_RANGE_MISMATCH', 'Strategy rows do not represent the declared acting-player input range.', 'solver/strategy/entries');
  const missingRanges = visible.seats.filter(player => !player.folded && !data.model.ranges?.some(range => range.seat === player.id)).map(player => player.id);
  return {decisionHash, model: clone(data.model), seat, source: 'external', missingInputRanges: missingRanges, verification: 'Input identity, legal actions, probability units and attachment integrity checked; absent model inputs remain unspecified and the external strategy is not independently proved optimal.', range, dataHash: hash(data)};
}

/** Imports immutable content-addressed data. It intentionally does not approve the author's conclusions. */
export async function importSolverData(directory, state, decisionHash, item, source) {
  let bytes, data;
  if (typeof source === 'string') {
    const read = await readEvidenceJSON(directory, source); data = read.json; bytes = read.bytes;
  } else {
    keys(source, ['data', 'path'], 'source');
    check(Object.hasOwn(source, 'data') !== Object.hasOwn(source, 'path'), 'SOLVER_SOURCE', 'Use exactly one source.data or source.path.', 'source');
    if (source.data !== undefined) { data = clone(source.data); bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n'); }
    else {
      check(text(source.path), 'SOLVER_SOURCE', 'Provide a source JSON path.', 'source/path');
      try {
        const path = resolve(source.path), info = await lstat(path);
        check(info.isFile() && info.size <= 16 * 1024 * 1024, 'SOLVER_SOURCE', 'Solver sources must be regular JSON files no larger than 16 MiB.', 'source/path');
        bytes = await readFile(path);
      } catch (error) {
        if (error instanceof RiverError) throw error;
        check(false, 'SOLVER_SOURCE', 'Cannot read the selected solver JSON file.', 'source/path', {cause: error.code ?? 'READ_ERROR'});
      }
      try { data = JSON.parse(bytes.toString('utf8')); } catch { check(false, 'SOLVER_SOURCE', 'Solver source is not valid JSON.', 'source/path'); }
    }
  }
  check(bytes.length <= 16 * 1024 * 1024, 'SOLVER_SOURCE', 'Solver JSON is larger than 16 MiB.', 'source');
  const solver = {data, boundDecisionHash: decisionHash}; compileSolver(state, decisionHash, solver);
  const relative = 'evidence/solver-' + hash(bytes) + '.json', destination = join(directory, relative);
  await mkdir(join(directory, 'evidence'), {recursive: true});
  check(!(await lstat(join(directory, 'evidence'))).isSymbolicLink(), 'EVIDENCE_PATH', 'The evidence directory must be a real project directory.', 'evidence');
  try { await writeFile(destination, bytes, {flag: 'wx'}); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readEvidenceJSON(directory, relative); check(existing.sha256 === hash(bytes), 'EVIDENCE_CHANGED', 'Existing content-addressed evidence does not match its name.', relative);
  }
  const result = {...clone(item), solver, evidence: {kind: 'solver', source: relative, model: item.evidence?.model ?? {'zh-CN': '外部 NLHE 求解结果，模型和行动空间随附件保存。', 'en-US': 'External NLHE solution; model and action abstraction are stored in the attachment.', 'ja-JP': '外部の NLHE 解析結果。モデルとアクションの条件を添付データに保存。'}}};
  delete result.review; return result;
}
