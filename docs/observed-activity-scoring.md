# Source-witnessed Foley and soundscaping

**Owner:** [Resonator](../README.md). **Receiving request:** [#3](https://github.com/red-cup-engineering/resonator/issues/3). **Status:** candidate source; installed consumer, production server, A2A and x402 receipt remain independent.

## Native interfaces, no substitute engine

The new original game export includes **scoreObservations(observations, window)**, a pure versioned JSON score compiler, and **scoreToResonatorSpec(score, resolveCue)**, a pure adapter to Resonator's EXISTING VoiceParams schedule. The ordinary game audio cue resolver, WebAudio scheduler, device/volume controls and Music Engineering generative composition retain their original ownership.

An authorized consumer may construct the score from these real source records:

    {
      "sourceRef": "original-invocation-id",
      "atMs": 1792540000000,
      "domain": "work",
      "phase": "attempt",
      "intensity": 0.5
    }

Domains: work, communication, movement, resource, knowledge, settlement, system. Phases: attempt, outcome, observation. **Only a witnessed outcome** may carry a status of ok, failed or unknown. A successful transport operation is **not** institutional acceptance. A coin cue is produced only for a source-classified settled transaction with a witnessed ok outcome, not for unverified commerce. Optional finite x/y/z positions must be original source-authored positions, not guesses.

A caller must authorize and filter each observation before scoring: a source ID is not a permission to leak it. A complete source interval may yield an activity-intensity envelope for Music Engineering's arrangement; partial/unknown coverage yields null, never an invented silent interval.

Window up to 300 seconds; at most 4096 observations, 32 emitted cues and 512 native notes. Replayed duplicate records collapse; contradictory same-source/phase records refuse. Output includes actual input/event counts, emitted/omitted counts, requested duration, original source IDs and deterministic per-event seed. RenderedAudioBytes is **zero** until another actual renderer reports output.

### Native WebAudio consumer

    import {
      createGameAudio, scoreObservations, scoreToResonatorSpec
    } from '@red-cup-engineering/resonator/game';
    import { createAudioEngine } from '@red-cup-engineering/resonator/audio-engine';

    // Input source and listener authorization precede this call.
    const score = scoreObservations(admittedEvents, {
      startMs: sourceStart, endMs: sourceEnd,
      coverage: 'partial' // do not assume a historical pulse is exhaustive
    });
    const registry = createGameAudio();
    const spec = scoreToResonatorSpec(
      score, (cue, opts) => registry.resolve(cue, opts)
    );

    // In a REAL user click handler only, not on load or polling:
    const audio = createAudioEngine({
      storage: window.localStorage, storageKey: 'metroplat:audio'
    });
    if (audio.ensureStarted()) audio.schedule(spec.notes, { channel: 'sfx' });

The application must also retain original texts, source IDs, explicit audio opt-in, stop/mute, localized captions and graceful no-audio handling. Never play an old replay window as a burst on reconnect. Source-relative event timing is not a new global clock.

## MetroPlat receiving

- MetroPlat's original WorldPulse records source RPC **attempts** in its acts list, and later indicates a matched outcome only for a current walker. Original attempts cannot be turned into invented Work completions. Use distinct correct source IDs for the two phases.
- MetroPlat Operations Console has the authenticated private Play pulse and WorkTellings; it is the **consumer** that can select permitted per-room events, derive actual listener pose and subscribe/clear its own cursor. Public Street cannot expose private RPC verbs or work events.
- Existing QwzSpace owns graphical spatial scene; Resonator owns the sound engine; Music Engineering owns long-form adaptive score, and Computer Audio owns DSP. No second MUD clock, environment registry, audio renderer or Work authority.
- Host/package receiving is separate. Tests must cover installed dependency and frozen lock, native browser and headless audio, actual actor/user opt-in, no sound when unconsented, authentic success/failure, room/camera changes, replay, stop/hidden tab, accessible audio alternatives and source/locale fidelity.

## A2A and x402 product acceptance

A future **SonicScoreJob** will accept bounded authorized observations and a target of score-json or audio-wav, with seed, duration/resource caps, rights, quote ceiling and source/cue version. It will return source/provenance digests, actual meters, artifact ID and disposition. Internal costs, quoted limits and observed costs must stay distinct.

- A2A Services Section owns the signed Agent Card and 1.0 SendMessage/GetTask/CancelTask plus artifacts. Only advertise jobs actually backed by task-state custody and tested cancellation/idempotence.
- x402 Services Section owns the paid boundary; verify payment **before** costly work, bind it to a job, record separate payment/render receipts and cancellation/refund policy. Do not invent another facilitator or money rail.
- Existing Music Engineering worker and Computer Audio DSP own synthesis; Causeway's market.561.group owns merchant product offers. Discovery is not a sale; a drafted offer is not running delivery.
- First monetize a small fixed-cap score-json fulfillment after task/provider and privacy tests, then an actually metered WAV service once rendering and artifact custody are proven.

This specification and candidate source change do **not** claim a deployed MetroPlat Foley client or an already-selling A2A/x402 service.
