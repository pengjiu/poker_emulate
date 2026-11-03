"""Batch bridge to official IndexTTS2.5; structured inputs stay out of shell code."""
import argparse
import json
import os
from pathlib import Path
import sys
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--request', required=True)
args = parser.parse_args()
request = json.loads(Path(args.request).read_text())
home = Path(request['home']).resolve()
sys.path.insert(0, str(home))
os.chdir(home)
os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
# Dynamic decoder lengths otherwise compile large MPSGraph matmul caches on
# Apple Silicon. Keep the same model/precision and use PyTorch's Metal kernel.
if sys.platform == 'darwin':
    os.environ.setdefault('PYTORCH_MPS_PREFER_METAL', '1')
    if not any(key in os.environ for key in ('PYTORCH_MPS_HIGH_WATERMARK_RATIO', 'PYTORCH_MPS_LOW_WATERMARK_RATIO')):
        os.environ['PYTORCH_MPS_HIGH_WATERMARK_RATIO'] = '1.0'
        os.environ['PYTORCH_MPS_LOW_WATERMARK_RATIO'] = '0.8'
import torch
from indextts.infer_v2_5 import IndexTTS2

runtime = {'torch': torch.__version__, 'maxTextTokensPerSegment': 120,
           'mps': {key: os.environ.get(key) for key in ('PYTORCH_MPS_PREFER_METAL', 'PYTORCH_MPS_HIGH_WATERMARK_RATIO', 'PYTORCH_MPS_LOW_WATERMARK_RATIO')}}
print('RIVER_VOICE ' + json.dumps({'phase': 'preparing', 'runtime': runtime}), flush=True)
started = time.monotonic()
tts = IndexTTS2(cfg_path=str(home / 'checkpoints/config.yaml'), model_dir=str(home / 'checkpoints'),
                use_bf16=False, use_cuda_kernel=False, use_deepspeed=False, use_qwen_emo=False)
results = []
for index, clip in enumerate(request['clips']):
    print('RIVER_VOICE ' + json.dumps({'phase': 'synthesizing', 'index': index, 'total': len(request['clips']), 'beatId': clip['beatId']}), flush=True)
    options = clip['settings']
    tts.infer(spk_audio_prompt=clip.get('reference', request['reference']), text=clip['spokenText'], lang=request['lang'],
              output_path=clip['output'], emo_vector=options['emotion'], emo_alpha=options['emotionStrength'],
              duration_factor=1 / options['speed'], use_random=False, verbose=False,
              interval_silence=200, max_text_tokens_per_segment=120)
    results.append({'beatId': clip['beatId'], 'output': clip['output']})
    if str(tts.device).startswith('mps'):
        torch.mps.synchronize()
        torch.mps.empty_cache()
Path(request['result']).write_text(json.dumps({'engine': 'IndexTTS-2.5', 'device': str(tts.device),
                                             'seconds': time.monotonic() - started, 'clips': results,
                                             'runtime': runtime}, ensure_ascii=False, indent=2) + '\n')
print('RIVER_VOICE ' + json.dumps({'phase': 'complete', 'index': len(results), 'total': len(results)}), flush=True)
