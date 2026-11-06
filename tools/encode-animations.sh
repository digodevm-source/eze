#!/usr/bin/env bash
# Turns the source loops in media-src/ into the animations the site shows.
#
# Every clip becomes an endlessly looping animated image, frame for frame and
# at the original 25 fps:
#   assets/anim/<name>.avif   main file (small, sharp)
#   assets/anim/<name>.webp   fallback for browsers without animated AVIF
#
# Animated images start by themselves in every browser (no autoplay rules,
# no play button) and loop without a seam, so the animation never stops.
#
# Blacks are crushed to true #000 so the frames melt into the page background
# and colour is removed (the site is pure monochrome).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/anim

GRADE="hue=s=0,curves=all='0/0 0.035/0 0.09/0.07 1/1',format=yuv420p"

encode() {
  local name=$1 vf=$2
  local src="media-src/$name.mp4"
  ffmpeg -v error -y -i "$src" -vf "$vf,$GRADE" \
    -c:v libaom-av1 -crf 28 -b:v 0 -cpu-used 4 -row-mt 1 -g 300 -loop 0 "assets/anim/$name.avif"
  ffmpeg -v error -y -i "$src" -vf "$vf,$GRADE" \
    -c:v libwebp_anim -lossless 0 -quality 80 -compression_level 5 -loop 0 "assets/anim/$name.webp"
  echo "$name: $(du -h "assets/anim/$name.avif" "assets/anim/$name.webp" | cut -f1 | tr '\n' ' ')"
}

# Sizes are for desktop screens up to 2560 px wide; upscaling here with
# lanczos keeps the particles crisper than the browser's own scaling.
#        name      filter                                              (source loop)
encode   sphere    "crop=560:560:120:20,scale=840:840:flags=lanczos"   # 6.00 s, 150 frames
encode   radiance  "scale=800:800:flags=lanczos"                       # 0.96 s, 24 frames
encode   rain      "scale=1000:1000"                                   # 0.96 s, 24 frames
encode   offering  "scale=1280:720:flags=lanczos"                      # 0.48 s, 12 frames
