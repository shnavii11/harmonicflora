// All tunable numbers live here. See docs/parameters.md for the why.

export const FRAME_SIZE = 512

export const NOISE_CALIBRATION_MS = 1000

// VAD thresholds (dB above measured noise floor)
// Tuned sensitive so even quiet humming grows/blooms the plant, while still
// adaptive + hysteresis (well above the naive fixed-threshold baseline).
export const VAD_ONSET_MARGIN_DB = 6
export const VAD_OFFSET_MARGIN_DB = 3
export const VAD_HOLD_MS = 700

// Exponential moving average smoothing
export const SMOOTHING_ALPHA = 0.3

// Pitch detection range
export const PITCH_MIN_HZ = 70
export const PITCH_MAX_HZ = 500
export const PITCH_CLARITY_MIN = 0.9

// Plant / L-system
export const LSYSTEM_MAX_DEPTH = 6
export const MAX_GROWTH_PER_FRAME = 8

// Deepgram token lifetime (seconds)
export const DEEPGRAM_TOKEN_TTL_S = 30

// --- Emotion model (local, prosody-first) ---
// Rolling window over which prosodic stats are gathered before deciding emotion.
export const EMOTION_WINDOW_MS = 1500
// Gaussian falloff for (valence, arousal) → per-emotion soft weights. Larger =
// softer/more-blended, smaller = sharper/more-decisive switches.
export const EMOTION_REGION_SIGMA = 0.22
// EMA smoothing of the emotion weights themselves (0..1, higher = snappier).
export const EMOTION_SMOOTH_ALPHA = 0.14
// How fast the rendered species profile lerps toward the target each frame.
export const SPECIES_MORPH_SPEED = 0.08

// Visual
export const BG_COLOR = '#0a0e0d'
export const BASE_HUE = 130        // green
export const TIP_HUE_BRIGHT = 55   // gold at high centroid
export const TIP_HUE_DARK = 270    // violet at low centroid

// Living-plant behavior
export const GROWTH_SPEED = 0.55      // how fast the plant matures while voiced (per sec)
export const VITALITY_RISE = 0.10     // how fast health climbs while speaking
export const VITALITY_DECAY = 0.013   // how fast it wilts in silence
export const BIAS_MAX = 0.55          // max radians branches lift up / droop down
export const BRANCH_FALLOFF = 0.79    // child length vs parent (higher = taller/fuller)
export const MAX_PARTICLES = 320
