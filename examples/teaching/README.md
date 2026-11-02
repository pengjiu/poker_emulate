# 教学画布试播输入

## 完整课程输入

`full-course.mjs` 与 `full-course-locales.mjs` 扩展为三集递进课程：价格与范围、策略依据与边界、连续实战中的更新。三集均有中文/英文/日文完整讲稿及横竖交付，另有研究段和独立短片，共 24 个输出。范围、组合、出路、EV、箭头、镜头、路线对照、真实接续两手、抽水、BBA/ICM 和可作答练习都来自同一可编辑工程。

```sh
node scripts/build-full-course.mjs --project projects/full-course
node bin/river.mjs produce --project projects/full-course --out artifacts/full-course --rehearsal
```

构建脚本从真实节点生成受限均衡依据和规范化策略附件，核对所有路线和三种语言，只允许未生成配音的提示。策略附件是可复核受限模型的导入示范，不冒充外部商业求解结果。每种语言单独估计阅读时间，真实音频到位后自动替代估时；答题留白是独立片段。脚本不生成任何新配音。

工程中 `evidence/full-course-build.json` 给出版本清单与检查结果；正式编码和人声听感需要分别验证。完整目标与交付状态见[完整计划](../../docs/FULL_PLAN_DELIVERY.md)。

## 原始试播输入

`course.mjs` 提供三集递进课程、约两分钟的端到端样片和中英日短片。它们是可分发的创作输入；声音、编码视频和便携工程由正式制作链生成，保存在忽略目录中。

| 作品 | 新增的判断任务 | 场景与边界 |
| --- | --- | --- |
| 第 1 集：价格不是权益 | 区分价格门槛、候选范围、选择代价 | 六人桌翻前进入单挑，完整走到摊牌；范围是未加权假设 |
| 第 2 集：可推导的频率 | 检查分母、无差异条件和最佳回应 | 受限河牌极化模型；过牌直接摊牌，或固定全下；不是完整无限注德州求解 |
| 第 3 集：条件变了重新判断 | 把方法迁移到新位置、牌面与下注尺寸 | 新的六人桌完整牌局；低诈唬只是明确给定的示范条件，没有伪造对手前史 |
| 端到端样片 | 牌桌 → 价格 → 范围 → 回到待决节点 | 保留原始合法行动历史；讲解期间不提交英雄动作 |
| 本地化短片 | 检验金额、中文/英文/日文与纵横构图 | 同一个全下后决策，三种独立讲稿 |

## 创建草稿

```sh
node scripts/build-teaching-demo.mjs --kind course --project projects/teaching-course
node scripts/build-teaching-demo.mjs --kind slice --project projects/teaching-slice
node scripts/build-teaching-demo.mjs --kind probe --locale ja-JP --aspect portrait --project projects/teaching-ja
```

目标目录必须是新目录，已有工程保持原样。脚本通过现有项目存储和 Director 六方法写入，生成与牌局节点匹配的受限模型依据。草稿缺少配音时会明确报告 `AUDIO_MISSING`，不会把静音文件当作教学成片。

安装官方 IndexTTS 后，可加 `--voice` 生成真实合成口播，再通过导演台排演和复核。`--render --out artifacts/teaching/slice` 调用正式渲染，要求所有 readiness 检查通过。脚本在真实配音后将有声片段的草稿阅读时长恢复为普通最低值，时长由实测音频决定；保留单独的提问留白，不用长静音凑课程时长。

已存在的项目可以继续用 `node bin/river.mjs session --project ...` 配音、绑定提示点和修改；不要为重试删除已有作品。只制作一集时，通过 `output.set` 选择相应 `sceneId`，或对 validate/render 使用 `--scene`。

## 依据和验收

课程工程的 `evidence/river-equilibrium.json` 从实际规则状态读取底池、跟注金额和牌张，保存前后节点指纹、所有纯策略偏离收益和模型边界。分析确认绑定这份文件的实际内容，随后修改或缺失会阻止正式媒体验证。`production-brief.json` 记录预期学习目标；它不记录观众已掌握内容。

实际交付状态见 [教学验收记录](../../docs/TEACHING_ACCEPTANCE.md)。独立试听、陌生 Agent 制作和观众试学需要分别记录，不能由代码测试或渲染成功替代。
