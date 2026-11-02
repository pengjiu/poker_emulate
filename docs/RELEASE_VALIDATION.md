# River Studio v1.0.0 发布基线验收记录

2026-11-01。本文件保留 v1.0.0 固定基线；当前 v1.0.1 的变更路径验收见 [真实场景验收与通用修复](REAL_SCENARIO_REVIEW.md)。

**M1–M8 完成，A01–A17 全部通过，本地制作 v1 可交付。** 发布范围为本地单机制作，当前实测平台为 Apple Silicon macOS；不将本机验证扩展为其他系统或云端验收。

固定运行 ID：`v1-20261101-final`。最终判断见 [qualification.json](../artifacts/acceptance/v1-20261101-final/qualification.json)，发布入口见 [release.json](../release.json)。原始失败报告未改写，修正与续跑另留记录。

## 交付内容

导演台保留牌桌、片段条和上下文编辑区，支持真实牌面编辑、外部音频导入、路线、语言、画幅、字幕、导出与取消。成片只显示虚构线上客户端。场景采用标准无限注德州 2–9 人、任一街、合法快照及单层替代路线；个人头像支持文字或 emoji，桌名和桌布颜色可设。

Agent 通过项目内 [poker-director skill](../.agents/skills/poker-director/SKILL.md) 使用 load、observe、apply、seek、export 五个方法。成功编辑自动保存；音频导入复制到项目并探测时长。所有公开金额统一为 BB，RenderPlan v2 显式标记单位。完整项目目录可移动与打包交接。

语音由外部 TTS 或本地语音模型提供，平台负责导入、同步和渲染。GTO 频率与 EV 需要外部求解证据；本次六任务验收证明制作能力，没有以脚本牌局证明策略最优。

## 验收与证据

| 门槛 | 结果与主要证据 |
| --- | --- |
| A01 保存/迁移 | 修订、输出、资源和回执跨路径保持；旧 v1 原件保留。core-contract.tap |
| A02 音频闭环 | 真实浏览器 WAV/MP3 导入，下载项目、移动后通过实际 CLI 渲染。media.tap、studio.tap |
| A03 就绪判断 | 选中路线缺资源拒绝，未选路线不误阻断。core-contract.tap |
| A04 唯一标识 | load/apply/导入一致拒绝歧义标识，无部分写入。core-contract.tap |
| A05 分支独立 | 只编译所选路径，共享前缀改动校验受影响路线。core-contract.tap |
| A06 规则 | 独立预期值、短额全下/累计重开、单挑顺序、零头筹码，以及 256 手完整模拟通过。core-contract.tap |
| A07 行动可见 | 每个行动有独立画面与 seek 地址；真实 MP4 各行动检查通过。media-index.json、visual-review.json |
| A08 严格输入 | 未知字段、选项、错误单位/数值均拒绝，非零退出。core-contract.tap |
| A09 构建保护 | 损坏课件不覆盖；过期 renderer 自动重建，不混用版本。core-contract.tap、media.tap |
| A10 崩溃/重试 | 提交前/提交后 ACK 前实际 SIGKILL；重开后精确重试只提交一次。core-contract.tap |
| A11 音频/语言 | 三语实际音轨、单语言失效、新字典、字幕与首尾同步通过。speech-content-review.json、media.tap |
| A12 故障恢复 | 实际取消、终止 FFmpeg、超时、并发和发布失败；取消后 5 秒内退出全部任务子进程，原成片不变。media.tap |
| A13 可复现 | 同输入复用已校验结果；路线/牌面/语言/音频/画幅变化各自改变实际导出指纹。media.tap |
| A14 客户端 | 144 个状态组合、2 个手机字号与 156 个行动金额/遮挡检查，共 302 项通过。visual/report.json |
| A15 正式成片 | 六种三语/双画幅与一个边池视频均真实生成并全解码；93 个实际编码关键帧检查通过。media-index.json、visual-review.json |
| A16 安装/资源 | 官方独立 Node 24 + 本地 npm ci，doctor/build/实际视频导出通过；60 秒资源基准通过。clean-install.json、clean-render.json、performance/report.json |
| A17 Agent | 六个独立冷启动任务完成，阈值全部满足。cold-start-summary.json 与各任务原始记录 |

上述文件均在[固定运行目录](../artifacts/acceptance/v1-20261101-final)。Node 自动测试共 **61 项通过、0 失败**（39 规则/契约、12 媒体、10 浏览器），与 302 个画面检查分别计数。原型随机模拟从引擎合法动作集合采样，不能独自证明规则正确；本次另有事先固定的人工可核算预期值。

