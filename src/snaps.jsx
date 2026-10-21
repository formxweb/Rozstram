// Şipşak: kamerayla anında çekilen, filtresiz foto. Karşılıklı takipleştiğin arkadaşlarına ya da Yakın Arkadaşlar'a gider,
// bir kez görülür ve 24 saatte kaybolur.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { ago, compressImage, haptic, mediaUrl, store } from './lib.js';
import { Avatar, Icon, Sheet, Spinner, useBackClose } from './ui.jsx';

const REACTIONS = ['❤️', '😂', '😮', '🔥', '👏'];

/* ---------------------------------------------------------------- mesajlardaki şipşak şeridi */
export function SnapStrip() {
  const app = useApp();
  const [sentOpen, setSentOpen] = useState(false);
  const groups = useMemo(() => {
    const m = {};
    app.snaps.inbox.forEach((s) => { (m[s.from] = m[s.from] || []).push(s); });
    return Object.keys(m).filter((u) => app.profiles[u]).map((u) => ({ uid: u, items: m[u], at: m[u][m[u].length - 1].at })).sort((a, b) => b.at - a.at);
  }, [app.snaps.inbox, app.profiles]);
  const sent = app.snaps.sent;
  const seenCount = sent.reduce((n, s) => n + s.seen.length, 0);
  return (
    <Fragment>
      <div className="snap-strip" aria-label="Şipşak">
        <button className="snap-item cam" id="snap-open" onClick={app.openSnapCamera}>
          <span className="snap-thumb"><Icon n="camera" size={26} stroke={2} /></span>
          <span className="nm">Şipşak çek</span>
        </button>
        {sent.length ? (
          <button className="snap-item mine" id="snap-sent" onClick={() => setSentOpen(true)}>
            <span className="snap-thumb"><img src={mediaUrl(sent[0].media.id)} alt="" /><b className="cnt">{seenCount ? seenCount + ' gördü' : 'Gönderildi'}</b></span>
            <span className="nm">Gönderdiklerin</span>
          </button>
        ) : null}
        {groups.map((g) => (
          <button key={g.uid} className="snap-item new" data-from={app.nameOf(g.uid)} onClick={() => app.openSnapViewer(g.uid)}>
            <span className="snap-thumb"><img className="blur" src={mediaUrl(g.items[g.items.length - 1].media.id)} alt="" />
              <span className="av-on"><Avatar uid={g.uid} size={30} /></span>{g.items.length > 1 ? <b className="cnt">{g.items.length}</b> : null}</span>
            <span className="nm">{(app.profiles[g.uid].displayName || app.nameOf(g.uid)).split(' ')[0]}</span>
          </button>
        ))}
      </div>
      {sentOpen ? <SentSnapsSheet onClose={() => setSentOpen(false)} /> : null}
    </Fragment>
  );
}

/* ---------------------------------------------------------------- kamera */
export function SnapCamera({ onClose }) {
  const app = useApp();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useState('user');
  const [cam, setCam] = useState('starting');
  const [audience, setAudienceState] = useState(() => store.get('snapAudience', 'mutual'));
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState(0);
  const [last, setLast] = useState(null);
  const counts = app.snapAudienceCounts;
  const setAudience = (a) => { setAudienceState(a); store.set('snapAudience', a); };

  useEffect(() => {
    let alive = true;
    setCam('starting');
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-camera');
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
        if (!alive) { st.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = st;
        const v = videoRef.current;
        if (v) { v.srcObject = st; await v.play().catch(() => {}); }
        setCam('ready');
      } catch (e) {
        if (alive) setCam('denied');
      }
    })();
    return () => {
      alive = false;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);
  useEffect(() => () => { if (last && last.url) URL.revokeObjectURL(last.url); }, [last]);

  const send = async (blob, w, h) => {
    setSending(true);
    const r = await app.sendSnap(blob, w, h, audience);
    setSending(false);
    if (r) setLast({ id: r.id, count: r.count, url: URL.createObjectURL(blob) });
  };
  const shoot = async () => {
    const v = videoRef.current;
    if (sending) return;
    if (cam !== 'ready' || !v || !v.videoWidth) { if (fileRef.current) fileRef.current.click(); return; }
    // 3:4 dikey kare, en fazla 1080 px genişlik; ön kamerada ayna görüntüsü
    const vw = v.videoWidth, vh = v.videoHeight, ar = 3 / 4;
    let sw = vw, sh = vh, sx = 0, sy = 0;
    if (vw / vh > ar) { sw = vh * ar; sx = (vw - sw) / 2; } else { sh = vw / ar; sy = (vh - sh) / 2; }
    const scale = Math.min(1, 1080 / sw);
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (facing === 'user') { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    setFlash((f) => f + 1);
    haptic(18);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86));
    if (blob) await send(blob, w, h);
  };
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { const img = await compressImage(f, 1080, 3 / 4); await send(img.blob, img.w, img.h); } catch (err) { app.toast('Fotoğraf okunamadı.'); }
  };
  const undo = async () => { if (last && await app.undoSnap(last.id)) setLast(null); };
  const none = audience === 'close' ? !counts.close : !counts.mutual;

  return (
    <div className="snap-cam-screen">
      <div className="snap-view">
        <video ref={videoRef} className={facing === 'user' ? 'mirror' : ''} playsInline muted autoPlay />
        {cam === 'starting' ? <div className="snap-msg"><Spinner /></div> : null}
        {cam === 'denied' ? (
          <div className="snap-msg"><Icon n="camera" size={34} /><b>Kameraya erişilemedi</b><span>Tarayıcı izin verirse canlı kamera açılır. Şimdilik telefonunun kamerasıyla çekebilirsin.</span></div>
        ) : null}
        {flash ? <i key={flash} className="snap-flash" /> : null}
        <div className="snap-top">
          <button className="snap-round" aria-label="Kapat" onClick={onClose}><Icon n="close" size={24} /></button>
          <div className="snap-aud" role="radiogroup" aria-label="Kime gitsin">
            <button role="radio" aria-checked={audience === 'mutual'} className={audience === 'mutual' ? 'on' : ''} onClick={() => setAudience('mutual')}>Arkadaşlar · {counts.mutual}</button>
            <button role="radio" aria-checked={audience === 'close'} className={audience === 'close' ? 'on' : ''} onClick={() => setAudience('close')}><Icon n="star" size={13} fill />Yakın · {counts.close}</button>
          </div>
          <button className="snap-round" aria-label="Kamerayı çevir" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}><Icon n="history" size={22} /></button>
        </div>
        {last ? (
          <div className="snap-sent" role="status">
            <img src={last.url} alt="" />
            <span className="grow"><b>Şipşak gönderildi</b><span>{last.count} kişi bir kez görebilir · 24 saatte kaybolur</span></span>
            <button className="btn small" onClick={undo}>Geri al</button>
          </div>
        ) : null}
      </div>
      <div className="snap-bottom">
        <p className="snap-hint">{none
          ? (audience === 'close' ? 'Yakın Arkadaşlar listende seni takip eden kimse yok.' : 'Karşılıklı takipleştiğin kimse yok.')
          : 'Filtre yok, düzenleme yok. Çektiğin an gider.'}</p>
        <button className={'snap-shutter' + (sending ? ' busy' : '')} id="snap-shutter" aria-label="Çek ve gönder" disabled={sending || none} onClick={shoot}>
          {sending ? <Spinner /> : <i />}
        </button>
        <input ref={fileRef} id="snap-file" type="file" accept="image/*" capture={facing === 'user' ? 'user' : 'environment'} hidden onChange={onFile} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- görüntüleyici (bir kez) */
