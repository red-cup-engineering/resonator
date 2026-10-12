// cue.mjs
//
// The cue system's registry: defineCue(name, build) / resolveCue(name, opts)
// -- a "cue" is a name bound to a pure builder function, and resolving a cue
// means running that builder against a fresh RNG seeded from opts.seed (or,
// if omitted, from the cue's own name, so an unseeded `play('impact')` is
// still fully reproducible rather than accidentally falling back to
// ambient Math.random -- see music-engineering-services-section's
// random.mjs header for why this whole engine treats that as a bug class,
// not a convenience).
//
// A cue builder is `(rng, opts) => CueRender`, where:
//   CueRender = { durationSec: number, notes: Array<{ atSec: number, voice: object, channel?: string, gain?: number, loop?: boolean }> }
// `voice` is a ../voice/voice.mjs VoiceParams object -- the exact same data
// shape ../voice/presets.mjs ships and ../web/audio-engine.mjs's
// schedule()/playSpec() already know how to play. A CueRender *is* a "spec"
// in that engine's event-stream sense: `engine.playSpec(resolveCue(name, opts))`
// works directly, with no adapter, which is what makes resolveCue's output
// pure-testable (see test/game-cue.test.mjs) independent of ever having an
// AudioContext -- and also what will let a future externally-supplied
// event-stream engine substitute for a hand-rolled builder without this
// module or ../web/audio-engine.mjs changing: anything shaped
// { durationSec, notes: [{atSec, voice}, ...] } plays.
//
// A registry instance (createCueRegistry) is deliberately not a shared
// module-level singleton: this package declares "sideEffects": false in its
// package.json (a bundler is told it may safely drop any of this package's
// modules that a build doesn't end up importing anything from), which a
// side-effecting "importing this module registers cues as a side effect"
// pattern would quietly violate for any bundled browser consumer. Instead
// ../game/index.mjs constructs its own default registry explicitly, seeded
// from ../game/library.mjs's plain STANDARD_CUES data object -- and any
// caller that wants an isolated registry (tests; a host that wants to
// override/rename cues without touching the shared default) can do the same.

import { makeRng } from '@red-cup-engineering/music-engineering-services-section/src/generative/random.mjs';

/**
 * Creates a new, independent cue registry.
 * @param {Record<string, (rng:{state:number}, opts:object) => object>} [initialCues={}] - name -> builder map to seed the registry with, e.g. library.mjs's STANDARD_CUES
 * @returns {{
 *   define(name:string, build:Function): void,
 *   has(name:string): boolean,
 *   list(): string[],
 *   resolve(name:string, opts?:object): {durationSec:number, notes:Array<object>},
 * }}
 */
export function createCueRegistry(initialCues = {}) {
  const cues = new Map(Object.entries(initialCues));

  return {
    /**
     * Registers (or overwrites) one cue's builder.
     * @param {string} name
     * @param {(rng:{state:number}, opts:object) => object} build
     */
    define(name, build) {
      if (typeof build !== 'function') throw new TypeError(`defineCue("${name}"): build must be a function`);
      cues.set(name, build);
    },
    /** @param {string} name @returns {boolean} */
    has(name) {
      return cues.has(name);
    },
    /** @returns {string[]} every registered cue name */
    list() {
      return Array.from(cues.keys());
    },
    /**
     * Resolves a cue to its deterministic render: a fresh RNG is seeded from
     * `opts.seed` (falling back to the cue's own name, never to an
     * unseeded/ambient source), then handed to the cue's builder along with
     * `opts` (with `intensity` defaulted to 'default' if omitted). Calling
     * this twice with the same name+opts.seed+opts.intensity (and any other
     * opts the builder reads) always produces a structurally identical
     * CueRender -- this is the property test/game-cue.test.mjs checks across
     * the whole standard library.
     * @param {string} name
     * @param {object} [opts]
     * @param {number|string} [opts.seed] - defaults to `name`
     * @param {number|'minor'|'major'|'epic'|'default'} [opts.intensity='default']
     * @returns {{durationSec:number, notes:Array<{atSec:number, voice:object}>}}
     */
    resolve(name, opts = {}) {
      const build = cues.get(name);
      if (!build) {
        throw new Error(`resolveCue: unknown cue "${name}". Known cues: ${Array.from(cues.keys()).join(', ') || '(none registered)'}`);
      }
      const rng = makeRng(opts.seed ?? name);
      const intensity = opts.intensity ?? 'default';
      return build(rng, { ...opts, intensity });
    },
  };
}
