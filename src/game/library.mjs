// library.mjs
//
// The standard cue library: STANDARD_CUES, a plain name -> builder object
// (inert data -- nothing here calls defineCue or registers anything as an
// import-time side effect, see ./cue.mjs's header for why) that
// ./index.mjs seeds its default registry from. Every builder here follows
// ./cue.mjs's CueRender contract: `(rng, opts) => { durationSec, notes }`.
//
// Most cues below are built from ../voice/presets.mjs starting points with
// small seeded jitter/scaling, exactly the way that module's own header
// describes them being used ("copy one, tweak a field, ship it"). The two
// exceptions -- fanfare and (in ./ambient.mjs) the ambient bed -- are the
// only cues in this kit that reach into the procedural-music layer
// (../generative/), and even those stay deliberately modest: a single short
// seeded motif and a single seeded pad voice, not a full composition. That
// is a scope choice, not a capability limit -- a richer, separately-evolving
// procedural-music/performance-spec engine is expected to plug into this
// same seam later (../web/audio-engine.mjs's schedule()/playSpec(), which
// every CueRender here already satisfies) without this module changing.

import { uiClick, uiConfirm, impact as impactPreset, chime as chimePreset } from '../voice/presets.mjs';
import { nextRange, nextInt } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';
import { makeScale, MODE_PRESETS } from '@red-cup-engineering/music-engineering-services-section/src/generative/scale.mjs';
import { generateMotif, degreeToHz } from '@red-cup-engineering/music-engineering-services-section/src/generative/melody.mjs';
import { resolveIntensity, buildRiseNotes } from './primitives.mjs';

/** A single voice, no rhythm -- the shape most of this library's cues share. */
function singleNoteRender(voice, durationSec = voice.durationSec) {
  return { durationSec, notes: [{ atSec: 0, voice }] };
}

// -- ui-tap ---------------------------------------------------------------

/** Generic UI tap/click: presets.uiClick with a small seeded pitch jitter so repeated taps don't sound like a sample on a loop. */
export function buildUiTap(rng) {
  const jitter = 1 + nextRange(rng, -0.04, 0.04);
  const voice = { ...uiClick, freqHz: uiClick.freqHz * jitter, seed: nextInt(rng, 0, 1e9) };
  return singleNoteRender(voice);
}

// -- success / failure ------------------------------------------------------

/** Short rising major-third confirm: two quick notes, root then a step up. Intensity brightens (raises gain and slightly shortens the gap) rather than changing pitch material -- this is a UI acknowledgement, not a tiered win. */
export function buildSuccess(rng, { intensity } = {}) {
  const level = resolveIntensity(intensity);
  const gap = 0.09 - 0.02 * level;
  const notes = [0, 4].map((semitones, i) => ({
    atSec: i * gap,
    voice: {
      ...uiConfirm,
      freqHz: uiConfirm.freqHz * Math.pow(2, semitones / 12),
      gain: uiConfirm.gain * (0.75 + 0.35 * level),
      seed: nextInt(rng, 0, 1e9),
    },
  }));
  return { durationSec: gap + uiConfirm.durationSec, notes };
}

/** Short descending muted thud: a single note, softer/duller than uiConfirm, reading as a clear "no" without being harsh. */
export function buildFailure(rng) {
  const voice = {
    ...uiConfirm,
    freqHz: uiConfirm.freqHz * Math.pow(2, -5 / 12),
    source: { type: 'triangle' },
    envelope: { attackSec: 0.006, releaseSec: 0.2, sustainLevel: 0.65, curve: 4 },
    filter: { type: 'lowpass', cutoffHz: 1400, Q: 0.707 },
    gain: uiConfirm.gain * 0.85,
    seed: nextInt(rng, 0, 1e9),
  };
  return singleNoteRender(voice);
}

// -- tick -------------------------------------------------------------------

/** A short percussive tick, e.g. one per reel-stop in a slot spin. `opts.index` (the reel/tick position, if the caller has one) nudges pitch upward per index so a run of ticks has a light ascending character rather than being identical -- callers that want full independence between ticks should also vary opts.seed per tick (e.g. `play('tick', {seed: `${spinId}-reel-${i}`, index: i})`). */
export function buildTick(rng, { index = 0 } = {}) {
  const jitter = 1 + nextRange(rng, -0.05, 0.05);
  const voice = { ...uiClick, freqHz: uiClick.freqHz * jitter * (1 + 0.03 * index), seed: nextInt(rng, 0, 1e9) };
  return singleNoteRender(voice);
}

