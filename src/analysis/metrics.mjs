import {check} from '../errors.mjs';
import * as poker from '../poker/rules.mjs';
import {hash, clone} from '../util.mjs';
import {deck, expandRange, validCards} from './range.mjs';

const cache = new Map();
const sum = values => values.reduce((a, b) => a + b, 0);
const choose = (n, k) => { let result = 1; for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i; return Math.round(result); };

export function equityOptionsSchema(options = {}, path = 'equityOptions') {
  check(options && typeof options === 'object' && !Array.isArray(options), 'ANALYSIS_EQUITY', 'Expected equity settings.', path);
  for (const name of Object.keys(options)) check(['method', 'samples', 'seed'].includes(name), 'UNKNOWN_FIELD', `Unknown equity option: ${name}`, path + '/' + name);
  check(options.method === undefined || ['auto', 'exact', 'sample'].includes(options.method), 'ANALYSIS_EQUITY', 'Use auto, exact or sample.', path + '/method');
  check(options.samples === undefined || Number.isSafeInteger(options.samples) && options.samples >= 100 && options.samples <= 100000, 'ANALYSIS_EQUITY', 'Use 100–100000 deterministic samples.', path + '/samples');
  check(options.seed === undefined || Number.isSafeInteger(options.seed) && options.seed >= 0 && options.seed <= 0xffffffff, 'ANALYSIS_EQUITY', 'Use an unsigned 32-bit seed.', path + '/seed');
}

function randomSource(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}

function* runouts(cards, count, start = 0, prefix = []) {
  if (!count) { yield prefix; return; }
  for (let i = start; i <= cards.length - count; i++) yield* runouts(cards, count - 1, i + 1, [...prefix, cards[i]]);
}

/** Heads-up check-down equity against an explicit weighted range, never a strategy frequency. */
export function equityAgainstRange({hero, board = [], entries, dead = [], options = {}}) {
  validCards(hero, {min: 2, max: 2, path: 'hero'}); validCards(board, {max: 5, path: 'board'}); validCards(dead, {path: 'dead'});
  check([0, 3, 4, 5].includes(board.length), 'ANALYSIS_EQUITY', 'Use a preflop, flop, turn or river board.', 'board');
  validCards([...hero, ...board, ...dead]); equityOptionsSchema(options);
  const cacheKey = hash({hero, board, entries, dead, options});
  if (cache.has(cacheKey)) return clone(cache.get(cacheKey));
  const blocked = [...hero, ...board, ...dead], range = expandRange(entries, {blocked}), candidates = range.combos.filter(combo => combo.weight > 0);
  check(candidates.length > 0 && range.weightedCount > 0, 'ANALYSIS_RANGE_EMPTY', 'The assumed range has no unblocked positive-weight combinations.', 'entries');
  const missing = 5 - board.length;
  check(52 - blocked.length - 2 >= missing, 'ANALYSIS_CARDS', 'Not enough undealt cards remain for the requested showdown.', 'dead');
  const countPerCombo = choose(52 - blocked.length - 2, missing), totalStates = countPerCombo * candidates.length;
  const method = options.method === 'sample' && missing > 0 ? 'sample' : options.method === 'exact' || missing === 0 || options.method !== 'sample' && totalStates <= 20000 ? 'exact' : 'sample';
  check(method !== 'exact' || totalStates <= 100000, 'ANALYSIS_BUDGET', 'Exact enumeration exceeds 100000 outcomes; choose deterministic sampling.', 'equityOptions/method', {outcomes: totalStates});
  let win = 0, tie = 0, loss = 0, squared = 0, count = 0;
  const accumulate = (opponent, runout, weight) => {
    const fullBoard = [...board, ...runout], a = poker.evaluate([...hero, ...fullBoard]), b = poker.evaluate([...opponent, ...fullBoard]), score = a > b ? 1 : a === b ? .5 : 0;
    if (score === 1) win += weight; else if (score === .5) tie += weight; else loss += weight;
    squared += weight * score ** 2; count++;
  };
  if (method === 'exact') {
    for (const combo of candidates) {
      const used = new Set([...blocked, ...combo.cards]), available = deck.filter(card => !used.has(card));
      for (const runout of runouts(available, missing)) accumulate(combo.cards, runout, combo.weight / range.weightedCount / countPerCombo);
    }
  } else {
    const samples = options.samples ?? 2048, random = randomSource(options.seed ?? 0x72697665);
    const cumulative = []; let mass = 0;
    for (const combo of candidates) { mass += combo.weight; cumulative.push(mass); }
    for (let i = 0; i < samples; i++) {
      const draw = random() * mass; let lo = 0, hi = cumulative.length - 1;
      while (lo < hi) { const mid = lo + hi >> 1; if (draw < cumulative[mid]) hi = mid; else lo = mid + 1; }
      const opponent = candidates[lo].cards, used = new Set([...blocked, ...opponent]), available = deck.filter(card => !used.has(card)), runout = [];
      for (let j = 0; j < missing; j++) { const at = j + Math.floor(random() * (available.length - j)); [available[j], available[at]] = [available[at], available[j]]; runout.push(available[j]); }
      accumulate(opponent, runout, 1 / samples);
    }
  }
  const mass = win + tie + loss, equity = (win + tie / 2) / mass, standardError = method === 'sample' ? Math.sqrt(Math.max(0, squared / mass - equity ** 2) / count) : 0;
  const bound = method === 'sample' ? Math.sqrt(Math.log(40) / (2 * count)) : 0;
  const result = {equity, win: win / mass, tie: tie / mass, loss: loss / mass, method, samples: count, exactOutcomes: totalStates, seed: method === 'sample' ? options.seed ?? 0x72697665 : null, standardError, confidence95: [Math.max(0, equity - bound), Math.min(1, equity + bound)], confidenceMethod: method === 'sample' ? 'Hoeffding bounded-score interval under the assumed random sampling model' : 'exact enumeration', assumption: 'Heads-up, fixed weighted opponent range, uniformly dealt remaining public cards, check-down to showdown; ignores future strategy and rake.'};
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, clone(result)); return result;
}

