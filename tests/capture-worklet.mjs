// Test instrumentation only, never packaged in the app. Copies post-gain PCM
// to the test runner while emitting silence on its additional output branch.
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.pcm = new Float32Array(Math.ceil(sampleRate * 1.3)); this.offset = 0; }
  process(inputs, outputs) {
    for (const channel of outputs[0] || []) channel.fill(0);
    const input = inputs[0]?.[0];
    if (!input || this.offset === this.pcm.length) return true;
    const count = Math.min(input.length, this.pcm.length - this.offset);
    this.pcm.set(input.subarray(0, count), this.offset); this.offset += count;
    if (this.offset === this.pcm.length) this.port.postMessage({ rate: sampleRate, pcm: this.pcm });
    return true;
  }
}
registerProcessor('capture', Capture);
