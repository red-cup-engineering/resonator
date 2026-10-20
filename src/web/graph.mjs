// graph.mjs
//
// Pure WebAudio graph-construction functions: given a minimal injected
// "context-like" object (createGain/createBufferSource/createBuffer/
// createDynamicsCompressor/destination -- the same shape a real
// AudioContext/OfflineAudioContext exposes, but easy to fake), these
// functions wire up nodes and return handles. Nothing here constructs an
// AudioContext itself and nothing here is browser-only -- nothing checks
// `typeof window`, nothing reaches for a global. That is what makes this
// module importable and fully testable under plain node:test with a small
// hand-written fake context (see test/web-graph.test.mjs): the graph-shape
// assertions (what connects to what, what an AudioParam gets set to) don't
// need real audio hardware, only an object that responds to the same method
// names.
//
// The minimal context interface this module requires:
//   {
//     createGain(): { gain: AudioParamLike, connect(node), disconnect() },
//     createBufferSource(): { buffer, loop, connect(node), start(when), stop(when) },
//     createBuffer(numChannels, length, sampleRate): { getChannelData(i), copyToChannel?(data,i) },
//     createDynamicsCompressor(): { threshold, knee, ratio, attack, release, connect(node), disconnect() },
//     destination: object,
//   }
// AudioParamLike is anything with a settable `.value` and (for duck/automation
// use, see audio-engine.mjs) `setValueAtTime`/`linearRampToValueAtTime`/
// `cancelScheduledValues`. A real AudioParam satisfies this natively.

/** Default channel-bus names: sfx (one-shot game cues), music (foreground melodic/procedural material), ambient (loopable beds). Callers may supply their own list to createAudioEngine. */
export const DEFAULT_CHANNELS = Object.freeze(['sfx', 'music', 'ambient']);

// A DynamicsCompressorNode configured aggressively (low threshold, high
// ratio, fast attack) reads as a peak limiter in practice -- WebAudio has no
// dedicated brickwall-limiter node, and this is the standard idiom for
// approximating one. It sits on the master bus purely as a safety net against
// inter-voice summing overs, matching dsp/mixer.mjs's own softClip's stated
// role ("last-resort... rarely does more than round off rare peaks") -- the
// render pipeline's own gain staging should keep it from doing audible
// shaping most of the time.
const DEFAULT_LIMITER_SETTINGS = Object.freeze({
  threshold: -10,
  knee: 4,
  ratio: 14,
  attack: 0.002,
  release: 0.2,
});

/** Sets an AudioParam-like object's `.value` if both the param and a finite number are present. Silently a no-op otherwise, so callers can pass partial override objects without checking each field. */
function setParamValue(param, value) {
  if (param && typeof value === 'number' && Number.isFinite(value)) {
    param.value = value;
  }
}

/**
 * Builds the master bus: masterGain -> limiter-configured compressor ->
 * ctx.destination. Every channel bus (see buildChannelBuses) connects into
 * masterGain, never directly to the compressor or destination, so
 * setMasterVolume/duck automation always has exactly one gain node to touch.
 * @param {object} ctx - minimal context interface, see this module's header
 * @param {object} [opts]
 * @param {number} [opts.masterVolume=1] - initial linear gain
 * @param {object} [opts.compressor] - partial override of DEFAULT_LIMITER_SETTINGS
 * @returns {{masterGain: object, compressor: object}}
 */
export function buildMasterBus(ctx, opts = {}) {
  const compressor = ctx.createDynamicsCompressor();
  const settings = { ...DEFAULT_LIMITER_SETTINGS, ...(opts.compressor || {}) };
  setParamValue(compressor.threshold, settings.threshold);
  setParamValue(compressor.knee, settings.knee);
  setParamValue(compressor.ratio, settings.ratio);
  setParamValue(compressor.attack, settings.attack);
  setParamValue(compressor.release, settings.release);

  const masterGain = ctx.createGain();
  setParamValue(masterGain.gain, opts.masterVolume ?? 1);

  masterGain.connect(compressor);
  compressor.connect(ctx.destination);

  return { masterGain, compressor };
}

