import './styles/tokens.css';
import './styles/app.css';
import { engine } from './audio/engine.js';
import { mic, MIC_PRESETS, VOICES } from './audio/mic.js';
import { SFX } from './audio/sfx.js';
import { ktv } from './ktv.js';
import { local } from './sources/local.js';
import { Room, LIGHT_MODES } from './ui/room.js';
import { LyricsView } from './ui/lyrics.js';
import { PitchLane } from './ui/pitchLane.js';
import { SongBook, bindVideoDialog } from './ui/songbook.js';
import { icon } from './ui/icons.js';
import { $, $$, esc, fmtTime, toast, modal } from './ui/dom.js';
import { settings } from './store.js';

/* ---------- 基础组件 ---------- */
const room = new Room($('#room'), $('#fx'));
room.setMode(settings.get('light', '动感'));
const lyrics = new LyricsView($('#lyrics'));
const lane = new PitchLane($('#pitch'));
const book = new SongBook($('#book'));
ktv.videoHost = $('#tvMedia');

$('#btnFull').innerHTML = icon('full');
$('#btnSettings').innerHTML = icon('gear');
$('.room-name').textContent = settings.get('roomName', '我的KTV');
$('.room-sub').textContent = settings.get('roomSub', 'VIP 888 包厢');

/* ---------- 底部控制条 ---------- */
const DOCK = [
  ['book', 'search', '点歌', 'primary'],
  ['queue', 'list', '已点'],
  ['sep'],
  ['replay', 'replay', '重唱'],
  ['toggle', 'play', '播放'],
  ['next', 'next', '切歌'],
  ['vocal', 'vocal', '伴唱'],
  ['sep'],
  ['key', 'key', '音调'],
  ['vol', 'volume', '音量'],
  ['mic', 'micOff', '开麦'],
  ['fx', 'sliders', '音效'],
  ['sep'],
  ['cheer', 'party', '气氛'],
  ['light', 'light', '灯光'],
  ['rec', 'rec', '录音'],
];
const dock = $('#dock');
dock.innerHTML = DOCK.map(([k, ic, label, cls]) =>
  k === 'sep' ? '<span class="dock-sep"></span>' : `<button class="dock-btn ${cls || ''}" data-k="${k}"><span class="dock-ico">${icon(ic, 22)}</span><span class="dock-label">${label}</span>${k === 'queue' ? '<b class="dock-badge" hidden></b>' : ''}</button>`
).join('');
const dbtn = (k) => dock.querySelector(`[data-k="${k}"]`);
function setDock(k, ic, label, on) {
  const b = dbtn(k);
  if (!b) return;
  if (ic) b.querySelector('.dock-ico').innerHTML = icon(ic, 22);
  if (label) b.querySelector('.dock-label').textContent = label;
  if (on !== undefined) b.classList.toggle('on', !!on);
}

dock.addEventListener('click', async (e) => {
  const b = e.target.closest('.dock-btn');
  if (!b) return;
  await unlock();
  const k = b.dataset.k;
  switch (k) {
    case 'book': return book.isOpen ? book.close() : book.open();
    case 'queue': return book.open('queue');
    case 'replay': return ktv.replay();
    case 'toggle': return ktv.toggle();
    case 'next': return ktv.next();
    case 'vocal': return ktv.setVocal(!ktv.vocalOn);
    case 'mic': return toggleMic();
    case 'rec': return ktv.toggleRecord();
    default: return openPop(k, b);
  }
});

/* ---------- 首次交互：解锁音频 ---------- */
let unlocked = false;
async function unlock() {
  if (unlocked) return;
  unlocked = true;
  await engine.init();
  await engine.resume();
}
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });

