# Project and scene format

Canonical directory: project.json + assets/ + evidence/. Runtime creates `format:"river.project",version:2,projectId,revision,lesson:{scenes},output,assets,receipts`. Author one **scene** for init; edit through apply. All public amounts are BB with at most two decimal places. Internal rule arithmetic uses integer hundredths. Exported RenderPlan v2, observe and seek all expose BB, with state.unit="BB". RenderPlan v1 from development builds used internal amounts; re-export from the project instead of replaying old plans.

Minimal complete river scene (needs audio on decision to render):

```json
{
  "id":"river-example","title":{"en-US":"River value"},
  "appearance":{"tableName":"Orion 06","felt":"#1b5850"},
  "start":{
    "street":"river","board":["Ac","Kd","7h","2s","3c"],
    "button":"ip","hero":"ip","actor":"oop",
    "seats":[
      {"id":"oop","name":"North","stack":90,"contributed":10,"hole":["Kh","Ks"]},
      {"id":"ip","name":"River","stack":90,"contributed":10,"hole":["Ah","Ad"]}
    ]
  },
  "beats":[
    {"id":"check","label":{"en-US":"Check"},"actions":[{"seat":"oop","type":"check"}],"hold":1},
    {"id":"decision","label":{"en-US":"Decision"},"narration":{"en-US":"Consider which weaker hands can call."}},
    {"id":"bet","label":{"en-US":"Bet"},"actions":[{"seat":"ip","type":"bet","to":7}],"hold":1},
    {"id":"call","label":{"en-US":"Call"},"actions":[{"seat":"oop","type":"call"}],"hold":1},
    {"id":"show","label":{"en-US":"Showdown"},"actions":[{"type":"showdown"}],"hold":2}
  ]
}
```

Text maps may contain zh-CN/en-US/ja-JP. All selected-language fields must be nonempty; unrelated translations may remain drafts. Proper names/ranks/BB stay unchanged. Another language needs a complete locales/<locale>.json plus translated content/audio.

## Starting state

- Seats are clockwise, 2–9 unique IDs. button/hero/actor reference IDs. Display rotation around hero preserves actual order. Optional avatar is text/emoji.
- stack is **remaining**. contributed is all money already invested this hand, INCLUDING streetBet. streetBet is only this street. Both contribution fields default0. Pot derives from contributions. folded defaults false; zero stack means all-in.
- Cards: rank23456789TJQKA + suitcdhs, e.g. As/Td. Board and assigned hands are unique. hole is two cards or []; showdown needs complete hands for eligible seats.
- street: preflop/flop/turn/river, board size0/3/4/5. A deal supplies3/1/1 new cards after betting legally closes. All-ins retain eligibility and do not act.
- bigBlind defaults1. Post blinds explicitly in BOTH contributed and streetBet, deduct from remaining stack. Heads-up button is small blind, first preflop; big blind is first postflop. For3+ seats, two clockwise after button post blinds and preflop actor follows big blind.
- Midstreet snapshots additionally supply lastFullRaise (default big blind) and actedAt:{seatId:highestBetOnItsLastAction}, in BB. These determine short-all-in reopening. Use known history. actor does not authorize skipping an owed bet.
- Closed round: roundClosed:true,actor:null. Every nonfolded seat with chips must match maximum streetBet; all-ins may be lower. Contradictory closure is rejected. Uncalled excess is returned before a new street/showdown.

## Beats/routes

Every beat has stable id and localized label. Beat IDs are unique across ALL main/branch beats in the scene. Double colon (::) is reserved for compiled frame IDs. hold defaults1.2s; actionHold defaults0.7s, both positive. Each action expands to a visible segment. By default narration follows all actions, at least measured audio+0.35s. An action-free beat explains before acting.

An explanation beat does not create a new poker decision or reset a player clock. The client uses a static active-seat indicator and no simulated countdown. Keep one complete thought or meaningful action boundary per narrated beat; sentence-per-beat splitting is not required for captions.

With captions enabled, long narration is paged over that audio's measured duration, preferring sentence/clause boundaries and assigning time proportional to text length. A sentence continuing on a later page is normal; one sampled frame cannot establish lost text. Check all pages across the narrated interval, their fit, and the full SRT against the narration. Timing is an estimate, not word alignment; SRT entries contain whole narrated beats. Shorter beats are useful at natural thought/pause boundaries; paragraphs and longer explanations remain supported.

When a future action, quiz answer or reveal must wait for its spoken moment, use **precise captions** after generating/attaching audio. Automatic paging can display later words in a paragraph early. Submit the whole narration split into ordered, non-overlapping cues through apply:

