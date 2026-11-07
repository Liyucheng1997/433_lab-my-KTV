// 点歌台：搜索（歌名/歌手/拼音首字母）、分类、歌手、内置、开源曲库、本地、在线歌词库、收藏、已点、已唱、录音。
import { icon } from './icons.js';
import { $, $$, esc, fmtTime, toast, debounce, modal } from './dom.js';
import { allSongs, search, singers, getBinding, setBinding } from '../library.js';
import { ktv } from '../ktv.js';
import { local } from '../sources/local.js';
import { searchLyrics } from '../sources/lrclib.js';
import { OPEN_SONGS_REPO } from '../sources/opensongs.js';
import { parseVideoLink } from '../players/embedPlayer.js';
import { settings } from '../store.js';

const TABS = [
  ['hot', '推荐'],
  ['singer', '歌手'],
  ['builtin', '内置'],
  ['open', '开源曲库'],
  ['local', '本地'],
  ['online', '在线搜歌'],
  ['fav', '收藏'],
  ['queue', '已点'],
  ['history', '已唱'],
  ['rec', '录音'],
];
const LANGS = ['全部', '国语', '粤语', '闽南语', '英语', '日语', '韩语'];
const TAGS = ['全部', '热门', '经典', '情歌', '合唱', '嗨歌', '粤语金曲', '中国风', '民谣', '摇滚', '怀旧', '励志', '影视'];
const SRC_LABEL = { builtin: '内置', opensong: '开源', local: '本地', catalog: '', lrclib: '歌词库' };