// -- whoosh -------------------------------------------------------------------

/** A short filtered-noise swell/sweep, for transitions (menu opens, a card flip, a reel starting to spin). */
export function buildWhoosh(rng, { durationSec = 0.5 } = {}) {
  const voice = {
    freqHz: 300,
    durationSec,
    source: { type: 'noise', color: 'filtered', cutoffHz: 3200 },
    envelope: { attackSec: durationSec * 0.35, releaseSec: durationSec * 0.55, sustainLevel: 0.8, curve: 3 },
    filter: { type: 'bandpass', cutoffHz: 2200, Q: 1.2 },
    gain: 0.18,
    seed: nextInt(rng, 0, 1e9),
  };
  return singleNoteRender(voice, durationSec);
}

// -- impact -------------------------------------------------------------------

/** A physical thump/hit, from presets.impact's karplus-strong body. Intensity scales pitch down and gain/body up for a "bigger" hit. */
export function buildImpact(rng, { intensity } = {}) {
  const level = resolveIntensity(intensity);
  const voice = {
    ...impactPreset,
    freqHz: impactPreset.freqHz * (1.15 - 0.3 * level),
    gain: impactPreset.gain * (0.7 + 0.6 * level),
    seed: nextInt(rng, 0, 1e9),
  };
  return singleNoteRender(voice);
}

// -- chime family (win-minor/major/epic derive from this one builder) ------

const CHORD_TONE_RATIOS = Object.freeze([1, 5 / 4, 3 / 2, 2]); // root, major third, fifth, octave

/**
 * The chime family's shared builder: a short glassy-additive chord whose
 * note count, pitch, duration, and gain all scale from one `intensity`
 * value. This is the whole "escalating tiers derive from one cue family"
 * requirement -- 'chime-minor'/'chime-major'/'chime-epic' below are thin
 * fixed-intensity wrappers over this same function, not three separate
 * recipes, and a caller can also hit any point between them directly via
 * `play('chime', {intensity: 0.8})`.
 * @param {{state:number}} rng
 * @param {object} [opts]
 * @param {number|'minor'|'major'|'epic'|'default'} [opts.intensity]
 * @returns {{durationSec:number, notes:Array}}
 */
export function buildChime(rng, { intensity } = {}) {
  const level = resolveIntensity(intensity);
  const noteCount = level < 0.45 ? 1 : level < 0.8 ? 2 : 3;
  const baseFreq = chimePreset.freqHz * (0.9 + 0.3 * level);
  const gap = 0.11 - 0.03 * level;
  const dur = chimePreset.durationSec * (0.8 + 0.5 * level);

  const notes = [];
  for (let i = 0; i < noteCount; i++) {
    const ratio = CHORD_TONE_RATIOS[Math.min(i, CHORD_TONE_RATIOS.length - 1)];
    const jitter = 1 + nextRange(rng, -0.004, 0.004);
    notes.push({
      atSec: i * gap,
      voice: {
        ...chimePreset,
        freqHz: baseFreq * ratio * jitter,
        durationSec: dur,
        gain: chimePreset.gain * (0.7 + 0.6 * level),
        seed: nextInt(rng, 0, 1e9),
      },
    });
  }
  const durationSec = (noteCount - 1) * gap + dur;
  return { durationSec, notes };
}

/** @param {number|'minor'|'major'|'epic'} tier @returns {(rng:object, opts?:object) => object} a buildChime wrapper pinned to `tier` unless the caller's own opts.intensity overrides it */
function chimeTier(tier) {
  return (rng, opts = {}) => buildChime(rng, { ...opts, intensity: opts.intensity ?? tier });
}

// -- coin (single + shower) --------------------------------------------------

/** A single bright coin ding: a short, high, bandpassed glassy blip. */
export function buildCoin(rng) {
  const jitter = 1 + nextRange(rng, -0.03, 0.03);
  const voice = {
    freqHz: 1800 * jitter,
    durationSec: 0.22,
    source: { type: 'additive', partials: 'glassy' },
    envelope: { attackSec: 0.001, releaseSec: 0.2, sustainLevel: 0.9, curve: 9 },
    filter: { type: 'bandpass', cutoffHz: 1800, Q: 3 },
    gain: 0.22,
    seed: nextInt(rng, 0, 1e9),
  };
  return singleNoteRender(voice);
}

