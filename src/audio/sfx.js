// 气氛音效：全部实时合成（掌声、欢呼、口哨、礼炮、鼓声、笑声）。
import { engine } from './engine.js';

let nb = null;
function noiseBuffer(ctx) {
  if (nb) return nb;
  nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return nb;
}

function burst(t, { freq = 1500, q = 1, dur = 0.06, gain = 0.3, type = 'bandpass', pan = 0 }) {
  const ctx = engine.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(f).connect(g).connect(p).connect(engine.sfxIn);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

export const SFX = {
  掌声() {
    const t0 = engine.now;
    for (let i = 0; i < 260; i++) {
      const t = t0 + Math.pow(Math.random(), 1.4) * 3.2;
      const fade = 1 - (t - t0) / 3.6;
      burst(t, { freq: 900 + Math.random() * 2200, q: 0.8 + Math.random(), dur: 0.03 + Math.random() * 0.04, gain: 0.22 * fade, pan: Math.random() * 1.6 - 0.8 });
    }
  },
  欢呼() {
    const ctx = engine.ctx;
    const t0 = engine.now;
    // 人群的“哇——”：多层带通噪声，共振峰缓慢移动
    for (let v = 0; v < 6; v++) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 6;
      const base = 500 + v * 90;
      f1.frequency.setValueAtTime(base, t0);
      f1.frequency.linearRampToValueAtTime(base * 1.6, t0 + 0.5);
      f1.frequency.linearRampToValueAtTime(base * 1.3, t0 + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.35 + v * 0.05);
      g.gain.linearRampToValueAtTime(0.35, t0 + 1.6);
      g.gain.linearRampToValueAtTime(0, t0 + 2.8);
      const p = ctx.createStereoPanner();
      p.pan.value = (v / 5) * 1.4 - 0.7;
      src.connect(f1).connect(g).connect(p).connect(engine.sfxIn);
      src.start(t0, Math.random());
      src.stop(t0 + 3);
    }
    SFX.口哨(0.6);
    SFX.掌声();
  },
  口哨(delay = 0) {
    const ctx = engine.ctx;
    const t = engine.now + delay;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(3200, t + 0.28);
    o.frequency.setValueAtTime(2000, t + 0.42);
    o.frequency.exponentialRampToValueAtTime(3000, t + 0.7);
    o.frequency.exponentialRampToValueAtTime(1900, t + 1.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.04);
    g.gain.setValueAtTime(0.16, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0, t + 0.38);
    g.gain.linearRampToValueAtTime(0.16, t + 0.45);
    g.gain.linearRampToValueAtTime(0.0, t + 1.1);
    o.connect(g).connect(engine.sfxIn);
    o.start(t);
    o.stop(t + 1.2);
  },
  礼炮() {
    const t = engine.now;
    burst(t, { freq: 400, q: 0.5, dur: 0.35, gain: 0.9, type: 'lowpass' });
    burst(t, { freq: 3000, q: 0.7, dur: 0.12, gain: 0.5 });
    for (let i = 0; i < 40; i++) burst(t + 0.15 + Math.random() * 0.9, { freq: 4000 + Math.random() * 3000, q: 3, dur: 0.02, gain: 0.08, pan: Math.random() * 2 - 1 });
  },
  鼓声() {
    const t0 = engine.now;
    for (let i = 0; i < 28; i++) {
      const t = t0 + i * 0.055 - i * i * 0.0004;
      burst(t, { freq: 1800, q: 0.9, dur: 0.08, gain: 0.12 + i * 0.012 });
    }
    const tEnd = t0 + 28 * 0.055 - 28 * 28 * 0.0004 + 0.05;
    burst(tEnd, { freq: 6000, q: 0.4, dur: 1.4, gain: 0.35, type: 'highpass' });
    const ctx = engine.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, tEnd);
    o.frequency.exponentialRampToValueAtTime(45, tEnd + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, tEnd);
    g.gain.exponentialRampToValueAtTime(0.001, tEnd + 0.5);
    o.connect(g).connect(engine.sfxIn);
    o.start(tEnd);
    o.stop(tEnd + 0.55);
  },
  笑声() {
    const ctx = engine.ctx;
    const t0 = engine.now;
    // “哈哈哈”：带共振峰的脉冲串
    for (let p = 0; p < 3; p++) {
      const base = 200 + p * 70;
      for (let i = 0; i < 6; i++) {
        const t = t0 + p * 0.12 + i * 0.19 + Math.random() * 0.03;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(base * (1.1 - i * 0.03), t);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        const pan = ctx.createStereoPanner();
        pan.pan.value = p - 1;
        o.connect(f).connect(g).connect(pan).connect(engine.sfxIn);
        o.start(t);
        o.stop(t + 0.16);
      }
    }
  },
};
