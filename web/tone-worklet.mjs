class ToneProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.engine = null; this.hz = 17400; this.warble = false; this.enabled = false; this.failed = false;
    this.port.onmessage = async ({ data }) => {
      if (data.wasm) {
        try {
          const { instance } = await WebAssembly.instantiate(data.wasm, {});
          this.engine = instance.exports; this.engine.reset(); this.port.postMessage({ ready: true });
        } catch (error) { this.failed = true; this.port.postMessage({ error: error.message }); }
      }
      if (Number.isFinite(data.hz)) this.hz = data.hz;
      if (typeof data.warble === 'boolean') this.warble = data.warble;
      if (typeof data.enabled === 'boolean') this.enabled = data.enabled;
    };
  }
  process(inputs, outputs) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    const count = channels[0].length;
    if (!this.engine || this.failed) { for (const c of channels) c.fill(0); return true; }
    if (this.engine.render(this.hz, sampleRate, count, this.enabled ? 1 : 0, this.warble ? 1 : 0) !== count) {
      for (const c of channels) c.fill(0);
      if (!this.failed) this.port.postMessage({ error: 'The audio renderer rejected its parameters.' });
      this.failed = true; return true;
    }
    const samples = new Float32Array(this.engine.memory.buffer, this.engine.samples_ptr(), count);
    for (const channel of channels) channel.set(samples);
    return true;
  }
}
registerProcessor('wasm-tone', ToneProcessor);
