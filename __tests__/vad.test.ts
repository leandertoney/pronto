import {
  DEFAULT_VAD_CONFIG,
  initialVadState,
  vadStep,
  VadState,
} from '../src/lib/vad';

const MAX_UTTERANCE_MS = 25000;

/**
 * Feed a sequence of [tMs, levelDb] samples through the VAD and return the
 * elapsed time (tMs) at which it decided to end, or null if it never ended
 * (i.e. it would have run to the MAX_UTTERANCE_MS hard cap). `startMs` is the
 * absolute clock the samples are anchored to; nowMs = startMs + tMs.
 */
function runTrace(
  samples: Array<[number, number]>,
  config = DEFAULT_VAD_CONFIG,
  startMs = 1_000_000,
): number | null {
  let state: VadState = initialVadState;
  for (const [tMs, levelDb] of samples) {
    const {state: next, decision} = vadStep(state, levelDb, tMs, startMs + tMs, config);
    state = next;
    if (decision === 'end') return tMs;
  }
  return null;
}

describe('vadStep — real noisy-room trace (2026-07-22)', () => {
  // Transcribed from the actual [vad] log Leander pasted: floor calibrated at
  // -40.8, a burst of real speech (peaks to -10..-17dB) for the first ~4s,
  // then a steady ~-28 to -32dB background plateau that used to run all the
  // way to the 25s MAX cap because silence was never detected.
  const NOISY_ROOM: Array<[number, number]> = [
    [24, -40.8], // calibration sample
    [437, -10.5],
    [971, -29.9],
    [1503, -12.7],
    [1904, -19.9],
    [2438, -23.2],
    [2970, -28.5],
    [3371, -29.0],
    [3905, -11.9],
    [4439, -30.5],
    [4971, -29.4],
    [5504, -31.4],
    [5905, -31.5],
    [6439, -32.0],
    [6972, -30.9],
    [7508, -31.0],
    [8042, -26.9],
    [8576, -30.5],
    [9109, -30.2],
    [9642, -29.6],
    [10175, -29.3],
    [10708, -28.5],
    [11242, -30.3],
    [11775, -29.6],
    [12308, -29.5],
    [12845, -24.8],
    [13256, -29.0],
    [13659, -31.5],
    [14192, -28.3],
    [14724, -32.7],
    [15256, -29.3],
    // ... continues at the same plateau to 25s in the real log.
  ];

  it('OLD frozen-floor behavior would run to the cap (documents the bug)', () => {
    const frozen = {...DEFAULT_VAD_CONFIG, floorAdaptDbPerSec: 0};
    expect(runTrace(NOISY_ROOM, frozen)).toBeNull();
  });

  it('adaptive floor ends the utterance well before the cap', () => {
    const endedAt = runTrace(NOISY_ROOM);
    expect(endedAt).not.toBeNull();
    expect(endedAt!).toBeLessThan(MAX_UTTERANCE_MS);
    // The real speech stops around t~4s; it should end within a few seconds
    // of the plateau starting, not drag on for 15+ seconds.
    expect(endedAt!).toBeLessThan(12000);
  });
});

describe('vadStep — must NOT cut off a mid-sentence pause', () => {
  // Speech, then a ~1s pause near the noise floor, then speech again. The
  // adaptive floor must not treat the pause as end-of-utterance.
  const MID_PAUSE: Array<[number, number]> = [
    [24, -50],
    [400, -18],
    [800, -16],
    [1200, -20],
    // ~1s pause, quiet-ish but the user isn't done:
    [1600, -44],
    [2000, -45],
    [2300, -44],
    // resumes speaking:
    [2700, -17],
    [3100, -15],
    [3500, -19],
    // real trailing silence:
    [3900, -49],
    [4300, -50],
    [4700, -49],
    [5100, -50],
  ];

  it('does not end during the mid-sentence pause, ends after the real trailing silence', () => {
    const endedAt = runTrace(MID_PAUSE);
    expect(endedAt).not.toBeNull();
    // Must survive past the pause (which ends ~2300) and past the resumed
    // speech (~3500); only the trailing silence should end it.
    expect(endedAt!).toBeGreaterThan(3500);
  });
});

describe('vadStep — clean quiet room still works', () => {
  const CLEAN_ROOM: Array<[number, number]> = [
    [24, -55],
    [400, -20],
    [800, -18],
    [1200, -22],
    [1600, -19],
    // clear trailing silence, well below the floor+margin:
    [2000, -53],
    [2400, -54],
    [2800, -52],
    [3200, -53],
  ];

  it('detects speech then ends promptly on clear silence', () => {
    const endedAt = runTrace(CLEAN_ROOM);
    expect(endedAt).not.toBeNull();
    expect(endedAt!).toBeGreaterThan(1600); // after speech
    expect(endedAt!).toBeLessThan(3600); // promptly after silence
  });
});

describe('vadStep — never ends before any speech is detected', () => {
  it('stays continue through pure silence (no false end)', () => {
    const silence: Array<[number, number]> = [
      [24, -50],
      [500, -49],
      [1000, -50],
      [1500, -48],
      [2000, -50],
    ];
    // No speech ever detected, so it should never emit 'end' (the caller's
    // NO_SPEECH_TIMEOUT handles recycling a dead listener separately).
    expect(runTrace(silence)).toBeNull();
  });
});
