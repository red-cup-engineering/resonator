// web-voice-buffer.test.mjs
//
// Checks ../src/web/voice-buffer.mjs's renderedVoiceToAudioBuffer against
// both AudioBuffer shapes it needs to support: a real-AudioBuffer-like fake
// with copyToChannel, and a minimal fake with only getChannelData (see
// test/helpers/fake-audio-context.mjs, which deliberately omits
// copyToChannel so the fallback path gets exercised too).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderVoice } from '../src/voice/voice.mjs';
import { renderedVoiceToAudioBuffer } from '../src/web/voice-buffer.mjs';
import { makeFakeAudioContext } from './helpers/fake-audio-context.mjs';

const SR = 44100;

test('renderedVoiceToAudioBuffer: copies left/right sample data exactly into a getChannelData-only fake buffer', () => {
  const ctx = makeFakeAudioContext({ sampleRate: SR });
  const rendered = renderVoice({ freqHz: 440, durationSec: 0.05, source: { type: 'sine' }, envelope: { attackSec: 0.001, releaseSec: 0.02, sustainLevel: 1 } }, { sampleRate: SR });
  const buffer = renderedVoiceToAudioBuffer(ctx, rendered);

  assert.equal(buffer.numberOfChannels, 2);
  assert.equal(buffer.length, rendered.numSamples);
  assert.equal(buffer.sampleRate, SR);
  assert.deepEqual(Array.from(buffer.getChannelData(0)), Array.from(rendered.left));
  assert.deepEqual(Array.from(buffer.getChannelData(1)), Array.from(rendered.right));
});

test('renderedVoiceToAudioBuffer: prefers copyToChannel when the injected buffer provides it', () => {
  const calls = [];
  const ctx = {
    createBuffer(numCh, length, sr) {
      const channels = Array.from({ length: numCh }, () => new Float32Array(length));
      return {
        numberOfChannels: numCh,
        length,
        sampleRate: sr,
        getChannelData: (i) => channels[i],
        copyToChannel(data, i) {
          calls.push(i);
          channels[i].set(data);
        },
      };
    },
  };
  const rendered = renderVoice({ freqHz: 220, durationSec: 0.02, source: { type: 'sine' }, envelope: { attackSec: 0.001, releaseSec: 0.01, sustainLevel: 1 } }, { sampleRate: SR });
  const buffer = renderedVoiceToAudioBuffer(ctx, rendered);
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(Array.from(buffer.getChannelData(0)), Array.from(rendered.left));
});
