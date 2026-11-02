from pathlib import Path
import json
import subprocess

base = Path(__file__).resolve().parent
ffmpeg = 'D:/programs/ffmpeg/bin/ffmpeg.exe'
ffprobe = 'D:/programs/ffmpeg/bin/ffprobe.exe'
master = base / 'vedelo-ui-inserts.mp4'
clips = [(0, '01-order.mp4'), (7, '02-next-contact.mp4'), (14, '03-payments.mp4')]
for start, name in clips:
    subprocess.run([ffmpeg, '-y', '-v', 'error', '-i', str(master), '-ss', str(start), '-t', '7', '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(base / name)], check=True)
subprocess.run([ffmpeg, '-y', '-v', 'error', '-ss', '4', '-i', str(master), '-frames:v', '1', '-q:v', '2', str(base / 'poster.jpg')], check=True)
frames = [0, 10, 30, 120, 207, 210, 220, 240, 300, 417, 420, 450, 480, 540, 600, 629]
select = '+'.join(f'eq(n,{n})' for n in frames)
subprocess.run([ffmpeg, '-y', '-v', 'error', '-i', str(master), '-vf', f"select='{select}',scale=432:540,tile=4x4", '-frames:v', '1', str(base / 'qa/video-final-frames.png')], check=True)
verified = []
for name, duration, count in [('vedelo-ui-inserts.mp4', 21, 630)] + [(name, 7, 210) for _, name in clips]:
    result = subprocess.run([ffprobe, '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,nb_frames', '-of', 'json', str(base / name)], capture_output=True, text=True, check=True)
    info = json.loads(result.stdout)
    assert len(info['streams']) == 1, (name, 'unexpected audio or extra track')
    video = info['streams'][0]
    assert video['codec_name'] == 'h264' and video['pix_fmt'] == 'yuv420p'
    assert (video['width'], video['height']) == (864, 1080)
    assert video['r_frame_rate'] == '30/1' and int(video['nb_frames']) == count
    assert abs(float(info['format']['duration']) - duration) < .01
    subprocess.run([ffmpeg, '-v', 'error', '-i', str(base / name), '-f', 'null', '-'], check=True, capture_output=True)
    verified.append({'file': name, 'duration': duration, 'frames': count, 'size': int(info['format']['size']), 'audio': False, 'decode': 'passed'})
(base / 'qa/video-verification.json').write_text(json.dumps(verified, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(verified, ensure_ascii=False, indent=2))
