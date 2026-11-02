import {check, errorJSON} from './errors.mjs';
import {clone} from './util.mjs';

const surfaces = ['table', 'analysis'];
const sections = ['range', 'calculation', 'conditions', 'takeaway', 'evidence'];
const object = (value, path) => check(value && typeof value === 'object' && !Array.isArray(value), 'SCHEMA', 'Expected an object.', path);
function keys(value, allowed, path) {
  object(value, path);
  for (const key of Object.keys(value)) check(allowed.includes(key), 'UNKNOWN_FIELD', `Unknown field: ${key}`, `${path}/${key}`);
}
function textMap(value, path) {
  object(value, path);
  for (const [locale, text] of Object.entries(value)) check(typeof text === 'string', 'SCHEMA', 'Expected localized text.', `${path}/${locale}`);
}
function selection(value, choices, path) {
  check(Array.isArray(value) && value.every(x => choices.includes(x)) && new Set(value).size === value.length, 'PRESENTATION', 'Use distinct supported sections.', path, {allowed: choices});
}
function focusSchema(value, path) {
  check(Array.isArray(value) && new Set(value).size === value.length && value.every(x => typeof x === 'string' && (['hero', 'board', 'pot'].includes(x) || x.startsWith('seat:') && x.slice(5).trim() || /^card:[2-9TJQKA][shdc]$/.test(x))), 'PRESENTATION_TARGET', 'Use semantic hero, board, pot, seat:id or card:Ah targets.', path);
}
function visualSchema(value, path) {
  if (value.surface !== undefined) check(surfaces.includes(value.surface), 'PRESENTATION', 'Use table or analysis.', `${path}/surface`);
  if (value.focus !== undefined) focusSchema(value.focus, `${path}/focus`);
  if (value.show !== undefined) selection(value.show, sections, `${path}/show`);
}
export function presentationCueSchema(cues, path = 'presentation/cues') {
  check(Array.isArray(cues), 'PRESENTATION_TIMING', 'Provide a cue array.', path);
  for (const [i, cue] of cues.entries()) {
    keys(cue, ['at', 'surface', 'focus', 'show'], `${path}/${i}`);
    check(Number.isFinite(cue.at) && cue.at >= 0 && cue.at <= 86400 && (i === 0 || cue.at > cues[i - 1].at), 'PRESENTATION_TIMING', 'Cue times must strictly increase from zero.', `${path}/${i}/at`);
    check(['surface', 'focus', 'show'].some(k => cue[k] !== undefined), 'PRESENTATION_TIMING', 'A cue must change the presentation.', `${path}/${i}`);
    visualSchema(cue, `${path}/${i}`);
  }
}
export function presentationSchema(value, path = 'presentation') {
  keys(value, ['surface', 'analysisId', 'title', 'question', 'focus', 'show', 'cues'], path);
  check(surfaces.includes(value.surface), 'PRESENTATION', 'Use table or analysis.', `${path}/surface`);
  visualSchema(value, path);
  if (value.analysisId !== undefined) check(typeof value.analysisId === 'string' && value.analysisId.trim(), 'PRESENTATION', 'Use an analysis ID.', `${path}/analysisId`);
  for (const key of ['title', 'question']) if (value[key] !== undefined) textMap(value[key], `${path}/${key}`);
  if (value.cues !== undefined) {
    object(value.cues, `${path}/cues`);
    for (const [locale, binding] of Object.entries(value.cues)) {
      const p = `${path}/cues/${locale}`;
      keys(binding, ['audioHash', 'cues'], p);
      check(binding.audioHash === null || /^[a-f0-9]{64}$/.test(binding.audioHash), 'PRESENTATION_TIMING', 'Cue binding needs an audio fingerprint or an explicit draft.', `${p}/audioHash`);
      presentationCueSchema(binding.cues, `${p}/cues`);
    }
  }
}