/**
 * Builds one GainNode per channel name, each connected into masterGain. This
 * is the whole "per-channel gain group" mechanism: sfx/music/ambient (or
 * whatever names a caller supplies) each get one persistent GainNode that
 * every voice/cue played on that channel gets routed through, so
 * mute/volume/duck all operate on one shared node per channel rather than
 * needing to track every individual playing voice.
 * @param {object} ctx
 * @param {object} masterGain - from buildMasterBus
 * @param {string[]} [channelNames=DEFAULT_CHANNELS]
 * @returns {Map<string, object>} channel name -> GainNode
 */
export function buildChannelBuses(ctx, masterGain, channelNames = DEFAULT_CHANNELS) {
  const buses = new Map();
  for (const name of channelNames) {
    const gainNode = ctx.createGain();
    gainNode.connect(masterGain);
    buses.set(name, gainNode);
  }
  return buses;
}

/** Apply a finite 3D position through the standard Web Audio AudioParam interface.
 * Old setPosition-only browsers are supported without introducing a second spatializer.
 * Return false when the host exposes no position control. The caller must keep
 * its original caption/text reading; auditory coordinates are never authority.
 */
export function setSpatialPosition(node, position) {
  if (!position || typeof position !== 'object' || Array.isArray(position) ||
      !['x', 'y', 'z'].every((axis) => typeof position[axis] === 'number' && Number.isFinite(position[axis]))) {
    throw new TypeError('WebAudio spatial position requires finite x, y and z coordinates');
  }
  if (['positionX', 'positionY', 'positionZ'].every((key) => node?.[key] && typeof node[key].value === 'number')) {
    node.positionX.value = position.x;
    node.positionY.value = position.y;
    node.positionZ.value = position.z;
    return true;
  }
  if (typeof node?.setPosition === 'function') {
    node.setPosition(position.x, position.y, position.z);
    return true;
  }
  return false;
}


/**
 * Creates a BufferSourceNode playing `audioBuffer` through its own per-play
 * GainNode into `destinationNode` (typically a channel bus from
 * buildChannelBuses), and starts it. Returns both nodes so a caller can stop
 * the source early (e.g. interrupting a looping ambient bed) or fade the
 * per-play gain independently of the channel bus.
 * @param {object} ctx
 * @param {object} audioBuffer - from voice-buffer.mjs's renderedVoiceToAudioBuffer
 * @param {object} destinationNode - a channel bus GainNode (or any connectable node)
 * @param {object} [opts]
 * @param {number} [opts.gain=1] - linear gain for this one play
 * @param {number} [opts.when=0] - ctx-time-relative start time (absolute ctx.currentTime-based value, not a delay)
 * @param {boolean} [opts.loop=false]
 * @param {{x:number,y:number,z:number}} [opts.position] - optional source-authorized 3D source position, in the listener's coordinate system
 * @returns {{source: object, gain: object, panner: object|null}}
 */
export function connectBufferSource(ctx, audioBuffer, destinationNode, opts = {}) {
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = !!opts.loop;

  const gainNode = ctx.createGain();
  setParamValue(gainNode.gain, opts.gain ?? 1);

  // A position is optional. Unpositioned cues preserve the original mono/stereo
  // mixer graph; a host without PannerNode keeps an audible, non-spatial cue.
  // Presence of coordinates never authorizes a world action or invents a source.
  let panner = null;
  if (opts.position != null) {
    // Validate even on a device without spatial audio: malformed semantic
    // positions must not be silently projected as meaningful sound.
    setSpatialPosition(null, opts.position);
    if (typeof ctx.createPanner === 'function') {
      const candidate = ctx.createPanner();
      if (typeof candidate?.connect === 'function' && setSpatialPosition(candidate, opts.position)) {
        candidate.panningModel = 'HRTF';
        candidate.distanceModel = 'inverse';
        panner = candidate;
      }
    }
  }
  source.connect(gainNode);
  if (panner) {
    gainNode.connect(panner);
    panner.connect(destinationNode);
  } else gainNode.connect(destinationNode);
  source.start(opts.when ?? 0);

  return { source, gain: gainNode, panner };
}
