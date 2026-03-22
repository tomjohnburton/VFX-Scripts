"""
Apple-Style Text Reveal Animation
──────────────────────────────────
Phase 1 — "Today," fades in, camera pushes in tight
Phase 2 — Camera sweeps right + zooms out, remaining text fades in as a group
Phase 3 — Hold the full sentence at full frame

Requirements:
    pip install moviepy pillow numpy

Usage:
    python apple_text_reveal.py

Output:
    apple_text_reveal.mp4 (1920×1080, 60 fps)
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from moviepy.editor import VideoClip
except ImportError:
    from moviepy import VideoClip


# ── Configuration ────────────────────────────────────────────────────
SENTENCE = "Today, we are adding memory to our models"
WORDS = SENTENCE.split()

WIDTH, HEIGHT = 1920, 1080
FPS = 60
FONT_SIZE = 90
BG_COLOR = (255, 255, 255)
TEXT_COLOR = (10, 10, 10)

# Render internally at 2× for crisp text during zoom
RENDER_SCALE = 2
RENDER_W = WIDTH * RENDER_SCALE
RENDER_H = HEIGHT * RENDER_SCALE

# ── Timing (seconds) — 4 s total ────────────────────────────────────
#   Phase 1: "Today," appears + zoom in           0.0  → 1.0
#   Phase 2: sweep right + zoom out + text reveal  1.0  → 3.0
#   Phase 3: hold                                  3.0  → 4.0

TODAY_FADE_START = 0.15          # brief blank before "Today," fades in
TODAY_FADE_DUR = 0.25            # fade-in duration for "Today,"

PHASE1_END = 1.0                 # end of zoom-in on "Today,"
PHASE2_END = 3.0                 # end of sweep + zoom-out
TOTAL_DURATION = 4.0             # final hold until here

REST_FADE_DUR = 0.4              # how fast the remaining text fades in
                                 # (starts at PHASE1_END)

# ── Zoom levels ─────────────────────────────────────────────────────
ZOOM_START = 2.8                 # initial zoom when "Today," appears
ZOOM_PEAK = 3.5                  # tightest zoom (end of phase 1)
ZOOM_END = 1.0                   # final zoom (full frame)


# ── Font ─────────────────────────────────────────────────────────────
FONT_CANDIDATES = [
    ("/System/Library/Fonts/SFNS.ttf", None),
    ("/System/Library/Fonts/SFNSDisplay.ttf", None),
    ("/System/Library/Fonts/Supplemental/Helvetica Neue.ttc", 1),
    ("/System/Library/Fonts/Helvetica.ttc", 1),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", None),
    ("C:/Windows/Fonts/segoeui.ttf", None),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path, index in FONT_CANDIDATES:
        try:
            if index is not None:
                return ImageFont.truetype(path, size, index=index)
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    print("Warning: no preferred font found, using default.")
    return ImageFont.load_default()


render_font = load_font(FONT_SIZE * RENDER_SCALE)


# ── Easing ───────────────────────────────────────────────────────────
def ease_out_cubic(t: float) -> float:
    return 1.0 - (1.0 - t) ** 3


def ease_in_out_cubic(t: float) -> float:
    if t < 0.5:
        return 4.0 * t * t * t
    return 1.0 - (-2.0 * t + 2.0) ** 3 / 2.0


def ease_in_quad(t: float) -> float:
    return t * t


# ── Pre-calculate text metrics (render-space) ───────────────────────
space_w = render_font.getlength(" ")
word_ws = [render_font.getlength(w) for w in WORDS]
full_text_w = sum(word_ws) + space_w * (len(WORDS) - 1)
today_w = word_ws[0]

# Full sentence is centred on the internal canvas
text_x_start = (RENDER_W - full_text_w) / 2
today_center_x = text_x_start + today_w / 2       # centre of "Today,"
sentence_center_x = RENDER_W / 2                   # centre of full sentence

# Vertical centre (stable baseline from reference glyphs)
_bbox = render_font.getbbox("Hg")
_text_h = _bbox[3] - _bbox[1]
text_y = (RENDER_H - _text_h) / 2 - _bbox[1]


# ── Animation helpers ───────────────────────────────────────────────
def get_today_alpha(t: float) -> int:
    if t < TODAY_FADE_START:
        return 0
    if t < TODAY_FADE_START + TODAY_FADE_DUR:
        return int(255 * ease_out_cubic((t - TODAY_FADE_START) / TODAY_FADE_DUR))
    return 255


def get_rest_alpha(t: float) -> int:
    if t < PHASE1_END:
        return 0
    if t < PHASE1_END + REST_FADE_DUR:
        return int(255 * ease_out_cubic((t - PHASE1_END) / REST_FADE_DUR))
    return 255


def get_zoom(t: float) -> float:
    if t <= PHASE1_END:
        # Phase 1: ease in from ZOOM_START → ZOOM_PEAK
        p = ease_in_quad(t / PHASE1_END)
        return ZOOM_START + (ZOOM_PEAK - ZOOM_START) * p
    if t <= PHASE2_END:
        # Phase 2: ease out from ZOOM_PEAK → ZOOM_END
        p = ease_in_out_cubic((t - PHASE1_END) / (PHASE2_END - PHASE1_END))
        return ZOOM_PEAK + (ZOOM_END - ZOOM_PEAK) * p
    return ZOOM_END


def get_pan_x(t: float) -> float:
    """Viewport centre x in render-space coords."""
    if t <= PHASE1_END:
        return today_center_x
    if t <= PHASE2_END:
        p = ease_in_out_cubic((t - PHASE1_END) / (PHASE2_END - PHASE1_END))
        return today_center_x + (sentence_center_x - today_center_x) * p
    return sentence_center_x


# ── Frame renderer ──────────────────────────────────────────────────
def make_frame(t: float) -> np.ndarray:
    img = Image.new("RGBA", (RENDER_W, RENDER_H), (*BG_COLOR, 255))
    draw = ImageDraw.Draw(img)

    # Draw "Today,"
    ta = get_today_alpha(t)
    if ta > 0:
        draw.text((text_x_start, text_y), WORDS[0],
                  fill=(*TEXT_COLOR, ta), font=render_font)

    # Draw remaining words (fade in as a group)
    ra = get_rest_alpha(t)
    if ra > 0:
        x = text_x_start + word_ws[0] + space_w
        for i in range(1, len(WORDS)):
            draw.text((x, text_y), WORDS[i],
                      fill=(*TEXT_COLOR, ra), font=render_font)
            x += word_ws[i] + space_w

    # Zoom + pan → crop the viewport
    zoom = get_zoom(t)
    pan_x = get_pan_x(t)

    vw = int(RENDER_W / zoom)
    vh = int(RENDER_H / zoom)
    left = int(pan_x - vw / 2)
    top = int(RENDER_H / 2 - vh / 2)

    # Clamp so we don't crop outside the canvas
    left = max(0, min(left, RENDER_W - vw))
    top = max(0, min(top, RENDER_H - vh))

    cropped = img.crop((left, top, left + vw, top + vh))
    result = cropped.resize((WIDTH, HEIGHT), Image.LANCZOS)

    return np.array(result.convert("RGB"))


# ── Render ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    output = "apple_text_reveal.mp4"
    print(f"Rendering  •  {TOTAL_DURATION:.1f}s  •  {WIDTH}×{HEIGHT} @ {FPS}fps")
    print(f"Zoom: {ZOOM_START}x → {ZOOM_PEAK}x → {ZOOM_END}x")
    clip = VideoClip(make_frame, duration=TOTAL_DURATION)
    clip.write_videofile(output, fps=FPS, codec="libx264", audio=False)
    print(f"\nDone → {output}")
