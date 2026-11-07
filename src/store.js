// 设置（localStorage）与本地数据库（IndexedDB）。
import { get, set, del, keys, createStore } from 'idb-keyval';

const LS_KEY = 'myktv.settings';
let data = {};
try { data = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch {}

const listeners = new Set();
export const settings = {
  get: (k, d) => (k in data ? data[k] : d),
  set(k, v) {
    data[k] = v;
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
    listeners.forEach((f) => f(k, v));
  },
  on: (f) => listeners.add(f),
};

const store = createStore('myktv', 'kv');
export const kv = {
  get: (k) => get(k, store).catch(() => undefined),
  set: (k, v) => set(k, v, store).catch((e) => console.warn('保存失败', e)),
  del: (k) => del(k, store).catch(() => {}),
  keys: () => keys(store).catch(() => []),
};
