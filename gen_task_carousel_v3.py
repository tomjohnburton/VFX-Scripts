from PIL import Image, ImageDraw, ImageFont
import os

# Settings
WIDTH, HEIGHT = 3840, 2160
FPS = 24

# Tasks with durations in seconds
TASKS = [
    ("Place pot in sink", 4),
    ("Retrieve potatoes", 4),
    ("Retrieve milk", 3),
    ("Retrieve butter", 4.5),
    ("Close fridge", 2),
    ("Retrieve spatula", 4),
]

TAIL_DURATION = 5.0  # hold after last task is ticked
TOTAL_SEC = sum(t[1] for t in TASKS) + TAIL_DURATION
TOTAL_FRAMES = int(FPS * TOTAL_SEC)
TRANSITION_SEC = 0.75

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "task_carousel_v3")
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


ALL_TASKS_END = sum(t[1] for t in TASKS)

def get_current_task_index(time_sec):
    """Return current task index, or len(TASKS) if all tasks are done."""
    if time_sec >= ALL_TASKS_END:
        return len(TASKS)  # all done
    for i in range(len(TASKS) - 1, -1, -1):
        if time_sec >= task_starts[i]:
            return i
    return 0


def get_transition_progress(time_sec, task_idx):
    """Return raw 0-1 progress for the transition into task_idx."""
    if task_idx == 0:
        return 1.0
    if task_idx >= len(TASKS):
        # Transition into "all done" state
        elapsed = time_sec - ALL_TASKS_END
        if elapsed >= TRANSITION_SEC:
            return 1.0
        elif elapsed <= 0:
            return 0.0
        return elapsed / TRANSITION_SEC
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

    all_done = current_idx >= len(TASKS)
    last_idx = len(TASKS) - 1

    # Number of completed tasks (exclude last task — it's handled separately when all done)
    if all_done:
        num_completed = last_idx  # all except the last, which draws in-place below
    else:
        num_completed = current_idx

    # --- Draw completed tasks (max 2 visible + 1 fading out) ---
    for i in range(max(0, num_completed - 3), num_completed):
        name = TASKS[i][0]
        text = "\u2713  " + name

        # This task's final slot: 1 = most recent completed, 2 = next older, etc.
        final_slot = num_completed - i

        # During transition, smoothly shift from previous slot to final slot
        if raw_progress < 1.0 and current_idx > 0 and not all_done:
            slot = final_slot - (1 - p)
        else:
            slot = final_slot

        y, font_size, alpha = slot_properties(slot)
        font = fonts[font_size]

        txt_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_layer)
        txt_draw.text((MARGIN_LEFT, y), text, font=font, fill=(*WHITE, alpha))
        img = Image.alpha_composite(img, txt_layer)

    # --- Draw active / last task ---
    if all_done:
        # Last task: transition in-place from active style to completed style
        last_name = TASKS[last_idx][0]

        if raw_progress < 1.0:
            # Interpolate: arrow→checkmark, size 72→52, alpha 255→130
            last_font_size = int(FONT_SIZE_ACTIVE + (FONT_SIZE_COMPLETED - FONT_SIZE_ACTIVE) * p)
            last_font_size = max(FONT_SIZE_COMPLETED, min(FONT_SIZE_ACTIVE, last_font_size))
            last_alpha = int(255 + (130 - 255) * p)
            # Crossfade: arrow fades out, checkmark fades in
            arrow_alpha = int(255 * (1 - p))
            check_alpha = int(last_alpha * p)
        else:
            last_font_size = FONT_SIZE_COMPLETED
            last_alpha = 130
            arrow_alpha = 0
            check_alpha = last_alpha

        font = fonts[last_font_size]

        # Draw checkmark version
        if check_alpha > 0:
            txt_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
            txt_draw = ImageDraw.Draw(txt_layer)
            txt_draw.text((MARGIN_LEFT, ACTIVE_Y), "\u2713  " + last_name, font=font,
                          fill=(*WHITE, check_alpha))
            img = Image.alpha_composite(img, txt_layer)

        # Draw arrow version (fading out)
        if arrow_alpha > 0:
            txt_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
            txt_draw = ImageDraw.Draw(txt_layer)
            txt_draw.text((MARGIN_LEFT, ACTIVE_Y), "\u25b8  " + last_name, font=font,
                          fill=(*WHITE, arrow_alpha))
            img = Image.alpha_composite(img, txt_layer)

    elif current_idx < len(TASKS):
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
        task_label = "All done" if current_idx >= len(TASKS) else TASKS[current_idx][0]
        print(f"  Frame {frame}/{TOTAL_FRAMES} ({t:.1f}s) \u2014 Task: {task_label}")

print(f"\nDone! {TOTAL_FRAMES} frames in {OUT_DIR}")
