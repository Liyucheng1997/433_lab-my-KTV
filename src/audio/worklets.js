// AudioWorklet：基于双延迟线交叉淡化的实时变调器（升降调、变声共用）。
// 参数 ratio = 2^(半音/12)。延迟约 20~40ms，适合实时演唱。

class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' },
      { name: 'window', defaultValue: 0.05, minValue: 0.01, maxValue: 0.2, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.size = 16384;
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.w = 0;
    this.phase = 0;
  }

  read(b, pos) {
    const n = this.size;
    pos = ((pos % n) + n) % n;
    const i = Math.floor(pos);
    const f = pos - i;
    return b[i] * (1 - f) + b[(i + 1) % n] * f;
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    const ratio = params.ratio[0];
    const W = Math.max(64, Math.floor(params.window[0] * sampleRate));
    const frames = output[0].length;
    const chans = output.length;
    const bypass = Math.abs(ratio - 1) < 1e-4;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < 2; c++) {
        const src = input[c] || input[0];
        this.buf[c][this.w] = src ? src[i] : 0;
      }
      if (bypass) {
        for (let c = 0; c < chans; c++) output[c][i] = this.buf[Math.min(c, 1)][this.w];
      } else {
        this.phase += (1 - ratio) / W;
        this.phase -= Math.floor(this.phase);
        const p1 = this.phase;
        const p2 = (p1 + 0.5) % 1;
        const g1 = 1 - Math.abs(2 * p1 - 1);
        const g2 = 1 - Math.abs(2 * p2 - 1);
        for (let c = 0; c < chans; c++) {
          const b = this.buf[Math.min(c, 1)];
          output[c][i] = this.read(b, this.w - p1 * W - 2) * g1 + this.read(b, this.w - p2 * W - 2) * g2;
        }
      }
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifter);
