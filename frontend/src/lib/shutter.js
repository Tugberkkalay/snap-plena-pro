let ctx;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlockAudio() {
  try {
    getCtx();
  } catch (e) {
    console.warn("Audio context unavailable:", e?.message);
  }
}

export function playShutter() {
  try {
    const audio = getCtx();
    const click = (t, dur, freq, vol) => {
      const size = Math.floor(audio.sampleRate * dur);
      const buffer = audio.createBuffer(1, size, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.12));
      }
      const src = audio.createBufferSource();
      src.buffer = buffer;
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = 1.2;
      const gain = audio.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.destination);
      src.start(audio.currentTime + t);
    };
    click(0, 0.045, 2600, 0.6);
    click(0.075, 0.09, 1100, 0.5);
  } catch (e) {
    console.warn("Shutter sound unavailable:", e?.message);
  }
}