export class SongBook {
  constructor(root) {
    this.root = root;
    this.tab = 'hot';
    this.q = '';
    this.lang = '全部';
    this.tag = '全部';
    this.singer = null;
    this.limit = 200;
    root.innerHTML = `
      <div class="book-head">
        <div class="book-title">点歌台</div>
        <button class="icon-btn book-close" title="关闭 (Esc)">${icon('x')}</button>
      </div>
      <div class="book-search">
        <div class="search-box">${icon('search', 18)}<input class="search-input" placeholder="歌名 / 歌手 / 拼音首字母，如 qt = 晴天" autocomplete="off" spellcheck="false" /><button class="icon-btn clear-q" title="清空">${icon('x', 16)}</button></div>
        <button class="btn btn-sm kbd-toggle" title="拼音点歌键盘">${icon('keyboard', 16)}拼音</button>
      </div>
      <div class="kbd" hidden></div>
      <nav class="book-tabs"></nav>
      <div class="book-filters"></div>
      <div class="book-body"></div>`;
    this.input = $('.search-input', root);
    this.body = $('.book-body', root);
    this.filters = $('.book-filters', root);
    $('.book-close', root).onclick = () => this.close();
    $('.clear-q', root).onclick = () => { this.input.value = ''; this.onQuery(); this.input.focus(); };
    this.input.addEventListener('input', debounce(() => this.onQuery(), 120));
    const kbd = $('.kbd', root);
    kbd.innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `<button data-k="${c}">${c}</button>`).join('') + `<button data-k="del" class="wide">删除</button><button data-k="clr" class="wide">清空</button>`;
    kbd.onclick = (e) => {
      const k = e.target.closest('button')?.dataset.k;
      if (!k) return;
      if (k === 'del') this.input.value = this.input.value.slice(0, -1);
      else if (k === 'clr') this.input.value = '';
      else this.input.value += k.toLowerCase();
      this.onQuery();
    };
    $('.kbd-toggle', root).onclick = () => { kbd.hidden = !kbd.hidden; };
    this.renderTabs();
    ktv.on('queue', () => { this.renderTabs(); if (this.tab === 'queue') this.render(); });
    ktv.on('favorites', () => { if (this.tab === 'fav') this.render(); });
    local.onChange(() => { this.songs = null; if (['local', 'hot', 'singer'].includes(this.tab)) this.render(); });
    ktv.on('record', () => { if (this.tab === 'rec') this.render(); });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('scroll', () => {
      if (this.body.scrollTop + this.body.clientHeight > this.body.scrollHeight - 300 && this.more) { this.limit += 200; this.render(true); }
    });
  }

  get list() {
    return (this.songs ||= allSongs());
  }

  open(tab) {
    this.root.classList.add('open');
    document.body.classList.add('book-open');
    if (tab) this.setTab(tab); else this.render();
    setTimeout(() => this.input.focus({ preventScroll: true }), 200);
  }
  close() {
    this.root.classList.remove('open');
    document.body.classList.remove('book-open');
  }
  get isOpen() { return this.root.classList.contains('open'); }

  setTab(t) {
    this.tab = t;
    this.singer = null;
    this.limit = 200;
    this.renderTabs();
    this.render();
    this.body.scrollTop = 0;
  }

  renderTabs() {
    const nav = $('.book-tabs', this.root);
    nav.innerHTML = TABS.map(([k, label]) => `<button class="chip ${this.tab === k ? 'active' : ''}" data-tab="${k}">${label}${k === 'queue' && ktv.queue.length ? ` <b class="cnt">${ktv.queue.length}</b>` : ''}</button>`).join('');
    nav.onclick = (e) => { const t = e.target.closest('[data-tab]')?.dataset.tab; if (t) this.setTab(t); };
  }

  onQuery() {
    this.q = this.input.value.trim();
    this.limit = 200;
    if (this.tab === 'online') return this.searchOnline();
    if (!['hot', 'singer', 'builtin', 'open', 'local', 'fav'].includes(this.tab)) this.tab = 'hot', this.renderTabs();
    this.render();
  }

  /* ---------- 渲染 ---------- */
  render(keepScroll) {
    const st = this.body.scrollTop;
    this.filters.innerHTML = '';
    this.more = false;
    const f = this[`r_${this.tab}`];
    if (f) f.call(this);
    if (keepScroll) this.body.scrollTop = st;
  }

  chips(list, cur, key) {
    return `<div class="chip-row">${list.map((x) => `<button class="chip chip-sm ${x === cur ? 'active' : ''}" data-${key}="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  }

  bindFilters() {
    this.filters.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.lang) this.lang = b.dataset.lang;
      if (b.dataset.tag) this.tag = b.dataset.tag;
      this.limit = 200;
      this.render();
    };
  }

  rows(items, { empty = '没有找到歌曲', showSource = true } = {}) {
    if (!items.length) return `<div class="empty-state">${empty}</div>`;
    this.more = items.length > this.limit;
    this.rendered = items.slice(0, this.limit);
    return `<div class="song-list">${this.rendered.map((it, i) => this.row(it, i, showSource)).join('')}</div>`;
  }

  row(it, i, showSource) {
    const fav = ktv.isFav(it);
    const badge = [];
    if (showSource && SRC_LABEL[it.source]) badge.push(SRC_LABEL[it.source]);
    if (it.hasLocal) badge.push('本地');
    if (it.source === 'opensong' && it.instrumental) badge.push('原伴唱');
    if (it.source === 'builtin' || it.source === 'opensong') badge.push('打分');
    if (it.source === 'lrclib' && it.synced) badge.push('同步歌词');
    const cover = it.source === 'opensong' && it.cover ? `<img src="${esc(it.coverUrl())}" loading="lazy" alt="" />` : esc((it.title || '?').trim()[0] || '?');
    const sub = [it.artist, it.lang, it.album, it.duration ? fmtTime(it.duration) : ''].filter(Boolean).map(esc).join(' · ');
    return `<div class="song" data-i="${i}">
      <div class="song-cover">${cover}</div>
      <div class="song-info"><div class="song-title">${esc(it.title)}${badge.map((b) => `<span class="badge">${b}</span>`).join('')}</div><div class="song-sub">${sub}</div></div>
      <div class="song-acts">
        <button class="icon-btn" data-act="fav" title="收藏">${icon(fav ? 'starOn' : 'star', 18)}</button>
        <button class="icon-btn" data-act="top" title="优先（插到下一首）">${icon('up', 18)}</button>
        <button class="btn btn-sm btn-primary" data-act="add">点歌</button>
      </div></div>`;
  }

  onClick(e) {
    const act = e.target.closest('[data-act]');
    const row = e.target.closest('.song');
    if (act && row && this.rendered) {
      const it = this.rendered[+row.dataset.i];
      if (!it) return;
      const a = act.dataset.act;
      if (a === 'add' || a === 'top') {
        ktv.add(it, a === 'top');
        toast((a === 'top' ? '已优先：' : '已点：') + it.title, 'success', 1600);
        act.classList.add('pop');
        setTimeout(() => act.classList.remove('pop'), 300);
      } else if (a === 'fav') {
        ktv.toggleFavorite(it);
        act.innerHTML = icon(ktv.isFav(it) ? 'starOn' : 'star', 18);
      } else if (a === 'rmlocal') {
        local.remove(it);
      }
      return;
    }
    const s = e.target.closest('[data-singer]');
    if (s) { this.singer = s.dataset.singer; this.render(); this.body.scrollTop = 0; return; }
    if (e.target.closest('[data-back]')) { this.singer = null; this.render(); }
  }

  /* ---------- 各个页签 ---------- */
  r_hot() {
    let items = this.list;
    if (this.q) {
      this.body.innerHTML = `<div class="section-note">在全部 ${items.length} 首中搜索「${esc(this.q)}」· 找不到？试试 <button class="link" data-goto="online">在线搜歌</button></div>` + this.rows(search(items, this.q));
      this.bindGoto();
      return;
    }
    this.filters.innerHTML = this.chips(LANGS, this.lang, 'lang') + this.chips(TAGS, this.tag, 'tag');
    this.bindFilters();
    items = items.filter((it) => it.source === 'catalog' || it.source === 'local');
    if (this.lang !== '全部') items = items.filter((it) => it.lang === this.lang);
    if (this.tag !== '全部') items = items.filter((it) => it.tags?.includes(this.tag));
    const builtin = this.list.filter((x) => x.source === 'builtin').slice(0, 3);
    const tip = `<div class="tip-card">${icon('info', 18)}<div>推荐榜里的流行歌只有歌名信息：点歌后会优先用<b>本地歌库</b>里的同名歌曲；没有的话自动从 <b>LRCLIB</b> 拉同步歌词进入清唱，也可以粘贴 B站 / YouTube 的 KTV 视频链接一起唱。想马上体验带伴奏和打分的，先试试「内置」和「开源曲库」。</div></div>`;
    this.body.innerHTML = tip + (this.lang === '全部' && this.tag === '全部' ? `<div class="section-title">立即可唱 · 带伴奏与打分</div>${this.rows(builtin)}<div class="section-title">热门 KTV 歌单</div>` : '') + this.rows(items, { showSource: false });
    // 两个列表共享索引会冲突：重新生成一次统一的 rendered
    const all = (this.lang === '全部' && this.tag === '全部' ? builtin : []).concat(items.slice(0, this.limit));
    this.rendered = all;
    $$('.song', this.body).forEach((el, i) => (el.dataset.i = i));
  }

  r_singer() {
    if (this.singer) {
      const items = this.list.filter((x) => x.artist === this.singer);
      this.body.innerHTML = `<button class="btn btn-sm back" data-back>← 全部歌手</button><div class="section-title">${esc(this.singer)} · ${items.length} 首</div>` + this.rows(items);
      return;
    }
    this.filters.innerHTML = this.chips(LANGS, this.lang, 'lang');
    this.bindFilters();
    let list = this.list;
    if (this.q) list = search(list, this.q);
    let sg = singers(list);
    if (this.lang !== '全部') sg = sg.filter((s) => s.lang === this.lang);
    this.body.innerHTML = `<div class="singer-grid">${sg.slice(0, 400).map((s) => `<button class="singer" data-singer="${esc(s.name)}"><span class="avatar">${esc(s.name.trim()[0])}</span><span class="singer-name">${esc(s.name)}</span><span class="singer-cnt">${s.count} 首</span></button>`).join('')}</div>`;
  }

  r_builtin() {
    let items = this.list.filter((x) => x.source === 'builtin');
    if (this.q) items = search(items, this.q);
    this.body.innerHTML = `<div class="tip-card">${icon('music', 18)}<div>内置曲目全部离线可唱：旋律来自公版名曲，歌词为本项目原创填词，伴奏由浏览器实时合成。支持<b>原唱导唱/伴唱切换</b>、<b>升降调</b>、<b>音高轨道打分</b>。</div></div>` + this.rows(items, { showSource: false });
  }

  r_open() {
    let items = this.list.filter((x) => x.source === 'opensong');
    if (this.q) items = search(items, this.q);
    this.body.innerHTML = `<div class="tip-card">${icon('globe', 18)}<div>来自开源项目 <a href="${OPEN_SONGS_REPO}" target="_blank" rel="noopener">UltraStar-Deluxe/songs</a> 的 ${items.length} 首知识共享（CC）授权卡拉OK歌曲，带真实音频和逐字音高数据，可以打分；带「原伴唱」标签的有独立伴奏音轨。音频从 GitHub 在线加载，国内网络慢时可在设置里填 GitHub 加速前缀。</div></div>` + this.rows(items, { showSource: false });
  }

  r_local() {
    const dirs = local.dirs;
    const head = `<div class="local-actions">
      ${local.supportsFolders ? `<button class="btn btn-primary btn-sm" data-local="folder">${icon('folder', 16)}添加音乐文件夹</button>` : ''}
      <label class="btn btn-sm">${icon('file', 16)}添加歌曲文件<input type="file" multiple accept="audio/*,video/*,.lrc,.flac,.mkv" hidden data-local="files" /></label>
    </div>
    ${dirs.map((d) => `<div class="dir-row">${icon('folder', 16)}<span class="dir-name">${esc(d.name)}</span>${d.granted ? '<span class="dot ok">已授权</span>' : `<button class="btn btn-sm" data-local="grant" data-key="${d.key}">恢复访问</button>`}<button class="icon-btn" title="重新扫描" data-local="rescan" data-key="${d.key}">${icon('refresh', 16)}</button><button class="icon-btn" title="移除" data-local="rmdir" data-key="${d.key}">${icon('trash', 16)}</button></div>`).join('')}
    <div class="section-note">支持 mp3 / m4a / flac / wav / ogg 音频和 mp4 / webm 视频；同名 .lrc 自动当歌词，没有就去 LRCLIB 匹配。伴唱默认用「消人声」，KTV 双声道文件可在播放时改为左/右声道伴奏。文件只在你的浏览器里读取，不会上传。</div>`;
    let items = local.list;
    if (this.q) items = search(items, this.q);
    this.body.innerHTML = head + this.rows(items, { empty: '还没有本地歌曲，添加一个音乐文件夹试试', showSource: false });
    this.body.querySelectorAll('[data-local]').forEach((el) => {
      const k = el.dataset.local;
      const d = dirs.find((x) => x.key === el.dataset.key);
      if (k === 'files') el.onchange = async () => { const n = await local.addFiles(el.files); toast(`已添加 ${n} 首`, 'success'); };
      else el.onclick = async () => {
        try {
          if (k === 'folder') { toast('正在扫描文件夹…'); const n = await local.addFolder(); toast(`扫描完成：${n} 首`, 'success'); }
          if (k === 'grant') await local.regrant(d);
          if (k === 'rescan') { const n = await local.rescan(d); toast(`扫描完成：${n} 首`, 'success'); }
          if (k === 'rmdir') await local.removeFolder(d);
        } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'error'); }
      };
    });
  }

  r_online() {
    this.body.innerHTML = `<div class="tip-card">${icon('globe', 18)}<div>在线搜歌使用开放歌词库 <a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a>（数百万首，含大量中文歌）。点歌后进入<b>清唱模式</b>：歌词按时间轴滚动，你可以再粘贴一个 B站 / YouTube 的 KTV 伴奏视频链接，或把同名音频放进本地歌库自动匹配。</div></div><div class="online-results">${this.q ? '<div class="empty-state"><div class="spinner"></div></div>' : '<div class="empty-state">在上方输入歌名或歌手，例如「晴天 周杰伦」</div>'}</div>`;
    if (this.q) this.searchOnline();
  }

  async searchOnline() {
    if (this.tab !== 'online') return;
    const box = $('.online-results', this.body);
    if (!box) return this.render();
    if (!this.q) { box.innerHTML = '<div class="empty-state">在上方输入歌名或歌手</div>'; return; }
    this.abort?.abort();
    this.abort = new AbortController();
    box.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
    try {
      const res = await searchLyrics(this.q, this.abort.signal);
      res.sort((a, b) => b.synced - a.synced);
      box.innerHTML = this.rows(res.filter((r) => !r.instrumental), { empty: '歌词库里没有找到，换个关键词试试' });
    } catch (e) {
      if (e.name !== 'AbortError') box.innerHTML = `<div class="empty-state">搜索失败：${esc(e.message)}</div>`;
    }
  }

  r_fav() {
    const favItems = settings.get('favItems', {});
    const all = this.list;
    let items = [...ktv.favorites].map((id) => all.find((x) => x.id === id) || favItems[id]).filter(Boolean);
    if (this.q) items = search(items, this.q);
    this.body.innerHTML = this.rows(items, { empty: '还没有收藏，点歌曲右侧的 ☆ 收藏' });
  }

  r_queue() {
    const q = ktv.queue;
    const cur = ktv.cur;
    this.rendered = null;
    this.body.innerHTML = `
      ${cur ? `<div class="section-title">正在演唱</div><div class="song now"><div class="song-cover">${icon('mic', 18)}</div><div class="song-info"><div class="song-title">${esc(cur.item.title)}</div><div class="song-sub">${esc(cur.item.artist || '')}</div></div></div>` : ''}
      <div class="section-title row-between"><span>已点 ${q.length} 首</span><span>${q.length > 1 ? `<button class="btn btn-sm" data-q="shuffle">${icon('shuffle', 14)}随机</button> ` : ''}${q.length ? '<button class="btn btn-sm" data-q="clear">清空</button>' : ''}</span></div>
      ${q.length ? `<div class="song-list">${q.map((x, i) => `<div class="song" data-uid="${x.uid}"><div class="song-cover num">${i + 1}</div><div class="song-info"><div class="song-title">${esc(x.item.title)}</div><div class="song-sub">${esc(x.item.artist || '')}</div></div><div class="song-acts">${i ? `<button class="icon-btn" data-q="top" title="置顶">${icon('up', 18)}</button>` : ''}<button class="icon-btn" data-q="rm" title="删除">${icon('trash', 18)}</button></div></div>`).join('')}</div>` : '<div class="empty-state">还没有点歌</div>'}`;
    this.body.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = () => {
        const uid = +b.closest('[data-uid]')?.dataset.uid;
        const k = b.dataset.q;
        if (k === 'shuffle') ktv.shuffle();
        if (k === 'clear') { ktv.queue = []; ktv.emit('queue', ktv.queue); }
        if (k === 'top') ktv.toTop(uid);
        if (k === 'rm') ktv.remove(uid);
      };
    });
  }

  r_history() {
    const h = ktv.history;
    this.rendered = h.map((x) => x.item);
    this.body.innerHTML = h.length
      ? `<div class="song-list">${h.map((x, i) => `<div class="song" data-i="${i}"><div class="song-cover num">${x.mode === 'none' || !x.sung ? '—' : x.score}</div><div class="song-info"><div class="song-title">${esc(x.item.title)}</div><div class="song-sub">${esc(x.item.artist || '')} · ${new Date(x.time).toLocaleTimeString()}${x.mode === 'pitch' ? ' · 音准分' : x.mode === 'voice' ? ' · 完成度' : ''}</div></div><div class="song-acts"><button class="btn btn-sm btn-primary" data-act="add">再唱</button></div></div>`).join('')}</div>`
      : '<div class="empty-state">今晚还没唱过歌</div>';
  }

  async r_rec() {
    this.body.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
    const list = await ktv.recorder.list();
    if (this.tab !== 'rec') return;
    this.urls?.forEach((u) => URL.revokeObjectURL(u));
    this.urls = [];
    this.body.innerHTML = `<div class="section-note">点底部「录音」开始录制（伴奏 + 你的人声与音效）。录音保存在本机浏览器里。</div>` + (list.length
      ? list.map((r) => {
          const u = URL.createObjectURL(r.blob);
          this.urls.push(u);
          const ext = r.blob.type.includes('mp4') ? 'm4a' : r.blob.type.includes('ogg') ? 'ogg' : 'webm';
          return `<div class="rec-row"><div class="rec-head"><b>${esc(r.title)}</b><span class="muted tabular">${new Date(r.time).toLocaleString()} · ${fmtTime(r.duration)}</span></div><audio controls preload="none" src="${u}"></audio><div class="rec-acts"><a class="btn btn-sm" href="${u}" download="${esc(r.title)}-${r.time}.${ext}">${icon('download', 14)}下载</a><button class="btn btn-sm" data-rm="${esc(r.key)}">${icon('trash', 14)}删除</button></div></div>`;
        }).join('')
      : '<div class="empty-state">还没有录音</div>');
    this.body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { await ktv.recorder.remove(b.dataset.rm); this.render(); }));
  }

  bindGoto() {
    this.body.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => this.setTab(b.dataset.goto)));
  }
}

