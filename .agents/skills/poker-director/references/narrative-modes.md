# Select and execute a narrative mode

A mode is a repeatable creative brief: information perspective, narrative structure, reasoning, pacing and observable review questions. It is separate from cash/tournament, seat count, streets, skill level, language and aspect. The catalog abstracts published teaching mechanisms; it does not promise a creator's identity, voice, audience retention or solver correctness.

## Discover, select, customize

Discover before creating a project; do not initialize an empty scene or create a throwaway hand just to read the catalog:

```sh
node bin/river.mjs patterns
node bin/river.mjs patterns --id think-aloud
```

After init, the same catalog is available through the existing session methods; no extra service is needed:

```json
{"method":"export","params":{"kind":"patterns"}}
{"method":"export","params":{"kind":"patterns","patternId":"think-aloud"}}
```

The first returns a compact index; the second returns one complete localized profile. Select by learning outcome and information perspective. IDs currently include think-aloud, hand-story, decision-quiz, fundamentals, range-lab, exploit-clinic, table-commentary, dialogue, line-comparison and theme-series. Fetch the catalog instead of treating this list as a whitelist.

Save the chosen profile before writing narration:

```json
{"type":"direction.set","value":{"patternId":"think-aloud"}}
{"type":"direction.set","sceneId":"river-example","value":{"patternId":"range-lab","overrides":{"guidance":{"zh-CN":["先给出可检验假设，再用匹配证据检查；保留被推翻的猜测。","每个结论说明当前假设和适用范围。"]}}}}
```

Submit these inside apply with the observed revision and a new requestId. The first sets project defaults. The second overrides one scene. `value:null` removes that scope and restores inheritance/freeform. `observe` reports the effective brief at the cursor. Project exports contain the full snapshot plus catalog provenance; future catalog updates never rewrite it.

For a combined mode, read both profiles, choose one dominant perspective/structure, then merge the useful mechanisms into overrides. Objects merge recursively; arrays replace in full. Preserve all relevant guidance when replacing arrays. Give the combined profile a descriptive name. For a novel mode, supply `value:{profile:<complete profile>}` based on an exported profile's shape; its ID and structure are open strings. Localized guidance/checks accept arbitrary content. There is no mandatory catchphrase, joke count, hand type or sentence template.

## Produce

1. Make a concise production brief in project evidence: audience/region, learning goal, main mode, any deliberate chapter-level changes, table/stack model, knowledge boundary, expected duration and what would count as a successful explanation. Choose hands that actually demonstrate it. Style-reference sources and strategy-evidence sources are distinct.
2. Write against the selected profile's guidance and checks. Maintain the same information contract through the passage. For first-person play, reason only from available information. For cards-up review/commentary, disclose the broader information early. Even with all cards visible, a commentator's reconstruction of a player's thoughts remains an interpretation.
3. Match the presentation mechanism: beat.timing for speech over advancing play; action-free beats for thought/pause/reveal; branches from matched decision states for alternative lines; output.sequence for chapters/multiple hands. Use optional [teaching presentation](teaching-canvas.md) for analysis and semantic focus, and explain any perspective or time jump. The clean client remains a normal table. Each sequence entry resets to its scene start, so author any cross-hand stack/seat continuity explicitly.
4. Apply the profile's suggested delivery with voice.set if useful; keep deliberate speaker settings otherwise. For dialogue, assign real distinct references and stable beat.speaker roles as described in voice.md. A single synthetic voice reading two labels is not a verified two-voice production. Natural emotion follows the situation; exact vectors are adjustable.
5. Generate, then check the **actual speech** against action/reveal timing, including every factual action mention. Confirm narrated schedules through timing.set for that language; replacement speech makes the binding stale. Use precise captions through captions.set when paragraph paging would reveal later actions/answers early. Update offsets after measuring or listening rather than assuming punctuation fixes timing. Re-export a plan and review a continuous passage, not just isolated sentences.

## Review consistency and delivery

### Editorial pass

