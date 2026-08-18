# Voice over files

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

## Falling back

`tools/make-voiceover.sh [voice] [rate]` regenerates the `.m4a` set from macOS
voices. Those stay in place as a backstop: delete an `.mp3` and that line
reverts to the generated one on the next page load.
