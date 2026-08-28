# HarmonicFlora — PLAN 2: Emotion-Reactive Trees (Prosody-First)

## Context

Today HarmonicFlora maps voice *features* (pitch, energy, timbre) to a single
green plant's growth. The next leap: read **emotion** from the voice — from both
*how* you speak (tone/prosody) and *what* you say (words) — and morph the plant
into a **different species per emotion**:

- **Happy** → cherry-blossom **bonsai**: gnarled short trunk, sparse light-green
  leaves, abundant **white/pink blossoms**.
- **Sad** → drooping **willow**: long down-swept branches, many **small red/maroon
  leaves**, **no flowers**, muted + slow.
- **Angry** → autumn **maple**: sharp wide angular branches, **three-lobed red/orange
  leaves**, fast jagged sway, no soft blossoms.
- **Neutral/calm** → the current green tree (baseline).

**Why this matters (the voice-model problem we overcome):** text-only voice
pipelines throw away *how* something was said and are slow because they wait for
STT→LLM. Our system reacts to **emotional tone locally in ~100 ms**, then lets the
**words path (Deepgram → Gemini)** confirm/correct a beat later. **Headline
measured deliverable: time-to-first-emotional-response, tone-first vs. words-only.**
Same spirit as the existing VAD benchmark — react fast *and* correctly.

**Decisions locked with the user:** words-emotion via **Gemini** (server-side key);
headline metric = **prosody-first latency**; **MVP first**, then words+fusion+
measurement; **include ElevenLabs** whisper-back at emotional milestones (kept off
the critical path, latency tradeoff stated honestly).

We stay in **p5 / Canvas 2D**. All three species are achievable as blendable,
per-frame **parametric profiles** — a 3D mesh library (ez-tree/proctree) would kill
the real-time reactivity that is the point.

---

## Emotion model (local, fast — the core of the MVP)

A **valence–arousal** heuristic over rolling prosodic stats (~1.5 s window):

- Inputs (extend current features): pitch mean + **variance/range**, energy mean +
  variance, spectral **centroid** (brightness), spectral **flux**, **speaking rate**
  (VAD onset density from existing `vad.ts`), **harshness** (high-freq energy ratio).
- `arousal` ← loud / fast / dynamic / high pitch-variance.
- `valence` ← bright timbre + higher, varied pitch = positive; harsh + loud-flat =
  negative; low + quiet + dark = low-valence & low-arousal (sad).
- Map (valence, arousal) → **soft weights** over {happy, sad, angry, neutral} by
  distance to each region → enables **smooth morphing**, not jittery hard switches.

Honest limitation: prosodic emotion from a few features is approximate; we mitigate
with soft blending + smoothing + (Phase 2) words correction.

---

## Visual: species profiles + morphing

Each species = a parameter struct (branch spread, falloff, twist/gnarl, droop bias,
depth, thickness, sway speed/amount, leaf shape, leaf palette, leaf density, blossom
on/off + color + density). `blendSpecies(weights)` returns an **interpolated
profile**; the renderer already rebuilds the tree every frame, so morphing is just
lerping these numbers + cross-fading leaf shape and blossom density. This is exactly
why the parametric p5 engine was worth keeping.

Parametric **leaf shapes** needed: rounded/oval (current), **small-oval** (sad),
**three-lobed maple** (angry). Blossoms already exist (`drawBlossom`) — recolor
white/pink for sakura, disable for sad/angry.

---

## Files

### MVP (build now — local, no network)
- `src/emotion/prosody.ts` — rolling prosodic stats → valence/arousal → emotion
  weights. Fast, local.
- `src/emotion/types.ts` — `Emotion`, `EmotionWeights`, VA constants.
- `src/render/species.ts` — the 4 species profiles + `blendSpecies(weights)`.
- `src/render/leaves.ts` — parametric leaf shapes (oval, small, maple three-lobed);
  refactor `drawLeafSprite` out of `sketch.ts` to take a shape.
