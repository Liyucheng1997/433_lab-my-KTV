// 音频总线：伴奏 / 气氛音效 / 麦克风 三路汇总，带录音输出。
import workletUrl from './worklets.js?url';

class Engine {
  constructor() {
    this.ctx = null;
    this.ready = null;
  }

  init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      try {
        await ctx.audioWorklet.addModule(workletUrl);
        this.hasWorklet = true;
      } catch (e) {
        console.warn('AudioWorklet 加载失败，升降调/变声不可用', e);
        this.hasWorklet = false;
      }
      // 伴奏总线
      this.musicIn = ctx.createGain(); // 播放器接到这里
      this.musicVol = ctx.createGain();
      this.musicVol.gain.value = 0.8;
      this.musicAnalyser = ctx.createAnalyser();
      this.musicAnalyser.fftSize = 512;
      this.musicIn.connect(this.musicVol);
      this.musicVol.connect(this.musicAnalyser);
      // 气氛音效
      this.sfxIn = ctx.createGain();
      this.sfxIn.gain.value = 0.7;
      // 主输出
      this.master = ctx.createGain();
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.1;
      this.musicVol.connect(this.master);
      this.sfxIn.connect(this.master);
      this.master.connect(this.limiter);
      this.limiter.connect(ctx.destination);
      // 录音：伴奏 + 音效 + 麦克风（无论是否开启耳返）
      this.recordDest = ctx.createMediaStreamDestination();
      this.limiter.connect(this.recordDest);
      return ctx;
    })();
    return this.ready;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') return this.ctx.resume();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setMusicVolume(v) {
    if (this.musicVol) this.musicVol.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  /** 音乐能量 0..1，用于灯光律动 */
  energy() {
    if (!this.musicAnalyser) return 0;
    const a = this.musicAnalyser;
    const buf = this._eBuf || (this._eBuf = new Uint8Array(a.frequencyBinCount));
    a.getByteFrequencyData(buf);
    let lo = 0;
    for (let i = 1; i < 12; i++) lo += buf[i];
    return lo / (11 * 255);
  }

  createPitchShifter() {
    if (!this.hasWorklet) return null;
    return new AudioWorkletNode(this.ctx, 'pitch-shifter', { outputChannelCount: [2], numberOfInputs: 1, numberOfOutputs: 1 });
  }
}

export const engine = new Engine();

/** 生成混响冲激响应 */
export function makeImpulse(ctx, seconds = 2, decay = 3, brightness = 0.6, preDelay = 0.01) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const pre = Math.floor(rate * preDelay);
  const buf = ctx.createBuffer(2, len + pre, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // 越往后越暗：一阶低通系数随时间减小
      const a = brightness * (1 - x * 0.85) + 0.05;
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i + pre] = lp * Math.pow(1 - x, decay);
    }
  }
  return buf;
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
