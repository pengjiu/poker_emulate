# River Studio

最新本地修复、完整课程交付与逐项 5W 记录见 [2026-11-03 完整课程复验](docs/reviews/2026-11-03/full-course-completion.md)。历史发布和验收记录保留，不能替代新批次证据。

本地、Agent 优先的德州扑克内容制作工具。通过结构化场景控制牌、筹码、行动、旁白和路线，以真实客户端布局生成横版/竖版视频。默认集成官方 IndexTTS2.5 本地语音，同时支持导入外部 TTS 或其他本地模型的音频。

**完整教学制作扩展**增加稳定研究画布、语义画板与镜头、加权范围矩阵、决策计算与策略附件、安全变式、连续实战、课程与练习、共用声音后期和章节复用。它仍使用 v2 项目和六方法；旧工程无需迁移。当前范围见[完整计划](docs/FULL_PLAN_DELIVERY.md)，实际验证与边界见[完整验收](docs/FULL_PLAN_ACCEPTANCE.md)；此前的[第一阶段实施计划](docs/TEACHING_IMPLEMENTATION_PLAN.md)和[教学验收](docs/TEACHING_ACCEPTANCE.md)保留为历史记录。

**完整课程制作扩展**进一步提供 169 格加权范围、组合筛选、权益/出路/EV、策略附件、画板与镜头、真实连续牌局、抽水与 ante/ICM、可作答练习、声音混合、章节复用及多版本交付。导演台以预览、片段和当前对象检查器组织这些功能，仍共用一条编译链。完整范围见[交付清单](docs/FULL_PLAN_DELIVERY.md)，新验收独立记录，不修改此前的历史结果。

**v1.2.0 增加可组合讲解模式和连续制作。** 10 个中英日模式、自定义约定、跨动作旁白、多手/分支顺序、独立说话者与精确字幕复用现有六方法；详见 [模式设计与验收](docs/STYLE_MODES_REVIEW.md)，机器入口为 [release.json](release.json)。[本地语音与六人桌课程](docs/VOICE_AND_SIX_MAX_REVIEW.md)、[原始发布验收](docs/RELEASE_VALIDATION.md)和[执行计划](docs/EXECUTION_PLAN.md)保留历史证据。

本轮模式样片、分类和使用方式见[讲解模式验收](docs/STYLE_MODES_REVIEW.md)。此前[六人桌 K9 完整课程](docs/VOICE_AND_SIX_MAX_REVIEW.md)保留 2 分 14 秒横竖视频：翻前六人、翻后两人、持续第一视角与 IndexTTS 配音。[客户端精修](docs/LOCALIZED_CLIENT_REVIEW.md)和[首次 GTO 任务](docs/REAL_SCENARIO_REVIEW.md)也保留原视频、失败和修复记录。

## 安装与打开

从 GitHub 克隆安装。仓库包含源码、项目 skill 和带三语音频的必要示例；本机模型、可编辑项目、视频和完整验收产物由 `.gitignore` 排除，保留在原工作目录。

需要 Node.js 24、npm、FFmpeg/ffprobe，以及中文/日文字体。历史参考验收环境为 macOS；本轮另外在 Linux 完成了本地回归与真实 IndexTTS 视频的编码检查，具体规格与边界见教学验收记录。Linux 可安装 Noto CJK 字体；其他系统尚未进行同等媒体验收。

```sh
git clone https://github.com/pengjiu/poker_emulate.git
cd poker_emulate
# 使用 nvm 时可先运行 nvm use（.nvmrc 固定 Node.js 24）。
npm ci
npx playwright install chromium
npm run build
npm run doctor -- --json
npm start
```

首次启动自动从 `examples/legacy/` 创建 `projects/demo`，后续启动保留已有编辑。终端会给出本地地址（通常 http://127.0.0.1:4174）。浏览器和 CLI 共用项目与修订状态。`?view=client` 是干净的牌桌窗口；`?view=output` 显示实际教学输出，与编码视频使用同一个渲染器。没有表现编排的旧项目仍输出原有牌桌画面。

