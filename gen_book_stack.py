from PIL import Image, ImageDraw
import os
import random

random.seed(42)

# Settings
WIDTH, HEIGHT = 3840, 2160
FPS = 24

# Timing
APPEAR_DURATION = 0.6         # all 5 pop into a horizontal line
HOLD_LINE_DURATION = 1.0      # hold the horizontal line
COLLAPSE_DURATION = 1.2       # slide left, stacking over each other
INSTR_APPEAR_DURATION = 1.0   # lines print in one by one
INSTR_HOLD_DURATION = 1.0     # hold all lines visible
INSTR_FADE_DURATION = 0.6     # fade everything out
TOTAL_SEC = (APPEAR_DURATION + HOLD_LINE_DURATION + COLLAPSE_DURATION
             + INSTR_APPEAR_DURATION + INSTR_HOLD_DURATION + INSTR_FADE_DURATION)
TOTAL_FRAMES = int(FPS * TOTAL_SEC)

# Thumbnail sizing
THUMB_W = 360
THUMB_H = 202  # 16:9
THUMB_CORNER_RADIUS = 10
BORDER_WIDTH = 2
BORDER_COLOR = (255, 255, 255, 150)

# Position: centered on viewport (computed after CARD_W/CARD_H are known)

# Number of copies
NUM_CARDS = 5

# Horizontal line spacing (gap between cards)
CARD_SPACING = 40

# Output
OUT_DIR = "./book_stack_seq"
os.makedirs(OUT_DIR, exist_ok=True)

# Load and resize source image
src = Image.open("./Stills/clean1.jpg").convert("RGBA")
src = src.resize((THUMB_W, THUMB_H), Image.LANCZOS)

def round_corners(img, radius):
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, img.width, img.height], radius=radius, fill=255)
    result = img.copy()
    result.putalpha(mask)
    return result

def add_border(img, width, color, radius):
    bordered = Image.new("RGBA", (img.width + width*2, img.height + width*2), (0,0,0,0))
    border_draw = ImageDraw.Draw(bordered)
    border_draw.rounded_rectangle(
        [0, 0, bordered.width-1, bordered.height-1],
        radius=radius + width,
        fill=color
    )
    bordered.paste(img, (width, width), img)
    return bordered

# Create thumbnail
rounded = round_corners(src, THUMB_CORNER_RADIUS)
base_thumb = add_border(rounded, BORDER_WIDTH, BORDER_COLOR, THUMB_CORNER_RADIUS)

CARD_W = base_thumb.width
CARD_H = base_thumb.height

# Small random offsets for the final stacked look
stack_rotations = [random.uniform(-4, 4) for _ in range(NUM_CARDS)]
stack_jitter_x = [random.randint(-10, 10) for _ in range(NUM_CARDS)]
stack_jitter_y = [random.randint(-6, 6) for _ in range(NUM_CARDS)]

# Instruction graphic lines (skeleton text bars)
NUM_LINES = 5
LINE_BAR_HEIGHT = 14
LINE_BAR_RADIUS = 4
LINE_SPACING = 38  # vertical distance between bar tops
LINE_WIDTHS = [THUMB_W, int(THUMB_W * 0.85), THUMB_W, int(THUMB_W * 0.7), int(THUMB_W * 0.55)]
LINE_COLOR = (255, 255, 255)


def ease_out_cubic(t):
    return 1 - pow(1 - t, 3)

def ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)

def ease_in_out_cubic(t):
    if t < 0.5:
        return 4 * t * t * t
    else:
        return 1 - pow(-2 * t + 2, 3) / 2


# Center the card row in the viewport
total_row_w = NUM_CARDS * CARD_W + (NUM_CARDS - 1) * CARD_SPACING
STACK_LEFT = (WIDTH - total_row_w) // 2
line_y = (HEIGHT - CARD_H) // 2

# Horizontal line positions (evenly spaced, centered)
line_positions_x = [STACK_LEFT + i * (CARD_W + CARD_SPACING) for i in range(NUM_CARDS)]

# Stack target: all cards collapse to the middle card's position
middle_idx = NUM_CARDS // 2
stack_target_x = line_positions_x[middle_idx]

print(f"Total: {TOTAL_SEC}s = {TOTAL_FRAMES} frames")

