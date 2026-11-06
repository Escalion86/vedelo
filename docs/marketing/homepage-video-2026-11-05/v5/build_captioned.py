from pathlib import Path
import argparse
import shutil
import subprocess

OUTPUT=Path('C:/Users/Escal/Downloads/vedelo-video-v5')
SOURCE=Path('C:/Users/Escal/Downloads/vedelo-video-v4')
FFMPEG='D:/programs/ffmpeg/bin/ffmpeg.exe'

def prepare():
    (OUTPUT/'qa').mkdir(parents=True,exist_ok=True)
    (OUTPUT/'assets/fonts').mkdir(parents=True,exist_ok=True)
    shutil.copy2('D:/Programming/Projects/vedelo/public/fonts/InterTight-SemiBold.ttf',OUTPUT/'assets/fonts/InterTight-SemiBold.ttf')
    for name in ['vedelo-home-poster.png','vedelo-home-ru.srt','vedelo-home-ru.vtt','vedelo-qr.png','MUSIC_CREDITS.md']:
        shutil.copy2(SOURCE/name,OUTPUT/name)
    header='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Dialogue,Inter Tight,46,&H00FFFFFF,&H00FFFFFF,&H60000000,&H60000000,0,0,0,0,100,100,0,0,3,6,0,2,100,100,42,1
Style: Opening,Inter Tight,46,&H00FFFFFF,&H00FFFFFF,&H60000000,&H60000000,0,0,0,0,100,100,0,0,3,6,0,2,850,60,42,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    def stamp(value):
        h,m,s=value.replace(',','.').split(':')
        return f'{int(h)}:{int(m):02}:{float(s):05.2f}'
    events=[]
    for block in (SOURCE/'vedelo-home-ru.srt').read_text(encoding='utf-8').strip().split('\n\n'):
        lines=block.splitlines();number=int(lines[0]);start,end=lines[1].split(' --> ')
        text=r'\N'.join(lines[2:]);style='Opening' if number<=2 else 'Dialogue'
        events.append(f'Dialogue: 0,{stamp(start)},{stamp(end)},{style},,0,0,0,,{text}')
    assert len(events)==34
    (OUTPUT/'vedelo-home-ru.ass').write_text(header+'\n'.join(events)+'\n',encoding='utf-8')
    print('Prepared 34 subtitle cues.')

def filter_text():
    ass=str(OUTPUT/'vedelo-home-ru.ass').replace('\\','/').replace(':',r'\:')
    fonts=str(OUTPUT/'assets/fonts').replace('\\','/').replace(':',r'\:')
    return f"ass=filename='{ass}':fontsdir='{fonts}'"

def run(args):
    subprocess.run([FFMPEG,'-y','-hide_banner','-loglevel','info',*args],check=True)

def preview():
    vf=filter_text()+",select='eq(n,126)+eq(n,210)+eq(n,1800)+eq(n,3216)',scale=960:540,tile=2x2"
    run(['-i',str(SOURCE/'vedelo-home-v4-1080p.mp4'),'-vf',vf,'-an','-frames:v','1',str(OUTPUT/'qa/captions-preview.png')])

def render():
    run(['-i',str(SOURCE/'vedelo-home-v4-1080p.mp4'),'-vf',filter_text(),'-c:v','libx264','-preset','medium','-crf','19','-maxrate','6M','-bufsize','12M','-threads','6','-c:a','copy','-pix_fmt','yuv420p','-movflags','+faststart','-map_metadata','-1','-progress',str(OUTPUT/'qa/render-progress.txt'),str(OUTPUT/'vedelo-home-v5-1080p.mp4')])
    run(['-i',str(OUTPUT/'vedelo-home-v5-1080p.mp4'),'-vf','scale=1280:720:flags=lanczos','-c:v','libx264','-preset','medium','-crf','23','-maxrate','3M','-bufsize','6M','-threads','6','-c:a','copy','-movflags','+faststart','-map_metadata','-1',str(OUTPUT/'vedelo-home-v5-720p.mp4')])

parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','preview','render']);args=parser.parse_args();globals()[args.action]()
