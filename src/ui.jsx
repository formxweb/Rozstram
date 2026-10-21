import { Fragment, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BackInterceptCtx, ScreenCtx, SheetCtx, useApp, useBack, useSheetClose } from './ctx.js';
import { isOn } from './lib.js';

/* ------------------------------------------------------------------ ikonlar */
const P = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6.5h-5V21H4a1 1 0 0 1-1-1z'],
  search: ['M10.8 18.1a7.3 7.3 0 1 0 0-14.6 7.3 7.3 0 0 0 0 14.6z', 'm20.5 20.5-4.6-4.6'],
  plus: ['M12 5v14M5 12h14'],
  plusSq: ['M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z', 'M12 8v8M8 12h8'],
  reels: ['M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3z', 'M3 8.2h18M8.3 3l3 5.2M14.3 3l3 5.2', 'M10.2 11.6v5.4l4.6-2.7z'],
  heart: ['M12 20.3s-7.6-4.6-9.4-9.3C1.3 7.6 3.5 4.3 7 4.3c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.5 0 5.7 3.3 4.4 6.7-1.8 4.7-9.4 9.3-9.4 9.3z'],
  comment: ['M20.8 11.6a8.6 8.6 0 0 1-12.6 7.6L3.2 20.8l1.6-4.9a8.6 8.6 0 1 1 16-4.3z'],
  send: ['M21.5 3 10.4 13.9', 'M21.5 3l-6.8 18-4.3-7.1L3 10.1z'],
  repost: ['M17 2.5 20.5 6 17 9.5', 'M3.5 11.5V10a4 4 0 0 1 4-4h13', 'M7 21.5 3.5 18 7 14.5', 'M20.5 12.5V14a4 4 0 0 1-4 4h-13'],
  bookmark: ['M6 3.5h12V21l-6-4.6L6 21z'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  moreV: ['M12 5h.01M12 12h.01M12 19h.01'],
  close: ['M6 6l12 12M18 6 6 18'],
  back: ['M15 5l-7 7 7 7'],
  chevDown: ['M6 9l6 6 6-6'],
  chevRight: ['M9 6l6 6-6 6'],
  camera: ['M4 7.5h3.5L9.2 5h5.6l1.7 2.5H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z', 'M12 16.8a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z'],
  grid: ['M3.5 3.5h17v17h-17z', 'M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17'],
  volOn: ['M4 9h3.5L12 5v14l-4.5-4H4z', 'M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4'],
  volOff: ['M4 9h3.5L12 5v14l-4.5-4H4z', 'M16 9.5l5 5M21 9.5l-5 5'],
  play: ['M7 4.6v14.8L19.4 12z'],
  pause: ['M8 5v14M16 5v14'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  trash: ['M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13'],
  image: ['M5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11A2.5 2.5 0 0 1 5.5 4z', 'M8.5 11.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z', 'M21 15.5l-5-5L5 20'],
  multi: ['M8 3h10.5A2.5 2.5 0 0 1 21 5.5V16', 'M5.5 7h10A2.5 2.5 0 0 1 18 9.5v10a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 3 19.5v-10A2.5 2.5 0 0 1 5.5 7z'],
  edit: ['M4 20h4L19.5 8.5l-4-4L4 16z'],
  user: ['M12 12a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6z', 'M4 21c1.4-4 4.4-6.2 8-6.2s6.6 2.2 8 6.2'],
  userPlus: ['M10 12a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6z', 'M2.5 21c1.4-4 4.2-6.2 7.5-6.2 1.6 0 3 .5 4.3 1.4', 'M19 14v6M16 17h6'],
  userX: ['M10 12a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6z', 'M2.5 21c1.4-4 4.2-6.2 7.5-6.2 1.6 0 3 .5 4.3 1.4', 'M16.5 15.5l5 5M21.5 15.5l-5 5'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: ['M3 3l18 18', 'M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.4 6.5A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 4.4-1.1'],
  newmsg: ['M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12', 'M18.5 3.5l2 2L13 13l-3 1 1-3z'],
  link: ['M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2', 'M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2'],
  pin: ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  tag: ['M12 21a9 9 0 1 1 9-9v1.2a2.8 2.8 0 0 1-5.6 0V8', 'M12 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  checkCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 12.3l2.8 2.8L16.3 9.5'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.5V12l3 2'],
  sun: ['M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4'],
  moon: ['M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z'],
  history: ['M3.5 12a8.5 8.5 0 1 0 2.5-6', 'M3.5 4v4h4', 'M12 8v4.2l2.8 1.8'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5.5M12 7.8h.01'],
  music: ['M9 18V5.5l11-2V16', 'M6.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  smile: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8.5 14.5s1.2 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01'],
  reply: ['M9.5 6 4 11.5 9.5 17', 'M4 11.5h9.5a6.5 6.5 0 0 1 6.5 6.5v1'],
  copy: ['M9 9h10.5v11.5H9z', 'M15 9V3.5H4.5V15H9'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  text: ['M5 6V4.5h14V6M12 4.5v15M9 19.5h6'],
  palette: ['M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-1.6a1.9 1.9 0 0 0-1.3 3.2A1.4 1.4 0 0 1 12 21z', 'M7.5 12h.01M10 7.5h.01M15 7.5h.01'],
  sliders: ['M4 7h10M18 7h2M4 17h4M12 17h8', 'M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  crop: ['M6 2.5V18h15.5', 'M2.5 6H18v15.5'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'],
  activity: ['M3 12h4l3-8 4 16 3-8h4'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z'],
  lock: ['M6 11h12v10H6z', 'M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11'],
  share: ['M4 12v7.5h16V12', 'M12 3.5v12M7.5 8 12 3.5 16.5 8'],
  gallery: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  filter: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 3v18', 'M12 3a9 9 0 0 1 0 18'],
  flame: ['M12 21c4 0 7-2.7 7-6.7 0-4.3-3.6-6.4-4.8-10.3-2 2-2.6 4-2.4 6-1.6-.8-2.8-2.4-3-4C6.3 8.4 5 11 5 14.3 5 18.3 8 21 12 21z'],
  flag: ['M5 21V4', 'M5 4.5h11l-2 4 2 4H5'],
  mic: ['M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15z', 'M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3'],
  stop: ['M7 7h10v10H7z'],
  users: ['M9 11.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z', 'M2 20.5c1.2-3.6 3.8-5.6 7-5.6s5.8 2 7 5.6', 'M16 4.2a3.6 3.6 0 0 1 0 7', 'M18.5 15.4c1.6.8 2.8 2.5 3.5 5'],
  mail: ['M3.5 5.5h17v13h-17z', 'M3.5 6.5 12 13l8.5-6.5'],
  phone: ['M7 3h10v18H7z', 'M11 18h2'],
  key: ['M8 15.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'M12 11h9M18 11v3M21 11v2'],
  logout: ['M10 4H5v16h5', 'M15 8l4 4-4 4M19 12H9'],
  shield: ['M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z'],
  thumb: ['M9 3h6l-1 6 3 3v2H7v-2l3-3z', 'M12 14v7'],
  video: ['M3.5 6.5h12v11h-12z', 'M15.5 10.5 21 7.5v9l-5.5-3'],
  note: ['M5 4h14v11l-5 5H5z', 'M14 20v-5h5'],
  plusCircle: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v8M8 12h8'],
  doubleCheck: ['M2.5 12.5 6.5 16.5 14 9', 'M10 16.5l7.5-7.5'],
  verified: ['M12 2.8l2.3 1.7 2.8-.1.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.1L12 21.2l-2.3-1.7-2.8.1-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.1z'],
};

export function Icon({ n, size, fill, stroke, className, style }) {
  const s = size || 26;
  const filled = !!fill && n !== 'more' && n !== 'moreV';
  const sw = n === 'more' || n === 'moreV' ? 3.2 : stroke || 1.9;
  return (
    <svg className={'icon' + (className ? ' ' + className : '')} width={s} height={s} viewBox="0 0 24 24" style={style}
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 1.2 : sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(P[n] || P.info).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** Rozstram marka simgesi: degrade kare içinde parıltı */
export function Mark({ size }) {
  const s = size || 22;
  return <span className="mark" style={{ width: s, height: s, borderRadius: s * 0.3 }} aria-hidden="true"><i /></span>;
}

/* ------------------------------------------------------------------ hook'lar */
export function useInView(ref, threshold) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setV(true); return undefined; }
    const t = threshold || 0.6;
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      setV(e.isIntersecting && e.intersectionRatio >= t);
    }, { threshold: [0, t, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return v;
}

/** Tek dokunuş / çift dokunuş ayrımı */
export function useTaps(onSingle, onDouble) {
  const last = useRef(0);
  const timer = useRef(null);
  const s = useRef(onSingle); s.current = onSingle;
  const d = useRef(onDouble); d.current = onDouble;
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    const t = Date.now();
    if (t - last.current < 280) {
      clearTimeout(timer.current); last.current = 0;
      if (d.current) d.current();
      return;
    }
    last.current = t;
    clearTimeout(timer.current);
    if (s.current) timer.current = setTimeout(() => s.current && s.current(), 280);
  }, []);
}

/** Basılı tutma: { handlers, fired } — fired.current true ise ardından gelen tıklamayı yok say */
/* ------------------------------------------------------------------ telefonun geri tuşu
   Açık katmanlar (sayfa, alt panel, hikaye, onay penceresi…) kendini bu yığına kaydeder;
   geri tuşu en son açılanı kapatır (bkz. app.jsx: popstate). */
const BACK = [];
export function useBackClose(fn, on = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return undefined;
    const entry = () => { if (ref.current) ref.current(); };
    BACK.push(entry);
    return () => { const i = BACK.lastIndexOf(entry); if (i >= 0) BACK.splice(i, 1); };
  }, [on]);
}
/** En üstteki katmanı kapatır; kapatacak bir şey yoksa false */
export function runBack() {
  const top = BACK[BACK.length - 1];
  if (!top) return false;
  top();
  return true;
}
/** Sayfa içindeki adımlar: fn true dönerse geri tuşu sayfayı kapatmaz (adım geri gider) */
export function useBackIntercept(fn) {
  const holder = useContext(BackInterceptCtx);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!holder) return undefined;
    const f = () => ref.current && ref.current();
    holder.current = f;
    return () => { if (holder.current === f) holder.current = null; };
  }, [holder]);
}

export function useLongPress(onLong, ms, onRelease) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const cb = useRef(onLong); cb.current = onLong;
  const rel = useRef(onRelease); rel.current = onRelease;
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  const handlers = {
    onPointerDown: (e) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => { fired.current = true; cb.current && cb.current(e); }, ms || 480);
    },
    onPointerMove: (e) => {
      if (!start.current || !timer.current) return;
      if (Math.abs(e.clientX - start.current.x) > 10 || Math.abs(e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: () => { clear(); if (fired.current && rel.current) rel.current(); },
    onPointerLeave: () => { clear(); if (fired.current && rel.current) rel.current(); },
    onPointerCancel: () => { clear(); if (fired.current && rel.current) rel.current(); },
    onContextMenu: (e) => e.preventDefault(),
  };
  useEffect(() => clear, []);
  return { handlers, fired };
}

/* ------------------------------------------------------------------ temel parçalar */
export function Avatar({ uid, size, ring, online, onClick, src, className }) {
  const app = useApp();
  const s = size || 32;
  const img = <img className="av" src={src || app.avatarOf(uid)} width={s} height={s} alt="" style={{ width: s, height: s }} draggable="false" />;
  let inner = img;
  if (ring) inner = <span className={'ring r-' + ring}><span className="inner">{img}</span></span>;
  const dot = online ? <span className="online" style={{ width: Math.max(10, s * 0.26), height: Math.max(10, s * 0.26) }} /> : null;
  const body = <span className={'av-wrap' + (className ? ' ' + className : '')}>{inner}{dot}</span>;
  if (onClick) return <button className="av-btn" onClick={onClick} aria-label={app.nameOf(uid) + ' profili'}>{body}</button>;
  return body;
}

export function AvatarStack({ ids, size }) {
  const s = size || 20;
  return (
    <span className="av-stack">
      {ids.slice(0, 3).map((u, i) => <Avatar key={u} uid={u} size={s} className={i ? 'stacked' : ''} />)}
    </span>
  );
}

export function Verified({ size }) {
  return (
    <svg className="verified" width={size || 14} height={size || 14} viewBox="0 0 24 24" aria-label="Onaylanmış hesap">
      <path fill="#3897f0" d="M12 2.8l2.3 1.7 2.8-.1.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.1L12 21.2l-2.3-1.7-2.8.1-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.1z" />
      <path d="M8.2 12.3l2.5 2.5 5-5.2" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UName({ uid, onClick, className, plain }) {
  const app = useApp();
  const p = app.profiles[uid];
  const badge = p && p.verified ? <Verified /> : null;
  if (plain) return <span className={'uname ' + (className || '')}>{app.nameOf(uid)}{badge}</span>;
  return <button className={'uname ' + (className || '')} onClick={(e) => { e.stopPropagation(); (onClick || (() => app.openUser(uid)))(); }}>{app.nameOf(uid)}{badge}</button>;
}

/** #etiket ve @kullanıcı bağlantılı metin */
export function RichText({ text }) {
  const app = useApp();
  if (!text) return null;
  const parts = String(text).split(/([#@][\p{L}\p{N}_.]+)/u);
  return (
    <Fragment>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part[0] === '#' && part.length > 1) return <button key={i} className="tag" onClick={(e) => { e.stopPropagation(); app.openTag(part); }}>{part}</button>;
        if (part[0] === '@' && part.length > 1) {
          const uid = app.uidByName(part.slice(1).replace(/\.$/, ''));
          if (uid) return <button key={i} className="tag" onClick={(e) => { e.stopPropagation(); app.openUser(uid); }}>{part}</button>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </Fragment>
  );
}

export function Vid({ src, poster, filter, playing, className, loop, onEnded, onMeta, onProgress, onWatched, vref, forceMute }) {
  const app = useApp();
  const ref = useRef(null);
  const watched = useRef(false);
  useEffect(() => { watched.current = false; }, [src]);
  const muted = forceMute || !app.sound;
  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) {
      v.muted = muted;
      const p = v.play();
      if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); });
    } else v.pause();
  }, [playing, src]);
  return (
    <video ref={(el) => { ref.current = el; if (vref) vref.current = el; }} src={src} poster={poster || undefined} muted={muted} playsInline
      loop={loop !== false} preload="metadata" className={className || 'fill'} style={filter ? { filter } : undefined}
      onEnded={onEnded} onLoadedMetadata={onMeta} disablePictureInPicture
      onTimeUpdate={onProgress || onWatched ? (e) => {
        const v = e.currentTarget;
        if (onProgress && v.duration) onProgress(v.currentTime / v.duration);
        if (onWatched && !watched.current && v.duration && v.currentTime >= Math.min(2, v.duration / 2)) { watched.current = true; onWatched(); }
      } : undefined} />
  );
}