```json
{"type":"captions.set","sceneId":"river-example","beatId":"decision","value":{"locale":"en-US","cues":[{"start":0,"end":1.5,"text":"Consider which weaker hands"},{"start":1.5,"end":3,"text":" can call."}]}}
```

Times are relative to **speech start**, including when beat.timing.narration is nonzero. Use the actual clip's duration/timing, not these illustrative numbers. Concatenated cue text must preserve the narration (whitespace may differ), every cue must occupy at least one output frame and fit the audio. Long cue text still pages within that cue. Empty intervals stay blank. Burned captions and SRT share the same cue list. The director's timing dialog provides the same optional cue editor.

Runtime stores `beat.captionCues[locale]={audioHash,cues}` and binds it to the current asset automatically; do not hand-fill the fingerprint. Replacing the audio, including a new same-text voice take, makes prior precise timing stale. Recheck timing and resubmit captions.set to explicitly bind to the new clip. Narration edits retain a precise-caption draft and block rendering until cues are rebuilt; they do not silently revert to early paragraph paging. `cues:null` deliberately restores automatic paging. `CAPTION_STALE` and `CAPTION_TIMING` name the affected locale. Action offsets also need editorial review after any new voice take; their legality alone cannot certify spoken synchronization.

```json
{"seat":"ip","type":"check"}
{"seat":"ip","type":"fold"}
{"seat":"ip","type":"call"}
{"seat":"ip","type":"bet","to":3.3}
{"seat":"ip","type":"raise","to":12}
{"seat":"ip","type":"allin"}
{"type":"deal","cards":["Ts","8h","3c"]}
{"type":"deal","cards":["2d"]}
{"type":"showdown"}
```

Bet/raise to is total current-street commitment. legalActions gives min/max. Call/check/fold/allin have no amount field. Showdown needs river and closed betting; uncontested pots settle automatically on last opponent folding.

branches:[{id,from,label,beats}] is one level. from names a main beat; prefix INCLUDES it, branch replaces continuation. Do not duplicate shared-prefix beats. Shared edits validate affected routes. Selected valid branches do not execute unused main tails; validate --all reports other routes separately.

To continue an existing branch without changing it, give `branch.put` an optional `copyFrom:{branchId,beatId}` and a new `value.id`. Keep `value.from` equal to the source branch's main-line origin; `value.beats` contains only the new continuation. Runtime copies the source branch through the named beat, remaps copied beat IDs and their referenced analysis, and keeps main-line analysis shared. Copied IDs use `<new-branch-id>-<old-id>`; collisions reject the entire batch. Existing valid reviews survive a pure reference rename only when the decision fingerprint is unchanged. Stale/unreviewed analysis stays pending, and evidence hashes remain bound to the original bytes.

```json
{"type":"branch.put","sceneId":"river-example","copyFrom":{"branchId":"check-back","beatId":"cb"},"value":{"id":"check-back-copy","from":"decision","label":{"en-US":"Review this line"},"beats":[]}}
```

Beat view:{reveal:["oop"]} exposes those seats until a later cue; view:{reveal:[]} clears explicit reveals (normal showdown remains revealed). Presentation changes only. For first-person narration use player observation at that moment, director observation for authoring.

## Editing/audio

```json
{"type":"output.set","value":{"locale":"en-US","aspect":"portrait","profile":"final","sceneId":"river-example","branchId":null,"captions":true}}
{"type":"branch.put","sceneId":"river-example","value":{"id":"check-back","from":"decision","label":{"en-US":"Check back"},"beats":[{"id":"cb","label":{"en-US":"Check"},"actions":[{"seat":"ip","type":"check"}]}]}}
{"type":"narration.set","sceneId":"river-example","beatId":"decision","locale":"en-US","text":"A revised explanation."}
{"type":"audio.attach","sceneId":"river-example","beatId":"decision","value":{"locale":"en-US","source":{"path":"/absolute/voice.wav"}}}
```

scene.put has `{type:"scene.put",value:<whole scene>}`. It replaces/creates a scene, validating dependent actions and branches in one batch. Include all interdependent changes. Scene IDs are unique project-wide; branch IDs unique within scene.

Audio source accepts exactly one local path or data URL (`{data:"data:audio/wav;base64,..."}`). WAV/MP3/M4A/AAC/OGG/FLAC/AIFF, max256MiB local, browser request max32MiB. Runtime probes duration, copies content-addressed file and creates `{assetId,locale,textHash}`. Never manually populate audio references or temporary absolute paths in the manifest.