- Modify `src/render/sketch.ts` + `src/render/plant.ts` — consume a blended species
  profile instead of the current hardcoded branch/foliage params.
- Modify `src/mapping/controls.ts` + `src/main.ts` — feed features → `prosody` →
  emotion weights → renderer; show valence/arousal/weights in the **D** debug panel.
- `src/config.ts` — emotion window length, region thresholds, morph speed.

### Phase 2 (words + fusion + latency measurement + TTS)
- `src/stt/deepgram.ts` — implement streaming STT using the token from the existing
  `api/deepgram-token.ts`; emit partial/final transcripts **with timestamps**.
- `api/gemini-emotion.ts` — **serverless**: transcript → Gemini (server-side
  `GEMINI_API_KEY`) → emotion label/weights. Key never touches the browser. Use a
  low-latency Flash model (confirm exact model id at build time); graceful
  timeout/fallback to tone-only.
- `src/emotion/fusion.ts` — combine fast prosody emotion + slow words emotion with
  timestamps, confidence, decay; **record which path drove each emotion change**
  (needed for the measurement).
- `src/tts/eleven.ts` + `api/eleven-token.ts` — ElevenLabs streaming TTS; short
  whispered lines at **emotional milestones** (first bloom, shift to sad), kept off
  the render/critical path.
- `benchmark/emotion-latency.ts` — reuses `parseWav`/framing from
  `benchmark/run.ts`; on clips with hand-marked emotional onsets, measures median ms
  from onset to (a) tone-first response vs (b) words-path response; writes
  `benchmark/artifacts/emotion-report.md` (+ json/csv).

### Security / keys (established pattern, extend it)
All secrets (Deepgram, **Gemini**, ElevenLabs) live only in Vercel serverless
functions; the browser gets short-lived tokens or proxied results. Add
`GEMINI_API_KEY` and `ELEVENLABS_API_KEY` to `.env.example`, `.env.local`
(git-ignored), and Vercel env vars.

---

## Build order

1. **MVP:** prosody→emotion→**morphing across the 4 species**, fully local. Ends
   when humming happy/sad/angry visibly morphs the tree (bonsai↔willow↔maple) with
   smooth blends. ✅ Check: tone alone changes species; debug panel shows weights.
2. **Words path:** Deepgram streaming → `api/gemini-emotion.ts` → words-emotion.
3. **Fusion:** tone-first + words-correction, with per-path timestamps.
4. **Measurement:** `emotion-latency.ts` → real before/after latency numbers.
5. **TTS:** ElevenLabs milestone whispers.
6. Update `README.md` + `docs/parameters.md` with the emotion model, mapping table,
   and the latency result.

---

## Verification

- **MVP:** `npm run dev` → Enter → hum bright/high/lively (happy → sakura bonsai +
  blossoms), low/quiet/flat (sad → willow + small red leaves, no flowers),
  loud/harsh/fast (angry → maple + three-lobed red leaves). Press **D** to confirm
  valence/arousal/weights track your voice. Watch FPS (thousands of leaves).
- **Words/fusion:** speak clearly happy/sad/angry sentences; confirm the words path
  confirms or corrects the tone estimate a beat later; verify no transcript is shown
  and no secret key is in the browser bundle.
- **Latency:** record clips, mark emotional onsets, run
  `npx tsx benchmark/emotion-latency.ts` → `emotion-report.md` shows median tone-first
  vs words-only response latency, with honest limitations.
- **TTS:** at a milestone, the plant whispers one short line; confirm it doesn't
  stall the visuals.

---

## Honest limitations (state in README)

- Prosodic emotion is heuristic and single-speaker-tuned; emotion is culturally and
  individually variable.
- Gemini (words path) adds real network latency + a key dependency — it is
  deliberately the *slow path* we contrast against; must degrade to tone-only on
  timeout.
- ElevenLabs adds a third provider and some latency; kept to occasional milestones,
  and this slightly cuts against the latency thesis — an honest, stated tradeoff.
- Latency benchmark uses hand-marked onsets on a handful of clips — a real, honest
  delta, not a formal evaluation.