/* ---------- 麦克风 ---------- */
Object.assign(mic.settings, settings.get('mic', {}));
async function toggleMic() {
  if (mic.on) {
    mic.stop();
    toast('麦克风已关闭');
  } else {
    try {
      await mic.start(settings.get('micDevice'));
      if (!settings.get('headphoneTip')) {
        settings.set('headphoneTip', true);
        toast('建议戴耳机唱歌：外放时麦克风会收到音箱声音，可能产生啸叫', 'info', 5000);
      } else toast('麦克风已打开', 'success');
    } catch (e) {
      toast('无法打开麦克风：' + (e.name === 'NotAllowedError' ? '请在浏览器地址栏允许麦克风权限' : e.message), 'error', 4000);
    }
  }
  syncMic();
}
function syncMic() {
  setDock('mic', mic.on ? 'mic' : 'micOff', mic.on ? '关麦' : '开麦', mic.on);
  $('#micPill').classList.toggle('on', mic.on);
  $('#micPill .txt').textContent = mic.on ? `麦克风 · ${mic.settings.preset}` : '麦克风未开';
}
const saveMic = () => settings.set('mic', { ...mic.settings });

/* ---------- 弹出面板 ---------- */
let pop = null;
function closePop() {
  pop?.el.remove();
  pop?.btn.classList.remove('open');
  pop = null;
}
document.addEventListener('mousedown', (e) => {
  if (pop && !pop.el.contains(e.target) && !pop.btn.contains(e.target)) closePop();
});

function openPop(k, btn) {
  if (pop?.k === k) return closePop();
  closePop();
  const el = document.createElement('div');
  el.className = 'pop';
  btn.classList.add('open');
  pop = { k, el, btn };
  document.body.appendChild(el);
  renderPop();
  const r = btn.getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
  if (btn.closest('.dock')) el.style.bottom = innerHeight - r.top + 10 + 'px';
  else el.style.top = r.bottom + 10 + 'px';
}

function slider(id, label, min, max, step, val, fmt = (v) => v) {
  return `<label class="sl"><span class="sl-label">${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" /><span class="sl-val tabular" data-for="${id}">${fmt(val)}</span></label>`;
}
const pct = (v) => Math.round(v * 100) + '%';

