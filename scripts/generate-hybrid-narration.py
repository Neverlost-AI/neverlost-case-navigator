from __future__ import annotations

import importlib.metadata
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "docs" / "demo-narration-hybrid.md"
REVIEW_DIRECTORY = ROOT / "artifacts" / "audio" / "final-polish"
SUBMISSION_DIRECTORY = ROOT / "artifacts" / "submission"
FINAL_WAV = REVIEW_DIRECTORY / "neverlost-case-navigator-hybrid-narration.wav"
FINAL_SRT = SUBMISSION_DIRECTORY / "neverlost-case-navigator-build-for-good-hybrid.srt"
TIMINGS_PATH = REVIEW_DIRECTORY / "timings.json"

VOICE = "am_fenrir"
SPEED = 0.72
SOURCE_RATE = 24_000
OUTPUT_RATE = 48_000
INITIAL_SILENCE_SECONDS = 0.65
INTER_SECTION_SILENCE_SECONDS = 0.55
FINAL_SILENCE_SECONDS = 1.5
WARMUP = "All right. Here is the next point."
EXPECTED_AI_PHONEMES = "ˈA ˈI"
EXPECTED_POTS_PHONEMES = "pˈɑts"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def narration_sections() -> list[tuple[str, str]]:
    markdown = SCRIPT_PATH.read_text(encoding="utf-8")
    matches = list(
        re.finditer(
            r"^## (\d{2}) — ([^\n]+)\n\n(.+?)(?=\n\n## |\Z)",
            markdown,
            flags=re.MULTILINE | re.DOTALL,
        )
    )
    if len(matches) != 10:
        raise RuntimeError("Expected exactly ten hybrid narration sections.")
    sections = [
        (f"{match.group(1)}-{slug(match.group(2))}", match.group(3).strip())
        for match in matches
    ]
    for _, text in sections:
        if re.search(r"\bAI\b|\bPOTS\b", text):
            raise RuntimeError(
                "Spoken narration must use explicit A. I. and lowercase pots pronunciation forms."
            )
    return sections


def synthesize(pipeline: KPipeline, text: str) -> np.ndarray:
    parts: list[np.ndarray] = []
    for result in pipeline(text, voice=VOICE, speed=SPEED, split_pattern=None):
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
    return audio[
        max(0, int(active[0]) - pad) : min(len(audio), int(active[-1]) + pad + 1)
    ]


def resample_to_48k(audio: np.ndarray) -> np.ndarray:
    target_length = len(audio) * 2
    return np.interp(
        np.linspace(0, len(audio) - 1, target_length),
        np.arange(len(audio), dtype=np.float64),
        audio,
    ).astype(np.float32)


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
    return trim_edges(audio[min(len(audio), run_end * hop) :])


def display_text(text: str) -> str:
    text = re.sub(r"\bA\.\s+I\.", "AI", text)
    return re.sub(r"\bpots\b", "POTS", text, flags=re.IGNORECASE)


def srt_timestamp(seconds: float) -> str:
    milliseconds = round(seconds * 1_000)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02}:{minutes:02}:{whole_seconds:02},{milliseconds:03}"


def sentence_captions(
    text: str, start: float, duration: float
) -> list[tuple[float, float, str]]:
    sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", text) if item.strip()]
    weights = [max(1, len(re.findall(r"\b[\w'-]+\b", sentence))) for sentence in sentences]
    total_weight = sum(weights)
    captions: list[tuple[float, float, str]] = []
    cursor = start
    for index, (sentence, weight) in enumerate(zip(sentences, weights, strict=True)):
        end = start + duration if index == len(sentences) - 1 else cursor + duration * weight / total_weight
        captions.append((cursor, end, display_text(sentence)))
        cursor = end
    return captions


