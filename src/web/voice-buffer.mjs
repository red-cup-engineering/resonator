// voice-buffer.mjs
//
// Bridges the node-testable synthesis core (../voice/voice.mjs's
// renderVoice, a pure function to a stereo Float32Array pair) into a WebAudio
// AudioBuffer. This is the one function that makes the rendering-architecture
// decision documented in this fiber's README concrete: rather than
// reimplementing every VoiceParams source type (sine/triangle/additive/noise/
// karplus-strong/bow-breath, plus filter/noiseMix/saturation) as a second,
// parallel WebAudio node graph, the adapter renders the exact same
// deterministic buffer renderVoice always produces and hands it to WebAudio
// as a static AudioBuffer played through an AudioBufferSourceNode. One
// synthesis implementation, not two that could drift apart -- see this
// package's README ("Rendering architecture") for the full rationale.

/**
 * Copies a rendered voice's stereo sample data into a WebAudio-shaped
 * AudioBuffer, using copyToChannel when the injected buffer supports it
 * (the real AudioBuffer method) and falling back to writing directly into
 * getChannelData's returned array otherwise (what a minimal test fake
 * provides).
 * @param {object} ctx - minimal context interface (see graph.mjs's header); only createBuffer is used here
 * @param {{sampleRate:number, numSamples:number, left:Float32Array, right:Float32Array}} rendered - from ../voice/voice.mjs's renderVoice
 * @returns {object} an AudioBuffer (or AudioBuffer-shaped fake)
 */
export function renderedVoiceToAudioBuffer(ctx, rendered) {
  const { sampleRate, numSamples, left, right } = rendered;
  const buffer = ctx.createBuffer(2, numSamples, sampleRate);
  writeChannel(buffer, 0, left);
  writeChannel(buffer, 1, right);
  return buffer;
}

/** @param {object} buffer @param {number} channelIndex @param {Float32Array} data */
function writeChannel(buffer, channelIndex, data) {
  if (typeof buffer.copyToChannel === 'function') {
    buffer.copyToChannel(data instanceof Float32Array ? data : Float32Array.from(data), channelIndex);
    return;
  }
  const dest = buffer.getChannelData(channelIndex);
  dest.set(data);
}
