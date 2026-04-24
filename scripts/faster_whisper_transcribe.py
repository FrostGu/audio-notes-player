#!/usr/bin/env python3
import argparse
import json
import sys

from faster_whisper import WhisperModel


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper.")
    parser.add_argument("audio_path")
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--language", default="auto")
    args = parser.parse_args()

    language = None if args.language == "auto" else args.language
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(
        args.audio_path,
        beam_size=5,
        language=language,
        vad_filter=True,
    )

    transcript_segments = []
    transcript_parts = []

    for index, segment in enumerate(segments, start=1):
        text = segment.text.strip()
        if not text:
            continue

        transcript_parts.append(text)
        transcript_segments.append({
            "id": f"segment-{index}",
            "startTime": segment.start,
            "endTime": segment.end,
            "text": text,
        })

    json.dump({
        "text": " ".join(transcript_parts),
        "language": info.language,
        "segments": transcript_segments,
    }, sys.stdout, ensure_ascii=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
