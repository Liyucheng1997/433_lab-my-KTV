export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

let host;
export function toast(msg, type = 'info', ms = 2600) {
  host ||= Object.assign(document.createElement('div'), { className: 'toast-host' });
  if (!host.isConnected) document.body.appendChild(host);
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, ms);
}

export function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

/** 简单弹窗 */
export function modal({ title, body, actions = [] }) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-header"><span>${esc(title)}</span><button class="modal-x" aria-label="关闭">✕</button></div><div class="modal-body"></div><div class="modal-footer"></div></div>`;
  const b = ov.querySelector('.modal-body');
  if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  const close = () => ov.remove();
  ov.querySelector('.modal-x').onclick = close;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  const foot = ov.querySelector('.modal-footer');
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (a.primary ? ' btn-primary' : '');
    btn.textContent = a.label;
    btn.onclick = async () => { if ((await a.onClick?.(b)) !== false) close(); };
    foot.appendChild(btn);
  }
  if (!actions.length) foot.remove();
  document.body.appendChild(ov);
  return { el: ov, body: b, close };
}
