// index.mjs
//
// Barrel module for this package's `./game` export: the game-audio kit --
// a seeded/deterministic cue system (./cue.mjs), a standard cue library
// (./library.mjs), an anticipation/riser primitive (./anticipation.mjs), and
// a loopable ambient bed with duck-under-cue (./ambient.mjs) -- assembled by
// createGameAudio into one object a game calls `play(name, opts)` on.
//
// Two integration seams this kit is built to satisfy without an adapter
// layer, both load-bearing for how this fiber's consumers are expected to
// use it:
//
//  1. The {play(cueId, opts)} shape. createGameAudio(...)'s return value
//     already has a `play(name, opts)` method with exactly that signature,
//     so anything that wants to inject "a player" -- e.g. a consumer's own
//     audio-cues dispatcher that calls `player.play(cueId, opts)` against
//     whatever object it's handed -- can be handed a createGameAudio()
//     instance directly. toPlayerInterface() below exists only for a caller
//     that specifically wants an object with *nothing but* `play` on it
//     (e.g. to avoid exposing this kit's registry/engine to code that
//     shouldn't touch them); it is a one-line wrapper, not a translation
//     layer, because no translation is needed.
//
//  2. The event-stream seam. Every CueRender this kit produces
//     ({durationSec, notes: [{atSec, voice}, ...]}) is already exactly what
//     ../web/audio-engine.mjs's schedule()/playSpec() consume -- see
//     ./cue.mjs's header. That is what lets a future, richer seeded
//     performance-spec/procedural-music engine (evolving separately,
//     upstream of this fiber) become playable through this same kit without
//     rework: producing a {durationSec, notes} (or {events}) stream in that
//     shape is all a caller needs to do to play it via
//     `engine.playSpec(externalSpec)` directly, or by registering it as a
//     cue (`gameAudio.defineCue('bed', (rng, opts) => externalEngine.render(rng, opts))`)
//     so it plays through `gameAudio.play('bed', opts)` like any other cue.

import { createCueRegistry } from './cue.mjs';
import { STANDARD_CUES } from './library.mjs';
import { buildRiser } from './anticipation.mjs';
import { buildAmbientBed, duckAmbientForCue } from './ambient.mjs';

export { createCueRegistry } from './cue.mjs';
export {
  STANDARD_CUES,
  buildUiTap,
  buildSuccess,
  buildFailure,
  buildTick,
  buildWhoosh,
  buildImpact,
  buildChime,
  buildCoin,
  buildCoinShower,
  buildFanfare,
} from './library.mjs';
export { buildRiser } from './anticipation.mjs';
export { buildAmbientBed, duckAmbientForCue } from './ambient.mjs';
export { resolveIntensity, INTENSITY_TIERS, buildRiseNotes } from './primitives.mjs';

/** The cues STANDARD_CUES plus this default registry adds: 'ambient-bed' (./ambient.mjs) and 'reveal' (./anticipation.mjs's fuller riser-with-outcome primitive, kept under a different name than library.mjs's plain 'riser' so both are reachable by name). */
function defaultCueSet() {
  return {
    ...STANDARD_CUES,
    'ambient-bed': (rng, opts) => buildAmbientBed(rng, opts),
    reveal: (rng, opts) => buildRiser(rng, opts),
  };
}

/**
 * Assembles this kit's default cue set with a playback engine into one
 * object games call `play(name, opts)` on. Passing no `engine` at all keeps
 * play() in pure preview mode -- it resolves and returns the CueRender
 * without needing any audio backend, which is useful for tests/tooling that
 * want to inspect what a cue would produce.
 * @param {object} [opts]
 * @param {object} [opts.engine] - an engine from ../web/audio-engine.mjs's createAudioEngine; omit for pure preview mode
 * @param {Record<string, Function>} [opts.cues] - overrides the default cue set entirely (defaultCueSet() plus STANDARD_CUES if you want to extend rather than replace: `{...STANDARD_CUES, myCue: ...}`)
 * @returns {{
 *   engine: object|undefined,
 *   registry: object,
 *   resolve(name:string, opts?:object): object,
 *   play(name:string, opts?:object): object,
 *   defineCue(name:string, build:Function): void,
 *   listCues(): string[],
 *   duckForCue(cueRender:object, duckOpts?:object): void,
 * }}
 */
export function createGameAudio(opts = {}) {
  const engine = opts.engine;
  const registry = createCueRegistry(opts.cues ?? defaultCueSet());

  /** Pure: resolves a cue's deterministic render without touching the engine. */
  function resolve(name, playOpts = {}) {
    return registry.resolve(name, playOpts);
  }

  /**
   * Resolves and (if an engine is present) plays a cue. Matches the
   * {play(cueId, opts)} shape directly -- see this module's header.
   * @param {string} name
   * @param {object} [playOpts] - forwarded to resolve(); playOpts.channel selects the engine channel (default 'sfx')
   * @returns {{durationSec:number, notes:Array}|{cueRender:object, handles:Array}} the bare CueRender in preview mode (no engine), or {cueRender, handles} once actually played
   */
  function play(name, playOpts = {}) {
    const cueRender = resolve(name, playOpts);
    if (!engine) return cueRender;
    const handles = engine.schedule(cueRender.notes, { channel: playOpts.channel ?? 'sfx', position: playOpts.position });
    return { cueRender, handles };
  }

  /** @param {string} name @param {Function} build */
  function defineCue(name, build) {
    registry.define(name, build);
  }

  /** @returns {string[]} */
  function listCues() {
    return registry.list();
  }

  /** Ducks the ambient bed under a cue that's about to play, sized to that cue's own duration. See ./ambient.mjs's duckAmbientForCue. */
  function duckForCue(cueRender, duckOpts = {}) {
    if (!engine) return;
    duckAmbientForCue(engine, cueRender, duckOpts);
  }

  return { engine, registry, resolve, play, defineCue, listCues, duckForCue };
}

/**
 * Wraps a createGameAudio() instance down to just the {play(cueId, opts)}
 * shape -- a one-line adapter for a caller (e.g. a consumer's own
 * audio-cues dispatcher expecting an injected `{play(cueId, opts)}` player)
 * that wants nothing else from this kit exposed. Most callers don't need
 * this: createGameAudio()'s own return value already satisfies that shape
 * (see this module's header).
 * @param {{play(name:string, opts?:object): object}} gameAudio
 * @returns {{play(cueId:string, opts?:object): object}}
 */
export function toPlayerInterface(gameAudio) {
  return { play: (cueId, playOpts) => gameAudio.play(cueId, playOpts) };
}
