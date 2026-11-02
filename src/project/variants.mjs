import {hash} from '../util.mjs';

// Presentation, voice assets and review stamps do not change the authored poker
// argument. Facts, hypotheses and every dependent script do.
export function variantReviewHash(scene) {
  const passage = beat => ({id: beat.id, actions: beat.actions, narration: beat.narration, view: beat.view});
  return hash({
    start: scene.start,
    beats: scene.beats.map(passage),
    branches: (scene.branches ?? []).map(branch => ({id: branch.id, from: branch.from, beats: branch.beats.map(passage)})),
    analysis: (scene.analysis ?? []).map(({review, ...material}) => material),
    change: scene.variant?.change
  });
}
