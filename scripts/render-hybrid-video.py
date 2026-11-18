from __future__ import annotations

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from imageio_ffmpeg import get_ffmpeg_exe


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIRECTORY = ROOT / "artifacts" / "video" / "hybrid-assets"
RENDER_DIRECTORY = ROOT / "artifacts" / "video" / "hybrid-render"
AUDIO_DIRECTORY = ROOT / "artifacts" / "audio" / "final-polish"
SUBMISSION_DIRECTORY = ROOT / "artifacts" / "submission"
TIMINGS_PATH = AUDIO_DIRECTORY / "timings.json"
AUDIO_PATH = AUDIO_DIRECTORY / "neverlost-case-navigator-hybrid-narration.wav"
OUTPUT_PATH = SUBMISSION_DIRECTORY / "neverlost-case-navigator-build-for-good-hybrid.mp4"
SCENE_TIMINGS_PATH = RENDER_DIRECTORY / "scene-timings.json"
CONTACT_SHEET_PATH = RENDER_DIRECTORY / "hybrid-contact-sheet.png"

WIDTH = 1600
HEIGHT = 900
FPS = 25
NAVY = "#082653"
DEEP_NAVY = "#061a38"
BLUE = "#6ca8f6"
PALE_BLUE = "#d8e9ff"
WHITE = "#ffffff"
MUTED = "#afc8e8"
PANEL = "#f7fbff"
INK = "#102644"
FFMPEG = get_ffmpeg_exe()

SCENES = [
    {
        "slug": "problem",
        "eyebrow": "THE PROBLEM",
        "title": "Complex cases scatter the evidence.",
        "body": "Records live across providers, portals, tests, forms, and personal files.",
        "assets": [],
    },
    {
        "slug": "preserve",
        "eyebrow": "PRESERVE BEFORE YOU UNDERSTAND",
        "title": "The source stays visible before interpretation.",
        "body": "Maya's canonical S02 record remains identifiable and reviewable.",
        "assets": ["preserved-source.png"],
    },
    {
        "slug": "openai-replay",
        "eyebrow": "VALIDATED OPENAI REPLAY",
        "title": "Preserved source → candidate proposals",
        "body": "A replay of live-validated synthetic output; no paid request occurs in the recording.",
        "motion": "openai-replay-motion.webm",
        "assets": [],
    },
    {
        "slug": "unreviewed",
        "eyebrow": "AI OUTPUT IS NOT CASE STATE",
        "title": "Every candidate returns unreviewed.",
        "body": "The exact preserved excerpt remains beside the proposed statement.",
        "assets": ["unreviewed-proposal.png"],
    },
    {
        "slug": "human-gate",
        "eyebrow": "THE HUMAN GATE",
        "title": "Accept. Edit. Reject. Hold.",
        "body": "AI proposes. Human decides.",
        "assets": ["docs/screenshots/openai-proposal-unreviewed.png"],
    },
    {
        "slug": "timeline",
        "eyebrow": "ACCEPTED CASE STATE",
        "title": "Only reviewed evidence enters the timeline.",
        "body": "The supported POTS statement appears after explicit acceptance.",
        "assets": ["accepted-timeline.png"],
    },
    {
        "slug": "packet",
        "eyebrow": "DETERMINISTIC OUTPUT",
        "title": "The packet is projected from reviewed state.",
        "body": "It is not drafted directly from arbitrary AI output.",
        "assets": ["deterministic-packet.png"],
    },
    {
        "slug": "provenance",
        "eyebrow": "TRACEABLE EVIDENCE",
        "title": "One accepted statement. Every later appearance.",
        "body": "Source, proposal, decision, timeline, and packet remain connected.",
        "assets": ["accepted-provenance.png"],
    },
    {
        "slug": "rejected",
        "eyebrow": "GOVERNANCE THAT HOLDS",
        "title": "Rejected evidence does not quietly re-enter.",
        "body": "It remains traceable without becoming accepted fact.",
        "assets": ["rejected-provenance.png"],
    },
    {
        "slug": "closing",
        "eyebrow": "SYNTHETIC DEMONSTRATION",
        "title": "AI PROPOSES. HUMAN DECIDES.",
        "body": "Preserve context, evidence provenance, and human responsibility.",
        "assets": [],
    },
]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = Path("C:/Windows/Fonts") / name
    return ImageFont.truetype(str(path), size=size)


REGULAR = font("segoeui.ttf", 25)
SMALL = font("segoeui.ttf", 19)
SEMIBOLD = font("seguisb.ttf", 25)
TITLE = font("segoeuib.ttf", 41)
HERO = font("segoeuib.ttf", 63)
CLOSING_HERO = font("segoeuib.ttf", 72)
EYEBROW = font("seguisb.ttf", 18)
BRAND = font("seguisb.ttf", 20)


def run_ffmpeg(args: list[str]) -> None:
    completed = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or "FFmpeg failed.")


def fit_image(source: Image.Image, max_width: int, max_height: int) -> Image.Image:
    image = source.convert("RGB")
    image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
    return image


