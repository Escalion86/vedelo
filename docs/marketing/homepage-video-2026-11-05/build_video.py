from pathlib import Path
import argparse
import json
import subprocess

BASE = Path(__file__).resolve().parent
FFMPEG = 'D:/programs/ffmpeg/bin/ffmpeg.exe'
spec = json.loads((BASE / 'edit.json').read_text(encoding='utf-8'))
SOURCE = spec['source']
UI = BASE.parent / 'intro-video-2026-10-31'
START, END = spec['trimStart'], spec['trimEnd']
DURATION = END - START

def execute(args):
    subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'warning', *args], cwd=BASE, check=True)

def pan_expression():
    p = spec['presenterPan']
    ease_in = f'(1-cos(PI*(t-{p["inStart"]})/{p["inEnd"]-p["inStart"]}))/2'
    ease_out = f'(1+cos(PI*(t-{p["outStart"]})/{p["outEnd"]-p["outStart"]}))/2'
    return f'if(lt(t,{p["inStart"]}),0,if(lt(t,{p["inEnd"]}),{ease_in},if(lt(t,{p["outStart"]}),1,if(lt(t,{p["outEnd"]}),{ease_out},0))))'

def compose(preview=None):
    args = ['-i', SOURCE]
    for item in spec['ui']:
        args += ['-i', str(UI / item['file'])]
    for item in spec['graphics']:
        args += ['-loop', '1', '-framerate', '30', '-i', str(BASE / 'assets' / item['file'])]
    pan = pan_expression()
    filters = [f"[0:v]fps=30,hflip,setsar=1,eq=contrast=1.025:brightness=0.006:saturation=1.02,pad=2560:1080:0:0:color=0xf3f1eb,crop=1920:1080:x='640*({pan})':y=0[v0]"]
    current = 'v0'
    for i, item in enumerate(spec['ui'], 1):
        hold = item['duration'] - item['holdFrom']
        filters.append(f"[{i}:v]fps=30,trim=duration={item['holdFrom']},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={hold:.3f},trim=duration={item['duration']},setpts=PTS+{item['start']}/TB,setsar=1[u{i}]")
        nxt = f'v{i}'
        filters.append(f"[{current}][u{i}]overlay=x='1920-864*({pan})':y=0:eof_action=pass:repeatlast=0:enable='between(t,{item['start']},{item['start']+item['duration']})'[{nxt}]")
        current = nxt
    for j, item in enumerate(spec['graphics'], 4):
        dur = item['end'] - item['start']
        filters.append(f"[{j}:v]format=rgba,trim=duration={dur},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.35:alpha=1,fade=t=out:st={dur-.35}:d=0.35:alpha=1,setpts=PTS+{item['start']}/TB[g{j}]")
        nxt = f'v{j}'
        filters.append(f"[{current}][g{j}]overlay=x={item['x']}:y={item['y']}:eof_action=pass:repeatlast=0:enable='between(t,{item['start']},{item['end']})'[{nxt}]")
        current = nxt
    if preview is not None:
        filters.append(f'[{current}]trim=start={preview}:duration=0.05,setpts=PTS-STARTPTS,format=rgb24[outv]')
        args += ['-filter_complex', ';'.join(filters), '-map', '[outv]', '-an', '-frames:v', '1', str(BASE / 'qa' / f'preview-{preview:.2f}.png')]
    else:
        filters.append(f'[{current}]trim=start={START}:end={END},setpts=PTS-STARTPTS,fade=t=out:st={DURATION-.25}:d=0.25,format=yuv420p[outv]')
        filters.append(f'[0:a]atrim=start={START}:end={END},asetpts=PTS-STARTPTS,highpass=f=65,loudnorm=I=-16:TP=-2.5:LRA=9:linear=false,afade=t=in:st=0:d=0.08,afade=t=out:st={DURATION-.25}:d=0.25,aresample=48000[outa]')
        args += ['-filter_complex', ';'.join(filters), '-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M', '-threads', '6', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', '-map_metadata', '-1', '-metadata:s:v:0', 'rotate=0', '-t', str(DURATION), '-progress', str(BASE / 'qa/render-progress.txt'), str(BASE / 'vedelo-home-1080p.mp4')]
    execute(args)

def poster():
    execute(['-ss', '0.55', '-i', SOURCE, '-i', str(BASE / 'assets/poster.png'), '-filter_complex', '[0:v]hflip,setsar=1,eq=contrast=1.025:brightness=0.006:saturation=1.02[v];[v][1:v]overlay=44:180[out]', '-map', '[out]', '-frames:v', '1', '-q:v', '2', str(BASE / 'vedelo-home-poster.jpg')])

parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['preview', 'render', 'poster'])
parser.add_argument('--time', type=float, default=58)
args = parser.parse_args()
if args.action == 'preview': compose(args.time)
elif args.action == 'render': compose()
elif args.action == 'poster': poster()