Before multiplying a format into several examples, complete one representative passage and inspect its exported storyboard. Name the selected brief's observable mechanism: what changes in the viewer's understanding, and which action, reveal, question, exchange or comparison causes it? Removing the mode title should leave that mechanism recognizable. If the mechanism is missing, revise the brief/structure before polishing isolated words or adding more hands. Custom and combined modes use the same test without adopting a fixed sequence or catchphrase.

Read the whole script as spoken Chinese for the intended viewer. Begin with a concrete uncertainty or consequence, advance it through meaningful information, and leave a usable recognition condition or decision. A transition that repeats the previous paragraph adds no explanation. Support important claims with the current cards, continuing hands, price or actual comparison; a generic slogan and a correct calculator result cannot carry the lesson by themselves. Let opening, sentence length, humor, suspense and ending fit the chosen style rather than a universal hook formula.

Check counterfactual cards and candidate combinations against the actual known-card set and the relevant range, even when the poker actions themselves validate. A hypothetical holding can collide with the board or change the made hand; a blocker may remove bluffs without removing value. Read numerical conclusions from the current compiled analysis before putting them into words. Zero EV can mean indifference, not a uniquely correct fold. For a claimed adjustment, first verify that its model can change the decision; changing only narration cannot create that boundary.

Compare each completed-action phrase with the action's actual time in the storyboard, across the whole decision episode. After-action commentary cannot speak while that action is still pending. When explaining an earlier price after the pot has been awarded, use an explicit replay or retain a visible prior decision/price comparison; the current zero pot does not explain it. Match each visual reference to the sections visible at that instant: mentioning a combo view while `range` is hidden is an unfinished explanation. Camera movement alone does not expose a reasoning mechanism.

Review quiz hints across previous chapters and the full question wording, not just its pause. In a two-choice question, “do the opposite of last time” can already give the answer. Dialogue roles use stable, audience-readable `beat.speaker` names; captions show these names. Put the role in that metadata, not a repeated `Name:` prefix inside narration, which would duplicate the label and make synthesis speak the name. Speaker names and dialogue structure can be reviewed without audio, but do not claim distinct voice performance until real references/takes exist.

Check every public response for `ok:true` before depending on its result. A rejected apply keeps the old revision; correct it and inspect again. After the final edit, export the latest storyboard/plan and validate that exact revision. Record the observed IDs and results, not an intended next revision or an unverified card. Keep failed reviews and append separate run records; never overwrite the first round while timing a repair. Distinguish time spent reading/planning/reviewing from a subsecond command batch. Write authored JSON/logs explicitly as UTF-8 (for example Node fs UTF-8, or an explicit Python encoding); a host's default locale is not a content format.

### Silent editorial pass

When voice is explicitly deferred, set the requested language, `captions:true` and the intended aspect/profile, and give each narrated beat a realistic `rehearsalDuration` for reading. Keep thinking pauses as separate action-free time; a long hold over text is not an unanswered question.

Use the ordinary `timing.set`, `captions.set` and `presentation.cues` commands to plan speech-relative action/caption/reveal times. With no audio reference for that language and a positive estimate, runtime records an explicit null draft binding; never fill it yourself. One continuous commentary passage may advance several real actions while its precise caption cues report them after they occur. Review the estimated clock and actual screenshots before rendering. Once a real take is attached, these bindings become stale and require explicit review against that take.