def resolve_asset(value: str) -> Path:
    return ROOT / value if "/" in value else ASSET_DIRECTORY / value


def application_crop(source_path: Path, scene_slug: str) -> Image.Image:
    source = Image.open(source_path).convert("RGB")
    if scene_slug == "human-gate":
        path_crop = source.crop((240, 44, 1360, 126))
        context_crop = source.crop((240, 158, 1360, 650))
        content = Image.new(
            "RGB",
            (1120, path_crop.height + context_crop.height + 24),
            DEEP_NAVY,
        )
        content.paste(path_crop, (0, 0))
        content.paste(context_crop, (0, path_crop.height + 10))
    else:
        crop_boxes = {
            "preserve": (0, 0, source.width, min(source.height, 430)),
            "unreviewed": (0, 0, source.width, min(source.height, 510)),
            "provenance": (200, 60, 1400, 780),
            "rejected": (200, 60, 1400, 780),
        }
        box = crop_boxes.get(scene_slug, (0, 0, source.width, source.height))
        content = source.crop(box)

    header_source = Image.open(ASSET_DIRECTORY / "problem.png").convert("RGB")
    header = header_source.crop((0, 0, 1600, 63))
    header_height = max(40, round(63 * content.width / 1600))
    header = header.resize((content.width, header_height), Image.Resampling.LANCZOS)
    combined = Image.new(
        "RGB",
        (content.width, header.height + content.height),
        DEEP_NAVY,
    )
    combined.paste(header, (0, 0))
    combined.paste(content, (0, header.height))
    return combined


def draw_header(draw: ImageDraw.ImageDraw, image: Image.Image) -> None:
    logo_path = ROOT / "public" / "brand" / "nvlt-youtube-logo.png"
    logo = Image.open(logo_path).convert("RGBA")
    logo.thumbnail((62, 62), Image.Resampling.LANCZOS)
    image.alpha_composite(logo, (74, 44))
    draw.text((151, 54), "NEVERLOST CASE NAVIGATOR", font=BRAND, fill=WHITE)
    draw.text((151, 82), "BUILD FOR GOOD · SYNTHETIC DEMO", font=SMALL, fill=MUTED)
    draw.line((74, 124, 1526, 124), fill="#31527e", width=1)


def draw_screenshot_panel(
    canvas: Image.Image,
    source_path: Path,
    box: tuple[int, int, int, int],
    scene_slug: str,
) -> None:
    x, y, width, height = box
    source = fit_image(application_crop(source_path, scene_slug), width - 16, height - 16)
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (x + 8, y + 12, x + width + 8, y + height + 12),
        radius=18,
        fill=(0, 5, 20, 95),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    canvas.alpha_composite(shadow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (x, y, x + width, y + height),
        radius=18,
        fill=DEEP_NAVY,
        outline="#8fb5e5",
        width=2,
    )
    paste_x = x + (width - source.width) // 2
    paste_y = y + (height - source.height) // 2
    canvas.paste(source, (paste_x, paste_y))


def render_frame(scene: dict[str, object], index: int) -> Path:
    output = RENDER_DIRECTORY / f"scene-{index:02}-{scene['slug']}.png"
    if scene["slug"] != "human-gate" and output.exists():
        return output

    image = Image.new("RGBA", (WIDTH, HEIGHT), DEEP_NAVY)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, WIDTH, HEIGHT), fill=DEEP_NAVY)
    draw.ellipse((1130, -310, 1800, 360), fill="#0b3975")
    draw.ellipse((-260, 630, 500, 1300), fill="#0a315f")
    draw_header(draw, image)

    eyebrow = str(scene["eyebrow"])
    title = str(scene["title"])
    body = str(scene["body"])
    draw.text((76, 155), eyebrow, font=EYEBROW, fill=BLUE)
    title_font = (
        CLOSING_HERO
        if scene["slug"] == "closing"
        else HERO if not scene["assets"] else TITLE
    )
    max_title_width = 1320 if not scene["assets"] else 1240
    title_lines: list[str] = []
    current = ""
    for word in title.split():
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=title_font)[2] <= max_title_width:
            current = candidate
        else:
            title_lines.append(current)
            current = word
    if current:
        title_lines.append(current)
    title_y = 190
    for line in title_lines:
        draw.text((76, title_y), line, font=title_font, fill=WHITE)
        title_y += title_font.size + 8
    draw.text((78, title_y + 8), body, font=REGULAR, fill=PALE_BLUE)

    assets = [str(item) for item in scene["assets"]]
    if assets:
        if scene["slug"] == "human-gate":
            panel_top = 278
            available_height = HEIGHT - panel_top - 25
            panel_box = (40, panel_top, 1520, available_height)
        else:
            panel_top = max(292, title_y + 46)
            available_height = HEIGHT - panel_top - 42
            panel_box = (58, panel_top, 1484, available_height)
        draw_screenshot_panel(
            image,
            resolve_asset(assets[0]),
            panel_box,
            str(scene["slug"]),
        )
    else:
        draw.rounded_rectangle((76, 520, 1524, 718), radius=22, fill="#0b3267", outline="#3b6ba8", width=2)
        if scene["slug"] == "problem":
            callout = "PRESERVE WHAT THE EVIDENCE SAYS — AND WHAT A HUMAN ACCEPTS."
        else:
            callout = "SYNTHETIC DATA · HUMAN REVIEW REQUIRED · NOT PRODUCTION HEALTHCARE"
        draw.text((116, 585), callout, font=SEMIBOLD, fill=WHITE)
        draw.text((116, 638), "Neverlost keeps evidence, decisions, and later outputs connected.", font=REGULAR, fill=MUTED)

    draw.text((76, 850), f"{index:02} / 10", font=SMALL, fill=MUTED)
    image.convert("RGB").save(output, quality=95)
    return output


