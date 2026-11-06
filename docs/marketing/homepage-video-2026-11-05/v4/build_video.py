from pathlib import Path
import argparse
import importlib.util
import json
import re
import subprocess

SOURCE_DIR = Path(__file__).resolve().parent.parent
OUTPUT = Path('C:/Users/Escal/Downloads/vedelo-video-v4')
FFMPEG = 'D:/programs/ffmpeg/bin/ffmpeg.exe'
FPS, BODY_FRAMES = 30, 3265
INTRO, OUTRO, FADE = 3.0, 3.8, 0.8
OFFSET = INTRO - FADE
BODY_DURATION = BODY_FRAMES / FPS
OUTRO_START = OFFSET + BODY_DURATION - FADE
TOTAL_FRAMES = 90 + BODY_FRAMES + 114 - 48
TOTAL = TOTAL_FRAMES / FPS
OUTPUT.mkdir(exist_ok=True)
(OUTPUT/'qa').mkdir(exist_ok=True)

def run(args):
    subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','warning',*args],check=True)

def body():
    spec=importlib.util.spec_from_file_location('v2_edit',SOURCE_DIR/'v2/build_video.py')
    edit=importlib.util.module_from_spec(spec);spec.loader.exec_module(edit)
    edit.BASE=OUTPUT
    edit.CTA_FILE=SOURCE_DIR/'v3/assets/cta.png'
    edit.CREDIT_FILE=SOURCE_DIR/'v3/assets/credit.png'
    edit.CREDIT_POSITION=(28,26)
    edit.VIDEO_FADE_OUT=False
    edit.compose()

def frame():
    title=str(OUTPUT/'vedelo-home-poster.png')
    graph=(f'[0:v]fps=30,trim=end_frame=90,setpts=PTS-STARTPTS,settb=AVTB,format=yuv420p[a];'
           f'[1:v]fps=30,trim=end_frame={BODY_FRAMES},setpts=PTS-STARTPTS,settb=AVTB,format=yuv420p[b];'
           '[2:v]fps=30,trim=end_frame=114,setpts=PTS-STARTPTS,settb=AVTB,format=yuv420p[c];'
           f'[a][b]xfade=transition=fade:duration={FADE}:offset={OFFSET}[ab];'
           f'[ab][c]xfade=transition=fade:duration={FADE}:offset={OUTRO_START},fps=30,trim=end_frame={TOTAL_FRAMES},format=yuv420p[out]')
    run(['-filter_complex_threads','2','-loop','1','-framerate','30','-i',title,'-i',str(OUTPUT/'qa/picture-1080p.mp4'),'-loop','1','-framerate','30','-i',title,'-filter_complex',graph,'-map','[out]','-an','-c:v','libx264','-preset','medium','-crf','20','-maxrate','6M','-bufsize','12M','-threads','6','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-frames:v',str(TOTAL_FRAMES),'-movflags','+faststart','-progress',str(OUTPUT/'qa/framing-progress.txt'),str(OUTPUT/'qa/branded-picture-1080p.mp4')])

def audio():
    graph=(f'[0:a]atrim=duration=108.85,asetpts=PTS-STARTPTS,adelay={int(OFFSET*1000)}:all=1,apad,atrim=duration={TOTAL},asplit=2[voice][control];'
           f'[1:a]atrim=duration={TOTAL},asetpts=PTS-STARTPTS,highpass=f=70,lowpass=f=9500,loudnorm=I=-28:TP=-8:LRA=8,aresample=48000,afade=t=in:st=0:d=1.2,afade=t=out:st={TOTAL-2.2}:d=2.2[music];'
           '[music][control]sidechaincompress=threshold=0.035:ratio=2:attack=25:release=550:makeup=1[ducked];'
           '[voice][ducked]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.78:level=false:latency=true,aresample=48000[out]')
    run(['-i',str(SOURCE_DIR/'vedelo-home-1080p.mp4'),'-i',str(SOURCE_DIR/'v2/assets/life-of-riley.mp3'),'-filter_complex',graph,'-map','[out]','-c:a','aac','-b:a','160k','-t',str(TOTAL),str(OUTPUT/'qa/mixed-audio.m4a')])

def export():
    run(['-i',str(OUTPUT/'qa/branded-picture-1080p.mp4'),'-i',str(OUTPUT/'qa/mixed-audio.m4a'),'-map','0:v','-map','1:a','-c','copy','-t',str(TOTAL),'-map_metadata','-1','-movflags','+faststart',str(OUTPUT/'vedelo-home-v4-1080p.mp4')])
    run(['-i',str(OUTPUT/'vedelo-home-v4-1080p.mp4'),'-vf','scale=1280:720:flags=lanczos','-c:v','libx264','-preset','medium','-crf','23','-maxrate','3M','-bufsize','6M','-threads','6','-c:a','copy','-map_metadata','-1','-movflags','+faststart',str(OUTPUT/'vedelo-home-v4-720p.mp4')])

def subtitles():
    def shift(match):
        h,m,s,sep,ms=match.groups();n=((int(h)*60+int(m))*60+int(s))*1000+int(ms)+2200
        return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02}{sep}{n%1000:03}'
    for suffix in ['vtt','srt']:
        name=f'vedelo-home-ru.{suffix}'
        text=(SOURCE_DIR/name).read_text(encoding='utf-8')
        text=re.sub(r'(\d{2}):(\d{2}):(\d{2})([,.])(\d{3})',shift,text)
        (OUTPUT/name).write_text(text,encoding='utf-8')
    (OUTPUT/'edit-timing.json').write_text(json.dumps({'introDuration':INTRO,'crossfadeDuration':FADE,'speechOffset':OFFSET,'outroStart':OUTRO_START,'outroDuration':OUTRO,'frames':TOTAL_FRAMES,'duration':TOTAL},indent=2),encoding='utf-8')
    print(f'Subtitles shifted by {OFFSET}s; total {TOTAL:.3f}s.')

parser=argparse.ArgumentParser()
parser.add_argument('action',choices=['body','frame','audio','export','subtitles'])
args=parser.parse_args()
globals()[args.action]()
