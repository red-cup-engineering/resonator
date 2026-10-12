// fake-audio-context.mjs
//
// A hand-written fake implementing the minimal context interface
// ../../src/web/graph.mjs and ../../src/web/audio-engine.mjs are written
// against (see graph.mjs's header for the exact shape), used across the
// web-*.test.mjs files so those modules' graph-construction/scheduling
// behavior is checked without any real audio hardware or AudioContext.
// Not itself a test file -- it exports no `test()` calls, only a factory.

function makeFakeAudioParam(initial = 0) {
  const param = {
    value: initial,
    _calls: [],
    setValueAtTime(value, time) {
      param.value = value;
      param._calls.push(['setValueAtTime', value, time]);
      return param;
    },
    linearRampToValueAtTime(value, time) {
      param.value = value;
      param._calls.push(['linearRampToValueAtTime', value, time]);
      return param;
    },
    cancelScheduledValues(time) {
      param._calls.push(['cancelScheduledValues', time]);
      return param;
    },
  };
  return param;
}

function makeFakeGainNode(ctx) {
  const node = {
    gain: makeFakeAudioParam(1),
    _connections: [],
    connect(dest) {
      node._connections.push(dest);
      return dest;
    },
    disconnect() {
      node._connections = [];
    },
  };
  return node;
}

function makeFakeCompressorNode() {
  return {
    threshold: makeFakeAudioParam(-24),
    knee: makeFakeAudioParam(30),
    ratio: makeFakeAudioParam(12),
    attack: makeFakeAudioParam(0.003),
    release: makeFakeAudioParam(0.25),
    _connections: [],
    connect(dest) {
      this._connections.push(dest);
      return dest;
    },
    disconnect() {
      this._connections = [];
    },
  };
}

function makeFakeBuffer(numberOfChannels, length, sampleRate) {
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return {
    numberOfChannels,
    length,
    sampleRate,
    getChannelData(i) {
      return channels[i];
    },
    // deliberately no copyToChannel, so tests exercise voice-buffer.mjs's
    // getChannelData fallback path (the shape a minimal fake is likely to
    // have, versus a real AudioBuffer which has both).
  };
}

function makeFakeBufferSourceNode(ctx) {
  const source = {
    buffer: null,
    loop: false,
    onended: null,
    _listeners: {},
    _started: false,
    _startedAt: undefined,
    _stopped: false,
    _stoppedAt: undefined,
    _connections: [],
    connect(dest) {
      source._connections.push(dest);
      return dest;
    },
    disconnect() {
      source._connections = [];
    },
    start(when) {
      source._started = true;
      source._startedAt = when;
    },
    stop(when) {
      if (!source._started) throw new Error('cannot stop a source that was never started');
      source._stopped = true;
      source._stoppedAt = when;
    },
    addEventListener(type, cb) {
      (source._listeners[type] ||= []).push(cb);
    },
  };
  return source;
}

/**
 * @param {object} [opts]
 * @param {number} [opts.sampleRate=44100]
 * @param {'suspended'|'running'} [opts.state='running']
 * @returns {object} a fake AudioContext-shaped object plus a `_createdNodes` log for assertions
 */
export function makeFakeAudioContext(opts = {}) {
  const nodes = { gains: [], sources: [], buffers: [], compressors: [] };
  const ctx = {
    sampleRate: opts.sampleRate ?? 44100,
    currentTime: opts.currentTime ?? 0,
    state: opts.state ?? 'running',
    destination: { _isDestination: true },
    resumeCalls: 0,
    resume() {
      ctx.resumeCalls += 1;
      ctx.state = 'running';
      return Promise.resolve();
    },
    createGain() {
      const g = makeFakeGainNode(ctx);
      nodes.gains.push(g);
      return g;
    },
    createDynamicsCompressor() {
      const c = makeFakeCompressorNode();
      nodes.compressors.push(c);
      return c;
    },
    createBufferSource() {
      const s = makeFakeBufferSourceNode(ctx);
      nodes.sources.push(s);
      return s;
    },
    createBuffer(numberOfChannels, length, sampleRate) {
      const b = makeFakeBuffer(numberOfChannels, length, sampleRate);
      nodes.buffers.push(b);
      return b;
    },
    _nodes: nodes,
  };
  return ctx;
}