macOS 可用 `brew install ffmpeg` 安装媒体工具；Ubuntu 可用 `sudo apt-get install ffmpeg fonts-noto-cjk`，并把浏览器安装步骤改为 `npx playwright install --with-deps chromium`。Node.js 版本可通过仓库 `.nvmrc` 切换。

自建项目：

```sh
node bin/river.mjs init --scene path/to/scene.json --project projects/my-hand --locale zh-CN --aspect portrait
node bin/river.mjs session --project projects/my-hand
node bin/river.mjs validate --project projects/my-hand --render
node bin/river.mjs render --project projects/my-hand --profile final --out artifacts/my-hand
```

`session` 接受每行一个 JSON 请求，支持 load/observe/apply/seek/export/voice。所有成功编辑自动保存。格式与命令实例的唯一说明在项目 skill：

- [poker-director skill](.agents/skills/poker-director/SKILL.md)
- [项目、场景、音频及批次格式](.agents/skills/poker-director/references/lesson-format.md)
- [六种制作流程](.agents/skills/poker-director/references/task-recipes.md)
- [IndexTTS 安装、音色、情绪、语速与发音控制](.agents/skills/poker-director/references/voice.md)
- [分析资料、画布、提示点与条件变式](.agents/skills/poker-director/references/teaching-canvas.md)
- [范围、画板、连续实战、练习和批量制作](.agents/skills/poker-director/references/full-production.md)

启用默认语音需要 uv。运行 `python3 scripts/setup-index-tts.py`，安装脚本会隔离官方 Python 环境，下载并校验约 7.1GB 必要模型文件；不修改系统 Python。随后在导演台点击“生成本段”或“补全本路线”。可以更换参考音色，设置本语言默认表达，也可勾选“仅本段”调整关键段落的语速和情绪。首次生成先试听一个自然段。`.river/` 是本机模型目录，不随课程或源码包分发；其他机器可先使用外部音频制作，再安装模型。

音频通过 `audio.attach` 接收本地文件或浏览器 data URL，自动探测时长并复制到项目。项目目录包含 project.json、assets/、evidence/，可以完整复制迁移。旧 v1 JSON 用 `migrate --lesson <file> --project <new-directory>` 单向迁移，不覆盖原件。

## 制作决策教学

导演台的片段检查器可选择牌桌或分析画布、绑定分析资料、突出牌张/玩家/底池、编辑问题与显示顺序，并确认本语言的配音提示点。分析暂停只读取节点；返回后，仍由后续的实际行动推进牌局。修改下注或范围后，旧结论需要复核；更换音频后，旧图解提示点需要重新确认。

可复用课程输入包含六人桌完整路线、受限河牌均衡推导、另一手牌的条件迁移，以及中英日短片。先创建可编辑的原生工程：

```sh
node scripts/build-teaching-demo.mjs --kind slice --project projects/teaching-slice
node bin/river.mjs serve --project projects/teaching-slice
# 已安装官方 IndexTTS 后，新建带真实语音的工程并正式渲染：
node scripts/build-teaching-demo.mjs --kind course --project projects/teaching-course --voice --render --out artifacts/teaching-course
```

未配音的草稿不能冒充完整课程，也不能通过正式渲染检查。课程中的均衡只针对写明先验和动作限制的有限河牌游戏；独立枚举最佳回应的依据与节点指纹随工程保存，不代表完整无限注德州求解器。课程资料记录目标、前提和检验题，实际学习效果需要另行观察与作答数据。

## 成套课程、实战与练习

下面的可复用输入覆盖三个递进主题：区分价格与范围、检验均衡及适用条件、在连续实战中更新判断。每集都有中英日文稿、横竖构图与实际可作答的检验题，另有独立短片和研究片段，共 24 个命名交付。新配音可以在其他机器生成；工程和媒体分开放置，已有文件不会被覆盖。

