# Select and execute a narrative mode

A mode is a repeatable creative brief: information perspective, narrative structure, reasoning, pacing and observable review questions. It is separate from cash/tournament, seat count, streets, skill level, language and aspect. The catalog abstracts published teaching mechanisms; it does not promise a creator's identity, voice, audience retention or solver correctness.

## Discover, select, customize

After init, use the existing session methods; no extra service is needed:

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
3. Match the presentation mechanism: beat.timing for speech over advancing play; action-free beats for thought/pause/reveal; branches from matched decision states for alternative lines; output.sequence for chapters/multiple hands. Add any perspective or time-jump explanation to narration; the exported client remains a normal table. Each sequence entry resets to its scene start, so author any cross-hand stack/seat continuity explicitly.
4. Apply the profile's suggested delivery with voice.set if useful; keep deliberate speaker settings otherwise. For dialogue, assign real distinct references and stable beat.speaker roles as described in voice.md. A single synthetic voice reading two labels is not a verified two-voice production. Natural emotion follows the situation; exact vectors are adjustable.
5. Generate, then check the **actual speech** against action/reveal timing, including every factual action mention. Confirm narrated schedules through timing.set for that language; replacement speech makes the binding stale. Use precise captions through captions.set when paragraph paging would reveal later actions/answers early. Update offsets after measuring or listening rather than assuming punctuation fixes timing. Re-export a plan and review a continuous passage, not just isolated sentences.

## Review consistency and delivery

Use the selected profile's localized checks as review questions, with concrete beat/time evidence and remaining issues. A rendered file or a terminology regex cannot certify expert judgment, natural delivery or a compelling story.

For a new/custom mode, inspect two contrasting hands or decision spots: a normal example and a boundary/counterexample. The same reasoning discipline, perspective and rhythm should survive the change in cards; wording and outcomes may differ. Each work must also satisfy the user's requested teaching outcome. Fix the reusable brief or capability when the same failure appears across examples; do not narrow hand choice just to make a template pass.

For quizzes, audit disclosure across the **whole sequence**, including prior examples and their subtitles. A new decision question earns its thinking pause before the answer is first given. If reusing a solved spot, frame it as recall or change a condition that actually changes the decision. A local pause cannot undo an earlier answer. For live decision reasoning, test the comparison against concrete continuing/folding hand types and one next-street card, size or read that would cause a reassessment; “keep bluffs” or “see the turn” alone does not demonstrate it. These are reasoning checks, not mandatory phrases or a requirement to invent opponent history.

Audit decision episodes across beats too: if the speaker still weighs folding/calling the current bet, its action remains pending until that thought ends. A later beat can plan the next street after committing, but an earlier alternative needs an explicit retrospective/counterfactual transition. Starting a thought before the action is insufficient when the remainder still describes that uncommitted choice. Check the actual state at each such passage, not only the beat that contains the button click.

For the first delivery of a new/combined mode, or a programme with quizzes or knowledge/counterfactual shifts, obtain an independent **editorial preflight before full voice generation** when delegation is available. Give a fresh subagent the requested outcome, saved brief, complete sequence/script and compiled states; keep product access read-only and let it derive findings. Missing draft audio is expected at this stage. Include earlier chapters to expose cross-chapter disclosures; resolve wording, reasoning and information-flow findings before spending a full voice batch. After rendering, have that reviewer check the actual affected intervals as well: a correct plan does not prove correct speech/action timing. Retain failed reviews. This adds a review role, not another runtime or a fixed writing template. Without delegation, perform a separate full-programme review and label it self-review; do not claim independent verification.

Review these shared invariants as well: rule legality and chip history; no premature reveal in narration/captions; local language in all authored labels and speech; continuous narration across timed actions; legal choices and true silence in quizzes; matched branch conditions; independent speakers in dialogue; and clean client readability in the requested aspect. Keep objective engineering evidence separate from editorial/listening judgments and from actual audience preference data. Report the observed coverage and limits.

The source catalog is `src/direction/patterns.json`; the API and director use the same file. Research and evidence grades are in `docs/reviews/2026-11-02/style-research-zh.md` and `style-research-global.md`. Style references guide presentation; GTO/EV/frequency claims still follow strategy-evidence.md.
