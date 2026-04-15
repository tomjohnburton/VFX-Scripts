#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/tomburton/Projects/VFX Scripts/public"
FOLDERS=("air fryer" "microwave to table" "shirt folding ur5")
CAMS=("base:goal_base_0_camera_rgb_image.mp4" "left:goal_left_wrist_0_camera_rgb_image.mp4" "right:goal_right_wrist_0_camera_rgb_image.mp4")
THRESHOLD=0.02

for folder in "${FOLDERS[@]}"; do
  dir="$ROOT/$folder"
  out="$dir/frames"
  mkdir -p "$out"
  base="$dir/goal_base_0_camera_rgb_image.mp4"

  duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$base")
  cuts=$(ffmpeg -i "$base" -vf "select='gt(scene,$THRESHOLD)',showinfo" -f null - 2>&1 \
    | grep -oE "pts_time:[0-9.]+" | sed 's/pts_time://')

  # Build boundaries: 0, cuts..., duration
  boundaries=(0)
  while IFS= read -r t; do [ -n "$t" ] && boundaries+=("$t"); done <<< "$cuts"
  boundaries+=("$duration")

  echo "=== $folder: ${#boundaries[@]} boundaries → $((${#boundaries[@]} - 1)) frames ==="

  for cam_entry in "${CAMS[@]}"; do
    cam_name="${cam_entry%%:*}"
    cam_file="${cam_entry##*:}"
    src="$dir/$cam_file"
    for ((i = 0; i < ${#boundaries[@]} - 1; i++)); do
      start="${boundaries[$i]}"
      end="${boundaries[$((i + 1))]}"
      mid=$(awk -v s="$start" -v e="$end" 'BEGIN{printf "%.3f", (s+e)/2}')
      idx=$(printf "%02d" "$i")
      dest="$out/${cam_name}_${idx}.jpg"
      ffmpeg -loglevel error -y -ss "$mid" -i "$src" -frames:v 1 -q:v 2 "$dest"
    done
    echo "  $cam_name → $((${#boundaries[@]} - 1)) jpgs"
  done
done
