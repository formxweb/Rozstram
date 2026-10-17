/* Rozstram — ortak yardımcılar */
import { CONFIG } from './backend.js';

export const DAY = 864e5;
export const HOUR = 36e5;
export const MAX_UPLOAD = 50 * 1024 * 1024;
export const USERNAME_RE = /^(?=.*[a-z])(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{3,30}$/;
export const QUICK_EMOJIS = ['😂', '😮', '😍', '😢', '👏', '🔥', '🎉', '💯'];
export const COMMENT_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];
export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

export const FILTERS = [
  { id: 'none', name: 'Doğal', css: '' },
  { id: 'canli', name: 'Canlı', css: 'contrast(1.12) saturate(1.45)' },
  { id: 'sicak', name: 'Sıcak', css: 'sepia(.25) saturate(1.3) contrast(1.05) brightness(1.03)' },
  { id: 'soguk', name: 'Soğuk', css: 'hue-rotate(-14deg) saturate(1.05) brightness(1.06) contrast(1.05)' },
  { id: 'pastel', name: 'Pastel', css: 'brightness(1.12) saturate(.8) contrast(.9)' },
  { id: 'retro', name: 'Retro', css: 'sepia(.45) contrast(.95) brightness(1.05) saturate(1.2)' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.35) brightness(.92) saturate(1.1)' },
  { id: 'sb', name: 'Siyah-Beyaz', css: 'grayscale(1) contrast(1.15)' },
];

export const ADJUSTS = [
  { id: 'b', name: 'Parlaklık', min: -50, max: 50 },
  { id: 'c', name: 'Kontrast', min: -50, max: 50 },
  { id: 's', name: 'Doygunluk', min: -50, max: 50 },
  { id: 'w', name: 'Sıcaklık', min: 0, max: 50 },
];

export function filterCss(f, adj) {
  const base = (FILTERS.find((x) => x.id === f) || FILTERS[0]).css;
  const parts = base ? [base] : [];
  if (adj) {
    if (adj.b) parts.push('brightness(' + (1 + adj.b / 100) + ')');
    if (adj.c) parts.push('contrast(' + (1 + adj.c / 100) + ')');
    if (adj.s) parts.push('saturate(' + (1 + adj.s / 100) + ')');
    if (adj.w) parts.push('sepia(' + adj.w / 100 + ')');
  }
  return parts.length ? parts.join(' ') : undefined;
}
export const postFilter = (p) => (p ? filterCss(p.filter, p.adjust) : undefined);

export const STORY_BGS = [
  'linear-gradient(160deg,#ff9a3c,#ff2e6e 55%,#8a2be2)',
  'linear-gradient(160deg,#00c6ff,#0057ff)',
  'linear-gradient(160deg,#0f9b8e,#3be38a)',
  'linear-gradient(160deg,#1c1c22,#4a4a58)',
  'linear-gradient(160deg,#f7971e,#ffd200)',
  'linear-gradient(160deg,#fc5c7d,#6a82fb)',
];
export const STORY_FONTS = [
  { id: 'klasik', name: 'Klasik' },
  { id: 'modern', name: 'Modern' },
  { id: 'neon', name: 'Neon' },
  { id: 'daktilo', name: 'Daktilo' },
];
export const TEXT_COLORS = ['#ffffff', '#111111', '#ffd23f', '#ff2e6e', '#2bd9a0', '#3ea6ff', '#b13cff'];

export const CATEGORIES = [
  { id: 'doga', name: 'Doğa', tags: ['doğa', 'trekking', 'bahar', 'çöl', 'dağ'] },
  { id: 'yemek', name: 'Yemek', tags: ['kahvaltı', 'pazar', 'kahve', 'yemek', 'tarif'] },
  { id: 'sehir', name: 'Şehir', tags: ['istanbul', 'gece', 'şehir', 'boğaz'] },
  { id: 'sanat', name: 'Sanat', tags: ['sanat', 'soyut', 'animasyon', 'bokeh'] },
  { id: 'seyahat', name: 'Seyahat', tags: ['seyahat', 'kaş', 'deniz', 'günbatımı'] },
];

export function tagsOf(text) {
  return ((text || '').toLocaleLowerCase('tr').match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1));
}
export function mentionsOf(text) {
  return ((text || '').toLowerCase().match(/@[a-z0-9._]+/g) || []).map((t) => t.slice(1).replace(/\.$/, ''));
}

