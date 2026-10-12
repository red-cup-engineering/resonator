// persistence.mjs
//
// Mixer-state (master/per-channel volume + mute) persistence, behind a tiny
// injected storage interface -- { getItem(key), setItem(key, value) }, the
// same shape window.localStorage already has, so a browser caller passes
// `localStorage` directly and a headless/test caller passes
// makeInMemoryStorage() (or its own fake) with no adapter code needed either
// way. Nothing here touches a global `localStorage` reference itself, which
// is what keeps this module (and audio-engine.mjs, which is the only caller)
// loadable under plain node:test.

const DEFAULT_CHANNEL_STATE = Object.freeze({ volume: 1, muted: false });

/**
 * The shape persisted/round-tripped by save/loadMixerState.
 * @param {string[]} channelNames
 * @param {number} [masterVolume=1]
 * @returns {{masterVolume:number, masterMuted:boolean, channels: Record<string,{volume:number,muted:boolean}>}}
 */
export function makeDefaultMixerState(channelNames, masterVolume = 1) {
  const channels = {};
  for (const name of channelNames) channels[name] = { ...DEFAULT_CHANNEL_STATE };
  return { masterVolume, masterMuted: false, channels };
}

/**
 * A minimal Map-backed storage implementing the same getItem/setItem shape
 * as window.localStorage, used as the default when no storage is injected
 * (headless tests, or a host with no persistent storage available at all --
 * this makes "no persistence" degrade to "persistence that resets every
 * process" rather than a crash).
 * @returns {{getItem(key:string): string|null, setItem(key:string, value:string): void}}
 */
export function makeInMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

/**
 * Loads a persisted mixer state, falling back to `fallback` whenever the
 * storage has nothing under `key`, the stored value isn't valid JSON, or the
 * storage itself throws (some browsers throw on localStorage access in
 * certain contexts, e.g. privacy modes) -- persistence is a nice-to-have,
 * never a reason for audio setup to fail.
 * @param {{getItem(key:string): string|null}} storage
 * @param {string} key
 * @param {object} fallback - typically makeDefaultMixerState(...)
 * @returns {object} mixer state
 */
export function loadMixerState(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    // shallow-merge so a fallback built from a different/expanded channel
    // list still supplies defaults for channels missing from an older
    // persisted blob, rather than dropping them.
    return {
      masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : fallback.masterVolume,
      masterMuted: typeof parsed.masterMuted === 'boolean' ? parsed.masterMuted : fallback.masterMuted,
      channels: { ...fallback.channels, ...(parsed.channels || {}) },
    };
  } catch {
    return fallback;
  }
}

/**
 * Persists a mixer state as JSON. Swallows storage errors for the same
 * reason loadMixerState does -- a failed save should never throw out of an
 * audio-engine call.
 * @param {{setItem(key:string, value:string): void}} storage
 * @param {string} key
 * @param {object} state
 */
export function saveMixerState(storage, key, state) {
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // persistence is best-effort; nothing to recover, nothing to rethrow
  }
}

/** Default localStorage key used by createAudioEngine when no storageKey is supplied. */
export const DEFAULT_STORAGE_KEY = 'resonator:mixer';