实际视频关键帧对预编码帧的最低 SSIM 为 **0.988945**。七段正式样片的原音频首尾相关性均高于 **0.9967**，偏移均约 **5 ms**，小于 30 fps 的一帧，尾音完整。

语言内容由真实 MP4 的无提示 ASR 转写、Agent 内容核对及源音频波形比对共同检查，非仅相信 locale 标签。原始转写保留中文同音字与日文近音词误识别；报告未声称人工试听、逐字语音认证或专业配音质量。平台忠实保留所导入的外部声音。

## 独立 Agent 试用

| 任务 | 最终交付 | 首次语义通过 | 编辑批次（含创建） | 纠错批次 |
| --- | --- | --- | --- | --- |
| 中文六人完整牌局 | 通过 | 是 | 2 | 0 |
| 英文单挑双画幅 | 通过 | 是 | 4 | 0 |
| 日文三人不等额全下 | 通过 | 否，合法性诊断后自行修正 | 3 | 1 |
| 短额全下与累计重开 | 通过 | 是 | 4 | 0 |
| 替代路线与单语言修改 | 通过 | 是 | 6 | 0 |
| 迁移、缺资源修复及取消重试 | 通过 | 是 | 3 | 1（报告读取字段修正） |

六任务人工介入 **0**、实现源码读取/修改 **0**；首次语义通过 **5/6**。初始化/迁移创建也计入编辑，口径比部分单任务报告更保守。发布前公开补全过 frameId 文档，并由实现 Owner 修复运行时布局/单位问题；这些介入已披露，未冒称首轮全程零问题。旧失败 cohort 和旧视频保留。最后两项已知遮挡由原试用 Agent 针对最新 MP4 独立复核关闭。

## 性能与安装

参考环境：Apple M4 Pro / 48 GiB / macOS 26.6.2，Node 24.22.1，Playwright 1.62.1，FFmpeg/ffprobe 8.1.1；浏览器和字体 hash 在成片回执中。独立 Node 下载来源及官方 SHA 校验记录为 [provenance.json](../artifacts/clean-toolchain/provenance.json)。

60 秒、1920×1080、30 fps、H.264/AAC，独立父进程每 200 ms 采样整个渲染 CLI 进程树，从启动计时到退出：

| 指标 | 实测 | 门槛 |
| --- | --- | --- |
| 总墙钟 | 382.853 秒（约 6 分 23 秒） | ≤600 秒 |
| 进程树峰值 RSS | 1.446 GiB | ≤3 GiB |
| 暂存目录峰值 | 16.043 MiB | ≤1024 MiB |

干净安装清除了 NODE_PATH/NODE_OPTIONS，PATH 使用独立官方 Node 与系统工具；npm 依赖装入新的本地 node_modules。标准 Playwright 浏览器缓存仍可复用，这不是全新操作系统验收，也不依赖 Codex 隐藏包。

## 正式样片

