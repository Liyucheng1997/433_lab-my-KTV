// 音高轨道：滚动显示标准音符条与演唱者实时音高。
export class PitchLane {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.notes = [];
    this.trail = [];
    this.before = 1.6;
    this.after = 3.6;
  }

  setNotes(notes) {
    this.notes = notes || [];
    this.trail = [];
    const ms = this.notes.map((n) => n.midi);
    this.lo = Math.min(...ms);
    this.hi = Math.max(...ms);
    if (this.hi - this.lo < 10) { const mid = (this.hi + this.lo) / 2; this.lo = mid - 5; this.hi = mid + 5; }
    this.c.parentElement.classList.toggle('has-notes', this.notes.length > 0);
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.c.width = Math.max(1, r.width * dpr);
    this.c.height = Math.max(1, r.height * dpr);
    this.w = r.width;
    this.h = r.height;
    this.dpr = dpr;
  }

  /** scorer 用来判定当前音符是否唱中 */
  render(t, key, p, scorer) {
    if (!this.notes.length) return;
    if (!this.w) this.resize();
    const { g, w, h, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const span = this.before + this.after;
    const px = w / span;
    const x0 = w * (this.before / span);
    const lo = this.lo + key - 1.5, hi = this.hi + key + 1.5;
    const yOf = (m) => h - 8 - ((m - lo) / (hi - lo)) * (h - 16);
    const bh = Math.max(6, Math.min(14, (h - 16) / (hi - lo) * 0.9));

    // 背景横线
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    for (let m = Math.ceil(lo); m <= hi; m += 2) { const y = yOf(m); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }

    let active = null;
    for (const n of this.notes) {
      if (n.t + n.d < t - this.before || n.t > t + this.after) continue;
      const x = x0 + (n.t - t) * px;
      const len = Math.max(3, n.d * px - 2);
      const y = yOf(n.midi + key);
      g.fillStyle = n.golden ? 'rgba(255,214,10,0.35)' : 'rgba(255,255,255,0.22)';
      g.beginPath(); g.roundRect(x, y - bh / 2, len, bh, bh / 2); g.fill();
      if (n.golden) { g.strokeStyle = 'rgba(255,214,10,0.8)'; g.lineWidth = 1.2; g.stroke(); }
      if (t >= n.t && t <= n.t + n.d) active = n;
    }
    // 唱中的部分（来自打分器）
    if (scorer?.notes) {
      for (const n of scorer.notes) {
        if (!n.frames || n.t + n.d < t - this.before || n.t > t) continue;
        const r = n.hits / n.frames;
        if (r < 0.05) continue;
        const x = x0 + (n.t - t) * px;
        const len = Math.max(3, (Math.min(t, n.t + n.d) - n.t) * px - 2);
        g.fillStyle = `rgba(10,132,255,${0.35 + r * 0.65})`;
        g.beginPath(); g.roundRect(x, yOf(n.midi + key) - bh / 2, len, bh, bh / 2); g.fill();
      }
    }

    // 演唱者音高轨迹（按八度折叠到最接近的目标音）
    if (p && p.midi != null && p.clarity > 0.8 && p.rms > 0.02) {
      let m = p.midi;
      const ref = (active ? active.midi : (this.lo + this.hi) / 2) + key;
      while (m - ref > 6) m -= 12;
      while (ref - m > 6) m += 12;
      this.trail.push({ t, m });
    } else this.trail.push({ t, m: null });
    this.trail = this.trail.filter((q) => q.t > t - this.before && q.t <= t + 0.01);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    g.beginPath();
    let pen = false;
    for (const q of this.trail) {
      if (q.m == null) { pen = false; continue; }
      const x = x0 + (q.t - t) * px, y = yOf(q.m);
      if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
    }
    g.stroke();
    const lastQ = this.trail[this.trail.length - 1];
    if (lastQ?.m != null) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(x0, yOf(lastQ.m), 5, 0, Math.PI * 2); g.fill();
    }
    // 判定线
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0, 4); g.lineTo(x0, h - 4); g.stroke();
  }
}
