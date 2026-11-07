// 歌词解析：LRC（含逐字时间的增强 LRC）与 UltraStar 卡拉OK格式。
// 统一输出：lines = [{ start, end, text, syl: [{ t, d, text }] }]，notes = [{ t, d, midi, text, golden }]

const isCJK = (ch) => /[぀-ヿ㐀-鿿가-힯豈-﫿]/.test(ch);

/** 把一行文字切成音节：中日韩按字，拉丁文按词（保留空格） */
export function splitSyllables(text) {
  const out = [];
  let buf = '';
  for (const ch of text) {
    if (isCJK(ch)) {
      if (buf) { out.push(buf); buf = ''; }
      out.push(ch);
    } else if (ch === ' ') {
      buf += ch;
      out.push(buf);
      buf = '';
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out.filter((s) => s.length);
}

const TS = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;
const toSec = (m, s) => +m * 60 + parseFloat(String(s).replace(':', '.'));

export function parseLRC(src, totalDuration = 0) {
  let offset = 0;
  const rows = [];
  for (const raw of src.split(/\r?\n/)) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (off) { offset = +off[1] / 1000; continue; }
    const times = [...raw.matchAll(TS)];
    if (!times.length) continue;
    const body = raw.replace(TS, '').trim();
    for (const t of times) rows.push({ t: toSec(t[1], t[2]), body });
  }
  rows.sort((a, b) => a.t - b.t);
  const lines = [];
  rows.forEach((r, i) => {
    const next = rows[i + 1]?.t ?? (totalDuration || r.t + 6);
    const start = r.t - offset;
    // 增强 LRC：<mm:ss.xx>字
    const word = [...r.body.matchAll(/<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g)];
    let text = r.body.replace(/<\d+:\d+(?:\.\d+)?>/g, '').trim();
    if (!text) return;
    let syl;
    if (word.length) {
      syl = word.map((w, j) => {
        const t = toSec(w[1], w[2]) - offset;
        const nt = word[j + 1] ? toSec(word[j + 1][1], word[j + 1][2]) - offset : Math.min(next - offset, t + 1);
        return { t, d: Math.max(0.05, nt - t), text: w[3] };
      }).filter((s) => s.text);
      text = syl.map((s) => s.text).join('');
    } else {
      const parts = splitSyllables(text);
      const gap = next - offset - start;
      const dur = Math.max(0.8, Math.min(gap - 0.1, parts.length * 0.42 + 0.6));
      const weights = parts.map((p) => (isCJK(p) ? 1 : Math.max(0.6, p.trim().length / 3)));
      const W = weights.reduce((a, b) => a + b, 0);
      let t = start;
      syl = parts.map((p, j) => {
        const d = (dur * weights[j]) / W;
        const s = { t, d, text: p };
        t += d;
        return s;
      });
    }
    const last = syl[syl.length - 1];
    lines.push({ start: syl[0].t, end: last.t + last.d, text, syl });
  });
  return lines;
}

/** UltraStar .txt */
export function parseUltraStar(src, { player = 1 } = {}) {
  const head = {};
  const body = [];
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    const h = line.match(/^#([A-Z0-9]+):(.*)$/i);
    if (h) { head[h[1].toUpperCase()] = h[2].trim(); continue; }
    if (line.trim() === 'E') break;
    body.push(line);
  }
  const bpm = parseFloat((head.BPM || '120').replace(',', '.'));
  const gap = parseFloat((head.GAP || '0').replace(',', '.')) / 1000;
  const spb = 60 / (bpm * 4);
  const relative = /yes/i.test(head.RELATIVE || '');
  const notes = [];
  const lines = [];
  let cur = [];
  let rel = 0;
  let curPlayer = 1;
  const flush = () => {
    if (!cur.length) return;
    const syl = [];
    for (const n of cur) {
      const txt = n.text.replace(/~/g, '');
      if (!txt.trim() && syl.length && n.text.includes('~')) {
        syl[syl.length - 1].d = n.t + n.d - syl[syl.length - 1].t;
      } else syl.push({ t: n.t, d: n.d, text: txt });
    }
    const last = syl[syl.length - 1];
    lines.push({ start: syl[0].t, end: last.t + last.d, text: syl.map((s) => s.text).join('').trim(), syl });
    cur = [];
  };
  for (const line of body) {
    if (/^P\s*\d/.test(line)) { flush(); curPlayer = +line.match(/\d/)[0]; continue; }
    if (curPlayer !== player && curPlayer !== 3) continue;
    if (line.startsWith('-')) {
      flush();
      const p = line.slice(1).trim().split(/\s+/).map(Number);
      if (relative && !isNaN(p[0])) rel += isNaN(p[1]) ? p[0] : p[1];
      continue;
    }
    const m = line.match(/^([:*FRG])\s*(-?\d+)\s+(\d+)\s+(-?\d+)\s?(.*)$/);
    if (!m) continue;
    const [, type, b, len, pitch, text] = m;
    const t = gap + (+b + rel) * spb;
    const d = +len * spb;
    const n = { t, d, midi: +pitch + 60, text, golden: type === '*' || type === 'G', free: type === 'F' || type === 'R' || type === 'G' };
    cur.push(n);
    if (!n.free) notes.push({ t, d, midi: n.midi, text: text.replace(/~/g, ''), golden: n.golden });
  }
  flush();
  return { head, lines, notes, bpm, gap };
}

/** 读取文本：自动识别 UTF-8 / GBK / Latin-1 */
export function decodeText(buf, hint) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    try {
      return new TextDecoder(hint || 'gbk', { fatal: true }).decode(u8);
    } catch {
      return new TextDecoder('windows-1252').decode(u8);
    }
  }
}