| 样片 | 规格 | 时长 | 产物 |
| --- | --- | --- | --- |
| 中文 · 横版 | 1920×1080 / 30 fps | 23.667 秒 | [MP4](../artifacts/acceptance/v1-20261101-final/media/a59ade212e34c1c5d64bc596afeb261b53a372559798c397d574c010357b5453/video.mp4) · [回执](../artifacts/acceptance/v1-20261101-final/media/a59ade212e34c1c5d64bc596afeb261b53a372559798c397d574c010357b5453/receipt.json) |
| 中文 · 竖版 | 1080×1920 / 30 fps | 23.667 秒 | [MP4](../artifacts/acceptance/v1-20261101-final/media/39b0aad608ae9dd5d38def8f9644a5fb6d383dabea9c154a51402b2eb554ad89/video.mp4) · [回执](../artifacts/acceptance/v1-20261101-final/media/39b0aad608ae9dd5d38def8f9644a5fb6d383dabea9c154a51402b2eb554ad89/receipt.json) |
| 英文 · 横版 | 1920×1080 / 30 fps | 21.600 秒 | [MP4](../artifacts/acceptance/v1-20261101-final/media/4320327b40c2f54dc5c831204d39fbc09216a58a2dd7077e07d638c87f97691b/video.mp4) · [回执](../artifacts/acceptance/v1-20261101-final/media/4320327b40c2f54dc5c831204d39fbc09216a58a2dd7077e07d638c87f97691b/receipt.json) |
| 英文 · 竖版 | 1080×1920 / 30 fps | 21.600 秒 | [MP4](../artifacts/acceptance/v1-20261101-final/media/9648894d886fdb7c7c7e1edaf6586d735a109df368c00ac0a0b9a48832f9ca1f/video.mp4) · [回执](../artifacts/acceptance/v1-20261101-final/media/9648894d886fdb7c7c7e1edaf6586d735a109df368c00ac0a0b9a48832f9ca1f/receipt.json) |
| 日文 · 横版 | 1920×1080 / 30 fps | 25.400 秒 | [MP4](../artifacts/acceptance/v1-20261101-final/media/053722ec1421abda0437cb6f3d0c0e0b859115823b30ca0a870e77951154ebd3/video.mp4) · [回执](../artifacts/acceptance/v1-20261101-final/media/053722ec1421abda0437cb6f3d0c0e0b859115823b30ca0a870e77951154ebd3/receipt.json) |
| 日文 · 竖版 | 1080×1920 / 30 fps | 25.400 秒 | [MP4](../artifacts/acceptance/v1-20261101-final/media/227fc3ae1191d54b0972ac4ad087ccb62e8ca2de1aaae032f4128ac415162213/video.mp4) · [回执](../artifacts/acceptance/v1-20261101-final/media/227fc3ae1191d54b0972ac4ad087ccb62e8ca2de1aaae032f4128ac415162213/receipt.json) |
| 中文 · 竖版 · 三人边池 | 1080×1920 / 30 fps | 17.367 秒 | [MP4](../artifacts/acceptance/v1-20261101-final/media/430a987bad48de3a8fc59a5026e5057e66f79c9ce1110c1a18f665c9b4cc2c79/video.mp4) · [回执](../artifacts/acceptance/v1-20261101-final/media/430a987bad48de3a8fc59a5026e5057e66f79c9ce1110c1a18f665c9b4cc2c79/receipt.json) |

## 保持简洁的维护边界

| 唯一责任 | 位置 | 维护约束 |
| --- | --- | --- |
| 持久化与修订 | src/project | 项目目录是源数据；同一原子提交保存修订与最近 128 个回执；单写入锁 |
| 扑克规则 | src/poker/rules.mjs | 唯一筹码/合法动作实现；内部整数，公开 BB |
| 编排 | src/compiler.mjs | 先选路线再执行；生成不可变 RenderPlan，不让客户端重算规则 |
| Agent 控制 | src/director.mjs | 五个方法、五种编辑命令；CLI/浏览器接入同一个运行时 |
| 画面 | src/client | 同一个纯 renderer 同时用于预览与导出 |
| 音频与成片 | src/media | 外部音频导入；一个本地渲染槽；限额、失败清理、暂存后发布 |

无需数据库、云队列、账号系统、内置 TTS 或第二个执行核心。新增语言改字典/翻译/音频；新增教学主题编排场景，通常不改引擎。修改职责模块后运行相应检查，仅在画面/编排/媒体改变时扩大到实际成片验收。

## 历史、回退与已知范围

初次统一运行的碰撞检查误把透明容器当成可见筹码，已修正为实际 chip 元素；原失败保留。随后统一运行全部产品检查通过，但干净安装的 smoke fixture 删除片段后残留分支引用，被产品正确拒绝。只修正验收 fixture，沿用未变化的产品指纹续跑成功；[原报告](../artifacts/acceptance/v1-20261101-final/report.json)、[修正说明](../artifacts/acceptance/v1-20261101-final/harness-correction.json) 与 [续跑报告](../artifacts/acceptance/v1-20261101-final/continuation-report.json) 均保留。

旧原型 17 个活动执行文件已在逐文件 hash 校验归档后移除，原服务已停止。原始源码归档及退役快照均为只读，旧课件、音频、样片、失败记录未删除；[回退检查](../artifacts/rollback-check.json) 已确认原始 CLI 能重开原课件。[退役记录](../artifacts/acceptance/v1-20261101-final/retirement.json) 列出全部文件。

首版不支持实时真人多人、支付、ICM、自动抽水、多次发牌、嵌套分支、云调度或内置求解器；不承诺其他操作系统的同等级媒体验收。字幕按文本长度/时间分页，不宣称逐词强制对齐。进程被强杀后写锁最多约 12 秒恢复，按原 requestId/body 重试。

开始使用见 [README](../README.md)，结构化制作见 [skill](../.agents/skills/poker-director/SKILL.md)。本地入口默认 http://127.0.0.1:4174，`?view=client` 打开纯客户端。
