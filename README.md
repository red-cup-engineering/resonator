# @red-cup-engineering/resonator

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

The Ashlar fiber's audio/music engine. Zero audio asset files -- every sound
this package can produce is procedural synthesis, rendered from a seeded,
JSON-serializable parameter object, never a decoded sample file. That is a
house-wide doctrine (see `keywords` in `package.json`: `deterministic`), not
just this package's own preference. Its one runtime dependency is
`@red-cup-engineering/music-engineering-services-section`, which supplies the
`./generative` layer -- see "Absorption note" below.

## Source-witnessed Foley scores

The original `./game` API now exposes a pure [observed-event score compiler](docs/observed-activity-scoring.md): it preserves original event IDs, times, attempt/outcome distinctions and provenance; produces deterministic, bounded `CueRender` schedules from the **existing** game-cue registry; and supplies activity-density breakpoints only for genuinely complete observation windows. It does not auto-play, infer missing world conditions, authorize publication or implement an economic seller. This is the reusable foundation for MetroPlat actor Foley and an eventual A2A/x402 hired score service, tracked under [issue #3](https://github.com/red-cup-engineering/resonator/issues/3).

## What's here

- **`./dsp`** -- the DSP core: phase-accumulator oscillators, click-free
  exponential envelopes, biquad/one-pole filters, a delay line, Karplus-Strong
  plucked-string synthesis, a bow/breath (formant-swept) voice, saturation,
  and reverb, re-exporting `@red-cup-engineering/computer-audio-engineering-services-section`'s
  pitch/level analysis toolkit for this package's own tests to check what a
  render actually sounds like, not just that it ran.
- **`./generative`** -- the procedural-music layer: a maximally-even mode/
  scale generator, a Lambek-residuation-based motif grammar, developing-
  variation melody assembly, and the drone/flow/regime state machine that
  paces a full ambient render. This layer, and its own richer seeded
  performance-spec/event-stream successor, are evolving separately from this
  session's work -- see "Integration seams" below.
- **`./voice`** -- the synthesis core: a "voice" is DATA (a `VoiceParams`
  object -- source + envelope + optional filter/noise-mix/saturation/pan),
  and `renderVoice(params)` is a pure, deterministic function from that
  object to a stereo sample buffer. `./voice-presets` ships a small starter
  bank (`uiClick`, `chime`, `impact`, `ambientPad`, ...) meant to be spread
  and tweaked, not used as opaque names.
- **`./web`** -- WebAudio runtime glue (this session's work). See below.
- **`./game`** -- the game-audio kit: a seeded cue system, a standard cue
  library, an anticipation/riser primitive, and a loopable ambient bed (this
  session's work). See below.

### Absorption note

The DSP core was ported from
`@red-cup-engineering/music-engineering-services-section` (Red Cup's
ambient-render engine) into this fiber so game consumers could depend on a
game-audio-shaped package without pulling in that engine's own CLI/render-to-
file concerns, and this fiber's own `mixer.mjs` and oscillator/karplus-strong
changes are not shared back upstream. The pitch/level analysis toolkit
(`analysis.mjs`) has since moved to
`@red-cup-engineering/computer-audio-engineering-services-section`, the shared home both this
fiber's DSP fork and `music-engineering-services-section` were extracted
from; this package now depends on it directly rather than owning a copy.
The generative core (`./generative`) is not forked:
this package depends on `@red-cup-engineering/music-engineering-services-section`
directly and re-exports its `src/generative/*` modules, so the two packages
always run the identical composition/melody/harmony-flow implementation.
That source engine continues to evolve independently (most recently: a
documented serializable performance-spec/event-stream contract and adaptive
primitives -- intensity-layered stems, a motif system, quantized transitions,
risers). This package's `./web` and `./game` layers are built against that
eventual richer output without depending on its current in-progress state --
see "Integration seams" below for exactly how.

## Projecting Semioverse sound, spatial hearing and content alternatives

The original WebAudio engine now accepts optional source-authored 3D positions
on per-voice, per-event, schedule and game-cue playback, plus a listener pose.
It preserves the existing `PannerNode`-free cue path, muted channels and
headless preview. Callers are responsible for using the **same admitted world
observations** in text, graphics, audio, locale-aware captions and accessible
controls; a cue does not create a world fact. [Read the source/consumer contract](docs/sonic-world-projections.md),
including MetroPlat and Farstone independent receiving obligations.

### Source-admitted environmental acoustics

The existing `./game` cue registry now includes `environment-bed` with
`kind: 'rain'|'wind'|'surf'|'workshop'`. Each is a *procedural sound recipe*,
not a world/environment claim. Real content owners must select an appropriate
kind from already-admitted environmental facts. The same sound then plays
through the existing `createAudioEngine.schedule` path; no sample loader or
second sound renderer exists.

```js
const played = gameAudio.play('environment-bed', {
  kind: 'rain', // only if the original world admits rain here
  seed: originalWorldEventId,
  durationSec: 4, // bounded 1..8
  detail: listenerAudioRichness, // 0..1: from one to several sonic layers
  channel: 'ambient',
});
```

An episode is a finite seeded score, **not a seamless loop**. Its original
`handles` can be stopped when the world source changes or a listener
disables ambience. Text and other accessible readings of that source must
remain independently available. For domain/locale/source and installed
receiving, see [sonic-world-projections.md](docs/sonic-world-projections.md).

## `./web` -- WebAudio runtime glue

```js
import { createAudioEngine } from '@red-cup-engineering/resonator/audio-engine';

const engine = createAudioEngine();

// Call this from inside a real user-gesture handler (a click/keydown
// listener, a "tap to start" screen). Safe to call redundantly -- it's a
// no-op after the first successful call.
startButton.addEventListener('click', () => engine.ensureStarted());

engine.playVoice(myVoiceParams, { channel: 'sfx' });
```

### Rendering architecture: render-to-buffer, not a parallel node graph

`renderVoice` (from `./voice`) already renders every `VoiceParams` source
type -- sine/triangle/additive/noise/karplus-strong/bow-breath, plus filter/
noiseMix/saturation/pan -- to a deterministic stereo buffer. `./web`'s engine
calls `renderVoice` synchronously at play time, wraps the result in a WebAudio
`AudioBuffer`, and plays it through an `AudioBufferSourceNode`. It does
**not** translate `VoiceParams` into a bespoke tree of `OscillatorNode`/
`BiquadFilterNode`/`WaveShaperNode` objects.

That was a deliberate choice over the alternative (map each source type onto
native AudioNodes), for three reasons -- the full account is in
`src/web/webaudio-adapter.mjs`'s header comment:

1. **One implementation, not two that drift.** Karplus-Strong, bow-breath,
   and the noise-mix "chiff" texture are per-sample feedback/state processes
   with no native WebAudio node equivalent short of an AudioWorklet, which
   would need its own from-scratch reimplementation of that DSP. Rendering
   through the same `renderVoice` used everywhere else means every source
   type gets WebAudio playback for free, byte-identical to its offline
   render.
2. **Game cues are short.** Tens of milliseconds to a couple of seconds.
   Rendering that many samples of pure JS math synchronously at trigger time
   is not a meaningfully measurable cost.
3. **No AudioWorklet dependency**, which would need a separate module file
   loaded asynchronously into a realm with no access to this package's
   normal module graph.

The tradeoff: no live, continuous native-node automation of an in-flight
voice (its parameters are fixed at render time). A cue that wants a swept/
rising character (see `./game`'s riser/anticipation primitive) gets it by
scheduling many short discrete voices with changing `freqHz`/gain across
their span -- a granular approach, not continuous automation. What *does*
get real native automation: the mixer -- master/channel `GainNode`s and the
duck-channel ramp are genuine `AudioParam` automation, since that operates
across voices/cues rather than inside one.

### Headless testability

Nothing in `./web` reaches for a bare `AudioContext` global except the
*default* `contextFactory`, which a test overrides with a hand-written fake
implementing a minimal context interface (`createGain`/`createBufferSource`/
`createBuffer`/`createDynamicsCompressor`/`destination`). Every graph-
construction function (`buildMasterBus`, `buildChannelBuses`,
`connectBufferSource` in `src/web/graph.mjs`) is a pure function of that
injected context, so the whole engine runs the same way under `node:test` as
in a browser -- see `test/web-*.test.mjs` and
`test/helpers/fake-audio-context.mjs`.

### Silent degradation

If no `AudioContext` is available (no audio hardware, a `contextFactory`
that returns `null`, or construction throwing), the engine switches to
silent mode: `ensureStarted()` returns `false`, and every play/schedule call
becomes a no-op returning `null`/`[]` rather than throwing. Game code can
call this engine's API unconditionally without checking whether audio is
available on the current platform.

### Mixer: master bus, channel groups, mute/volume persistence

```js
const engine = createAudioEngine({
  channels: ['sfx', 'music', 'ambient'], // the default
  storage: window.localStorage,          // any {getItem,setItem} -- defaults to an in-memory Map
  storageKey: 'my-game:resonator-mixer', // defaults to 'resonator:mixer'
});

engine.setMasterVolume(0.8);
engine.setChannelVolume('music', 0.5);
engine.setChannelMuted('sfx', true);
engine.getMixerState(); // -> plain, JSON-serializable snapshot
```

Signal flow: per-play gain -> channel bus (`sfx`/`music`/`ambient`, or your
own names) -> master gain -> a `DynamicsCompressor` configured aggressively
(low threshold, high ratio, fast attack) as a peak limiter -- WebAudio has no
dedicated brickwall-limiter node, so an aggressively-configured compressor is
the standard idiom -- -> `ctx.destination`. Mixer state persists through any
injected `{getItem,setItem}` storage (e.g. `localStorage`) and degrades to
"resets every process" rather than throwing if storage is unavailable or
malformed.

### The event-stream seam

```js
// events: Array<{ atSec, voice: VoiceParams, channel?, gain?, loop? }>
engine.schedule(events, { startDelaySec: 0, channel: 'sfx' });

// spec: { notes: [...] } or { events: [...] } -- either key name works
engine.playSpec(spec, { channel: 'sfx' });
```

This is the generic seam an externally-supplied timed event stream is played
through -- see "Integration seams" below.

## `./game` -- the game-audio kit

Everything is seeded/deterministic: resolving the same cue name with the
same `seed` and `intensity` always produces a structurally identical
"CueRender" (`{ durationSec, notes: [{atSec, voice}, ...] }`).

```js
import { createGameAudio } from '@red-cup-engineering/resonator/game';
import { createAudioEngine } from '@red-cup-engineering/resonator/audio-engine';

const engine = createAudioEngine();
const gameAudio = createGameAudio({ engine });

gameAudio.play('chime', { seed: `${spinId}-win`, intensity: 'major', channel: 'sfx' });
```

Calling `createGameAudio()` with no `engine` puts `play()` into pure preview
mode: it resolves and returns the `CueRender` without touching any audio
backend -- useful for tests/tooling that want to inspect what a cue would
produce.

### Cue system

- `defineCue(name, build)` / `gameAudio.play(name, {seed, intensity, ...})`
  -- a cue is a name bound to a pure builder function
  `(rng, opts) => CueRender`. `resolveCue`/`registry.resolve` seeds a fresh
  RNG from `opts.seed` (falling back to the cue's own name -- an unseeded
  `play('impact')` is still fully reproducible, never ambient
  `Math.random()`).
- Intensity is a single continuous value in `[0, 1]`, with named tier
  aliases: `'minor'` (0.33), `'major'` (0.66), `'epic'` (1.0), and
  `'default'` (0.5) used when no intensity is given at all.
- `createCueRegistry(initialCues)` builds an independent registry instance
  rather than a shared module-level singleton -- this package declares
  `"sideEffects": false`, which a side-effecting "importing this module
  registers cues" pattern would violate for a bundled browser consumer.

### Standard cue library

| Cue | Shape |
| --- | --- |
| `ui-tap` | generic UI click, seeded pitch jitter |
| `success` / `failure` | short rising confirm / short descending thud |
| `tick` | percussive tick; `opts.index` nudges pitch for a run of ticks (e.g. per reel-stop) |
| `whoosh` | filtered-noise swell/sweep for transitions |
| `impact` | Karplus-Strong-bodied thump; intensity scales pitch down / gain up |
| `chime`, `chime-minor`, `chime-major`, `chime-epic` | one shared builder -- note count (1/2/3), pitch, duration, and gain all scale from one `intensity` value |
| `coin` | single bright glassy ding |
| `coin-shower` | many `coin` dings via granular repetition; count and span scale with intensity |
| `fanfare` | a short seeded melodic figure drawn from `./generative`'s scale/motif machinery, rendered as quick glassy notes |
| `riser` | a plain rising-tension sweep, no resolution baked in (generic anticipation filler) |

Two more cues are layered onto the default registry by `createGameAudio`
(not in `STANDARD_CUES` itself, to avoid a circular import -- see
`src/game/library.mjs`'s header):

- `ambient-bed` -- see below.
- `reveal` -- the fuller anticipation/riser primitive (see next section),
  under a different name than the plain `riser` cue so both are reachable.

### Anticipation / riser primitive

```js
import { buildRiser } from '@red-cup-engineering/resonator/game';
// or: gameAudio.play('reveal', { seed, durationSec, outcome: 'win'|'lose', intensity })

buildRiser(rng, { durationSec: 1.6, outcome: 'win', intensity: 'epic' });
```

A generic "near-miss/reveal" shape: rises (a granular train of short,
pitch-sweeping bandpassed-noise blips -- the same generator the plain
`riser` cue and `coin-shower`'s repetition idea both draw from), then
resolves -- to a win chime (drawn from this library's own `chime` family, so
a resolved riser sounds like a real member of that family) or a soft fail
thud, per the caller-supplied `outcome`. This module has no opinion on game
rules; it only shapes suspense-then-release as sound.

### Ambient/music bed

```js
gameAudio.play('ambient-bed', { seed: 'floor-1', mood: 'pad', intensity: 'default' });
gameAudio.duckForCue(bigWinCueRender, { toGain: 0.35 }); // dips the bed under a big cue, sized to that cue's own duration
```

Deliberately modest: one seeded, slightly-detuned pad or drone voice (from
`./voice-presets`), marked as a loop -- not a generative composition
assembled from the drone/flow/regime layers. That's a scope choice tracking
the same "keep it modest" note this package's procedural-music layer is
being developed further under, independently (see "Integration seams"). The
looping caveat is stated plainly in `src/game/ambient.mjs`'s header: a long
attack/release keeps both ends of the render close to silence, but not
mathematically seamless -- a true seamless loop is a refinement left for
when this single-voice bed is replaced by the richer engine below.

## Integration seams

Two seams this kit is built to satisfy without an adapter layer:

1. **The event-stream seam.** Every `CueRender` (`{durationSec, notes}`) this
   kit produces is already exactly what `./web`'s `engine.schedule()`/
   `engine.playSpec()` consume. This is what will let a richer, separately-
   evolving seeded performance-spec/procedural-music engine (see the
   "Absorption note" above) become playable through this same kit without
   rework: producing a `{durationSec, notes}` (or `{events}`) stream in that
   shape is all a caller needs to do, either by calling
   `engine.playSpec(externalSpec)` directly, or by registering it as a cue
   (`gameAudio.defineCue('bed', (rng, opts) => externalEngine.render(rng, opts))`)
   so it plays through `gameAudio.play('bed', opts)` like any other cue.

2. **The `{play(cueId, opts)}` shape.** `createGameAudio(...)`'s own return
   value already has a `play(name, opts)` method with exactly that
   signature, so anything expecting an injected player object satisfying
   `{play(cueId, opts)}` (e.g. a consumer's own audio-cues dispatcher) can be
   handed a `createGameAudio()` instance directly -- no adapter needed.
   `toPlayerInterface(gameAudio)` exists only for a caller that specifically
   wants an object with *nothing but* `play` on it.

## Worked example: a slot spin

A social-casino consumer wiring a spin's sound (the game logic below is
illustrative, not part of this package -- `./game` stays generic):

```js
import { createAudioEngine } from '@red-cup-engineering/resonator/audio-engine';
import { createGameAudio } from '@red-cup-engineering/resonator/game';

const engine = createAudioEngine();
const gameAudio = createGameAudio({ engine });
spinButton.addEventListener('click', () => engine.ensureStarted(), { once: true });

function playSpin(spinId, reelCount, resultTier /* 'none'|'minor'|'major'|'epic' */) {
  // 1. A riser fills the spin's own duration -- pure anticipation, no
  //    resolution baked in, since the reels haven't stopped yet.
  gameAudio.play('riser', { seed: `${spinId}-spin`, durationSec: 1.2 });

  // 2. One tick per reel stop, staggered, each reel gets its own seed so a
  //    run of ticks isn't identical, and `index` gives them a light
  //    ascending character.
  for (let reel = 0; reel < reelCount; reel++) {
    setTimeout(() => {
      gameAudio.play('tick', { seed: `${spinId}-reel-${reel}`, index: reel });
    }, 1200 + reel * 120);
  }

  // 3. The result, once known: a tiered win chime (or nothing, on a loss),
  //    with the ambient floor bed ducked under it automatically, sized to
  //    the chime's own duration.
  const resultAt = 1200 + reelCount * 120 + 150;
  setTimeout(() => {
    if (resultTier === 'none') return;
    const cueName = `chime-${resultTier}`; // 'chime-minor' | 'chime-major' | 'chime-epic'
    const cueRender = gameAudio.resolve(cueName, { seed: `${spinId}-result` });
    gameAudio.duckForCue(cueRender);
    engine.schedule(cueRender.notes, { channel: 'sfx' });

    // 4. A coin shower on any win, scaled to how big it was.
    if (resultTier !== 'none') {
      gameAudio.play('coin-shower', { seed: `${spinId}-coins`, intensity: resultTier });
    }
  }, resultAt);
}

// An ambient floor bed, started once and left running under everything.
gameAudio.play('ambient-bed', { seed: 'floor-1', channel: 'ambient' });
```

An epic win could instead be played through `reveal` (the anticipation
primitive) directly, letting the riser and its resolution share one seeded
call: `gameAudio.play('reveal', { seed: `${spinId}-reveal`, durationSec: 1.5, outcome: 'win', intensity: 'epic' })`.

## Testing

```sh
npm run check   # node --check on every .mjs file
npm test        # node --test
npm run check && npm test  # both
```

`./web`'s tests use a hand-written fake `AudioContext`
(`test/helpers/fake-audio-context.mjs`) -- no real audio hardware or browser
is needed. `./game`'s cue builders are pure functions of a seeded RNG, so
their tests check determinism (resolving the same cue+seed+intensity twice
is byte-for-byte identical, across the whole standard library) and the
specific shape claims each cue's own header makes (the chime family really
does escalate with intensity, the riser really does sweep upward, etc.)
directly, with no audio backend at all.

## Package status

`private: true` in `package.json` -- this package is not yet published to
the house Verdaccio registry (`http://127.0.0.1:4873/`). That flag is a
deliberate, house-wide signal in this fiber (compare
`@red-cup-engineering/replay-spectacle`, the one other package in this
directory also marked private and also absent from the registry) meaning
"still assembling, not yet a release," not an artifact of this session's own
work. Two of this package's declared exports are not yet backed by real
files -- `./generative` (`src/generative/index.mjs`) and `./music`
(`src/music/event-stream.mjs`/`src/music/scheduler.mjs`) -- which is an
independent, concrete reason a publish right now would ship a package whose
declared public API is partially broken, on top of the private-flag
convention itself.
