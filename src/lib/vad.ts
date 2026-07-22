/**
 * Voice-activity detection as a pure step function, so it can be unit-tested
 * against real captured [vad] metering traces instead of tuned blind.
 *
 * The problem this solves (see the 2026-07-22 noisy-room trace): the noise
 * floor used to be calibrated once in the first CALIBRATION_MS and then
 * FROZEN. In a room where the first 300ms happens to be quiet but ambient
 * noise then plateaus 10+ dB higher, the frozen floor sits too low forever,
 * the "silence" threshold never gets crossed, and every utterance runs to
 * the MAX_UTTERANCE_MS hard cap.
 *
 * Fix: the floor ADAPTS upward toward sustained non-speech. When the current
 * level is not loud enough to be speech, the floor drifts toward it slowly,
 * so a steady background plateau gets learned as the new floor within a
 * couple of seconds, and the silence threshold rises with it. During actual
 * speech (level well above the floor) the floor is held, so a loud utterance
 * never drags the floor up and desensitizes detection.
 */

export interface VadConfig {
  calibrationMs: number;
  speechMarginDb: number; // this far above floor = speech
  silenceMarginDb: number; // within this of the floor = silence
  silenceHoldMs: number; // sustained silence this long after speech = end
  /** How fast the floor rises toward sustained non-speech, in dB per second. 0 = frozen (old behavior). */
  floorAdaptDbPerSec: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  calibrationMs: 300,
  speechMarginDb: 12,
  silenceMarginDb: 6,
  silenceHoldMs: 1000,
  floorAdaptDbPerSec: 8,
};

export interface VadState {
  floor: number | null; // calibrated/adapted noise floor in dB, null until first sample
  speechDetected: boolean; // latched true once sustained speech is seen (never resets within an utterance)
  silenceSince: number | null; // timestamp (ms) silence began after speech, or null
  lastTs: number | null; // timestamp of the previous sample, for adaptation rate
}

export const initialVadState: VadState = {
  floor: null,
  speechDetected: false,
  silenceSince: null,
  lastTs: null,
};

export type VadDecision = 'continue' | 'end';

export interface VadResult {
  state: VadState;
  decision: VadDecision;
}

/**
 * Advance the VAD by one metering sample.
 * @param state    previous VAD state
 * @param levelDb  the metering level for this sample, in dB (negative)
 * @param tMs      milliseconds since the recording started (for calibration + hold)
 * @param nowMs    absolute timestamp of this sample (for silence-hold + adaptation)
 */
export function vadStep(
  state: VadState,
  levelDb: number,
  tMs: number,
  nowMs: number,
  config: VadConfig = DEFAULT_VAD_CONFIG,
): VadResult {
  // Calibration window: track the quietest level seen as the initial floor.
  if (tMs < config.calibrationMs) {
    const floor = state.floor === null ? levelDb : Math.min(state.floor, levelDb);
    return {state: {...state, floor, lastTs: nowMs}, decision: 'continue'};
  }

  const floor = state.floor ?? levelDb;
  const isSpeech = levelDb > floor + config.speechMarginDb;
  const isSilence = levelDb < floor + config.silenceMarginDb;

  let nextFloor = floor;
  // Adapt the floor upward toward a non-speech level. Only when NOT speech,
  // so a loud utterance can't drag the floor up and desensitize detection.
  // Rate-limited per elapsed time so it learns a steady plateau in a couple
  // seconds without chasing brief inter-word dips.
  if (!isSpeech && state.lastTs !== null && config.floorAdaptDbPerSec > 0) {
    const dtSec = Math.max(0, (nowMs - state.lastTs) / 1000);
    const maxStep = config.floorAdaptDbPerSec * dtSec;
    if (levelDb > floor) {
      nextFloor = Math.min(levelDb, floor + maxStep); // rise toward, capped by rate
    }
    // Note: we don't lower the floor here; a genuinely quieter room is rare
    // mid-utterance and lowering would risk re-triggering false speech.
  }

  let speechDetected = state.speechDetected;
  let silenceSince = state.silenceSince;
  let decision: VadDecision = 'continue';

  if (isSpeech) {
    speechDetected = true;
    silenceSince = null;
  } else if (speechDetected && isSilence) {
    if (silenceSince === null) {
      silenceSince = nowMs;
    } else if (nowMs - silenceSince >= config.silenceHoldMs) {
      decision = 'end';
    }
  } else if (speechDetected && !isSilence) {
    // Between speech and silence thresholds (e.g. a soft trailing sound):
    // don't reset the silence timer, but don't count it as fresh speech
    // either — leave silenceSince as-is so a real pause still accumulates.
  }

  return {
    state: {floor: nextFloor, speechDetected, silenceSince, lastTs: nowMs},
    decision,
  };
}
