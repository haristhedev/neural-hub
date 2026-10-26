#!/usr/bin/env bash
# Converts docs/media/raw/*.webm (from `pnpm demo:record`) into optimised GIFs in docs/media/.
# Usage: docs/make-gifs.sh [width=720] [fps=10] [speed=1.3]
# Uses gifsicle for a final pass when it is on PATH (or set GIFSICLE=/path/to/gifsicle).
set -euo pipefail
cd "$(dirname "$0")/media"
WIDTH="${1:-720}"
FPS="${2:-10}"
SPEED="${3:-1.3}"
GIFSICLE="${GIFSICLE:-$(command -v gifsicle || true)}"
shopt -s nullglob
for src in raw/*.webm; do
  name="$(basename "$src" .webm)"
  # drop the first 0.6s (blank page while the browser warms up), speed up slightly, one palette per clip,
  # no dithering: the UI is flat dark colours and dithering noise would balloon the file size
  ffmpeg -v error -y -ss 0.6 -i "$src" \
    -vf "setpts=PTS/${SPEED},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    -loop 0 "${name}.gif"
  [ -n "$GIFSICLE" ] && "$GIFSICLE" -O3 --no-warnings "${name}.gif" -o "${name}.gif"
  printf '%-28s %s\n' "${name}.gif" "$(du -h "${name}.gif" | cut -f1)"
done
