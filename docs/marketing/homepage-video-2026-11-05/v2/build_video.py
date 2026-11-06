from pathlib import Path
import argparse
import json
import subprocess

BASE = Path(__file__).resolve().parent
PREVIOUS = BASE.parent
FFMPEG = 'D:/programs/ffmpeg/bin/ffmpeg.exe'
SPEC = json.loads((PREVIOUS / 'edit.json').read_text(encoding='utf-8'))
START, END = SPEC['trimStart'], SPEC['trimEnd']
DURATION = END - START
PANEL_ASSETS = BASE / 'assets'
CTA_FILE = PREVIOUS / 'assets/cta.png'
CREDIT_FILE = PANEL_ASSETS / 'credit.png'
CREDIT_POSITION = (44, 790)
OUTPUT_STEM = 'vedelo-home-v2'
MIXED_AUDIO = BASE / 'qa/mixed-audio.m4a'
VIDEO_FADE_OUT = True

def run(args):
    subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'warning', *args], check=True)

def envelope(a, b, c, d):
    return f'if(lt(t,{a}),0,if(lt(t,{b}),(1-cos(PI*(t-{a})/{b-a}))/2,if(lt(t,{c}),1,if(lt(t,{d}),(1+cos(PI*(t-{c})/{d-c}))/2,0))))'

def compose(preview=None):
    args = ['-filter_complex_threads', '2', '-i', SPEC['source']]
    panel_specs = [('notebook',10.8,17.65),('details',17.5,22.45),('remember',22.3,27.05),('professions',41.25,48.95),('adapt',48.8,54.30)]
    for name, _, _ in panel_specs:
        args += ['-loop','1','-framerate','30','-i',str(PANEL_ASSETS/f'{name}.png')]
    for item in SPEC['ui']:
        args += ['-i',str(PREVIOUS.parent/'intro-video-2026-10-31'/item['file'])]
    graphics = [dict(g) for g in SPEC['graphics']]
    graphics[0]['end'] = 4.6
    for g in graphics: g['path'] = str(CTA_FILE if g['file']=='cta.png' else PREVIOUS/'assets'/g['file'])
    for name,a,b,x,y in [('expert',4.8,10.3,44,270),('origin',31.2,35.5,44,300),('credit',101.8,109.3,*CREDIT_POSITION)]:
        graphics.append(dict(path=str(CREDIT_FILE if name=='credit' else PANEL_ASSETS/f'{name}.png'),start=a,end=b,x=x,y=y))
    for item in graphics:
        args += ['-loop','1','-framerate','30','-i',item['path']]
    pan = f'({envelope(10.8,11.35,26.45,27.0)})+({envelope(41.25,41.8,78.55,79.15)})'
    filters = [f"[0:v]fps=30,hflip,setsar=1,eq=contrast=1.025:brightness=0.006:saturation=1.02,pad=2560:1080:0:0:color=0xf3f1eb,crop=1920:1080:x='640*({pan})':y=0[v0]"]
    current = 'v0'
    for i, (name,a,b) in enumerate(panel_specs, 1):
        filters.append(f'[{i}:v]format=rgba,trim=duration={b-a},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.18:alpha=1,setpts=PTS+{a}/TB[p{i}]')
        filters.append(f"[{current}][p{i}]overlay=x='1920-864*({pan})':y=0:eof_action=pass:repeatlast=0:enable='between(t,{a},{b})'[v{i}]")
        current = f'v{i}'
    for i,item in enumerate(SPEC['ui'],6):
        hold=item['duration']-item['holdFrom']
        filters.append(f"[{i}:v]fps=30,trim=duration={item['holdFrom']},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={hold},trim=duration={item['duration']},format=rgba,fade=t=in:st=0:d=0.16:alpha=1,setpts=PTS+{item['start']}/TB,setsar=1[u{i}]")
        filters.append(f"[{current}][u{i}]overlay=x='1920-864*({pan})':y=0:eof_action=pass:repeatlast=0:enable='between(t,{item['start']},{item['start']+item['duration']})'[v{i}]")
        current=f'v{i}'
    for i,g in enumerate(graphics,9):
        dur=g['end']-g['start']
        filters.append(f"[{i}:v]format=rgba,trim=duration={dur},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st={dur-.25}:d=0.25:alpha=1,setpts=PTS+{g['start']}/TB[g{i}]")
        filters.append(f"[{current}][g{i}]overlay=x={g['x']}:y={g['y']}:eof_action=pass:repeatlast=0:enable='between(t,{g['start']},{g['end']})'[v{i}]")
        current=f'v{i}'
    if preview is not None:
        filters.append(f'[{current}]trim=start={preview}:duration=0.04,setpts=PTS-STARTPTS,format=rgb24[outv]')
        args += ['-filter_complex',';'.join(filters),'-map','[outv]','-an','-frames:v','1',str(BASE/'qa'/f'preview-{preview:.2f}.png')]
    else:
        ending = f'fade=t=out:st={DURATION-.25}:d=0.25,' if VIDEO_FADE_OUT else ''
        filters.append(f'[{current}]trim=start={START}:end={END},setpts=PTS-STARTPTS,{ending}format=yuv420p[outv]')
        args += ['-filter_complex',';'.join(filters),'-map','[outv]','-an','-c:v','libx264','-preset','medium','-crf','21','-maxrate','6M','-bufsize','12M','-threads','6','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart','-map_metadata','-1','-t',str(DURATION),'-progress',str(BASE/'qa/render-progress.txt'),str(BASE/'qa/picture-1080p.mp4')]
    run(args)

def mix():
    chain = (f'[0:a]atrim=duration={DURATION},asetpts=PTS-STARTPTS,asplit=2[voice][control];'
             f'[1:a]atrim=duration={DURATION},asetpts=PTS-STARTPTS,highpass=f=70,lowpass=f=9500,loudnorm=I=-28:TP=-8:LRA=8,aresample=48000,afade=t=in:st=0:d=1.2,afade=t=out:st={DURATION-2.2}:d=2.2[music];'
             '[music][control]sidechaincompress=threshold=0.035:ratio=2:attack=25:release=550:makeup=1[ducked];'
             f'[voice][ducked]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.78:level=false:latency=true,aresample=48000[out]')
    run(['-i',str(PREVIOUS/'vedelo-home-1080p.mp4'),'-i',str(PANEL_ASSETS/'life-of-riley.mp3'),'-filter_complex',chain,'-map','[out]','-c:a','aac','-b:a','160k','-t',str(DURATION),str(MIXED_AUDIO)])

def export():
    run(['-i',str(BASE/'qa/picture-1080p.mp4'),'-i',str(MIXED_AUDIO),'-map','0:v','-map','1:a','-c','copy','-t',str(DURATION),'-map_metadata','-1','-movflags','+faststart',str(BASE/f'{OUTPUT_STEM}-1080p.mp4')])
    run(['-i',str(BASE/f'{OUTPUT_STEM}-1080p.mp4'),'-vf','scale=1280:720:flags=lanczos','-c:v','libx264','-preset','medium','-crf','23','-maxrate','3M','-bufsize','6M','-threads','6','-c:a','copy','-movflags','+faststart','-map_metadata','-1',str(BASE/f'{OUTPUT_STEM}-720p.mp4')])

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['preview','render','mix','export'])
    parser.add_argument('--time',type=float,default=13)
    args=parser.parse_args()
    if args.action=='preview':compose(args.time)
    elif args.action=='render':compose()
    elif args.action=='mix':mix()
    else:export()
