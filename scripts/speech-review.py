"""Optional independent acceptance tool; never part of the production runtime."""
import json,sys,pathlib,mlx_whisper
index=pathlib.Path(sys.argv[1]);rows=json.loads(index.read_text());output=pathlib.Path(sys.argv[2]);results=[]
for row in rows:
    # Both aspects have separately passed waveform checks; transcribe each actual MP4.
    file=str(pathlib.Path(row['directory'])/'video.mp4')
    r=mlx_whisper.transcribe(file,path_or_hf_repo='mlx-community/whisper-small-mlx',verbose=False)
    results.append({'video':file,'expectedLocale':row['locale'],'detectedLanguage':r['language'],'transcript':r['text'],'segments':r['segments']})
    output.write_text(json.dumps({'method':'MLX Whisper small, actual MP4 audio, no transcript prompt or language hint','status':'PENDING_CONTENT_REVIEW','results':results},ensure_ascii=False,indent=2))
    print(row['locale'],row['aspect'],r['language'],r['text'],flush=True)
