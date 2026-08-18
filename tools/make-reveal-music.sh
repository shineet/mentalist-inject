#!/usr/bin/env bash
#
# make-reveal-music.sh — builds the reveal sting for the interactive routine.
#
# Timed against the vanish, not written to taste. From audience.js:
#   SPREAD 2200ms   the field closes inward
#   HOLD    350ms   a beat with the screen empty
#   then the survivor grows over 1.1s
# So the logo starts landing at 2.55s. The impact sits there.
#
# Everything is synthesised by ffmpeg -- no samples, no licences, nothing to
# host. Percussion works far better this way than melody does: an earlier
# attempt at synthesised ambient music was rejected as "not music", but drums
# are transients and shaped noise, which is exactly what this can do well.
#
#   ./tools/make-reveal-music.sh
#
set -euo pipefail

OUT="$(cd "$(dirname "$0")/.." && pwd)/public/reveal-music.mp3"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
command -v ffmpeg >/dev/null || { echo "ffmpeg required: brew install ffmpeg"; exit 1; }

gen() { ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=$1:s=44100:d=$2" -ac 1 "$TMP/$3.wav"; }

# A kick: pitch drops fast from ~200Hz to 45Hz, with a click on the front.
gen "0.85*sin(2*PI*t*(45+165*exp(-t*30)))*exp(-t*8) + 0.25*random(0)*exp(-t*160)" 0.55 kick

# The impact. Lower, slower, and it rings -- this is the one that has to feel
# like the logo hitting the screen.
gen "0.95*sin(2*PI*t*(30+110*exp(-t*16)))*exp(-t*1.9) + 0.30*random(0)*exp(-t*7) + 0.20*sin(2*PI*t*(60+40*exp(-t*10)))*exp(-t*1.2)" 7 impact

# A riser under the build: tone climbing, noise swelling, both getting louder.
# A comma inside an expression ends the ffmpeg option, so pow(x,y) cannot be
# used here -- the ramp is written out as a product instead.
gen "(0.16*sin(2*PI*t*(170+520*t*t)) + 0.09*random(0))*(t/2.55)*(t/2.55)" 2.55 riser

# Low pulse for the tail, so the reveal has somewhere to sit while Shine talks.
gen "0.30*sin(2*PI*t*(38+50*exp(-t*12)))*exp(-t*2.6)" 2.2 pulse

# Accelerating kicks into the impact, then a slow heartbeat after it.
#
# The build kicks RAMP IN VOLUME. That matters more than it sounds: the first
# version had them all at one level and ran loudnorm over the result, which
# flattened the whole piece to -4dB from the first beat and left the impact no
# louder than the build. A thud is only a thud relative to what came before, so
# the dynamics are set here and deliberately not normalised away afterwards.
#   time_ms:volume
BUILD="0:0.14 620:0.18 1150:0.22 1560:0.27 1870:0.32 2100:0.38 2280:0.44 2410:0.50"
TAIL="4100:0.30 5600:0.26 7100:0.22 8600:0.18 10100:0.14 11600:0.11"

inputs=(); filters=(); n=0
add() { inputs+=(-i "$TMP/$1.wav"); filters+=("[$n:a]adelay=$2|$2,volume=$3[a$n]"); n=$((n+1)); }

add riser 0 0.55
for spec in $BUILD; do add kick "${spec%%:*}" "${spec##*:}"; done
add impact 2550 1.0                      # the loudest thing in the piece
for spec in $TAIL; do add pulse "${spec%%:*}" "${spec##*:}"; done

mixed=""
for ((i=0;i<n;i++)); do mixed="$mixed[a$i]"; done

# No loudnorm. A fixed gain and a limiter only as a safety net, so the shape
# survives: quiet build, loud impact, decaying tail.
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex \
  "$(IFS=';'; echo "${filters[*]}");${mixed}amix=inputs=$n:normalize=0[m];\
   [m]volume=1.25,alimiter=level_in=1:level_out=0.97:limit=0.97:attack=1:release=60,\
   afade=t=out:st=13.5:d=3,aresample=44100[out]" \
  -map "[out]" -t 16.5 -ac 2 -c:a libmp3lame -b:a 192k "$OUT"

printf "wrote %s  %.2fs\n" "$OUT" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")"
echo "impact lands at 2.55s, matching SPREAD+HOLD in audience.js"
