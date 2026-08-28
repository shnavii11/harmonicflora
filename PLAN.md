# HarmonicFlora — Implementation Plan

> **What this is:** A voice-driven living plant. You hum, sing, or speak, and a
> procedural plant grows on screen in real time. Your *tone* (pitch, loudness,
> brightness) shapes how it grows. Your *words* (spoken commands) trigger events
> like blooming or rain. **There is no transcript anywhere on screen.** The plant
> is the entire interface.
>
> **Built for:** ComSync Round 2 task (Ojas Jain). Deadline target: Sun Aug 30.
> Solo build, ~2 days.

---

## 0. Read this first (the 60-second summary)

This project deliberately solves **two real voice-agent problems** and **measures one
of them properly on real recorded audio**:

1. **Voice Activity Detection (VAD)** — knowing when someone is actually speaking vs.
   silent/breathing/background noise. Every voice agent needs this before it does
   anything. We build a proper VAD (adaptive threshold + hysteresis) and we **measure
   it against a naive threshold on real recorded speech**, with before/after numbers.
   This is our headline deliverable — the one thing measured properly.

2. **Streaming speech-to-text commands (Deepgram)** — spoken words become visual
   events, never text on screen. This brings a real voice-AI model into the project
   and shows we can wire up streaming STT.

**Why these two:** ComSync builds voice agents. VAD and streaming STT are the two most
fundamental pieces of any voice agent pipeline. We're not decorating — we're
demonstrating the exact primitives their product runs on, wrapped in something
beautiful and non-obvious.

**The one rule we never break:** no scrolling chat log, no transcript, no text of what
was said. Voice goes in; a growing plant comes out.

---

## 1. The two problems, explained plainly

### Problem 1 — VAD (this is what we measure)

A microphone always hears *something* — fans, breathing, a car outside, the room's hum.
The naive way to detect speech is: "if the loudness crosses a fixed number, it's
speech." This is what most demos do and it's fragile:

- It fires on breaths and background noise (**false activations**).
- It flickers on/off during natural pauses between words (**flicker**).
- A fixed number that works in a quiet room fails in a noisy one, and vice versa
  (**not portable across devices/rooms**).

Our fix has two parts:

- **Adaptive threshold** — on startup we listen to ~1 second of "room tone" and measure
  the actual noise floor, then set the trigger relative to it. No magic constant.
- **Hysteresis (a Schmitt trigger)** — a higher threshold to *start* detecting speech
  and a lower one to *stop*, plus a hold time so brief pauses between words don't cut
  the plant's growth off. This is exactly how real endpointing works.

In the plant, VAD decides *whether the plant grows at all* right now. When you speak, it
grows. When you truly stop, it settles. This makes the fix visible: bad VAD = a plant
that twitches and stalls on every pause; good VAD = smooth, intentional growth.

### Problem 2 — Streaming STT commands (Deepgram)

We stream your microphone to **Deepgram's real-time STT**. We are **not** printing what
you say. We scan the transcript for a small set of **keywords** and turn each into a
visual event:

| You say...     | What happens on screen                          |
|----------------|-------------------------------------------------|
| "bloom"        | flowers burst open across the plant             |
| "rain"         | particle rain falls, the plant greens/saturates |
| "wither"       | colors desaturate, branches droop               |
| "night"        | scene darkens, fireflies/glow appear            |
| "grow"         | a strong growth surge                            |
| "reset" / "new"| plant clears and a fresh seed sprouts           |

The transcript is **consumed and thrown away** — only the visual event remains. That's
how we use a real STT model while honoring the "no transcript" rule.

---

## 2. How the pieces fit (architecture)

```
                          ┌─────────────────────────────────────────┐
                          │              BROWSER (frontend)           │
   🎤 mic ── getUserMedia ─┤                                           │
        │                 │   ┌───────────────┐   ┌────────────────┐  │
        │  (one stream,   │   │  LOCAL AUDIO   │   │   RENDERER     │  │
        │   tapped twice) │   │  ANALYSIS      │──▶│   (p5.js)      │  │
        │                 │   │  Meyda: RMS,   │   │  L-system      │  │
        │                 │   │  centroid,flux │   │  plant grows   │  │
        │                 │   │  Pitchy: pitch │   │  on <canvas>   │  │
        │                 │   │  VAD: gate ────┼──▶│  (no text!)    │  │
        │                 │   └───────────────┘   └────────────────┘  │
        │                 │           │ controls          ▲            │
        │                 │           └───────────────────┘            │
        │                 │                                            │
        │                 │   ┌───────────────┐                       │
        └─────────────────┼──▶│ DEEPGRAM WS    │  keyword ──▶ visual   │
          (raw audio via  │   │ streaming STT  │  events (bloom, rain) │
           WebSocket)     │   └───────┬───────┘                       │
                          └───────────┼───────────────────────────────┘
                                      │ needs a short-lived token
                          ┌───────────▼───────────────────────────────┐
                          │   SERVERLESS FUNCTION  /api/deepgram-token │
                          │   mints a 30-second Deepgram token using   │
                          │   the secret key (never sent to browser)   │
                          └────────────────────────────────────────────┘
```

