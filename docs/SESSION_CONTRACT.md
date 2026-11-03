# Session, condition variants and practice contract

All chip values supplied by authors use the project's fixed denomination with two decimal places. The engine uses integer hundredths. A blind level changes the posted big blind; it does not silently rescale existing stacks. Thus a stack of `100` with a new `bigBlind: 2` is 50 current big blinds. `start.unit` is `BB` or `chips`; `BB` requires `bigBlind: 1`. When omitted, a non-unit big blind defaults to `chips`, including hand-authored snapshots; existing unit-blind snapshots retain their legacy BB interpretation. Tournament levels use `chips`. Internal state carries `displayUnit`; the compiler exports that as `state.unit`.

## Engine and hand setup

`loadState(start)` additionally accepts `rake: {rate, cap, noFlopNoDrop, minPot?}`. Rate is a fraction in [0, 1]; cap/minPot are chip amounts. The percentage is rounded down to the smallest unit, capped once per hand, after unmatched bets are returned. No flop/no drop suppresses preflop rake. Rake is removed from the main pot first, then side pots. Internal `rakeTaken` is included in conservation; gross contributions, net awards and rake remain distinguishable. `rakeAmount(state)` predicts rake on the current effective pool; settled state exposes the actual `rakeTaken`.

`createHand({seats, button, hero, bigBlind, smallBlind?, ante?, bigBlindAnte?, rake?, unit?, blindSeats?})` returns an ordinary preflop start state. Each seat has `{id,name?,avatar?,stack,hole?}`. Use either ante per player or big-blind ante, not both. The big blind is paid before its ante when short. Antes are pooled `start.deadPot`, with per-player `start.antePaid` accounting, never live street bets or unmatched refundable bets. A short BB uses `start.forcedBet` for the full bring-in when multiple funded players remain. Heads-up the button posts the small blind and acts first. `blindSeats:{smallBlindSeat:string|null,bigBlindSeat:string}` records the actual blind roles; an absent SB is possible with a dead button. Zero-stack slots remain folded placeholders, preserving table positions; at least two funded players are required. Card conflicts and inconsistent stacks are rejected. Non-half small blinds are retained as `start.smallBlind`, in the same denomination as `bigBlind`; omission retains the legacy half-blind default. Display and subsequent hands use this declared value, including after the blind has acted.

Setup, seat and blind-role fields are strict: spelling mistakes such as `bigblind` or `hloe` raise `UNKNOWN_FIELD`, including through `scene.create`, without saving a partial scene. This constructor accepts a fresh-hand setup, not an already-posted start snapshot.

`evaluatePartial(cards)` is the existing hand evaluator for 5–7 unique cards. The original `evaluate(cards)` retains its seven-card contract.

`displayState(observe(state))` is the shared conversion for public snapshots. Every chip amount, including ante and rake ledgers, uses the fixed author denomination and the declared `unit`; legal-action amounts and authored events already use that denomination and are not divided again. The compiler's existing `stateInBB` export is a compatibility alias. Engine calculations and source fingerprints continue to use integer hundredths.

## Continuous session

Optional `lesson.session`:

```json
{"id":"session-1","title":{"zh-CN":"连续实战"},"hands":[{"sceneId":"hand-1","branchId":null}],"observations":[]}
```

`continueSession(project, {sourceSceneId, sourceBranchId?, id, title, hero?, holes?, adjustments?, level?, observations?})` returns `{scene, session}`. Source hand must be settled. `holes` is a map of next-hand seat IDs to two cards. Adjustments are `{seatId, amount, reason}` deposits/withdrawals, or `{seatId, leave:true, reason}`; adding a new participant uses `{join:{id,name?,avatar?,stack,hole?}, reason}`. Amounts are signed denomination values; a withdrawal cannot exceed a stack. A replacement hero must be specified after that player leaves or is eliminated. New scenes contain a setup beat and explicit `scene.continuity={sourceSceneId,sourceBranchId,sourceHash,adjustments,level,holes,hero}` provenance. Names and avatars persist. Unrevealed old hole cards do not become next-hand knowledge.

`level` is `{bigBlind,smallBlind?,ante?,bigBlindAnte?,rake?,unit?,buttonRule?}`. When omitted, an existing `source.continuity.level` is retained in full, including its ante and button rule. If the source has no continuity level, defaults are derived from its starting big blind, declared small blind, rake and unit; there is no implicit ante in that fallback. An explicit new level replaces the previous level, so specify every rule intended to continue. Blind levels never rescale chip balances.

`level.buttonRule` is `moving` or `dead`; `chips` uses dead-button progression by default. It advances the BB to the next funded physical seat, preserves empty seat placeholders, and adjusts the button when entering heads-up so the prior BB does not pay consecutive BBs. Replacing a vacant player's ID at a full table preserves that physical position and the prior blind history. The button can therefore belong to a folded zero-stack placeholder. Moving-button sessions remove departed and zero-stack seats, then move the button to the next surviving original player clockwise. This implementation models an authored table; it does not claim to schedule multi-table balancing or tournament registration.