/** Next-card classifications retain card-removal probabilities and redraw caveats. */
export function nextCardOuts({hero, board, entries, dead = []}) {
  validCards(hero, {min: 2, max: 2}); validCards(board, {min: 3, max: 4}); validCards([...hero, ...board, ...dead]);
  check(typeof poker.evaluatePartial === 'function', 'ANALYSIS_OUTS', 'The shared engine needs partial-hand ranking.', 'outs');
  const blocked = [...hero, ...board, ...dead], assumed = expandRange(entries, {blocked}), combos = assumed.combos.filter(combo => combo.weight > 0);
  check(assumed.weightedCount > 0, 'ANALYSIS_RANGE_EMPTY', 'No positive range mass remains.', 'range');
  const score = (cards, opponent) => { const a = poker.evaluatePartial([...hero, ...cards]), b = poker.evaluatePartial([...opponent, ...cards]); return a > b ? 1 : a === b ? .5 : 0; };
  const currentShare = sum(combos.map(combo => score(board, combo.cards) * combo.weight)) / assumed.weightedCount;
  const cards = deck.filter(card => !blocked.includes(card)).map(card => {
    const available = combos.filter(combo => !combo.cards.includes(card)), weight = sum(available.map(combo => combo.weight));
    if (!weight) return null;
    const outcomes = available.map(combo => ({score: score([...board, card], combo.cards), weight: combo.weight}));
    const win = sum(outcomes.filter(outcome => outcome.score === 1).map(outcome => outcome.weight)) / weight;
    const tie = sum(outcomes.filter(outcome => outcome.score === .5).map(outcome => outcome.weight)) / weight;
    const share = win + tie / 2;
    return {card, probability: weight / assumed.weightedCount / (52 - blocked.length - 2), win, tie, share, improves: share > currentShare + 1e-12, clean: share > currentShare + 1e-12 && win >= 1 - 1e-12};
  }).filter(Boolean);
  const clean = cards.filter(card => card.clean).map(card => card.card), dirty = cards.filter(card => card.improves && !card.clean).map(card => card.card);
  return {clean, dirty, cards, currentShare, improvementProbability: sum(cards.filter(card => card.improves).map(card => card.probability)), cleanProbability: sum(cards.filter(card => card.clean).map(card => card.probability)), definition: board.length === 4 ? 'A clean river card beats every still-possible combination in the assumed range; dirty cards improve average showdown share but do not guarantee a win.' : 'A clean turn card leads every still-possible combination now; river redraws remain possible. This is a next-card lead count, not final winning probability.'};
}

