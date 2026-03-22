"""
Animated Histogram — Episode Length Distribution
─────────────────────────────────────────────────
Bars build right to left with bounce easing.
Axes appear, then bars, then policy labels.

Requirements:
    pip install pillow numpy

Usage:
    python histogram_anim.py

Output:
    histogram_anim.mov (3840×2160, 60 fps, ProRes 4444 alpha)
"""

import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Configuration ────────────────────────────────────────────────────
WIDTH, HEIGHT = 3840, 2160
FPS = 60
TOTAL_DURATION = 5.0

# Colors (matching original chart)
COL_RL = (220, 200, 50)        # yellow/gold
COL_TELEOP = (80, 170, 80)     # green
COL_BASE = (190, 80, 70)       # red
COL_AXIS = (200, 210, 220)     # light grey for axes/text
COL_MEDIAN = None               # set per-policy

# ── Timing ───────────────────────────────────────────────────────────
AXES_START = 0.0
AXES_DUR = 0.6
BARS_START = 0.4
BARS_DUR = 2.8                  # total window for all bars to appear
BAR_ANIM_DUR = 0.5              # each bar's bounce duration
LABELS_START = 3.5
LABELS_DUR = 0.6

# ── Chart layout ────────────────────────────────────────────────────
MARGIN_L = 400
MARGIN_R = 200
MARGIN_T = 300
MARGIN_B = 350
CHART_W = WIDTH - MARGIN_L - MARGIN_R
CHART_H = HEIGHT - MARGIN_T - MARGIN_B

# Data range
X_MIN, X_MAX = 0, 400
Y_MAX_PCT = 30
BIN_WIDTH = 10
N_BINS = (X_MAX - X_MIN) // BIN_WIDTH

# ── Font ─────────────────────────────────────────────────────────────
SUISSE_CANDIDATES = [
    ("/Users/tomburton/Library/Fonts/suisse-intl-regular.ttf", None),
    ("/Library/Fonts/SuisseIntl-Regular.ttf", None),
]

