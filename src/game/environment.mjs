/**
 * Bounded procedural environmental sound as a projection of caller-admitted
 * environmental qualities. "rain" is a recipe, NOT an observation: a game or
 * enterprise world must authorize and select that kind from its own source
 * before requesting sound. Each render is a pure deterministic CueRender,
 * admitted by Resonator's existing createGameAudio and playSpec seams.
 *
 * This deliberately uses the original digital-audio VoiceParams synthesis
 * primitives: seeded noise, a tone or an exciter, envelopes, filters, and the
 * common ambient bus. No recordings, audio-clock, sampler, weather registry,
 * locale inference, semantic world model or second DSP exists here.
 *
 * Renders are finite, NOT claimed mathematically seamless loops. The caller
 * controls when/if to request another source-bound segment and stops existing
 * handles on a source change or user mute. All informational alternatives
 * stay with the caller's original authorized text/source.
 */
import { nextInt, nextRange } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { resolveIntensity } from './primitives.mjs';

export const ENVIRONMENT_KINDS = Object.freeze(['rain', 'wind', 'surf', 'workshop']);

const PROFILE = Object.freeze({
  rain: Object.freeze({ low: 2200, high: 6800, ground: 0.080, sheen: 0.040, accent: 2900 }),
  wind: Object.freeze({ low: 520, high: 1850, ground: 0.070, sheen: 0.026, accent: 900 }),
  surf: Object.freeze({ low: 410, high: 3600, ground: 0.082, sheen: 0.042, accent: 1700 }),
  workshop: Object.freeze({ low: 280, high: 1500, ground: 0.044, sheen: 0.027, accent: 240 }),
});
const volume = (intensity) => 0.35 + 0.65 * resolveIntensity(intensity);
const round = (value) => Math.round(value * 100000) / 100000;
const finite01 = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError(`environment: ${label} must be finite in [0,1]`);
  return value;
};
const filtered = (rng, { durationSec, cutoffHz, gain, attackSec, releaseSec }) => ({
  freqHz: 0, durationSec,
  source: { type: 'noise', color: 'filtered', cutoffHz },
  envelope: {
    attackSec, releaseSec, sustainLevel: 0.74, curve: 4,
  },
  gain, pan: 0, seed: nextInt(rng, 0, 1e9),
});
const tonal = (rng, { durationSec, freqHz, gain, attackSec, releaseSec }) => ({
  freqHz, durationSec, source: { type: 'triangle' },
  envelope: { attackSec, releaseSec, sustainLevel: 0.65, curve: 3 },
  gain, pan: 0, seed: nextInt(rng, 0, 1e9),
});

/**
 * @param {{state:number}} rng Original seeded music engineering generator.
 * @param {object} opts A SOURCE-QUALIFIED environment selection from a world.
 * @param {'rain'|'wind'|'surf'|'workshop'} opts.kind
 * @param {number} [opts.durationSec=4] Finite episode duration (1..8 seconds).
 * @param {number} [opts.detail=0.7] Listener's texture richness (0..1).
 * @param {number|'minor'|'major'|'epic'|'default'} [opts.intensity='default']
 * @returns {{durationSec:number, notes:Array<{atSec:number, voice:object}>}}
 */
export function buildEnvironmentSoundscape(rng, opts = {}) {
  if (!rng || typeof rng !== 'object' || !Number.isFinite(rng.state))
    throw new TypeError('environment: original seeded RNG required');
  const kind = opts.kind;
  if (!Object.hasOwn(PROFILE, kind))
    throw new TypeError('environment: source must select rain, wind, surf or workshop explicitly');
  const durationSec = opts.durationSec ?? 4;
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec < 1 || durationSec > 8)
    throw new RangeError('environment: episode duration must be finite from 1 to 8 seconds');
  const detail = finite01(opts.detail ?? 0.7, 'detail');
  const profile = PROFILE[kind], level = volume(opts.intensity);
  const releaseSec = Math.min(1, durationSec * 0.2);
  const attackSec = Math.min(0.5, durationSec * 0.1);
  const base = filtered(rng, {
    durationSec, cutoffHz: profile.low, gain: profile.ground * level,
    attackSec, releaseSec,
  });
  const notes = [{ atSec: 0, voice: base }];
  // More texture increases sound richness but not how strongly a game claims
  // it is raining. A low-detail listener gets a quiet, single-layer bed.
  if (detail >= 0.25) {
    notes.push({atSec: 0, voice: kind === 'workshop'
      ? tonal(rng, {
          durationSec, freqHz: 110 + nextRange(rng, -1.2, 1.2),
          gain: profile.sheen * level * detail, attackSec, releaseSec,
        })
      : filtered(rng, {
          durationSec, cutoffHz: profile.high,
          gain: profile.sheen * level * detail, attackSec, releaseSec,
        })});
  }
  if (detail >= 0.6) {
    // Short original seeded transients suggest audible events without
    // writing a new game/weather event, channel or recording to the world.
    const count = Math.max(2, Math.min(6, Math.floor(durationSec)));
    for (let i = 0; i < count; i++) {
      const centre = durationSec * (i + 0.5) / count;
      const atSec = round(Math.max(0, Math.min(durationSec - 0.36,
        centre + nextRange(rng, -0.16, 0.16))));
      const length = Math.min(0.36, durationSec - atSec);
      const gain = profile.sheen * level * detail * nextRange(rng, 0.12, 0.28);
      const voice = kind === 'workshop'
        ? { ...tonal(rng, {
            durationSec: length,
            freqHz: profile.accent * nextRange(rng, 0.9, 1.25),
            gain, attackSec: 0.008, releaseSec: Math.min(0.24, length * 0.8),
          }), source: { type: 'karplus-strong', decay: 0.97, dampingHz: 2400 } }
        : filtered(rng, {
            durationSec: length,
            cutoffHz: profile.accent * nextRange(rng, 0.72, 1.33),
            gain, attackSec: 0.025, releaseSec: Math.min(0.22, length * 0.65),
          });
      notes.push({atSec, voice});
    }
  }
  notes.sort((a,b) => a.atSec - b.atSec);
  return Object.freeze({ durationSec, notes: Object.freeze(notes.map(note => Object.freeze(note))) });
}
