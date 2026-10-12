// anticipation.mjs
//
// The anticipation/tension-riser primitive: buildRiser(rng, {durationSec,
// outcome, intensity}) -- a generic "near-miss/reveal" audio shape every
// game with a moment of suspense wants (a slot reel settling, a loot-box
// opening, a card about to flip): the sound rises, then resolves, and the
// caller supplies which resolution ('win' -> a chime, drawn from
// ./library.mjs's own chime family so a resolved riser sounds like a real
// member of that family, not a bespoke one-off; 'lose' -> a short soft
// fail thud) because *this* module has no opinion on game rules -- it only
// knows how to shape suspense-then-release as sound, parameterized by
// duration and a caller-supplied outcome, exactly per this fiber's brief.
//
// Built entirely from primitives.mjs's buildRiseNotes (the same granular
// rising-blip-train generator library.mjs's plain 'riser' cue uses) plus one
// resolution voice appended at the end -- no changes to ../voice/voice.mjs
// were needed or made: a *continuous* per-sample pitch/filter sweep isn't
// expressible in one VoiceParams render (see ../web/webaudio-adapter.mjs's
// header for why), so the rise is built the same granular way the
// coin-shower cue builds its texture -- many short discrete voices, close
// enough together to read as one continuous sweep -- rather than by adding
// new automation surface to the synthesis core.

import { nextInt } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { resolveIntensity, buildRiseNotes } from './primitives.mjs';
import { buildChime } from './library.mjs';

/**
 * @param {{state:number}} rng
 * @param {object} [opts]
 * @param {number} [opts.durationSec=1.6] - total riser length, rise + resolution
 * @param {'win'|'lose'} [opts.outcome='win']
 * @param {number|'minor'|'major'|'epic'|'default'} [opts.intensity]
 * @returns {{durationSec:number, notes:Array<{atSec:number, voice:object}>}}
 */
export function buildRiser(rng, opts = {}) {
  const { durationSec = 1.6, outcome = 'win' } = opts;
  const level = resolveIntensity(opts.intensity);

  // The rise takes most of the budget; a short beat of near-silence (a
  // breath) separates it from the resolution so the resolution reads as a
  // distinct event rather than the rise's own tail.
  const riseSec = Math.max(0.2, durationSec * 0.78);
  const resolveAtSec = riseSec + 0.05;

  const rise = buildRiseNotes(rng, {
    riseSec,
    level,
    startHz: 220,
    endHz: 1000 + level * 900,
  });
  const notes = rise.notes.slice();

  let resolutionDurationSec;
  if (outcome === 'win') {
    const chime = buildChime(rng, { intensity: opts.intensity });
    for (const note of chime.notes) notes.push({ ...note, atSec: resolveAtSec + note.atSec });
    resolutionDurationSec = chime.durationSec;
  } else {
    const voice = {
      freqHz: 140,
      durationSec: 0.5,
      source: { type: 'sine' },
      envelope: { attackSec: 0.01, releaseSec: 0.45, sustainLevel: 0.55, curve: 4 },
      filter: { type: 'lowpass', cutoffHz: 500, Q: 0.707 },
      gain: 0.18,
      seed: nextInt(rng, 0, 1e9),
    };
    notes.push({ atSec: resolveAtSec, voice });
    resolutionDurationSec = voice.durationSec;
  }

  return { durationSec: Math.max(durationSec, resolveAtSec + resolutionDurationSec), notes };
}
