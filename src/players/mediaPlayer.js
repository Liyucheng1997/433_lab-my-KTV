// 音频/视频文件播放器：支持原唱/伴唱切换（独立伴奏音轨、消人声、左右声道）与升降调。
import { engine } from '../audio/engine.js';

/**
 * opts:
 *  src           原唱音频/视频 URL
 *  instrumental  伴奏音轨 URL（可选）
 *  video         true 时用 <video> 元素并挂到 videoHost
 *  vocalMode     'instrumental' | 'cancel' | 'left' | 'right'
 */
export class MediaPlayer {
  constructor(opts) {
    this.opts = opts;
    this.vocalOn = true;
    this.key = 0;
    this.onended = null;
    this.onerror = null;
    this.duration = 0;
  }

  makeEl(src, isVideo) {
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.playsInline = true;
    el.src = src;
    return el;
  }

  async load() {
    const ctx = engine.ctx;
    const o = this.opts;
    this.el = this.makeEl(o.src, o.video);
    if (o.video) {
      this.el.className = 'tv-video';
      this.el.muted = false;
      o.videoHost?.appendChild(this.el);
    }
    this.out = ctx.createGain();
    this.shifter = engine.createPitchShifter();
    if (this.shifter) this.out.connect(this.shifter).connect(engine.musicIn);
    else this.out.connect(engine.musicIn);

    const srcNode = ctx.createMediaElementSource(this.el);
    this.origGain = ctx.createGain();
    this.accGain = ctx.createGain();
    srcNode.connect(this.origGain).connect(this.out);
    this.accGain.connect(this.out);

    let mode = o.vocalMode || 'cancel';
    if (mode === 'instrumental' && o.instrumental) {
      this.inst = this.makeEl(o.instrumental, false);
      ctx.createMediaElementSource(this.inst).connect(this.accGain);
    } else if (mode === 'left' || mode === 'right') {
      // 经典 KTV 双声道：一边原唱一边伴奏
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      srcNode.connect(split);
      const accCh = mode === 'left' ? 0 : 1;
      split.connect(merge, accCh, 0);
      split.connect(merge, accCh, 1);
      merge.connect(this.accGain);
      // 原唱也只取另一声道，避免叠加伴奏
      const merge2 = ctx.createChannelMerger(2);
      split.connect(merge2, 1 - accCh, 0);
      split.connect(merge2, 1 - accCh, 1);
      srcNode.disconnect(this.origGain);
      merge2.connect(this.origGain);
    } else {
      mode = 'cancel';
      // 消人声：L-R 去掉居中的人声，再补回低频
      const split = ctx.createChannelSplitter(2);
      const inv = ctx.createGain();
      inv.gain.value = -1;
      const side = ctx.createGain();
      srcNode.connect(split);
      split.connect(side, 0);
      split.connect(inv, 1);
      inv.connect(side);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 160;
      side.connect(hp);
      const bass = ctx.createBiquadFilter();
      bass.type = 'lowpass';
      bass.frequency.value = 160;
      srcNode.connect(bass);
      const sum = ctx.createGain();
      hp.connect(sum);
      bass.connect(sum);
      sum.gain.value = 1.1;
      sum.connect(this.accGain);
    }
    this.mode = mode;
    this.setVocal(this.vocalOn);

    await new Promise((resolve, reject) => {
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('音频加载失败：' + (this.el.error?.message || o.src))); };
      const cleanup = () => { this.el.removeEventListener('loadedmetadata', ok); this.el.removeEventListener('error', bad); };
      this.el.addEventListener('loadedmetadata', ok);
      this.el.addEventListener('error', bad);
    });
    this.duration = this.el.duration || 0;
    this.el.addEventListener('ended', () => this.onended?.());
    this.el.addEventListener('waiting', () => this.inst?.pause());
    this.el.addEventListener('playing', () => { if (this.inst && this.playing) { this.syncInst(true); this.inst.play().catch(() => {}); } });
  }

  get playing() {
    return this.el && !this.el.paused;
  }

  get currentTime() {
    return this.el ? this.el.currentTime : 0;
  }

  syncInst(force) {
    if (!this.inst) return;
    const d = Math.abs(this.inst.currentTime - this.el.currentTime);
    if (force || d > 0.12) this.inst.currentTime = this.el.currentTime;
  }

  async play() {
    await this.el.play();
    if (this.inst) {
      this.syncInst(true);
      this.inst.play().catch(() => {});
      clearInterval(this.syncTimer);
      this.syncTimer = setInterval(() => this.syncInst(false), 1000);
    }
  }

  pause() {
    this.el.pause();
    this.inst?.pause();
    clearInterval(this.syncTimer);
  }

  seek(t) {
    this.el.currentTime = t;
    if (this.inst) this.inst.currentTime = t;
  }

  setVocal(on) {
    this.vocalOn = on;
    const now = engine.now;
    this.origGain.gain.setTargetAtTime(on ? 1 : 0, now, 0.06);
    this.accGain.gain.setTargetAtTime(on ? 0 : 1, now, 0.06);
  }

  setKey(semi) {
    this.key = semi;
    if (this.shifter) this.shifter.parameters.get('ratio').setValueAtTime(Math.pow(2, semi / 12), engine.now);
  }

  destroy() {
    this.pause();
    clearInterval(this.syncTimer);
    for (const el of [this.el, this.inst]) {
      if (!el) continue;
      el.removeAttribute('src');
      el.load();
      el.remove();
    }
    try { this.out.disconnect(); this.shifter?.disconnect(); } catch {}
    if (this.opts.revoke) this.opts.revoke();
  }
}
