# Benchmark Audio Clips

Record 6–8 short clips (10–20 s each) as `.wav` and place them here.

Scenarios to cover (see PLAN.md §7 for detail):
1. `clip1-pauses.wav`   — natural speech with pauses
2. `clip2-hum.wav`      — humming a sustained note
3. `clip3-silence.wav`  — silence in a slightly noisy room
4. `clip4-breath.wav`   — breathing near the mic
5. `clip5-noisy.wav`    — speaking with background noise
6. `clip6-quiet.wav`    — soft/quiet speech

One-line recording command (Mac):
```
rec -r 44100 -c 1 clip1-pauses.wav trim 0 15
```
(requires `sox`: `brew install sox`)

Labels go in `labels.json` — see PLAN.md §7 for the format.
