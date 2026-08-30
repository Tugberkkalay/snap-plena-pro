export function playShutter() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const click = (t, dur, freq, vol) => {
      const size = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.12));
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(ctx.currentTime + t);
    };
    click(0, 0.045, 2600, 0.6);
    click(0.075, 0.09, 1100, 0.5);
    setTimeout(() => ctx.close(), 500);
  } catch (e) {
    // audio not available, silent fail
  }
}
