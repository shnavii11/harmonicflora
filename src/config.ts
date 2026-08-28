// All tunable numbers live here. See docs/parameters.md for the why.

export const FRAME_SIZE = 512

export const NOISE_CALIBRATION_MS = 1000

// VAD thresholds (dB above measured noise floor)
export const VAD_ONSET_MARGIN_DB = 9
export const VAD_OFFSET_MARGIN_DB = 4
export const VAD_HOLD_MS = 600

// Exponential moving average smoothing
export const SMOOTHING_ALPHA = 0.3

// Pitch detection range
export const PITCH_MIN_HZ = 70
export const PITCH_MAX_HZ = 500
export const PITCH_CLARITY_MIN = 0.9

// Plant / L-system
export const LSYSTEM_MAX_DEPTH = 5
export const MAX_GROWTH_PER_FRAME = 8

// Deepgram token lifetime (seconds)
export const DEEPGRAM_TOKEN_TTL_S = 30

// Visual
export const BG_COLOR = '#0a0e0d'
export const BASE_HUE = 130        // green
export const TIP_HUE_BRIGHT = 55   // gold at high centroid
export const TIP_HUE_DARK = 270    // violet at low centroid

// Living-plant behavior
export const GROWTH_SPEED = 0.42      // how fast the plant matures while voiced (per sec)
export const VITALITY_RISE = 0.06     // how fast health climbs while speaking
export const VITALITY_DECAY = 0.016   // how fast it wilts in silence
export const BIAS_MAX = 0.55          // max radians branches lift up / droop down
export const BRANCH_FALLOFF = 0.76    // child length vs parent
export const MAX_PARTICLES = 220
