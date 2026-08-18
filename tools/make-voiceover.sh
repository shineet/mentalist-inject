#!/usr/bin/env bash
#
# make-voiceover.sh — regenerates the interactive routine's spoken lines.
#
# Uses macOS's own `say`, so there is no API key, no account, and no network
# dependency at showtime. The files are committed and served from /vo.
#
#   ./tools/make-voiceover.sh              # default voice
#   ./tools/make-voiceover.sh Karen        # a different voice
#   ./tools/make-voiceover.sh Samantha 150 # and a different pace, words/minute
#
# Hear the installed voices first:
#   say -v '?' | grep en_
# Samantha is the warm US female voice; Karen is Australian, Moira Irish,
# Tessa South African. More can be added under System Settings, Accessibility,
# Spoken Content, System Voice, Manage Voices -- the Premium ones are markedly
# better than the defaults and are worth the download for a paid show.
#
# The wording here is written for the EAR, which is why it does not match the
# `say` strings in public/interactive-set.js word for word. Those are written
# to be read on a host panel: short, shouty capitals, an em dash. Spoken aloud
# the capitals do nothing and the dash needs to be a real pause. Keep the two
# in agreement in MEANING; they do not need to agree in punctuation.

set -euo pipefail

VOICE="${1:-Samantha}"
RATE="${2:-158}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/vo"

command -v ffmpeg >/dev/null || { echo "ffmpeg required: brew install ffmpeg"; exit 1; }
# Match against the installed list rather than trying to speak: `say` with
# empty text fails for every voice, which made the obvious check useless.
say -v '?' | awk '{print $1}' | grep -qx "$VOICE" || {
  echo "No such voice: $VOICE"
  echo "Installed English voices:"
  say -v '?' | grep -E 'en_(US|GB|AU|IE|ZA)' | sed 's/^/  /'
  exit 1
}

mkdir -p "$OUT"
TMP="$(mktemp -t voiceover).aiff"
trap 'rm -f "$TMP"' EXIT

gen() {
  say -v "$VOICE" -r "$RATE" -o "$TMP" "$2"
  # loudnorm so every line lands at the same level through a PA -- an
  # instruction nobody hears is worse than no voice over at all.
  ffmpeg -y -loglevel error -i "$TMP" \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100" \
    -ac 2 -c:a aac -b:a 128k "$OUT/$1.m4a"
  printf '  %-18s %5.1fs  %s\n' "$1.m4a" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$1.m4a")" "$2"
}

echo "Voice: $VOICE at $RATE wpm -> $OUT"
gen intro        "Look at the screen. Take a moment. And think of any one of these."
gen round1       "Now, move to the closest one that has a face. Not your own. If two look equally close, take either."
gen round2       "Now move to the food nearest to you."
gen round3       "Now move to the nearest thing you could pick up and hold."
gen round4       "Now move to the animal nearest to you."
gen round5-logo  "And finally. Move to the nearest logo."
gen round5-green "And finally. Move to the green thing nearest to you."
echo
echo "Done. Hear the whole run:"
echo "  for f in intro round1 round2 round3 round4 round5-logo; do afplay $OUT/\$f.m4a; sleep 1.2; done"
