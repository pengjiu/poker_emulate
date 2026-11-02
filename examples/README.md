# 可分发样例

`legacy/lesson.json` 和三种语言的短音频用于迁移、规则和媒体回归。首次运行 `npm start`，`scripts/setup-demo.mjs` 通过正式迁移接口生成独立的 `projects/demo`；后续启动保留已编辑内容。也可用 `npm run setup:demo` 单独初始化。

这是可离线打开的功能样例，包含多条规则场景；最新教学模式、自然讲解与真实 IndexTTS 样片的验收记录见 [模式设计与验收](../docs/STYLE_MODES_REVIEW.md)。制作新课程时使用 [poker-director skill](../.agents/skills/poker-director/SKILL.md)，把项目放在 `projects/`，输出放在 `artifacts/`。
