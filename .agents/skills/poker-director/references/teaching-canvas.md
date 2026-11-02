# Decision analysis and teaching presentation

Use optional analysis material and presentation on the existing v2 project. The six methods, atomic batches and render command remain the entry points.

## Inspect a decision, then explain it

1. Seek the pending decision in player view. Keep the hero's action uncommitted throughout the explanation. Read the current pot, call amount, known cards and legal actions.
2. Add analysis with `analysis.put`. Its node is the state **after** the named beat, or after its zero-based `actionIndex`. Use a preceding action beat when the decision occurs before the next action. Range groups are illustrative candidate hands, not a normalized probability distribution.
3. Read the material against that decision, check strategy sources and dependent narration, then use `analysis.confirm`. Runtime stamps fingerprints; confirmation records the author's review, not independent proof that a solver claim is true.
4. Add presentation to action-free beats. The next table beat returns to the same live decision; a later action beat commits the chosen move. Verify the selected route and actual media.

```json
{"type":"analysis.put","sceneId":"river-example","value":{"id":"river-price","node":{"beatId":"opponent-bet"},"title":{"zh-CN":"价格与范围"},"conditions":{"zh-CN":"河牌、单底池、无抽水；跟注后不再下注。"},"calculation":"potOdds","range":{"seat":"oop","groups":[{"id":"value","label":{"zh-CN":"价值候选"},"hands":["77","KQ"]},{"id":"bluff","label":{"zh-CN":"诈唬候选"},"hands":["JTs","98s"]}]},"evidence":{"kind":"hypothesis","model":{"zh-CN":"未加权候选；没有精确权益或频率结论。"}}}}
{"type":"analysis.confirm","sceneId":"river-example","analysisId":"river-price"}
{"type":"presentation.set","sceneId":"river-example","beatId":"explain","value":{"surface":"analysis","analysisId":"river-price","show":["calculation","conditions"]}}
{"type":"presentation.set","sceneId":"river-example","beatId":"return","value":{"surface":"table","focus":["hero","pot"]}}
```

Submit commands inside an ordinary apply batch with a new request ID and current revision. Analysis never owns another editable pot, stack or board. `potOdds` applies only to a pending hero river call with two live players, one shared pot and no further betting; it is a threshold, not actual equity or action frequency.

Analysis supports localized `title`, `objective`, `assumptions`, `conditions`, `takeaway`; optional `range:{seat,groups:[{id,label,hands}]}` and `evidence:{kind,source,model,detail}`. Evidence kind is `hypothesis`, `derivation` or `solver`. Keep precise claims and matched inputs/results in project evidence; see [strategy evidence](strategy-evidence.md).

For a table-only passage whose narration depends on analysis, retain `analysisId` on its `surface:"table"` presentation. This keeps the decision and evidence checks without displaying an analysis canvas. Unreferenced draft material does not block an unrelated output; the system cannot infer dependencies from arbitrary prose.

Write a referenced local `evidence/...` file before confirmation. Use real directories and a regular file: symbolic links anywhere below the project root produce `EVIDENCE_PATH`, including links to another file in the same project. Replace the link with the intended file so portable exports remain independent of the original location. Runtime binds its bytes and rechecks them during media validation; `EVIDENCE_MISSING` or `EVIDENCE_CHANGED` requires restoring the original file or reviewing the new evidence and confirming again. The binding checks provenance and integrity, not the truth of a strategy claim.

## Compose and reveal

`beat.presentation` chooses `surface:"table"|"analysis"`, optional `analysisId`, localized `title`/`question`, semantic `focus` and visible `show` sections. Focus targets are `hero`, `board`, `pot`, `seat:<id>` and `card:<rank+suit>`. Card focus is validated against player knowledge in every observation view: board, hero cards and explicitly revealed holdings. Director inspection retains hidden cards for editing while `load`, `observe`, `seek` and the studio report the same output-readiness problems. Sections are `range`, `calculation`, `conditions`, `takeaway`, `evidence`; reveal `takeaway` deliberately after the question. Layouts adapt to landscape and portrait without authoring two pixel coordinate sets.

For timed reveals, generate or attach real audio first. Listen for each intended moment, then bind that language's explicit cues. Times are seconds from speech start (or beat start for an unvoiced beat). Each cue replaces only its specified properties and remains active until the next change; arbitrary seeking reconstructs the same state.

```json
{"type":"presentation.cues","sceneId":"river-example","beatId":"explain","value":{"locale":"zh-CN","cues":[{"at":0,"show":["conditions"]},{"at":4.2,"show":["calculation","conditions"]},{"at":12.6,"show":["range","conditions"]}]}}
```

These numbers illustrate the command shape; use measured speech in the actual project. Runtime binds cues to current audio. Replacing audio makes prior cues stale; recheck and resubmit that language. `cues:null` removes precise cues deliberately. `presentation.set` changes the base layout while retaining existing language cues. Setting its value to null removes the presentation entirely. The clean client suppresses teaching layers; exported output includes them.

`PRESENTATION_STALE`, invalid target or missing analysis errors identify the affected beat. Beat-level plan/readiness issues optionally include `target:{sceneId,entryId,beatId}` for exact navigation, including repeated sequence entries; use these IDs rather than parsing `path`. Global issues may have no target. The studio's readiness follows the player output even while director observation exposes cards for editing. Inspect pre-reveal and post-reveal encoded frames, not just the preview. Precise captions need their own reviewed timing so subtitles do not disclose the answer first.

## Change conditions safely

Choice comparison starts at the same pending node. A different opponent bet starts **before** that action. Use `scene.variant` for one recorded action replacement; the engine replays the changed scene and validates all routes.

```json
{"type":"scene.variant","sourceSceneId":"river-example","value":{"id":"river-larger-bet","title":{"zh-CN":"改为满池下注"},"change":{"beatId":"opponent-bet","actionIndex":0,"action":{"seat":"oop","type":"bet","to":9.1}}}}
```

The new scene retains provenance and marks its conclusions for review. Inspect recomputed amounts, repair any later action that became illegal, update assumptions/evidence/narration, confirm affected analysis, then use `{"type":"scene.review","sceneId":"river-larger-bet"}`. A changed range uses `analysis.put` and confirmation without changing the game trace. Review is not a bypass for mismatched evidence.

## Keep a course coherent

Optional `lesson.course` stores `id`, localized `title`, `prerequisites`, `objectives` and `episodes:[{id,sceneId,objective,conditions?,check?}]`. Use `course.set` with the complete value, or null to remove it. Keep these records about planned/taught content; actual mastery needs learner responses.

Use `output.sequence` for playback ordering. A sequence that differs from the course's episode order produces a non-blocking `COURSE_ORDER_REVIEW` advisory in observe/plan: recheck prerequisites, repetition and early answers, then update the brief when intentional. Each episode should add a different judgment task: a method, a boundary/counterexample, then transfer to another hand. Record changed assumptions, show one real pause before answers, and inspect disclosure across repeated scenes. Full reproducible inputs and a bounded equilibrium derivation live under `examples/teaching/`; their creative choices are examples, not mandatory templates.
