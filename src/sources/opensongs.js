// 开源曲库：UltraStar-Deluxe/songs（CC 授权的卡拉OK曲目，含音高数据）。
// 文件直接从 GitHub 加载；可在设置里换成镜像前缀（例如国内的 GitHub 加速地址）。
import index from '../data/opensongs.json';
import { parseUltraStar, decodeText } from '../lyrics/parse.js';
import { settings } from '../store.js';

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

export function openSongBase() {
  const local = settings.get('opensongsLocal');
  if (local) return `${import.meta.env.BASE_URL}opensongs/`;
  const mirror = (settings.get('githubMirror') || '').trim();
  return mirror ? mirror.replace(/\/?$/, '/') + index.cdn : index.cdn;
}

export const fileUrl = (s, name) => (name ? openSongBase() + enc(`${s.dir}/${name}`) : '');

export const OPEN_SONGS = index.songs.map((s) => ({
  ...s,
  source: 'opensong',
  lang: /german|deutsch/i.test(s.language) ? '德语' : '英语',
  tags: [s.genre, s.instrumental ? '独立伴奏' : '消人声'].filter(Boolean),
  coverUrl: () => fileUrl(s, s.cover),
}));

export async function loadOpenSong(item) {
  const r = await fetch(fileUrl(item, item.songFile));
  if (!r.ok) throw new Error('曲库文件下载失败（' + r.status + '），可在设置中配置 GitHub 镜像');
  const txt = decodeText(await r.arrayBuffer(), 'windows-1252');
  const us = parseUltraStar(txt);
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    kind: 'audio',
    src: fileUrl(item, item.audio),
    instrumental: item.instrumental ? fileUrl(item, item.instrumental) : '',
    vocalMode: item.instrumental ? 'instrumental' : 'cancel',
    cover: fileUrl(item, item.cover),
    background: fileUrl(item, item.background),
    lines: us.lines,
    notes: us.notes,
    license: item.license,
    origin: `UltraStar-Deluxe/songs · ${item.license.split(' ')[0] || 'Creative Commons'}`,
  };
}

export const OPEN_SONGS_REPO = 'https://github.com/' + index.repo;