/** 为当前歌曲绑定在线 KTV 视频链接 */
export async function bindVideoDialog(item, onDone) {
  const cur = await getBinding(item);
  const kw = encodeURIComponent(`${item.title} ${item.artist || ''} KTV 伴奏`);
  const m = modal({
    title: '绑定 KTV 视频',
    body: `<div class="form">
      <div class="modal-msg">为《${esc(item.title)}》绑定一个在线 KTV / 伴奏视频，下次点这首歌会直接播放它。<br>视频通过 B站 / YouTube 官方嵌入播放器播放，不能消人声和升降调；YouTube 视频会叠加同步歌词。</div>
      <div class="row-gap"><a class="btn btn-sm" target="_blank" rel="noopener" href="https://search.bilibili.com/all?keyword=${kw}">${icon('search', 14)}去 B站 找</a><a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${kw}">${icon('search', 14)}去 YouTube 找</a></div>
      <input class="input" id="bind-url" placeholder="粘贴视频链接，例如 https://www.bilibili.com/video/BV1xx411c7mD" value="${esc(cur?.url || '')}" />
    </div>`,
    actions: [
      ...(cur ? [{ label: '解除绑定', onClick: async () => { await setBinding(item, null); toast('已解除绑定'); onDone?.(); } }] : []),
      { label: '取消' },
      {
        label: '保存并播放',
        primary: true,
        onClick: async (b) => {
          const link = parseVideoLink($('#bind-url', b).value);
          if (!link) { toast('无法识别链接，请粘贴 B站（BV号）或 YouTube 视频地址', 'error'); return false; }
          await setBinding(item, link);
          toast('已绑定', 'success');
          onDone?.(link);
        },
      },
    ],
  });
  setTimeout(() => $('#bind-url', m.body)?.focus(), 50);
}