function renderPop() {
  if (!pop) return;
  const { k, el } = pop;
  const s = mic.settings;
  if (k === 'key') {
    el.innerHTML = `<div class="pop-title">音调</div>
      <div class="stepper"><button class="btn" data-key="-1">降调 ♭</button><span class="step-val tabular">${ktv.key > 0 ? '+' : ''}${ktv.key}</span><button class="btn" data-key="1">升调 ♯</button></div>
      <button class="btn btn-sm full" data-key="0">恢复原调</button>
      <div class="pop-note">范围 ±6 个半音。内置曲目精确移调；音频歌曲实时变调（嵌入视频不支持）。</div>`;
    el.onclick = (e) => {
      const d = e.target.closest('[data-key]')?.dataset.key;
      if (d == null) return;
      ktv.setKey(d === '0' ? 0 : ktv.key + +d);
      renderPop();
    };
  }
  if (k === 'vol') {
    el.innerHTML = `<div class="pop-title">音量</div>
      ${slider('vMusic', '伴奏', 0, 1.2, 0.01, settings.get('vMusic', 0.8), pct)}
      ${slider('vVoice', '人声', 0, 2, 0.01, s.volume, pct)}
      ${slider('vSfx', '气氛', 0, 1.2, 0.01, settings.get('vSfx', 0.7), pct)}`;
    el.oninput = (e) => {
      const v = +e.target.value;
      if (e.target.id === 'vMusic') { settings.set('vMusic', v); engine.setMusicVolume(v); }
      if (e.target.id === 'vVoice') { mic.set({ volume: v }); saveMic(); }
      if (e.target.id === 'vSfx') { settings.set('vSfx', v); if (engine.sfxIn) engine.sfxIn.gain.value = v; }
      el.querySelector(`[data-for="${e.target.id}"]`).textContent = pct(v);
    };
  }
  if (k === 'fx') {
    el.classList.add('pop-wide');
    el.innerHTML = `<div class="pop-title row-between"><span>麦克风音效</span><button class="btn btn-sm ${mic.on ? '' : 'btn-primary'}" data-mic>${mic.on ? '关闭麦克风' : '打开麦克风'}</button></div>
      <div class="pop-sub">场景</div>
      <div class="chip-row">${Object.keys(MIC_PRESETS).map((p) => `<button class="chip chip-sm ${s.preset === p ? 'active' : ''}" data-preset="${p}">${p}</button>`).join('')}</div>
      ${slider('fxRev', '混响', 0, 0.8, 0.01, s.reverb, pct)}
      ${slider('fxRoom', '空间', 0.4, 6, 0.1, s.room, (v) => (+v).toFixed(1) + 's')}
      ${slider('fxEcho', '回声', 0, 0.8, 0.01, s.echo, pct)}
      ${slider('fxDelay', '回声间隔', 0.05, 0.8, 0.01, s.delay, (v) => Math.round(v * 1000) + 'ms')}
      ${slider('fxFb', '回声次数', 0, 0.8, 0.01, s.feedback, pct)}
      ${slider('fxBass', '低音', -6, 6, 1, s.bass, (v) => (v > 0 ? '+' : '') + v)}
      ${slider('fxTreble', '高音', -6, 8, 1, s.treble, (v) => (v > 0 ? '+' : '') + v)}
      <div class="pop-sub">变声</div>
      <div class="chip-row">${Object.keys(VOICES).map((p) => `<button class="chip chip-sm ${s.voice === p ? 'active' : ''}" data-voice="${p}">${p}</button>`).join('')}</div>
      <label class="form-check"><input type="checkbox" id="fxMon" ${s.monitor ? 'checked' : ''}/> 耳返（从耳机/音箱听到自己的声音）</label>
      <div class="pop-sub">输入设备</div>
      <select class="input full" id="fxDev"><option value="">系统默认麦克风</option></select>
      <div class="pop-note">建议戴耳机。外放时如果出现啸叫，请调小人声音量或关闭耳返。</div>`;
    const map = { fxRev: 'reverb', fxRoom: 'room', fxEcho: 'echo', fxDelay: 'delay', fxFb: 'feedback', fxBass: 'bass', fxTreble: 'treble' };
    el.oninput = (e) => {
      const key = map[e.target.id];
      if (!key) return;
      const v = +e.target.value;
      mic.set({ [key]: v, preset: '自定义' });
      saveMic();
      const lab = el.querySelector(`[data-for="${e.target.id}"]`);
      lab.textContent = e.target.id === 'fxRoom' ? v.toFixed(1) + 's' : e.target.id === 'fxDelay' ? Math.round(v * 1000) + 'ms' : ['fxBass', 'fxTreble'].includes(e.target.id) ? (v > 0 ? '+' : '') + v : pct(v);
      el.querySelectorAll('[data-preset]').forEach((c) => c.classList.remove('active'));
      syncMic();
    };
    el.onchange = async (e) => {
      if (e.target.id === 'fxMon') { mic.set({ monitor: e.target.checked }); saveMic(); }
      if (e.target.id === 'fxDev') {
        settings.set('micDevice', e.target.value);
        if (mic.on) { mic.stop(); await mic.start(e.target.value).catch((er) => toast(er.message, 'error')); syncMic(); }
      }
    };
    el.onclick = async (e) => {
      const p = e.target.closest('[data-preset]')?.dataset.preset;
      const v = e.target.closest('[data-voice]')?.dataset.voice;
      if (p) { mic.applyPreset(p); saveMic(); renderPop(); syncMic(); }
      if (v) { mic.set({ voice: v }); saveMic(); renderPop(); }
      if (e.target.closest('[data-mic]')) { await toggleMic(); renderPop(); }
    };
    navigator.mediaDevices?.enumerateDevices().then((ds) => {
      const sel = el.querySelector('#fxDev');
      if (!sel) return;
      const cur = settings.get('micDevice', '');
      ds.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default').forEach((d, i) => {
        const o = new Option(d.label || `麦克风 ${i + 1}`, d.deviceId);
        if (d.deviceId === cur) o.selected = true;
        sel.add(o);
      });
    });
  }
  if (k === 'cheer') {
    const items = [['掌声', '👏'], ['欢呼', '🙌'], ['口哨', '😗'], ['礼炮', '🎉'], ['鼓声', '🥁'], ['笑声', '😄']];
    el.innerHTML = `<div class="pop-title">气氛</div><div class="grid3">${items.map(([n, e]) => `<button class="tile" data-sfx="${n}"><span class="emo">${e}</span>${n}</button>`).join('')}</div>`;
    el.onclick = (e) => {
      const n = e.target.closest('[data-sfx]')?.dataset.sfx;
      if (!n) return;
      SFX[n]();
      if (n === '礼炮' || n === '欢呼') room.cheer();
    };
  }
  if (k === 'light') {
    const cur = room.mode;
    el.innerHTML = `<div class="pop-title">灯光</div><div class="grid3">${Object.keys(LIGHT_MODES).map((m) => `<button class="tile ${m === cur ? 'active' : ''}" data-light="${m}"><span class="swatches">${LIGHT_MODES[m].colors.slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</span>${m}</button>`).join('')}</div>`;
    el.onclick = (e) => {
      const m = e.target.closest('[data-light]')?.dataset.light;
      if (!m) return;
      room.setMode(m);
      settings.set('light', m);
      renderPop();
    };
  }
  if (k === 'song') renderSongPop(el);
}

