// 歌库汇总：内置 + 开源曲库 + 本地歌库 + 热门目录；拼音检索；点歌时解析出可播放的曲目。
import { pinyin } from 'pinyin-pro';
import { BUILTIN_LIST, getBuiltinDef, buildBuiltinSong } from './sources/builtin.js';
import { OPEN_SONGS, loadOpenSong } from './sources/opensongs.js';
import { local } from './sources/local.js';
import { findLyrics } from './sources/lrclib.js';
import { CATALOG } from './data/catalog.js';
import { parseLRC } from './lyrics/parse.js';
import { kv } from './store.js';

export const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[（(\[【].*?[)）\]】]/g, '')
    .replace(/[\s'’"“”.,，。!！?？·・\-—_~&]/g, '');

const pyCache = new Map();
function py(s) {
  if (!s) return { ini: '', full: '' };
  if (pyCache.has(s)) return pyCache.get(s);
  const ini = pinyin(s, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' })
    .map((x) => (/^[a-z]/i.test(x) ? x[0] : ''))
    .join('')
    .toLowerCase();
  const full = pinyin(s, { toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('').toLowerCase().replace(/[^a-z0-9]/g, '');
  const r = { ini, full };
  pyCache.set(s, r);
  return r;
}

function indexItem(it) {
  if (it._idx) return it;
  const t = py(it.title);
  const a = py(it.artist);
  it._idx = { ini: t.ini, full: t.full, aini: a.ini, afull: a.full, title: norm(it.title), artist: norm(it.artist) };
  return it;
}

export function allSongs() {
  const locals = local.list;
  const localKeys = new Set(locals.map((x) => norm(x.title)));
  const cat = CATALOG.map((c) => ({ ...c, hasLocal: localKeys.has(norm(c.title)) }));
  return [...BUILTIN_LIST, ...OPEN_SONGS, ...locals, ...cat].map(indexItem);
}

export function search(list, q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return list;
  const nq = norm(q);
  const letters = /^[a-z]+$/.test(nq);
  const scored = [];
  for (const it of list) {
    const x = indexItem(it)._idx;
    let s = 0;
    if (x.title === nq) s = 100;
    else if (x.title.startsWith(nq)) s = 80;
    else if (x.title.includes(nq)) s = 60;
    else if (x.artist === nq) s = 55;
    else if (x.artist.includes(nq)) s = 45;
    if (letters) {
      if (x.ini.startsWith(nq)) s = Math.max(s, 75);
      else if (x.full.startsWith(nq)) s = Math.max(s, 70);
      else if (x.ini.includes(nq) || x.full.includes(nq)) s = Math.max(s, 40);
      else if (x.aini === nq || x.afull.startsWith(nq)) s = Math.max(s, 35);
    }
    if (s) scored.push([s, it]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

export function singers(list) {
  const map = new Map();
  for (const it of list) {
    if (!it.artist || it.source === 'builtin') continue;
    const k = it.artist;
    if (!map.has(k)) map.set(k, { name: k, count: 0, lang: it.lang, ini: py(k).ini });
    map.get(k).count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.ini.localeCompare(b.ini));
}

/* ---------- 绑定在线 KTV 视频 ---------- */
const bindKey = (it) => 'bind:' + norm(it.title) + '|' + norm(it.artist);
export const getBinding = (it) => kv.get(bindKey(it));
export const setBinding = (it, link) => (link ? kv.set(bindKey(it), link) : kv.del(bindKey(it)));

function findLocalMatch(it) {
  const t = norm(it.title);
  const a = norm(it.artist);
  const cands = local.list.filter((x) => norm(x.title) === t);
  return cands.find((x) => a && norm(x.artist).includes(a)) || cands[0] || null;
}

async function lyricsFor(meta, duration) {
  const res = await findLyrics({ title: meta.title, artist: meta.artist, duration, lrcId: meta.lrcId });
  if (!res) return { lines: [], lyricInfo: null };
  if (res.synced) return { lines: parseLRC(res.synced, duration || res.duration), lyricInfo: res };
  // 只有纯文本歌词：按时长平均分布，至少能看
  const rows = res.plain.split('\n').filter((x) => x.trim());
  const d = duration || res.duration || rows.length * 4;
  const step = d / (rows.length + 2);
  const lrc = rows.map((r, i) => `[${String(Math.floor(((i + 1) * step) / 60)).padStart(2, '0')}:${(((i + 1) * step) % 60).toFixed(2).padStart(5, '0')}]${r}`).join('\n');
  return { lines: parseLRC(lrc, d), lyricInfo: { ...res, unsynced: true } };
}

/**
 * 把点歌条目解析成可播放的曲目描述。
 * 返回 { kind: 'synth'|'audio'|'video'|'youtube'|'bilibili'|'clock', ... , lines, notes }
 */
export async function resolveTrack(item, onStatus = () => {}) {
  if (item.source === 'builtin') {
    return { ...buildBuiltinSong(getBuiltinDef(item.id)), item };
  }
  if (item.source === 'opensong') {
    onStatus('正在从开源曲库下载…');
    return { ...(await loadOpenSong(item)), item };
  }
  if (item.source === 'local') return resolveLocal(item, item, onStatus);

  // 目录歌曲 / 歌词库歌曲
  const loc = findLocalMatch(item);
  if (loc) return resolveLocal(loc, item, onStatus);
  const bind = await getBinding(item);
  if (bind) {
    onStatus('正在加载 KTV 视频…');
    let lines = [];
    if (bind.type === 'youtube' && bind.lyrics !== false) {
      try { lines = (await lyricsFor(item)).lines; } catch {}
    }
    return { kind: bind.type, title: item.title, artist: item.artist, video: bind, lines, notes: [], lyricOffset: bind.offset || 0, item };
  }
  onStatus('正在从 LRCLIB 查找歌词…');
  let ly = { lines: [], lyricInfo: null };
  try { ly = await lyricsFor(item, item.duration); } catch {}
  const last = ly.lines[ly.lines.length - 1];
  return {
    kind: 'clock',
    title: item.title,
    artist: item.artist,
    lines: ly.lines,
    notes: [],
    duration: Math.max(item.duration || ly.lyricInfo?.duration || 0, last ? last.end + 4 : 30),
    lyricInfo: ly.lyricInfo,
    noAccomp: true,
    item,
  };
}

async function resolveLocal(loc, item, onStatus) {
  onStatus('正在读取本地文件…');
  const file = await local.file(loc);
  const url = URL.createObjectURL(file);
  let lines = [];
  const lrc = await local.lrc(loc).catch(() => '');
  if (lrc) lines = parseLRC(lrc);
  const track = {
    kind: loc.kind,
    title: loc.title,
    artist: loc.artist,
    src: url,
    revoke: () => URL.revokeObjectURL(url),
    vocalMode: loc.vocalMode || 'cancel',
    lines,
    notes: [],
    localItem: loc,
    item,
    needLyrics: !lines.length,
  };
  return track;
}

/** 本地曲目加载完拿到时长后再查歌词（时长能提高匹配准确度） */
export async function fetchLyricsLater(track, duration) {
  const ly = await lyricsFor({ title: track.title, artist: track.artist }, duration);
  return ly;
}
