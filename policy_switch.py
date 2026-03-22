"""
Policy Switch Overlay
─────────────────────
"Base Policy Active" flashes gently, then at 10s swaps to
"RL Policy Active" for 4s, then back to "Base Policy Active".
Text shifts up slightly during the swap. Transparent background.

Requirements:
    pip install pillow numpy

Usage:
    python policy_switch.py

Output:
    policy_switch.mov (3840×2160, 60 fps, ProRes 4444 alpha)
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

TEXT_COLOR = (240, 245, 255)
RL_COLOR = (251, 212, 91)

# ── Timing ───────────────────────────────────────────────────────────
SWAP_IN = 10.0          # RL appears
SWAP_OUT = 14.0         # back to base
TOTAL_DURATION = 24.0
TRANSITION_DUR = 0.5    # crossfade / slide duration

# Glow params
GLOW_RADIUS = 12        # Gaussian blur radius for text glow
GLOW_ALPHA = 120        # glow layer opacity

# Vertical shift during swap
SHIFT_PX = 60

# ── Font ─────────────────────────────────────────────────────────────
FONT_CANDIDATES = [
    ("/Users/tomburton/Library/Fonts/SF-Mono-Bold.otf", None),
    ("/System/Library/Fonts/SFNSMono.ttf", None),
    ("/System/Library/Fonts/Menlo.ttc", 0),
]


def load_font(size, candidates):
    for path, index in candidates:
        try:
            if index is not None:
                return ImageFont.truetype(path, size, index=index)
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


# Each process initializes its own font + layout
font = None
_base_w = _rl_w = _th = 0
_base_bbox = (0, 0, 0, 0)
BASE_X = RL_X = 0
baseline_y = 0

BASE_TEXT = "base model"
RL_TEXT = "RL active"
CENTER_Y = HEIGHT // 2
GAP = 60

# Dim state for RL when inactive
RL_DIM_COLOR = (80, 70, 40)
RL_DIM_ALPHA = 80


def init_worker():
    global font, _base_w, _rl_w, _th, _base_bbox, BASE_X, RL_X, baseline_y
    font = load_font(72, FONT_CANDIDATES)
    _base_bbox = font.getbbox(BASE_TEXT)
    _base_w = _base_bbox[2] - _base_bbox[0]
    rl_bbox = font.getbbox(RL_TEXT)
    _rl_w = rl_bbox[2] - rl_bbox[0]
    _th = _base_bbox[3] - _base_bbox[1]
    total_w = _base_w + GAP + _rl_w
    pair_x = (WIDTH - total_w) // 2
    BASE_X = pair_x
    RL_X = pair_x + _base_w + GAP
    baseline_y = CENTER_Y - _th // 2 - _base_bbox[1]


# ── Helpers ──────────────────────────────────────────────────────────
def ease_in_out_cubic(t):
    if t < 0.5:
        return 4.0 * t * t * t
    return 1.0 - (-2.0 * t + 2.0) ** 3 / 2.0


def draw_glowing_text(img, x, y, text, color, alpha):
    """Draw text with a soft glow behind it."""
    if alpha < 1:
        return
    # Glow layer — draw text, blur it, composite
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    glow_a = min(255, int(GLOW_ALPHA * (alpha / 255)))
    gd.text((x, y), text, fill=(*color, glow_a), font=font)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=GLOW_RADIUS))
    img.alpha_composite(glow)
    # Sharp text on top
    sharp = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sharp)
    sd.text((x, y), text, fill=(*color, alpha), font=font)
    img.alpha_composite(sharp)


# ── Main frame renderer ─────────────────────────────────────────────
def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def make_frame(t: float) -> np.ndarray:
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))

    # Determine RL activation (0 = off, 1 = on)
    if t < SWAP_IN:
        activation = 0.0
    elif t < SWAP_IN + TRANSITION_DUR:
        activation = ease_in_out_cubic((t - SWAP_IN) / TRANSITION_DUR)
    elif t < SWAP_OUT - TRANSITION_DUR:
        activation = 1.0
    elif t < SWAP_OUT:
        activation = 1.0 - ease_in_out_cubic(
            (t - (SWAP_OUT - TRANSITION_DUR)) / TRANSITION_DUR)
    else:
        activation = 0.0

    # Base text: always visible
    draw_glowing_text(img, BASE_X, baseline_y, BASE_TEXT, TEXT_COLOR, 255)

    # RL text: dim when off, bright + pulsing when on
    rl_color = lerp_color(RL_DIM_COLOR, RL_COLOR, activation)
    rl_alpha = int(RL_DIM_ALPHA + (255 - RL_DIM_ALPHA) * activation)

    # Gentle pulse when active
    if activation > 0.5:
        pulse = 0.92 + 0.08 * math.sin(t * 4.0 * math.pi)
        rl_alpha = int(rl_alpha * pulse)

    draw_glowing_text(img, RL_X, baseline_y, RL_TEXT, rl_color, rl_alpha)

    return np.array(img)


def render_frame(args):
    i, tmpdir = args
    t = i / FPS
    frame = make_frame(t)
    path = os.path.join(tmpdir, f"{i:06d}.png")
    Image.fromarray(frame, "RGBA").save(path)
    return i


# ── Render ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    output = "policy_switch.mov"
    tmpdir = tempfile.mkdtemp(prefix="policy_sw_")
    n_frames = int(TOTAL_DURATION * FPS)

    cpu_count = max(1, mp.cpu_count() - 1)
    print(f"Rendering  •  {TOTAL_DURATION:.1f}s  •  {WIDTH}×{HEIGHT}"
          f" @ {FPS}fps  •  ProRes 4444 (alpha)")
    print(f"Using {cpu_count} worker processes")

    try:
        with ProcessPoolExecutor(
            max_workers=cpu_count,
            initializer=init_worker,
        ) as executor:
            for i in executor.map(
                render_frame,
                ((i, tmpdir) for i in range(n_frames)),
                chunksize=8,
            ):
                if i % FPS == 0:
                    print(f"  frame {i}/{n_frames}")

        subprocess.run([
            "ffmpeg", "-y",
            "-framerate", str(FPS),
            "-i", os.path.join(tmpdir, "%06d.png"),
            "-c:v", "prores_ks",
            "-profile:v", "4",
            "-pix_fmt", "yuva444p10le",
            "-an", output,
        ], check=True)

        print(f"\nDone → {output}")

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