**Key idea:** one microphone stream is used two ways at once — locally analyzed for
*tone* (continuous growth) and streamed to Deepgram for *words* (discrete events).

**Security:** the Deepgram secret key lives only on the server. The browser asks the
serverless function for a temporary 30-second token, then connects to Deepgram directly
with that. The real key is never in the frontend code or the repo. (Ojas will look at
the repo — a hardcoded key would be a red flag; this is the mature pattern.)

---

## 3. Tech stack & why each choice

| Layer            | Choice                     | Why this one |
|------------------|----------------------------|--------------|
| Build tool       | **Vite + TypeScript**      | Fast dev server, simple, types catch mistakes. |
| Audio features   | **Meyda.js**               | Purpose-built for Web Audio; gives RMS, spectral centroid, spectral flux in real time. Runs ~3× faster than real time. |
| Pitch detection  | **Pitchy**                 | Lightweight McLeod-pitch (autocorrelation) in the browser. Accurate enough for voice/humming, far lighter than CREPE. |
| Rendering        | **p5.js (Canvas 2D)**      | L-systems are well-trodden in p5; fast to build something beautiful; no WebGL complexity needed. |
| Streaming STT    | **Deepgram** (`nova` model, streaming) | Generous free tier, low-latency streaming WebSocket, easy keyword spotting. |
| Token minting    | **Vercel serverless function** | One deploy target for both the static site and the tiny secure endpoint. |
| Hosting          | **Vercel**                 | Frontend + `/api` function in one repo, free, auto-deploy from GitHub. |

**Deliberately NOT using:** WebGL2/three.js (overkill), Essentia.js (its pitch is too
slow for real time — up to 50% of audio duration), a Python backend (nothing here needs
one), dual audio streams (one mic is enough).

---

## 4. Full file tree — every file and its job

```
harmonicflora/
├── PLAN.md                     ← this document
├── START-HERE.md               ← your simple human checklist (accounts, keys, deploy)
├── README.md                   ← the submission write-up (what/why/numbers/limits)
├── package.json                ← dependencies + scripts
├── tsconfig.json               ← TypeScript config
├── vite.config.ts              ← Vite config (dev proxy to the token function)
├── index.html                  ← single page: the <canvas> + the "Enter" overlay
├── .env.example                ← shows what env vars are needed (no real secrets)
├── .env.local                  ← YOUR real Deepgram key (git-ignored, you create this)
├── .gitignore                  ← ignores node_modules, .env.local, artifacts
├── vercel.json                 ← tells Vercel how to build + where the function lives
│
├── api/
│   └── deepgram-token.ts        ← serverless: mints a 30s Deepgram token from secret key
│
├── src/
│   ├── main.ts                  ← app entry: wires mic → analysis → renderer, "Enter" flow
│   ├── config.ts                ← ALL tunable numbers in one place (the defense sheet)
│   │
│   ├── audio/
│   │   ├── mic.ts               ← getUserMedia, one AudioContext, taps the stream twice
│   │   ├── features.ts          ← Meyda setup: RMS, spectral centroid, spectral flux
│   │   ├── pitch.ts             ← Pitchy wrapper: fundamental frequency + clarity
│   │   ├── vad.ts               ← ★ PURE VAD logic (no DOM). Adaptive + hysteresis.
│   │   ├── calibrate.ts         ← measures room noise floor on startup
│   │   └── smoothing.ts         ← exponential moving average helpers
│   │
│   ├── mapping/
│   │   └── controls.ts          ← turns features → plant controls (angle, growth, hue…)
│   │
│   ├── stt/
│   │   ├── deepgram.ts          ← opens Deepgram WS with the temp token, streams audio
│   │   └── commands.ts          ← keyword → visual-event mapping (bloom, rain, …)
│   │
│   ├── render/
│   │   ├── sketch.ts            ← p5 setup/draw loop, full-screen canvas
│   │   ├── lsystem.ts           ← the L-system grammar + incremental expansion
│   │   ├── plant.ts             ← plant state: branches, leaves, flowers, growth queue
│   │   ├── particles.ts         ← rain, fireflies, pigment/glow particles
│   │   └── palette.ts           ← color themes; hue driven by spectral centroid
│   │
│   ├── ui/
│   │   ├── overlay.ts           ← the "Enter" screen + mic-permission prompt, then fades
│   │   └── debug.ts             ← hidden panel (press D): live feature values + FPS
│   │
│   └── styles.css               ← full-screen dark canvas, elegant "Enter" button
│
├── benchmark/                   ← ★ THE MEASUREMENT (headline deliverable)
│   ├── run.ts                   ← Node script: runs both VADs on real audio, writes report
│   ├── vad-baseline.ts          ← the NAIVE VAD (fixed threshold, no hysteresis)
│   ├── label.ts                 ← helper to hand-label speech/silence in a clip
│   ├── audio/                   ← YOUR real recorded .wav clips go here
│   │   ├── README.md            ← what to record (see §7)
│   │   └── labels.json          ← ground-truth speech intervals per clip
│   └── artifacts/               ← generated: report.md, results.json, results.csv
│
└── docs/
    └── parameters.md            ← the "why every number" table (Ojas's follow-up call)
```

