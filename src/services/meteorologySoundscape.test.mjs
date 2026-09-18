import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeteorologySoundscape } from './meteorologySoundscape.js';

test('createMeteorologySoundscape initializes Web Audio graph and updates gain on weather', () => {
  let createdNodes = 0;

  class FakeAudioParam {
    constructor(val = 0) {
      this.value = val;
    }
    setTargetAtTime(val) {
      this.value = val;
    }
  }

  class FakeAudioNode {
    constructor() {
      createdNodes++;
      this.gain = new FakeAudioParam(1);
      this.frequency = new FakeAudioParam(1000);
      this.Q = new FakeAudioParam(1);
    }
    connect() {}
    disconnect() {}
    start() {}
    stop() {}
  }

  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = new FakeAudioNode();
    }
    createGain() {
      return new FakeAudioNode();
    }
    createBiquadFilter() {
      return new FakeAudioNode();
    }
    createBuffer(channels, length, sampleRate) {
      return {
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      const src = new FakeAudioNode();
      src.buffer = null;
      src.loop = false;
      return src;
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
  }

  const soundscape = createMeteorologySoundscape({
    AudioContextClass: FakeAudioContext,
  });

  assert.equal(soundscape.isActive, true, 'Soundscape should be active');

  // Update weather with rain and wind
  soundscape.updateWeather({
    isRaining: true,
    precipitationMm: 4.0,
    wind: { speedKph: 25 },
  });

  // Teardown
  soundscape.destroy();
  assert.equal(soundscape.isActive, false, 'Soundscape should be inactive after destroy');
});
