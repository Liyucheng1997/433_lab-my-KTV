// 在线视频（YouTube / B站官方嵌入播放器）与清唱计时播放器。
// 嵌入播放器的声音不经过网页音频处理，所以这里不能消人声和升降调。

let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytReady = null; reject(new Error('无法连接 YouTube')); };
    document.head.appendChild(s);
  });
  return ytReady;
}

export function parseVideoLink(text) {
  text = (text || '').trim();
  let m = text.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { type: 'youtube', id: m[1], url: `https://www.youtube.com/watch?v=${m[1]}` };
  m = text.match(/\b(BV[0-9A-Za-z]{10})\b/);
  if (m) {
    const p = text.match(/[?&]p=(\d+)/);
    return { type: 'bilibili', id: m[1], page: p ? +p[1] : 1, url: `https://www.bilibili.com/video/${m[1]}` };
  }
  m = text.match(/\bav(\d+)\b/i);
  if (m) return { type: 'bilibili', aid: m[1], page: 1, url: `https://www.bilibili.com/video/av${m[1]}` };
  return null;
}

export class YouTubePlayer {
  constructor({ id, host }) {
    this.id = id;
    this.host = host;
    this.duration = 0;
    this.embedded = true;
    this.onended = null;
  }
  async load() {
    const YT = await loadYT();
    const div = document.createElement('div');
    this.wrap = document.createElement('div');
    this.wrap.className = 'tv-embed';
    this.wrap.appendChild(div);
    this.host.appendChild(this.wrap);
    await new Promise((resolve, reject) => {
      this.p = new YT.Player(div, {
        videoId: this.id,
        playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => { this.duration = this.p.getDuration() || 0; resolve(); },
          onError: (e) => reject(new Error('YouTube 视频无法播放（' + e.data + '）')),
          onStateChange: (e) => { if (e.data === 0) this.onended?.(); if (!this.duration) this.duration = this.p.getDuration() || 0; },
        },
      });
    });
  }
  get currentTime() { return this.p?.getCurrentTime?.() || 0; }
  get playing() { return this.p?.getPlayerState?.() === 1; }
  play() { this.p.playVideo(); }
  pause() { this.p.pauseVideo(); }
  seek(t) { this.p.seekTo(t, true); }
  setVocal() {}
  setKey() {}
  destroy() { try { this.p.destroy(); } catch {} this.wrap?.remove(); }
}

export class BilibiliPlayer {
  constructor({ id, aid, page, host }) {
    Object.assign(this, { id, aid, page, host });
    this.duration = 0;
    this.embedded = true;
    this.noClock = true; // 拿不到播放进度
    this.onended = null;
  }
  async load() {
    this.wrap = document.createElement('div');
    this.wrap.className = 'tv-embed';
    this.host.appendChild(this.wrap);
  }
  play() {
    if (this.frame) return;
    const q = new URLSearchParams({ autoplay: '1', danmaku: '0', high_quality: '1', page: String(this.page || 1) });
    if (this.id) q.set('bvid', this.id); else q.set('aid', this.aid);
    this.frame = document.createElement('iframe');
    this.frame.src = `https://player.bilibili.com/player.html?${q}`;
    this.frame.allow = 'autoplay; fullscreen; encrypted-media';
    this.frame.setAttribute('allowfullscreen', '');
    this.frame.setAttribute('scrolling', 'no');
    this.frame.setAttribute('frameborder', '0');
    this.wrap.appendChild(this.frame);
  }
  pause() {}
  seek() {}
  get currentTime() { return 0; }
  get playing() { return !!this.frame; }
  setVocal() {}
  setKey() {}
  destroy() { this.wrap?.remove(); }
}

/** 清唱：没有伴奏，只按歌词时间轴走 */
export class ClockPlayer {
  constructor({ duration }) {
    this.duration = duration;
    this.offset = 0;
    this.t0 = 0;
    this.playing = false;
    this.onended = null;
  }
  async load() {}
  get currentTime() {
    return this.playing ? Math.min(this.duration, (performance.now() - this.t0) / 1000) : this.offset;
  }
  play() {
    if (this.playing) return;
    this.t0 = performance.now() - this.offset * 1000;
    this.playing = true;
    this.timer = setInterval(() => {
      if (this.currentTime >= this.duration) { this.pause(); this.onended?.(); }
    }, 200);
  }
  pause() {
    if (!this.playing) return;
    this.offset = this.currentTime;
    this.playing = false;
    clearInterval(this.timer);
  }
  seek(t) {
    this.offset = t;
    if (this.playing) this.t0 = performance.now() - t * 1000;
  }
  setVocal() {}
  setKey() {}
  destroy() { this.pause(); }
}
