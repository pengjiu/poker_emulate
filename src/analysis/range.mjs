import {check} from '../errors.mjs';
import * as poker from '../poker/rules.mjs';

export const ranks = 'AKQJT98765432';
export const deck = [...ranks].flatMap(rank => [...'cdhs'].map(suit => rank + suit));
const cardPattern = /^[2-9TJQKA][cdhs]$/;
const categoryNames = ['highCard', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];
const sum = values => values.reduce((a, b) => a + b, 0);
const key = cards => [...cards].sort().join('');

export function validCards(cards, {min = 0, max = 52, path = 'cards'} = {}) {
  check(Array.isArray(cards) && cards.length >= min && cards.length <= max && cards.every(card => typeof card === 'string' && cardPattern.test(card)) && new Set(cards).size === cards.length, 'ANALYSIS_CARDS', 'Use unique physical cards such as As or Td.', path);
}

/** Expand ordinary range notation; weights always apply to each exact combination. */
export function combinations(hand) {
  if (typeof hand !== 'string') return [];
  if (/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/.test(hand)) {
    const cards = [hand.slice(0, 2), hand.slice(2)];
    return cards[0] === cards[1] ? [] : [cards];
  }
  const match = /^([2-9TJQKA])([2-9TJQKA])([so]?)$/.exec(hand);
  if (!match || match[1] === match[2] && match[3]) return [];
  const [, first, second, suited] = match, result = new Map();
  for (const a of 'cdhs') for (const b of 'cdhs') {
    if (first === second && a === b || suited === 's' && a !== b || suited === 'o' && a === b) continue;
    const cards = [first + a, second + b]; result.set(key(cards), cards);
  }
  return [...result.values()];
}

export function handClass(cards) {
  const ordered = [...cards].sort((a, b) => ranks.indexOf(a[0]) - ranks.indexOf(b[0]) || a.localeCompare(b));
  return ordered[0][0] + ordered[1][0] + (ordered[0][0] === ordered[1][0] ? '' : ordered[0][1] === ordered[1][1] ? 's' : 'o');
}

export function rangeEntriesSchema(entries, path = 'range/entries') {
  check(Array.isArray(entries) && entries.length > 0 && entries.length <= 1326, 'ANALYSIS_RANGE', 'Provide 1–1326 weighted hand entries.', path);
  const seen = new Set();
  for (const [i, entry] of entries.entries()) {
    const p = `${path}/${i}`;
    check(entry && typeof entry === 'object' && !Array.isArray(entry), 'ANALYSIS_RANGE', 'Expected a weighted hand entry.', p);
    for (const field of Object.keys(entry)) check(['hand', 'weight', 'actions', 'equity', 'ev'].includes(field), 'UNKNOWN_FIELD', `Unknown range field: ${field}`, p + '/' + field);
    const combos = combinations(entry.hand);
    check(combos.length > 0, 'ANALYSIS_RANGE', 'Use AA, AKs, AKo, AK or exact AsKd.', p + '/hand');
    check(entry.weight === undefined || Number.isFinite(entry.weight) && entry.weight >= 0 && entry.weight <= 1, 'ANALYSIS_RANGE_WEIGHT', 'A combination inclusion weight must be between zero and one.', p + '/weight');
    if (entry.equity !== undefined) check(Number.isFinite(entry.equity) && entry.equity >= 0 && entry.equity <= 1, 'ANALYSIS_RANGE_EQUITY', 'Equity is a fraction of the showdown pot between zero and one.', p + '/equity');
    if (entry.actions !== undefined) {
      check(entry.actions && typeof entry.actions === 'object' && !Array.isArray(entry.actions) && Object.keys(entry.actions).length > 0 && Object.keys(entry.actions).length <= 32, 'ANALYSIS_RANGE_ACTIONS', 'Provide action ID to conditional frequency entries.', p + '/actions');
      for (const [action, frequency] of Object.entries(entry.actions)) check(/^[a-zA-Z0-9_.:-]{1,80}$/.test(action) && Number.isFinite(frequency) && frequency >= 0 && frequency <= 1, 'ANALYSIS_RANGE_ACTIONS', 'Action frequencies must be finite probabilities with stable action IDs.', p + '/actions/' + action);
      check(Math.abs(sum(Object.values(entry.actions)) - 1) < 1e-8, 'ANALYSIS_RANGE_ACTIONS', 'Conditional action frequencies must sum to one for each combination.', p + '/actions');
    }
    if (entry.ev !== undefined) {
      check(entry.ev && typeof entry.ev === 'object' && !Array.isArray(entry.ev) && Object.keys(entry.ev).length > 0 && Object.keys(entry.ev).length <= 32, 'ANALYSIS_RANGE_EV', 'Provide action ID to chip EV entries.', p + '/ev');
      for (const [action, value] of Object.entries(entry.ev)) check(/^[a-zA-Z0-9_.:-]{1,80}$/.test(action) && Number.isFinite(value), 'ANALYSIS_RANGE_EV', 'Action EV must be finite and uses the scene chip unit.', p + '/ev/' + action);
    }
    for (const cards of combos) {
      const id = key(cards);
      check(!seen.has(id), 'ANALYSIS_RANGE_OVERLAP', 'Weighted entries must not overlap; supply each physical combination once.', p + '/hand');
      seen.add(id);
    }
  }
}

