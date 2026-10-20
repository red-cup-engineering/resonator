# Sonic presentation of original Semioverse observations

**Owner:** Red Cup / Resonator, the original procedural-audio producer.
**Scope:** source-admitted positions + listener pose -> optional browser sound.
**Status:** source candidate; separately qualify the published package, each installed consuming application and each inhabitant's reading.

## Architectural context

MetroPlat is the FeltOS enterprise mudlib and Farstone is an authored FeltOS
harbor world. Neither delegates meanings, world transitions, claims, characters,
authorization, scene geometry or clocks to sound. QwzSpace remains the browser
3D **visual** renderer and source-scene picker, not a second MUD, sound
synthesizer, content registry or transcript authority. TUFTE / the app owns
controls, readable content, locale negotiation and accessible alternate panes.

The same admitted world Thing/event can be projected into complementary
forms: **structured semantics, textual reading, visual geometry, audio cues,
spoken language, time-aligned captions, and tactile affordances** as supported.
The user's selected richness determines how many forms are offered or rendered,
not how many independent world copies are invented. No audio-only assertion,
choice, instruction, game clue, permission or unique social disclosure is
allowed. Sound is an optional presentation of already-admitted information.

## Standard projection seam

Resonator retains its original seeded `createGameAudio`, event-stream
`createAudioEngine.schedule` and WebAudio playback routes. Callers may
supply optional `{x,y,z}` coordinates on a single VoiceParams playback, an
individual event, or its containing schedule/cue. **Per-event position takes
precedence over its schedule.** The app supplies one consistent explicit
coordinate system; Resonator neither guesses source location from speech nor
converts QwzSpace's axes into a claimed physical world frame.

```js
import { createAudioEngine } from '@red-cup-engineering/resonator/audio-engine';
import { createGameAudio } from '@red-cup-engineering/resonator/game';

const audio = createAudioEngine({
  storage: userLocalStorage, storageKey: 'world:audio:mixer',
});
const cues = createGameAudio({engine: audio});

// The app receives both positions from its existing admitted perception.
// Choose a coordinate transform once when the source world and WebAudio axes differ.
audio.setListenerPose({
  position: { x: listener.x, y: listener.y, z: listener.z },
  forward: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 0, z: 1 },
});
// Only a real user interaction should start the AudioContext.
audio.ensureStarted();
cues.play('chime', {
  seed: originalEvent.id,
  position: { x: sourcePosition.x, y: sourcePosition.y, z: sourcePosition.z },
  channel: 'sfx',
});
```

The objects `listener`, `originalEvent` and `sourcePosition` above are
**illustrative existing consumer-owned data**, not fields Resonator reads
from an imaginary global registry or a newly specified transport protocol.
An author chooses the real event-to-cue mapping within the consumer's
world/presentation projection. Never synthesize an event ID or physical
coordinate from a displayed label.