// Resolve once in the compiler. Every emitted frame is a complete, seekable view;
// neither the player nor FFmpeg needs to replay presentation events.
export function compilePresentations(plan, project, {compileAnalysis, stateInBB, route}) {
  if (!project.lesson.scenes.some(scene => [...scene.beats, ...(scene.branches ?? []).flatMap(b => b.beats)].some(beat => beat.presentation))) return plan;
  const issues = plan.issues, resolved = new Map(), analyses = new Map(), timing = new Map(), output = [];
  const at = seconds => Math.ceil(seconds * plan.fps - 1e-9);
  for (const frame of plan.frames) {
    const scene = project.lesson.scenes.find(s => s.id === frame.sceneId);
    const beat = [...scene.beats, ...(scene.branches ?? []).flatMap(b => b.beats)].find(b => b.id === frame.beatId);
    const value = beat.presentation;
    if (!value) { output.push(frame); continue; }
    const location = {sceneId: frame.sceneId, entryId: frame.entryId, beatId: frame.beatId};
    const issue = (code, path, message) => issues.push({code, path, message, retryable: false, target: location});
    const key = JSON.stringify([frame.entryId, scene.id, beat.id]);
    const path = `scenes/${scene.id}/beats/${beat.id}/presentation`;
    if (!resolved.has(key)) {
      const localized = (map, name) => {
        if (map === undefined) return undefined;
        if (!map[plan.locale]?.trim()) { issue('TRANSLATION_MISSING', `${path}/${name}/${plan.locale}`, 'Missing presentation translation.'); return '…'; }
        return map[plan.locale];
      };
      const base = {surface: value.surface, focus: value.focus ?? [], show: value.show ?? ['range', 'calculation', 'conditions']};
      for (const name of ['title', 'question']) if (value[name] !== undefined) base[name] = localized(value[name], name);
      let nodeIndex = null, nodeBeatIndex = null;
      if (value.analysisId) {
        const material = scene.analysis?.find(a => a.id === value.analysisId);
        if (!material) issue('ANALYSIS_UNKNOWN', `${path}/analysisId`, 'Choose an analysis record in this scene.');
        else {
          try {
            const analysisKey = JSON.stringify([scene.id, material.id]);
            if (!analyses.has(analysisKey)) analyses.set(analysisKey, compileAnalysis(scene, material, plan.locale));
            const result = analyses.get(analysisKey);
            const {issues: analysisIssues, ...analysis} = result;
            base.analysis = {...analysis, decision: stateInBB(analysis.decision)};
            for (const problem of analysisIssues ?? []) issues.push({...problem, path: `${path}/analysisId`, detail: {analysisId: material.id, sourcePath: problem.path}, target: location});
            let count = 0;
            for (const [index, b] of route(scene, frame.branchId).entries()) {
              if (b.id === material.node.beatId) { nodeBeatIndex = index; nodeIndex = count + (material.node.actionIndex === undefined ? (b.actions ?? []).length : material.node.actionIndex + 1); break; }
              count += (b.actions ?? []).length;
            }
            if (nodeIndex === null) { issue('ANALYSIS_ROUTE', `${path}/analysisId`, 'The decision is not on this route.'); delete base.analysis; }
          } catch (error) { issues.push({...errorJSON(error), path: `${path}/analysis/${material.id}`, target: location}); }
        }
      }
      if (base.surface === 'analysis' && !value.analysisId) issue('ANALYSIS_UNKNOWN', path, 'An analysis canvas needs a decision reference.');
      resolved.set(key, {base, nodeIndex, nodeBeatIndex});
      const frames = plan.frames.filter(f => f.entryId === frame.entryId && f.sceneId === frame.sceneId && f.beatId === beat.id);
      const first = frames[0].startFrame, end = frames.at(-1).endFrame;
      const speech = frames.find(f => f.narration);
      const origin = speech ? at(speech.narrationStart ?? speech.start) : first;
      const binding = value.cues?.[plan.locale];
      if (value.cues && Object.keys(value.cues).length && !binding) issue('PRESENTATION_STALE', `${path}/cues/${plan.locale}`, 'Review cue timing for this language; another language cannot supply it.');
      if (binding && beat.narration?.[plan.locale] && (!beat.audio?.[plan.locale] || binding.audioHash !== beat.audio[plan.locale].assetId)) issue('PRESENTATION_STALE', `${path}/cues/${plan.locale}`, 'Review the presentation cues against the current audio through presentation.cues.');
      const cues = (binding?.cues ?? []).map(cue => ({...cue, tick: origin + at(cue.at)}));
      if (cues.some(cue => cue.tick >= end) || new Set(cues.map(c => c.tick)).size !== cues.length) issue('PRESENTATION_TIMING', `${path}/cues/${plan.locale}`, 'Every cue must cover a distinct visible frame inside this passage.');
      timing.set(key, {cues});
    }
    const {base, nodeIndex, nodeBeatIndex} = resolved.get(key);
    // A previous decision can be revisited. A future decision cannot be exposed.
    if (nodeIndex !== null && (nodeIndex > (frame.nodeIndex ?? -1) || nodeBeatIndex > route(scene, frame.branchId).findIndex(b => b.id === beat.id))) {
      issue('ANALYSIS_FUTURE', path, 'Analysis cannot reveal a decision that has not happened on this route.');
      output.push({...frame, presentation: {...base, analysis: undefined}});
      continue;
    }
    const {cues} = timing.get(key);
    const boundaries = [...new Set([frame.startFrame, ...cues.map(c => c.tick).filter(t => t > frame.startFrame && t < frame.endFrame), frame.endFrame])].sort((a, b) => a - b);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startFrame = boundaries[i], endFrame = boundaries[i + 1];
      const presentation = clone(base);
      for (const cue of cues) if (cue.tick <= startFrame) for (const name of ['surface', 'focus', 'show']) if (cue[name] !== undefined) presentation[name] = clone(cue[name]);
      const context = presentation.surface === 'analysis' ? presentation.analysis?.decision ?? frame.state : frame.state;
      // Director observation may expose every holding; focus still targets player output.
      const visibleSeats = context.seats.filter(seat => seat.id === context.hero || context.revealed.includes(seat.id));
      const visibleCards = new Set([...context.board, ...visibleSeats.flatMap(seat => seat.hole).filter(Boolean)]);
      for (const target of presentation.focus) {
        if (target.startsWith('seat:') && !context.seats.some(s => s.id === target.slice(5))) issue('PRESENTATION_TARGET', path, 'Focus references a missing seat.');
        if (target.startsWith('card:') && !visibleCards.has(target.slice(5))) issue('PRESENTATION_TARGET', path, 'Focus must reference a currently visible card.');
      }
      if (presentation.surface === 'analysis' && !presentation.analysis) issue('ANALYSIS_UNKNOWN', path, 'An analysis canvas needs a resolved decision.');
      output.push({...frame, id: i === 0 ? frame.id : `${frame.id}::p${startFrame}`, event: i === 0 ? frame.event : null, startFrame, endFrame, start: startFrame / plan.fps, end: endFrame / plan.fps, duration: (endFrame - startFrame) / plan.fps, presentation});
    }
  }
  plan.frames = output;
  plan.issues = [...new Map(issues.map(x => [JSON.stringify(x), x])).values()];
  return plan;
}
