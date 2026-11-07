// 把开源曲库（UltraStar-Deluxe/songs）下载到 public/opensongs，供离线使用。
// 运行：npm run download:opensongs，然后在网页设置里勾选“开源曲库使用本地副本”。
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import index from '../src/data/opensongs.json' with { type: 'json' };

const root = new URL('../public/opensongs/', import.meta.url);
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
let n = 0;
for (const s of index.songs) {
  for (const f of [s.songFile, s.audio, s.instrumental, s.cover, s.background, 'license.txt'].filter(Boolean)) {
    const rel = `${s.dir}/${f}`;
    const out = new URL(enc(rel), root);
    try { await access(out); continue; } catch {}
    const r = await fetch(index.cdn + enc(rel));
    if (!r.ok) { console.warn('跳过', rel, r.status); continue; }
    await mkdir(dirname(out.pathname.replace(/^\/([A-Za-z]:)/, '$1')), { recursive: true });
    await writeFile(out, Buffer.from(await r.arrayBuffer()));
    n++;
    process.stdout.write(`\r已下载 ${n} 个文件：${rel.slice(0, 60).padEnd(60)}`);
  }
}
console.log('\n完成');
