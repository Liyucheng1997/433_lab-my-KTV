// 麦克风：均衡 → 压缩 → 变声 → 混响/回声，带耳返和实时音高检测。
import { engine, makeImpulse } from './engine.js';

export const MIC_PRESETS = {
  原声: { reverb: 0, room: 1.0, echo: 0, delay: 0.2, feedback: 0.2, bass: 0, treble: 0 },
  KTV: { reverb: 0.35, room: 2.2, echo: 0.22, delay: 0.16, feedback: 0.28, bass: 1, treble: 2 },
  录音棚: { reverb: 0.16, room: 0.9, echo: 0, delay: 0.12, feedback: 0.1, bass: 0, treble: 3 },
  演唱会: { reverb: 0.5, room: 3.4, echo: 0.2, delay: 0.32, feedback: 0.32, bass: 2, treble: 2 },
  空旷山谷: { reverb: 0.45, room: 4.8, echo: 0.42, delay: 0.46, feedback: 0.5, bass: 0, treble: 0 },
  浴室: { reverb: 0.6, room: 1.3, echo: 0, delay: 0.1, feedback: 0.1, bass: -2, treble: 4 },
};

export const VOICES = {
  原声: { semi: 0 },
  大叔: { semi: -4 },
  少女: { semi: 4 },
  萌娃: { semi: 8 },
  怪兽: { semi: -9 },
  机器人: { semi: 0, robot: true },
};

class Mic {
  constructor() {
    this.on = false;
    this.settings = { ...MIC_PRESETS.KTV, volume: 1, monitor: true, preset: 'KTV', voice: '原声' };
  }

