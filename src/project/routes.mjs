import {check} from '../errors.mjs';

// A branch keeps its main-line origin, then replaces the remaining suffix.
// Compilation and read-only analysis use exactly the same route definition.
export function route(scene, branchId = null) {
  if (!branchId) return scene.beats;
  const branch = scene.branches?.find(candidate => candidate.id === branchId);
  check(branch, 'BRANCH_UNKNOWN', 'Unknown branch.', 'output/branchId');
  const index = scene.beats.findIndex(beat => beat.id === branch.from);
  check(index >= 0, 'BRANCH_ORIGIN', 'Unknown branch origin.', `branches/${branchId}/from`);
  return [...scene.beats.slice(0, index + 1), ...branch.beats];
}