def main() -> None:
    REVIEW_DIRECTORY.mkdir(parents=True, exist_ok=True)
    SUBMISSION_DIRECTORY.mkdir(parents=True, exist_ok=True)
    sections = narration_sections()
    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    warmup_seconds = len(trim_edges(synthesize(pipeline, WARMUP))) / SOURCE_RATE

    pronunciation_records: list[dict[str, object]] = []
    chunks: list[np.ndarray] = [
        np.zeros(round(INITIAL_SILENCE_SECONDS * OUTPUT_RATE), dtype=np.float32)
    ]
    timing_records: list[dict[str, object]] = []
    captions: list[tuple[float, float, str]] = []
    cursor = INITIAL_SILENCE_SECONDS

    for index, (name, text) in enumerate(sections):
        phonemes, _ = pipeline.g2p(text)
        ai_count = len(re.findall(r"\bA\.\s+I\.", text))
        pots_count = len(re.findall(r"\bpots\b", text, flags=re.IGNORECASE))
        ai_phoneme_count = phonemes.count(EXPECTED_AI_PHONEMES)
        pots_phoneme_count = phonemes.count(EXPECTED_POTS_PHONEMES)
        if ai_phoneme_count != ai_count or pots_phoneme_count != pots_count:
            raise RuntimeError(
                f"Pronunciation validation failed for {name}: "
                f"AI {ai_phoneme_count}/{ai_count}, pots {pots_phoneme_count}/{pots_count}."
            )
        pronunciation_records.append(
            {
                "name": name,
                "aiOccurrences": ai_count,
                "aiExpectedPhonemeOccurrences": ai_phoneme_count,
                "potsOccurrences": pots_count,
                "potsExpectedPhonemeOccurrences": pots_phoneme_count,
            }
        )

        combined = synthesize(pipeline, f"{WARMUP} {text}")
        narration_48k = resample_to_48k(remove_warmup(combined, warmup_seconds))
        output_path = REVIEW_DIRECTORY / f"{name}.wav"
        sf.write(output_path, narration_48k, OUTPUT_RATE, subtype="PCM_16")
        duration = len(narration_48k) / OUTPUT_RATE
        timing_records.append(
            {
                "name": name,
                "path": str(output_path.relative_to(ROOT)).replace("\\", "/"),
                "start": round(cursor, 3),
                "end": round(cursor + duration, 3),
                "duration": round(duration, 3),
                "spokenText": text,
                "displayText": display_text(text),
            }
        )
        captions.extend(sentence_captions(text, cursor, duration))
        chunks.append(narration_48k)
        cursor += duration
        if index < len(sections) - 1:
            silence = np.zeros(
                round(INTER_SECTION_SILENCE_SECONDS * OUTPUT_RATE), dtype=np.float32
            )
            chunks.append(silence)
            cursor += INTER_SECTION_SILENCE_SECONDS

    chunks.append(np.zeros(round(FINAL_SILENCE_SECONDS * OUTPUT_RATE), dtype=np.float32))
    final_audio = np.concatenate(chunks)
    sf.write(FINAL_WAV, final_audio, OUTPUT_RATE, subtype="PCM_16")
    timings = {
        "kokoroVersion": importlib.metadata.version("kokoro"),
        "voice": VOICE,
        "speed": SPEED,
        "sampleRate": OUTPUT_RATE,
        "channels": 1,
        "warmup": WARMUP,
        "warmupDuration": round(warmup_seconds, 3),
        "initialSilence": INITIAL_SILENCE_SECONDS,
        "interSectionSilence": INTER_SECTION_SILENCE_SECONDS,
        "finalSilence": FINAL_SILENCE_SECONDS,
        "totalDuration": round(len(final_audio) / OUTPUT_RATE, 3),
        "pronunciation": pronunciation_records,
        "sections": timing_records,
    }
    TIMINGS_PATH.write_text(json.dumps(timings, indent=2) + "\n", encoding="utf-8")
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
                "duration": timings["totalDuration"],
                "sections": timing_records,
                "pronunciation": pronunciation_records,
                "srt": str(FINAL_SRT),
            }
        )
    )


if __name__ == "__main__":
    main()
