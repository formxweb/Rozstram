// Uçtan uca şifreli sohbet (WebCrypto).
// Her cihaz bir ECDH P-256 anahtar çifti üretir; gizli anahtar dışa aktarılamaz ve sadece bu cihazın IndexedDB'sinde durur.
// Her mesaj rastgele bir AES-GCM anahtarıyla şifrelenir; bu anahtar sohbetteki her cihaz için ECDH ile türetilen anahtarla ayrıca sarılır.
// Sunucu sadece şifreli metni ve açık anahtarları görür.
import { uuid } from './backend.js';

const DB_NAME = 'rozstram-e2ee';
const STORE = 'keys';
const enc = new TextEncoder();
const dec = new TextDecoder();

export const e2eeSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof indexedDB !== 'undefined';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  try {
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  } finally { db.close(); }
}
const idbGet = (k) => idbDo('readonly', (s) => s.get(k));
const idbSet = (k, v) => idbDo('readwrite', (s) => s.put(v, k));

function b64(buf) {
  const a = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function deviceLabel() {
  const ua = navigator.userAgent || '';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Cihaz';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return (os + (br ? ' · ' + br : '')).slice(0, 60);
}

/** Bu cihazın anahtarını hazırlar (yoksa üretip açık anahtarı sunucuya kaydeder). */
export async function ensureDevice(sb, uid) {
  const k = 'dev:' + uid;
  const rec = await idbGet(k).catch(() => null);
  if (rec && rec.id && rec.priv) {
    const { data } = await sb.from('device_keys').select('id').eq('id', rec.id);
    if (data && data.length) return rec;
  }
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const jwk = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y };
  // en fazla 10 cihaz: doluysa en eski cihazımı çıkar
  const { data: mine } = await sb.from('device_keys').select('id, created_at').eq('user_id', uid);
  if (mine && mine.length >= 10) {
    const old = mine.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).slice(0, mine.length - 9);
    await sb.from('device_keys').delete().in('id', old.map((x) => x.id));
  }
  const id = uuid();
  const { error } = await sb.from('device_keys').insert({ id, user_id: uid, public_key: jwk, label: deviceLabel() });
  if (error) throw error;
  const fresh = { id, priv: kp.privateKey, pub: jwk };
  await idbSet(k, fresh);
  return fresh;
}

/* ------------------------------------------------ açık anahtarlar (kısa süreli önbellek) */
const keyCache = { byUser: {}, byId: {} };
export async function keysFor(sb, uids, fresh) {
  const now = Date.now();
  const need = uids.filter((u) => fresh || !keyCache.byUser[u] || now - keyCache.byUser[u].at > 30000);
  if (need.length) {
    const { data, error } = await sb.from('device_keys').select('id, user_id, public_key, label, created_at').in('user_id', need);
    if (error) throw error;
    need.forEach((u) => { keyCache.byUser[u] = { at: now, list: [] }; });
    (data || []).forEach((r) => { keyCache.byUser[r.user_id].list.push(r); keyCache.byId[r.id] = r; });
  }
  return uids.reduce((out, u) => out.concat((keyCache.byUser[u] && keyCache.byUser[u].list) || []), []);
}
async function keyById(sb, id) {
  if (keyCache.byId[id]) return keyCache.byId[id];
  const { data } = await sb.from('device_keys').select('id, user_id, public_key').eq('id', id);
  if (data && data[0]) keyCache.byId[id] = data[0];
  return keyCache.byId[id] || null;
}

const pairCache = new Map();
async function pairKey(dev, devId, pubJwk) {
  const ck = dev.id + ':' + devId;
  const priv = dev.priv;
  if (pairCache.has(ck)) return pairCache.get(ck);
  const p = (async () => {
    const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: pubJwk.x, y: pubJwk.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  })();
  pairCache.set(ck, p);
  return p;
}

/** Mesajı sohbetteki tüm cihazlar için şifreler. */
export async function encryptFor(dev, devices, payload) {
  const ck = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ck, enc.encode(JSON.stringify(payload)));
  const raw = await crypto.subtle.exportKey('raw', ck);
  const k = {};
  for (const d of devices) {
    const wk = await pairKey(dev, d.id, d.public_key);
    const wiv = crypto.getRandomValues(new Uint8Array(12));
    const w = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, wk, raw);
    k[d.id] = b64(wiv) + '.' + b64(w);
  }
  return { v: 1, d: dev.id, iv: b64(iv), ct: b64(ct), k };
}

/** Şifreli mesajı bu cihazda açar. Bu cihaz için anahtar yoksa 'old' hatası verir. */
export async function decryptEnc(sb, dev, e) {
  if (!e || !e.k || !e.k[dev.id]) { const err = new Error('old'); err.code = 'old'; throw err; }
  const sender = await keyById(sb, e.d);
  if (!sender) { const err = new Error('nokey'); err.code = 'old'; throw err; }
  const [wiv, w] = e.k[dev.id].split('.');
  const wk = await pairKey(dev, sender.id, sender.public_key);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(wiv) }, wk, unb64(w));
  const ck = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, ck, unb64(e.ct));
  return JSON.parse(dec.decode(pt));
}

/** İki kişinin bütün cihaz anahtarlarından ortak güvenlik kodu (iki tarafta da aynı çıkar). */
export async function safetyCode(devices) {
  const s = devices.map((d) => d.user_id + ':' + d.public_key.x + ':' + d.public_key.y).sort().join('|');
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  const groups = [];
  for (let i = 0; i < 24; i += 4) {
    const n = ((h[i] << 24) >>> 0) + (h[i + 1] << 16) + (h[i + 2] << 8) + h[i + 3];
    groups.push(String(n % 100000).padStart(5, '0'));
  }
  return groups;
}
