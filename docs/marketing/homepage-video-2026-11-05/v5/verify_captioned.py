from pathlib import Path
import hashlib
import json
import struct
import subprocess
import sys

from PIL import Image

ROOT = Path('C:/Users/Escal/Downloads/vedelo-video-v5')
FFMPEG = 'D:/programs/ffmpeg/bin/ffmpeg.exe'
FFPROBE = 'D:/programs/ffmpeg/bin/ffprobe.exe'
sys.path.insert(0, 'C:/Users/Escal/Downloads/vedelo-video-v3/qa/qr-libs')
import zxingcpp


def run(command):
    return subprocess.run(command, capture_output=True, check=True).stdout


def audio_hash(file):
    return hashlib.sha256(run([FFMPEG, '-v', 'error', '-i', str(file), '-map', '0:a:0', '-f', 's16le', '-'])).hexdigest()


def atoms(file):
    result = []
    with file.open('rb') as stream:
        while True:
            header = stream.read(8)
            if len(header) < 8:
                return result
            size, name = struct.unpack('>I4s', header)
            used = 8
            if size == 1:
                size = struct.unpack('>Q', stream.read(8))[0]
                used = 16
            result.append(name.decode('ascii'))
            if not size:
                return result
            stream.seek(size - used, 1)


report = {'versions': [], 'cueCount': 0}
reference_hash = audio_hash(Path('C:/Users/Escal/Downloads/vedelo-video-v4/vedelo-home-v4-1080p.mp4'))
for resolution in ['1080p', '720p']:
    file = ROOT / f'vedelo-home-v5-{resolution}.mp4'
    metadata = json.loads(run([FFPROBE, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(file)]))
    video = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    assert int(video['nb_frames']) == 3421
    assert not any(s['codec_type'] == 'subtitle' for s in metadata['streams'])
    decode = subprocess.run([FFMPEG, '-v', 'error', '-i', str(file), '-f', 'null', '-'], capture_output=True, check=True)
    assert not decode.stderr, decode.stderr.decode(errors='replace')
    box_order = atoms(file)
    assert box_order.index('moov') < box_order.index('mdat')
    assert audio_hash(file) == reference_hash
    for position in [4.2, 60, 107.2]:
        frame = ROOT / 'qa' / f'encoded-{resolution}-{position}.png'
        run([FFMPEG, '-y', '-v', 'error', '-ss', str(position), '-i', str(file), '-frames:v', '1', str(frame)])
        if position == 107.2:
            decoded = [result.text for result in zxingcpp.read_barcodes(Image.open(frame))]
            assert 'https://vedelo.ru' in decoded, decoded
    report['versions'].append({
        'file': file.name, 'bytes': file.stat().st_size,
        'width': video['width'], 'height': video['height'],
        'duration': float(metadata['format']['duration']),
        'frames': int(video['nb_frames']), 'fullDecode': 'passed',
        'faststart': True, 'audioMatchesV4': True,
        'qrDecoded': 'https://vedelo.ru', 'subtitleTracks': 0,
    })

events = [line for line in (ROOT / 'vedelo-home-ru.ass').read_text(encoding='utf-8').splitlines() if line.startswith('Dialogue:')]
report['cueCount'] = len(events)
assert len(events) == 34
report['audioSha256'] = reference_hash
(ROOT / 'qa' / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
