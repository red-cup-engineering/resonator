// primitives.mjs
//
// Small, dependency-light helpers shared by this game-audio kit's cue
// library (./library.mjs) and its anticipation/riser primitive
// (./anticipation.mjs), factored out here (rather than one importing from
// the other) so the two stay independent leaves of the same tree --
// anticipation.mjs may import buildChime from library.mjs for its win
// resolution, but nothing here or in library.mjs needs anything from anticipation.mjs.

// Nothing here touches an AudioContext or any WebAudio type: everything is a
// pure function of a caller-supplied seeded RNG (from
// @red-cup-engineering/music-engineering-services-section's random.mjs),
// matching this whole package's "voice as data, rendered later" discipline.

import { nextInt } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';

/**
 * Canonical numeric levels for the named intensity tiers this kit's cue
 * family (chime-minor/major/epic, coin/coin-shower, fanfare, riser) scale
 * against. 'default' is used whenever a cue is played with no intensity
 * specified at all -- a plain `play('chime')` call, say -- so every cue has
 * sane, non-extreme output even from a caller that never thinks about tiers.
 */
export const INTENSITY_TIERS = Object.freeze({
  minor: 0.33,
  major: 0.66,
  epic: 1.0,
  default: 0.5,
});

/**
 * Resolves an `intensity` cue option to a single number in [0, 1]: a named
 * tier (see INTENSITY_TIERS) is looked up, a raw number is clamped, anything
 * else (undefined, an unrecognized string) falls back to
 * INTENSITY_TIERS.default. Every intensity-aware cue builder in this kit
 * calls this once at the top and works only with the resulting number from
 * then on -- named tiers are a convenience alias over one continuous
 * parameter, not a separate mechanism a builder needs to branch on.
 * @param {number|'minor'|'major'|'epic'|'default'|undefined} intensity
 * @returns {number} in [0, 1]
 */
export function resolveIntensity(intensity) {
  if (typeof intensity === 'number' && Number.isFinite(intensity)) {
    return Math.max(0, Math.min(1, intensity));
  }
  if (typeof intensity === 'string' && intensity in INTENSITY_TIERS) {
    return INTENSITY_TIERS[intensity];
  }
  return INTENSITY_TIERS.default;
}

/**
 * Generates the granular "rise" half of a tension riser: a train of short,
 * closely-spaced bandpassed-noise blips whose center frequency sweeps
 * exponentially from `startHz` to `endHz` and whose gain ramps up across
 * `riseSec`, read together as one continuous rising sweep even though each
 * individual note is only ~90ms long -- the same granular-repetition idea
 * this kit's coin-shower cue uses for a different texture. Used by both
 * library.mjs's plain 'riser' cue (rise only, no resolution -- generic
 * anticipation filler) and anticipation.mjs's buildRiser (rise then resolve
 * to a win chime or a soft fail).
 * @param {{state:number}} rng - seeded RNG from music-engineering-services-section's random.mjs's makeRng, mutated (advanced) by this call
 * @param {object} [opts]
 * @param {number} [opts.riseSec=1.2] - duration of the rising sweep
 * @param {number} [opts.startHz=260]
 * @param {number} [opts.endHz=1600]
 * @param {number} [opts.level=0.5] - resolved intensity in [0,1]; scales final gain and blip density
 * @returns {{durationSec:number, notes:Array<{atSec:number, voice:object}>}}
 */
export function buildRiseNotes(rng, opts = {}) {
  const riseSec = opts.riseSec ?? 1.2;
  const startHz = opts.startHz ?? 260;
  const endHz = opts.endHz ?? 1600;
  const level = opts.level ?? 0.5;

  // ~14 blips/sec is dense enough to read as a continuous sweep rather than
  // a discernible tick train once the envelope's short attack/release
  // smooths each one; denser still (up to ~20/sec) at high intensity for a
  // more urgent-feeling rise.
  const blipsPerSec = 14 + 6 * level;
  const stepCount = Math.max(6, Math.round(riseSec * blipsPerSec));
  const notes = [];
  for (let i = 0; i < stepCount; i++) {
    const frac = stepCount > 1 ? i / (stepCount - 1) : 1;
    const atSec = frac * riseSec;
    const freqHz = startHz * Math.pow(endHz / startHz, frac);
    const jitter = 1 + (nextIntSigned(rng, 20) / 1000); // +/-2% pitch jitter, deterministic per-note
    const gain = (0.05 + 0.2 * frac) * (0.6 + 0.4 * level);
    notes.push({
      atSec,
      voice: {
        freqHz: freqHz * jitter,
        durationSec: 0.09,
        source: { type: 'noise', color: 'filtered', cutoffHz: Math.min(freqHz * 1.5, 18000) },
        envelope: { attackSec: 0.002, releaseSec: 0.06, sustainLevel: 0.9, curve: 8 },
        filter: { type: 'bandpass', cutoffHz: freqHz, Q: 6 },
        gain,
        seed: nextInt(rng, 0, 1e9),
      },
    });
  }
  return { durationSec: riseSec, notes };
}

/** @param {{state:number}} rng @param {number} magnitude @returns {number} deterministic signed int in [-magnitude, magnitude] */
function nextIntSigned(rng, magnitude) {
  return nextInt(rng, -magnitude, magnitude + 1);
}