> **Note for whoever implements this (Claude CLI):** `src/audio/vad.ts` must be a
> **pure function/class with no Web Audio or DOM imports** — it takes a stream of RMS
> values (numbers) and returns state. This is critical: the browser app AND the Node
> benchmark both import the *same* `vad.ts`, so the measured numbers describe the real
> shipped code, not a copy. Do not duplicate VAD logic.

---

## 5. The parameters and WHY each value (the defense sheet)

Every number below lives in `src/config.ts`. On the follow-up call, Ojas will ask where
each came from. Here are the honest answers. **These are starting values — the point is
you can explain the reasoning and the tradeoff, not that they're sacred.**

| Parameter | Value | Why this value / what breaks if it's wrong |
|-----------|-------|--------------------------------------------|
| `FRAME_SIZE` | **512 samples** | Must be a power of two (Meyda requirement). At ~44–48 kHz that's ~11 ms per frame — small enough to feel instant, large enough that pitch/FFT are stable. 256 → noisier + more CPU; 1024 → ~21 ms, visibly laggy. |
| `NOISE_CALIBRATION_MS` | **1000 ms** | One second of room tone is enough to estimate a stable noise floor without making the user wait. Shorter = noisy estimate; longer = annoying startup delay. |
| `VAD_ONSET_MARGIN_DB` | **+9 dB above noise floor** | Speech is typically ≥10–15 dB above room noise. +9 dB triggers reliably on speech while ignoring the noise floor and most breaths. This is **relative to measured noise**, not absolute — that's the whole point. |
| `VAD_OFFSET_MARGIN_DB` | **+4 dB above noise floor** | The *release* threshold sits below the *trigger* threshold (Schmitt trigger). The gap prevents flicker: once speaking, you stay "active" until you drop well below where you started. |
| `VAD_HOLD_MS` | **600 ms** | Natural pauses between words/syllables are ~150–300 ms; sentence pauses longer. Holding "active" for 600 ms after energy drops means the plant doesn't stall every time you breathe mid-sentence. Too short → flicker/clipping; too long → plant keeps growing after you've clearly stopped. |
| `SMOOTHING_ALPHA` | **0.3** (EMA) | `y = α·x + (1−α)·y_prev`. At ~11 ms/frame, α=0.3 gives a ~40 ms effective response: fast enough to feel live, smooth enough to kill single-frame jitter. Intentional pitch/loudness changes happen over 100 ms+, so we keep those and drop the noise. The benchmark tests α=1 (no smoothing) vs α=0.3. |
| `PITCH_MIN_HZ` | **70 Hz** | Below typical human phonation; anything lower is almost certainly noise/hum. |
| `PITCH_MAX_HZ` | **500 Hz** | Covers low speech (~85 Hz) up through high singing/humming. Above this is usually a harmonic error, not the fundamental. |
| `PITCH_CLARITY_MIN` | **0.9** | Pitchy returns a 0–1 clarity. 0.9 rejects unvoiced/noisy frames so the plant's angle doesn't jump on consonants or noise. |
| `LSYSTEM_MAX_DEPTH` | **5** | Branch count grows fast with depth; depth 5 keeps the plant readable and the frame rate high. Deeper looks like a fuzzy blob and drops FPS. |
| `MAX_GROWTH_PER_FRAME` | **8** | We add at most 8 new segments per rendered frame so a sudden loud burst can't freeze the canvas expanding geometry. Decouples audio rate from render rate. |
| `DEEPGRAM_TOKEN_TTL_S` | **30 s** | The browser only needs the token long enough to open the WebSocket; a short life limits damage if it ever leaked. |

