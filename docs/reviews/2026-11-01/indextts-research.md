# IndexTTS 官方接入核对

核对时间：2026-11-02（Asia/Shanghai）。本记录是官方源码与模型元数据研究，未安装环境、下载大权重或执行语音推理；不能据此声明 Apple Silicon 的成片语音已验收。

## 版本与本机路径

用户指定文档当前默认模型为 **IndexTTS-2.5**，支持中文、英文、日文、西班牙文、阿拉伯文，提供参考音色、独立情绪控制、语速和发音标注。[官方中文说明](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/docs/README_zh.md)

本次固定源码为 [`d9e41aac89fd00b3d71497fddb287b7f24613712`](https://github.com/index-tts/index-tts/commit/d9e41aac89fd00b3d71497fddb287b7f24613712)，提交时间 2026-09-29。官方包元数据仍为 `2.0.0`；识别 2.5 应核对源码提交、`infer_v2_5`、配置 `version:2.5` 及模型 revision，不以 pip 包版本替代。[官方依赖](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/pyproject.toml)、[模型配置](https://huggingface.co/IndexTeam/IndexTTS-2.5/blob/c39ce5ba981572cb187443877ff559dfb246ce63/config.yaml)

官方 `IndexTTS2` 初始化代码显式选择 CUDA、XPU、MPS，再回退 CPU。自动选 MPS 时关闭 BF16 与 CUDA kernel；CPU 也用全精度。模型卡的推荐环境仍写 NVIDIA、约 6 GB 显存。**代码中的 MPS 路径不等于本机算子、速度和声音质量已通过实测。** [推理实现](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/indextts/infer_v2_5.py)、[官方模型卡](https://huggingface.co/IndexTeam/IndexTTS-2.5/blob/c39ce5ba981572cb187443877ff559dfb246ce63/README.md)

建议直接使用官方代码和独立 uv 环境，Python 3.11，运行 `uv sync`，不加 `--all-extras`。依赖要求为 Python `>=3.10,<3.12`、PyTorch/torchaudio `2.8.*`、transformers `4.52.1`；Mac 的文本规范化包为 `wetext`。`--all-extras` 包含 flash-attn、NVIDIA runtime、DeepSpeed 等，Mac 接入没有必要安装它们。[依赖与平台标记](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/pyproject.toml)

## Python 调用契约

```python
from indextts.infer_v2_5 import IndexTTS2

tts = IndexTTS2(
    cfg_path="checkpoints/config.yaml",
    model_dir="checkpoints",
    device="mps",                 # 实际探测后选择；CPU 使用 "cpu"
    use_bf16=False,
    use_cuda_kernel=False,
    use_deepspeed=False,
    use_qwen_emo=False,
)

# 一个批次只构造一次 tts，然后依次调用，复用同一参考音色缓存。
tts.infer(
    spk_audio_prompt="reference.wav",
    text="这里是讲稿正文。",
    lang="ZH",                    # 当前产品另映射 en-US→EN、ja-JP→JA
    output_path="narration.wav",
    duration_factor=1.0,
    use_random=False,
)
```

`infer` 还支持 `emo_audio_prompt`、`emo_alpha`、8 维 `emo_vector`、`use_emo_text`、`emo_text`、`interval_silence`、`max_text_tokens_per_segment`。参考音频默认最多取前 15 秒；输出为 22,050 Hz PCM WAV。保持同一对象和参考文件可复用 speaker/style 条件。`HF_HUB_CACHE` 在该模块导入时被设为相对 `./checkpoints/hf_cache`，桥接进程应固定 cwd，模型/输出路径使用绝对路径。[官方调用与缓存实现](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/indextts/infer_v2_5.py)

| 控制 | 官方含义与接入选择 |
| --- | --- |
| 情绪向量 | 顺序为高兴、愤怒、悲伤、害怕、厌恶、忧郁、惊讶、平静。可直接使用，无须加载 QwenEmotion；应允许 Agent 按内容调整，避免把“老手”固定成某种夸张情绪 |
| 文字情绪 | 构造时必须 `use_qwen_emo=True`；否则传 `use_emo_text=True` 会报错。额外 Qwen 权重约 1.208 GB |
| 情绪强度 | `emo_alpha` 为 0–1；对显式向量会先缩放。官方文本情绪例子建议约 0.6 或更低，不能把该例值当作所有讲解的最佳值 |
| 语速 | `duration_factor` 范围 0.5–2；大于 1 变慢，小于 1 变快，界面若显示“速度倍数”需换算，避免方向相反 |
| 发音 | 支持 `<文字\|发音>`；中文拼音、英文 CMU 音素、日文假名。发音文本应与屏幕字幕分开，避免把控制标记印到成片 |
| 分段 | 内部默认 `max_text_tokens_per_segment=120`，段间默认 200 ms 静音。平台以完整意思和行动节点分段，无须每句话冷启动模型 |

以上控制依据为[官方使用说明](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/docs/README_zh.md)及[推理参数实现](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/indextts/infer_v2_5.py)。

## 下载集合与尺寸

以下为 Hugging Face API 公开文件尺寸，未实际下载权重。主模型固定 revision `c39ce5ba981572cb187443877ff559dfb246ce63`。完整主仓库 5,491,182,363 bytes，其中 QwenEmotion 子目录 1,208,014,946 bytes；不使用文字情绪可略过该子目录。[主仓库元数据](https://huggingface.co/api/models/IndexTeam/IndexTTS-2.5/tree/main?recursive=true&expand=false&limit=1000)

| 文件/集合 | Bytes | 用途 |
| --- | ---: | --- |
| `gpt.pth` | 3,259,599,833 | GPT |
| `codec.pth` | 607,290,935 | 2.5 EnhancedCodec |
| `s2mel.pth` | 414,908,601 | speech-to-mel |
| 主仓库除 Qwen 的全部文件 | 4,283,167,417 | 含配置、tokenizer、情绪/音色矩阵及说明 |
| w2v-bert `model.safetensors` + config + preprocessor | 2,322,065,885 | Transformers 实际使用文件 |
| CAMPPlus `campplus_cn_common.bin` | 28,036,335 | 音色条件 |
| BigVGAN generator + config | 449,229,576 | 声码器 |
| MaskGCT `semantic_codec/model.safetensors` | 177,183,712 | 共享下载 helper 仍下载；2.5 的直接初始化不读取它 |

辅助数据由各模型自己的 API 核对：[w2v-bert](https://huggingface.co/api/models/facebook/w2v-bert-2.0/tree/main?recursive=true&expand=false&limit=1000)、[CAMPPlus](https://huggingface.co/api/models/funasr/campplus/tree/main?recursive=true&expand=false&limit=1000)、[BigVGAN](https://huggingface.co/api/models/nvidia/bigvgan_v2_22khz_80band_256x/tree/main?recursive=true&expand=false&limit=1000)、[MaskGCT](https://huggingface.co/api/models/amphion/MaskGCT/tree/main?recursive=true&expand=false&limit=1000)。

预取主模型（不含 Qwen）及上述实际需要的辅助文件约 **7.082 GB**。如果直接调用官方共享 `ensure_models_available()`，它会整仓取 w2v-bert（另带 2.329 GB 的 `conformer_shaw.pt`）和旧 MaskGCT 文件；连同完整主仓库合计约 **10.797 GB**。BigVGAN 不需要整仓的训练优化器或另一份 generator；MaskGCT 也不需要其余模型。预取完整的 w2v/CAMPPlus/BigVGAN 必需文件后，官方 2.5 构造器不会触发辅助下载，无须更换推理实现。[下载 helper](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/indextts/utils/model_download.py)、[2.5 加载逻辑](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/indextts/infer_v2_5.py)

辅助仓库 revision：w2v-bert `da985ba0987f70aaeb84a80f2851cfac8c697a7b`；CAMPPlus `e4b6ede7ce16997aff4ae69fbca1f0175e2afede`；BigVGAN `633ff708ed5b74903e86ff1298cf4a98e921c513`；MaskGCT `265c6cef07625665d0c28d2faafb1415562379dc`。对应原始 API 响应和尺寸汇总保存在 [research-upstream](../../../artifacts/indextts-review-20261101/research-upstream/inventory-summary.json)。

## 默认参考声线与验收建议

官方示例音频现在按需下载，来源为 IndexTeam 官方 Demo 的 `examples/voice_*.wav`。中文 cases 使用 `voice_03`、`voice_04`、`voice_05`；`voice_01` 在例子中用于英文。可先分别试听中文样本再选默认值，不能仅凭文件名断言它像专业讲牌老手。无需下载全部 demo 音频。[官方 cases](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/examples/cases.jsonl)、[样本下载实现](https://github.com/index-tts/index-tts/blob/d9e41aac89fd00b3d71497fddb287b7f24613712/indextts/utils/examples_downloader.py)、[voice_04 直接来源](https://huggingface.co/spaces/IndexTeam/IndexTTS-2-Demo/resolve/main/examples/voice_04.wav)

建议导演台只暴露默认 IndexTTS、参考音色、情绪与语速；Agent 同样使用结构化调用。模型路径、Python 环境、设备和依赖探测留在配置/诊断，避免每段旁白都重复配置。一个批次加载一次官方模型，成功音频仍走现有音频导入、哈希、时长与失效检查。

真实验收应先生成包含 all-in/nuts、牌面字母、金额和百分比的短段，再批量生成持续第一视角讲解；检查音频非静音、语言/内容、无尾部截断、跨段音色与停顿，最后检查编码后视频。ASR 可以发现漏词与数字错误，但不能证明情绪自然或像真人。若 MPS 推理失败，应保留真实错误，测试官方 CPU 路径或配置官方 CUDA 部署；不能把别的 TTS 成果标成 IndexTTS。
