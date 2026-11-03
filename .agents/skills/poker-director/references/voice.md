# Integrated IndexTTS voice

The default engine is official IndexTTS2.5, pinned by source/model revisions. It runs as one isolated Python worker per batch; there is no separate TTS server or queue. It supports installed Chinese, English and Japanese outputs. A generated voice is synthetic even when its delivery sounds natural.

## Setup and status

Run `python3 scripts/setup-index-tts.py` from the repository root. It requires uv, installs the official locked Python environment under `.river/index-tts`, and downloads about7.1GB of necessary weights plus a default official Mandarin reference. The installer chooses a download service using a small network probe; `--source huggingface|modelscope` selects one explicitly. File hashes are checked against the pinned upstream revisions regardless of transport. Models are not bundled in source archives. On Apple Silicon the official MPS path uses full precision; CUDA/CPU follow upstream device selection. Check a short generation on the actual host before promising production readiness.

`RIVER_INDEXTTS_HOME` selects another installed engine directory; `RIVER_INDEXTTS_PYTHON` optionally selects its Python executable. Machine paths stay outside project manifests. Voice references are copied into project assets, so exported courses retain their speaker reference and generated audio.

Setup prepares the official text-normalizer caches in a separate process before loading speech weights. On an existing CPU installation, run `python3 scripts/setup-index-tts.py --warmup-only` once if first generation is killed while compiling the normalizer. This avoids the combined startup memory peak; it does not guarantee that every host has enough memory for synthesis. CPU production can be much slower than playback, so measure one real passage and preserve completed episodes in separate voice batches.

On macOS the bridge defaults to PyTorch's Metal matmul kernel and the device's recommended MPS memory ceiling, releasing unused allocator cache between clips. Explicit PyTorch MPS environment settings remain respected. This bounds allocator pressure; it does not guarantee any script fits every machine. Unexpected worker exits retain the exit code/signal and a bounded diagnostic under evidence/voice. A SIGKILL alone does not identify its cause: check host evidence before treating it as memory exhaustion. Resume from current assets in chapter-sized batches; successful earlier batches remain saved.

```json
{"method":"voice","params":{"action":"status"}}
```

`available` checks installed engine files. A successful real generation is separate evidence. The status also exposes current progress or the last result. A clean install can still import external audio while the model is absent.

## Configure and generate

Set per-language defaults through an ordinary apply batch. A reference accepts the same `{path}` or `{data}` source as audio.attach; omit it for the current reference, or set `reference:null` to restore the official default on the next generation.

```json
{"method":"apply","params":{"requestId":"voice-style-1","expectedRevision":0,"commands":[{"type":"voice.set","value":{"locale":"zh-CN","speed":1.05,"emotionStrength":0.5,"emotion":[0.12,0,0,0,0,0,0.06,0.55],"pronunciations":{"3bet":"三 bet","KK":"口袋K"}}}]}}
{"method":"voice","params":{"action":"generate","requestId":"voice-1","expectedRevision":1}}
```

Speed is0.5–2 times normal; greater is faster. Emotion strength is0–1. The eight emotion values are `[happy, angry, sad, afraid, disgusted, melancholy, surprised, calm]`, each0–1. The UI offers a few starting points; authors may choose any supported vector. No Qwen emotion-text model is required. Choose a consistent speaker and moderate emotion for a coherent course; more intensity is not automatically more natural.

Pronunciations apply to speech in one literal replacement pass, longest terms first; captions keep their original text. They may also contain official IndexTTS phonetic notation when necessary. Use actual delivery to choose a reading rather than enforcing one spelling for every audience. Check replacements inside the complete sentence: adjacent words can merge into another number. When that happens, name the quantities in separate natural clauses instead of changing only an isolated digit.

A beat may override delivery or select its own speaker reference. Author `delivery:{"zh-CN":{"speed":0.9,"emotionStrength":0.4}}` on that beat through scene.put. Speed/emotion inherit language defaults unless overridden; pronunciation entries merge with language defaults. This lets an important calculation slow down without making the entire course stale. The director checkbox “delivery for this beat only” edits these overrides; unchecking it restores inheritance. Changing an override invalidates only that beat's generated audio.

Generate defaults to missing/stale narration on the selected scene and branch, or every selected programme entry. Repeated/shared beats generate once and play at each occurrence. Select specific route beats with `beatIds:["flop-think","river-think"]`; `force:true` regenerates them even when audio is current. Optional `locale` and `sceneId` override selection; a different scene uses its main route unless branchId explicitly selects another. `timeoutSeconds` defaults1800, supported10–7200.