```sh
node scripts/build-full-course.mjs --project projects/full-course
node bin/river.mjs serve --project projects/full-course
# 明确标示“配音待制作”的画面排演，仅放行 AUDIO_MISSING：
node bin/river.mjs produce --project projects/full-course --out artifacts/full-course --rehearsal
# 完成真实音频及时间绑定之后正式交付；也可以 --only zh-ep1-landscape：
node bin/river.mjs produce --project projects/full-course --out artifacts/full-course-final
```

排演按各语言的 `rehearsalDuration` 估计阅读时间，声音到位后按实测音频编译。它不会把静音算成完成的口播；提问后的独立留白仍然保留。批量交付包含 MP4、SRT、讲稿、章节、回执、三语练习和便携项目/依据，入口是交付目录中的 `index.html`。具体名称以工程的交付版本列表为准。

导演台的“课程与实战”可建立 2–9 人牌局、由上手真实结算接续筹码、记录有出处的对手观察、修改条件和编辑检验题；“教学制作”编辑范围、镜头、圈画、策略附件、课程、声音与交付版本。先查看问题定位，再局部修订。练习答案在提交后显示，历史作答保留版本，不将课程目标误写成已经掌握。

精确范围与模型口径见[分析契约](docs/ANALYSIS_CONTRACT.md)，图层、镜头与回放见[表现契约](docs/PRESENTATION_CONTRACT.md)，抽水、前注、连续实战和练习见[实战契约](docs/SESSION_CONTRACT.md)，混音、缓存和交付见[制作契约](docs/PRODUCTION_CONTRACT.md)。

## 导出与恢复

草稿 720p/24fps；正式 1080p/30fps。`--out` 是目录，结果放在指纹子目录，包含 MP4、字幕、回执、规格验证和关键帧。语言/画幅/路线可作为单次命令覆盖；需要持久化时使用 output.set。`--branch main` 选择主线。

一次只运行一个本地渲染任务。取消用 Ctrl-C/SIGTERM 或导演台取消按钮。失败保留诊断，已有成片不覆盖；相同输入重试复用已校验结果。进程意外退出后写入锁最多需要约12秒恢复；PROJECT_BUSY 可稍后以原请求 ID/正文重试。内容不同必须新 ID，修订冲突先 observe。

主要范围：标准无限注德州 2–9 人、任一街、单层分支、选定亮牌、连续实战、中文/英文/日文、IndexTTS/外部音频、自动或精确字幕。现在支持现金局比例/封顶抽水、每人前注或大盲前注、盲注升级和最多 16 人的精确 ICM 计算。模式独立于桌型/语言，允许组合与自定义；选择模式保存创作约定，Agent 据此写稿和验收。GTO 数字需要匹配决策和范围的求解附件或可复核解析推导；策略导入不等于内置通用德州求解器。多次发牌、在线多人游戏和云队列不属于当前制作系统。

## 验证

```sh
npm test
npm run test:core
npm run test:contract
npm run test:media
npm run test:acceptance -- --out artifacts/acceptance/my-run
```

`npm test` 在本地运行全部自动回归。`test:acceptance` 为额外的 macOS 历史验收，需系统 `say` 的 Tingting 音色，会实际渲染正式样片和60秒基准，耗时数分钟至数十分钟。自动脚本保留语言内容/实际帧 review 待办，附加相应证据与独立 Agent 冷启动结果后才形成最终 qualification，未执行不算通过。

维护、模块职责与 Git 文件边界见 [CONTRIBUTING.md](CONTRIBUTING.md)。`release.json` 和文档中的历史媒体/源码包路径对应原工作目录，视频、模型和归档二进制未纳入 Git；历史验收记录继续保留，新克隆无需这些文件即可启动与测试。

维护时只改变承担该职责的模块：Project 管持久化、回执与资产索引，Poker 管规则，Compiler 管时序，客户端只绘制 RenderPlan。VoiceController 批量调用一个临时官方 Python 进程，生成后复用项目原子提交；没有额外 TTS 服务、队列、数据库或第二套规则。预览与导出共用画面；外部求解器留在 Agent 工作流。
