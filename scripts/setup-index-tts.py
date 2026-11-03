"""Install the pinned official IndexTTS engine in an isolated local environment."""
import argparse
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
COMMIT = 'd9e41aac89fd00b3d71497fddb287b7f24613712'
REPOS = {
    'IndexTeam/IndexTTS-2.5': 'c39ce5ba981572cb187443877ff559dfb246ce63',
    'facebook/w2v-bert-2.0': 'da985ba0987f70aaeb84a80f2851cfac8c697a7b',
    'funasr/campplus': 'e4b6ede7ce16997aff4ae69fbca1f0175e2afede',
    'nvidia/bigvgan_v2_22khz_80band_256x': '633ff708ed5b74903e86ff1298cf4a98e921c513',
}

def warm_normalizer(home, python):
    # The official normalizer builds FST caches on first use. Do that before
    # loading the speech weights: compiling both together exceeds an 8 GiB CPU
    # host even though steady-state synthesis fits. Upstream code is unchanged.
    print(json.dumps({'phase': 'normalizer-cache'}), flush=True)
    subprocess.run([str(python), '-c',
                    'from indextts.utils.front import TextNormalizer; '
                    'normalizer = TextNormalizer(enable_glossary=True); normalizer.load()'],
                   cwd=home, check=True, timeout=300)

def install_models(home, source):
    from huggingface_hub import HfApi, hf_hub_download
    mapping = {'facebook/w2v-bert-2.0': 'AI-ModelScope/w2v-bert-2.0', 'funasr/campplus': 'iic/speech_campplus_sv_zh-cn_16k-common'}
    if source == 'auto':
        def probe(host):
            start = time.monotonic()
            url = (f'https://www.modelscope.cn/models/IndexTeam/IndexTTS-2.5/resolve/master/gpt.pth' if host == 'modelscope' else
                   f'https://huggingface.co/IndexTeam/IndexTTS-2.5/resolve/{REPOS["IndexTeam/IndexTTS-2.5"]}/gpt.pth')
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=0-1048575'}), timeout=12) as response:
                    response.read(1048576)
                return time.monotonic() - start, host
            except Exception:
                return float('inf'), host
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            source = min(pool.map(probe, ['huggingface', 'modelscope']))[1]
    print(json.dumps({'source': source, 'identity': 'Pinned HuggingFace revisions; every downloaded file verified'}), flush=True)
    model = home / 'checkpoints'
    tasks = []
    metadata = {repo: {f.rfilename: f for f in HfApi().model_info(repo, revision=revision, files_metadata=True).siblings}
                for repo, revision in REPOS.items()}
    for name in metadata['IndexTeam/IndexTTS-2.5']:
        if not name.startswith(('.', 'qwen')) and not name.lower().endswith(('.md', '.png', '.jpg')):
            tasks.append(('IndexTeam/IndexTTS-2.5', name, model))
    for name in ['config.json', 'preprocessor_config.json', 'model.safetensors']:
        tasks.append(('facebook/w2v-bert-2.0', name, model / 'hf_cache/w2v-bert-2.0'))
    tasks.append(('funasr/campplus', 'campplus_cn_common.bin', model / 'hf_cache'))
    for name in ['config.json', 'bigvgan_generator.pt']:
        tasks.append(('nvidia/bigvgan_v2_22khz_80band_256x', name, model / 'hf_cache/bigvgan'))
    def get(row):
        repo, filename, destination = row
        expected = metadata[repo][filename]
        path = destination / filename
        def verified():
            if not path.is_file() or path.stat().st_size != expected.size:
                return False
            digest = hashlib.sha256() if expected.lfs else hashlib.sha1()
            if not expected.lfs:
                digest.update(f'blob {expected.size}\0'.encode())
            with path.open('rb') as file:
                for chunk in iter(lambda: file.read(4 * 1024 * 1024), b''):
                    digest.update(chunk)
            return digest.hexdigest() == (expected.lfs.sha256 if expected.lfs else expected.blob_id)
        used = 'existing'
        if not verified():
            providers = [source, 'huggingface' if source == 'modelscope' else 'modelscope']
            for provider in providers:
                try:
                    if provider == 'modelscope':
                        from modelscope.hub.file_download import model_file_download
                        model_file_download(mapping.get(repo, repo), filename, revision='master', local_dir=str(destination))
                    else:
                        hf_hub_download(repo, filename, revision=REPOS[repo], local_dir=destination)
                    if not verified():
                        raise RuntimeError('Downloaded weight differs from pinned upstream content: ' + filename)
                    used = provider
                    break
                except Exception as error:
                    print(json.dumps({'downloadFailed': filename, 'source': provider, 'errorType': type(error).__name__}), flush=True)
            else:
                raise RuntimeError('Could not download and verify ' + filename)
        print(json.dumps({'downloaded': filename, 'bytes': path.stat().st_size, 'source': used, 'verified': True}), flush=True)
        return {'repo': repo, 'revision': REPOS[repo], 'file': filename, 'bytes': path.stat().st_size,
                'sha256': expected.lfs.sha256 if expected.lfs else None, 'gitBlob': expected.blob_id, 'source': used}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        files = list(pool.map(get, tasks))
    sample = home / 'examples/voice_04.wav'
    sample.parent.mkdir(parents=True, exist_ok=True)
    url = 'https://huggingface.co/spaces/IndexTeam/IndexTTS-2-Demo/resolve/main/examples/voice_04.wav'
    if not sample.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            sample.write_bytes(response.read())
    record = {'engine': 'IndexTTS-2.5', 'upstreamCommit': COMMIT, 'modelRevisions': REPOS, 'files': files,
              'reference': {'source': url, 'sha256': hashlib.sha256(sample.read_bytes()).hexdigest()}}
    (home / '.river-install.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'status': 'installed', 'modelBytes': sum(r['bytes'] for r in files)}), flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', default=os.environ.get('RIVER_INDEXTTS_HOME', str(ROOT / '.river/index-tts')))
    parser.add_argument('--models-only', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--warmup-only', action='store_true', help='Prepare official text-normalizer caches in an already installed environment.')
    parser.add_argument('--source', choices=['auto', 'huggingface', 'modelscope'], default='auto')
    args = parser.parse_args()
    home = Path(args.home).resolve()
    python = home / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if args.warmup_only:
        warm_normalizer(home, python)
        return
    if args.models_only:
        install_models(home, args.source)
        return
    if not (home / '.river-upstream.json').exists():
        if home.exists() and any(home.iterdir()):
            raise RuntimeError('Choose an empty engine directory; existing files will not be overwritten.')
        url = f'https://codeload.github.com/index-tts/index-tts/tar.gz/{COMMIT}'
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for member in archive.getmembers():
                if not member.isfile():
                    continue
                name = Path(*Path(member.name).parts[1:])
                if name.is_absolute() or '..' in name.parts:
                    raise RuntimeError('Invalid upstream archive path')
                target = home / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.extractfile(member).read())
        (home / '.river-upstream.json').write_text(json.dumps({'commit': COMMIT, 'source': url}))
    pinned = json.loads((home / '.river-upstream.json').read_text())
    if pinned['commit'] != COMMIT:
        raise RuntimeError('Installed engine revision differs; use a new --home for this version.')
    subprocess.run(['uv', 'sync', '--project', str(home), '--no-dev', '--locked'], check=True)
    warm_normalizer(home, python)
    subprocess.run([str(python), str(Path(__file__).resolve()), '--home', str(home), '--source', args.source, '--models-only'], check=True)

if __name__ == '__main__':
    main()
