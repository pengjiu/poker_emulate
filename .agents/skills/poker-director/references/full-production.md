# Complete course production

## Contents

- [Plan the visual explanation](#plan-the-visual-explanation)
- [Choose the needed capability](#choose-the-needed-capability)
- [Draw, focus and compare](#draw-focus-and-compare)
- [Study ranges and external strategy](#study-ranges-and-external-strategy)
- [Create hands and continue a session](#create-hands-and-continue-a-session)
- [Keep courses and practice coherent](#keep-courses-and-practice-coherent)
- [Mix and audition sound](#mix-and-audition-sound)
- [Produce and revise deliveries](#produce-and-revise-deliveries)

## Plan the visual explanation

Narrative mode chooses perspective and reasoning structure; it does not imply a table-only video. In the production brief, identify the key ideas, what viewers will see at those moments, and when the live decision resumes. Choose visuals for comprehension rather than demonstrating every available feature.

Board changes, blockers and action sizes can use discreet table focus, circles or arrows. Prices and denominators can use a calculation card; candidate hands can use groups or a matrix; changes in size, range or action can use a matched comparison. Read the relevant contracts below before composing these. Keep hypothetical ranges visibly distinct from observed information.

For quantitative or comparative teaching, support reasoning that is hard to follow through speech and subtitles alone. A table-only passage remains appropriate when the table makes the point clear; record that choice when it covers the whole lesson. First-person immersion and visual explanation can coexist through short overlays or analysis cuts returning to the pending decision. There is no fixed tool count or mandatory layout.

## Choose the needed capability

All commands below belong in `apply` with a fresh request ID and the observed revision. Keep dependencies in one atomic batch. Runtime computes game state, fingerprints and asset metadata. Work through **inspect, revise, produce** using the existing six methods.

The exact schemas, algorithms, units and supported limits live in these repository contracts; read the one needed by the task:

- Drawing, cameras, comparison, range views and animation: [presentation contract](../../../../docs/PRESENTATION_CONTRACT.md).
- Weighted ranges, equity, outs, EV, external strategy and ICM: [analysis contract](../../../../docs/ANALYSIS_CONTRACT.md).
- Automatic hand setup, rake/antes, variants, session continuity and practice: [session contract](../../../../docs/SESSION_CONTRACT.md).
- Mixing, rehearsal timing, chapter reuse and delivery files: [production contract](../../../../docs/PRODUCTION_CONTRACT.md).

Compose table, detail, study, comparison and question views from the same two presentation surfaces. Programme style and teaching sequence remain creative choices. Give a question real action-free time; reveal its answer deliberately.

## Draw, focus and compare

`presentation.set` replaces base presentation while retaining confirmed language cues. It accepts a complete observed presentation with unchanged cues; changed cues go through `presentation.cues`. Preserve fields not involved in a revision.

```json
{"type":"presentation.set","sceneId":"hand","beatId":"explain","value":{"surface":"analysis","analysisId":"decision","show":["range","calculation","metrics","conditions"],"rangeView":{"mode":"matrix","metric":"rangeShare"},"annotations":[{"id":"blocker","type":"arrow","from":"card:Ah","to":"hand:AKs","color":"#f7c46c","width":3},{"id":"price","type":"circle","target":"calculation","color":"#72dbc0"}],"camera":null}}
{"type":"presentation.set","sceneId":"hand","beatId":"detail","value":{"surface":"table","focus":["hero","bet:villain"],"camera":{"target":"hero","scale":1.5,"duration":0.35},"motion":true}}
```

Targets must exist in the displayed surface and be visible at that moment. The arrow example needs a visible matrix and an unblocked AKs cell; the circle needs the calculation section. Choose actual targets from the current plan. `camera:null`, `annotations:[]` and `rangeView.mode:"groups"` restore simple views. A semantic target follows landscape/portrait layout; normalized paths are available for free drawing. Embedded PNG/JPEG/WebP or safe static SVG travels with the project. Decode errors, external SVG references and missing targets block production.

For a comparison, first save start/end analysis for each route. Set `comparison:{mode:"choices",origin:{sceneId,analysisId},routes:[{id,label,sceneId,startAnalysisId,endAnalysisId},...]}` and include `comparison` in `show`. Choice routes share the same public decision and action history. Use `mode:"conditions"` for changed inputs; the output shows their differences. Example endpoints are possibilities, not probabilities or EV estimates.

Voice-specific cues may replace annotations, camera, rangeView, comparison or motion in addition to existing surface/focus/show. Rebind against the actual audio after any take or language change. Camera transitions and action animations use the compiled clock, including random seeks.

## Study ranges and external strategy

Add weighted `range.entries` rather than assigning percentages to illustrative groups:

```json
{"seat":"villain","entries":[{"hand":"AKs","weight":0.5},{"hand":"QcQd","weight":1}]}
```

Weights apply to each physical combo. Blockers use public knowledge. Rows may carry attributed action frequencies, equity and action EV; preserve the correct units and source. Frequency distributions sum to one, weighted entries cannot overlap, and filtering keeps the original range denominator. Matrix and combo views support weight, range share, equity, action frequency and EV.

Request only calculations that fit the node with `metrics:["spr","equity","outs","callEV"]`. River equity is exact. Earlier streets use bounded exact enumeration or a deterministic seeded sample with method/uncertainty metadata. Outs distinguish clean and dirty next cards; a flop out does not promise river victory. Terminal river call EV uses the net contestable pool, actual call cost and engine rake. For multiway decisions, do not reuse heads-up equity/EV claims.

Export public solver inputs:

```json
{"method":"export","params":{"kind":"solver","sceneId":"hand","analysisId":"decision"}}
```

Feed that request to an external adapter. Import its normalized JSON with `{"type":"analysis.importSolver","sceneId":"hand","analysisId":"decision","source":{"path":"/absolute/result.json"}}` or `source:{data:payload}`. Then inspect and explicitly `analysis.confirm`. Import copies immutable evidence and binds the node; it validates identity and integrity, not solver optimality. Changed ranges/models need matching external data; confirmation cannot approve away a mismatch. Omitted external input ranges remain declared unknown.

ICM reads table chips from the node, receives explicit off-table stacks and a payout ladder, and distinguishes prize equity from chip EV. Use its equal-skill and field-size limits. Any supplied outcomes/probabilities are assumptions and must conserve the same players' chips. Cash pot rake and tournament ICM are separate models.

## Create hands and continue a session

Use `scene.create` inside an existing project to derive blinds, antes and action order:

```json
{"type":"scene.create","value":{"id":"fresh","title":{"zh-CN":"新的一手"},"setup":{"seats":[{"id":"hero","name":"North","stack":100,"hole":["As","Ks"]},{"id":"villain","name":"Harbor","stack":100}],"button":"hero","hero":"hero","bigBlind":1}}}
```

Add a cash `rake:{rate,cap,noFlopNoDrop,minPot?}` model or tournament `ante` / `bigBlindAnte` as needed. Ante and BBA are alternatives. Preserve fixed chip denomination across blind levels; `unit:"chips"` displays tournament chips, while `unit:"BB"` requires a unit big blind. The engine records dead money, short blind obligations and rake separately.

For an ordinary live-client scene, choose plausible per-seat starting stacks, names and seating, then reason from the actual effective stack. Equal stacks remain useful for matched studies; they are not a requirement for a six-handed table. `scene.create` accepts stacks before posting blinds; a raw `scene.put` start holds remaining stacks and existing contributions separately. Never add decorative balance jitter or patch rendered amounts. Card visibility, folded seats, blind/button positions, action sizes, movement and payouts must follow the same engine state. Keep the active-seat indicator stable during thought; no invented countdown restarts with each narration segment.

To continue real play, finish the source hand, then use `session.next`:

```json
{"type":"session.next","value":{"sourceSceneId":"finished-hand","id":"next-hand","title":{"zh-CN":"下一手"},"holes":{"hero":["Kh","Jh"]},"level":{"bigBlind":1}}}
```

The new scene inherits settled stacks, names and physical seating, advances the button under the declared rule, and posts blinds. Use explicit deposits/withdrawals/join/leave adjustments with reasons. Tournament dead-button and heads-up transitions use actual blind positions. Changed upstream results mark downstream continuity stale; recreate the affected continuation rather than hand-editing carried stacks.

`session.set` saves the full hand order and notes, stamping notes against cited public actions. Each note names scene/branch/beat/actionIndex/seat and is either `observed` or `inference`. The note's wording remains the author's responsibility. Export `kind:"session"` to inspect resolved public observations. Future hands cannot supply earlier first-person reasoning. `SESSION_OBSERVATION_STALE` also follows changes to denomination, blind levels or rake: revise the interpretation before resubmitting `session.set`. Pass command-level `reviewIds:["note-id"]` when confirming only one observation; other notes retain their existing bindings.

Use `scene.variant` for one changed action, board card, hole-card input or remaining stack. See the session contract for exact shapes. Runtime replays every continuation and rejects card conflicts or illegal actions atomically. A different bet changes the action before the facing decision. Reconfirm changed analysis and use `scene.review` only after reviewing affected narration. If a changed input makes subsequent actions illegal, construct the revised scene/continuation coherently in an atomic edit; do not patch a displayed number.

## Keep courses and practice coherent

`course.set` stores goals, prerequisites, style, terminology, concepts and episode objectives/conditions/checks. An episode can reference `sceneIds` for several hands, with `sceneId` as its entry. `requires`, `introduces` and `recaps` reference declared concepts. Order/repetition messages are editorial advisories, not claims about the learner.

`practice.set` stores question nodes, localized prompts, choices, correct choice IDs and explanations. A question may reference its analysis. `practice.answer` records the chosen IDs and version; `export` with `kind:"practice-results"` reports current and stale attempts. Saving with `practice.set` confirms the submitted answer and explanation against the current facts. `PRACTICE_UNREVIEWED` or `PRACTICE_STALE` requires reviewing those facts and any linked analysis, revising the answer/explanation, then resubmitting `practice.set`; analysis confirmation alone is insufficient. For a single-question revision, pass command-level `reviewIds:["question-id"]` to retain other questions’ review states; omitting it confirms the entire submitted set. Runtime creates the binding. Updating a question or its facts retains historical attempts without crediting them to the new version. Practice exports and answers also check the actual evidence files.

`export` with `kind:"practice",destination:"/absolute/exercise.html",locale:"zh-CN"` creates an independent exercise. It shows the public decision, accepts an answer, then reveals the explanation and stores local results. Offline practice contains answer data in its source; it is not an anti-cheating examination. Actual human learning gain needs actual human responses.

## Mix and audition sound

`sound.set` without a beat stores project mixing settings. For example:

```json
{"type":"sound.set","value":{"effects":{"enabled":true,"volume":0.25},"voiceGainDB":0,"ducking":{"enabled":true,"reductionDB":12,"attack":0.08,"release":0.25},"loudness":{"integrated":-16,"truePeak":-1.5,"range":11}}}
```

`sound.bed` imports a measured audio source and stores optional volume/start/loop; `source:null` removes it. Beat-level `sound.set` accepts `quiet:true` and/or explicit `{kind,at,volume?}` effects. Effect kinds are deal/bet/collect/payout; at is local beat time and must fit the actual passage. Quiet passages suppress non-voice sound. Automatic effects follow actual state events, not guessed script timing.

The director auditions the same mixed stream as export. Check the complete source/encoded tail, intelligibility, quiet intervals and loudness. Preserve the single narrator when requested. Reuse unchanged clips; edit emphasis, pronunciation, pauses and delivery through existing voice controls. Normalization cannot repair bad acting or incorrect terminology.

## Produce and revise deliveries

Store named outputs with `delivery.set`, whose value is `[{id,title,output}]`; each output uses the normal locale/aspect/profile/sequence fields. Sequence entries may use `fromBeatId`/`toBeatId` to produce a short. The compiler replays the earlier legal prefix so excerpts begin at the correct decision, while unrelated later drafts are excluded.

Run `node bin/river.mjs produce --project DIR --out DELIVERY_DIR`, optionally `--only id1,id2`. A frozen project produces named MP4/SRT, transcripts, chapters, receipts, portable source/evidence, a viewing index and practice HTML. Chapters reuse verified encoded visuals when unchanged; render/source/evidence identity and cached bytes are checked. After a local edit, the unmodified chapters can be reused without pretending old timing is current.

If the user explicitly postpones voice generation, `--rehearsal` produces a labeled visual review and accepts only `AUDIO_MISSING`; all other blocking issues remain. Supply per-language `beat.rehearsalDuration` as a reading-time estimate, retaining separate real question pauses. Actual audio supersedes the estimate. A rehearsal is not a finished voiced lesson; final audio cues require review after the take exists. Existing genuine audio may be reused only for unchanged text/settings.

Use `scripts/build-full-course.mjs --help` for an executable example of three progressive episodes, range studies, comparison, continuous hands, tournament/rake boundaries and practice. The example is reusable input, not a restriction on creative structure.

After rendering, run `node scripts/verify-media.mjs RENDER_DIRECTORY PROJECT_DIRECTORY` against the returned fingerprint directory and its actual source project. It decodes the MP4, compares action/key frames, and checks complete source narration plus interior windows; a failure exits nonzero and a pass writes `decoded-validation.json`. This verifies encoding fidelity, not whether the TTS actually spoke every source clause. Review the actual speech content separately as described in the voice reference.

A produced bundle has named files described by `delivery.json`, not a presumed render subdirectory. The original render directories remain under the `produce --out BASE` directory at `BASE/.render-cache/<outputs[i].fingerprint>`; this is a hidden directory, so default file listings may skip it. Verify the bundle's listed hashes, match each named MP4 to that render's `video.mp4`, and run `verify-media` there against the bundle's frozen `project/`. Check actual existence before considering a missing render; do not rerender merely because a search skipped hidden caches. Complete this check before cleaning local render caches, since the portable bundle carries receipts but not those original reference keyframe images.

Before synthesis, review script, visible reasoning, card knowledge, amounts and action order together. Freeze that content and the implementation, pilot one difficult passage, then generate the remaining missing/stale clips in a batch. Retain unchanged audio and use targeted edits rather than rebuilding an old draft. Review the final real media in one bounded pass; repair concrete omissions, wrong facts or unreadable layout rather than cycling over harmless ASR homophones. Recheck only affected dependencies after a repair.

Record task-local start/end timestamps around authoring, synthesis, rendering and verification, including cache hits and repair causes. Read actual worker/render durations from their receipts. Saved-file times bound elapsed intervals; they do not identify continuous work or separate computation from review/waiting. Report that distinction when auditing production speed.

Burned captions and SRT use the same short semantic pages. Check the actual target-language output in each requested aspect: readable size, at most two lines, no leading punctuation or broken numerical terms, no clipped cards/actions, and no isolated tail flashing by. Use `captions.set` when exact speech-aligned cue timing matters; automatic text-weight pagination estimates reading time and is not forced alignment.

Completion requires: selected output dependencies valid; actual encoded landscape/portrait frames readable; arrows/cameras attached correctly; route and session facts consistent; questions answered before feedback; complete delivery reopens; independent skill-only creation works. Keep engineering results, content/sound review and real learner outcomes distinct.