def main() -> None:
    RENDER_DIRECTORY.mkdir(parents=True, exist_ok=True)
    SUBMISSION_DIRECTORY.mkdir(parents=True, exist_ok=True)
    timings = json.loads(TIMINGS_PATH.read_text(encoding="utf-8"))
    sections = timings["sections"]
    if len(sections) != len(SCENES):
        raise RuntimeError("Narration and hybrid scene counts do not match.")
    total_duration = float(timings["totalDuration"])
    gap = float(timings["interSectionSilence"])
    starts = [0.0] + [float(section["start"]) - gap / 2 for section in sections[1:]]
    ends = starts[1:] + [total_duration]

    rendered_frames = [render_frame(scene, index) for index, scene in enumerate(SCENES, start=1)]
    segment_paths: list[Path] = []
    scene_records: list[dict[str, object]] = []
    for index, (scene, start, end, frame_path) in enumerate(
        zip(SCENES, starts, ends, rendered_frames, strict=True), start=1
    ):
        duration = end - start
        segment_path = RENDER_DIRECTORY / f"segment-{index:02}.mp4"
        motion = scene.get("motion")
        if scene["slug"] != "human-gate" and segment_path.exists():
            pass
        elif motion:
            motion_path = ASSET_DIRECTORY / str(motion)
            run_ffmpeg(
                [
                    "-i",
                    str(motion_path),
                    "-vf",
                    f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color={DEEP_NAVY},tpad=stop_mode=clone:stop_duration={duration:.3f}",
                    "-t",
                    f"{duration:.3f}",
                    "-r",
                    str(FPS),
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "medium",
                    "-crf",
                    "18",
                    "-pix_fmt",
                    "yuv420p",
                    "-y",
                    str(segment_path),
                ]
            )
        else:
            run_ffmpeg(
                [
                    "-loop",
                    "1",
                    "-i",
                    str(frame_path),
                    "-t",
                    f"{duration:.3f}",
                    "-r",
                    str(FPS),
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "medium",
                    "-crf",
                    "18",
                    "-pix_fmt",
                    "yuv420p",
                    "-y",
                    str(segment_path),
                ]
            )
        segment_paths.append(segment_path)
        scene_records.append(
            {
                "scene": index,
                "slug": scene["slug"],
                "start": round(start, 3),
                "end": round(end, 3),
                "duration": round(duration, 3),
                "visual": str(motion or frame_path.name),
            }
        )

    concat_path = RENDER_DIRECTORY / "segments.txt"
    concat_path.write_text(
        "\n".join(f"file '{path.as_posix()}'" for path in segment_paths) + "\n",
        encoding="utf-8",
    )
    silent_path = RENDER_DIRECTORY / "hybrid-silent.mp4"
    run_ffmpeg(
        [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_path),
            "-c",
            "copy",
            "-y",
            str(silent_path),
        ]
    )
    run_ffmpeg(
        [
            "-i",
            str(silent_path),
            "-i",
            str(AUDIO_PATH),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-t",
            f"{total_duration:.3f}",
            "-movflags",
            "+faststart",
            "-y",
            str(OUTPUT_PATH),
        ]
    )
    SCENE_TIMINGS_PATH.write_text(
        json.dumps({"totalDuration": total_duration, "scenes": scene_records}, indent=2) + "\n",
        encoding="utf-8",
    )

    thumbnails: list[Image.Image] = []
    for frame in rendered_frames:
        preview = Image.open(frame).convert("RGB")
        preview.thumbnail((384, 216), Image.Resampling.LANCZOS)
        thumbnails.append(preview)
    sheet = Image.new("RGB", (384 * 5, 216 * 2), "#071a37")
    for index, preview in enumerate(thumbnails):
        sheet.paste(preview, ((index % 5) * 384, (index // 5) * 216))
    sheet.save(CONTACT_SHEET_PATH)

    print(
        json.dumps(
            {
                "output": str(OUTPUT_PATH),
                "duration": total_duration,
                "sceneTimings": str(SCENE_TIMINGS_PATH),
                "contactSheet": str(CONTACT_SHEET_PATH),
            }
        )
    )


if __name__ == "__main__":
    main()
