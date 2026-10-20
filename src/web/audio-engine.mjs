// audio-engine.mjs
//
// The runtime glue that turns this package's pure, node-testable pieces
// (renderVoice, this fiber's game-audio cue system) into sound in a browser:
// lazy AudioContext creation (autoplay-policy safe -- nothing constructs an
// AudioContext until ensureStarted() is called, which a host is expected to
// do from inside a real user-gesture handler), a master bus with a
// limiter-configured compressor, per-channel gain groups, mute/volume with
// pluggable persistence, and the generic schedule()/playSpec() entry points
// that execute an externally-supplied timed event stream through the voice
// layer -- see this module's "event-stream contract" section below.
//
// Headless-testable by construction: createAudioEngine never reaches for a
// bare `AudioContext` global itself except through the *default*
// contextFactory, which a test overrides with its own factory returning a
// hand-written fake implementing graph.mjs's minimal context interface. Every
// other function in this module (buildMasterBus, buildChannelBuses,
// connectBufferSource in ./graph.mjs; renderedVoiceToAudioBuffer in
// ./voice-buffer.mjs) is already a pure function of an injected context, so
// the whole engine is exercised the same way in node:test as in a browser.
//
// Silent-degradation contract: if no AudioContext is available (no audio
// hardware, a contextFactory that returns null/undefined, or construction
// throwing) the engine silently switches to "silent" mode -- ensureStarted()
// returns false, and every play/schedule call becomes a no-op that returns
// null/[] rather than throwing. A host can always call this engine's API
// unconditionally (e.g. from shared game logic that doesn't know or care
// whether audio is available on this platform) without special-casing.
//
// Event-stream contract (the seam future callers, including this fiber's own
// ../game/ cue system and an eventual richer procedural-music engine, target
// instead of hand-wiring AudioBufferSourceNodes themselves):
//   an "event" is { atSec: number, voice: VoiceParams, channel?: string, gain?: number, loop?: boolean }
//   a "spec" is { notes: Event[], channel?: string } (or { events: Event[] } -- both keys are accepted)
// schedule(events, opts) plays every event's `voice` (a ../voice/voice.mjs
// VoiceParams object -- the same data shape renderVoice/the game-audio kit's
// cues already produce) at ctx.currentTime + opts.startDelaySec + atSec, on
// its own or opts.channel's bus. playSpec(spec, opts) is schedule() over
// spec.notes/spec.events. This is deliberately not tied to this package's own
// cue-render shape any more tightly than "has a `voice` and an `atSec`" --
// any producer of timed VoiceParams events (this fiber's cue system today, a
// richer seeded performance-spec engine later) can be played through it
// without this module changing.

import { renderVoice } from '../voice/voice.mjs';
import { buildMasterBus, buildChannelBuses, connectBufferSource, setSpatialPosition, DEFAULT_CHANNELS } from './graph.mjs';
import { renderedVoiceToAudioBuffer } from './voice-buffer.mjs';
import { makeInMemoryStorage, makeDefaultMixerState, loadMixerState, saveMixerState, DEFAULT_STORAGE_KEY } from './persistence.mjs';

/**
 * Resolves the default AudioContext factory: prefers a real AudioContext (or
 * the older webkit-prefixed constructor) if the global exists, otherwise
 * returns null -- which is exactly what tells ensureStarted() to switch this
 * engine into silent mode. Wrapped in try/catch because some hosts throw
 * constructing an AudioContext outside a user-gesture window rather than
 * returning a suspended one; either way, a caller retries by calling
 * ensureStarted() again from an actual gesture handler.
 * @returns {object|null}
 */