/* ---------- 当前歌曲选项 ---------- */
function renderSongPop(el) {
  const c = ktv.cur;
  if (!c) { el.innerHTML = '<div class="pop-title">还没有在播放的歌曲</div>'; return; }
  const t = c.track;
  const isLocal = !!t.localItem;
  const canBind = ['catalog', 'lrclib'].includes(c.item.source);
  el.classList.add('pop-wide');
  el.innerHTML = `<div class="pop-title">${esc(c.item.title)}</div>
    <div class="pop-note">${esc([c.item.artist, t.origin, sourceText(t)].filter(Boolean).join(' · '))}</div>
    ${isLocal ? `<div class="pop-sub">伴唱方式</div><div class="chip-row">${[['cancel', '消人声'], ['left', '左声道是伴奏'], ['right', '右声道是伴奏']].map(([m, l]) => `<button class="chip chip-sm ${t.vocalMode === m ? 'active' : ''}" data-vm="${m}">${l}</button>`).join('')}</div>` : ''}
    ${t.lines?.length && c.player.currentTime !== undefined && !c.player.noClock ? `<div class="pop-sub">歌词偏移</div><div class="stepper"><button class="btn btn-sm" data-off="-0.5">提前 0.5s</button><span class="step-val tabular">${(c.lyricOffset || 0) >= 0 ? '+' : ''}${(c.lyricOffset || 0).toFixed(1)}s</span><button class="btn btn-sm" data-off="0.5">推后 0.5s</button></div>` : ''}
    ${canBind ? `<button class="btn btn-sm full" data-bind>${icon('link', 14)}绑定在线 KTV 视频</button>` : ''}
    ${t.lyricInfo ? `<div class="pop-note">歌词来自 LRCLIB #${t.lyricInfo.id}${t.lyricInfo.unsynced ? '（无时间轴，按时长估算）' : ''}</div>` : ''}`;
  el.onclick = (e) => {
    const vm = e.target.closest('[data-vm]')?.dataset.vm;
    if (vm) { closePop(); ktv.setVocalMode(vm); }
    const off = e.target.closest('[data-off]')?.dataset.off;
    if (off) { c.lyricOffset = (c.lyricOffset || 0) - +off; renderPop(); }
    if (e.target.closest('[data-bind]')) { closePop(); bindVideoDialog(c.item, () => ktv.replay()); }
  };
}
function sourceText(t) {
  return { synth: '浏览器合成伴奏', audio: t.instrumental ? '独立伴奏音轨' : '音频', video: '本地视频', youtube: 'YouTube 视频', bilibili: 'B站视频', clock: '清唱模式' }[t.kind] || '';
}
$('#nowBtn').onclick = (e) => openPop('song', e.currentTarget);

