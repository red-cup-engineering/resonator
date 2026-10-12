// presets.mjs
//
// A small starter bank of VoiceParams objects (see ./voice.mjs's header for
// the shape) -- named points in the synthesis core's parameter space,
// exactly the way dsp/oscillator.mjs's PARTIAL_PRESETS are named points in
// generatePartials' space rather than a separate mechanism. Every entry
// here is plain data: copy one, tweak a field, ship it -- no code required.
// The game-audio-kit layer (../game/voice-bank.mjs) builds its UI-click/
// impact/chime/ambient-bed banks out of these as starting points.
//
// freqHz/durationSec/gain/pan on every preset are intentionally ordinary
// defaults, not "the" value -- callers override them per note (e.g. a
// scale degree's Hz, an intensity-scaled gain) via spread: { ...presets.chime, freqHz: 660 }.

export const uiClick = Object.freeze({
  freqHz: 1200,
  durationSec: 0.06,
  source: Object.freeze({ type: 'noise', color: 'filtered', cutoffHz: 4500 }),
  envelope: Object.freeze({ attackSec: 0.001, releaseSec: 0.045, sustainLevel: 0.9, curve: 9 }),
  filter: Object.freeze({ type: 'highpass', cutoffHz: 800, Q: 0.7 }),
  gain: 0.25,
  pan: 0,
});

export const uiConfirm = Object.freeze({
  freqHz: 660,
  durationSec: 0.14,
  source: Object.freeze({ type: 'triangle' }),
  envelope: Object.freeze({ attackSec: 0.004, releaseSec: 0.1, sustainLevel: 0.8, curve: 7 }),
  gain: 0.22,
  pan: 0,
});

export const impact = Object.freeze({
  freqHz: 90,
  durationSec: 0.35,
  source: Object.freeze({ type: 'karplus-strong', decay: 0.97, dampingHz: 1800, exciteGain: 1.4 }),
  envelope: Object.freeze({ attackSec: 0.002, releaseSec: 0.3, sustainLevel: 1, curve: 6 }),
  noiseMix: Object.freeze({ amount: 0.25, cutoffHz: 900 }),
  saturation: Object.freeze({ drive: 1.6, mix: 0.5 }),
  gain: 0.35,
  pan: 0,
});

export const chime = Object.freeze({
  freqHz: 880,
  durationSec: 1.6,
  source: Object.freeze({ type: 'additive', partials: 'glassy' }),
  envelope: Object.freeze({ attackSec: 0.01, releaseSec: 1.4, sustainLevel: 0.85, curve: 5 }),
  filter: Object.freeze({ type: 'lowpass', cutoffHz: 6000, Q: 0.707 }),
  gain: 0.2,
  pan: 0,
});

export const pluck = Object.freeze({
  freqHz: 220,
  durationSec: 1.2,
  source: Object.freeze({ type: 'karplus-strong', decay: 0.996, dampingHz: 4500 }),
  envelope: Object.freeze({ attackSec: 0.002, releaseSec: 1, sustainLevel: 1, curve: 4 }),
  gain: 0.28,
  pan: 0,
});

export const ambientPad = Object.freeze({
  freqHz: 220,
  durationSec: 8,
  source: Object.freeze({ type: 'additive', partials: 'warmPad' }),
  envelope: Object.freeze({ attackSec: 4, releaseSec: 5, sustainLevel: 0.7, curve: 5 }),
  filter: Object.freeze({ type: 'lowpass', cutoffHz: 1400, Q: 0.707 }),
  gain: 0.16,
  pan: 0,
});

export const breathVoice = Object.freeze({
  freqHz: 440,
  durationSec: 2.5,
  source: Object.freeze({ type: 'bow-breath', partials: 'breathyFlute', shape: 'flute' }),
  envelope: Object.freeze({ attackSec: 0.22, releaseSec: 0.5, sustainLevel: 0.85 }),
  gain: 0.3,
  pan: 0,
});

export const droneNoiseBed = Object.freeze({
  freqHz: 0,
  durationSec: 12,
  source: Object.freeze({ type: 'noise', color: 'filtered', cutoffHz: 500 }),
  envelope: Object.freeze({ attackSec: 3, releaseSec: 3, sustainLevel: 0.4, curve: 3 }),
  gain: 0.08,
  pan: 0,
});

export const VOICE_PRESETS = Object.freeze({
  uiClick,
  uiConfirm,
  impact,
  chime,
  pluck,
  ambientPad,
  breathVoice,
  droneNoiseBed,
});
