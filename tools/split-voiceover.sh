#!/usr/bin/env bash
#
# split-voiceover.sh <recording.mp3>
#
# Splits a single ElevenLabs take generated from tools/voiceover-script.txt into
# the eight files public/vo/ expects, in the order that script lays out.
#
# It relies on that script's 3.0s separators being far longer than its 0.4s
# in-line pauses: the cut threshold sits between the two, so there is nothing to
# identify by ear. If the take was recorded some other way, do NOT trust this --
# splitting the first take on silence produced seven segments where eight were
# expected and mis-assigned two of them.
#
set -euo pipefail

SRC="${1:?usage: split-voiceover.sh <recording.mp3>}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/vo"
NAMES=(intro round1 round2 round3 round4 round5-logo round5-green hold)

command -v ffmpeg >/dev/null || { echo "ffmpeg required: brew install ffmpeg"; exit 1; }

# Boundaries: silences longer than 1.5s. In-line pauses are 0.4s so they are
# nowhere near this; the separators are 3.0s so they always are.
mapfile -t BOUNDS < <(
  ffmpeg -i "$SRC" -af "silencedetect=noise=-38dB:d=1.5" -f null - 2>&1 |
  grep -oE "silence_(start|end): [0-9.]+" | awk '{print $1, $2}'
)

STARTS=(0); ENDS=()
for b in "${BOUNDS[@]}"; do
  key="${b%% *}"; val="${b##* }"
  [ "$key" = "silence_start:" ] && ENDS+=("$val")
  [ "$key" = "silence_end:" ] && STARTS+=("$val")
done
ENDS+=("$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")")

echo "found ${#STARTS[@]} segments (expecting ${#NAMES[@]})"
if [ "${#STARTS[@]}" -ne "${#NAMES[@]}" ]; then
  echo
  echo "REFUSING TO SPLIT. The count does not match, so every file after the"
  echo "mismatch would be the wrong line -- and a wrong line at the finish is"
  echo "the worst possible failure. Check the take used the 3.0s separators."
  exit 1
fi

mkdir -p "$OUT"
for i in "${!NAMES[@]}"; do
  # Trim the edges, re-pad 150ms head and 200ms tail, and normalise so every
  # line sits at the same level through a PA.
  ffmpeg -y -loglevel error -i "$SRC" -ss "${STARTS[$i]}" -to "${ENDS[$i]}" \
    -af "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,areverse,adelay=150,apad=pad_dur=0.2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100" \
    -ac 1 -c:a libmp3lame -b:a 128k "$OUT/${NAMES[$i]}.mp3"
  printf "  %-18s %5.2fs\n" "${NAMES[$i]}.mp3" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/${NAMES[$i]}.mp3")"
done

echo
echo "Done. Play the run through before trusting it:"
echo "  for f in intro round1 round2 round3 round4 round5-logo hold; do afplay $OUT/\$f.mp3; sleep 1; done"