for frame in range(TOTAL_FRAMES):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    t = frame / FPS

    phase1_end = APPEAR_DURATION
    phase2_end = phase1_end + HOLD_LINE_DURATION
    phase3_end = phase2_end + COLLAPSE_DURATION

    # --- Phase 4: Instruction bars (appear → hold → fade) ---
    if t >= phase3_end:
        draw = ImageDraw.Draw(img)
        t_instr = t - phase3_end

        phase4a_end = INSTR_APPEAR_DURATION
        phase4b_end = phase4a_end + INSTR_HOLD_DURATION

        total_bars_h = (NUM_LINES - 1) * LINE_SPACING + LINE_BAR_HEIGHT
        bar_x = (WIDTH - max(LINE_WIDTHS)) // 2
        bar_y_start = (HEIGHT - total_bars_h) // 2

        # Global fade multiplier (1.0 during appear/hold, fades to 0 in fade phase)
        if t_instr < phase4b_end:
            global_alpha = 1.0
        else:
            fade_progress = (t_instr - phase4b_end) / INSTR_FADE_DURATION
            fade_progress = max(0, min(1, fade_progress))
            global_alpha = 1.0 - ease_out_cubic(fade_progress)

        for idx in range(NUM_LINES):
            # Per-line staggered appear with easing
            line_start = idx / NUM_LINES
            appear_progress = t_instr / INSTR_APPEAR_DURATION if INSTR_APPEAR_DURATION > 0 else 1.0
            appear_progress = max(0, min(1, appear_progress))

            if appear_progress < line_start:
                continue

            line_local = (appear_progress - line_start) * NUM_LINES
            line_local = max(0, min(1, line_local))
            line_alpha = ease_out_cubic(line_local)

            bar_alpha = int(255 * line_alpha * global_alpha)
            if bar_alpha <= 0:
                continue

            bx = bar_x
            by = bar_y_start + idx * LINE_SPACING
            bw = LINE_WIDTHS[idx]
            color = LINE_COLOR + (bar_alpha,)

            draw.rounded_rectangle(
                [bx, by, bx + bw, by + LINE_BAR_HEIGHT],
                radius=LINE_BAR_RADIUS,
                fill=color,
            )

    # --- Phases 1-3: Card animation ---
    else:
        for i in range(NUM_CARDS):
            # --- Phase 1: Appear quickly into horizontal line ---
            if t < phase1_end:
                card_delay = i * (APPEAR_DURATION * 0.5 / NUM_CARDS)
                card_progress = (t - card_delay) / (APPEAR_DURATION * 0.6)
                card_progress = max(0, min(1, card_progress))
                eased = ease_out_back(card_progress)

                x = line_positions_x[i]
                start_y = HEIGHT + 50
                y = int(start_y + (line_y - start_y) * eased)
                alpha = min(1.0, card_progress * 3)
                rotation = 0

            # --- Phase 2: Hold horizontal line ---
            elif t < phase2_end:
                x = line_positions_x[i]
                y = line_y
                alpha = 1.0
                rotation = 0

            # --- Phase 3: Collapse to center into a stack ---
            else:
                progress = (t - phase2_end) / COLLAPSE_DURATION
                progress = max(0, min(1, progress))
                eased = ease_in_out_cubic(progress)

                target_x = stack_target_x + stack_jitter_x[i]
                x = int(line_positions_x[i] + (target_x - line_positions_x[i]) * eased)

                target_y = line_y + stack_jitter_y[i]
                y = int(line_y + (target_y - line_y) * eased)

                rotation = stack_rotations[i] * eased
                alpha = 1.0

            if alpha <= 0:
                continue

            # Rotate card
            if abs(rotation) > 0.1:
                rotated = base_thumb.rotate(rotation, expand=True, resample=Image.BICUBIC)
            else:
                rotated = base_thumb

            # Apply alpha
            if alpha < 1:
                r, g, b, a = rotated.split()
                a = a.point(lambda p, al=alpha: int(p * al))
                rotated = Image.merge("RGBA", (r, g, b, a))

            # Position (center the rotated image on target)
            rx = x - (rotated.width - CARD_W) // 2
            ry = int(y) - (rotated.height - CARD_H) // 2

            img.paste(rotated, (rx, ry), rotated)

    img.save(os.path.join(OUT_DIR, f"book_stack_{frame:04d}.png"))

    if frame % (FPS * 2) == 0:
        print(f"  Frame {frame}/{TOTAL_FRAMES} ({t:.1f}s)")

print(f"\nDone! {TOTAL_FRAMES} frames in {OUT_DIR}")
