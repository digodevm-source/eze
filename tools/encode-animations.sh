#!/usr/bin/env bash
# Turns the source loops in media-src/ into the files the site plays.
#
#   assets/film/<name>.mp4    60 fps H.264, one loop. The page decodes it with
#                             the browser's hardware video decoder (WebCodecs)
#                             and draws it on a canvas, looping seamlessly.
#   assets/anim/<name>.avif   25 fps looping animated image, the fallback for
#   assets/anim/<name>.webp   browsers without WebCodecs (WebP if no AVIF).
#
# 60 fps: the 25 fps sources are motion-interpolated. To keep the loop whole,
# each clip is retimed very slightly so one loop is a whole number of 60 fps
# frames (0.96 s -> 58 frames, 0.48 s -> 29 frames: 0.7 % slower; the 6 s
# sphere is exactly 360 frames). Three copies are interpolated and only the
# middle one is kept, so the frames across the seam are interpolated too.
#
# Blacks are crushed to true #000 so the frames melt into the page background
# and colour is removed (the site is pure monochrome).
#
# Usage: tools/encode-animations.sh [film|anim]   (default: both)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/film assets/anim
ONLY=${1:-all}

GRADE="hue=s=0,curves=all='0/0 0.035/0 0.09/0.07 1/1',format=yuv420p"

film() { # name size-filter frames-at-60 source-loop-seconds
  local name=$1 vf=$2 frames=$3 src_len=$4
  local len k
  len=$(python3 -c "print($frames/60)")
  k=$(python3 -c "print(($frames/60)/$src_len)")
  ffmpeg -v error -y -stream_loop 2 -i "media-src/$name.mp4" -an -vf "setpts=PTS*$k,\
minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,\
trim=start=$len:end=$(python3 -c "print(2*$len)"),setpts=PTS-STARTPTS,$vf,$GRADE" \
    -c:v libx264 -preset veryslow -tune film -crf 22 -refs 4 -bf 0 -g 9999 -x264-params slices=1 \
    -pix_fmt yuv420p -color_range tv -movflags +faststart "assets/film/$name.mp4"
  echo "film $name: $(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height,level -of csv=p=0 "assets/film/$name.mp4") $(du -h "assets/film/$name.mp4" | cut -f1)"
}

anim() { # name size-filter
  local name=$1 vf=$2
  ffmpeg -v error -y -i "media-src/$name.mp4" -vf "$vf,$GRADE" \
    -c:v libaom-av1 -crf 28 -b:v 0 -cpu-used 4 -row-mt 1 -g 300 -loop 0 "assets/anim/$name.avif"
  ffmpeg -v error -y -i "media-src/$name.mp4" -vf "$vf,$GRADE" \
    -c:v libwebp_anim -lossless 0 -quality 80 -compression_level 5 -loop 0 "assets/anim/$name.webp"
  echo "anim $name: $(du -h "assets/anim/$name.avif" "assets/anim/$name.webp" | cut -f1 | tr '\n' ' ')"
}

# Sizes are for desktop screens up to 2560 px wide.
#        name      size                                                 60fps frames  source loop
SPHERE=( sphere    "crop=560:560:120:20,scale=840:840:flags=lanczos"    360           6.00 )
RADIANCE=( radiance "scale=800:800:flags=lanczos"                       58            0.96 )
RAIN=( rain        "scale=1000:1000"                                    58            0.96 )
OFFERING=( offering "scale=1280:720:flags=lanczos"                      29            0.48 )

for clip in SPHERE RADIANCE RAIN OFFERING; do
  declare -n c=$clip
  if [[ $ONLY != anim ]]; then film "${c[0]}" "${c[1]}" "${c[2]}" "${c[3]}" & fi
  if [[ $ONLY != film ]]; then anim "${c[0]}" "${c[1]}" & fi
done
wait
