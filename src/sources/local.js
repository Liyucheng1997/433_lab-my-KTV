// 本地歌库：选择音乐文件夹（浏览器记住授权）或添加单个文件（存进浏览器数据库）。
// 支持 mp3/m4a/flac/wav/ogg/aac/opus 音频与 mp4/webm 视频，同名 .lrc 自动作为歌词。
import { kv } from '../store.js';
import { decodeText } from '../lyrics/parse.js';

const AUDIO = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|wma)$/i;
const VIDEO = /\.(mp4|m4v|webm|mov|mkv)$/i;
const LRC = /\.lrc$/i;

let index = [];
let dirs = []; // { key, name, handle, granted }
const subs = new Set();
const emit = () => subs.forEach((f) => f(index));

export const local = {
  get list() { return index; },
  get dirs() { return dirs; },
  onChange: (f) => subs.add(f),
  supportsFolders: typeof window !== 'undefined' && 'showDirectoryPicker' in window,

  async init() {
    index = (await kv.get('local:index')) || [];
    dirs = ((await kv.get('local:dirs')) || []).map((d) => ({ ...d, granted: false }));
    for (const d of dirs) {
      try { d.granted = (await d.handle.queryPermission({ mode: 'read' })) === 'granted'; } catch {}
    }
    emit();
  },

  async save() {
    await kv.set('local:index', index);
    await kv.set('local:dirs', dirs.map(({ key, name, handle }) => ({ key, name, handle })));
    emit();
  },

  async addFolder() {
    const handle = await window.showDirectoryPicker({ id: 'myktv-music', mode: 'read' });
    for (const d of dirs) if (await d.handle.isSameEntry?.(handle)) return this.rescan(d);
    const d = { key: 'dir' + Date.now(), name: handle.name, handle, granted: true };
    dirs.push(d);
    return this.rescan(d);
  },

  async regrant(d) {
    d.granted = (await d.handle.requestPermission({ mode: 'read' })) === 'granted';
    emit();
    return d.granted;
  },

  async removeFolder(d) {
    dirs = dirs.filter((x) => x !== d);
    index = index.filter((x) => x.dir !== d.key);
    await this.save();
  },

  async rescan(d, onProgress) {
    const found = [];
    const lrcs = new Map();
    async function walk(h, path) {
      for await (const [name, child] of h.entries()) {
        const p = path ? `${path}/${name}` : name;
        if (child.kind === 'directory') { if (!name.startsWith('.')) await walk(child, p); }
        else if (AUDIO.test(name) || VIDEO.test(name)) found.push({ name, path: p, handle: child });
        else if (LRC.test(name)) lrcs.set(p.replace(LRC, '').toLowerCase(), p);
      }
    }
    await walk(d.handle, '');
    const old = new Map(index.filter((x) => x.dir === d.key).map((x) => [x.path, x]));
    const out = [];
    let i = 0;
    for (const f of found) {
      i++;
      onProgress?.(i, found.length);
      const prev = old.get(f.path);
      const lrcPath = lrcs.get(f.path.replace(/\.[^.]+$/, '').toLowerCase()) || '';
      if (prev) { out.push({ ...prev, lrcPath }); continue; }
      let tags = {};
      try { tags = await readTags(await f.handle.getFile()); } catch {}
      out.push(entry({ name: f.name, path: f.path, dir: d.key, lrcPath, tags }));
    }
    index = [...index.filter((x) => x.dir !== d.key), ...out];
    d.granted = true;
    await this.save();
    return out.length;
  },

  async addFiles(fileList) {
    const files = [...fileList];
    const lrcs = new Map(files.filter((f) => LRC.test(f.name)).map((f) => [f.name.replace(LRC, '').toLowerCase(), f]));
    let n = 0;
    for (const f of files) {
      if (!AUDIO.test(f.name) && !VIDEO.test(f.name)) continue;
      const blobKey = 'blob:' + f.name + ':' + f.size;
      await kv.set(blobKey, f);
      let tags = {};
      try { tags = await readTags(f); } catch {}
      const lrc = lrcs.get(f.name.replace(/\.[^.]+$/, '').toLowerCase());
      let lrcText = '';
      if (lrc) lrcText = await lrc.text();
      index = index.filter((x) => x.blobKey !== blobKey);
      index.push(entry({ name: f.name, path: f.name, dir: '', blobKey, lrcText, tags }));
      n++;
    }
    await this.save();
    return n;
  },

  async remove(item) {
    index = index.filter((x) => x.id !== item.id);
    if (item.blobKey) await kv.del(item.blobKey);
    await this.save();
  },

  async update(item, patch) {
    Object.assign(item, patch);
    await this.save();
  },

  /** 取得文件对象 */
  async file(item) {
    if (item.blobKey) {
      const f = await kv.get(item.blobKey);
      if (!f) throw new Error('文件已从浏览器数据库中移除，请重新添加');
      return f;
    }
    const d = dirs.find((x) => x.key === item.dir);
    if (!d) throw new Error('所在文件夹已移除');
    if (!d.granted && !(await this.regrant(d))) throw new Error('需要重新授权访问文件夹「' + d.name + '」');
    return getByPath(d.handle, item.path);
  },

  async lrc(item) {
    if (item.lrcText) return item.lrcText;
    if (!item.lrcPath) return '';
    const d = dirs.find((x) => x.key === item.dir);
    if (!d) return '';
    const f = await getByPath(d.handle, item.lrcPath);
    return decodeText(await f.arrayBuffer());
  },
};

