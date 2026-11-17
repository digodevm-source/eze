#!/bin/bash
# Concatenate rendered segments and add the song clip -> out/more_tiktok.mp4
set -e
cd "$(dirname "$0")"
printf "file 'seg/a.mp4'\nfile 'seg/b.mp4'\nfile 'seg/c.mp4'\n" > out/list.txt
ffmpeg -v error -y -f concat -safe 0 -i out/list.txt -i audio/clip.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/more_tiktok.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact out/more_tiktok.mp4
