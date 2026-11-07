// LRCLIB（https://lrclib.net）：免费开放的同步歌词库，无需密钥。
import { kv } from '../store.js';

const API = 'https://lrclib.net/api';

export async function searchLyrics(q, signal) {
  const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`, { signal });
  if (!r.ok) throw new Error('歌词库搜索失败：' + r.status);
  const list = await r.json();
  return list.map((x) => ({
    id: 'lrc:' + x.id,
    lrcId: x.id,
    source: 'lrclib',
    title: x.trackName,
    artist: x.artistName,
    album: x.albumName,
    duration: x.duration,
    synced: !!x.syncedLyrics,
    instrumental: x.instrumental,
  }));
}

/** 精确匹配 + 模糊搜索兜底，优先带时间轴的歌词。结果缓存在本地。 */
export async function findLyrics({ title, artist, duration, lrcId }) {
  const key = 'lyr:' + (lrcId || `${title}|${artist}|${Math.round(duration || 0)}`);
  const cached = await kv.get(key);
  if (cached) return cached;
  let hit = null;
  try {
    if (lrcId) {
      const r = await fetch(`${API}/get/${lrcId}`);
      if (r.ok) hit = await r.json();
    } else {
      const q = new URLSearchParams({ track_name: title, artist_name: artist || '' });
      if (duration) q.set('duration', String(Math.round(duration)));
      const r = await fetch(`${API}/get?${q}`);
      if (r.ok) hit = await r.json();
    }
  } catch {}
  if (!hit?.syncedLyrics && !lrcId) {
    const q = new URLSearchParams({ track_name: title });
    if (artist) q.set('artist_name', artist);
    let list = [];
    try {
      list = await (await fetch(`${API}/search?${q}`)).json();
      if (!list.length) list = await (await fetch(`${API}/search?q=${encodeURIComponent(title + ' ' + (artist || ''))}`)).json();
    } catch {}
    const synced = list.filter((x) => x.syncedLyrics);
    if (duration) synced.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
    hit = synced[0] || list[0] || hit;
  }
  if (!hit) return null;
  const res = { id: hit.id, title: hit.trackName, artist: hit.artistName, duration: hit.duration, synced: hit.syncedLyrics || '', plain: hit.plainLyrics || '' };
  kv.set(key, res);
  return res;
}
