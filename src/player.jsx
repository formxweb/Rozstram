// Müzik çalar (tek ses) ve küçük görünüm parçaları — akış, Reels ve hikayeler kullanır.
import { useEffect } from 'react';
import { useApp } from './ctx.js';
import { musicUrl } from './lib.js';
import { Icon } from './ui.jsx';

export const SEGMENT = 15; // hikaye/gönderi için seçilen parça uzunluğu (sn)

/* ------------------------------------------------------------ tek ses çalar */
// Uygulamada aynı anda tek müzik çalar. Akışta, Reels'te ve hikayede görünen içerik müziği buradan çalar.
let audio = null;
let owner = null;
let seg = null;
function player() {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.loop = true;
    audio.addEventListener('timeupdate', () => {
      if (seg && seg.dur && audio.currentTime >= seg.start + seg.dur) audio.currentTime = seg.start;
    });
  }
  return audio;
}
export function playMusic(key, m, opts) {
  if (!m || !m.url) return;
  const a = player();
  if (owner !== key) {
    owner = key;
    seg = { start: Number(m.start) || 0, dur: opts && opts.full ? 0 : Number(m.dur) || SEGMENT };
    a.src = musicUrl(m);
    try { a.currentTime = seg.start; } catch (e) { /* meta gelince */ }
    a.onloadedmetadata = () => { if (owner === key && a.currentTime < seg.start) a.currentTime = seg.start; };
  }
  const p = a.play();
  if (p && p.catch) p.catch(() => {});
}
export function pauseMusic(key) {
  if (audio && (!key || owner === key)) audio.pause();
}
export function stopMusic(key) {
  if (audio && (!key || owner === key)) { audio.pause(); owner = null; }
}

/** İçerik görünürken ve ses açıkken müziğini çal */
export function useMusic(m, active, key) {
  const app = useApp();
  const on = !!(m && m.url && active && app.sound);
  useEffect(() => {
    if (!m || !m.url) return undefined;
    if (on) playMusic(key, m); else pauseMusic(key);
    return () => pauseMusic(key);
  }, [on, key, m && m.url, m && m.start]);
}

/* ------------------------------------------------------------ görünüm parçaları */
const COLORS = [['#ff7a59', '#ffb347'], ['#7f5af0', '#2cb67d'], ['#ff4d8d', '#7a5cff'], ['#00b4d8', '#90e0ef'], ['#f72585', '#4361ee'],
  ['#2a9d8f', '#e9c46a'], ['#e76f51', '#f4a261'], ['#06d6a0', '#118ab2'], ['#ef476f', '#ffd166'], ['#3a0ca3', '#4cc9f0']];
export const hash = (s) => { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

export function MusicCover({ m, size, playing }) {
  const c = COLORS[hash(m && (m.id || m.title)) % COLORS.length];
  return (
    <span className={'mus-cover' + (playing ? ' playing' : '')} style={{ width: size || 48, height: size || 48, background: 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')' }}>
      {playing ? <span className="eq"><i /><i /><i /></span> : <Icon n="music" size={Math.round((size || 48) * 0.42)} />}
    </span>
  );
}

/** "♪ Şarkı · Sanatçı" satırı */
export function MusicTag({ m, onClick, dark }) {
  if (!m) return null;
  return (
    <button className={'mus-tag' + (dark ? ' dark' : '')} onClick={(e) => { e.stopPropagation(); if (onClick) onClick(); }} aria-label={'Müzik: ' + m.title}>
      <Icon n="music" size={12} /><span className="t">{m.title}{m.artist ? ' · ' + m.artist : ''}</span>
    </button>
  );
}