export const mediaUrl = (ref) => {
  if (!ref) return '';
  if (/^(blob:|data:|https?:)/.test(ref)) return ref;
  return (CONFIG.url || '') + '/storage/v1/object/public/media/' + ref;
};
export const onKeys = (m) => Object.keys(m || {}).filter((k) => m[k] > 0);
export const isOn = (m, k) => !!(m && k && m[k] > 0);
export const errCode = (e) => (e && e.code) || 'unknown';
export const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export function ago(ts, long) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return long ? 'az önce' : 'şimdi';
  const m = Math.floor(s / 60);
  if (m < 60) return long ? m + ' dakika önce' : m + ' dk';
  const hr = Math.floor(m / 60);
  if (hr < 24) return long ? hr + ' saat önce' : hr + ' sa';
  const d = Math.floor(hr / 24);
  if (d < 7) return long ? d + ' gün önce' : d + ' g';
  if (long) return new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  return Math.floor(d / 7) + ' hf';
}

export function sectionOf(ts) {
  const now = Date.now();
  if (new Date(ts).toDateString() === new Date(now).toDateString()) return 'Bugün';
  if (now - ts < 7 * DAY) return 'Bu hafta';
  if (now - ts < 30 * DAY) return 'Bu ay';
  return 'Daha önce';
}

export function fmt(n) {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' Mn';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace('.0', '').replace('.', ',') + ' B';
  return n.toLocaleString('tr-TR');
}

const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');
export function slugify(s) {
  return (s || '')
    .toLowerCase()
    .split('\u0131').join('i').split('\u011f').join('g').split('\u00fc').join('u').split('\u015f').join('s').split('\u00f6').join('o').split('\u00e7').join('c')
    .normalize('NFD').replace(COMBINING, '')
    .replace(/\s+/g, '.').replace(/[^a-z0-9._]/g, '').replace(/\.{2,}/g, '.').replace(/^\./, '').slice(0, 30);
}

function hashColor(s) {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  const hues = [12, 340, 262, 200, 150, 36, 300];
  return 'hsl(' + hues[x % hues.length] + ' 68% 55%)';
}
export function initialsAvatar(name, seed) {
  const letter = ((name || '?').trim()[0] || '?').toLocaleUpperCase('tr').replace(/[<&>"]/g, '');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="' + hashColor(seed || name || '') +
    '"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">' + letter + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem('roz:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('roz:' + k, JSON.stringify(v)); } catch (e) { /* depolama kapalı olabilir */ } },
};

export function haptic(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* desteklenmiyor */ }
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; }
}

function loadImage(url) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('image')); img.src = url; });
}

/** Fotoğrafı küçültür ve (aspect verilirse) ortadan kırpar. */
// Seçilen dosyayı hemen belleğe kopyalar. Android Chrome, galeriden seçilen dosya sonradan
// "değişmiş" görünürse yüklemeyi sunucuya göndermeden keser (ERR_UPLOAD_FILE_CHANGED);
// bellekteki kopya bundan etkilenmez.
export async function snapshotFile(f) {
  if (!f || typeof f.arrayBuffer !== 'function') return f;
  const buf = await f.arrayBuffer();
  return new File([buf], f.name || 'dosya', { type: f.type || 'application/octet-stream', lastModified: Date.now() });
}

export async function compressImage(file, max, aspect) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (aspect) {
      const cur = sw / sh;
      if (cur > aspect) { const nw = sh * aspect; sx = (sw - nw) / 2; sw = nw; }
      else if (cur < aspect) { const nh = sw / aspect; sy = (sh - nh) / 2; sh = nh; }
    }
    const scale = Math.min(1, (max || 1440) / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    if (!blob) throw new Error('encode');
    return { blob, w, h };
  } finally { URL.revokeObjectURL(url); }
}

/** Videonun boyutunu, süresini ve kapak karesini çıkarır. */
export async function videoInfo(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((res) => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 5000); });
    try {
      v.currentTime = Math.min(0.6, (v.duration || 1) / 2);
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 2000); });
    } catch (e) { /* kapak alınamazsa sorun değil */ }
    const w = v.videoWidth || 720, h = v.videoHeight || 1280;
    let thumb = null;
    try {
      const scale = Math.min(1, 720 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      thumb = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
    } catch (e) { thumb = null; }
    return { w, h, duration: v.duration || 0, thumb };
  } finally { URL.revokeObjectURL(url); }
}

/** Türkiye numaralarını +90 biçimine çevirir (sunucudaki norm_phone ile aynı) */
export function normPhone(p) {
  const raw = String(p || '').trim();
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (raw[0] === '+') return '+' + d;
  if (d.slice(0, 2) === '00') return '+' + d.slice(2);
  if (d.length === 11 && d[0] === '0') return '+90' + d.slice(1);
  if (d.length === 10 && d[0] === '5') return '+90' + d;
  if (d.length === 12 && d.slice(0, 2) === '90') return '+' + d;
  return '+' + d;
}

/** Telefonun paylaşım menüsünü açar; yoksa bağlantıyı kopyalar */
export async function shareLink(title, url) {
  try {
    if (navigator.share) { await navigator.share({ title, url }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  return (await copyText(url)) ? 'copied' : 'fail';
}

export const omit = (o, k) => { const n = { ...(o || {}) }; delete n[k]; return n; };