FONT_FALLBACKS = [
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


font_tick = load_font(40, SUISSE_CANDIDATES + FONT_FALLBACKS)
font_label = load_font(48, SUISSE_CANDIDATES + FONT_FALLBACKS)
font_policy = load_font(52, SUISSE_CANDIDATES + FONT_FALLBACKS)

# ── Approximate histogram data (percentage per bin) ──────────────────
# Bins: [0,10), [10,20), ..., [390,400)
# Approximated from the chart image

rl_data = [0]*40
rl_data[3] = 2; rl_data[4] = 18; rl_data[5] = 29; rl_data[6] = 14
rl_data[7] = 8; rl_data[8] = 5; rl_data[9] = 7; rl_data[10] = 5
rl_data[11] = 4; rl_data[12] = 5; rl_data[13] = 5; rl_data[14] = 2
rl_data[15] = 1; rl_data[16] = 1

teleop_data = [0]*40
teleop_data[9] = 2; teleop_data[10] = 3; teleop_data[11] = 4
teleop_data[12] = 5; teleop_data[13] = 7; teleop_data[14] = 10
teleop_data[15] = 7; teleop_data[16] = 7; teleop_data[17] = 6
teleop_data[18] = 6; teleop_data[19] = 4; teleop_data[20] = 3
teleop_data[21] = 2; teleop_data[22] = 1; teleop_data[23] = 1

base_data = [0]*40
base_data[15] = 1; base_data[16] = 3; base_data[17] = 5
base_data[18] = 4; base_data[19] = 5; base_data[20] = 8
base_data[21] = 6; base_data[22] = 7; base_data[23] = 7
base_data[24] = 4; base_data[25] = 5; base_data[26] = 4
base_data[27] = 7; base_data[28] = 3; base_data[29] = 1
base_data[30] = 1; base_data[31] = 1; base_data[35] = 1
base_data[37] = 1; base_data[39] = 0.5

MEDIANS = {"RL": 66, "Teleop": 146, "Base": 228}

# ── Easing ───────────────────────────────────────────────────────────
def ease_out_cubic(t):
    return 1.0 - (1.0 - t) ** 3


def ease_out_bounce(t):
    if t < 1 / 2.75:
        return 7.5625 * t * t
    elif t < 2 / 2.75:
        t -= 1.5 / 2.75
        return 7.5625 * t * t + 0.75
    elif t < 2.5 / 2.75:
        t -= 2.25 / 2.75
        return 7.5625 * t * t + 0.9375
    else:
        t -= 2.625 / 2.75
        return 7.5625 * t * t + 0.984375


def ease_out_elastic(t):
    if t <= 0:
        return 0.0
    if t >= 1:
        return 1.0
    p = 0.4
    return math.pow(2, -10 * t) * math.sin((t - p / 4) * (2 * math.pi) / p) + 1.0


# ── Coordinate helpers ──────────────────────────────────────────────
def x_to_px(val):
    return MARGIN_L + (val - X_MIN) / (X_MAX - X_MIN) * CHART_W


def y_to_px(pct):
    return MARGIN_T + CHART_H - (pct / Y_MAX_PCT) * CHART_H


def bar_px_width():
    return CHART_W / N_BINS


# ── Drawing ─────────────────────────────────────────────────────────
def draw_axes(draw, alpha):
    a = int(255 * alpha)
    col = (*COL_AXIS, a)

    # X axis
    x0 = MARGIN_L
    x1 = WIDTH - MARGIN_R
    y_base = MARGIN_T + CHART_H
    draw.line([(x0, y_base), (x1, y_base)], fill=col, width=3)

    # Y axis
    draw.line([(x0, MARGIN_T), (x0, y_base)], fill=col, width=3)

    # X ticks
    for val in range(0, X_MAX + 1, 50):
        px = x_to_px(val)
        draw.line([(int(px), y_base), (int(px), y_base + 15)], fill=col, width=2)
        txt = str(val)
        bbox = font_tick.getbbox(txt)
        tw = bbox[2] - bbox[0]
        draw.text((int(px) - tw // 2, y_base + 25), txt, fill=col, font=font_tick)

    # Y ticks
    for pct in range(0, Y_MAX_PCT + 1, 5):
        py = y_to_px(pct)
        draw.line([(x0 - 15, int(py)), (x0, int(py))], fill=col, width=2)
        txt = str(pct)
        bbox = font_tick.getbbox(txt)
        tw = bbox[2] - bbox[0]
        draw.text((x0 - 30 - tw, int(py) - 20), txt, fill=col, font=font_tick)

    # X label
    xlabel = "Episode Length (timesteps)"
    xb = font_label.getbbox(xlabel)
    xw = xb[2] - xb[0]
    draw.text(((WIDTH - xw) // 2, y_base + 100), xlabel, fill=col, font=font_label)

    # Y label (draw horizontally, rotated text is hard in PIL — just place vertically)
    ylabel = "Percentage (%)"
    yb = font_label.getbbox(ylabel)
    yw = yb[2] - yb[0]
    # Draw each char vertically would be ugly — just place it sideways-ish to the left
    draw.text((60, MARGIN_T + CHART_H // 2 - 20), "Pct (%)", fill=col, font=font_label)


def draw_bar(draw, bin_idx, height_pct, color, anim_progress):
    if height_pct <= 0 or anim_progress <= 0:
        return

    bounced = ease_out_elastic(min(anim_progress, 1.0))
    h = height_pct * bounced

    bw = bar_px_width()
    x0 = x_to_px(bin_idx * BIN_WIDTH)
    x1 = x0 + bw - 2  # 2px gap between bars
    y_base = MARGIN_T + CHART_H
    y_top = y_to_px(h)

    if y_top >= y_base:
        return

    r, g, b = color
    # Semi-transparent fill
    draw.rectangle([int(x0), int(y_top), int(x1), int(y_base)],
                    fill=(r, g, b, 180))
    # Brighter top edge
    draw.line([(int(x0), int(y_top)), (int(x1), int(y_top))],
              fill=(min(r + 40, 255), min(g + 40, 255), min(b + 40, 255), 220), width=2)


def draw_median_line(draw, x_val, color, alpha):
    if alpha <= 0:
        return
    a = int(220 * alpha)
    px = x_to_px(x_val)
    y0 = MARGIN_T
    y1 = MARGIN_T + CHART_H
    # Dashed line
    dash_len = 20
    gap = 12
    y = y0
    while y < y1:
        ye = min(y + dash_len, y1)
        draw.line([(int(px), int(y)), (int(px), int(ye))],
                  fill=(*color, a), width=4)
        y = ye + gap


def draw_policy_label(draw, name, x_val, color, alpha):
    if alpha <= 0:
        return
    a = int(255 * alpha)
    px = x_to_px(x_val)
    bbox = font_policy.getbbox(name)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    # Label position above chart
    lx = int(px) - tw // 2
    ly = MARGIN_T - 80

    # Background box
    pad = 16
    draw.rectangle([lx - pad, ly - pad, lx + tw + pad, ly + th + pad],
                    fill=(*color, int(40 * alpha)),
                    outline=(*color, int(150 * alpha)), width=2)
    draw.text((lx, ly), name, fill=(*color, a), font=font_policy)


# ── Main frame renderer ─────────────────────────────────────────────
def make_frame(t: float) -> np.ndarray:
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Axes fade in
    if t < AXES_START:
        axes_alpha = 0.0
    elif t < AXES_START + AXES_DUR:
        axes_alpha = ease_out_cubic((t - AXES_START) / AXES_DUR)
    else:
        axes_alpha = 1.0

    if axes_alpha > 0:
        draw_axes(draw, axes_alpha)

    # Bars — animate right to left (highest bin index first)
    if t >= BARS_START:
        bars_elapsed = t - BARS_START
        for bin_idx in range(N_BINS - 1, -1, -1):
            # Stagger: rightmost bin starts first
            reverse_idx = (N_BINS - 1) - bin_idx
            bar_start = reverse_idx * (BARS_DUR - BAR_ANIM_DUR) / N_BINS
            bar_t = (bars_elapsed - bar_start) / BAR_ANIM_DUR
            if bar_t < 0:
                continue

            # Draw in order: base (back), teleop (mid), rl (front)
            draw_bar(draw, bin_idx, base_data[bin_idx], COL_BASE, bar_t)
            draw_bar(draw, bin_idx, teleop_data[bin_idx], COL_TELEOP, bar_t)
            draw_bar(draw, bin_idx, rl_data[bin_idx], COL_RL, bar_t)

    # Labels fade in
    if t >= LABELS_START:
        lp = min((t - LABELS_START) / LABELS_DUR, 1.0)
        label_alpha = ease_out_cubic(lp)

        draw_median_line(draw, MEDIANS["Base"], COL_BASE, label_alpha)
        draw_median_line(draw, MEDIANS["Teleop"], COL_TELEOP, label_alpha)
        draw_median_line(draw, MEDIANS["RL"], COL_RL, label_alpha)

        draw_policy_label(draw, "Base", MEDIANS["Base"], COL_BASE, label_alpha)
        draw_policy_label(draw, "Teleop", MEDIANS["Teleop"], COL_TELEOP, label_alpha)
        draw_policy_label(draw, "RL", MEDIANS["RL"], COL_RL, label_alpha)

    return np.array(img)


# ── Render ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import tempfile, os, subprocess, shutil

    output = "histogram_anim.mov"
    print(f"Rendering  •  {TOTAL_DURATION:.1f}s  •  {WIDTH}×{HEIGHT} @ {FPS}fps  •  ProRes 4444 (alpha)")

    tmpdir = tempfile.mkdtemp(prefix="hist_anim_")
    n_frames = int(TOTAL_DURATION * FPS)
    for i in range(n_frames):
        t = i / FPS
        frame = make_frame(t)
        Image.fromarray(frame, "RGBA").save(os.path.join(tmpdir, f"{i:06d}.png"))
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

    shutil.rmtree(tmpdir)
    print(f"\nDone → {output}")