Native `PannerNode` and `AudioListener` implement optional spatialization
according to [Web Audio 1.1](https://www.w3.org/TR/webaudio-1.1/). The same
source/voice/gain/channel chain works if the host has no PannerNode. Browser
autoplay rules require a listener-initiated start; mute, per-channel level and
`stopAll` already belong to the original engine. Neither silent mode nor
lack of speakers should suppress or reclassify the world transcript.

## Procedural environmental sound from actual world qualities

The original audio producer now accepts a further **source-selected** cue,
`environment-bed`. Its `kind` is **only** one of `rain`, `wind`, `surf`,
or `workshop`; these are recipes, not new predicates or meteorological
measurements. The app must read an actually admitted original world
environment first, then choose an appropriate recipe. A `clear` or missing
weather state cannot automatically become `rain`; an institution called
"workshop" in a text string is no evidence of audible machinery.

The existing `createGameAudio({engine})` and `createAudioEngine` interfaces
remain unchanged. No sample file, parallel event clock, world sound registry,
authorization engine, soundtrack composer, or protocol is added. The
environmental sound is a finite, seeded `CueRender`, made of original
VoiceParams noise, tone, exciter, filter, and envelope voices. Its authored
episode duration is bounded **1 to 8 seconds**, with a maximum **8 notes**
at full detail; it is intentionally **not** described as a seamless looping
bed. The existing user-gesture, mixer channels, mute/volume, stop handles and
native WebAudio spatial emitter position all apply.

```js
// The application already has a lawfully acquired original world frame.
const weather = originalFrame.clock.weather; // actual Farstone source example
const kinds = {rain: 'rain', windy: 'wind'}; // only a consumer-authorized mapping
const kind = kinds[weather];
if (kind !== undefined && listenerSettings.environmentalAudioEnabled) {
  const played = gameAudio.play('environment-bed', {
    kind,
    seed: `${originalFrame.actor}:${originalFrame.tick}:${kind}`,
    intensity: listenerSettings.ambientIntensity,
    detail: listenerSettings.audioRichness, // 0..1, native layers
    channel: 'ambient',
  });
  // Keep played.handles, and stop each on source change, silence or departure.
}
```

The example `windy` mapping is intentionally a **candidate**, not a claim
that Farstone has a `windy` weather value. A receiving application must
verify and select from its *actual* authored enumeration and actor-scoped
source. No cue is played on an unsupported or unknown state. Retaining an
old ambience after the original world changes is a wrong-world bug. A new
soundscape **never adds a new server-side weather event**.

The same authorized semantic observation requires **readable** current
place/weather, distinct optional **spoken reading**, and optional
**procedural environment** even when Web Audio is disabled. Silent,
low-detail, and rich-audio profiles are preferences of the listener, not
world laws. No one should have to hear a cue to understand or act on the
world. Preserve language attribution in narration and visual captions.

**Receiving is still separate**: this source producer needs original Node
suite qualification, listening tests on representative devices, an immutable
published package and lockfile reception by each world, source/installed
version verification, and independently witnessed actor usage. Source-code
presence or V8 module tests alone do not establish the deployed feature.

## Internationalization, accessibility and individual richness

The **source content owner**, not Resonator, admits the original text,
assertion, available languages, semantic importance, temporal boundaries,
voice/speaker identity and rights. A sound cue ID is neither a word nor a
translation. Host locale negotiation and alternatives must select from
actually authored BCP 47-tagged readings, indicate absence honestly, and
retain provenance. Never generate an unmarked invented translation as a
new world utterance or treat language as a shader/volume option.

Required consuming-world projection choices:

1. Audio disabled, device unavailable or muted: text and authorized
   interaction still fully convey the actual fact and its provenance.
2. Quiet/reduced sensory profile: critical cue meaning is still present in
   a readable locale-aware event surface; suppress gratuitous ambience,
   alerts and overlapping foreground audio. Respect user-initiated playback.
3. Rich sonic profile: distinct world-authored ambience, effects, foreground
   voice, music and spatial scene may be combined; expose separate volume,
   mute and stop controls so content remains comprehensible.
4. Timed or recorded language material: provide actual synchronized
   caption/description tracks (prefer W3C [WebVTT](https://www.w3.org/TR/webvtt1/))
   or an equivalent native transcript; speech and essential non-speech
   audio both need accessibly named equivalents.
5. For multilingual speech: bind the actual authored language and
   localized transcript to the same event reference; identify absent
   translations, and do not send private voice/transcript data to
   an unapproved synthesis provider.

The above is to be accepted against
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) at each real consuming application,
including accessible control of continuous audio and meaningful alternatives
where sound adds information. A spatial audio signal alone is **not** an
accessible location announcement. Let each person choose richness without
turning another person's preferences into publicly broadcast world state.

## HITS receipt contract — not a staged demo

- **Producer:** verify both original non-spatial cue playback and spatial
  event/listener WebAudio paths, provenance-preserving deterministic cue
  identity, graceful device fallback, muted channel and invalid-coordinate
  rejection in the original `npm test` suite.
- **Farstone receiver:** consume one actual FeltOS perception event or
  observable source-authored ambient subject exactly once; show its original
  text on every available rendering tier; optionally play an approved cue
  at its actual received coordinates after user audio consent. Test replay,
  duplicate arrival, movement, volume, no-JS, alternate language, and no
  audio device without introducing a second clock or event log.
- **MetroPlat receiver:** use original authenticated World message /
  WorldPulse evidence, not guessed institutional state. A listener may
  hear and read a world change within their existing authorization,
  with actor presence and office/room location derived by MetroPlat.
  Verify 3D/2D/text/hush readings and separate source-vs-installed receipts.
- **App/GUI receiving:** TUFTE or owning client exposes audio permission,
  richness, quiet, language, captions and accessible controls. User choices
  affect rendering, **not** server decisions or other actors' perceptions.
- **Independent reception:** actually receive qualified package versions,
  lockfiles, browser/audio hardware (or evidenced lack), host build,
  deployed client, and a real inhabitant's observed result before marking
  the work as done. Treat changes, tests, merges and deployments separately.

This is the original audio producer's integration boundary and criteria.
It is **not** evidence that both consumers currently ship sound, have
localizable audio transcripts, or received a release.