function defaultContextFactory() {
  const AC = (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext)) || null;
  if (!AC) return null;
  try {
    return new AC();
  } catch {
    return null;
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Creates a game-audio engine. Nothing in this call touches an AudioContext
 * -- construction is always cheap and safe to do at app-init time, well
 * before any user gesture. Call `ensureStarted()` from inside a real gesture
 * handler (a click/keydown listener, a "tap to start" screen, etc.) before
 * the first sound needs to play; every play/schedule method below also calls
 * it defensively, so a host that forgets is degraded (silent until a gesture
 * does happen, in browsers that require one) rather than broken.
 * @param {object} [opts]
 * @param {() => object|null} [opts.contextFactory] - defaults to a real AudioContext lookup; tests inject a fake context factory here
 * @param {string[]} [opts.channels=DEFAULT_CHANNELS] - channel-bus names (default: sfx, music, ambient)
 * @param {{getItem(key):string|null, setItem(key,value):void}} [opts.storage] - defaults to an in-memory Map (see persistence.mjs)
 * @param {string} [opts.storageKey] - localStorage-style key mixer state is persisted under
 * @param {number} [opts.masterVolume=1] - initial master volume, used only if no persisted state is found
 * @param {object} [opts.compressor] - partial override of graph.mjs's limiter defaults
 * @returns {object} engine -- see this module's exported functions' JSDoc for each method
 */
export function createAudioEngine(opts = {}) {
  const channelNames = opts.channels || DEFAULT_CHANNELS;
  const storage = opts.storage || makeInMemoryStorage();
  const storageKey = opts.storageKey || DEFAULT_STORAGE_KEY;
  const contextFactory = opts.contextFactory || defaultContextFactory;

  let mixerState = loadMixerState(storage, storageKey, makeDefaultMixerState(channelNames, opts.masterVolume ?? 1));

  let ctx = null;
  let masterGain = null;
  let channelBuses = null;
  /** @type {'pending'|'started'|'silent'} */
  let startState = 'pending';
  const activeHandles = new Set();
  let listenerPose = null;

  // WebAudio's AudioListener is a device-relative presentation of a caller's
  // actual source-derived pose, not a second game camera or position store.
  function applyListenerPose() {
    const listener = ctx?.listener;
    if (!listener || !listenerPose) return false;
    const located = setSpatialPosition(listener, listenerPose.position);
    if (listenerPose.forward) {
      const { forward, up } = listenerPose;
      const params = ['forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];
      const values = [forward.x, forward.y, forward.z, up.x, up.y, up.z];
      if (params.every((key) => listener[key] && typeof listener[key].value === 'number')) {
        params.forEach((key, i) => { listener[key].value = values[i]; });
      } else if (typeof listener.setOrientation === 'function') {
        listener.setOrientation(...values);
      }
    }
    return located;
  }

  /** Retain a source-derived listener pose before audio permission is granted.
   * Coordinates and direction vectors are in one explicitly chosen world frame;
   * no axis/units/locale can be inferred from the audio device.
   */
  function setListenerPose({ position, forward, up } = {}) {
    setSpatialPosition(null, position); // validate without constructing AudioContext
    if ((forward === undefined) !== (up === undefined))
      throw new TypeError('listener orientation requires both forward and up');
    if (forward !== undefined) {
      setSpatialPosition(null, forward);
      setSpatialPosition(null, up);
      const cross = {
        x: forward.y * up.z - forward.z * up.y,
        y: forward.z * up.x - forward.x * up.z,
        z: forward.x * up.y - forward.y * up.x,
      };
      if (!Number.isFinite(cross.x) || !Number.isFinite(cross.y) || !Number.isFinite(cross.z) ||
          Math.hypot(cross.x, cross.y, cross.z) < 1e-8)
        throw new RangeError('listener forward and up must be independent');
    }
    listenerPose = {
      position: { ...position },
      ...(forward === undefined ? {} : { forward: { ...forward }, up: { ...up } }),
    };
    applyListenerPose();
    return getListenerPose();
  }
  function getListenerPose() {
    return listenerPose === null ? null : JSON.parse(JSON.stringify(listenerPose));
  }

  function persist() {
    saveMixerState(storage, storageKey, mixerState);
  }

  function channelState(channel) {
    return mixerState.channels[channel] || (mixerState.channels[channel] = { volume: 1, muted: false });
  }

  function effectiveChannelGain(channel) {
    if (mixerState.masterMuted) return 0;
    const cs = channelState(channel);
    return cs.muted ? 0 : cs.volume;
  }

  function applyAllGainsToGraph() {
    if (!ctx) return;
    setParamValue(masterGain.gain, mixerState.masterMuted ? 0 : mixerState.masterVolume);
    for (const [name, node] of channelBuses) setParamValue(node.gain, effectiveChannelGain(name));
  }

  /**
   * Creates the AudioContext (via contextFactory) and builds the graph on
   * first call; a no-op returning the same result on every later call. Safe
   * to call from anywhere, any number of times -- but the *first* call
   * should happen inside a real user-gesture handler in browsers with an
   * autoplay policy, since that is what lets the created AudioContext start
   * (or resume into) the 'running' state instead of staying 'suspended'.
   * @returns {boolean} true if a real audio graph now exists, false if the engine is (now, or already) in silent mode
   */
  function ensureStarted() {
    if (startState === 'started') return true;
    if (startState === 'silent') return false;
    // Missing or failed audio devices must not break the original text/world.
    let created;
    try { created = contextFactory(); } catch { created = null; }
    if (!created) {
      startState = 'silent';
      return false;
    }
    ctx = created;
    const bus = buildMasterBus(ctx, { compressor: opts.compressor, masterVolume: mixerState.masterMuted ? 0 : mixerState.masterVolume });
    masterGain = bus.masterGain;
    channelBuses = buildChannelBuses(ctx, masterGain, channelNames);
    applyAllGainsToGraph();
    applyListenerPose();
    startState = 'started';
    return true;
  }

  /** @returns {boolean} true once the engine has determined no audio backend is available (see this module's header for the silent-degradation contract) */
  function isSilent() {
    return startState === 'silent';
  }

  /**
   * Renders one VoiceParams object (via ../voice/voice.mjs's renderVoice)
   * and plays it through the given channel's bus. No-ops (returns null)
   * if the engine is silent.
   * @param {object} params - a VoiceParams object, see ../voice/voice.mjs
   * @param {object} [playOpts]
   * @param {string} [playOpts.channel='sfx']
   * @param {number} [playOpts.when=0] - seconds from now
   * @param {number} [playOpts.gain=1] - linear per-play gain, independent of the channel bus's own volume
   * @param {{x:number,y:number,z:number}} [playOpts.position] - authored sound position, relative to the configured listener frame
   * @param {boolean} [playOpts.loop=false]
   * @returns {{source:object, gain:object, stop(when?:number):void}|null} a playback handle, or null if silent
   */
  function playVoice(params, playOpts = {}) {
    if (!ensureStarted()) return null;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      // best-effort: a gesture may not have happened yet, in which case this
      // resolves later (or never) with no ill effect -- start() below still
      // schedules correctly once/if the context does resume.
      try {
        ctx.resume();
      } catch {
        /* ignored -- see module header on silent degradation */
      }
    }
    const channelName = playOpts.channel || channelNames[0];
    const bus = channelBuses.get(channelName) || channelBuses.get(channelNames[0]);
    const rendered = renderVoice(params, { sampleRate: ctx.sampleRate });
    const buffer = renderedVoiceToAudioBuffer(ctx, rendered);
    const startAt = ctx.currentTime + Math.max(0, playOpts.when ?? 0);
    const { source, gain, panner } = connectBufferSource(ctx, buffer, bus, { gain: playOpts.gain ?? 1, when: startAt, loop: !!playOpts.loop, position: playOpts.position });

    const handle = {
      source,
      gain,
      panner,
      stop(when) {
        try {
          source.stop(when);
        } catch {
          /* already stopped/never started -- stop() is idempotent from the caller's point of view */
        }
        activeHandles.delete(handle);
      },
    };
    activeHandles.add(handle);
    const onended = () => activeHandles.delete(handle);
    if (typeof source.addEventListener === 'function') source.addEventListener('ended', onended);
    else source.onended = onended;
    return handle;
  }

  /**
   * Plays a whole timed event stream -- see this module's header for the
   * event-stream contract. This is the generic seam a richer external
   * performance/composition engine (or this fiber's own ../game/ cue system)
   * targets instead of calling playVoice per-note by hand.
   * @param {Array<{atSec:number, voice:object, channel?:string, gain?:number, loop?:boolean}>} events
   * @param {object} [scheduleOpts]
   * @param {number} [scheduleOpts.startDelaySec=0] - added to every event's atSec
   * @param {string} [scheduleOpts.channel] - default channel for events that don't specify their own
   * @returns {Array<object|null>} one playback handle (or null if silent/that event failed) per event, in order
   */
  function schedule(events, scheduleOpts = {}) {
    const startDelaySec = scheduleOpts.startDelaySec ?? 0;
    return events.map((ev) =>
      playVoice(ev.voice, {
        channel: ev.channel ?? scheduleOpts.channel,
        when: startDelaySec + (ev.atSec ?? 0),
        gain: ev.gain ?? 1,
        loop: !!ev.loop,
        position: ev.position ?? scheduleOpts.position,
      })
    );
  }

  /**
   * Convenience wrapper over schedule() for a "spec" object -- accepts
   * either `{ notes: [...] }` (this package's own cue-render shape) or
   * `{ events: [...] }` (a more generic name some external producers may
   * use), so either naming plays without adaptation.
   * @param {{notes?:Array, events?:Array, channel?:string}} spec
   * @param {object} [scheduleOpts]
   * @returns {Array<object|null>}
   */
  function playSpec(spec, scheduleOpts = {}) {
    const events = spec.notes || spec.events || [];
    return schedule(events, { ...scheduleOpts, channel: scheduleOpts.channel ?? spec.channel });
  }

  /**
   * Automates one channel bus's gain down and back up -- e.g. ducking the
   * ambient bed under a big win cue. Scheduled entirely as AudioParam
   * automation at call time (setValueAtTime/linearRampToValueAtTime), not
   * with a JS timer, so the whole ramp-down/hold/ramp-back-up sequence is
   * sample-accurate and (in tests, with a fake AudioParam that just records
   * calls) inspectable synchronously without waiting on real time to pass.
   * No-op if the engine is silent or the channel doesn't exist.
   * @param {string} channel
   * @param {object} [duckOpts]
   * @param {number} [duckOpts.toGain=0.35]
   * @param {number} [duckOpts.attackSec=0.08] - ramp-down time
   * @param {number} [duckOpts.holdSec=0.6] - time held at toGain
   * @param {number} [duckOpts.releaseSec=0.5] - ramp-back-up time
   * @param {number} [duckOpts.fromGain] - defaults to the channel's current effective gain
   */
  function duckChannel(channel, duckOpts = {}) {
    if (isSilent() || !channelBuses) return;
    const node = channelBuses.get(channel);
    if (!node || !node.gain || typeof node.gain.setValueAtTime !== 'function') return;
    const gainParam = node.gain;
    const now = ctx.currentTime;
    const fromGain = duckOpts.fromGain ?? effectiveChannelGain(channel);
    const toGain = duckOpts.toGain ?? 0.35;
    const attackSec = duckOpts.attackSec ?? 0.08;
    const holdSec = Math.max(0, duckOpts.holdSec ?? 0.6);
    const releaseSec = duckOpts.releaseSec ?? 0.5;

    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(fromGain, now);
    gainParam.linearRampToValueAtTime(toGain, now + attackSec);
    gainParam.setValueAtTime(toGain, now + attackSec + holdSec);
    gainParam.linearRampToValueAtTime(fromGain, now + attackSec + holdSec + releaseSec);
  }

  /** Stops every currently-playing voice/loop immediately. */
  function stopAll() {
    for (const handle of Array.from(activeHandles)) handle.stop();
  }

  /** @param {number} v linear volume 0..1 */
  function setMasterVolume(v) {
    mixerState.masterVolume = clamp01(v);
    if (ctx) setParamValue(masterGain.gain, mixerState.masterMuted ? 0 : mixerState.masterVolume);
    persist();
  }
  function getMasterVolume() {
    return mixerState.masterVolume;
  }
  /** @param {boolean} muted */
  function setMuted(muted) {
    mixerState.masterMuted = !!muted;
    if (ctx) setParamValue(masterGain.gain, mixerState.masterMuted ? 0 : mixerState.masterVolume);
    persist();
  }
  function isMuted() {
    return !!mixerState.masterMuted;
  }
  /** @param {string} channel @param {number} v linear volume 0..1 */
  function setChannelVolume(channel, v) {
    channelState(channel).volume = clamp01(v);
    if (ctx && channelBuses.has(channel)) setParamValue(channelBuses.get(channel).gain, effectiveChannelGain(channel));
    persist();
  }
  function getChannelVolume(channel) {
    return channelState(channel).volume;
  }
  /** @param {string} channel @param {boolean} muted */
  function setChannelMuted(channel, muted) {
    channelState(channel).muted = !!muted;
    if (ctx && channelBuses.has(channel)) setParamValue(channelBuses.get(channel).gain, effectiveChannelGain(channel));
    persist();
  }
  function isChannelMuted(channel) {
    return !!channelState(channel).muted;
  }
  /** @returns {object} a plain-data snapshot of the current mixer state (safe to JSON.stringify) */
  function getMixerState() {
    return JSON.parse(JSON.stringify(mixerState));
  }

  return {
    ensureStarted,
    isSilent,
    playVoice,
    schedule,
    playSpec,
    duckChannel,
    stopAll,
    setMasterVolume,
    getMasterVolume,
    setMuted,
    isMuted,
    setChannelVolume,
    getChannelVolume,
    setChannelMuted,
    isChannelMuted,
    getMixerState,
    setListenerPose,
    getListenerPose,
    get context() {
      return ctx;
    },
  };
}

/** @param {object} param @param {number} value */
function setParamValue(param, value) {
  if (param && typeof value === 'number' && Number.isFinite(value)) {
    param.value = value;
  }
}