function aggregate(combos) {
  const weightedCount = sum(combos.map(combo => combo.weight));
  const positive = combos.filter(combo => combo.weight > 0), result = {weightedCount};
  if (positive.length && positive.every(combo => combo.actions)) {
    const actions = [...new Set(positive.flatMap(combo => Object.keys(combo.actions)))];
    result.actions = Object.fromEntries(actions.map(action => [action, sum(positive.map(combo => combo.weight * (combo.actions[action] ?? 0))) / weightedCount]));
  }
  if (positive.length && positive.every(combo => combo.equity !== undefined)) result.equity = sum(positive.map(combo => combo.weight * combo.equity)) / weightedCount;
  if (positive.length && positive.every(combo => combo.ev)) {
    const actions = [...new Set(positive.flatMap(combo => Object.keys(combo.ev)))].filter(action => positive.every(combo => Number.isFinite(combo.ev[action])));
    if (actions.length) result.ev = Object.fromEntries(actions.map(action => [action, sum(positive.map(combo => combo.weight * combo.ev[action])) / weightedCount]));
  }
  return result;
}

/** Public blockers only. A 169-cell matrix is a view of one explicitly assumed range. */
export function expandRange(entries, {blocked = [], board = [], unit = 'BB'} = {}) {
  rangeEntriesSchema(entries); validCards(blocked); validCards(board, {max: 5, path: 'board'});
  const unavailable = new Set([...blocked, ...board]), combos = []; let blockedCount = 0;
  for (const entry of entries) for (const cards of combinations(entry.hand)) {
    if (cards.some(card => unavailable.has(card))) { blockedCount++; continue; }
    const hand = handClass(cards), category = hand.length === 2 ? 'pair' : hand.endsWith('s') ? 'suited' : 'offsuit';
    const combo = {cards: [...cards], hand, category, weight: entry.weight ?? 1};
    if (entry.actions) combo.actions = {...entry.actions};
    if (entry.equity !== undefined) combo.equity = entry.equity;
    if (entry.ev) combo.ev = {...entry.ev};
    const rank = board.length === 5 ? poker.evaluate([...cards, ...board]) : board.length >= 3 && poker.evaluatePartial ? poker.evaluatePartial([...cards, ...board]) : null;
    if (rank !== null) combo.madeHand = categoryNames[Math.floor(rank / 15 ** 5)];
    combos.push(combo);
  }
  const summary = aggregate(combos), weightedCount = summary.weightedCount;
  for (const combo of combos) combo.probability = weightedCount > 0 ? combo.weight / weightedCount : 0;
  const matrix = [];
  for (let row = 0; row < ranks.length; row++) for (let column = 0; column < ranks.length; column++) {
    const hand = row === column ? ranks[row] + ranks[column] : row < column ? ranks[row] + ranks[column] + 's' : ranks[column] + ranks[row] + 'o';
    const candidates = combos.filter(combo => combo.hand === hand), available = combinations(hand).filter(cards => cards.every(card => !unavailable.has(card))).length;
    const value = aggregate(candidates);
    matrix.push({hand, row, column, category: row === column ? 'pair' : row < column ? 'suited' : 'offsuit', combinationCount: candidates.length, availableCombinations: available, weight: available > 0 ? value.weightedCount / available : 0, ...value, rangeShare: weightedCount > 0 ? value.weightedCount / weightedCount : 0});
  }
  return {coverage: 'weighted-assumption', matrix, combos, combinationCount: combos.length, blockedCount, ...summary, units: {weight: 'inclusionProbability', actions: 'conditionalActionFrequency', equity: 'showdownPotShare', rangeShare: 'rangeProbability', ev: unit}};
}

/** Filtering never silently re-normalizes the original range probabilities. */
export function filterRange(range, {hand, category, madeHand, minWeight = 0, action, minFrequency = 0} = {}) {
  check(Number.isFinite(minWeight) && minWeight >= 0 && minWeight <= 1 && Number.isFinite(minFrequency) && minFrequency >= 0 && minFrequency <= 1, 'ANALYSIS_RANGE_FILTER', 'Range filter thresholds are fractions between zero and one.', 'filter');
  const combos = range.combos.filter(combo => (!hand || combo.hand === hand) && (!category || combo.category === category) && (!madeHand || combo.madeHand === madeHand) && combo.weight >= minWeight && (!action || (combo.actions?.[action] ?? 0) >= minFrequency));
  return {combos, weightedCount: sum(combos.map(combo => combo.weight)), shareOfOriginalRange: sum(combos.map(combo => combo.probability)), normalization: 'originalRange'};
}
