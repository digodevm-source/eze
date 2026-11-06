#!/usr/bin/env bash
# Re-encodes the source loops in media-src/ into the files the site plays.
#
# For every clip two files are written to assets/video/:
#   <name>.seg.mp4  fragmented MP4, a whole number of loops (~2 s). The page
#                   appends it to a MediaSource again and again, so playback
#                   never seeks back to 0 and the loop has no seam.
#   <name>.mp4      regular MP4 (~5 s) for browsers without MediaSource; it
#                   plays with the native `loop` attribute.
# Plus a poster frame in assets/img/<name>.jpg.
#
# Blacks are crushed to true #000 so the clips melt into the page background,
# colour is removed (the site is pure monochrome) and B-frames are disabled so
# every loop boundary lands exactly on a frame.
set -euo pipefail
cd "$(dirname "$0")/.."

GRADE="hue=s=0,curves=all='0/0 0.035/0 0.09/0.07 1/1',format=yuv420p"
X264=(-an -c:v libx264 -preset veryslow -tune film -crf 24 -refs 16 -bf 0 -g 9999 -pix_fmt yuv420p -color_range tv)

encode() {
  local name=$1 vf=$2 seg_loops=$3 full_loops=$4
  local src="media-src/$name.mp4"
  ffmpeg -v error -y -stream_loop $((seg_loops - 1)) -i "$src" -vf "$vf,$GRADE" "${X264[@]}" \
    -movflags +frag_keyframe+empty_moov+default_base_moof "assets/video/$name.seg.mp4"
  ffmpeg -v error -y -stream_loop $((full_loops - 1)) -i "$src" -vf "$vf,$GRADE" "${X264[@]}" \
    -movflags +faststart "assets/video/$name.mp4"
  ffmpeg -v error -y -i "assets/video/$name.mp4" -frames:v 1 -q:v 3 "assets/img/$name.jpg"
  echo "$name: $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,profile,level -of csv=p=0 "assets/video/$name.seg.mp4")"
}

#        name      filter                          seg  full   (source loop length)
encode   sphere    "crop=560:560:120:20"             1    1   # 6.00 s, 150 frames
encode   radiance  "scale=640:640:flags=lanczos"     2    5   # 0.96 s, 24 frames
encode   rain      "scale=860:860:flags=lanczos"     2    5   # 0.96 s, 24 frames
encode   offering  "scale=960:540:flags=lanczos"     4   10   # 0.48 s, 12 frames
