These are unmodified official speaker-reference samples used by the offline
voice integration tests. They are reference prompts, not generated narration or
proof of IndexTTS speech quality. Tests copy them into isolated temporary engine
directories and use the explicitly controlled `voice-engine.mjs` protocol fixture.

Source: `https://huggingface.co/spaces/IndexTeam/IndexTTS-2-Demo`

Pinned revision: `b01840e8e4fd9753743a6d0466cd73ae1d634a68`

Files: `examples/voice_01.wav`, `examples/voice_04.wav`, `examples/voice_06.wav`.
The canonical upstream hashes and identities are in
`src/media/voice-presets.json`; the tests verify these bytes against that catalog.
