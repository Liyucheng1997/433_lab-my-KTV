// 生成开源曲库索引：扫描 UltraStar-Deluxe/songs 仓库（自由授权的 UltraStar 卡拉OK曲目），
// 读取每首歌的元数据和授权信息，写入 src/data/opensongs.json。
// 运行：npm run index:opensongs
import { writeFile } from 'node:fs/promises';

const REPO = 'UltraStar-Deluxe/songs';
const BRANCH = 'master';
const CDN = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function text(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`)).json();
const files = tree.tree.filter((t) => t.type === 'blob').map((t) => t.path);
const folders = [...new Set(files.filter((f) => /\/(song|duet)\.txt$/.test(f)).map((f) => f.replace(/\/[^/]+$/, '')))];

const songs = [];
for (const dir of folders) {
  const inDir = files.filter((f) => f.startsWith(dir + '/')).map((f) => f.slice(dir.length + 1));
  const songFile = inDir.includes('song.txt') ? 'song.txt' : 'duet.txt';
  const raw = await text(CDN + enc(`${dir}/${songFile}`));
  const head = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^#([A-Z0-9]+):(.*)$/);
    if (m) head[m[1]] = m[2].trim();
    else if (/^[:*FRG\-]/.test(line)) break;
  }
  let license = '';
  if (inDir.includes('license.txt')) {
    const lic = await text(CDN + enc(`${dir}/license.txt`));
    const urls = [...lic.matchAll(/https?:\/\/creativecommons\.org\/[^\s)'"]+/g)].map((m) => m[0].replace(/[.,]$/, ''));
    license = [...new Set(urls)].join(' ');
  }
  const pick = (re) => inDir.find((f) => re.test(f)) || '';
  songs.push({
    id: 'os:' + dir.split('/').pop(),
    dir,
    title: head.TITLE || dir,
    artist: head.ARTIST || '',
    language: head.LANGUAGE || '',
    genre: head.GENRE || '',
    year: head.YEAR || '',
    songFile,
    audio: head.MP3 && inDir.includes(head.MP3) ? head.MP3 : pick(/^audio\.(mp3|ogg)$/),
    instrumental: pick(/^instrumental\.(mp3|ogg)$/),
    cover: head.COVER && inDir.includes(head.COVER) ? head.COVER : pick(/^cover\./),
    background: head.BACKGROUND && inDir.includes(head.BACKGROUND) ? head.BACKGROUND : pick(/^background\./),
    license,
  });
  process.stdout.write('.');
}
songs.sort((a, b) => (a.artist + a.title).localeCompare(b.artist + b.title));
await writeFile(new URL('../src/data/opensongs.json', import.meta.url), JSON.stringify({ repo: REPO, branch: BRANCH, cdn: CDN, songs }, null, 1));
console.log(`\n已写入 ${songs.length} 首`);
