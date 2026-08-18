# Voice over files

**Current state:** seven of the eight lines are Shine's recorded voice, split
from a single take (`tools/voiceover-master.mp3`, 2026-08-17). Only
**`round5-logo`** is still the machine voice -- it was simply never recorded.
That is the ending used on every show WITH a client logo, so it is the one
worth recording next. The host panel names whatever is still missing for the
finish actually armed.

**What is in the master take, in order.** Establish this by listening, never by
reasoning from durations -- three separate attempts to infer it from segment
lengths were wrong, and the last two segments differ by 0.15s:

1. intro
2. round1 (faces)
3. round2 (food)
4. round3 (pick up and hold)
5. round4 (animal)
6. round5-**green**
7. **hold** (lock it in)

There is no logo ending in it.

Drop replacement recordings in this folder. **That is the whole installation
step** — no rename, no code change, no redeploy config.

Each line is looked up as `.mp3` first and falls back to `.m4a`, so an
ElevenLabs export named exactly as below simply takes over from the committed
macOS `say` version.

## The eight files

| Filename | What she says |
|---|---|
| `intro.mp3` | Look at the screen. Take a moment. And think of any one of these. |
| `round1.mp3` | Now, move to the closest one that has a face. Not your own. If two look equally close, take either. |
| `round2.mp3` | Now, move to the food nearest to you. |
| `round3.mp3` | Now, move to the nearest thing you could pick up and hold. |
| `round4.mp3` | Now, move to the animal nearest to you. |
| `round5-logo.mp3` | And finally. Move to the nearest logo. |
| `round5-green.mp3` | And finally. Move to the green thing nearest to you. |
| `hold.mp3` | Now stay exactly where you are. Don't move. Lock it in, and keep your eyes on it. |

Both round 5 files are needed: the app plays the logo one when a client logo is
configured for the gig and the green one when it is not. Record both even if
only one gets used this month.

## Direction

This is spoken to a room over a PA while people look at a screen, not read to
someone holding a phone. Ask for:

- **Calm and unhurried.** Slightly slower than conversational. The room is
  searching a screen while she talks, and every line is an instruction someone
  has to act on.
- **Warm, not breathy.** Confident and pleasant. Not a meditation app, not a
  hype voice.
- **Real pauses at the punctuation.** The full stops in "And finally. Move to
  the nearest logo." are deliberate — that is a beat, not a typo. Same for the
  three sentences in `hold`.
- **No rising inflection at the end.** These are instructions, not questions.
- **Even level line to line**, so nothing gets lost when the room is noisy.

## Format

MP3, 44.1kHz. Mono or stereo both fine. Leave roughly 200ms of silence at the
head and tail — no more, or the show feels like it is waiting.

If the lines come back at noticeably different volumes, normalise them
together rather than one at a time:

```bash
cd public/vo
for f in *.mp3; do
  ffmpeg -y -i "$f" -af "loudnorm=I=-16:TP=-1.5:LRA=11" "norm-$f" && mv "norm-$f" "$f"
done
```

## Re-splitting the master take

`tools/voiceover-master.mp3` is the original single-file recording. To re-cut
it, find the gaps and slice on them:

```bash
ffmpeg -i tools/voiceover-master.mp3 -af "silencedetect=noise=-38dB:d=0.45" -f null -
```

Each line is then trimmed at the edges, given 150ms of head padding and 200ms
of tail, and loudness-normalised, so they all sit at the same level:

```bash
ffmpeg -i in.mp3 -af "silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,areverse,adelay=150,apad=pad_dur=0.2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100" -ac 1 -c:a libmp3lame -b:a 128k out.mp3
```

## Falling back

`tools/make-voiceover.sh [voice] [rate]` regenerates the `.m4a` set from macOS
voices. Those stay in place as a backstop: delete an `.mp3` and that line
reverts to the generated one on the next page load.
