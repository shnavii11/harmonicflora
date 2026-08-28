# HarmonicFlora

**A voice-driven living plant.** You hum, sing, or speak, and a procedural plant grows,
sways, blooms, and wilts on screen in real time. Your *tone* (pitch, loudness, timbre)
shapes how it grows. Your *words* (spoken commands) trigger events like blooming or rain.

**There is no transcript anywhere on screen.** The plant is the entire interface — voice
goes in, a growing plant comes out.

> Built for the ComSync Round 2 task. Solo build.

---

## What it is

Point your microphone at your voice and the plant responds continuously — it is never a
static image and never a one-shot animation. Every frame, the plant's shape, color,
health, and motion are recomputed from what your voice is doing *right now*:

- **Pitch** bends the whole plant: a high voice makes branches **reach upward, spread
  wider, and blossom**; a low voice makes them **droop and wilt**.
- **Loudness** drives **growth speed** and **glow** (and rising glow motes when healthy).
- **Timbre** (bright "eee" vs. round "ohh") shifts the **color** from vivid gold to deep green.
- **Silence** lets the plant **settle and shed petals** — vitality decays, so it visibly
  "breathes" rather than freezing.

A subtle legend in the corner tells the viewer exactly which vocal gesture does what.

---

## Why these choices (the voice-agent angle)

ComSync builds voice agents. This project deliberately demonstrates the two most
fundamental primitives of *any* voice-agent pipeline, wrapped in something non-obvious:

1. **Voice Activity Detection (VAD)** — knowing when someone is *actually speaking* vs.
   silent / breathing / background noise. This is the headline deliverable and the one
   thing measured properly (see below). In the plant, VAD decides whether the plant grows
   at all: good VAD = smooth, intentional growth; bad VAD = a plant that twitches and
   stalls on every pause.

2. **Streaming speech-to-text commands** — spoken keywords become visual events, never
   text on screen. The transcript is consumed and thrown away; only the visual moment
   remains. *(Scaffolded; wired in the Deepgram phase.)*

**The one rule never broken:** no scrolling chat log, no transcript, no text of what was
said. Just the plant.

---

## The measured thing — VAD, before/after

The naive way to detect speech is a **fixed loudness threshold** ("active if RMS > 0.015").
It fires on breaths and room noise, flickers during natural pauses, and a number tuned for
a quiet room fails in a noisy one.

Our VAD fixes this with two ideas:

- **Adaptive threshold** — on startup we listen to ~1 second of room tone, measure the
  actual noise floor, and set the trigger *relative to it*. No magic constant.
- **Hysteresis (Schmitt trigger) + hold** — a higher threshold to *start* detecting speech
  and a lower one to *stop*, plus a hold time so brief pauses between words don't cut growth
  off.

The **same `src/audio/vad.ts`** runs both in the browser and in the Node benchmark, so the
reported numbers describe the real shipped code. Record a few real `.wav` clips into
`benchmark/audio/`, label the speech intervals in `benchmark/audio/labels.json`, then:

```bash
npx tsx benchmark/run.ts
```

This writes `benchmark/artifacts/report.md` (a human-readable before/after table),
`results.json`, and `results.csv`. Metrics: false activations, missed onsets, flicker rate,
onset latency, and frame accuracy — baseline vs. ours, per clip and aggregate.

> Onset latency is *slightly worse* than the naive baseline by design — that's the honest
> cost of hysteresis, and the right tradeoff for far fewer false triggers.

---

## Every value and what it does (the defense sheet)

All tunable numbers live in **`src/config.ts`**. This is the "why every number" table.

### Audio & VAD

