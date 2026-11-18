from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "docs" / "demo-narration.md"
REVIEW_DIRECTORY = ROOT / "artifacts" / "audio" / "final-submission"
SUBMISSION_DIRECTORY = ROOT / "artifacts" / "submission"
FINAL_WAV = REVIEW_DIRECTORY / "neverlost-case-navigator-final-narration.wav"
FINAL_SRT = SUBMISSION_DIRECTORY / "neverlost-case-navigator-build-for-good.srt"
TIMINGS_PATH = REVIEW_DIRECTORY / "timings.json"

VOICE = "am_fenrir"
SPEED = 0.66
SOURCE_RATE = 24_000
OUTPUT_RATE = 48_000
INTER_SECTION_SILENCE_SECONDS = 0.4
CAPTION_OFFSET_SECONDS = 0.4
WARMUP = "All right. Here is the next point."


def narration_sections() -> list[tuple[str, str]]:
    markdown = SCRIPT_PATH.read_text(encoding="utf-8")
    matches = list(
        re.finditer(
            r"^## (\d{2}) — ([^\n]+)\n\n(.+?)(?=\n\n## |\Z)",
            markdown,
            flags=re.MULTILINE | re.DOTALL,
        )
    )
    if len(matches) != 6:
        raise RuntimeError("Expected exactly six narration sections.")
    return [
        (f"{match.group(1)}-{slug(match.group(2))}", match.group(3).strip())
        for match in matches
    ]


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def synthesize(pipeline: KPipeline, text: str) -> np.ndarray:
    parts: list[np.ndarray] = []
    for result in pipeline(
        text,
        voice=VOICE,
        speed=SPEED,
        split_pattern=None,
    ):
        audio = result.audio
        if hasattr(audio, "detach"):
            audio = audio.detach().cpu().numpy()
        parts.append(np.asarray(audio, dtype=np.float32).reshape(-1))
    if not parts:
        raise RuntimeError("Kokoro returned no audio.")
    return np.concatenate(parts)


def trim_edges(audio: np.ndarray, threshold: float = 0.003) -> np.ndarray:
    active = np.flatnonzero(np.abs(audio) >= threshold)
    if not active.size:
        raise RuntimeError("Narration audio contained no audible samples.")
    pad = int(0.04 * SOURCE_RATE)
    start = max(0, int(active[0]) - pad)
    end = min(len(audio), int(active[-1]) + pad + 1)
    return audio[start:end]


def resample_to_48k(audio: np.ndarray) -> np.ndarray:
    target_length = len(audio) * 2
    source_positions = np.arange(len(audio), dtype=np.float64)
    target_positions = np.linspace(0, len(audio) - 1, target_length)
    return np.interp(target_positions, source_positions, audio).astype(np.float32)


def remove_warmup(audio: np.ndarray, approximate_seconds: float) -> np.ndarray:
    window = int(0.02 * SOURCE_RATE)
    hop = int(0.005 * SOURCE_RATE)
    minimum_quiet_frames = max(1, int(0.08 * SOURCE_RATE / hop))
    rms = np.array(
        [
            np.sqrt(np.mean(audio[index : index + window] ** 2))
            for index in range(0, max(1, len(audio) - window), hop)
        ]
    )
    quiet = rms < max(0.0025, float(rms.max()) * 0.025)
    approximate_frame = int(approximate_seconds * SOURCE_RATE / hop)
    search_start = max(0, approximate_frame - int(0.6 * SOURCE_RATE / hop))
    search_end = min(len(quiet), approximate_frame + int(1.2 * SOURCE_RATE / hop))
    runs: list[tuple[int, int]] = []
    run_start: int | None = None
    for frame in range(search_start, search_end):
        if quiet[frame] and run_start is None:
            run_start = frame
        if (not quiet[frame] or frame == search_end - 1) and run_start is not None:
            run_end = frame if not quiet[frame] else frame + 1
            if run_end - run_start >= minimum_quiet_frames:
                runs.append((run_start, run_end))
            run_start = None
    if not runs:
        raise RuntimeError("Could not locate a clean post-warm-up silence boundary.")
    _, run_end = min(runs, key=lambda item: abs(item[1] - approximate_frame))
    cut = min(len(audio), run_end * hop)
    return trim_edges(audio[cut:])


def srt_timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1_000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02}:{minutes:02}:{whole_seconds:02},{milliseconds:03}"


