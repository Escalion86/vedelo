from pathlib import Path
from io import BytesIO
import sys
import subprocess
import json

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / 'qa/qr-libs'))
from PIL import Image
import zxingcpp

results = []
for resolution in ['1080p', '720p']:
    path = BASE / f'vedelo-home-v3-{resolution}.mp4'
    for seconds in [102, 105, 108]:
        raw = subprocess.check_output(['D:/programs/ffmpeg/bin/ffmpeg.exe','-v','error','-ss',str(seconds),'-i',str(path),'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
        frame = Image.open(BytesIO(raw)).convert('RGB')
        texts = [code.text for code in zxingcpp.read_barcodes(frame)]
        assert 'https://vedelo.ru' in texts, f'QR not decoded at {resolution}, {seconds}s'
        results.append(dict(resolution=resolution,seconds=seconds,decoded=texts))
        if seconds == 105:
            frame.save(BASE / 'qa' / f'final-{resolution}.png')
            scaled = frame.resize((960,540),Image.Resampling.LANCZOS)
            scaled_texts = [code.text for code in zxingcpp.read_barcodes(scaled)]
            assert 'https://vedelo.ru' in scaled_texts, f'QR not decoded after resizing {resolution} to 960px'
            results.append(dict(resolution=resolution,seconds=seconds,displayWidth=960,decoded=scaled_texts))
(BASE/'qa/qr-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':len(results),'allDecoded':'https://vedelo.ru'},ensure_ascii=False))