/** A coin shower: many buildCoin dings via granular repetition, scattered (seeded) across a span whose length and density scale with intensity. */
export function buildCoinShower(rng, { intensity } = {}) {
  const level = resolveIntensity(intensity);
  const count = Math.round(6 + level * 24); // 6..30 coins
  const spanSec = 0.5 + level * 1.2;

  const notes = [];
  for (let i = 0; i < count; i++) {
    const atSec = nextRange(rng, 0, spanSec);
    const single = buildCoin(rng).notes[0].voice;
    notes.push({ atSec, voice: { ...single, gain: single.gain * nextRange(rng, 0.55, 1) } });
  }
  notes.sort((a, b) => a.atSec - b.atSec);
  return { durationSec: spanSec + 0.25, notes };
}

// -- fanfare ------------------------------------------------------------------

/**
 * A short seeded melodic figure from the procedural-music layer: a
 * 4-7 note motif drawn from music-engineering-services-section's melody.mjs's generateMotif over a
 * bright pentatonic scale, rendered as quick glassy chime notes. This is the
 * one cue in this library that composes rather than just varying a preset --
 * kept deliberately small (one motif, fixed register, no development/
 * variation/phrase-cadence machinery) so it stays a "figure," not a
 * miniature piece; see this module's header for why (a richer external
 * composition engine is the intended long-term source of bigger material).
 * @param {{state:number}} rng
 * @param {object} [opts]
 * @param {number|'minor'|'major'|'epic'|'default'} [opts.intensity]
 * @returns {{durationSec:number, notes:Array}}
 */
export function buildFanfare(rng, { intensity } = {}) {
  const level = resolveIntensity(intensity);
  const scale = makeScale(MODE_PRESETS.dMajorPentatonic);
  const length = 4 + Math.round(level * 3); // 4..7 notes
  const motif = generateMotif(rng, { length, startDegree: 0 });
  const secPerNote = 0.16 - 0.03 * level; // brighter/faster at higher intensity

  const notes = [];
  let atSec = 0;
  for (const note of motif) {
    const hz = degreeToHz(scale, note.degree + 7, 2); // +7 degrees = one register up; base octave index 2, for a bright fanfare range
    notes.push({
      atSec,
      voice: {
        freqHz: hz,
        durationSec: secPerNote * 1.8,
        source: { type: 'additive', partials: 'glassy' },
        envelope: { attackSec: 0.004, releaseSec: secPerNote * 1.4, sustainLevel: 0.85, curve: 6 },
        filter: { type: 'lowpass', cutoffHz: 7000 },
        gain: 0.2 * (0.75 + 0.5 * level),
        seed: nextInt(rng, 0, 1e9),
      },
    });
    atSec += secPerNote;
  }
  return { durationSec: atSec + secPerNote * 1.8, notes };
}

// -- riser / anticipation (open rise, no resolution) --------------------------

/**
 * A plain rising-tension sweep with no resolution baked in -- generic
 * anticipation filler (e.g. under a reel spin, before the outcome is known).
 * For the fuller "rises then resolves to a win chime or a soft fail"
 * primitive, see ./anticipation.mjs's buildRiser, which this same rise
 * generator (primitives.mjs's buildRiseNotes) also feeds.
 */
export function buildRiser(rng, { intensity, durationSec = 1.2 } = {}) {
  const level = resolveIntensity(intensity);
  return buildRiseNotes(rng, { riseSec: durationSec, level });
}

// -- registry seed data -------------------------------------------------------

/**
 * name -> builder map. Inert data -- see this module's header for why this
 * isn't a registry with import-time side effects. ./index.mjs's default
 * registry is createCueRegistry(STANDARD_CUES); 'ambient-bed' (from
 * ./ambient.mjs) and the anticipation.mjs's own richer 'riser'-with-outcome
 * primitive are layered on top there rather than included here, since they
 * pull in this library's exports themselves (buildChime) and would be a
 * circular import if defined in this module instead.
 */
export const STANDARD_CUES = Object.freeze({
  'ui-tap': buildUiTap,
  success: buildSuccess,
  failure: buildFailure,
  tick: buildTick,
  whoosh: buildWhoosh,
  impact: buildImpact,
  chime: buildChime,
  'chime-minor': chimeTier('minor'),
  'chime-major': chimeTier('major'),
  'chime-epic': chimeTier('epic'),
  coin: buildCoin,
  'coin-shower': buildCoinShower,
  fanfare: buildFanfare,
  riser: buildRiser,
});