The call waits for completion; the director UI continues showing progress. A session can process voice status/cancel control requests while generation is pending, and their replies can arrive before the generation result. Other session requests retain their sequential order. Use one batch to avoid loading the model for each sentence. For each requested language, pilot a natural passage containing the lesson's actual difficult amounts, decimals, fractions and hand names when present, then generate the remaining route. An easy introduction alone does not check quantitative speech. If a reading is ambiguous, use scoped pronunciations in that language and recheck the affected take while keeping the visible notation. Treat ASR as a locator for possible errors, not as proof that every homophone is wrong. A voice setting change marks generated audio in that language stale; externally imported audio remains under the author's control. Filling also verifies existing files, so missing or corrupt narration can be regenerated.

Job status/cancel belongs to the connected Director. With a running studio, CLI sessions share that controller. Without one, keep the original NDJSON session open for generation and its status/cancel requests: a separate standalone session creates another controller, so its job:null does not mean the pending batch completed. Await the original response or inspect/replay its exact committed receipt; the engine lock prevents concurrent workers. This avoids introducing a second job registry just for monitoring.

## Failure, cancellation and retry

```json
{"method":"voice","params":{"action":"cancel"}}
```

Only one local job may use the same engine at a time (`VOICE_BUSY`). The batch generates outside the project edit lock, then commits its complete audio set using the original revision. An intervening edit gives `REVISION_CONFLICT`; current project/audio are preserved. Engine failure and accepted cancellation also preserve them. The final atomic commit is a short non-cancellable phase: cancel returns `cancelled:false` once it starts, rather than promising to undo a committed result. If an I/O failure leaves commit completion uncertain, inspect/replay the exact request receipt. Logs and generation provenance go in `evidence/voice/`; temporary workers are cleaned up. CLI Ctrl-C/SIGTERM cancels its active request.

A completed request is exactly replayable with the original ID and body, even across restarts. For a changed body, use a new ID. After a revision conflict, inspect the current scene before making a new request. `VOICE_NOT_READY` includes the setup action; `VOICE_UP_TO_DATE` means no selected audio needs filling. Never silently fall back to another engine. External generation remains available through the ordinary audio.attach workflow when intentionally selected.

Official API and pronunciation controls: [IndexTTS documentation](https://github.com/index-tts/index-tts/blob/main/docs/README_zh.md). This project does not modify upstream model code.

## Distinct speakers

A role label alone does not change the voice. Give each role an authorized, distinct reference and use scoped voice.set to apply it to its beats:

```json
{"type":"voice.set","sceneId":"river-example","beatId":"question","value":{"locale":"zh-CN","reference":{"path":"/absolute/questioner.wav"},"speed":1.03}}
```

This stores the imported reference in that beat's delivery; global defaults continue to apply to its other settings. Subsequent clips for the same role can reuse its referenceAssetId through scene.put. Set reference:null in the same scope to restore inherited speaker identity. No named creator's voice is required by any mode. The integrated batch freezes and verifies every distinct reference before running one worker, and records each clip's actual reference hash. Dialogue turns are sequential; overlapping dialogue can be mixed externally and imported. Add background music with `sound.bed` and configure ducking/loudness with `sound.set`; preview and export use the same mix (see [complete production](full-production.md#mix-and-audition-sound)). The director's local-delivery checkbox also scopes reference imports to the current beat. Check role consistency across the whole programme and listen to a continuous exchange.

A mode's suggested delivery is a starting point, not an automatic voice mutation. Apply its delivery explicitly with voice.set, adapt for the target language, and regenerate only stale clips. A mode/brief edit alone does not invalidate acoustically unchanged speech.

After replacing speech, review action synchronization and precise captions against the actual new take. Precise captions retain an audio fingerprint; a changed asset requires explicit captions.set after timing review. This prevents a longer new take from silently retaining early reveal subtitles. See lesson-format.md for that command and timing contract. Preview follows the active audio clock while it loads/plays; edits pause playback, and media failures stop with a localized error.

Timed narration also requires timing.set for the selected language after review. A different take or language can change when an action should happen even when the script is unchanged. TIMING_STALE protects that binding; use each language's own offsets. Inspect all spoken action facts against the table after full generation, not only the key decision or the earlier sample. A completed TTS job and matching source-text hash do not prove that every clause was spoken: check the actual amounts, negations and planned actions in the full take. Repair omissions or ambiguous readings in the affected beat, then recheck its new audio and dependent output. ASR can help locate clauses but does not certify pronunciation or naturalness.
