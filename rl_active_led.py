"""
RL Active LED Indicator
───────────────────────
Centred "RL Active" text with a circular LED to the left.
LED blinks on at 10s, stays on for 4s, then off again.

Requirements:
    pip install moviepy pillow numpy

Usage:
    python rl_active_led.py

Output:
    rl_active_led.mp4 (1920×1080, 60 fps)
"""

import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

try:
    from moviepy.editor import VideoClip
except ImportError:
    from moviepy import VideoClip


# ── Configuration ────────────────────────────────────────────────────
WIDTH, HEIGHT = 1920, 1080
FPS = 60

BG_COLOR = (12, 12, 18)
LED_COLOR = (60, 180, 220)
TEXT_COLOR = (180, 200, 220)

# ── Timing ───────────────────────────────────────────────────────────
LED_ON = 10.0
LED_OFF = 14.0
TOTAL_DURATION = 24.0
FADE_IN_DUR = 0.8       # seconds to fade in
FADE_OUT_DUR = 0.6       # seconds to fade out

# ── Font ─────────────────────────────────────────────────────────────
SUISSE_CANDIDATES = [
    ("/Users/tomburton/Library/Fonts/suisse-intl-regular.ttf", None),
    ("/Library/Fonts/SuisseIntl-Regular.ttf", None),
    ("/Library/Fonts/suisse-intl-regular.ttf", None),
]

FONT_FALLBACKS = [
    ("/System/Library/Fonts/SFNSMono.ttf", None),
    ("/System/Library/Fonts/Menlo.ttc", 0),
]

# LED geometry
LED_RADIUS = 8
LED_GAP = 20  # gap between LED and text


def load_font(size, candidates):
    for path, index in candidates:
        try:
            if index is not None:
                return ImageFont.truetype(path, size, index=index)
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


font = load_font(28, SUISSE_CANDIDATES + FONT_FALLBACKS)


# ── Pre-compute layout (centred) ─────────────────────────────────────
_text = "RL Active"
_bbox = font.getbbox(_text)
_tw = _bbox[2] - _bbox[0]
_th = _bbox[3] - _bbox[1]

# Total width = LED diameter + gap + text width
_total_w = LED_RADIUS * 2 + LED_GAP + _tw
_start_x = (WIDTH - _total_w) // 2

LED_CX = _start_x + LED_RADIUS
LED_CY = HEIGHT // 2
TEXT_X = _start_x + LED_RADIUS * 2 + LED_GAP
TEXT_Y = HEIGHT // 2 - _th // 2 - _bbox[1]


# ── LED rendering ────────────────────────────────────────────────────
def ease_out_cubic(t: float) -> float:
    return 1.0 - (1.0 - t) ** 3


def draw_led(img: Image.Image, cx: int, cy: int, intensity: float):
    """Draw a soft 3D LED with radial gradient glow. intensity 0→1."""
    if intensity <= 0:
        # Dark LED — subtle 3D inset circle
        led_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(led_layer)
        r = LED_RADIUS
        # Dark fill with slight gradient feel via concentric rings
        for i in range(r, 0, -1):
            frac = i / r
            shade = int(20 + 15 * (1.0 - frac))
            alpha = int(180 + 75 * frac)
            d.ellipse([cx - i, cy - i, cx + i, cy + i],
                      fill=(shade, shade, shade + 5, alpha))
        # Subtle rim highlight (top edge catch light)
        d.arc([cx - r, cy - r, cx + r, cy + r],
              start=200, end=340, fill=(60, 60, 70, 50), width=1)
        img.alpha_composite(led_layer)
        return

    r, g, b = LED_COLOR
    # Outer glow — large soft bloom
    glow_size = int(LED_RADIUS * 6)
    glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    for i in range(glow_size, 0, -1):
        frac = i / glow_size
        # Exponential falloff for soft edges
        a = int(intensity * 45 * math.exp(-3.0 * frac))
        if a < 1:
            continue
        gd.ellipse([cx - i, cy - i, cx + i, cy + i],
                    fill=(r, g, b, a))
    # Blur for extra softness
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=4))
    img.alpha_composite(glow_layer)

    # LED body — radial gradient from bright centre to colour edge
    led_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(led_layer)
    body_r = LED_RADIUS
    for i in range(body_r, 0, -1):
        frac = i / body_r
        # Centre is bright white-ish, edges are the LED colour
        cr = int(r + (255 - r) * (1.0 - frac) * 0.7)
        cg = int(g + (255 - g) * (1.0 - frac) * 0.5)
        cb = int(b + (255 - b) * (1.0 - frac) * 0.3)
        a = int(intensity * (180 + 75 * (1.0 - frac)))
        ld.ellipse([cx - i, cy - i, cx + i, cy + i],
                    fill=(cr, cg, cb, min(a, 255)))

    # Specular highlight — small bright spot offset up-left
    spec_r = max(2, body_r // 3)
    spec_x = cx - body_r // 4
    spec_y = cy - body_r // 4
    for i in range(spec_r, 0, -1):
        frac = i / spec_r
        a = int(intensity * 180 * (1.0 - frac))
        ld.ellipse([spec_x - i, spec_y - i, spec_x + i, spec_y + i],
                    fill=(255, 255, 255, min(a, 255)))

    img.alpha_composite(led_layer)


# ── Main frame renderer ─────────────────────────────────────────────
def make_frame(t: float) -> np.ndarray:
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Compute LED intensity with organic fade in/out
    if t < LED_ON:
        intensity = 0.0
    elif t < LED_ON + FADE_IN_DUR:
        p = (t - LED_ON) / FADE_IN_DUR
        intensity = ease_out_cubic(p)
    elif t < LED_OFF - FADE_OUT_DUR:
        intensity = 1.0
    elif t < LED_OFF:
        p = (t - (LED_OFF - FADE_OUT_DUR)) / FADE_OUT_DUR
        intensity = 1.0 - ease_out_cubic(p)
    else:
        intensity = 0.0

    # Text
    draw.text((TEXT_X, TEXT_Y), _text, fill=(*TEXT_COLOR, 255), font=font)

    # LED
    draw_led(img, LED_CX, LED_CY, intensity)

    return np.array(img)


# ── Render ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    output = "rl_active_led.mov"
    print(f"Rendering  •  {TOTAL_DURATION:.1f}s  •  {WIDTH}×{HEIGHT} @ {FPS}fps  •  ProRes 4444 (alpha)")

    # Render RGBA frames to PNG sequence, then mux with ffmpeg
    import tempfile, os, subprocess, shutil
    tmpdir = tempfile.mkdtemp(prefix="rl_led_")
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