`docs/parameters.md` should restate this table so it's easy to find during the call.

---

## 6. Feature → plant mapping (what drives what)

All feature values are normalized to `[0,1]`, smoothed, then mapped. Keep these simple
and *causally obvious* — a viewer should "get it" within 30 seconds.

| Voice feature        | Normalized from        | Drives                          | Feel |
|----------------------|------------------------|----------------------------------|------|
| **Pitch** (Hz, log)  | 70–500 Hz (log scale)  | **branch angle** (15°→45°)       | high voice → branches spread wider/upward |
| **Energy** (RMS)     | noise floor → loud     | **growth rate** + glow            | louder → faster growth, brighter |
| **Spectral centroid**| dark → bright timbre   | **hue** of leaves/pigment         | bright/nasal → vivid; warm/round → deep green |
| **Spectral flux**    | steady → changing      | **sway / motion energy**          | dynamic voice → the plant shimmers/moves |
| **VAD state**        | active / inactive      | **growth on/off gate**            | silence → plant settles, no new growth |
| **Deepgram keyword** | discrete word          | **event** (bloom/rain/wither/…)   | words → punctuated visual moments |

*Log scale for pitch* because pitch perception is logarithmic (an octave is a doubling);
linear mapping would make low notes feel dead and high notes twitchy.

---

## 7. THE MEASUREMENT (headline deliverable) — do this properly

This is the part Ojas specifically asked for: *one thing measured properly, real
before/after numbers, on real audio, not mock mode.* We measure **VAD quality**.

### What we compare
- **Baseline (`vad-baseline.ts`)**: naive fixed threshold — "active if RMS > 0.015",
  no hysteresis, no hold. (The thing every demo does.)
- **Ours (`vad.ts`)**: adaptive threshold (calibrated to noise floor) + Schmitt
  hysteresis + 600 ms hold.

### The real audio (YOU record this — see `benchmark/audio/README.md`)
Record ~6–8 short clips (10–20 s each) as `.wav`, covering realistic conditions:
1. **Speaking with natural pauses** (the normal case)
2. **Humming a melody** (sustained tone)
3. **Silence in a slightly noisy room** (fan/AC/traffic) — should trigger *nothing*
4. **Breathing near the mic** — should trigger *nothing*
5. **Speaking with background music/TV** (hard case)
6. **Quiet speech** (soft voice — hard to catch)

Optionally add one public labeled sample for credibility, but your own clips are enough
and are honestly the point.

### Ground truth
For each clip, hand-label the actual speech intervals in `labels.json`:
```json
{ "clip3-silence.wav": { "speech": [] },
  "clip1-pauses.wav":  { "speech": [[0.4,3.1],[3.9,7.2],[8.0,12.5]] } }
```
`benchmark/label.ts` can help you scrub and mark these, or you can eyeball short clips in
any audio editor.

### Metrics computed (per clip + aggregate)
- **False activations** — VAD fires during labeled silence (lower is better)
- **Missed onsets** — VAD fails to fire during labeled speech (lower is better)
- **Flicker rate** — on/off toggles per second during continuous speech (lower is better)
- **Onset latency** — ms from true speech start to detection (report the tradeoff)
- **Frame accuracy** — % of frames classified correctly

### Output
`node benchmark/run.ts` reads the clips + labels, runs **both** VADs frame-by-frame
through the **real `vad.ts`**, and writes:
- `artifacts/report.md` — a human-readable before/after table
- `artifacts/results.json` and `results.csv` — the raw numbers

Example of what `report.md` should look like (numbers are illustrative — yours will be
real):

```
HarmonicFlora — VAD Benchmark
Clips: 7   Total audio: 96.4 s   Frames: 8,213

                          Baseline (fixed)   Ours (adaptive+hyst)
False activations              184                   12
Missed onsets                    9                    4
Flicker (toggles/sec)          6.1                  0.7
Onset latency (median)         41 ms                58 ms
Frame accuracy                 78.3%                94.6%

Takeaway: the naive threshold fires constantly on room noise and flickers on
every pause. Ours cuts false activations ~15× and flicker ~9× for +17 ms of
onset latency — a deliberate, defensible tradeoff.
```

