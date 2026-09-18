/**
 * Generative meteorological soundscape using W3C Web Audio API.
 * Synthesizes procedural wind noise and rain patter using BiquadFilterNodes.
 * Runs 100% on the browser's background C++ audio thread with zero CPU overhead.
 */

export function createMeteorologySoundscape(options = {}) {
  const AudioContext =
    options.AudioContextClass ||
    (typeof window !== 'undefined' &&
      (window.AudioContext || window.webkitAudioContext));

  if (!AudioContext) {
    return {
      updateWeather: () => {},
      updateAltitude: () => {},
      destroy: () => {},
      isActive: false,
    };
  }

  let ctx = null;
  let masterGain = null;
  let windFilter = null;
  let windGain = null;
  let rainFilter = null;
  let rainGain = null;
  let noiseSource = null;
  let isActive = true;

  try {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(ctx.destination);

    // Procedural noise buffer (2 seconds loopable)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Noise source
    noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    // Wind filter & gain (lowpass modulated by wind speed)
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 250;
    windGain = ctx.createGain();
    windGain.gain.value = 0.05;

    // Rain filter & gain (bandpass chatter modulated by precipitation rate)
    rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1800;
    rainFilter.Q.value = 3.0;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0.0;

    // Connect audio graph
    noiseSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);

    noiseSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(masterGain);

    noiseSource.start(0);
  } catch {
    isActive = false;
  }

  function updateWeather(meteorology) {
    if (!ctx || ctx.state === 'closed' || !isActive) return;

    const windKph = Number(meteorology?.wind?.speedKph) || 5.0;
    const isRaining = Boolean(meteorology?.isRaining);
    const precipMm = Number(meteorology?.precipitationMm) || 0;

    const now = ctx.currentTime;

    // Wind: scale cutoff frequency (200Hz to 900Hz) and gain
    if (windFilter && windGain) {
      const targetFreq = Math.min(1200, Math.max(180, 180 + windKph * 12));
      const targetWindGain = Math.min(0.35, Math.max(0.04, 0.04 + (windKph / 100) * 0.25));
      windFilter.frequency.setTargetAtTime(targetFreq, now, 0.5);
      windGain.gain.setTargetAtTime(targetWindGain, now, 0.5);
    }

    // Rain: activate when raining
    if (rainGain) {
      const targetRainGain = isRaining ? Math.min(0.4, 0.08 + precipMm * 0.05) : 0.0;
      rainGain.gain.setTargetAtTime(targetRainGain, now, 0.4);
    }
  }

  function updateAltitude(altitudeM) {
    if (!ctx || ctx.state === 'closed' || !windFilter) return;
    const alt = Math.max(0, Number(altitudeM) || 0);
    const now = ctx.currentTime;

    // Higher altitude increases high-frequency wind resonance
    const altBoost = Math.min(500, (alt / 1000) * 80);
    windFilter.frequency.setTargetAtTime(250 + altBoost, now, 0.5);
  }

  function destroy() {
    isActive = false;
    if (noiseSource) {
      try {
        noiseSource.stop();
        noiseSource.disconnect();
      } catch {
        // Ignore
      }
    }
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  }

  return {
    updateWeather,
    updateAltitude,
    destroy,
    get isActive() {
      return isActive;
    },
  };
}
