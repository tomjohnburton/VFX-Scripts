# VFX Scripts

Python scripts for generating motion graphics overlays (ProRes 4444 with alpha) for video compositing.

## Scripts

- **progress_bar.py** — Training timeline progress bar with variable-speed playback and labelled phases
- **policy_switch.py** — Side-by-side "base model" / "RL active" text overlay with activation animation
- **drone_cam.py** — Animated border + label for a picture-in-picture drone camera window
- **apple_text_reveal.py** — Apple-style text reveal animation
- **histogram_anim.py** — Animated histogram overlay
- **teleop_control_transfer.py** — Teleoperation control transfer indicator
- **rl_active_led.py** — RL active LED status indicator
- **gen_task_carousel_v2.py** / **v3** — Task carousel card animations
- **gen_book_stack.py** — Book stack animation

## Requirements

```
pip install pillow numpy
```

[ffmpeg](https://ffmpeg.org/) must be available on PATH.

## Usage

```bash
python3 <script>.py
```

Each script renders a `.mov` file (3840×2160, 60fps, ProRes 4444 with alpha transparency).
