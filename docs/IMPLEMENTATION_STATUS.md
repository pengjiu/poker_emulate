# River Studio 执行状态

2026-11-03：PR #1 的本地根因修复、完整课程重制及当前验收见 [完整课程复验与 5W 记录](reviews/2026-11-03/full-course-completion.md)。以下版本状态与 `release.json` 保留为原批次历史，不用于冒充本轮成片结果。

2026-11-02：M1–M8 的 v1.0.0 基线保留。当前 v1.2.0 加入开放讲解模式、连续动作/语音、多手和分支顺序、独立声源及绑定音频的精确字幕；详见 [STYLE_MODES_REVIEW.md](STYLE_MODES_REVIEW.md)。v1.1.0 的官方 IndexTTS2.5 与134秒六人桌完整课程保留。最终验收以 [release.json](../release.json) 及其 qualification 为准。

中文 GTO 真实任务首轮失败、一次反馈后交付，精修 skill 后又完成独立渲染前复测。目录和字幕通用修复见 [REAL_SCENARIO_REVIEW.md](REAL_SCENARIO_REVIEW.md)。

当前精修取消随旁白重启的虚假计时条；统一下注预设计算与确认行为，清理等待/结算状态的无效控件。新增内地中文口播参考，区分模型、实战来源及原桌人数；完整意思按行动节点编排。新版讲稿独立冷读后修订，实际 MP4 所有 33 种不同画面及结尾均已解码比对。详见 [LOCALIZED_CLIENT_REVIEW.md](LOCALIZED_CLIENT_REVIEW.md)。

后续 v1.1.0 的语音任务、自然术语、六人桌持续视角、独立代码 review 与真实模型冷启动结果见 [VOICE_AND_SIX_MAX_REVIEW.md](VOICE_AND_SIX_MAX_REVIEW.md)。本轮没有重跑旧七片媒体矩阵及旧 60 秒资源基准；新片与协议另作变更路径验收。

- M1–M4：严格 v2 契约、单一规则、原子项目/回执、迁移、音频导入与整帧编排已完成。
- M5：真实渲染、取消、并发、FFmpeg 终止、发布失败恢复与 60 秒性能基准通过。
- M6：导演台真实操作链、144 画面组合及附加碰撞/手机字号检查、七段正式视频通过。
- M7：六个独立冷启动任务全部交付；首次语义预检 5/6；编辑最多 6 次、纠错最多 1 次；人工介入和实现源码读取均为 0。
- M8：干净安装及真实导出通过，发布清单已建立；旧原型 17 个活动执行文件已验证归档后退役，历史课件与失败证据保留。

结果、边界和复现入口见 [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md) 与 [release.json](../release.json)。
