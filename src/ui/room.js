// 包厢环境：墙面、沙发、旋转灯光、迪斯科球、彩带。随音乐能量律动。
import { engine } from '../audio/engine.js';

export const LIGHT_MODES = {
  柔光: { colors: ['#ffb36b', '#ff8a5c', '#ffd28a'], speed: 0.18, beams: 3, disco: false, sparkles: 0 },
  动感: { colors: ['#0a84ff', '#bf5af2', '#ff375f', '#30d158'], speed: 0.75, beams: 6, disco: true, sparkles: 40 },
  派对: { colors: ['#ff375f', '#ffd60a', '#30d158', '#64d2ff', '#bf5af2', '#ff9f0a'], speed: 1.3, beams: 8, disco: true, sparkles: 90 },
  浪漫: { colors: ['#ff6fae', '#b46bff', '#ff9ecf'], speed: 0.28, beams: 4, disco: true, sparkles: 30 },
  关灯: { colors: ['#0a84ff'], speed: 0, beams: 0, disco: false, sparkles: 0 },
};

export class Room {
  constructor(canvas, fxCanvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.fx = fxCanvas;
    this.fg = fxCanvas.getContext('2d');
    this.mode = '动感';
    this.t = 0;
    this.energy = 0;
    this.confetti = [];
    this.sparkles = Array.from({ length: 120 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.5 + Math.random(), c: Math.floor(Math.random() * 6) }));
    this.flash = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const cv of [this.c, this.fx]) {
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
      cv.style.width = innerWidth + 'px';
      cv.style.height = innerHeight + 'px';
    }
    this.dpr = dpr;
    this.W = innerWidth;
    this.H = innerHeight;
  }

  setMode(m) { this.mode = m; }

  cheer() {
    const cols = ['#ff375f', '#ffd60a', '#30d158', '#64d2ff', '#bf5af2', '#ff9f0a', '#ffffff'];
    for (let i = 0; i < 160; i++) {
      const left = i % 2 === 0;
      this.confetti.push({
        x: left ? 0 : this.W, y: this.H * 0.75,
        vx: (left ? 1 : -1) * (4 + Math.random() * 9), vy: -(8 + Math.random() * 11),
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, c: cols[i % cols.length], life: 1,
      });
    }
    this.flash = 1;
  }

  frame(dt, playing) {
    const m = LIGHT_MODES[this.mode] || LIGHT_MODES.动感;
    const e = engine.energy();
    this.energy += (e - this.energy) * 0.25;
    const pulse = playing ? 0.55 + this.energy * 0.9 : 0.4;
    this.t += dt * (this.reduced ? 0.2 : 1);
    const { g, W, H, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 墙面与地面
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#06060a';
    g.fillRect(0, 0, W, H);
    const wall = g.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#0d0b14');
    wall.addColorStop(0.72, '#120f1b');
    wall.addColorStop(0.73, '#0a0910');
    wall.addColorStop(1, '#050508');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, H);
    // 软包墙面竖条
    g.strokeStyle = 'rgba(255,255,255,0.025)';
    g.lineWidth = 1;
    for (let x = 30; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * 0.72); g.stroke(); }

    // 屏幕光晕
    const tv = this.tvRect;
    if (tv) {
      const cx = tv.x + tv.w / 2, cy = tv.y + tv.h / 2;
      const glow = g.createRadialGradient(cx, cy, tv.w * 0.2, cx, cy, tv.w * 0.95);
      glow.addColorStop(0, `rgba(80,130,255,${0.16 * pulse})`);
      glow.addColorStop(1, 'rgba(80,130,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
    }

    // 灯光光束
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < m.beams; i++) {
      const x0 = ((i + 0.5) / m.beams) * W;
      const ang = Math.PI / 2 + Math.sin(this.t * m.speed * (0.7 + (i % 3) * 0.25) + i * 1.7) * 0.75;
      const len = H * 1.25;
      const spread = 0.09 + 0.03 * Math.sin(this.t + i);
      const col = m.colors[i % m.colors.length];
      const x1 = x0 + Math.cos(ang - spread) * len, y1 = Math.sin(ang - spread) * len;
      const x2 = x0 + Math.cos(ang + spread) * len, y2 = Math.sin(ang + spread) * len;
      const grad = g.createLinearGradient(x0, 0, x0 + Math.cos(ang) * len, Math.sin(ang) * len);
      grad.addColorStop(0, hexA(col, 0.32 * pulse));
      grad.addColorStop(1, hexA(col, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0, -4);
      g.lineTo(x1, y1);
      g.lineTo(x2, y2);
      g.closePath();
      g.fill();
      // 灯头
      g.fillStyle = hexA(col, 0.9);
      g.beginPath();
      g.arc(x0, 4, 4, 0, Math.PI * 2);
      g.fill();
    }

    // 迪斯科球与光斑
    if (m.disco) {
      const bx = W / 2, by = Math.min(70, H * 0.08), br = 22;
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.moveTo(bx, 0); g.lineTo(bx, by - br); g.stroke();
      g.save();
      g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#8e8e93';
      g.fillRect(bx - br, by - br, br * 2, br * 2);
      const off = (this.t * 12 * m.speed) % 7;
      for (let yy = -br; yy < br; yy += 7) for (let xx = -br - 7; xx < br; xx += 7) {
        const v = 120 + ((xx + yy + off * 3) * 37 % 120 + 120) % 120;
        g.fillStyle = `rgb(${v},${v},${v + 10})`;
        g.fillRect(bx + xx + off, by + yy, 6, 6);
      }
      g.restore();
      g.globalCompositeOperation = 'lighter';
      const n = Math.min(this.sparkles.length, m.sparkles);
      for (let i = 0; i < n; i++) {
        const s = this.sparkles[i];
        const a = s.a + this.t * m.speed * 0.25 * s.s;
        const x = W / 2 + Math.cos(a) * W * (0.25 + s.r * 0.55);
        const y = H * 0.42 + Math.sin(a * 1.3) * H * (0.15 + s.r * 0.3);
        g.fillStyle = hexA(m.colors[s.c % m.colors.length], 0.45 * pulse);
        g.beginPath();
        g.arc(x, y, 1.6 + s.r * 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }

    // 沙发与茶几剪影（受灯光边缘照亮）
    g.globalCompositeOperation = 'source-over';
    const rim = hexA(m.colors[Math.floor(this.t * 0.3) % m.colors.length], 0.35);
    drawSofa(g, W, H, rim);

    // 闪光
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${this.flash * 0.12})`;
      g.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }

    // 彩带
    const f = this.fg;
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.clearRect(0, 0, W, H);
    if (this.confetti.length) {
      for (const p of this.confetti) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= dt * 0.28;
        f.save();
        f.translate(p.x, p.y);
        f.rotate(p.r);
        f.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        f.fillStyle = p.c;
        f.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        f.restore();
      }
      this.confetti = this.confetti.filter((p) => p.life > 0 && p.y < H + 40);
    }
  }
}

function drawSofa(g, W, H, rim) {
  const y = H * 0.86;
  g.fillStyle = '#0b0a10';
  g.strokeStyle = rim;
  g.lineWidth = 1.5;
  // 左右沙发
  for (const side of [-1, 1]) {
    const x = side < 0 ? 0 : W;
    g.beginPath();
    g.moveTo(x, y - 40);
    g.quadraticCurveTo(x - side * W * 0.16, y - 52, x - side * W * 0.26, y - 10);
    g.lineTo(x - side * W * 0.27, H);
    g.lineTo(x, H);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // 茶几
  const tw = Math.min(360, W * 0.3);
  g.beginPath();
  g.roundRect(W / 2 - tw / 2, y + 6, tw, 16, 8);
  g.fill();
  g.stroke();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
