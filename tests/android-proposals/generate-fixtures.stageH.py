"""Maintenance-only fixture generation; regression tests require no ffmpeg."""
import hashlib
import json
import os
import pathlib
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
DEST = HERE / 'fixtures.stageH'
DEST.mkdir(exist_ok=True)
COMMANDS = []


def execute(args):
    completed = subprocess.run(args, check=True, capture_output=True)
    COMMANDS.append({'command': args, 'exitCode': completed.returncode})
    return completed.stdout


def generate(name, args, pipe=False):
    # Write each fixture exactly once. Generation scratch stays under TMPDIR.
    with tempfile.TemporaryDirectory(prefix='stageH-fixture-', dir=os.environ['TMPDIR']) as tmp:
        target = pathlib.Path(tmp) / name
        command = ['ffmpeg', '-v', 'error', '-threads', '1', '-filter_threads', '1', *args, 'pipe:1' if pipe else str(target)]
        output = execute(command)
        with (DEST / name).open('xb') as out:
            out.write(output if pipe else target.read_bytes())


video = ['-f', 'lavfi', '-i', 'testsrc2=size=32x32:rate=10:duration=2', '-an']
generate('regular.mp4', [*video, '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-f', 'mp4'])
generate('fragmented.mp4', [*video, '-c:v', 'libx264', '-threads', '1', '-g', '5', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4'], True)
generate('stream.webm', [*video, '-c:v', 'libvpx', '-threads', '1', '-g', '5', '-cluster_time_limit', '500', '-f', 'webm'], True)
audio = ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-vn']
generate('audio-only.mp4', [*audio, '-c:a', 'aac', '-f', 'mp4'])
generate('audio-only.webm', [*audio, '-c:a', 'libopus', '-f', 'webm'], True)
generate('animated-128x128x50.gif', ['-f', 'lavfi', '-i', 'testsrc2=size=128x128:rate=25:duration=2', '-frames:v', '50', '-f', 'gif'])
generate('over-40M.gif', ['-f', 'lavfi', '-i', 'color=c=red:size=1024x1024:rate=20:duration=2', '-frames:v', '40', '-f', 'gif'])
facts = json.loads(execute(['node', str(HERE / 'generate-fixtures.stageH.cjs')]))
files = sorted(DEST.iterdir())
for file in [*files, pathlib.Path(os.environ['TMPDIR']) / 'stageH-free45.mp4']:
    execute(['ffmpeg', '-v', 'error', '-xerror', '-threads', '1', '-i', str(file), '-f', 'null', '-'])
manifest = {
    'generator': 'generate-fixtures.stageH.py',
    'ffmpeg': execute(['ffmpeg', '-version']).decode().splitlines()[0],
    'commands': COMMANDS,
    **facts,
    'files': {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files},
}
with (DEST / 'manifest.stageH.json').open('x') as out:
    json.dump(manifest, out, indent=2)
    out.write('\n')
print(json.dumps(manifest, indent=2))
