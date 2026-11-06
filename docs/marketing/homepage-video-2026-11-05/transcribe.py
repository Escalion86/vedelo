from pathlib import Path
import json
import os
import sys
import wave

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / 'qa/asr-libs'))
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
from faster_whisper import WhisperModel
import numpy as np
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

print('Loading local speech model', flush=True)
model = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=6, download_root=str(BASE / 'qa/models'))
with wave.open(str(BASE / 'qa/voice.wav'), 'rb') as wav:
    assert wav.getframerate() == 16000 and wav.getnchannels() == 1 and wav.getsampwidth() == 2
    samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
segments, info = model.transcribe(samples, language='ru', beam_size=5, word_timestamps=True, vad_filter=True, initial_prompt='Ведело. Иллюзионист. Google Календарь. Клиенты, заказы и оплаты.')
result = []
for s in segments:
    result.append({'start': s.start, 'end': s.end, 'text': s.text.strip(), 'words': [{'start': w.start, 'end': w.end, 'word': w.word, 'probability': w.probability} for w in (s.words or [])]})
    print(f'{s.start:6.2f} - {s.end:6.2f}: {s.text}', flush=True)
(BASE / 'qa/transcript.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('Transcription saved', flush=True)
