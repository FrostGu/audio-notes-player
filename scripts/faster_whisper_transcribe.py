#!/usr/bin/env python3
import argparse
import json
import sys

from faster_whisper import WhisperModel


def emit(event: dict) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper.")
    parser.add_argument("audio_path")
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--language", default="auto")
    parser.add_argument("--initial-prompt", default=None)
    parser.add_argument("--time-offset", type=float, default=0.0)
    args = parser.parse_args()

    language = None if args.language == "auto" else args.language
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments, info = model.transcribe(
        args.audio_path,
        beam_size=8,
        language=language,
        initial_prompt=args.initial_prompt,
        vad_filter=True,
    )

    transcript_segments = []
    transcript_parts = []
    segment_index = 1

    emit({
        "type": "metadata",
        "language": info.language,
        "duration": info.duration,
    })

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        transcript_segment = {
            "id": f"segment-{segment_index}",
            "startTime": segment.start + args.time_offset,
            "endTime": segment.end + args.time_offset,
            "text": text,
        }
        segment_index += 1

        transcript_parts.append(text)
        transcript_segments.append(transcript_segment)
        emit({
            "type": "segment",
            "segment": transcript_segment,
            "text": " ".join(transcript_parts),
        })

    emit({
        "type": "complete",
        "text": " ".join(transcript_parts),
        "language": info.language,
        "segments": transcript_segments,
    })

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
