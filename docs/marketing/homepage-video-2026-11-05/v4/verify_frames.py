from pathlib import Path
from io import BytesIO
import json
import re
import subprocess
import sys

SOURCE = Path(__file__).resolve().parent.parent
OUTPUT = Path('C:/Users/Escal/Downloads/vedelo-video-v4')
sys.path.insert(0,str(SOURCE/'v3/qa/qr-libs'))
from PIL import Image, ImageChops, ImageStat
import zxingcpp

def frame(path,seconds):
    raw=subprocess.check_output(['D:/programs/ffmpeg/bin/ffmpeg.exe','-v','error','-ss',str(seconds),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
    return Image.open(BytesIO(raw)).convert('RGB')

poster=Image.open(OUTPUT/'vedelo-home-poster.png').convert('RGB')
report={'titleFrames':[],'qr':[],'subtitles':[]}
for res in ['1080p','720p']:
    path=OUTPUT/f'vedelo-home-v4-{res}.mp4'
    for seconds,label in [(0,'first'),(113.8,'last')]:
        im=frame(path,seconds)
        reference=poster.resize(im.size,Image.Resampling.LANCZOS)
        difference=sum(ImageStat.Stat(ImageChops.difference(im,reference)).mean)/3
        assert difference<2.0,(res,label,difference)
        im.save(OUTPUT/'qa'/f'{label}-{res}.png')
        report['titleFrames'].append(dict(resolution=res,frame=label,meanPixelDifference=round(difference,4)))
    for seconds in [104.2,107.2,110.1]:
        im=frame(path,seconds)
        codes=[code.text for code in zxingcpp.read_barcodes(im)]
        assert 'https://vedelo.ru' in codes,(res,seconds,codes)
        report['qr'].append(dict(resolution=res,seconds=seconds,url='https://vedelo.ru'))

def ms(t):
    h,m,s=t.replace(',','.').split(':');return round((int(h)*3600+int(m)*60+float(s))*1000)
for suffix in ['vtt','srt']:
    name=f'vedelo-home-ru.{suffix}'
    pattern=r'(\d\d:\d\d:\d\d[,.]\d{3}) --> (\d\d:\d\d:\d\d[,.]\d{3})'
    old=re.findall(pattern,(SOURCE/name).read_text(encoding='utf-8'))
    new=re.findall(pattern,(OUTPUT/name).read_text(encoding='utf-8'))
    assert len(old)==len(new)==34
    assert all(ms(c)-ms(a)==2200 and ms(d)-ms(b)==2200 for (a,b),(c,d) in zip(old,new))
    assert ms(new[-1][1])<114033
    report['subtitles'].append(dict(file=name,cues=len(new),offsetMs=2200,lastEnd=new[-1][1]))

times=[0,2.2,2.6,3.0,110.23,110.63,111.1,113.8]
sheet=Image.new('RGB',(1920,540))
for i,t in enumerate(times):
    im=frame(OUTPUT/'vedelo-home-v4-1080p.mp4',t).resize((480,270),Image.Resampling.LANCZOS)
    sheet.paste(im,((i%4)*480,(i//4)*270))
sheet.save(OUTPUT/'qa/transitions.jpg',quality=93)
(OUTPUT/'qa/frame-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