async function getByPath(root, path) {
  const parts = path.split('/');
  let h = root;
  for (const p of parts.slice(0, -1)) h = await h.getDirectoryHandle(p);
  return (await h.getFileHandle(parts[parts.length - 1])).getFile();
}

function entry({ name, path, dir, blobKey = '', lrcPath = '', lrcText = '', tags = {} }) {
  const base = name.replace(/\.[^.]+$/, '');
  let title = tags.title;
  let artist = tags.artist;
  if (!title) {
    // 文件名常见格式：歌手 - 歌名 / 歌名-歌手 / 01. 歌名
    const clean = base.replace(/^\d{1,3}[\s._-]+/, '').replace(/[（(\[【].*?(伴奏|KTV|MV|消音|原唱|高清|live|Live)[^)）\]】]*[)）\]】]/g, '').trim();
    const m = clean.split(/\s+-\s+|\s*-\s*|\s*—\s*/);
    if (m.length >= 2) { artist = artist || m[0].trim(); title = m.slice(1).join(' - ').trim(); }
    else title = clean;
  }
  return {
    id: 'loc:' + (dir || 'blob') + ':' + path,
    source: 'local',
    kind: VIDEO.test(name) ? 'video' : 'audio',
    title: title || base,
    artist: artist || '',
    album: tags.album || '',
    name,
    path,
    dir,
    blobKey,
    lrcPath,
    lrcText,
    vocalMode: 'cancel',
  };
}

/* ---------- 读取标签：ID3v2 / FLAC / MP4（简版） ---------- */
export async function readTags(file) {
  const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return id3(head);
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return flac(head);
  return {};
}

function id3(b) {
  const ver = b[3];
  const size = syncsafe(b, 6);
  const out = {};
  let p = 10;
  if (b[5] & 0x40) p += ver === 4 ? syncsafe(b, 10) : (b[10] << 24 | b[11] << 16 | b[12] << 8 | b[13]) + 4;
  const end = Math.min(b.length, size + 10);
  const map = ver === 2 ? { TT2: 'title', TP1: 'artist', TAL: 'album' } : { TIT2: 'title', TPE1: 'artist', TALB: 'album' };
  while (p < end - 10) {
    const idLen = ver === 2 ? 3 : 4;
    const id = String.fromCharCode(...b.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let len;
    if (ver === 2) len = b[p + 3] << 16 | b[p + 4] << 8 | b[p + 5];
    else if (ver === 4) len = syncsafe(b, p + 4);
    else len = b[p + 4] << 24 | b[p + 5] << 16 | b[p + 6] << 8 | b[p + 7];
    const hdr = ver === 2 ? 6 : 10;
    const data = b.subarray(p + hdr, p + hdr + len);
    if (map[id] && data.length > 1) out[map[id]] = id3text(data);
    p += hdr + len;
    if (len <= 0) break;
  }
  return out;
}
const syncsafe = (b, i) => (b[i] & 0x7f) << 21 | (b[i + 1] & 0x7f) << 14 | (b[i + 2] & 0x7f) << 7 | (b[i + 3] & 0x7f);
function id3text(d) {
  const enc = d[0];
  const body = d.subarray(1);
  let s;
  if (enc === 1) s = new TextDecoder('utf-16').decode(body);
  else if (enc === 2) s = new TextDecoder('utf-16be').decode(body);
  else if (enc === 3) s = new TextDecoder('utf-8').decode(body);
  else {
    // ISO-8859-1，但国内很多老文件其实是 GBK
    try { s = new TextDecoder('gbk', { fatal: true }).decode(body); } catch { s = new TextDecoder('windows-1252').decode(body); }
  }
  return s.replace(/\0+$/g, '').split('\0')[0].trim();
}

function flac(b) {
  let p = 4;
  const out = {};
  while (p + 4 < b.length) {
    const last = b[p] & 0x80;
    const type = b[p] & 0x7f;
    const len = b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3];
    if (type === 4) {
      const dv = new DataView(b.buffer, b.byteOffset + p + 4, Math.min(len, b.length - p - 4));
      let q = 0;
      const vlen = dv.getUint32(q, true); q += 4 + vlen;
      const n = dv.getUint32(q, true); q += 4;
      const td = new TextDecoder();
      for (let i = 0; i < n && q < dv.byteLength; i++) {
        const l = dv.getUint32(q, true); q += 4;
        const s = td.decode(new Uint8Array(b.buffer, b.byteOffset + p + 4 + q, l)); q += l;
        const [k, ...v] = s.split('=');
        const key = k.toUpperCase();
        if (key === 'TITLE') out.title = v.join('=');
        if (key === 'ARTIST') out.artist = v.join('=');
        if (key === 'ALBUM') out.album = v.join('=');
      }
      break;
    }
    p += 4 + len;
    if (last) break;
  }
  return out;
}
