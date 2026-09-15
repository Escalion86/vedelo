import argparse
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


def transcribe(audio_path: Path, model_name: str, cache_dir: Path, device: str, compute_type: str):
    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        download_root=str(cache_dir),
    )
    segments_iter, info = model.transcribe(
        str(audio_path),
        language="ru",
        beam_size=5,
        best_of=5,
        patience=1.0,
        condition_on_previous_text=True,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    segments = []
    for segment in segments_iter:
        item = {
            "id": segment.id,
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text.strip(),
            "avg_logprob": segment.avg_logprob,
            "no_speech_prob": segment.no_speech_prob,
            "compression_ratio": segment.compression_ratio,
            "words": [
                {
                    "start": None if word.start is None else round(word.start, 3),
                    "end": None if word.end is None else round(word.end, 3),
                    "word": word.word,
                    "probability": word.probability,
                }
                for word in (segment.words or [])
            ],
        }
        segments.append(item)
        print(f"[{item['start']:8.2f}-{item['end']:8.2f}] {item['text']}", flush=True)
    return {
        "model": model_name,
        "device": device,
        "compute_type": compute_type,
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "duration_after_vad": info.duration_after_vad,
        "segments": segments,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", default="turbo")
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="float16")
    args = parser.parse_args()

    try:
        result = transcribe(
            args.audio,
            args.model,
            args.cache_dir,
            args.device,
            args.compute_type,
        )
    except Exception as exc:
        if args.device != "cuda":
            raise
        print(f"CUDA transcription failed: {exc}", file=sys.stderr, flush=True)
        print("Retrying on CPU with int8 compute.", file=sys.stderr, flush=True)
        result = transcribe(
            args.audio,
            args.model,
            args.cache_dir,
            "cpu",
            "int8",
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(result['segments'])} segments to {args.output}", flush=True)


if __name__ == "__main__":
    main()