def sentence_captions(
    text: str,
    start: float,
    duration: float,
) -> list[tuple[float, float, str]]:
    sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", text) if item.strip()]
    weights = [max(1, len(re.findall(r"\b[\w'-]+\b", sentence))) for sentence in sentences]
    total_weight = sum(weights)
    captions: list[tuple[float, float, str]] = []
    cursor = start
    for index, (sentence, weight) in enumerate(zip(sentences, weights, strict=True)):
        end = start + duration if index == len(sentences) - 1 else cursor + duration * weight / total_weight
        captions.append((cursor, end, sentence.replace("A I", "AI")))
        cursor = end
    return captions


def main() -> None:
    REVIEW_DIRECTORY.mkdir(parents=True, exist_ok=True)
    SUBMISSION_DIRECTORY.mkdir(parents=True, exist_ok=True)
    previous_records: dict[str, dict[str, object]] = {}
    if TIMINGS_PATH.exists():
        previous = json.loads(TIMINGS_PATH.read_text(encoding="utf-8"))
        previous_records = {
            str(item["name"]): item for item in previous.get("sections", [])
        }
    chunks: list[np.ndarray] = []
    timing_records: list[dict[str, object]] = []
    captions: list[tuple[float, float, str]] = []
    cursor = 0.0
    sections = narration_sections()
    requires_synthesis = any(
        previous_records.get(name, {}).get("text") != text
        or not (REVIEW_DIRECTORY / f"{name}.wav").exists()
        for name, text in sections
    )
    pipeline: KPipeline | None = None
    if requires_synthesis:
        pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
        warmup_audio = trim_edges(synthesize(pipeline, WARMUP))
        warmup_seconds = len(warmup_audio) / SOURCE_RATE
    else:
        previous = json.loads(TIMINGS_PATH.read_text(encoding="utf-8"))
        warmup_seconds = float(previous["warmupDuration"])

    for index, (name, text) in enumerate(sections):
        output_path = REVIEW_DIRECTORY / f"{name}.wav"
        previous_record = previous_records.get(name)
        if (
            previous_record
            and previous_record.get("text") == text
            and output_path.exists()
        ):
            narration_48k, sample_rate = sf.read(
                output_path,
                dtype="float32",
                always_2d=False,
            )
            if sample_rate != OUTPUT_RATE:
                raise RuntimeError(f"Unexpected cached sample rate for {output_path}.")
            narration_48k = np.asarray(narration_48k, dtype=np.float32).reshape(-1)
        else:
            if pipeline is None:
                raise RuntimeError("Kokoro pipeline was not initialized.")
            combined = synthesize(pipeline, f"{WARMUP} {text}")
            narration = remove_warmup(combined, warmup_seconds)
            narration_48k = resample_to_48k(narration)
            sf.write(output_path, narration_48k, OUTPUT_RATE, subtype="PCM_16")

        duration = len(narration_48k) / OUTPUT_RATE
        timing_records.append(
            {
                "name": name,
                "path": str(output_path.relative_to(ROOT)).replace("\\", "/"),
                "start": round(cursor, 3),
                "end": round(cursor + duration, 3),
                "duration": round(duration, 3),
                "text": text,
            }
        )
        captions.extend(
            sentence_captions(
                text,
                cursor + CAPTION_OFFSET_SECONDS,
                duration,
            )
        )
        chunks.append(narration_48k)
        cursor += duration
        if index < len(sections) - 1:
            silence = np.zeros(
                round(INTER_SECTION_SILENCE_SECONDS * OUTPUT_RATE),
                dtype=np.float32,
            )
            chunks.append(silence)
            cursor += INTER_SECTION_SILENCE_SECONDS

    final_audio = np.concatenate(chunks)
    sf.write(FINAL_WAV, final_audio, OUTPUT_RATE, subtype="PCM_16")
    TIMINGS_PATH.write_text(
        json.dumps(
            {
                "voice": VOICE,
                "speed": SPEED,
                "sampleRate": OUTPUT_RATE,
                "channels": 1,
                "warmup": WARMUP,
                "warmupDuration": round(warmup_seconds, 3),
                "interSectionSilence": INTER_SECTION_SILENCE_SECONDS,
                "totalDuration": round(len(final_audio) / OUTPUT_RATE, 3),
                "sections": timing_records,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    FINAL_SRT.write_text(
        "\n".join(
            f"{index}\n{srt_timestamp(start)} --> {srt_timestamp(end)}\n{text}\n"
            for index, (start, end, text) in enumerate(captions, start=1)
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(FINAL_WAV),
                "duration": round(len(final_audio) / OUTPUT_RATE, 3),
                "sections": timing_records,
                "srt": str(FINAL_SRT),
            }
        )
    )


if __name__ == "__main__":
    main()
