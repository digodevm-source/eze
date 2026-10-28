#!/usr/bin/env bash
# Final renders for the website. Usage: 3d/render_all.sh [scene-filter]
# Renders are CPU (Cycles) and take a few hours in total on 4 cores.
set -u
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/opt/tools/blender/blender}
OUT=3d/out
mkdir -p "$OUT"
only=${1:-}

run() {
  local name=$1; shift
  local scene=$1; shift
  if [ -n "$only" ] && [[ "$name" != *"$only"* ]]; then return; fi
  if [ -f "$OUT/$name.png" ] && [ -z "${FORCE:-}" ]; then echo "skip $name"; return; fi
  echo "== $name $(date +%H:%M:%S)"
  "$BLENDER" -b --factory-startup -P "3d/scenes/$scene.py" -- --out "$OUT/$name.png" "$@" \
    > "$OUT/$name.log" 2>&1
  grep -E "Saved|Error|Traceback" "$OUT/$name.log" | tail -2
}

run sosny_hero      sosny     --w 2560 --h 1440 --samples 128 --view hero --depth 1
run sosny_portrait  sosny     --w 1080 --h 1920 --samples 128 --view portrait --depth 1
run interior        interior  --w 1800 --h 1200 --samples 192
run block_wall      blocks    --w 1200 --h 960 --samples 128 --shot wall
run block_wall300   blocks    --w 1200 --h 960 --samples 128 --shot wall300
run block_partition blocks    --w 1200 --h 960 --samples 128 --shot partition
run block_ublock    blocks    --w 1200 --h 960 --samples 128 --shot ublock
run block_macro     blocks    --w 1800 --h 1200 --samples 128 --shot macro
run linia           linia     --w 1600 --h 1200 --samples 96
run sever           sever     --w 1600 --h 1200 --samples 128
run terrasa         terrasa   --w 1600 --h 1200 --samples 96
run construction    construction --w 1800 --h 1200 --samples 96
run block_stack     blocks    --w 1800 --h 1200 --samples 128 --shot stack
echo "== done $(date +%H:%M:%S)"
