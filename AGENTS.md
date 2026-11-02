# River Studio maintenance

For poker authoring, narration, voice or rendering tasks, read [.agents/skills/poker-director/SKILL.md](.agents/skills/poker-director/SKILL.md). It owns the structured command contract and links the relevant references.

For code changes, read [CONTRIBUTING.md](CONTRIBUTING.md) for module ownership, verification and the boundary between source fixtures and local production data. Keep one poker engine and one compiler; preview and export share the client renderer.

Existing `projects/`, `artifacts/` and `.river/` contain local work and models. Exercise changes in temporary projects, preserving those directories. Treat `release.json` and `archive/` as historical acceptance records; new checks need their own evidence rather than editing old results into a pass.