/* ---------- 电视屏幕 ---------- */
const tv = $('#tv');
function showStatus(msg) {
  $('#status').classList.toggle('show', !!msg);
  $('#status span').textContent = msg || '';
}

ktv.on('state', (s, msg) => {
  setDock('toggle', s === 'playing' ? 'pause' : 'play', s === 'playing' ? '暂停' : '播放');
  showStatus(s === 'loading' ? msg : s === 'paused' && msg ? msg : '');
  tv.classList.toggle('paused', s === 'paused');
});

ktv.on('queue', (q) => {
  const badge = dock.querySelector('.dock-badge');
  badge.hidden = !q.length;
  badge.textContent = q.length;
  const n = q[0];
  $('#nextUp').innerHTML = n ? `下一首 <b>${esc(n.item.title)}</b>` : '';
});

ktv.on('vocal', (on) => setDock('vocal', null, on ? '原唱' : '伴唱', on));
setDock('vocal', null, ktv.vocalOn ? '原唱' : '伴唱', ktv.vocalOn);
ktv.on('key', (k) => setDock('key', null, k ? `音调 ${k > 0 ? '+' : ''}${k}` : '音调', !!k));
ktv.on('toast', (m, t) => toast(m, t, 4000));
ktv.on('record', (on, item) => {
  setDock('rec', null, on ? '停止' : '录音', on);
  dbtn('rec').classList.toggle('recording', on);
  if (!on && item) toast(`录音已保存（${fmtTime(item.duration)}），在点歌台「录音」里查看`, 'success', 4000);
  if (on) toast('开始录音：伴奏 + 人声 + 音效');
});

ktv.on('track', (c) => {
  closePop();
  if (c) $('#score').classList.remove('show');
  $('#noacc').classList.remove('show');
  tv.classList.toggle('has-track', !!c);
  if (!c) {
    lyrics.setLines([]);
    lane.setNotes([]);
    $('#nowBtn .now-title').textContent = '—';
    $('#nowBtn .now-artist').textContent = '';
    $('.tv-bg').style.backgroundImage = '';
    $('#credit').textContent = '';
    tv.dataset.kind = '';
    return;
  }
  $('#nowBtn .now-title').textContent = c.item.title;
  $('#nowBtn .now-artist').textContent = c.item.artist || '';
  if (c.loading) return;
  const t = c.track;
  tv.dataset.kind = t.kind;
  lyrics.setLines(t.kind === 'bilibili' ? [] : t.lines);
  lane.setNotes(settings.get('showPitch', true) ? t.notes : []);
  lane.resize();
  const bg = t.background || t.cover;
  $('.tv-bg').style.backgroundImage = bg ? `url("${bg}")` : '';
  $('#credit').textContent = [t.origin, t.kind === 'clock' && t.lyricInfo ? '歌词：LRCLIB' : ''].filter(Boolean).join(' · ');
  if (t.noAccomp) showNoAcc(c);
  if (t.kind === 'bilibili') toast('B站播放器无法同步进度：唱完请按「切歌」');
  if (!t.lines?.length && t.kind !== 'bilibili') toast('没有找到这首歌的歌词', 'info');
});

function showNoAcc(c) {
  const box = $('#noacc');
  const hasLyrics = c.track.lines.length > 0;
  box.innerHTML = `<div class="noacc-card"><div class="noacc-title">${hasLyrics ? '清唱模式' : '没有找到伴奏和歌词'}</div>
    <div class="noacc-sub">《${esc(c.item.title)}》在本地歌库里没有音频。${hasLyrics ? '歌词已从 LRCLIB 载入，会按时间轴滚动。' : ''}你可以：</div>
    <div class="row-gap center"><button class="btn btn-primary btn-sm" data-na="bind">${icon('link', 14)}绑定 KTV 视频</button><button class="btn btn-sm" data-na="local">${icon('folder', 14)}添加本地歌曲</button><button class="btn btn-sm" data-na="go">${hasLyrics ? '继续清唱' : '关闭'}</button></div></div>`;
  box.classList.add('show');
  box.onclick = async (e) => {
    const a = e.target.closest('[data-na]')?.dataset.na;
    if (!a) return;
    box.classList.remove('show');
    if (a === 'bind') bindVideoDialog(c.item, () => ktv.replay());
    if (a === 'local') book.open('local');
    if (a === 'go') ktv.play();
  };
}

