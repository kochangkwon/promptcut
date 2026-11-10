#!/usr/bin/env bash
# Regenerate the sample media. The generated files are committed, so this is
# only needed when changing them. Requires ffmpeg.
#
# The two clips differ on purpose — landscape vs portrait, 30fps vs 24fps,
# stereo vs silent — so they exercise the normalisation the engine has to do
# before it can concatenate anything.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }

common=(-c:v libx264 -preset veryfast -crf 34 -pix_fmt yuv420p -movflags +faststart)

echo "clip-a: 1920x1080, 30fps, with audio"
ffmpeg -y -loglevel error \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=8" \
  -f lavfi -i "sine=frequency=320:duration=8" \
  -vf "hue=h=20:s=0.8,format=yuv420p" \
  "${common[@]}" -c:a aac -b:a 64k \
  -metadata creation_time="2019-05-12T10:22:00+09:00" \
  clip-a.mp4

echo "clip-b: 1080x1920 portrait, 24fps, silent"
ffmpeg -y -loglevel error \
  -f lavfi -i "testsrc2=size=1080x1920:rate=24:duration=6" \
  -vf "hue=h=180:s=0.7,format=yuv420p" \
  "${common[@]}" -an \
  -metadata creation_time="2021-08-03T16:40:00+09:00" \
  clip-b.mp4

echo "music: 20s four-note loop"
ffmpeg -y -loglevel error \
  -f lavfi -i "aevalsrc=exprs='0.25*sin(2*PI*262*t)*exp(-3*mod(t\,1.25))+0.18*sin(2*PI*330*t)*exp(-3*mod(t+0.9\,1.25))+0.14*sin(2*PI*392*t)*exp(-3*mod(t+1.7\,2.5))':s=44100:d=20" \
  -af "afade=t=in:d=1,afade=t=out:st=18:d=2,volume=1.6" \
  -c:a libmp3lame -b:a 96k music.mp3

echo "posters"
ffmpeg -y -loglevel error -ss 2 -i clip-a.mp4 -frames:v 1 -vf "scale=320:-2" poster-a.jpg
ffmpeg -y -loglevel error -ss 2 -i clip-b.mp4 -frames:v 1 -vf "scale=-2:180" poster-b.jpg

ls -lh clip-a.mp4 clip-b.mp4 music.mp3 poster-a.jpg poster-b.jpg
