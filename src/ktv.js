// 包厢控制器：已点队列、当前播放、原唱/伴唱、升降调、打分、录音。
import { engine } from './audio/engine.js';
import { mic } from './audio/mic.js';
import { SynthPlayer } from './players/synthPlayer.js';
import { MediaPlayer } from './players/mediaPlayer.js';
import { YouTubePlayer, BilibiliPlayer, ClockPlayer } from './players/embedPlayer.js';
import { resolveTrack, fetchLyricsLater } from './library.js';
import { local } from './sources/local.js';
import { settings, kv } from './store.js';

class Emitter {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= new Set()).add(f); return () => this.h[e].delete(f); }
  emit(e, ...a) { this.h[e]?.forEach((f) => { try { f(...a); } catch (err) { console.error(err); } }); }
}

let uidSeq = 1;

export class Scorer {
  constructor(track) {
    this.notes = (track.notes || []).map((n) => ({ ...n, frames: 0, hits: 0 }));
    this.lines = (track.lines || []).map((l) => ({ ...l, frames: 0, hits: 0, done: false }));
    this.mode = this.notes.length ? 'pitch' : this.lines.length ? 'voice' : 'none';
    this.ni = 0;
    this.li = 0;
    this.last = { t: -1 };
  }

  /** p: 麦克风音高 { midi, clarity, rms }；key：当前升降调；返回刚结束的行评价 */
  update(t, p, key = 0) {
    let lineDone = null;
    const voiced = p && p.rms > 0.02;
    if (this.mode === 'pitch') {
      while (this.ni < this.notes.length && this.notes[this.ni].t + this.notes[this.ni].d < t) this.ni++;
      const n = this.notes[this.ni];
      if (n && t >= n.t) {
        n.frames++;
        if (voiced && p.midi != null && p.clarity > 0.8) {
          let diff = (p.midi - (n.midi + key)) % 12;
          if (diff > 6) diff -= 12;
          if (diff < -6) diff += 12;
          this.lastDiff = diff;
          if (Math.abs(diff) <= 1.1) n.hits++;
        }
      }
    }
    while (this.li < this.lines.length && this.lines[this.li].end < t) {
      const l = this.lines[this.li++];
      if (!l.done) { l.done = true; lineDone = this.lineRating(l); }
    }
    const l = this.lines[this.li];
    if (l && t >= l.start) {
      l.frames++;
      if (voiced) l.hits++;
    }
    return lineDone;
  }

  lineRating(l) {
    let r;
    if (this.mode === 'pitch') {
      const ns = this.notes.filter((n) => n.t >= l.start - 0.01 && n.t < l.end);
      r = this.ratio(ns);
    } else r = l.frames ? Math.min(1, l.hits / l.frames / 0.7) : 0;
    const label = r > 0.85 ? 'PERFECT' : r > 0.65 ? 'GREAT' : r > 0.4 ? 'GOOD' : r > 0.15 ? 'OK' : 'MISS';
    return { ratio: r, label };
  }

  ratio(ns) {
    let w = 0, s = 0;
    for (const n of ns) {
      if (!n.frames) continue;
      const wt = n.d * (n.golden ? 2 : 1);
      w += wt;
      s += wt * Math.min(1, n.hits / n.frames / 0.75);
    }
    return w ? s / w : 0;
  }

  /** 已唱部分的实时分数 0..100 */
  get score() {
    if (this.mode === 'pitch') return Math.round(this.ratio(this.notes) * 100);
    let f = 0, h = 0;
    for (const l of this.lines) { f += l.frames; h += l.hits; }
    return f ? Math.round(Math.min(1, h / f / 0.7) * 100) : 0;
  }

  get sungAny() {
    return this.lines.some((l) => l.hits > 5);
  }
}

