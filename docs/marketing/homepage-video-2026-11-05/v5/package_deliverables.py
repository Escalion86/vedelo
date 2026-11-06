from pathlib import Path
import hashlib
import json
import zipfile

VIDEO = Path('C:/Users/Escal/Downloads/vedelo-video-v5')
CONCEPT = Path('C:/Users/Escal/Downloads/vedelo-homepage-concept')


def package(root, archive_name, files):
    archive_path = root / archive_name
    with zipfile.ZipFile(archive_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in files:
            assert file.is_file(), str(file)
            archive.write(file, file.relative_to(root).as_posix())
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(files)
    return {'file': str(archive_path), 'bytes': archive_path.stat().st_size, 'entries': len(files), 'crc': 'passed'}


video_files = [VIDEO / name for name in [
    'vedelo-home-v5-1080p.mp4', 'vedelo-home-v5-720p.mp4',
    'vedelo-home-poster.png', 'vedelo-home-ru.srt', 'vedelo-home-ru.vtt',
    'vedelo-home-ru.ass', 'vedelo-qr.png', 'preview.html',
    'README.md', 'MUSIC_CREDITS.md', 'VERIFICATION.md',
]]
concept_files = [CONCEPT / name for name in [
    'index.html', 'README.md', 'desktop-first-screen.png',
    'mobile-first-screen.png', 'desktop-full-page.png', 'mobile-full-page.png',
]] + list((CONCEPT / 'assets').glob('*')) + list((CONCEPT / 'media').glob('*'))
reference = (VIDEO / 'vedelo-home-v5-720p.mp4').read_bytes()
assert hashlib.sha256(reference).digest() == hashlib.sha256((CONCEPT / 'media/vedelo-home-v5-720p.mp4').read_bytes()).digest()
report = [package(VIDEO, 'vedelo-home-v5-site-kit.zip', video_files), package(CONCEPT, 'vedelo-homepage-concept.zip', concept_files)]
(VIDEO / 'qa/package-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
