"""
Drone Cam Border Overlay
────────────────────────
Animated border around PiP drone camera window with "Drone Cam" label.
Line draws in from left, traces border clockwise, holds for ~2m,
then tail chases head off the top of the screen.

Requirements:
    pip install pillow numpy

Usage:
    python drone_cam.py

Output:
    drone_cam.mov (3840×2160, 60 fps, ProRes 4444 alpha)
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
TOTAL_DURATION = 84.0    # 1m 24s
INTRO_DUR = 2.5
OUTRO_DUR = 2.5

ACCENT = (251, 212, 91)
LINE_W = 4
GLOW_RADIUS = 8
GLOW_ALPHA = 80

# ── PiP window area (bottom-right) ──────────────────────────────────
PIP_W, PIP_H = 1000, 800
MARGIN = 80
PIP_X2 = WIDTH - MARGIN
PIP_Y2 = HEIGHT - MARGIN
PIP_X1 = PIP_X2 - PIP_W
PIP_Y1 = PIP_Y2 - PIP_H

# ── Border around PiP ───────────────────────────────────────────────
PAD = 24
LABEL_H = 80          # space above PiP for "Drone Cam" label
CR = 16               # corner radius

BX1 = PIP_X1 - PAD
BY1 = PIP_Y1 - PAD - LABEL_H
BX2 = PIP_X2 + PAD
BY2 = PIP_Y2 + PAD

# ── Font ─────────────────────────────────────────────────────────────
FONT_CANDIDATES = [
    ("/Users/tomburton/Library/Fonts/SF-Mono-Bold.otf", None),
    ("/System/Library/Fonts/SFNSMono.ttf", None),
    ("/System/Library/Fonts/Menlo.ttc", 0),
]

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
    font = load_font(42, FONT_CANDIDATES)


# ── Helpers ──────────────────────────────────────────────────────────
def ease_in_out_cubic(t):
    t = max(0.0, min(1.0, t))
    if t < 0.5:
        return 4.0 * t * t * t
    return 1.0 - (-2.0 * t + 2.0) ** 3 / 2.0


def arc_points(cx, cy, r, start_angle, end_angle, n=8):
    """Generate points along a circular arc."""
    return [
        (cx + r * math.cos(start_angle + (end_angle - start_angle) * i / n),
         cy + r * math.sin(start_angle + (end_angle - start_angle) * i / n))
        for i in range(n + 1)
    ]


# ── Path definition ─────────────────────────────────────────────────
# Entry from left → border clockwise → exit off top

def build_path():
    path = []

    # Entry: horizontal line from bottom-left of screen
    path.append((0, BY2))
    path.append((BX1 + CR, BY2))

    # Bottom-left corner arc (turn up)
    path.extend(arc_points(BX1 + CR, BY2 - CR, CR, math.pi / 2, math.pi))

    # Left side up to top-left
    path.append((BX1, BY1 + CR))

    # Top-left corner arc (turn right)
    path.extend(arc_points(BX1 + CR, BY1 + CR, CR, math.pi, 3 * math.pi / 2))

    # Top edge to top-right
    path.append((BX2 - CR, BY1))

    # Top-right corner arc (turn down)
    path.extend(arc_points(BX2 - CR, BY1 + CR, CR,
                           3 * math.pi / 2, 2 * math.pi))

    # Right side down to bottom-right
    path.append((BX2, BY2 - CR))

    # Bottom-right corner arc (turn left)
    path.extend(arc_points(BX2 - CR, BY2 - CR, CR, 0, math.pi / 2))

    # Bottom edge back to close at bottom-left
    path.append((BX1 + CR, BY2))

    # Exit: straight up off the top of the screen
    path.append((BX1 + CR, -200))

    # Deduplicate consecutive near-identical points
    result = [path[0]]
    for p in path[1:]:
        if abs(p[0] - result[-1][0]) > 0.5 or abs(p[1] - result[-1][1]) > 0.5:
            result.append(p)
    return result


PATH = build_path()


def compute_distances(points):
    dists = [0.0]
    for i in range(1, len(points)):
        dx = points[i][0] - points[i - 1][0]
        dy = points[i][1] - points[i - 1][1]
        dists.append(dists[-1] + math.hypot(dx, dy))
    return dists


PATH_DISTS = compute_distances(PATH)
TOTAL_PATH_LEN = PATH_DISTS[-1]

# Normalised progress where the border is fully traced (before exit segment)
BORDER_COMPLETE = PATH_DISTS[-2] / TOTAL_PATH_LEN


def get_subpath(tail_norm, head_norm):
    """Return list of (x, y) for the visible portion of the path."""
    tail_d = tail_norm * TOTAL_PATH_LEN
    head_d = head_norm * TOTAL_PATH_LEN
    if head_d <= tail_d:
        return []

    points = []
    for i in range(len(PATH)):
        d = PATH_DISTS[i]

        if d < tail_d:
            # Check if next segment crosses the tail
            if i < len(PATH) - 1 and PATH_DISTS[i + 1] > tail_d:
                seg = PATH_DISTS[i + 1] - d
                t = (tail_d - d) / seg if seg > 0 else 0
                x = PATH[i][0] + t * (PATH[i + 1][0] - PATH[i][0])
                y = PATH[i][1] + t * (PATH[i + 1][1] - PATH[i][1])
                points.append((x, y))
            continue

        if d > head_d:
            # Interpolate the head point
            if i > 0:
                seg = d - PATH_DISTS[i - 1]
                t = (head_d - PATH_DISTS[i - 1]) / seg if seg > 0 else 0
                x = PATH[i - 1][0] + t * (PATH[i][0] - PATH[i - 1][0])
                y = PATH[i - 1][1] + t * (PATH[i][1] - PATH[i - 1][1])
                points.append((x, y))
            break

        points.append(PATH[i])

    return points


# ── Frame renderer ───────────────────────────────────────────────────
def make_frame(t):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))

    intro_end = INTRO_DUR
    outro_start = TOTAL_DURATION - OUTRO_DUR

    if t < intro_end:
        # Intro: head traces the path, tail stays at 0
        p = ease_in_out_cubic(t / INTRO_DUR)
        tail = 0.0
        head = p * BORDER_COMPLETE
        # Label fades in during last 0.4s
        label_alpha = 0
        if t > intro_end - 0.4:
            label_alpha = int(
                255 * ease_in_out_cubic((t - (intro_end - 0.4)) / 0.4))

    elif t > outro_start:
        # Outro: tail chases forward, head exits off top
        p = ease_in_out_cubic((t - outro_start) / OUTRO_DUR)
        tail = p
        head = BORDER_COMPLETE + p * (1.0 - BORDER_COMPLETE)
        # Label fades out during first 0.4s
        if t < outro_start + 0.4:
            label_alpha = int(
                255 * (1.0 - ease_in_out_cubic((t - outro_start) / 0.4)))
        else:
            label_alpha = 0

    else:
        # Hold: full border visible
        tail = 0.0
        head = BORDER_COMPLETE
        label_alpha = 255

    # Draw the visible path segment
    points = get_subpath(tail, head)

    if len(points) >= 2:
        int_pts = [(int(round(x)), int(round(y))) for x, y in points]

        # Glow
        glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.line(int_pts, fill=(*ACCENT, GLOW_ALPHA), width=LINE_W + 8)
        glow = glow.filter(ImageFilter.GaussianBlur(radius=GLOW_RADIUS))
        img.alpha_composite(glow)

        # Sharp line
        draw = ImageDraw.Draw(img)
        draw.line(int_pts, fill=(*ACCENT, 255), width=LINE_W)

    # "Drone Cam" label
    if label_alpha > 0 and font:
        label = "Drone Cam"
        lx = BX1 + PAD + 8
        bbox = font.getbbox(label)
        text_h = bbox[3] - bbox[1]
        ly = BY1 + (LABEL_H - text_h) // 2 - bbox[1]

        # Glow
        glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.text((lx, ly), label,
                fill=(*ACCENT, int(GLOW_ALPHA * label_alpha / 255)),
                font=font)
        glow = glow.filter(ImageFilter.GaussianBlur(radius=GLOW_RADIUS))
        img.alpha_composite(glow)

        sharp = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(sharp)
        sd.text((lx, ly), label, fill=(*ACCENT, label_alpha), font=font)
        img.alpha_composite(sharp)

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
    output = "drone_cam.mov"
    tmpdir = tempfile.mkdtemp(prefix="drone_cam_")
    n_frames = int(TOTAL_DURATION * FPS)

    intro_frames = int(INTRO_DUR * FPS)
    outro_start_frame = int((TOTAL_DURATION - OUTRO_DUR) * FPS)

    cpu_count = max(1, mp.cpu_count() - 1)
    print(f"Rendering  •  {TOTAL_DURATION:.1f}s  •  {WIDTH}×{HEIGHT}"
          f" @ {FPS}fps  •  ProRes 4444 (alpha)")
    print(f"Using {cpu_count} worker processes")

    try:
        # Animated frames (intro + outro) via multiprocessing
        animated_args = (
            [(i, tmpdir) for i in range(intro_frames)]
            + [(i, tmpdir) for i in range(outro_start_frame, n_frames)]
        )

        with ProcessPoolExecutor(
            max_workers=cpu_count,
            initializer=init_worker,
        ) as executor:
            for i in executor.map(render_frame, animated_args, chunksize=8):
                if i % (FPS * 2) == 0:
                    print(f"  animated frame {i}/{n_frames}")

        # Hold: render one frame, copy for the rest
        print("  rendering hold frame (single)...")
        init_worker()
        hold_frame = make_frame(INTRO_DUR + 1.0)
        hold_path = os.path.join(tmpdir, f"{intro_frames:06d}.png")
        Image.fromarray(hold_frame, "RGBA").save(hold_path)

        hold_count = outro_start_frame - intro_frames - 1
        for i in range(intro_frames + 1, outro_start_frame):
            os.link(hold_path, os.path.join(tmpdir, f"{i:06d}.png"))
        print(f"  linked {hold_count} hold frames")

        # Encode
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