Observation input: `{id, sceneId, branchId?, beatId, actionIndex, seatId, kind:"observed"|"inference", text:{locale:text}}`. It references that player's completed action or a showdown at which that player's cards were actually revealed. `reviewSession(project,value)` explicitly binds notes to public source fingerprints; Agent never supplies them by hand. `resolveSessionObservations(project)` derives the public action, street, board and source fingerprint; its `publicState` uses the same display amounts as the compiled player view. Inference is explicitly labeled; notes never reveal unexposed holdings. `sessionSchema(value)` validates structure. `sessionIssues(project)` replays the source and recomputes next-hand setup, flags changed provenance or unverified observations. `session.set` calls `reviewSession`; its optional command-level `reviewIds` confirms only those observation IDs and preserves other bindings (omission explicitly confirms all submitted notes); `session.next` uses `continueSession` atomically. Notes use the same complete public decision fingerprint as analysis, including denomination, blind levels and rake. Earlier incomplete bindings become stale and require a reviewed `session.set`; hidden opponent cards remain excluded.

Observation actions must be part of the route recorded in `session.hands`. An explicit reference to another branch is accepted only for an action in the shared prefix; review normalizes the note to the route actually played. Branch-only hypothetical actions raise `SESSION_OBSERVATION_ROUTE` before saving. Invalid imported notes remain visible to inspection as `current:false` with a structured `issue`, while valid notes are still resolved. The compiler excludes invalid or stale notes from player history and checks upstream session issues when selecting a later hand alone.

## Single-condition variants

`createVariant(sourceScene, {id,title,change})` accepts the existing `{beatId,actionIndex,action}` replacement unchanged, or one of:

```json
{"kind":"board","cardIndex":0,"card":"As"}
{"kind":"board","beatId":"turn","actionIndex":0,"cardIndex":0,"card":"As"}
{"kind":"hole","seatId":"hero","cards":["As","Ks"]}
{"kind":"stack","seatId":"hero","stack":75}
```

For a board change, no beat means a card in the starting board; otherwise the indexed action must be a deal. Hole and remaining stack changes happen at scene start. Every main/branch route is replayed from the changed state using the same engine; conflicts and illegal continuations reject the whole operation. `variant.change` records kind, location, before and after. `variant.sourceHashKind:"poker"` declares a source fingerprint of starting state plus action/reveal history; legacy variants remain accepted. Copied review fingerprints are retained as provenance: affected analysis reports `ANALYSIS_STALE`, while an unaffected earlier decision can retain its review. The entire variant still requires explicit scene review. `variantSchema(value)` replaces the old action-only schema; `variantIssues(project)` reports changed source histories.

## Answerable practice

Optional `lesson.practice` has `{id,title,questions,attempts?}`. Each question:

```json
{"id":"q1","sceneId":"hand-1","node":{"beatId":"decision"},"analysisId":"price","prompt":{"zh-CN":"你的选择？"},"choices":[{"id":"call","text":{"zh-CN":"跟注"}},{"id":"fold","text":{"zh-CN":"弃牌"}}],"correctChoiceIds":["call"],"explanation":{"zh-CN":"在给定范围下……"},"objective":{"zh-CN":"区分价格与权益"}}
```

`node.actionIndex` optionally addresses a completed action; `analysisId` and `objective` are optional. Single or multiple correct choices are supported. `answerPractice(project, {questionId,choiceIds,learnerId?,answeredAt?})` returns one `{id,questionId,questionHash,choiceIds,correct,learnerId,answeredAt}` record. The question version hashes the public decision, referenced analysis and wording/answer. `practice.set` explicitly confirms the submitted questions (optional command-level `reviewIds` limits confirmation to those question IDs; other bindings remain unchanged) by storing runtime-produced `question.review.questionHash`; authors never fill this field manually. A direct/imported question without a binding is readable as a draft but reports `PRACTICE_UNREVIEWED`; changed conditions or content report `PRACTICE_STALE`. Review the new answer and explanation and submit `practice.set` again. Confirming analysis alone does not confirm a stale question. Root appends it atomically through `practice.answer`. Editing conditions or the answer leaves historical attempts visible but stale; it never credits them as answers to the new version. `practiceSchema`, `practiceIssues`, `practiceSummary` and `practiceHTML(project,locale)` provide validation, results and a portable HTML exercise. HTML shows the public decision and choices, records an answer in localStorage, then displays feedback. Offline source necessarily contains answer data; this is practice, not anti-cheating assessment. No learner mastery is inferred.

`reviewPractice(project,value)` binds reviewed question content. `verifyPractice(project,directory,{locale?,questionId?})` checks current question/analysis bindings and actual local evidence bytes before CLI, studio or delivery exports and before recording answers. Selected questions also inherit their session ancestors and variant-source validity checks. The director passes `reviewIds` for a single-item edit, so saving one question or adding one observation cannot silently confirm other stale content. Pure HTML construction also rejects stale or unreviewed questions; its callers supply the filesystem check. Historical results remain inspectable when their question is no longer valid.

`practiceHTML` returns UTF-8 HTML for the existing export path to write. It contains no external requests. Author text is inserted through textContent; embedded JSON escapes `<` and Unicode line separators.

## Source and model boundaries

The [official 2026 TDA rules](https://www.pokertda.com/view-poker-tda-rules/) were checked on 2026-11-02 for dead-button progression and the heads-up blind adjustment (rules 34/36). This project does not reproduce the whole TDA rulebook or claim to operate a live tournament. The selected BBA setup pays the live blind first. [PokerStars' official rake explanation](https://www.pokerstars.com/poker/room/rake/) demonstrates capped percentage and no-flop-no-drop policies, but uses half-even rounding; this project's declared teaching model rounds down. Select and disclose the correct actual room model before claiming a room-specific strategy result.