/** Çift dokunuşta beliren kalp + etrafa saçılan küçük kalpler */
export function HeartBurst({ k, size }) {
  if (!k) return null;
  return (
    <div className="burst" key={k} aria-hidden="true">
      <span className="big"><Icon n="heart" fill size={size || 96} /></span>
      {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="bit" style={{ '--a': i * 60 + 30 + 'deg' }}><Icon n="heart" fill size={16} /></span>)}
    </div>
  );
}

export function Spinner({ size }) {
  return <span className="spinner" style={size ? { width: size, height: size } : undefined} role="status" aria-label="Yükleniyor" />;
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon ? <div className="circle"><Icon n={icon} size={36} /></div> : null}
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action || null}
    </div>
  );
}

export function Toggle({ on, onChange, id, label }) {
  return (
    <button id={id} role="switch" aria-checked={on} aria-label={label} className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i /></button>
  );
}

export function SkeletonPost() {
  return (
    <div className="skel-post" aria-hidden="true">
      <div className="g skel-head"><span className="skel circle" /><span className="skel line" style={{ width: 120 }} /></div>
      <div className="skel media" />
      <div className="g" style={{ display: 'grid', gap: 8, paddingBlock: 12 }}><span className="skel line" style={{ width: '40%' }} /><span className="skel line" style={{ width: '75%' }} /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ sayfa (sağdan kayar, soldan kaydırınca kapanır) */
export function Screen({ onBack, children, z, up, dark }) {
  const [leaving, setLeaving] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef(null);
  const ref = useRef(null);
  const left = useRef(false);
  const back = useCallback(() => {
    if (left.current) return;
    left.current = true;
    setLeaving(true);
    setTimeout(onBack, 240);
  }, [onBack]);
  const intercept = useRef(null);
  useBackClose(() => { if (intercept.current && intercept.current()) return; back(); });
  const onDown = (e) => { drag.current = { x: e.clientX }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ } };
  const onMove = (e) => { if (drag.current) setDx(Math.max(0, e.clientX - drag.current.x)); };
  const onUp = (e) => {
    if (!drag.current) return;
    const d = e.clientX - drag.current.x;
    const w = ref.current ? ref.current.clientWidth : 400;
    drag.current = null;
    setDx(0);
    if (d > w * 0.3) back();
  };
  const style = { zIndex: z };
  if (leaving) style.transform = up ? 'translateY(100%)' : 'translateX(100%)';
  else if (dx) { style.transform = 'translateX(' + dx + 'px)'; style.transition = 'none'; }
  return (
    <div ref={ref} className={'page' + (up ? ' up' : '') + (dark ? ' dark' : '') + (leaving ? ' leaving' : '')} style={style}>
      <BackInterceptCtx.Provider value={intercept}><ScreenCtx.Provider value={back}>{children}</ScreenCtx.Provider></BackInterceptCtx.Provider>
      {!up ? <div className="edge" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} /> : null}
    </div>
  );
}

