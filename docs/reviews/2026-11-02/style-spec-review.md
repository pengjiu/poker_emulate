# Spec 轴审查：讲解模式与连续制作

固定基线：`dist/river-studio-v1.1.0.tgz`，解包于 `artifacts/style-patterns-20261102/baseline-1.1.0/`；无 Git 提交列表。规格来源：用户本轮“开放通用模式、skill 稳定执行、各模块适配并根因修复”及 [P01–P10](../../STYLE_MODES_REVIEW.md)。审查目录为 src、scripts、bin、locales、tests 和 poker-director，未修改产品文件。

## 发现与关闭

1. **P1，已关闭：单场景覆盖的预检与实际渲染检查了不同对象。** P04 要求“选单场景退出序列”，P09 要求实际媒体正确。原 `src/compiler.mjs:83` 在预检前合并 project.output，保留 sequence；实际 compileProject 对原始 scene/branch 覆盖则退出序列。复现：fixture 的 sequence 只播放无旁白问题的 side-pots，再指定 sceneId=button-vs-blind；预检 ready:true，实际计划却含 AUDIO_MISSING。renderVideo 仅依据前者放行，会把未配音目标导出，反向还会误拦完整目标。已改为统一通过 selectedRoutes 解析，补双向回归。复测统一选择路径：预检与计划均报告 AUDIO_MISSING，ready:false。

2. **P2，已关闭：显式主线配音被当前支线覆盖。** P04/P05 要求指定场景/分支与真实声源相符。原 `src/media/voice.mjs:77` 使用 nullish 回退，sceneId 与 branchId:null 同传时仍选择当前支线。复现：当前 check-line，指定主线的 bet，得到 BEAT_UNKNOWN。已改为仅 undefined 回退；复测找到主线 bet 并按该段缺少旁白返回 NARRATION，未启动 TTS。主任务另补受控生成回归。

3. **P2，已关闭：合法的极短字幕区间可在全部视频帧中消失。** P06 要求字幕不破坏信息呈现，P09 要求实际输出正确。初版精确字幕只要求正时长；24fps 下 `[.01,.02)` 的“先”通过校验且进入 SRT，却从未出现在任何输出帧。`src/compiler.mjs:55–58` 已补可见帧守卫；复测 ready:false、CAPTION_TIMING。非零旁白偏移加严格一帧字幕也已穷举通过：渲染用整数帧差求 elapsed，避免浮点相减抹去字幕。新增 audioHash 绑定与 captions.set 确认，防止同文案换音频后静默沿用旧时间；错误绑定复测 CAPTION_STALE，改字保留明确待重配草稿。

4. **P2，已关闭：时序弹窗把未配置状态保存成并行播放。** P03/P06 要求动作与口播保持同步。原 `src/studio/app.mjs:44` 对 timingProfile=null 的段落填入新造 actions=[0,.7,…]、narration=0；只保存字幕也会将旁白从两个 check 后的 1.4167 秒提前至 0。已改为展示真实 null，仅显式“建立动作时序草案”才填模板且不自动保存。独立执行真实 editTiming 保存回调及 Director 内存探针后，旁白起点保持 1.4167 秒、issues:[]；真实浏览器往返及建草案不改 revision 的回归通过。

## 范围与结论

未发现额外未决产品缺陷或无依据的范围扩张。目录、项目快照、场景覆盖、开放 profile、时序、顺序和多声源通过原有六方法工作，没有新增执行服务。研究资料明确区分正文、结构、元数据与偏好证据，未把流量代理当留存因果证明。

最终追加核对：多语言时序按 audioHash 独立失效；静默动作与旧未定时旁白不误拦，timing:null 只恢复本语言普通顺序；旧弹窗不能确认新修订。

轻量检查：原始问题与修复复现；direction/direction-studio 12 项通过，包括字幕同钟、改字重配、650ms 音频加载冻结及跨动作仅一个音源；非零偏移逐帧探针；冷启动讲稿、项目和报告。未进行真实 TTS、大型渲染、真人听感或观众测试。本审查不替代 P05/P09/P10 的最终媒体、回归和发布归档；这些由主任务继续验收。

Spec 发现 4 项（P1×1、P2×3），均已关闭；当前未决 0。