Narration edits invalidate only that language's audio. Remove narration via scene.put deleting beat narration/audio. Repair missing resources by reattaching original source. Structure/IDs/submitted physics must be valid; missing audio/translation can remain drafts. Error code/path/message/retryable locate repair; rejected batches leave manifest/revision unchanged.

Integrated IndexTTS generation adds a derived voiceHash to its audio reference and per-language defaults in optional project.voice. Changing those defaults invalidates generated audio for that language; manually imported audio is unaffected. Use voice.set and the voice method as described in [voice generation](voice.md), rather than editing these hashes or reference asset IDs. Source audio is staged and decoded before atomic publication; reimporting verified original bytes can repair a missing/corrupt content-addressed asset.

Optional beat.delivery maps locales to delivery overrides: speed, emotion, emotionStrength and pronunciations. See the voice reference for their ranges. Overrides inherit the language defaults; optional referenceAssetId selects an imported speaker; pronunciation keys merge. These are presentation choices, not poker actions, and can vary between natural thought boundaries.

## Timed commentary and programmes

Optional beat.timing places both actions and speech on one clock, in seconds from the beat start:

```json
{"id":"running-commentary","label":{"zh-CN":"翻前行动"},"narration":{"zh-CN":"前面三家弃了，我在按钮位开到两点五。小盲不打，大盲跟进。"},"actions":[{"seat":"utg","type":"fold"},{"seat":"hj","type":"fold"},{"seat":"co","type":"fold"},{"seat":"btn","type":"raise","to":2.5}],"timing":{"actions":[0.8,1.5,2.2,4],"narration":0},"hold":5}
```

Times must be finite, nonnegative and strictly increasing, one per action. They quantize upward to the selected frame rate; same-frame collisions are rejected. Narration defaults to offset0. Actual duration extends to fit all actions and measured speech; hold is a minimum. Each state change remains visible. Use exported plan frame IDs (timed IDs contain `::t`); audio/captions retain one narration start across segments and do not restart. Check timing against generated speech; a pre-generation guess does not prove synchronization. Move action times or split at a natural thought boundary when needed. Silent action-free beats create actual thinking pauses. Never rely on an audio offset to protect a secret already exposed in the beat's view.reveal; reveal in a later beat.

For timed narration, confirm the schedule **after** measuring the actual language take. This binds the selected language's timing to its audio:

```json
{"type":"timing.set","sceneId":"river-example","beatId":"running-commentary","value":{"locale":"zh-CN","timing":{"actions":[0.8,1.5,2.2,4],"narration":0}}}
```

`TIMING_STALE` blocks a narrated timed beat until this review/binding is done, and returns after replacement audio. Check opponent/action facts as well as your own choices: narration/subtitles should not announce an opponent's completed action before it happens. Different languages may use different action/speech offsets; output locale selects its confirmed override. Runtime stores overrides and audioHashes under beat.timing; do not hand-fill fingerprints. Default beat.timing remains useful for drafting and unvoiced actions. `timing:null` deliberately chooses the normal action-then-speech order for that language. The director timing dialog saves both language timing and optional precise captions atomically. A changed audio file cannot silently retain an old confirmed schedule.

`output.sequence` optionally selects ordered entries. Each entry replays a scene from its authored start; it does **not** calculate bankroll, move the button or carry stacks automatically between hands. Author continuity explicitly when the story needs it. Scene/branch selection otherwise keeps its existing meaning.

```json
{"type":"output.set","value":{"sequence":[{"id":"actual","sceneId":"river-example","branchId":null},{"id":"alternative","sceneId":"river-example","branchId":"check-back"},{"id":"another-hand","sceneId":"other-scene"}]}}
```

Entry IDs are unique and cannot contain `::`. Repetition is allowed; compiled IDs gain an entry prefix. Every frame includes sceneId, entryId and branchId. Seek with frameId, or beatId plus entryId; ambiguous repeated beats are rejected. Use narration to explain time jumps and counterfactuals while the client stays clean. `output.set` choosing sceneId or branchId exits sequence playback unless that same command supplies sequence. `sequence:null` also returns to one scene. Aspect, language and profile changes preserve the programme. Invocation overrides `--scene` or `--branch` inspect/render one route; default validation/render/voice process the programme. `validate --all` still audits each scene/branch/language separately.

Optional beat.speaker labels a stable role for authoring and provenance; it is not shown on the clean table. Set its actual independent reference using scoped voice.set. Project direction is a frozen creative brief; scene.direction overrides it. Select, customize and review it through [narrative modes](narrative-modes.md); it never changes legal actions or invents narration.

Optional scene analysis, beat presentation, condition variants and course records use the same manifest and compiler. Read [teaching canvas](teaching-canvas.md) for their reference, review and cue-binding contracts.
