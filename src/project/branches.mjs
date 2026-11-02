import {keys} from './schema.mjs';
import {remapAnalysis} from '../analysis/index.mjs';
import {check} from '../errors.mjs';
import {clone} from '../util.mjs';

// Keep graph edits atomic with the branch write; callers never calculate review hashes.
export function putBranch(scene, value, copyFrom, path) {
  keys(value, ['id', 'from', 'label', 'beats'], path + '/value');
  const branch = clone(value);
  let copies = [];
  if (copyFrom !== undefined) {
    keys(copyFrom, ['branchId', 'beatId'], path + '/copyFrom');
    const source = scene.branches?.find(item => item.id === copyFrom.branchId);
    check(source, 'BRANCH_UNKNOWN', 'Choose an existing source branch.', path + '/copyFrom/branchId');
    check(!scene.branches.some(item => item.id === branch.id), 'ID_DUPLICATE', 'Copy into a new branch ID.', path + '/value/id');
    check(branch.from === source.from, 'BRANCH_ORIGIN', 'A copied branch keeps its main-line origin.', path + '/value/from');
    const end = source.beats.findIndex(beat => beat.id === copyFrom.beatId);
    check(end >= 0, 'BEAT_UNKNOWN', 'Choose a beat within the source branch.', path + '/copyFrom/beatId');
    check(Array.isArray(branch.beats), 'SCHEMA', 'Provide the new continuation beats.', path + '/value/beats');
    const prefix = clone(source.beats.slice(0, end + 1));
    const beatIds = new Map(prefix.map(beat => [beat.id, `${branch.id}-${beat.id}`]));
    const references = new Set(prefix.map(beat => beat.presentation?.analysisId));
    copies = (scene.analysis ?? []).filter(item => beatIds.has(item.node.beatId) && references.has(item.id)).map(item => ({
      source: item, id: `${branch.id}-${item.id}`, node: {...item.node, beatId: beatIds.get(item.node.beatId)}
    }));
    const analysisIds = new Map(copies.map(item => [item.source.id, item.id]));
    for (const beat of prefix) {
      beat.id = beatIds.get(beat.id);
      if (analysisIds.has(beat.presentation?.analysisId)) beat.presentation.analysisId = analysisIds.get(beat.presentation.analysisId);
    }
    branch.beats = [...prefix, ...branch.beats];
  }
  scene.branches ??= [];
  const index = scene.branches.findIndex(item => item.id === branch.id);
  if (index < 0) scene.branches.push(branch); else scene.branches[index] = branch;
  for (const {source, id, node} of copies) scene.analysis.push(remapAnalysis(scene, source, {id, node}));
}
