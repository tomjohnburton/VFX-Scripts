from PIL import Image, ImageDraw, ImageFont
import os

# Settings
WIDTH, HEIGHT = 3840, 2160
FPS = 24

# Tasks with durations in seconds
TASKS = [
    ("Clean surface", 6),
    ("Dry surface", 5),
    ("Return items to fridge", 8),
    ("Return plates", 6),
    ("Wash dishes", 30),
]

TOTAL_SEC = sum(t[1] for t in TASKS)
TOTAL_FRAMES = int(FPS * TOTAL_SEC)
TRANSITION_SEC = 0.75

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "task_carousel_v2")
os.makedirs(OUT_DIR, exist_ok=True)

# Font
FONT_SIZE_ACTIVE = 72
FONT_SIZE_COMPLETED = 52
SF_MONO = os.path.expanduser("~/Library/Fonts/SF-Mono-Medium.otf")

# Preload fonts for smooth size interpolation during transitions
fonts = {}
for size in range(FONT_SIZE_COMPLETED, FONT_SIZE_ACTIVE + 1):
    fonts[size] = ImageFont.truetype(SF_MONO, size)

# Layout
MARGIN_LEFT = 160
ACTIVE_Y = HEIGHT - 240
LINE_SPACING = 90

WHITE = (255, 255, 255)

# Timeline
task_starts = []
cumulative = 0
for name, dur in TASKS:
    task_starts.append(cumulative)
    cumulative += dur


def ease_out_cubic(t):
    return 1 - pow(1 - t, 3)


def get_current_task_index(time_sec):
    for i in range(len(TASKS) - 1, -1, -1):
        if time_sec >= task_starts[i]:
            return i
    return 0


def get_transition_progress(time_sec, task_idx):
    """Return raw 0-1 progress for the transition into task_idx."""
    if task_idx == 0:
        return 1.0
    elapsed = time_sec - task_starts[task_idx]
    if elapsed >= TRANSITION_SEC:
        return 1.0
    elif elapsed <= 0:
        return 0.0
    return elapsed / TRANSITION_SEC


def slot_properties(slot):
    """Get y, font_size, alpha for a continuous slot value.
    slot 0 = active position, slot 1+ = completed stack."""
    y = ACTIVE_Y - slot * LINE_SPACING

    # Font size: lerp from active to completed over slot 0->1
    if slot <= 0:
        font_size = FONT_SIZE_ACTIVE
    elif slot < 1.0:
        font_size = int(FONT_SIZE_ACTIVE + (FONT_SIZE_COMPLETED - FONT_SIZE_ACTIVE) * slot)
    else:
        font_size = FONT_SIZE_COMPLETED
    font_size = max(FONT_SIZE_COMPLETED, min(FONT_SIZE_ACTIVE, font_size))

    # Opacity: 255 at slot 0, fading to 0 by slot 3 (max 2 past tasks visible)
    if slot <= 0:
        alpha = 255
    elif slot < 1.0:
        alpha = int(255 + (130 - 255) * slot)
    elif slot < 3.0:
        alpha = int(130 - (slot - 1) * 65)
    else:
        alpha = 0
    alpha = max(0, min(255, alpha))

    return int(y), font_size, alpha


print(f"Total: {TOTAL_SEC}s = {TOTAL_FRAMES} frames")

for frame in range(TOTAL_FRAMES):
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    t = frame / FPS

    current_idx = get_current_task_index(t)
    raw_progress = get_transition_progress(t, current_idx)
    p = ease_out_cubic(raw_progress)

    # --- Draw completed tasks (max 2 visible + 1 fading out) ---
    for i in range(max(0, current_idx - 3), current_idx):
        name = TASKS[i][0]
        text = "\u2713  " + name

        # This task's final slot: 1 = most recent completed, 2 = next older, etc.
        final_slot = current_idx - i

        # During transition, smoothly shift from previous slot to final slot
        if raw_progress < 1.0 and current_idx > 0:
            slot = final_slot - (1 - p)
        else:
            slot = final_slot

        y, font_size, alpha = slot_properties(slot)
        font = fonts[font_size]

        txt_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_layer)
        txt_draw.text((MARGIN_LEFT, y), text, font=font, fill=(*WHITE, alpha))
        img = Image.alpha_composite(img, txt_layer)

    # --- Draw active task ---
    current_name = TASKS[current_idx][0]
    current_text = "\u25b8  " + current_name

    if current_idx > 0 and raw_progress < 1.0:
        # Slide up from below into active position
        active_y = int(ACTIVE_Y + LINE_SPACING * (1 - p))
        active_alpha = int(255 * p)
    else:
        active_y = ACTIVE_Y
        active_alpha = 255

    txt_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    txt_draw = ImageDraw.Draw(txt_layer)
    txt_draw.text((MARGIN_LEFT, active_y), current_text, font=fonts[FONT_SIZE_ACTIVE],
                  fill=(*WHITE, active_alpha))
    img = Image.alpha_composite(img, txt_layer)

    img.save(os.path.join(OUT_DIR, f"task_carousel_{frame:04d}.png"))

    if frame % (FPS * 5) == 0:
        print(f"  Frame {frame}/{TOTAL_FRAMES} ({t:.1f}s) \u2014 Task: {TASKS[current_idx][0]}")

print(f"\nDone! {TOTAL_FRAMES} frames in {OUT_DIR}")
