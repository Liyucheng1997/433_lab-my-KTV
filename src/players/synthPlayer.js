// 内置曲目播放器：用 Web Audio 实时合成伴奏与导唱旋律。
import { engine, midiToFreq } from '../audio/engine.js';

let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export class SynthPlayer {
  constructor(song) {
    this.song = song;
    this.duration = song.duration;
    this.key = 0;
    this.vocalOn = true; // 原唱导唱旋律
    this.playing = false;
    this.offset = 0; // 暂停时的歌曲位置
    this.startCtx = 0;
    this.idx = 0;
    this.live = new Set();
    this.onended = null;
  }

  async load() {
    const ctx = engine.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.leadGain = ctx.createGain();
    this.leadGain.gain.value = 1;
    this.leadGain.connect(this.out);
    // 给伴奏加一点房间感
    this.out.connect(engine.musicIn);
  }

  get currentTime() {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, engine.now - this.startCtx);
  }

  play() {
    if (this.playing) return;
    const ctx = engine.ctx;
    this.playing = true;
    this.startCtx = ctx.currentTime + 0.05 - this.offset;
    this.idx = this.song.events.findIndex((e) => e.t >= this.offset - 0.001);
    if (this.idx < 0) this.idx = this.song.events.length;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.currentTime;
    this.playing = false;
    clearInterval(this.timer);
    this.silence();
  }

  seek(t) {
    const was = this.playing;
    if (was) this.pause();
    this.offset = Math.max(0, Math.min(t, this.duration));
    if (was) this.play();
  }

  setKey(semi) {
    this.key = semi;
  }

  setVocal(on) {
    this.vocalOn = on;
    this.leadGain.gain.setTargetAtTime(on ? 1 : 0, engine.now, 0.05);
  }

  silence() {
    const now = engine.now;
    for (const n of this.live) {
      try {
        n.g.gain.cancelScheduledValues(now);
        n.g.gain.setTargetAtTime(0, now, 0.02);
        n.src.forEach((s) => s.stop(now + 0.1));
      } catch {}
    }
    this.live.clear();
  }

  tick() {
    const ev = this.song.events;
    const horizon = this.currentTime + 0.12;
    while (this.idx < ev.length && ev[this.idx].t < horizon) {
      const e = ev[this.idx++];
      const when = this.startCtx + e.t;
      if (when < engine.now - 0.05) continue;
      this.voice(e, Math.max(when, engine.now));
    }
    if (this.currentTime >= this.duration) {
      this.pause();
      this.offset = this.duration;
      this.onended?.();
    }
  }

  voice(e, t) {
    const ctx = engine.ctx;
    const k = this.key;
    const g = ctx.createGain();
    const src = [];
    const track = (dur) => {
      const item = { g, src };
      this.live.add(item);
      setTimeout(() => this.live.delete(item), (t - engine.now + dur + 0.3) * 1000);
    };
    switch (e.type) {
      case 'lead': {
        // 类人声“啊”音：锯齿波 + 两个共振峰 + 颤音
        const f = midiToFreq(e.midi + k);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const vib = ctx.createOscillator();
        vib.frequency.value = 5.5;
        const vibG = ctx.createGain();
        vibG.gain.setValueAtTime(0, t);
        vibG.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.4, e.d * 0.6));
        vib.connect(vibG).connect(o.frequency);
        const f1 = ctx.createBiquadFilter();
        f1.type = 'bandpass'; f1.frequency.value = 750; f1.Q.value = 4;
        const f2 = ctx.createBiquadFilter();
        f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 5;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 3000;
        const sine = ctx.createOscillator();
        sine.frequency.value = f;
        vibG.connect(sine.frequency);
        const sg = ctx.createGain(); sg.gain.value = 0.35;
        o.connect(f1); o.connect(f2); f1.connect(lp); f2.connect(lp); sine.connect(sg).connect(lp);
        lp.connect(g);
        const v = e.v * 0.9;
        const end = t + e.d;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + 0.04);
        g.gain.setValueAtTime(v, Math.max(t + 0.05, end - 0.06));
        g.gain.linearRampToValueAtTime(0, end + 0.02);
        g.connect(this.leadGain);
        [o, vib, sine].forEach((s) => { s.start(t); s.stop(end + 0.1); src.push(s); });
        track(e.d);
        return;
      }
      case 'piano':
      case 'pluck':
      case 'bell': {
        const isBell = e.type === 'bell';
        const f = isBell ? 2637 : midiToFreq(e.midi + k);
        const o = ctx.createOscillator();
        o.type = e.type === 'pluck' ? 'triangle' : isBell ? 'sine' : 'triangle';
        o.frequency.value = f;
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * (isBell ? 2.76 : 2);
        const g2 = ctx.createGain(); g2.gain.value = isBell ? 0.5 : 0.25;
        o.connect(g); o2.connect(g2).connect(g);
        const dec = isBell ? 0.25 : e.type === 'pluck' ? 0.9 : Math.min(1.8, (e.d || 0.5) + 0.4);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.35, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0008, t + dec);
        g.connect(this.out);
        [o, o2].forEach((s) => { s.start(t); s.stop(t + dec + 0.05); src.push(s); });
        track(dec);
        return;
      }
      case 'pad': {
        const f = midiToFreq(e.midi + k);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1200;
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          o.connect(lp);
          o.start(t); o.stop(t + e.d + 0.4);
          src.push(o);
        }
        lp.connect(g);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.05, t + 0.15);
        g.gain.setValueAtTime(e.v * 0.05, t + e.d);
        g.gain.linearRampToValueAtTime(0, t + e.d + 0.35);
        g.connect(this.out);
        track(e.d + 0.4);
        return;
      }
      case 'bass': {
        const f = midiToFreq(e.midi + k);
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const s = ctx.createOscillator();
        s.type = 'sine';
        s.frequency.value = f;
        o.connect(g); s.connect(g);
        const end = t + Math.max(0.15, e.d * 0.95);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.45, t + 0.01);
        g.gain.exponentialRampToValueAtTime(e.v * 0.2, end);
        g.gain.linearRampToValueAtTime(0, end + 0.05);
        g.connect(this.out);
        [o, s].forEach((x) => { x.start(t); x.stop(end + 0.1); src.push(x); });
        track(e.d);
        return;
      }
      case 'kick': {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        g.gain.setValueAtTime(e.v * 1.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g).connect(this.out);
        o.start(t); o.stop(t + 0.32); src.push(o);
        track(0.3);
        return;
      }
      case 'snare':
      case 'hat': {
        const n = ctx.createBufferSource();
        n.buffer = noise(ctx);
        const fl = ctx.createBiquadFilter();
        const isHat = e.type === 'hat';
        fl.type = isHat ? 'highpass' : 'bandpass';
        fl.frequency.value = isHat ? 7000 : 1800;
        const dec = isHat ? 0.05 : 0.18;
        g.gain.setValueAtTime(e.v * (isHat ? 0.6 : 0.9), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dec);
        n.connect(fl).connect(g).connect(this.out);
        n.start(t, Math.random() * 0.5); n.stop(t + dec + 0.02); src.push(n);
        if (!isHat) {
          const o = ctx.createOscillator();
          o.frequency.value = 190;
          const og = ctx.createGain();
          og.gain.setValueAtTime(e.v * 0.4, t);
          og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          o.connect(og).connect(this.out);
          o.start(t); o.stop(t + 0.1); src.push(o);
        }
        track(dec);
        return;
      }
    }
  }

  destroy() {
    this.pause();
    try { this.out.disconnect(); } catch {}
  }
}
