import {check} from '../errors.mjs';
import {observe} from '../poker/rules.mjs';

const sum = values => values.reduce((a, b) => a + b, 0);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function stacksSchema(stacks, path) {
  check(Array.isArray(stacks) && stacks.length > 0 && stacks.length <= 16, 'ICM_STACKS', 'Exact ICM supports 1–16 explicitly identified players.', path);
  const ids = new Set();
  for (const [i, player] of stacks.entries()) {
    check(object(player) && Object.keys(player).every(key => ['id', 'stack'].includes(key)) && typeof player.id === 'string' && player.id.trim() && !ids.has(player.id) && Number.isFinite(player.stack) && player.stack >= 0, 'ICM_STACKS', 'Use unique player IDs and finite nonnegative chip stacks.', `${path}/${i}`);
    ids.add(player.id);
  }
  const total = sum(stacks.map(player => player.stack));
  check(Number.isFinite(total) && total > 0 && total <= Number.MAX_SAFE_INTEGER, 'ICM_STACKS', 'At least one player must hold chips; total chips must be finite and safely representable.', path);
}

export function tournamentSchema(value, path = 'tournament') {
  check(object(value), 'ICM_SCHEMA', 'Expected tournament assumptions.', path);
  for (const key of Object.keys(value)) check(['payouts', 'unit', 'otherStacks', 'outcomes'].includes(key), 'UNKNOWN_FIELD', `Unknown tournament field: ${key}`, path + '/' + key);
  check(typeof value.unit === 'string' && value.unit.trim().length > 0 && value.unit.length <= 32, 'ICM_UNIT', 'Name the prize unit, for example USD or prizeUnits.', path + '/unit');
  check(Array.isArray(value.payouts) && value.payouts.length > 0 && value.payouts.length <= 16 && value.payouts.every((payout, index) => Number.isFinite(payout) && payout >= 0 && (index === 0 || payout <= value.payouts[index - 1])) && value.payouts[0] > 0, 'ICM_PAYOUTS', 'Provide nonincreasing nonnegative remaining payouts.', path + '/payouts');
  if (value.otherStacks !== undefined) stacksSchema(value.otherStacks, path + '/otherStacks');
  if (value.outcomes !== undefined) {
    check(Array.isArray(value.outcomes) && value.outcomes.length > 0 && value.outcomes.length <= 32, 'ICM_OUTCOMES', 'Provide a bounded distribution of hypothetical terminal stack outcomes.', path + '/outcomes');
    const ids = new Set();
    for (const [i, outcome] of value.outcomes.entries()) {
      const p = `${path}/outcomes/${i}`;
      check(object(outcome) && Object.keys(outcome).every(key => ['id', 'label', 'probability', 'stacks'].includes(key)) && typeof outcome.id === 'string' && outcome.id.trim() && !ids.has(outcome.id), 'ICM_OUTCOMES', 'Use unique outcome IDs.', p);
      ids.add(outcome.id);
      check(object(outcome.label) && Object.values(outcome.label).length && Object.values(outcome.label).every(text => typeof text === 'string' && text.trim()), 'ICM_OUTCOMES', 'Provide localized outcome labels.', p + '/label');
      check(Number.isFinite(outcome.probability) && outcome.probability >= 0 && outcome.probability <= 1, 'ICM_OUTCOMES', 'Outcome probabilities must be fractions between zero and one.', p + '/probability');
      stacksSchema(outcome.stacks, p + '/stacks');
    }
    check(Math.abs(sum(value.outcomes.map(outcome => outcome.probability)) - 1) < 1e-8, 'ICM_OUTCOMES', 'Hypothetical outcomes must form a complete probability distribution.', path + '/outcomes');
  }
}