| Parameter | Value | What it does / why |
|-----------|-------|--------------------|
| `FRAME_SIZE` | `512` | Analysis window in samples (power of two). ~11 ms/frame at 44–48 kHz — small enough to feel instant, large enough for stable pitch/FFT. 256 → noisier + more CPU; 1024 → laggy. |
| `NOISE_CALIBRATION_MS` | `1000` | How long we listen to room tone on startup to estimate the noise floor. Shorter → noisy estimate; longer → annoying startup wait. |
| `VAD_ONSET_MARGIN_DB` | `+9 dB` | Trigger threshold **above the measured noise floor**. Speech is typically ≥10–15 dB above room noise, so +9 dB catches speech while ignoring the floor and most breaths. |
| `VAD_OFFSET_MARGIN_DB` | `+4 dB` | Release threshold, below the trigger (Schmitt hysteresis). The gap prevents on/off flicker once you're speaking. |
| `VAD_HOLD_MS` | `600` | How long VAD stays "active" after energy drops. Natural inter-word pauses are ~150–300 ms; 600 ms means the plant doesn't stall each time you breathe mid-sentence. |
| `SMOOTHING_ALPHA` | `0.3` | Exponential moving average: `y = 0.3·x + 0.7·y_prev`. ~40 ms effective response — live but jitter-free. |
| `PITCH_MIN_HZ` | `70` | Bottom of the pitch range. Below typical human phonation; lower is almost certainly noise. |
| `PITCH_MAX_HZ` | `500` | Top of the pitch range. Covers low speech (~85 Hz) through high humming/singing. Above this is usually a harmonic error. |
| `PITCH_CLARITY_MIN` | `0.9` | Rejects unvoiced/noisy frames (Pitchy's 0–1 clarity). Keeps branch angle from jumping on consonants or noise. |

### Living-plant behavior

| Parameter | Value | What it does / why |
|-----------|-------|--------------------|
| `GROWTH_SPEED` | `0.42` | How fast the plant matures **while voiced** (per second, scaled by loudness and pitch). Higher → fills out faster. |
| `VITALITY_RISE` | `0.06` | How fast the plant's health/turgor climbs while you speak. Drives perking-up, saturation, and blossoming. |
| `VITALITY_DECAY` | `0.016` | How fast it wilts in silence. Lower = the plant holds its shape longer after you stop; higher = wilts sooner. |
| `BIAS_MAX` | `0.55` | Max radians branches lift **up** (high pitch/health) or droop **down** (low pitch/silence). The core of "reach vs. wilt". |
| `BRANCH_FALLOFF` | `0.76` | Each child branch's length relative to its parent. Higher → taller, sparser; lower → shorter, denser. |
| `LSYSTEM_MAX_DEPTH` | `5` | Recursion depth of the tree. Deeper = more leaves/flowers but heavier to render. |
| `MAX_PARTICLES` | `220` | Cap on falling petals + rising motes, so a burst can't tank the frame rate. |
| `MAX_GROWTH_PER_FRAME` | `8` | Upper bound on new geometry added per frame — decouples audio rate from render rate. |

### Deployment

| Parameter | Value | What it does / why |
|-----------|-------|--------------------|
| `DEEPGRAM_TOKEN_TTL_S` | `30` | Lifetime of the short-lived Deepgram token minted server-side. Long enough to open the WebSocket; short enough to limit damage if it ever leaked. |

The full narrative version of this table is in **`docs/parameters.md`**.

---

## Voice → plant mapping (quick reference)

| Voice feature | Drives | Feel |
|---------------|--------|------|
| **Pitch** (log 70–500 Hz) | branch lift/droop, spread, blossoming | high → reach up & bloom; low → droop & wilt |
| **Loudness** (RMS) | growth speed + glow + motes | louder → faster, brighter, more alive |
| **Timbre** (spectral centroid) | leaf/branch hue | bright → vivid gold; round → deep green |
| **Motion** (spectral flux) | sway amount | dynamic voice → the plant shimmers |
| **VAD state** | growth on/off gate | true silence → the plant settles |

---

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Build | **Vite + TypeScript** | Fast dev server; types catch mistakes. |
| Audio features | **Web Audio `AnalyserNode`** (RMS, spectral centroid, spectral flux computed directly) | Reliable per-frame data in a `requestAnimationFrame` loop. |
| Pitch | **Pitchy** | Lightweight McLeod-pitch in the browser; accurate for voice/humming. |
| Rendering | **p5.js (Canvas 2D)** | Fast to build something organic and beautiful; a recursive tree recomputed every frame gives full, continuous reactivity. |
| Streaming STT | **Deepgram** (streaming) | Low-latency WebSocket, easy keyword spotting. *(Scaffolded.)* |
| Token minting | **Vercel serverless function** | The Deepgram secret stays on the server; the browser only ever gets a 30 s token. |
| Hosting | **Vercel** | Static site + `/api` function in one repo. |

---

## Run it locally

```bash
npm install
npm run dev
```

Open the local URL, click **Enter**, allow the microphone, stay quiet ~1 second while it
calibrates to your room, then:

1. **Hum a low, steady note** → a thick trunk grows.
2. **Slide your voice higher** → branches spread, reach upward, and **white flowers bloom**.
3. **Get louder** → growth speeds up and everything brightens.
4. **Go quiet or drop low** → the plant droops, wilts, and sheds petals.
5. Press **D** anytime for the hidden debug panel (live feature values + VAD state).

---

## Project structure

```
src/
├── main.ts              app entry: mic → analysis → renderer, "Enter" + calibrate flow
├── config.ts            ALL tunable numbers (the defense sheet)
├── audio/
│   ├── mic.ts           getUserMedia + one AudioContext + AnalyserNode
│   ├── features.ts      RMS, spectral centroid, spectral flux from the AnalyserNode
│   ├── pitch.ts         Pitchy wrapper (fundamental frequency + clarity)
│   ├── vad.ts           ★ PURE VAD (adaptive + hysteresis) — shared with the benchmark
│   ├── calibrate.ts     measures room noise floor on startup
│   └── smoothing.ts     exponential moving average
├── mapping/controls.ts  features → expressive, normalized plant controls
├── render/
│   ├── sketch.ts        p5 loop: recursive living plant, leaves, blossoms, glow
│   ├── plant.ts         plant state: growth + vitality + eased display params
│   ├── particles.ts     falling petals + rising glow motes
│   └── palette.ts       color helpers
├── stt/                 Deepgram streaming + keyword→event mapping (scaffolded)
└── ui/                  Enter overlay, corner legend, debug panel

api/deepgram-token.ts    serverless: mints a 30 s Deepgram token from the secret key
benchmark/               ★ the VAD measurement (run.ts, baseline, labels, artifacts)
docs/parameters.md       the full "why every number" table
```

---

## Honest limitations

- Pitch detection assumes a mostly monophonic voice; it won't track chords or two people.
- VAD is tuned for a single speaker near the mic in a typical room; very noisy environments
  will still leak some false activations (the benchmark shows how much).
- Benchmark labels are hand-made on a handful of clips — enough to show a real, honest
  delta, not a formal academic evaluation.
- Onset latency is slightly worse than the naive baseline by design — the cost of hysteresis.

---

## Future scope

- **Barge-in / interrupt latency** — measure how fast a new voice onset redirects the plant
  mid-action (the hardest problem in real voice agents). Same VAD core, new measurement.
- **TTS feedback** — the plant whispers back at growth milestones, closing a full
  voice-in → visual → voice-out loop.
