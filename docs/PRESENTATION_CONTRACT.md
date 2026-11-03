# 共用教学表现契约

本轮在 `beat.presentation` 上增加可选字段；牌局仍由规则引擎重放，所有时间由同一 RenderPlan 决定。省略字段时保持现有输出。

## 编辑输入

| 字段 | 形状与语义 |
| --- | --- |
| `annotations` | 数组，最多 40 个 `{id,type,...}`。`arrow` 使用 `from/to`，`circle` 使用 `target`，`label` 使用 `target/text`，`path` 使用 `points`，`image` 使用 `source/box`，`svg` 使用 `source/box`。颜色为十六进制，`width` 为 1–8 的标准化笔宽。 |
| `camera` | `null` 恢复全景，或 `{target,scale,duration?}`；scale 1–3，duration 0–1.5 秒，从该镜头提示点开始确定性地放大。 |
| `rangeView` | `{mode:'groups'|'matrix'|'combos',metric?:'weight'|'rangeShare'|'frequency'|'equity'|'ev',action?,hand?,filter?:{category?,minWeight?},page?}`。frequency 和 ev 必须指定 action；ev 使用分析资料声明的金额单位。筛选不重新归一化范围概率。 |
| `comparison` | `{mode:'choices'|'conditions',origin:{sceneId,analysisId},routes:[{id,label,sceneId,startAnalysisId,endAnalysisId}]}`，两到三条。label 为本地化文字。choices 要求相同公开决定与行动历史；conditions 显示输入差异。路线终点是明确的假设示例，不表示其 EV 或发生概率。 |
| `motion` | `true`、`false`，或 `{duration?,deal?,bet?,collect?,payout?}`；各动作默认启用，duration 默认 0.45 秒，允许 0.15–1.5 秒。仅动作附近变化，静帧继续复用。 |

`annotations` 的 `from/to/target` 接受语义对象字符串或 `[x,y]`：归一化点的坐标在 0–1。语义对象包括 `hero`、`board`、`pot`、`seat:id`、`bet:id`、`stack:id`、`card:Ah`、`range:groupId`、`hand:AKs`、`calculation`。隐藏牌不可被引用。圈画和箭头由真实元素矩形定位，横竖版无需各写坐标。

`label.text` 是本地化短标记；渲染器依据当前画面文字与牌张的位置选择空白区域，避免固定放在对象上方而遮挡底池或牌面。`path.points` 是 2–500 个归一化点，支持任意折线。`image.source` 是内嵌 PNG/JPEG/WebP data URI，限制为 2 MiB 与 4096×4096；`svg.source` 是安全静态 SVG 文本，只接受图形、文字与渐变标签，拒绝脚本、事件、外部引用和 foreignObject。`box` 是 `{x,y,width,height}` 归一化矩形，必须完整位于画面内。这些资产随 manifest 便携，不请求网络。

提示点 `cues` 可以替换 `surface/focus/show/annotations/camera/rangeView/comparison/motion`，其中 annotations 为空数组表示收起标记。`show` 新增 `comparison` 与 `metrics`，其他字段维持既有含义。

## 编译与渲染

编译器提供 `previousState`，取本次动作之前同一可见性、同一显示单位的状态；金额单位为 BB 或 chips，`stateStart/stateEvent` 表示动作开始绝对时刻。每一帧携带全部表现状态，随机跳转不重放界面事件。

编译派生的 `presentation.cameraStart` 是镜头开始的绝对秒数。章节单独渲染时，它和 `start/end/stateStart/narrationStart` 一起平移到章节起点。`presentation.layoutSections` 是当前段落所有提示点可能揭示的区块并集，用于保留研究画布的位置；它不是另一套可编辑项目状态。

`renderFrame` 继续生成 HTML。新增 `layoutFrame(root)` 在 HTML 安装之后执行：按本帧对象矩形生成 SVG 标记和镜头变换。客户端导出与导演预览必须调用相同函数；容器改变尺寸时再次调用。函数清空并重建本帧绘图，不读取播放历史，不执行牌局动作。

含素材的计划先调用共用的 `prepareArtwork(plan)` 并等待解码完成，再开始预览或编码，避免首帧空白以及损坏素材被默默忽略。布局阶段无法找到的标记或镜头对象通过 `data-missing-targets` 暴露给成片检查。`plan.rehearsal` 只在明确的画面排演输出显示“配音待制作”，普通成片与正常客户端不带导演资料。

比较输出含起点与终点分析记录；正式媒体验证必须校验这些记录的依据文件，不能只检查主 `presentation.analysis`。编译时检查主起点已发生、路线的起点在终点之前、公开状态一致或记录条件差异。过期资料沿用原复核规则。

## 验收

验证横竖版对象绑定、随机跳帧一致、标记清除与镜头返回、隐藏牌拒绝、SVG/图片安全、相同起点检查、条件差异显示、范围单位与筛选边界、动作后的静帧复用；实际浏览器截图与至少一条编码路径使用同一渲染函数。
