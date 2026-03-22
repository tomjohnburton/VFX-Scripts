"""
Teleoperator Control Transfer — Overlay
────────────────────────────────────────
RL ACTIVE / OPERATOR ACTIVE text overlay with a pulsing
connecting line that activates during handover.

Requirements:
    pip install moviepy pillow numpy

Usage:
    python teleop_control_transfer.py

Output:
    teleop_control_transfer.mp4 (1920×1080, 60 fps)
"""

import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from moviepy.editor import VideoClip
except ImportError:
    from moviepy import VideoClip


# ── Configuration ────────────────────────────────────────────────────
WIDTH, HEIGHT = 1920, 1080
FPS = 60

BG_COLOR = (12, 12, 18)

# Autonomous mode = cold cyan/blue, human control = warm amber
COLOR_AUTO = (60, 180, 220)       # cyan
COLOR_HUMAN = (255, 180, 50)      # amber
COLOR_HUD = (180, 200, 220)       # HUD text grey-blue

# ── Timing (seconds) — 24s total ────────────────────────────────────
#   Phase 1: RL Active, line idle                    0.0 → 10.0
#   Phase 2: Transition — line pulses                10.0 → 13.5
#   Phase 3: Handover complete                       13.5 → 14.0
#   Phase 4: Operator Active, line steady            14.0 → 24.0
PHASE1_END = 10.0
PHASE2_END = 13.5
PHASE3_END = 14.0
TOTAL_DURATION = 24.0

# ── Font ─────────────────────────────────────────────────────────────
SUISSE_CANDIDATES = [
    ("/Users/tomburton/Library/Fonts/suisse-intl-regular.ttf", None),
    ("/Library/Fonts/SuisseIntl-Regular.ttf", None),
    ("/Library/Fonts/suisse-intl-regular.ttf", None),
]

FONT_FALLBACKS = [
    ("/System/Library/Fonts/SFNSMono.ttf", None),
    ("/System/Library/Fonts/Menlo.ttc", 0),
    ("/System/Library/Fonts/Supplemental/Courier New.ttf", None),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", None),
]

# Overlay layout
OVERLAY_Y = HEIGHT // 2           # vertically centred
OVERLAY_LINE_GAP = 60             # gap between text and line ends
OVERLAY_LINE_LEN = 220            # line length between labels


def load_font(size: int, candidates=None) -> ImageFont.FreeTypeFont:
    candidates = candidates or FONT_FALLBACKS
    for path, index in candidates:
        try:
            if index is not None:
                return ImageFont.truetype(path, size, index=index)
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


font_suisse = load_font(28, SUISSE_CANDIDATES)


# ── Easing ───────────────────────────────────────────────────────────
def ease_out_cubic(t: float) -> float:
    return 1.0 - (1.0 - t) ** 3


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c1, c2, t):
    return tuple(int(lerp(c1[i], c2[i], t)) for i in range(3))


# ── Main frame renderer ─────────────────────────────────────────────
def make_frame(t: float) -> np.ndarray:
    img = Image.new("RGBA", (WIDTH, HEIGHT), (*BG_COLOR, 255))
    draw = ImageDraw.Draw(img)

    # ── Colour blend: auto → human ────────────────────────────
    if t < PHASE1_END:
        color_t = 0.0
    elif t < PHASE2_END:
        color_t = ease_out_cubic((t - PHASE1_END) / (PHASE2_END - PHASE1_END))
    else:
        color_t = 1.0

    # ── Overlay: RL ACTIVE / OPERATOR ACTIVE with pulse line ──
    oy = OVERLAY_Y
    cx = WIDTH // 2

    # Label opacity: RL fades out, Operator fades in during handover
    rl_alpha = int(255 * (1.0 - color_t * 0.6))
    op_alpha = int(lerp(60, 255, color_t))

    rl_col = lerp_color(COLOR_AUTO, COLOR_HUD, color_t * 0.4)
    op_col = lerp_color(COLOR_HUD, COLOR_HUMAN, color_t)

    # Measure text widths for positioning
    rl_text = "RL ACTIVE"
    op_text = "OPERATOR ACTIVE"
    rl_bbox = font_suisse.getbbox(rl_text)
    op_bbox = font_suisse.getbbox(op_text)
    rl_w = rl_bbox[2] - rl_bbox[0]

    half_line = OVERLAY_LINE_LEN // 2
    rl_x = cx - half_line - OVERLAY_LINE_GAP - rl_w
    op_x = cx + half_line + OVERLAY_LINE_GAP

    draw.text((rl_x, oy - 14), rl_text, fill=(*rl_col, rl_alpha), font=font_suisse)
    draw.text((op_x, oy - 14), op_text, fill=(*op_col, op_alpha), font=font_suisse)

    # Connecting line with pulse
    line_y = oy
    line_x1 = cx - half_line
    line_x2 = cx + half_line

    # Pulse: intensifies during phase 2-3, settles in phase 4
    if t < PHASE1_END:
        pulse = 0.0
        line_alpha = 60
    elif t < PHASE2_END:
        p = (t - PHASE1_END) / (PHASE2_END - PHASE1_END)
        pulse = math.sin(p * math.pi * 6) * 0.5 + 0.5
        pulse *= ease_out_cubic(p)
        line_alpha = int(lerp(60, 220, ease_out_cubic(p)))
    elif t < PHASE3_END:
        pulse = 1.0
        line_alpha = 255
    else:
        pulse = 1.0
        line_alpha = 200

    line_col = lerp_color(COLOR_AUTO, COLOR_HUMAN, color_t)

    # Glow layer (wider, lower alpha, pulse-driven)
    glow_a = int(pulse * line_alpha * 0.4)
    if glow_a > 0:
        draw.line([(line_x1, line_y), (line_x2, line_y)],
                  fill=(*line_col, glow_a), width=8)

    # Main line
    draw.line([(line_x1, line_y), (line_x2, line_y)],
              fill=(*line_col, line_alpha), width=2)

    # Pulse dot traveling along the line during calibration
    if PHASE1_END < t < PHASE3_END:
        dot_phase = (t * 2.5) % 1.0
        dot_x = int(lerp(line_x1, line_x2, dot_phase))
        dot_r = 4
        dot_a = int(200 * pulse)
        draw.ellipse([dot_x - dot_r, line_y - dot_r, dot_x + dot_r, line_y + dot_r],
                     fill=(*line_col, dot_a))

    return np.array(img.convert("RGB"))


# ── Render ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    output = "teleop_control_transfer.mp4"
    print(f"Rendering  •  {TOTAL_DURATION:.1f}s  •  {WIDTH}×{HEIGHT} @ {FPS}fps")
    clip = VideoClip(make_frame, duration=TOTAL_DURATION)
    clip.write_videofile(output, fps=FPS, codec="libx264", audio=False)
    print(f"\nDone → {output}")
