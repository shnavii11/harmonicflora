# HarmonicFlora — Parameter Rationale

Every tunable value in `src/config.ts`, with the reasoning behind it.

| Parameter | Value | Why / what breaks if wrong |
|-----------|-------|----------------------------|
| `FRAME_SIZE` | 512 | Power of two (Meyda requirement). ~11 ms/frame at 44–48 kHz — instant feel, stable FFT. 256 → noisier + more CPU; 1024 → ~21 ms, visibly laggy. |
| `NOISE_CALIBRATION_MS` | 1000 ms | 1 s of room tone gives a stable noise floor estimate without a long wait. Shorter → noisy estimate; longer → annoying. |
| `VAD_ONSET_MARGIN_DB` | +9 dB | Speech sits ≥10–15 dB above room noise. +9 dB catches it reliably while ignoring breaths. Relative to measured floor — not an absolute constant. |
| `VAD_OFFSET_MARGIN_DB` | +4 dB | Release threshold below onset threshold (Schmitt trigger). The gap prevents flicker once you start speaking. |
| `VAD_HOLD_MS` | 600 ms | Natural inter-word pauses are ~150–300 ms. 600 ms hold lets you pause mid-sentence without the plant stalling. Too short → flicker; too long → plant keeps growing after you stop. |
| `SMOOTHING_ALPHA` | 0.3 | EMA: y = 0.3·x + 0.7·y_prev. At ~11 ms/frame this is ~40 ms effective response — live but jitter-free. Intentional changes happen over 100 ms+, so they survive. |
| `PITCH_MIN_HZ` | 70 Hz | Below typical human phonation. Anything lower is noise. |
| `PITCH_MAX_HZ` | 500 Hz | Covers low speech (~85 Hz) through high singing. Higher = harmonic error. |
| `PITCH_CLARITY_MIN` | 0.9 | Pitchy's clarity score. 0.9 rejects unvoiced/noisy frames so consonants don't jerk the branch angle. |
| `LSYSTEM_MAX_DEPTH` | 5 | Branch count grows fast with depth. Depth 5 = readable plant + good FPS. Deeper = fuzzy blob + frame drops. |
| `MAX_GROWTH_PER_FRAME` | 8 | At most 8 new segments per frame. Decouples audio rate (11 ms) from render rate (16 ms) and prevents a loud burst from freezing the canvas. |
| `DEEPGRAM_TOKEN_TTL_S` | 30 s | Browser only needs the token to open the WebSocket. Short life limits damage if leaked. |
