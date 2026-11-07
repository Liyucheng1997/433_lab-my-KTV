// KTV 双行歌词：上行靠左、下行靠右交替，逐字变色。
export class LyricsView {
  constructor(root) {
    this.root = root;
    this.rows = [0, 1].map((i) => {
      const r = document.createElement('div');
      r.className = 'lrow ' + (i ? 'lrow-b' : 'lrow-a');
      r.innerHTML = '<div class="lwrap"><div class="ldots"></div><div class="lbase"></div><div class="lfill"></div></div>';
      root.appendChild(r);
      return { el: r, base: r.querySelector('.lbase'), fill: r.querySelector('.lfill'), dots: r.querySelector('.ldots'), line: -1, offs: [], w: 0 };
    });
    this.lines = [];
  }

  invalidate() {
    this.rows.forEach((r) => (r.measured = false));
  }

  setLines(lines) {
    this.lines = lines || [];
    this.rows.forEach((r) => this.fillRow(r, -1));
    this.root.classList.toggle('empty', !this.lines.length);
  }

  fillRow(r, idx) {
    r.line = idx;
    const l = this.lines[idx];
    r.base.innerHTML = '';
    r.fill.innerHTML = '';
    r.offs = [];
    r.el.classList.toggle('show', !!l);
    if (!l) return;
    for (const s of l.syl) {
      const a = document.createElement('span');
      a.textContent = s.text;
      r.base.appendChild(a);
    }
    r.fill.textContent = l.syl.map((s) => s.text).join('');
    r.measured = false;
  }

  measure(r) {
    const spans = [...r.base.children];
    // 用布局坐标（不受 transform 缩放影响）；.lbase 为定位容器
    r.offs = spans.map((s) => [s.offsetLeft, s.offsetWidth]);
    r.w = r.base.scrollWidth;
    r.measured = true;
  }

  render(t) {
    const L = this.lines;
    if (!L.length) return;
    let cur = L.findIndex((l) => t < l.end);
    if (cur < 0) cur = L.length; // 全部唱完
    for (const idx of [cur, cur + 1]) {
      const r = this.rows[idx % 2];
      if (r.line !== idx) this.fillRow(r, idx < L.length ? idx : -1);
    }
    for (const r of this.rows) {
      const l = L[r.line];
      if (!l) continue;
      if (!r.measured) this.measure(r);
      let px = 0;
      if (t >= l.end) px = r.w;
      else if (t > l.start) {
        let k = l.syl.findIndex((s) => t < s.t + s.d);
        if (k < 0) k = l.syl.length - 1;
        const s = l.syl[k];
        const frac = t < s.t ? 0 : Math.min(1, (t - s.t) / s.d);
        const [x, w] = r.offs[k] || [0, 0];
        px = t < s.t ? x : x + w * frac;
      }
      r.fill.style.clipPath = `inset(-20% ${Math.max(0, r.w - px)}px -20% 0)`;
      r.el.classList.toggle('active', r.line === cur);
      // 长间奏后的倒数提示
      const prevEnd = r.line > 0 ? L[r.line - 1].end : 0;
      const wait = l.start - t;
      const showDots = r.line === cur && l.start - prevEnd > 4 && wait > 0 && wait < 3.2;
      const n = showDots ? Math.ceil(wait) : 0;
      if (r.dots.dataset.n !== String(n)) { r.dots.dataset.n = String(n); r.dots.textContent = '●'.repeat(n); }
    }
  }
}