export function TopBar({ title, back, right, left, line, sub, hidden, onTitle }) {
  const goBack = useBack();
  return (
    <header className={'topbar' + (line ? ' line' : '') + (hidden ? ' hide' : '')}>
      <div className="left">
        {back ? <button className="icon-btn" onClick={goBack} aria-label="Geri"><Icon n="back" size={28} /></button> : null}
        {left || (
          <button className="title-btn" onClick={onTitle} disabled={!onTitle}>
            <h1>{title}</h1>
            {sub ? <span className="sub">{sub}</span> : null}
          </button>
        )}
      </div>
      <div className="right">{right || null}</div>
    </header>
  );
}

/* ------------------------------------------------------------------ alt panel (aşağı sürükleyince kapanır) */
export function Sheet({ onClose, title, children, tall, footer, z, dark, className }) {
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const drag = useRef(null);
  const done = useRef(false);
  const close = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setClosing(true);
    setTimeout(onClose, 210);
  }, [onClose]);
  useBackClose(close);
  const onDown = (e) => { drag.current = { y: e.clientY, t: Date.now() }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ } };
  const onMove = (e) => { if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y)); };
  const onUp = (e) => {
    if (!drag.current) return;
    const d = e.clientY - drag.current.y;
    const v = d / Math.max(1, Date.now() - drag.current.t);
    drag.current = null;
    if (d > 110 || (d > 30 && v > 0.6)) close();
    else setDy(0);
  };
  const host = (typeof document !== 'undefined' && (document.querySelector('.app') || document.querySelector('.auth') || document.body)) || null;
  const node = (
    <div className={'scrim' + (closing ? ' out' : '')} style={{ zIndex: z || 60 }} onClick={close}>
      <div className={'sheet' + (tall ? ' tall' : '') + (dark ? ' dark' : '') + (closing ? ' out' : '') + (className ? ' ' + className : '')}
        style={dy ? { transform: 'translateY(' + dy + 'px)', transition: 'none' } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-drag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="grab" />
          {title ? <div className="sheet-title">{title}</div> : null}
        </div>
        <SheetCtx.Provider value={close}>
          {children}
          {footer || null}
        </SheetCtx.Provider>
      </div>
    </div>
  );
  return host ? createPortal(node, host) : node;
}