> **Integrity note:** report the *real* numbers you get, including anywhere ours loses
> (e.g. slightly higher onset latency — that's the honest cost of hysteresis). Ojas
> explicitly praised your last honest limitations section. Keep that.

---

## 8. Build phases (the order to implement)

Each phase ends with a concrete check. Build in this order so there's always something
running.

### Phase A — Skeleton that renders (no audio yet)
- `index.html`, `styles.css`, Vite/TS setup, `package.json`.
- `render/sketch.ts` + `lsystem.ts` + `plant.ts`: a static procedural plant draws on a
  full-screen dark canvas.
- `ui/overlay.ts`: an elegant centered **"Enter"** button.
- ✅ **Check:** `npm run dev`, open browser, see a beautiful static plant after clicking
  Enter. No errors.

### Phase B — Mic + live features driving growth
- `audio/mic.ts`, `features.ts` (Meyda), `pitch.ts` (Pitchy), `smoothing.ts`.
- `mapping/controls.ts`: features → plant controls.
- ✅ **Check:** humming/speaking visibly changes branch angle, growth speed, and color
  in real time.

### Phase C — VAD (the measured piece)
- `audio/calibrate.ts` (noise floor), `audio/vad.ts` (pure, adaptive + hysteresis).
- Gate growth on VAD state.
- ✅ **Check:** silence → plant settles; speech → grows; pauses between words don't
  cause stalling/flicker.

### Phase D — The benchmark
- `benchmark/vad-baseline.ts`, `run.ts`, `label.ts`; record clips; label them.
- ✅ **Check:** `node benchmark/run.ts` produces `artifacts/report.md` with real
  before/after numbers.

### Phase E — Deepgram streaming commands
- `api/deepgram-token.ts` (serverless), `stt/deepgram.ts`, `stt/commands.ts`.
- Wire keywords → `particles.ts` / plant events.
- ✅ **Check:** saying "bloom", "rain", "reset" triggers the right visual event.
  Transcript is never displayed.

### Phase F — Polish, UI, deploy
- `ui/debug.ts` (press D), `render/palette.ts`, `particles.ts` glow/fireflies, smooth
  "Enter" fade, startup calibration hint.
- Write `README.md` (submission note). Deploy to Vercel.
- ✅ **Check:** live URL works end-to-end; repo is clean; README has the numbers.

---

## 9. WHAT YOU (Vaishnavi) NEED TO DO — simple human steps

Claude does all the coding. These are the few things only you can do. I'll tell you
*exactly when* each is needed during the build. Full copy-paste version is in
`START-HERE.md`.

1. **Make a Deepgram account** (5 min, free)
   - Go to <https://console.deepgram.com/signup>
   - Sign up → you get free credit, no card needed.
   - Click **API Keys → Create a New API Key** → copy the key (starts with a long
     string). You'll see it **only once** — paste it somewhere safe for a moment.

2. **Put the key in the project** (1 min)
   - In the project folder, create a file called **`.env.local`** and add one line:
     ```
     DEEPGRAM_API_KEY=your_key_here
     ```
   - This file is git-ignored — it will **not** be uploaded to GitHub. Good.

3. **Record the benchmark clips** (15 min) — *when we reach Phase D*
   - Use your Mac's Voice Memos or QuickTime, or I'll give you a one-line command to
     record straight to `.wav`.
   - Record the 6 clips listed in §7 (speaking, humming, silence, breathing, etc.).
   - Drop them in `benchmark/audio/`. I'll help you label them.

4. **Make a Vercel account & deploy** (10 min) — *when we reach Phase F*
   - Go to <https://vercel.com/signup>, sign in with your GitHub.
   - Import the repo → add the `DEEPGRAM_API_KEY` in Vercel's **Environment Variables**
     (same value as your `.env.local`).
   - Click Deploy. You get a live URL.

That's the entire list. Everything else, Claude builds. Whenever I need one of these
from you, I'll stop and say **"👉 Your turn: do step N"** and wait.

---

## 10. Visual & UI design (make it genuinely beautiful)

Taste is the #1 judging criterion. The visual is the product. Guidelines:

- **Palette:** deep near-black background (`#0a0e0d`-ish), plant in luminous greens
  shifting toward gold/violet at the tips as spectral centroid rises. Everything glows
  softly (additive-ish layering, subtle bloom).
- **The plant:** organic, slightly curved branches (not stiff straight lines). Leaves
  as soft translucent shapes. Flowers on "bloom." Gentle idle sway even in silence so it
  feels alive, not frozen.
- **Motion:** everything eases. Growth is smooth accretion, never popping in. Color
  transitions lerp over ~300 ms.
- **The "Enter" screen:** one line of poetry-ish copy ("*Speak, and it grows.*"), a
  single glowing **Enter** button, and a tiny "allow microphone" hint. On click: mic
  permission → 1-second calibration ("*listening to the room…*") → the UI fades entirely
  and only the plant + canvas remain.
- **No chrome after entry.** No buttons, no text, no meters. Just the plant. (Debug panel
  hidden behind the **D** key for you only.)
- **Responsive:** fills the window, handles resize, looks good on a laptop screen for the
  demo.

---

## 11. How to actually USE it (live usage script)

This doubles as the demo you'll give and the "how to use" section of the README.

1. Open the live URL (or `npm run dev` locally).
2. Click **Enter**, allow microphone when asked.
3. Stay quiet for 1 second while it calibrates to your room ("listening…").
4. **Hum a low, steady note** → watch a thick trunk grow slowly.
5. **Slide your voice higher** → branches spread wider and reach upward.
6. **Get louder** → growth speeds up and the plant brightens.
7. **Make your voice brighter/nasal ("eee")** → colors shift vivid; **rounder ("ohh")**
   → deep green.
8. **Stop talking** → the plant settles and idles (this is VAD working — it doesn't
   twitch on your breathing).
9. **Say "bloom"** → flowers burst. **Say "rain"** → rain falls and it greens.
   **Say "wither"** → it droops and fades. **Say "reset"** → fresh seed.
10. Press **D** anytime to see the live feature values (for you/debugging only).

---

## 12. Deployment (Vercel, one target)

- `vercel.json` configures the static build (Vite → `dist/`) and the `api/` function.
- Local dev with the token function: `vercel dev` (runs site + function together), or
  `npm run dev` with a Vite proxy to a local function.
- Prod: push to GitHub → Vercel auto-deploys. Set `DEEPGRAM_API_KEY` in Vercel env vars.
- The Deepgram secret **never** ships to the browser; the browser only ever sees a
  30-second token from `/api/deepgram-token`.

---

## 13. The submission write-up (`README.md`) — structure

Keep it short and honest. Sections:
1. **What it is** — one paragraph + a screenshot/GIF.
2. **Why these choices** — the "no transcript" solution (STT drives visuals), and why
   VAD + streaming STT are the primitives that matter for voice agents.
3. **The measured thing** — the VAD before/after table, on your real audio, with the
   honest tradeoff (higher onset latency for far fewer false triggers).
4. **Where every number came from** — link to `docs/parameters.md`.
5. **How to run it** — the usage script (§11).
6. **Honest limitations** — see §15.
7. **Future scope** — see §14.

---

## 14. Future scope (mention as points; add only if time remains)

These are the other two voice-agent problems, deliberately deferred so the core ships
complete and polished first:

- **(2) Barge-in / interrupt latency.** Treat the plant as the "agent" that's mid-action
  and measure how fast a new voice onset interrupts and redirects it — reporting
  onset-to-visible-response latency. This is the single hardest problem in real voice
  agents (stopping the AI the instant the human speaks). Same VAD core, new measurement.
- **(4) ElevenLabs TTS feedback.** At growth milestones the plant *whispers back* using
  ElevenLabs streaming TTS, closing a full voice loop (voice in → visual → voice out) —
  the exact loop ComSync's agents run. Adds a second real voice-AI provider.

---

## 15. Honest limitations (write these down — don't hide them)

- Pitch detection assumes a mostly monophonic voice; it won't track chords or two people
  talking at once.
- Keyword spotting is exact-match on a small vocabulary, not intent understanding —
  "make it flower" won't trigger "bloom" unless we add it.
- VAD is tuned for a single speaker near the mic in a typical room; very noisy
  environments will still leak some false activations (the benchmark shows how much).
- The benchmark labels are hand-made on a handful of clips — enough to show a real,
  honest delta, not a formal academic evaluation.
- Onset latency is *slightly worse* than the naive baseline by design — that's the cost
  of hysteresis, and it's the right tradeoff for this use case. Stated openly.

---

*End of plan. Companion files: `START-HERE.md` (your steps), `docs/parameters.md` (the
number defense), `README.md` (the write-up, created in Phase F).*