export function SnapViewer({ uid, onClose }) {
  const app = useApp();
  const items = useMemo(() => app.snaps.inbox.filter((s) => s.from === uid), []);
  const [i, setI] = useState(0);
  const [react, setReact] = useState(null);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useBackClose(onClose);
  const cur = items[i];
  useEffect(() => { if (cur) app.openSnap(cur.id); setLoaded(false); setReact(null); }, [i]);
  useEffect(() => {
    if (!cur || paused || !loaded) return undefined;
    const t = setTimeout(() => next(), 7000);
    return () => clearTimeout(t);
  }, [i, paused, loaded]);
  if (!cur) return null;
  function next() { if (i + 1 < items.length) setI(i + 1); else onClose(); }
  const sendReaction = (e) => { setReact({ e, k: Date.now() }); haptic(10); app.openSnap(cur.id, e); };
  return (
    <div className="snap-viewer" role="dialog" aria-label="Şipşak">
      <div className="snap-bars">{items.map((s, k) => <i key={s.id} className={k < i ? 'done' : k === i ? (loaded && !paused ? 'run' : 'on') : ''} />)}</div>
      <div className="snap-head">
        <Avatar uid={uid} size={34} onClick={() => { onClose(); app.openUser(uid); }} />
        <span className="grow"><b>{app.nameOf(uid)}</b><span>Şipşak · {ago(cur.at)}</span></span>
        <button className="snap-round" aria-label="Kapat" onClick={onClose}><Icon n="close" size={24} /></button>
      </div>
      <div className="snap-photo" onClick={next} onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} onPointerLeave={() => setPaused(false)}>
        <img src={mediaUrl(cur.media.id)} alt="" onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} draggable="false" />
        {cur.caption ? <span className="snap-cap">{cur.caption}</span> : null}
        {react ? <span key={react.k} className="snap-react-pop">{react.e}</span> : null}
      </div>
      <div className="snap-foot">
        <div className="snap-reacts">{REACTIONS.map((e) => <button key={e} aria-label={'Tepki ' + e} onClick={() => sendReaction(e)}>{e}</button>)}</div>
        <button className="btn" onClick={() => { onClose(); app.openChatWith(uid); }}><Icon n="send" size={18} />Mesaj gönder</button>
      </div>
      <p className="snap-once">Bir kez görülür. Kapattığında kaybolur.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- gönderdiklerin */
function SentSnapsSheet({ onClose }) {
  const app = useApp();
  const list = app.snaps.sent;
  return (
    <Sheet onClose={onClose} title="Gönderdiğin şipşaklar" z={66}>
      <div className="g sheet-body" style={{ paddingBottom: 16 }}>
        {list.length ? list.map((s) => (
          <div className="sent-snap" key={s.id}>
            <img src={mediaUrl(s.media.id)} alt="" />
            <div className="grow">
              <b>{s.audience === 'close' ? 'Yakın Arkadaşlar' : 'Arkadaşlar'} · {ago(s.at)}</b>
              <span>{s.to} kişiye gitti · {s.seen.length ? s.seen.length + ' kişi gördü' : 'henüz gören yok'}</span>
              {s.seen.length ? (
                <div className="sent-seen">{s.seen.map((v) => (
                  <span key={v.id} className="seen-chip"><Avatar uid={v.id} size={22} /><span>{app.nameOf(v.id)}</span>{v.reaction ? <i>{v.reaction}</i> : null}</span>
                ))}</div>
              ) : null}
            </div>
            <button className="btn small" onClick={() => app.undoSnap(s.id)}>Geri al</button>
          </div>
        )) : <div className="adm-empty">Son 24 saatte gönderdiğin şipşak yok.</div>}
      </div>
    </Sheet>
  );
}