ktv.on('result', (r) => {
  const box = $('#score');
  if (!r.sung || r.mode === 'none') {
    if (!mic.on) toast('打开麦克风就能给演唱打分了');
    return;
  }
  const s = r.score;
  const grade = s >= 95 ? 'SSS' : s >= 90 ? 'SS' : s >= 80 ? 'S' : s >= 70 ? 'A' : s >= 60 ? 'B' : 'C';
  const words = s >= 90 ? '天籁之音！' : s >= 80 ? '太好听了！' : s >= 70 ? '唱得不错！' : s >= 60 ? '继续加油！' : '勇气可嘉！';
  box.innerHTML = `<div class="score-card"><div class="score-grade">${grade}</div><div class="score-num tabular">${s}<small>分</small></div><div class="score-words">${words}</div><div class="score-sub">${esc(r.item.title)} · ${r.mode === 'pitch' ? '音准评分' : '演唱完整度'}</div></div>`;
  box.classList.add('show');
  if (s >= 80) { SFX.欢呼(); room.cheer(); } else SFX.掌声();
  setTimeout(() => box.classList.remove('show'), 6000);
});

/* ---------- 进度条 ---------- */
$('#bar').addEventListener('click', (e) => {
  const c = ktv.cur;
  if (!c || c.player.noClock) return;
  const r = e.currentTarget.getBoundingClientRect();
  ktv.seek(((e.clientX - r.left) / r.width) * (c.track.duration || c.player.duration));
});

