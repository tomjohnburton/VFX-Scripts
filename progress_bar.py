"""
Progress Bar — Training Timeline
─────────────────────────────────
48-second progress bar with variable-speed playback:
  Early Training (0–15s), Intervention (15–27s, highlighted), RL Training (27–48s).
  Bar speed: 1x during detail sections, 50x during fast-forward.

Requirements:
    pip install pillow numpy

Usage:
    python progress_bar.py

Output:
    progress_bar.mov (3840×2160, 60 fps, ProRes 4444 alpha)
"""

import os
import math
import shutil
import tempfile
import subprocess
from concurrent.futures import ProcessPoolExecutor
import multiprocessing as mp

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Configuration ────────────────────────────────────────────────────
WIDTH, HEIGHT = 3840, 2160
FPS = 60
TOTAL_DURATION = 48

TEXT_COLOR = (240, 245, 255)
BAR_BG_COLOR = (60, 65, 75)
BAR_FILL_COLOR = (240, 245, 255)
HIGHLIGHT_COLOR = (251, 212, 91)

# ── Timing ───────────────────────────────────────────────────────────
PHASE_1_END = 15.0
PHASE_2_END = 27.0
TRANSITION_DUR = 0.4

# ── Speed segments (video_start, video_end, speed) ──────────────────
# Maps video time to training-time progression rate
SPEED_SEGMENTS = [
    (0,  12, 1),    # Early Training detail
    (12, 15, 50),   # Fast-forward
    (15, 27, 1),    # Intervention detail
    (27, 45, 50),   # Fast-forward through RL Training
    (45, 48, 1),    # End detail
]

# Pre-compute total training time for normalisation
_TOTAL_TRAINING_TIME = sum((end - start) * speed
                           for start, end, speed in SPEED_SEGMENTS)


def video_time_to_progress(t):
    """Map video time to normalised progress (0→1) using speed segments."""
    elapsed = 0.0
    for seg_start, seg_end, speed in SPEED_SEGMENTS:
        if t <= seg_start:
            break
        dt = min(t, seg_end) - seg_start
        elapsed += dt * speed
    return min(elapsed / _TOTAL_TRAINING_TIME, 1.0)

# ── Layout ───────────────────────────────────────────────────────────
BAR_WIDTH = 2400
BAR_HEIGHT = 16
BAR_RADIUS = 8
BAR_Y = HEIGHT // 2 + 40
BAR_X = (WIDTH - BAR_WIDTH) // 2

LABEL_Y = HEIGHT // 2 - 60

# Glow params
GLOW_RADIUS = 12
GLOW_ALPHA = 120

# ── Font ─────────────────────────────────────────────────────────────
FONT_CANDIDATES = [
    ("/Users/tomburton/Library/Fonts/SF-Mono-Bold.otf", None),
    ("/System/Library/Fonts/SFNSMono.ttf", None),
    ("/System/Library/Fonts/Menlo.ttc", 0),
]

# Each process initializes its own font
font = None


def load_font(size, candidates):
    for path, index in candidates:
        try:
            if index is not None:
                return ImageFont.truetype(path, size, index=index)
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def init_worker():
    global font
    font = load_font(72, FONT_CANDIDATES)


# ── Helpers ──────────────────────────────────────────────────────────
def ease_in_out_cubic(t):
    if t < 0.5:
        return 4.0 * t * t * t
    return 1.0 - (-2.0 * t + 2.0) ** 3 / 2.0


def text_width(text):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]


def draw_rounded_rect(draw, x0, y0, x1, y1, radius, fill):
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)


def draw_glowing_text(img, x, y, text, color, alpha):
    if alpha < 1:
        return

    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    glow_a = min(255, int(GLOW_ALPHA * (alpha / 255)))
    gd.text((x, y), text, fill=(*color, glow_a), font=font)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=GLOW_RADIUS))
    img.alpha_composite(glow)

    sharp = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sharp)
    sd.text((x, y), text, fill=(*color, alpha), font=font)
    img.alpha_composite(sharp)