class Recorder {
  constructor() { this.rec = null; }
  get active() { return !!this.rec; }
  start(title) {
    const stream = engine.recordDest.stream;
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    this.chunks = [];
    this.title = title || '自由演唱';
    this.t0 = Date.now();
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }
  stop() {
    if (!this.rec) return Promise.resolve(null);
    const rec = this.rec;
    this.rec = null;
    return new Promise((resolve) => {
      rec.onstop = async () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
        const item = { key: 'rec:' + this.t0, title: this.title, time: this.t0, duration: (Date.now() - this.t0) / 1000, blob };
        await kv.set(item.key, item);
        resolve(item);
      };
      rec.stop();
    });
  }
  async list() {
    const ks = (await kv.keys()).filter((k) => String(k).startsWith('rec:'));
    const out = [];
    for (const k of ks) out.push(await kv.get(k));
    return out.filter(Boolean).sort((a, b) => b.time - a.time);
  }
  remove(key) { return kv.del(key); }
}

class KTV extends Emitter {
  constructor() {
    super();
    this.queue = [];
    this.history = [];
    this.cur = null; // { uid, item, track, player, scorer }
    this.key = 0;
    this.vocalOn = settings.get('defaultVocal', false);
    this.status = 'idle';
    this.recorder = new Recorder();
    this.favorites = new Set(settings.get('favorites', []));
    this.loadSeq = 0;
    this.nextToken = 0;
  }

  setStatus(s, msg) {
    this.status = s;
    this.emit('state', s, msg);
  }

  add(item, top = false) {
    const q = { uid: uidSeq++, item };
    if (top) this.queue.unshift(q); else this.queue.push(q);
    this.emit('queue', this.queue);
    if (!this.cur && this.status !== 'loading') this.next();
    return q;
  }

  remove(uid) {
    this.queue = this.queue.filter((x) => x.uid !== uid);
    this.emit('queue', this.queue);
  }

  toTop(uid) {
    const i = this.queue.findIndex((x) => x.uid === uid);
    if (i > 0) { const [x] = this.queue.splice(i, 1); this.queue.unshift(x); this.emit('queue', this.queue); }
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.emit('queue', this.queue);
  }

  toggleFavorite(item) {
    const k = item.id;
    if (this.favorites.has(k)) this.favorites.delete(k); else this.favorites.add(k);
    settings.set('favorites', [...this.favorites]);
    const favItems = settings.get('favItems', {});
    if (this.favorites.has(k)) favItems[k] = strip(item); else delete favItems[k];
    settings.set('favItems', favItems);
    this.emit('favorites');
  }

  async next(finished = false) {
    const token = ++this.nextToken;
    const scored = await this.stopCurrent(finished);
    if (scored) {
      // 唱完先展示几秒分数，再切下一首（期间再按切歌会立即继续）
      this.emit('track', null);
      this.setStatus('idle');
      await new Promise((r) => setTimeout(r, 5000));
      if (token !== this.nextToken) return;
    }
    const q = this.queue.shift();
    this.emit('queue', this.queue);
    if (!q) { this.setStatus('idle'); this.emit('track', null); return; }
    await this.start(q);
  }

  async replay() {
    if (!this.cur) return;
    const q = { uid: uidSeq++, item: this.cur.item };
    await this.stopCurrent(false);
    await this.start(q);
  }

