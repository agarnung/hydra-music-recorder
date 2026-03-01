#!/bin/bash

INPUT="$1"
OUTPUT="${2:-output_youtube_1080p.mkv}"

ffmpeg -i "$INPUT" \
-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
-c:v libx264 \
-profile:v high \
-level 4.1 \
-pix_fmt yuv420p \
-preset slow \
-b:v 12M \
-maxrate 12M \
-bufsize 24M \
-c:a aac \
-b:a 320k \
-ac 2 \
"$OUTPUT"
