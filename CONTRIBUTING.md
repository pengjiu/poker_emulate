# 维护与验证

使用 Node.js 24，安装步骤见 [README](README.md)。依赖版本与 `package-lock.json` 一起维护，使用 `npm ci` 安装。源码采用 ES modules、原生 Node 测试和现有两项运行依赖；日常开发不需要安装 IndexTTS 模型。

## 模块职责

| 目录 | 职责 |
| --- | --- |
| `src/project/` | 项目格式、原子保存、回执、迁移、资产索引及课程/连续实战/练习 |
| `src/poker/` | 唯一德州扑克规则与筹码结算 |
| `src/compiler.mjs` | 项目到 RenderPlan 的时序编译 |
| `src/client/` | 预览与导出共用的纯客户端画面 |
| `src/studio/`、`src/server.mjs` | 导演台、本地接口与制作交互 |
| `src/media/` | 音频导入、语音调用、共用混音、章节复用与批量交付 |
| `src/direction/`、`locales/` | 讲解模式与界面语言 |
| `src/analysis/`、`src/presentation.mjs` | 只读决策资料、证据绑定与确定性的表现编译 |
| `.agents/skills/poker-director/` | Agent 制作契约、写稿与验收流程 |
| `examples/`、`tests/` | 可分发输入样例与自动回归 |

修改由承担职责的模块处理。持久化继续使用项目原子提交；规则和时序逻辑保持单一实现，界面按 RenderPlan 绘制。输出格式、命令或错误行为改变时，同步更新对应 skill 参考和有效的行为测试。

对外金额统一由规则层 `displayState` 转换；分析依据保留内部确定性状态指纹。视频和音频缓存验证输入内容、实现/工具链及缓存字节，任何新增渲染依赖都必须进入相应身份。不要在渲染进程运行期间修改 renderer、构建脚本或编译实现；应冻结实现后重跑受影响的实际媒体。

## 日常检查

```sh
npm run build
npm run doctor -- --json
npm test
git diff --check
```

测试包含真实 Chromium、FFmpeg、音视频导入/渲染、取消和故障恢复。语音测试采用隔离的受控引擎验证集成契约；它不代表真实 IndexTTS 音质通过。涉及实际配音或画面质量的修改，还应检查真实输出并保存新证据。

日常检查在本地运行。`test:acceptance` 是额外的 macOS A01–A17 历史验收入口，依赖 `say` 的 Tingting 音色，渲染正式语言/画幅矩阵与性能基准；人工语言内容、实际画面和独立冷启动任务仍需另外验收。

## Git 边界

提交源码、锁文件、文档、项目 skill 与小型必需测试音频。`npm start` 首次从 `examples/legacy/` 创建可编辑的 `projects/demo`；已有示例项目保持原样。新场景及生成文件放在 `projects/`、`artifacts/`，本机模型放在 `.river/`；这些目录及 `dist/` 构建结果由 `.gitignore` 排除。

`release.json`、`archive/` 的 JSON/校验和与 `docs/` 中的历史报告保留来源记录，其中指向本机 `artifacts/`、`dist/` 或旧原型的路径不随 Git 分发。历史源码包和成片未删除；需要对外分发时可另行作为发布附件提供。Git 克隆的可运行性由仓库源码、示例和自动检查独立保证。

提交前用 `git diff --cached --stat` 和 `git diff --cached --check` 核对范围，确认没有本地模型、视频、运行凭证、环境配置或临时验收输出。提交描述说明实际变化与验证结果。当前项目未指定开源许可证；第三方模型、工具和音频的许可不因上传源码而改变。
