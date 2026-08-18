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
RATE="${2:-142}"
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

# The [[slnc N]] markers are `say`'s embedded pause command, in milliseconds,
# and [[pbas]] sets the pitch base. They are most of the difference between
# "robotic" and "delivered": a synthesised voice reading a sentence flat out
# is what sounds machine-made, and real speakers breathe at the commas. Do not
# strip them when editing the wording -- rewrite around them.
#
# The single biggest quality win is not here though. It is installing a
# Premium voice: System Settings > Accessibility > Spoken Content >
# System Voice > Manage Voices, pick an English (US) voice marked Premium,
# download it, then re-run this script naming that voice. Free, a few minutes,
# and a different class of result from the built-in voices.
gen intro        "[[pbas 44]][[slnc 150]]Look at the screen. [[slnc 320]] Take a moment. [[slnc 360]] And think of any one of these. [[slnc 200]]"
gen round1       "[[pbas 44]][[slnc 120]]Now, [[slnc 240]] move to the closest one that has a face. [[slnc 320]] Not your own. [[slnc 360]] If two look equally close, [[slnc 160]] take either."
gen round2       "[[pbas 44]][[slnc 120]]Now, [[slnc 200]] move to the food [[slnc 150]] nearest to you."
gen round3       "[[pbas 44]][[slnc 120]]Now, [[slnc 200]] move to the nearest thing [[slnc 220]] you could pick up and hold."
gen round4       "[[pbas 44]][[slnc 120]]Now, [[slnc 200]] move to the animal [[slnc 150]] nearest to you."
gen round5-logo  "[[pbas 44]][[slnc 150]]And finally. [[slnc 420]] Move to the nearest logo."
gen round5-green "[[pbas 44]][[slnc 150]]And finally. [[slnc 420]] Move to the green thing nearest to you."
# Played when the reveal is triggered, over the start of the vanish. Without it
# the routine simply stopped talking after the last move and the room did not
# know it was finished choosing.
gen hold         "[[pbas 44]][[slnc 150]]Now stay exactly where you are. [[slnc 340]] Don't move. [[slnc 380]] Lock it in, [[slnc 220]] and keep your eyes on it."
echo
echo "Done. Hear the whole run:"
echo "  for f in intro round1 round2 round3 round4 round5-logo; do afplay $OUT/\$f.m4a; sleep 1.2; done"
