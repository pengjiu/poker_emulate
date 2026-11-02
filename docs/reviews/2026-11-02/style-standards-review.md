# Standards review：模式与连续制作

基线：`dist/river-studio-v1.1.0.tgz` 的只读解包；没有 Git 提交历史。规范：EXECUTION_PLAN.md §3 的职责、所选输出预检、播放编辑约定，及 README 的单一编译/绘制路径。最终状态：**PASS；发现 5 项，全部修复并独立复核，无未关闭发现。**

## 硬标准问题与状态

1. **P1，已关闭：预检选错输出。** `src/compiler.mjs:83` 原先提前合并旧 sequence，吞掉 --scene/--branch 覆盖意图。就绪序列覆盖到缺音频场景时，compile 有 AUDIO_MISSING，validate 却 ready:true。现在统一归一化原始 override；双向回归通过。
2. **P2，已关闭：显式主线误选支线。** `src/media/voice.mjs:77` 原用空值合并，将带 sceneId 的 branchId:null 回退为当前支线，主线 beat 误报 BEAT_UNKNOWN。现区分 undefined/null；controlled 生成回归通过。
3. **P1，已关闭：跨章保存覆盖错稿。** `src/studio/app.mjs:22,125` 原先舞台切到 B，编辑器仍是 A，但写入对象已变 B。临时浏览器复现确实覆盖 B。现同步场景/播放项/片段上下文，聚焦编辑先暂停；原样复测 A/B 各自保留，浏览器回归通过。
4. **P2，已关闭：有效字幕区间没有输出帧。** 原 captionCues `{start:.01,end:.02}` 在 24fps 可就绪，但整段文字从未显示。现按选定帧率核对可见采样帧，报 CAPTION_TIMING；旁白相对时钟以整数起始帧计算，避免跨章绝对秒相减误差。24/30fps、1.1s 旁白偏移与重复序列逐帧复核通过。
5. **P2，已关闭：音频后发错误冻结预览。** `src/studio/app.mjs:24` 仅捕获 play promise 拒绝，已 resolve 后的媒体错误令主时钟停住且仍显示播放。原生 Audio 正常播放后注入 404，复现 error.code=4、无提示。现监听活动 source 的 error，停播并提示 AUDIO_PLAYBACK；同一原生复现已关闭。

行号为首次发现位置，修复后可能移位。

## 启发式异味

无需要独立处理的可行动 Fowler 异味。目录为预设工厂，项目保存实际约定；规则、持久化和时序仍各有一个责任方。无需仅为增加抽象而拆分浅层帮助函数。

## 验证范围

最新独立运行 direction/captions/direction-studio **15/15**；先前 Explicit null 与 programme 多参考 controlled 语音各 1/1。额外执行原生 Audio 后发错误前后对照、跨章保存前后对照，以及 24/30fps 非零偏移/重复章节的 **216 帧、12 个字幕出现区间**核对。650ms 音频加载延迟回归保持连续时钟；当前精确字幕的音频绑定、文本一致性、顺序/间隙及 SRT 同源路径也在覆盖内。未运行真实 TTS、重型媒体矩阵或主观风格/听感评价。


追加动作时序绑定复核：`timingProfile` 以本语言显式覆盖优先，null 恢复动作后语音，不影响其他语言；默认草案与各语言 audioHashes 仍由同一 Compiler 消费。独立轻探针通过默认继承、中英不同时间、仅替换英文 take 后英文 TIMING_STALE/中文不变、旧确认回执重试不重新绑定新 take、错误 revision 拒绝和本语言 null 清除手动同步要求。时序弹窗已刷新 revision 的浏览器回归通过；另冻结客户端 snapshot 为旧 revision，后台提交后立即确认，服务端仍拒绝 REVISION_CONFLICT，未写入 timing。未发现新增未关闭问题。