  async start(deviceId) {
    await engine.init();
    const ctx = engine.ctx;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0,
      },
    });
    if (!this.chain) this.build(ctx);
    this.src = ctx.createMediaStreamSource(this.stream);
    this.src.connect(this.input);
    this.on = true;
    this.apply();
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.src?.disconnect(); } catch {}
    this.src = null;
    this.on = false;
  }

  build(ctx) {
    this.chain = true;
    this.input = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.input.connect(this.analyser);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 220;
    this.presence = ctx.createBiquadFilter();
    this.presence.type = 'peaking';
    this.presence.frequency.value = 3200;
    this.presence.Q.value = 0.9;
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 8000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.15;
    this.comp.knee.value = 8;
    this.input.connect(hp).connect(this.low).connect(this.presence).connect(this.high).connect(this.comp);

    // 变声：变调器 + 机器人环形调制
    this.voiceOut = ctx.createGain();
    this.shifter = engine.createPitchShifter();
    if (this.shifter) {
      this.shifter.parameters.get('window').value = 0.03;
      this.comp.connect(this.shifter);
    }
    this.ring = ctx.createGain();
    this.ring.gain.value = 0;
    this.ringOsc = ctx.createOscillator();
    this.ringOsc.frequency.value = 55;
    this.ringOsc.connect(this.ring.gain);
    this.ringOsc.start();
    this.voicePlain = ctx.createGain();
    (this.shifter || this.comp).connect(this.voicePlain).connect(this.voiceOut);
    (this.shifter || this.comp).connect(this.ring).connect(this.voiceOut);

    // 干声 + 混响 + 回声
    this.dry = ctx.createGain();
    this.revSend = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.echoSend = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.fb = ctx.createGain();
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 3500;
    this.voiceOut.connect(this.dry);
    this.voiceOut.connect(this.revSend).connect(this.convolver);
    this.voiceOut.connect(this.echoSend).connect(this.delay);
    this.delay.connect(echoLp).connect(this.fb).connect(this.delay);

    this.bus = ctx.createGain(); // 人声总音量
    this.dry.connect(this.bus);
    this.convolver.connect(this.bus);
    echoLp.connect(this.bus);
    // 回声也送一点进混响，更自然
    echoLp.connect(this.revSend);

    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 512;
    this.bus.connect(this.meter);

    this.monitor = ctx.createGain();
    this.bus.connect(this.monitor).connect(ctx.destination);
    this.bus.connect(engine.recordDest);
  }

  set(patch) {
    Object.assign(this.settings, patch);
    if (this.chain) this.apply();
  }

  applyPreset(name) {
    const p = MIC_PRESETS[name];
    if (!p) return;
    this.set({ ...p, preset: name });
  }

  apply() {
    const s = this.settings;
    const now = engine.now;
    const st = (param, v) => param.setTargetAtTime(v, now, 0.03);
    st(this.dry.gain, 1 - s.reverb * 0.35);
    st(this.revSend.gain, s.reverb * 1.4);
    st(this.echoSend.gain, s.echo);
    st(this.delay.delayTime, s.delay);
    st(this.fb.gain, Math.min(0.85, s.feedback));
    st(this.low.gain, s.bass * 2);
    st(this.presence.gain, s.treble);
    st(this.high.gain, s.treble * 0.8);
    st(this.bus.gain, s.volume);
    st(this.monitor.gain, s.monitor ? 1 : 0);
    if (this._room !== s.room) {
      this._room = s.room;
      this.convolver.buffer = makeImpulse(engine.ctx, s.room, 2.6, 0.55, 0.012);
    }
    const v = VOICES[s.voice] || VOICES.原声;
    if (this.shifter) this.shifter.parameters.get('ratio').setValueAtTime(Math.pow(2, v.semi / 12), now);
    st(this.ring.gain, 0);
    st(this.voicePlain.gain, v.robot ? 0.25 : 1);
    if (v.robot) {
      // 环形调制：增益由振荡器驱动
      this.ring.gain.cancelScheduledValues(now);
      this.ring.gain.value = 0;
    }
    this.ringOsc.disconnect();
    if (v.robot) this.ringOsc.connect(this.ring.gain);
  }

  /** 当前人声电平 0..1 */
  level() {
    if (!this.on || !this.meter) return 0;
    const buf = this._lv || (this._lv = new Float32Array(this.meter.fftSize));
    this.meter.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(s / buf.length) * 4);
  }

  /** 检测音高，返回 { midi, clarity, rms } 或 null */
  pitch() {
    if (!this.on || !this.analyser) return null;
    const buf = this._pb || (this._pb = new Float32Array(this.analyser.fftSize));
    this.analyser.getFloatTimeDomainData(buf);
    // 降采样一半，减少计算量（人声基频远低于新的奈奎斯特频率）
    const half = this._ph || (this._ph = new Float32Array(buf.length / 2));
    for (let i = 0; i < half.length; i++) half[i] = (buf[2 * i] + buf[2 * i + 1]) * 0.5;
    return detectPitch(half, engine.ctx.sampleRate / 2);
  }
}

/** 基于归一化自相关（McLeod 风格）的音高检测 */
export function detectPitch(buf, rate) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return { midi: null, clarity: 0, rms };
  const minLag = Math.floor(rate / 1100);
  const maxLag = Math.floor(rate / 70);
  const size = n - maxLag;
  const nsdf = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0, m = 0;
    for (let i = 0; i < size; i++) {
      const a = buf[i], b = buf[i + lag];
      ac += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m ? (2 * ac) / m : 0;
  }
  // 找到第一个超过最高峰 0.9 倍的峰
  let best = 0;
  for (let l = minLag; l <= maxLag; l++) if (nsdf[l] > best) best = nsdf[l];
  if (best < 0.5) return { midi: null, clarity: best, rms };
  const thr = best * 0.9;
  let lag = -1;
  for (let l = minLag + 1; l < maxLag; l++) {
    if (nsdf[l] >= thr && nsdf[l] >= nsdf[l - 1] && nsdf[l] >= nsdf[l + 1]) { lag = l; break; }
  }
  if (lag < 0) return { midi: null, clarity: best, rms };
  // 抛物线插值
  const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  const freq = rate / (lag + shift);
  const midi = 69 + 12 * Math.log2(freq / 440);
  return { midi, clarity: nsdf[lag], rms, freq };
}

export const mic = new Mic();