export function compileMetrics(state, item) {
  const visible = poker.observe(state), hero = visible.seats.find(seat => seat.id === state.hero), target = visible.seats.find(seat => seat.id === item.range?.seat), live = visible.seats.filter(seat => !seat.folded), entries = item.range?.entries;
  const dead = [...new Set(visible.seats.filter(seat => seat.id !== state.hero && seat.id !== target?.id).flatMap(seat => seat.hole).filter(Boolean))];
  const result = [], fail = (kind, unit, reason) => ({kind, unit, value: null, applicable: false, reason});
  let equity;
  for (const kind of item.metrics ?? []) {
    if (kind === 'spr') {
      const pot = visible.pot / 100, opponents = live.filter(seat => seat.id !== state.hero);
      result.push(pot > 0 && opponents.length ? {kind, unit: 'ratio', value: Math.min(hero.stack, Math.max(...opponents.map(seat => seat.stack))) / 100 / pot, applicable: true, pot, effectiveStack: Math.min(hero.stack, Math.max(...opponents.map(seat => seat.stack))) / 100, byOpponent: opponents.map(seat => ({seat: seat.id, effectiveStack: Math.min(hero.stack, seat.stack) / 100, value: Math.min(hero.stack, seat.stack) / 100 / pot})), definition: 'Remaining effective stack divided by the current gross pot; multiway headline uses the deepest live opponent.'} : fail(kind, 'ratio', 'SPR needs a positive unawarded pot and at least one opponent.')); continue;
    }
    const unit = kind === 'outs' ? 'cards' : kind === 'callEV' ? state.displayUnit ?? 'BB' : 'probability';
    if (live.length !== 2 || !target || target.id === hero.id || target.folded || hero.hole.length !== 2 || hero.hole.some(card => !card) || !entries) { result.push(fail(kind, unit, 'Needs a heads-up decision, known hero cards and an explicit weighted range for the live opponent.')); continue; }
    try {
      if (kind === 'outs') {
        if (![3, 4].includes(state.board.length)) { result.push(fail(kind, unit, 'Next-card outs require a flop or turn board.')); continue; }
        const outs = nextCardOuts({hero: hero.hole, board: state.board, entries, dead}); result.push({kind, unit, applicable: true, value: outs.clean.length, ...outs}); continue;
      }
      equity ??= equityAgainstRange({hero: hero.hole, board: state.board, entries, dead, options: item.equityOptions});
      if (kind === 'equity') { result.push({kind, unit, applicable: true, value: equity.equity, ...equity}); continue; }
      const call = visible.legalActions.find(action => action.type === 'call');
      if (state.street !== 'river' || !call || state.actor !== state.hero) { result.push(fail(kind, unit, 'Call EV is only terminal river call versus fold; it does not estimate future betting or raising EV.')); continue; }
      const after = poker.observe(poker.transition(state, {type: 'call', seat: state.hero}));
      if (!after.roundClosed || after.pots.length !== 1 || after.pots[0].eligible.length !== 2) { result.push(fail(kind, unit, 'Call must close betting into one shared pot.')); continue; }
      const grossTotal = after.pot / 100, rake = (poker.rakeAmount?.(after) ?? 0) / 100, netTotal = grossTotal - rake;
      result.push({kind, unit, applicable: true, value: equity.equity * netTotal - call.amount, foldEV: 0, call: call.amount, grossTotal, rake, netTotal, equity: equity.equity, method: equity.method, definition: 'Incremental chip EV relative to folding now; past contributions are sunk. Ties split the net pot.'});
    } catch (error) {
      if (!error.code) throw error;
      result.push({...fail(kind, unit, error.message), errorCode: error.code});
    }
  }
  return result;
}