/* ---------- 主循环 ---------- */
let lastT = performance.now();
let lastRating = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const c = ktv.cur;
  const playing = ktv.status === 'playing';
  room.frame(dt, playing);
  const p = mic.on ? mic.pitch() : null;
  if (c) {
    const t = ktv.time;
    if (!c.player.noClock) lyrics.render(t);
    if (playing && !c.player.noClock) {
      const rating = c.scorer.update(t, p, ktv.key);
      if (rating && mic.on && now - lastRating > 600) { lastRating = now; showRating(rating); }
    }
    lane.render(t, ktv.key, p, c.scorer);
    const dur = c.track.duration || c.player.duration || 0;
    const ct = c.player.currentTime;
    $('#bar i').style.width = dur ? Math.min(100, (ct / dur) * 100) + '%' : '0';
    $('#tCur').textContent = fmtTime(ct);
    $('#tDur').textContent = c.player.noClock ? '--:--' : fmtTime(dur);
    const ls = $('#liveScore');
    const show = mic.on && c.scorer.mode === 'pitch';
    ls.textContent = show ? c.scorer.score + ' 分' : '';
  } else {
    $('#bar i').style.width = '0';
    $('#tCur').textContent = '0:00';
    $('#tDur').textContent = '0:00';
  }
  const lv = mic.level();
  $('#micPill .meter i').style.transform = `scaleX(${lv})`;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function showRating(r) {
  if (r.label === 'MISS') return;
  const el = $('#rating');
  el.textContent = r.label;
  el.dataset.l = r.label;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

// 留给房间画布：电视屏幕位置（用于光晕）
function measureTv() {
  const r = tv.getBoundingClientRect();
  room.tvRect = { x: r.left, y: r.top, w: r.width, h: r.height };
  lane.resize();
  lyrics.invalidate();
}
new ResizeObserver(measureTv).observe(tv);

/* ---------- 时钟 ---------- */
function tick() {
  const d = new Date();
  const s = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  $('#clock').textContent = s;
  $('#idleClock').textContent = s;
}
tick();
setInterval(tick, 10000);

/* ---------- 空闲页按钮 ---------- */
$$('[data-open]').forEach((b) => (b.onclick = () => { unlock(); book.open(b.dataset.open); }));

/* ---------- 全屏 / 设置 ---------- */
$('#btnFull').onclick = toggleFull;
function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$('#btnSettings').onclick = () => {
  const m = modal({
    title: '设置',
    body: `<div class="form">
      <div class="form-row"><span class="form-label">包厢名称</span><input class="input" id="sName" value="${esc(settings.get('roomName', '我的KTV'))}" /></div>
      <div class="form-row"><span class="form-label">包厢号</span><input class="input" id="sSub" value="${esc(settings.get('roomSub', 'VIP 888 包厢'))}" /></div>
      <div class="form-row"><span class="form-label">默认模式</span><select class="input" id="sVocal"><option value="0">伴唱（KTV 默认）</option><option value="1" ${settings.get('defaultVocal') ? 'selected' : ''}>原唱</option></select></div>
      <label class="form-check"><input type="checkbox" id="sPitch" ${settings.get('showPitch', true) ? 'checked' : ''}/> 显示音高轨道（有音高数据的歌曲）</label>
      <div class="form-row"><span class="form-label">GitHub 加速</span><input class="input" id="sMirror" placeholder="可选，例如 https://ghfast.top/" value="${esc(settings.get('githubMirror', ''))}" /></div>
      <label class="form-check"><input type="checkbox" id="sLocalOpen" ${settings.get('opensongsLocal') ? 'checked' : ''}/> 开源曲库使用本地副本（先运行 npm run download:opensongs）</label>
      <div class="modal-msg about">
        <b>曲库与数据来源</b><br>
        · 内置曲目：公版旋律 + 本项目原创填词，浏览器实时合成伴奏<br>
        · 开源曲库：<a href="https://github.com/UltraStar-Deluxe/songs" target="_blank" rel="noopener">UltraStar-Deluxe/songs</a>，各曲目按其 CC 授权使用<br>
        · 在线歌词：<a href="https://lrclib.net" target="_blank" rel="noopener">LRCLIB</a> 开放同步歌词库<br>
        · 在线视频：B站 / YouTube 官方嵌入播放器，链接由你自己粘贴<br><br>
        <b>快捷键</b>：空格 播放/暂停 · N 切歌 · R 重唱 · S 点歌 · V 原唱/伴唱 · M 开关麦 · ↑↓ 升降调 · F 全屏
      </div></div>`,
    actions: [
      { label: '取消' },
      {
        label: '保存',
        primary: true,
        onClick: (b) => {
          settings.set('roomName', $('#sName', b).value.trim() || '我的KTV');
          settings.set('roomSub', $('#sSub', b).value.trim());
          settings.set('defaultVocal', $('#sVocal', b).value === '1');
          settings.set('showPitch', $('#sPitch', b).checked);
          settings.set('githubMirror', $('#sMirror', b).value.trim());
          settings.set('opensongsLocal', $('#sLocalOpen', b).checked);
          $('.room-name').textContent = settings.get('roomName');
          $('.room-sub').textContent = settings.get('roomSub');
          toast('已保存', 'success');
        },
      },
    ],
  });
  return m;
};

/* ---------- 快捷键 ---------- */
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); ktv.toggle(); }
  else if (k === 'n') ktv.next();
  else if (k === 'r') ktv.replay();
  else if (k === 's') { e.preventDefault(); book.open(); }
  else if (k === 'v') ktv.setVocal(!ktv.vocalOn);
  else if (k === 'm') toggleMic();
  else if (k === 'f') toggleFull();
  else if (e.key === 'ArrowUp') { e.preventDefault(); ktv.setKey(ktv.key + 1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); ktv.setKey(ktv.key - 1); }
  else if (e.key === 'Escape') { if (pop) closePop(); else if (book.isOpen) book.close(); }
});

/* ---------- 启动 ---------- */
engine.init().then(() => {
  engine.setMusicVolume(settings.get('vMusic', 0.8));
  engine.sfxIn.gain.value = settings.get('vSfx', 0.7);
});
local.init();
syncMic();

// 开发调试用
window.__ktv = { ktv, mic, engine, room };