  async stopCurrent(finished) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    if (finished || c.scorer?.sungAny) {
      const result = { item: c.item, score: c.scorer?.score ?? 0, mode: c.scorer?.mode, sung: c.scorer?.sungAny, finished };
      this.history.unshift({ ...result, time: Date.now() });
      this.history = this.history.slice(0, 50);
      if (finished) this.emit('result', result);
    }
    try { c.player?.destroy(); } catch {}
    return finished && c.scorer?.sungAny && c.scorer.mode !== 'none';
  }

  async start(q) {
    const seq = ++this.loadSeq;
    await engine.init();
    await engine.resume();
    this.setStatus('loading', '正在准备《' + q.item.title + '》…');
    this.emit('track', { item: q.item, loading: true });
    let track;
    try {
      track = await resolveTrack(q.item, (m) => this.setStatus('loading', m));
      if (seq !== this.loadSeq) return;
      const host = this.videoHost;
      let player;
      switch (track.kind) {
        case 'synth': player = new SynthPlayer(track); break;
        case 'audio':
        case 'video':
          player = new MediaPlayer({ src: track.src, instrumental: track.instrumental, vocalMode: track.vocalMode, video: track.kind === 'video', videoHost: host, revoke: track.revoke });
          break;
        case 'youtube': player = new YouTubePlayer({ id: track.video.id, host }); break;
        case 'bilibili': player = new BilibiliPlayer({ ...track.video, host }); break;
        default: player = new ClockPlayer({ duration: track.duration });
      }
      await player.load();
      if (seq !== this.loadSeq) { player.destroy(); return; }
      track.duration = player.duration || track.duration;
      // 本地歌曲没有 .lrc 时，用时长去 LRCLIB 匹配歌词
      if (track.needLyrics) {
        this.setStatus('loading', '正在匹配歌词…');
        try {
          const ly = await fetchLyricsLater(track, track.duration);
          track.lines = ly.lines;
          track.lyricInfo = ly.lyricInfo;
        } catch {}
        if (seq !== this.loadSeq) { player.destroy(); return; }
      }
      player.setKey?.(this.key);
      player.setVocal?.(this.vocalOn);
      player.onended = () => { if (this.cur?.player === player) this.next(true); };
      this.cur = { uid: q.uid, item: q.item, track, player, scorer: new Scorer(track), lyricOffset: track.lyricOffset || 0 };
      this.emit('track', this.cur);
      // 没有伴奏时先停住，等用户在提示里选择
      if (track.noAccomp) this.setStatus('paused');
      else await this.play();
    } catch (e) {
      console.error(e);
      if (seq !== this.loadSeq) return;
      this.setStatus('error', e.message || String(e));
      this.emit('track', null);
      this.emit('toast', '《' + q.item.title + '》加载失败：' + (e.message || e), 'error');
      setTimeout(() => { if (seq === this.loadSeq && !this.cur && this.queue.length) this.next(); }, 1500);
    }
  }

  async play() {
    if (!this.cur) return;
    await engine.resume();
    try {
      await this.cur.player.play();
      this.setStatus('playing');
    } catch (e) {
      this.setStatus('paused', '点击播放键开始');
    }
  }

  pause() {
    if (!this.cur) return;
    this.cur.player.pause();
    this.setStatus('paused');
  }

  toggle() {
    if (!this.cur) return this.next();
    if (this.status === 'playing') this.pause(); else this.play();
  }

  seek(t) {
    if (!this.cur) return;
    this.cur.player.seek(t);
    this.cur.scorer = new Scorer(this.cur.track);
    this.cur.scorer.ni = this.cur.scorer.notes.findIndex((n) => n.t + n.d >= t);
    if (this.cur.scorer.ni < 0) this.cur.scorer.ni = this.cur.scorer.notes.length;
    this.cur.scorer.li = this.cur.scorer.lines.findIndex((l) => l.end >= t);
    if (this.cur.scorer.li < 0) this.cur.scorer.li = this.cur.scorer.lines.length;
    this.cur.scorer.lines.forEach((l, i) => { if (i < this.cur.scorer.li) l.done = true; });
  }

  setKey(k) {
    this.key = Math.max(-6, Math.min(6, k));
    this.cur?.player.setKey?.(this.key);
    this.emit('key', this.key);
  }

  setVocal(on) {
    this.vocalOn = on;
    this.cur?.player.setVocal?.(on);
    this.emit('vocal', on);
  }

  async setVocalMode(mode) {
    const c = this.cur;
    if (!c?.track.localItem) return;
    await local.update(c.track.localItem, { vocalMode: mode });
    const t = c.player.currentTime;
    // 重新载入播放器以切换声道处理方式
    const q = { uid: uidSeq++, item: c.item };
    await this.stopCurrent(false);
    await this.start(q);
    this.seek(t);
  }

  get time() {
    if (!this.cur) return 0;
    return this.cur.player.currentTime + (this.cur.lyricOffset || 0);
  }

  async toggleRecord() {
    if (this.recorder.active) {
      const item = await this.recorder.stop();
      this.emit('record', false, item);
      return item;
    }
    await engine.init();
    await engine.resume();
    this.recorder.start(this.cur?.item.title);
    this.emit('record', true);
  }

  isFav(item) { return this.favorites.has(item.id); }
}

function strip(item) {
  const { _idx, coverUrl, ...rest } = item;
  return rest;
}

export const ktv = new KTV();
export { mic };