Inspect the complete script and selected brief, then validate. Only expected `AUDIO_MISSING` issues may remain. Render/produce with `--rehearsal`, inspect the actual encoded output and caption timeline, and compare them with the promised style mechanism. The output is a silent editorial review, not proof of completed voice performance. Use [complete production](full-production.md#produce-and-revise-deliveries) for the exact cache and verification workflow.

Use the selected profile's localized checks as review questions, with concrete beat/time evidence and remaining issues. A rendered file or a terminology regex cannot certify expert judgment, natural delivery or a compelling story.

An independent reviewer must receive the original requested outcome and user expression constraints as well as the saved brief, selected profile, complete script and current storyboard. Ask it to read the target-language narration reference too. Passing only an author's summary can omit constraints such as no production framing, or turn a newly invented opponent assumption into an asserted observation. Keep those assumptions legible as natural conditions, and distinguish audience-facing words from project/evidence labels.

Apply those expression constraints to visible analysis titles, conditions, group labels and annotations too, not only narration/SRT. Fetch the current public project/plan when the compact storyboard omits that copy. Keep necessary decision assumptions in natural conditional language; provenance and production disclaimers belong in evidence rather than a repeated on-screen footer.

For a new/custom mode, inspect two contrasting hands or decision spots: a normal example and a boundary/counterexample. The same reasoning discipline, perspective and rhythm should survive the change in cards; wording and outcomes may differ. Each work must also satisfy the user's requested teaching outcome. Fix the reusable brief or capability when the same failure appears across examples; do not narrow hand choice just to make a template pass.

For quizzes, audit disclosure across the **whole sequence**, including prior examples and their subtitles. A new decision question earns its thinking pause before the answer is first given. If reusing a solved spot, frame it as recall or change a condition that actually changes the decision. A local pause cannot undo an earlier answer. For live decision reasoning, test the comparison against concrete continuing/folding hand types and one next-street card, size or read that would cause a reassessment; “keep bluffs” or “see the turn” alone does not demonstrate it. These are reasoning checks, not mandatory phrases or a requirement to invent opponent history.

For a condition comparison, state both cases' assumptions and show what the change does to the reasoning. If isolating a board change, keep the declared range/weights fixed in both calculations; describe range adjustment separately when it is part of the comparison. For an independent short, retain the premises needed to understand its answer, even when the compiler can reconstruct the earlier poker state. A legal excerpt can still omit the price or hypothesis its explanation refers to. Label exercises that repeat an already explained answer as recall. A transfer exercise must introduce a relevant condition not already solved in the preceding programme, recompute its answer under that condition, and explain why it changes or preserves the decision; rewording the original question is not transfer.

Audit decision episodes across beats too: if the speaker still weighs folding/calling the current bet, its action remains pending until that thought ends. A later beat can plan the next street after committing, but an earlier alternative needs an explicit retrospective/counterfactual transition. Starting a thought before the action is insufficient when the remainder still describes that uncommitted choice. Check the actual state at each such passage, not only the beat that contains the button click.

For the first delivery of a new/combined mode, or a programme with quizzes or knowledge/counterfactual shifts, obtain an independent **editorial preflight before a silent editorial delivery as well as before full voice generation** when delegation is available. Deferring voice does not defer this check. Give a fresh subagent the requested outcome, saved brief, complete sequence/script and exported storyboard; keep product access read-only and let it derive findings. Missing draft audio is expected at this stage. Include earlier chapters to expose cross-chapter disclosures; resolve wording, reasoning and information-flow findings before encoding a batch or spending a full voice batch. Have the author repair the concrete findings, then recheck affected passages without reopening unrelated accepted material. After rendering, have that reviewer check the actual affected intervals as well: a correct plan does not prove correct speech/action timing. Retain failed reviews. This adds a review role, not another runtime or a fixed writing template. Without delegation, perform a separate full-programme review and label it self-review; do not claim independent verification.

Compare the brief's visual plan with the proposed presentation before voice generation and with actual encoded decision frames afterward. Check whether viewers can follow the important numbers, hand candidates and condition changes on screen. When they remain only in narration/subtitles, review the pedagogical reason for that choice; legality, decoding and waveform checks do not establish that the lesson explains visually.

Review these shared invariants as well: rule legality and chip history; no premature reveal in narration/captions; local language in all authored labels and speech; continuous narration across timed actions; legal choices and true silence in quizzes; matched branch conditions; independent speakers in dialogue; and clean client readability in the requested aspect. Keep objective engineering evidence separate from editorial/listening judgments and from actual audience preference data. Report the observed coverage and limits.

The source catalog is `src/direction/patterns.json`; the API and director use the same file. Research and evidence grades are in `docs/reviews/2026-11-02/style-research-zh.md` and `style-research-global.md`. Style references guide presentation; GTO/EV/frequency claims still follow strategy-evidence.md.
