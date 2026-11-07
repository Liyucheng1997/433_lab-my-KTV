// 把内置曲目的简谱数据解析为：音符（带歌词）、歌词行、伴奏事件。
import { BUILTIN_SONGS } from '../data/builtin-songs.js';

const DEGREE = [0, 0, 2, 4, 5, 7, 9, 11];
const NOTE_RE = /^([#b]?)([0-7i])(['，,]*)(_*)(\.?)(-*)$/;

export function parseMelody(src) {
  const lines = [[]];
  let beat = 0;
  for (const tok of src.split(/\s+/).filter(Boolean)) {
    if (tok === '|') continue;
    if (tok === '/') { lines.push([]); continue; }
    const m = tok.match(NOTE_RE);
    if (!m) throw new Error('无法解析音符: ' + tok);
    const [, acc, deg, oct, unders, dot, dashes] = m;
    let len = 1 / 2 ** unders.length;
    if (dot) len *= 1.5;
    len += dashes.length;
    if (deg !== '0') {
      let semi = deg === 'i' ? 12 : DEGREE[+deg];
      for (const c of oct) semi += c === "'" ? 12 : -12;
      if (acc === '#') semi += 1;
      if (acc === 'b') semi -= 1;
      lines[lines.length - 1].push({ beat, len, semi });
    }
    beat += len;
  }
  return { lines, totalBeats: beat };
}

function splitLyric(line) {
  return [...line.replace(/[\s，。、,.!?！？]/g, '')];
}

const CHORD_ROOT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function chordTones(name) {
  const m = name.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return null;
  let root = CHORD_ROOT[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const q = m[3];
  let iv = [0, 4, 7];
  if (q.startsWith('m') && !q.startsWith('maj')) iv = [0, 3, 7];
  if (q === 'dim') iv = [0, 3, 6];
  if (q === 'sus4') iv = [0, 5, 7];
  if (q === '7') iv = [0, 4, 7, 10];
  if (q === 'm7') iv = [0, 3, 7, 10];
  if (q === 'maj7') iv = [0, 4, 7, 11];
  return { root, iv };
}

/** 构建内置曲目的完整演唱数据 */
export function buildBuiltinSong(def0) {
  const def = { ...def0 };
  if (def.repeat > 1) {
    const r = def.repeat;
    def.melody = Array(r).fill(def.melody).join(' / ');
    def.lyrics = Array(r).fill(def.lyrics.trim()).join('\n');
    def.chords = Array(r).fill(def.chords).join('|');
  }
  const spb = 60 / def.bpm;
  const barBeats = def.meter;
  const introBars = 2;
  const t0 = introBars * barBeats * spb; // 第一小节（弱起之后）开始时间
  const { lines: melLines, totalBeats } = parseMelody(def.melody);
  const lyricLines = def.lyrics.trim().split(/\n/).map((l) => splitLyric(l)).filter((l) => l.length);
  const base = def.tonic;

  const notes = [];
  const lines = [];
  melLines.forEach((ml, li) => {
    const lyr = lyricLines[li] || [];
    if (lyr.length !== ml.length) console.warn(`[${def.title}] 第${li + 1}行：音符 ${ml.length} 个，歌词 ${lyr.length} 字`);
    const syl = [];
    ml.forEach((n, i) => {
      const t = t0 + (n.beat - def.pickup) * spb;
      const d = n.len * spb;
      const ch = lyr[i] ?? '~';
      notes.push({ t, d, midi: base + n.semi, text: ch === '~' ? '' : ch, golden: false });
      if (ch === '~' && syl.length) syl[syl.length - 1].d = t + d - syl[syl.length - 1].t;
      else syl.push({ t, d, text: ch === '~' ? '' : ch });
    });
    if (syl.length) {
      const last = syl[syl.length - 1];
      lines.push({ start: syl[0].t, end: last.t + last.d, text: syl.map((s) => s.text).join(''), syl });
    }
  });
  // 每行最后一个长音标为“金色音符”，唱准加倍得分
  for (const l of lines) {
    const n = notes.filter((x) => x.t >= l.start - 1e-6 && x.t < l.end).sort((a, b) => b.d - a.d)[0];
    if (n) n.golden = true;
  }

  const bars = def.chords.split('|').map((b) => b.split(',').map((s) => s.trim()));
  const songEnd = t0 + (totalBeats - def.pickup) * spb;
  const events = arrange(def, bars, t0, spb, notes);
  const duration = Math.max(songEnd, t0 + bars.length * barBeats * spb) + barBeats * spb + 1.5;
  return {
    id: def.id,
    title: def.title,
    artist: '公版旋律 · 原创填词',
    lang: def.lang,
    tags: def.tags,
    origin: def.origin,
    kind: 'synth',
    bpm: def.bpm,
    lines,
    notes,
    events,
    duration,
  };
}

/** 根据风格生成伴奏事件 */
function arrange(def, bars, t0, spb, notes) {
  const ev = [];
  const { meter, style } = def;
  const transpose = def.tonic - 60;
  const push = (o) => ev.push(o);
  const barDur = meter * spb;
  // 前奏：用第一个和弦 + 鼓点
  const intro = [bars[0], bars[0]].map((b) => b);
  const allBars = [...intro, ...bars, [bars[bars.length - 1].slice(-1)[0]]];
  const startT = t0 - intro.length * barDur;

  allBars.forEach((items, bi) => {
    const barT = startT + bi * barDur;
    const isOutro = bi === allBars.length - 1;
    const segBeats = meter / items.length;
    items.forEach((name, si) => {
      const c = chordTones(name);
      if (!c) return;
      const segT = barT + si * segBeats * spb;
      const segD = segBeats * spb;
      const root = 48 + ((c.root + transpose) % 12 + 12) % 12; // C3..B3
      const tones = c.iv.map((i) => root + 12 + i); // 第四八度和弦
      if (isOutro) {
        tones.forEach((m) => push({ t: segT, d: barDur * 1.6, type: 'pad', midi: m, v: 0.5 }));
        tones.forEach((m) => push({ t: segT, d: barDur * 1.6, type: 'piano', midi: m, v: 0.5 }));
        push({ t: segT, d: barDur * 1.6, type: 'bass', midi: root - 12, v: 0.8 });
        return;
      }
      tones.forEach((m) => push({ t: segT, d: segD, type: 'pad', midi: m, v: style === 'ballad' ? 0.55 : 0.32 }));
      for (let b = 0; b < segBeats; b += 0.5) {
        const t = segT + b * spb;
        const onBeat = b % 1 === 0;
        const beatInBar = si * segBeats + b; // 0..meter
        switch (style) {
          case 'ballad': {
            const arp = [root, root + 7, root + 12 + c.iv[1], root + 12 + c.iv[2], root + 24, root + 12 + c.iv[2]];
            push({ t, d: spb * 1.5, type: 'piano', midi: arp[(beatInBar * 2) % arp.length] + 12, v: 0.45 });
            if (beatInBar === 0 || beatInBar === meter / 2) push({ t, d: segD, type: 'bass', midi: root - 12, v: 0.7 });
            if (beatInBar === 0) push({ t, type: 'kick', v: 0.45 });
            if (beatInBar === 2) push({ t, type: 'snare', v: 0.18 });
            if (onBeat) push({ t, type: 'hat', v: 0.08 });
            break;
          }
          case 'waltz': {
            if (!onBeat) break;
            if (beatInBar === 0) { push({ t, d: spb, type: 'bass', midi: root - 12, v: 0.8 }); push({ t, type: 'kick', v: 0.35 }); }
            else tones.forEach((m) => push({ t, d: spb * 0.8, type: 'piano', midi: m, v: 0.35 }));
            push({ t, type: 'hat', v: beatInBar === 0 ? 0.1 : 0.06 });
            break;
          }
          case 'folk': {
            const arp = [root + 12, root + 12 + c.iv[2], root + 24 + c.iv[1], root + 24];
            push({ t, d: spb * 1.2, type: 'pluck', midi: arp[(beatInBar * 2) % arp.length], v: 0.5 });
            if (beatInBar === 0) push({ t, d: barDur, type: 'bass', midi: root - 12, v: 0.55 });
            if (onBeat && beatInBar % 2 === 1) push({ t, type: 'hat', v: 0.05 });
            break;
          }
          case 'march': {
            if (onBeat) {
              if (beatInBar % 2 === 0) { push({ t, d: spb, type: 'bass', midi: root - 12 + (beatInBar === 2 ? 7 : 0), v: 0.75 }); push({ t, type: 'kick', v: 0.6 }); }
              else { tones.forEach((m) => push({ t, d: spb * 0.5, type: 'piano', midi: m, v: 0.4 })); push({ t, type: 'snare', v: 0.35 }); }
            }
            push({ t, type: 'bell', v: 0.12 });
            break;
          }
          case 'kids': {
            if (onBeat) {
              if (beatInBar % 2 === 0) { push({ t, d: spb, type: 'bass', midi: root - 12, v: 0.7 }); push({ t, type: 'kick', v: 0.45 }); }
              else { push({ t, type: 'snare', v: 0.25 }); }
              tones.forEach((m) => push({ t, d: spb * 0.4, type: 'piano', midi: m + 12, v: 0.22 }));
            }
            push({ t, type: 'hat', v: 0.07 });
            break;
          }
          default: { // pop
            if (onBeat) {
              if (beatInBar % 2 === 0) push({ t, type: 'kick', v: 0.6 });
              else push({ t, type: 'snare', v: 0.4 });
              push({ t, d: spb * 0.9, type: 'bass', midi: root - 12 + (beatInBar === 3 ? 7 : 0), v: 0.75 });
            }
            if (b === 1.5 || b === 3.5) push({ t, type: 'kick', v: 0.35 });
            if (beatInBar === 0 || beatInBar === 1.5 || beatInBar === 2 || beatInBar === 3.5)
              tones.forEach((m) => push({ t, d: spb * 0.7, type: 'piano', midi: m, v: 0.3 }));
            push({ t, type: 'hat', v: onBeat ? 0.1 : 0.06 });
          }
        }
      }
    });
  });
  // 前奏倒数的军鼓/踩镲
  // 导唱旋律（原唱）
  for (const n of notes) push({ t: n.t, d: n.d, type: 'lead', midi: n.midi, v: 0.6 });
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

export const BUILTIN_LIST = BUILTIN_SONGS.map((d) => ({
  id: d.id,
  source: 'builtin',
  title: d.title,
  artist: '公版旋律 · 原创填词',
  lang: d.lang,
  tags: d.tags,
  origin: d.origin,
}));

export function getBuiltinDef(id) {
  return BUILTIN_SONGS.find((d) => d.id === id);
}