# ── Phase info ───────────────────────────────────────────────────────
PHASES = [
    ("Early Training", TEXT_COLOR, 0.0, PHASE_1_END),
    ("Intervention", HIGHLIGHT_COLOR, PHASE_1_END, PHASE_2_END),
    ("RL Training", TEXT_COLOR, PHASE_2_END, float(TOTAL_DURATION)),
]


# ── Main frame renderer ─────────────────────────────────────────────
def make_frame(t: float) -> np.ndarray:
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    progress = video_time_to_progress(t)

    draw_rounded_rect(
        draw,
        BAR_X, BAR_Y,
        BAR_X + BAR_WIDTH, BAR_Y + BAR_HEIGHT,
        BAR_RADIUS,
        (*BAR_BG_COLOR, 120),
    )

    fill_w = int(BAR_WIDTH * progress)
    if fill_w > 0:
        if t < PHASE_1_END:
            fill_color = BAR_FILL_COLOR
        elif t < PHASE_2_END:
            fill_color = HIGHLIGHT_COLOR
        else:
            fill_color = BAR_FILL_COLOR

        bar_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        bd = ImageDraw.Draw(bar_layer)
        draw_rounded_rect(
            bd,
            BAR_X, BAR_Y,
            BAR_X + max(fill_w, BAR_HEIGHT), BAR_Y + BAR_HEIGHT,
            BAR_RADIUS,
            (*fill_color, 220),
        )

        if PHASE_1_END <= t < PHASE_2_END:  # glow during Intervention
            glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
            gd = ImageDraw.Draw(glow_layer)
            draw_rounded_rect(
                gd,
                BAR_X, BAR_Y - 4,
                BAR_X + max(fill_w, BAR_HEIGHT), BAR_Y + BAR_HEIGHT + 4,
                BAR_RADIUS + 2,
                (*HIGHLIGHT_COLOR, 60),
            )
            glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=8))
            img.alpha_composite(glow_layer)

        img.alpha_composite(bar_layer)

    for label, color, start, end in PHASES:
        if t < start - TRANSITION_DUR:
            alpha = 0
        elif t < start:
            alpha = int(255 * ease_in_out_cubic(
                (t - (start - TRANSITION_DUR)) / TRANSITION_DUR
            ))
        elif t < end - TRANSITION_DUR:
            alpha = 255
        elif t < end:
            alpha = int(255 * (1.0 - ease_in_out_cubic(
                (t - (end - TRANSITION_DUR)) / TRANSITION_DUR
            )))
        else:
            alpha = 0

        if alpha > 0:
            tw = text_width(label)
            bbox = font.getbbox(label)
            lx = (WIDTH - tw) // 2
            ly = LABEL_Y - bbox[1]
            draw_glowing_text(img, lx, ly, label, color, alpha)

    return np.array(img)


def render_frame(args):
    i, tmpdir = args
    t = i / FPS
    frame = make_frame(t)
    path = os.path.join(tmpdir, f"{i:06d}.png")
    Image.fromarray(frame, "RGBA").save(path)
    return i


if __name__ == "__main__":
    output = "progress_bar.mov"
    tmpdir = tempfile.mkdtemp(prefix="progress_bar_")
    n_frames = int(TOTAL_DURATION * FPS)

    cpu_count = max(1, mp.cpu_count() - 1)
    print(
        f"Rendering  •  {TOTAL_DURATION:.1f}s  •  {WIDTH}×{HEIGHT}"
        f" @ {FPS}fps  •  ProRes 4444 (alpha)"
    )
    print(f"Using {cpu_count} worker processes")

    try:
        with ProcessPoolExecutor(
            max_workers=cpu_count,
            initializer=init_worker,
        ) as executor:
            completed = 0
            for i in executor.map(render_frame, ((i, tmpdir) for i in range(n_frames)), chunksize=8):
                completed += 1
                if i % FPS == 0:
                    print(f"  frame {i}/{n_frames}")

        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", os.path.join(tmpdir, "%06d.png"),
            "-c:v", "prores_ks",
            "-profile:v", "4",
            "-pix_fmt", "yuva444p10le",
            "-an",
            output,
        ], check=True)

        print(f"\nDone → {output}")

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)