/** Exact subset-state Malmuth–Harville ICM, with explicitly stated equal-skill assumptions. */
export function independentChipModel(stacks, payouts) {
  stacksSchema(stacks, 'stacks');
  check(Array.isArray(payouts) && payouts.length > 0 && payouts.length <= stacks.length && payouts.every((payout, i) => Number.isFinite(payout) && payout >= 0 && (i === 0 || payout <= payouts[i - 1])) && payouts[0] > 0, 'ICM_PAYOUTS', 'Use a descending payout ladder no longer than the field.', 'payouts');
  const total = sum(stacks.map(player => player.stack)), ladder = [...payouts, ...Array(stacks.length - payouts.length).fill(0)], pool = sum(ladder);
  const live = stacks.filter(player => player.stack > 0), bust = stacks.filter(player => player.stack === 0), n = live.length;
  const finish = Object.fromEntries(stacks.map(player => [player.id, Array(stacks.length).fill(0)]));
  if (bust.length) for (const player of bust) for (let rank = n; rank < stacks.length; rank++) finish[player.id][rank] = 1 / bust.length;
  const probabilities = new Float64Array(1 << n); probabilities[0] = 1;
  const selectedCount = new Uint8Array(1 << n);
  for (let mask = 1; mask < probabilities.length; mask++) {
    const last = mask & -mask, prior = mask ^ last;
    selectedCount[mask] = selectedCount[prior] + 1;
  }
  for (let mask = 0; mask < probabilities.length - 1; mask++) {
    const rank = selectedCount[mask], available = sum(live.filter((_, index) => !(mask & 1 << index)).map(player => player.stack)), probability = probabilities[mask];
    if (!probability) continue;
    for (let i = 0; i < n; i++) if (!(mask & 1 << i)) {
      const next = probability * live[i].stack / available;
      finish[live[i].id][rank] += next; probabilities[mask | 1 << i] += next;
    }
  }
  const players = stacks.map(player => ({...player, chipShare: player.stack / total, chipChop: player.stack / total * pool, finishProbabilities: finish[player.id], equity: sum(finish[player.id].map((probability, rank) => probability * ladder[rank]))}));
  return {method: 'exact-subset-ICM', players, totalChips: total, prizePool: pool, equitySum: sum(players.map(player => player.equity)), payouts: ladder, assumptions: 'Equal future skill; finish probability proportional to remaining chips after each finisher; no position, future blinds, bounty or deal adjustments. Simultaneously zero stacks share their remaining finish places equally.'};
}

export function compileTournament(state, material, locale) {
  tournamentSchema(material);
  const visible = observe(state);
  check(!state.rake || state.rake.rate === 0, 'ICM_RAKE', 'Tournament ICM cannot be combined with cash-game pot rake.', 'tournament');
  check(state.settled || !(state.deadPot > 0) || state.antePaid && Math.abs(sum(Object.values(state.antePaid)) - state.deadPot) < 1e-8, 'ICM_ANTES', 'An unsettled dead-money pot needs its per-player ante ledger to reconstruct baseline stacks.', 'tournament');
  const table = visible.seats.map(player => ({id: player.id, stack: (player.stack + (state.settled ? 0 : player.contributed + (state.antePaid?.[player.id] ?? 0))) / 100}));
  const ids = new Set(table.map(player => player.id));
  for (const player of material.otherStacks ?? []) { check(!ids.has(player.id), 'ICM_STACKS', 'Off-table IDs cannot replace or duplicate engine-derived table stacks.', 'tournament/otherStacks'); ids.add(player.id); }
  const stacks = [...table, ...(material.otherStacks ?? [])], baseline = independentChipModel(stacks, material.payouts), hero = baseline.players.find(player => player.id === state.hero);
  const result = {...baseline, unit: material.unit, hero: state.hero, chipUnit: state.displayUnit ?? 'BB', baseline: state.settled ? 'settledStacks' : 'stacksBeforeThisHandContributions', baselineExplanation: state.settled ? 'Uses actual settled engine stacks.' : 'Uses remaining chips plus each player’s own current-hand contributions and recorded antes; the unresolved pot is not awarded. Outcomes below are explicit hypotheses, not observed future hands.'};
  if (material.outcomes) {
    const total = baseline.totalChips;
    result.outcomes = material.outcomes.map(outcome => {
      check(outcome.stacks.length === stacks.length && outcome.stacks.every(player => ids.has(player.id)), 'ICM_STACKS', 'Every hypothetical outcome must contain the same complete field.', 'tournament/outcomes/' + outcome.id);
      check(Math.abs(sum(outcome.stacks.map(player => player.stack)) - total) <= 1e-8 * Math.max(1, total), 'ICM_CONSERVATION', 'Hypothetical tournament outcomes must conserve total chips.', 'tournament/outcomes/' + outcome.id);
      check(typeof outcome.label[locale] === 'string' && outcome.label[locale].trim(), 'TRANSLATION_MISSING', 'Missing selected-language ICM outcome label.', 'tournament/outcomes/' + outcome.id + '/label/' + locale);
      const calculated = independentChipModel(outcome.stacks, material.payouts), value = calculated.players.find(player => player.id === state.hero);
      return {id: outcome.id, label: outcome.label[locale], probability: outcome.probability, hypothesis: true, players: calculated.players, heroEquity: value.equity, heroStack: value.stack, icmDelta: value.equity - hero.equity, chipDelta: value.stack - hero.stack};
    });
    result.expected = {icmEquity: sum(result.outcomes.map(outcome => outcome.probability * outcome.heroEquity)), icmDelta: sum(result.outcomes.map(outcome => outcome.probability * outcome.icmDelta)), chipDelta: sum(result.outcomes.map(outcome => outcome.probability * outcome.chipDelta)), chipUnit: state.displayUnit ?? 'BB', prizeUnit: material.unit};
  }
  return result;
}