export function ActionSheet({ sheet, onClose }) {
  return (
    <Sheet onClose={onClose} title={sheet.title} z={80}>
      <ActionList items={sheet.items} header={sheet.header} />
    </Sheet>
  );
}
function ActionList({ items, header }) {
  const close = useSheetClose() || (() => {});
  return (
    <div className="g action-list">
      {header || null}
      {items.map((it, i) => (
        <button key={i} className={'menu-item' + (it.danger ? ' danger' : '')} onClick={() => { close(); setTimeout(it.onClick, 220); }}>
          {it.icon ? <Icon n={it.icon} size={22} /> : null}<span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
export function ConfirmDialog({ c, onClose }) {
  const cancel = () => { onClose(); if (c.onCancel) c.onCancel(); };
  useBackClose(cancel);
  return (
    <div className="scrim center" style={{ zIndex: 90 }} onClick={cancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h4>{c.title}</h4>
        <p>{c.text || 'Bu işlem geri alınamaz.'}</p>
        <button className={c.danger ? 'danger' : 'strong'} onClick={() => { onClose(); c.onOk(); }}>{c.ok || 'Tamam'}</button>
        <button onClick={cancel}>Vazgeç</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ takip ve kişi satırı */
export function FollowButton({ uid, small, block }) {
  const app = useApp();
  if (!uid || uid === app.me.id || !app.profiles[uid]) return null;
  if (app.blocks[uid]) {
    return <button className={'btn follow-btn' + (small ? ' small' : '') + (block ? ' block' : '')} onClick={(e) => { e.stopPropagation(); app.unblock(uid); }}>Engeli kaldır</button>;
  }
  const f = app.following.has(uid);
  const req = !f && app.requested.has(uid);
  const back = !f && !req && isOn(app.profiles[uid].following, app.me.id);
  return (
    <button className={'btn follow-btn' + (small ? ' small' : '') + (block ? ' block' : '') + (f || req ? '' : ' primary')}
      onClick={(e) => { e.stopPropagation(); if (f) app.confirmUnfollow(uid); else if (req) app.cancelRequest(uid); else app.setFollow(uid, true); }}>
      {f ? 'Takip ediliyor' : req ? 'İstek gönderildi' : back ? 'Geri takip et' : 'Takip et'}
    </button>
  );
}

export function PersonRow({ uid, right, onClick, sub }) {
  const app = useApp();
  const p = app.profiles[uid] || {};
  return (
    <div className="row person">
      <button className="row-main" onClick={onClick || (() => app.openUser(uid))}>
        <Avatar uid={uid} size={48} ring={app.storyRing(uid)} online={app.isOnline(uid)} />
        <span className="grow">
          <UName uid={uid} plain />
          <span className="sub">{sub != null ? sub : p.displayName || p.bio || ''}</span>
        </span>
      </button>
      {right === undefined ? <FollowButton uid={uid} small /> : right}
    </div>
  );
}

/* hassas içerik kapağı: bulanık + "Gönderiyi gör" (compact: ızgara karesi) */
export function SensitiveCover({ post, compact }) {
  const app = useApp();
  if (!app.covered(post)) return null;
  if (compact) return <span className="sens-cover compact" aria-label="Hassas içerik"><Icon n="eyeOff" size={22} /></span>;
  return (
    <div className="sens-cover" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <Icon n="eyeOff" size={30} />
      <b>Hassas içerik</b>
      <span>Bu gönderi bazı kişiler için rahatsız edici olabilir.</span>
      <button className="sens-btn" onClick={(e) => { e.stopPropagation(); app.reveal(post.id); }}>Gönderiyi gör</button>
    </div>
  );
}
