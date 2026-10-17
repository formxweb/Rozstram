// Müzik: kütüphane seçici, çalma, müzik sayfası, yönetici müzik yönetimi.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { fmtDur } from './lib.js';
import { MusicCover, SEGMENT, hash, pauseMusic, playMusic, stopMusic } from './player.jsx';
import { Empty, Icon, Sheet, Spinner, TopBar } from './ui.jsx';
import { GridTile } from './feed.jsx';

function Bars({ seed, start, dur, total, onSeek }) {
  const ref = useRef(null);
  const bars = useMemo(() => { let x = hash(seed) || 7; return Array.from({ length: 56 }, () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return 0.25 + (x % 1000) / 1333; }); }, [seed]);
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onSeek(Math.max(0, Math.min(total - dur, p * total - dur / 2)));
  };
  const a = start / total, b = Math.min(1, (start + dur) / total);
  return (
    <div className="mus-bars" ref={ref} onPointerDown={(e) => { pick(e); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* yok */ } }}
      onPointerMove={(e) => { if (e.buttons) pick(e); }}>
      {bars.map((h, i) => { const x = i / bars.length; return <i key={i} className={x >= a && x < b ? 'on' : ''} style={{ height: Math.round(h * 100) + '%' }} />; })}
      <span className="win" style={{ left: a * 100 + '%', width: (b - a) * 100 + '%' }} />
    </div>
  );
}

/* ------------------------------------------------------------ müzik seçici */
export function useTracks() {
  const app = useApp();
  const [list, setList] = useState(null);
  const load = async (all) => {
    let q = app.sb.from('music_tracks').select('id,slug,title,artist,genre,mood,url,duration,active,created_at');
    if (!all) q = q.eq('active', true);
    const { data } = await q.order('created_at', { ascending: true });
    setList(data || []);
  };
  return [list, load, setList];
}

export function MusicPicker({ value, onPick, onClose }) {
  const app = useApp();
  const [list, load] = useTracks();
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [sel, setSel] = useState(null);
  const [start, setStart] = useState(0);
  const [prev, setPrev] = useState(null);
  useEffect(() => { load(); return () => stopMusic('picker'); }, []);
  const genres = useMemo(() => Array.from(new Set((list || []).map((t) => t.genre).filter(Boolean))), [list]);
  const shown = (list || []).filter((t) => (!genre || t.genre === genre) && (!q.trim() || (t.title + ' ' + t.artist + ' ' + t.genre + ' ' + (t.mood || '')).toLocaleLowerCase('tr').indexOf(q.trim().toLocaleLowerCase('tr')) >= 0));
  const listen = (t, s) => {
    if (prev === t.id && s == null) { stopMusic('picker'); setPrev(null); return; }
    stopMusic('picker');
    playMusic('picker', { url: t.url, start: s || 0, dur: s != null ? SEGMENT : 0 }, { full: s == null });
    setPrev(t.id);
  };
  const choose = (t) => {
    setSel(t);
    const st = value && value.id === t.id ? value.start || 0 : Math.min(Math.max(0, t.duration * 0.25), Math.max(0, t.duration - SEGMENT));
    setStart(st);
    stopMusic('picker');
    setTimeout(() => listen(t, st), 30);
  };
  const seek = (s) => { setStart(s); stopMusic('picker'); playMusic('picker', { url: sel.url, start: s, dur: SEGMENT }); };
  const done = () => {
    stopMusic('picker');
    onPick({ id: sel.id, title: sel.title, artist: sel.artist, url: sel.url, start: Math.round(start * 10) / 10, dur: Math.min(SEGMENT, sel.duration) });
    onClose();
  };
  return (
    <Sheet onClose={onClose} title={sel ? 'Parçanın yerini seç' : 'Müzik ekle'} tall z={85}>
      {sel ? (
        <div className="g mus-seg">
          <div className="mus-row big"><MusicCover m={sel} size={56} playing /><div className="grow"><b>{sel.title}</b><span>{sel.artist} · {sel.genre}</span></div></div>
          <Bars seed={sel.id} start={start} dur={Math.min(SEGMENT, sel.duration)} total={sel.duration} onSeek={seek} />
          <div className="mus-time"><span>{fmtDur(start)}</span><span>{Math.min(SEGMENT, Math.round(sel.duration))} sn</span><span>{fmtDur(sel.duration)}</span></div>
          <p className="sub">Parmağınla kaydırıp şarkının hangi kısmının çalacağını seç.</p>
          <div className="adm-actions">
            <button className="btn" onClick={() => { stopMusic('picker'); setSel(null); setPrev(null); }}>Geri</button>
            <button className="btn grad" id="music-done" onClick={done}>Bitti</button>
          </div>
        </div>
      ) : (
        <div className="g">
          <div className="adm-search"><Icon n="search" size={18} /><input id="music-q" placeholder="Müzik ara" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="mus-chips">
            <button className={!genre ? 'on' : ''} onClick={() => setGenre('')}>Tümü</button>
            {genres.map((g) => <button key={g} className={genre === g ? 'on' : ''} onClick={() => setGenre(g === genre ? '' : g)}>{g}</button>)}
          </div>
          {!list ? <div className="center-pad"><Spinner /></div> : shown.length ? shown.map((t) => (
            <div className="mus-row" key={t.id}>
              <button className="mus-play" onClick={() => listen(t)} aria-label={prev === t.id ? 'Durdur' : 'Dinle'}><MusicCover m={t} playing={prev === t.id} /></button>
              <button className="grow" onClick={() => choose(t)}>
                <b>{t.title}</b><span>{t.artist}{t.genre ? ' · ' + t.genre : ''} · {fmtDur(t.duration)}</span>
              </button>
              <button className="btn small" onClick={() => choose(t)}>Seç</button>
            </div>
          )) : <Empty icon="music" title="Müzik bulunamadı" text="Başka bir kelimeyle ara." />}
          <p className="sub" style={{ padding: '14px 0' }}>Tüm müzikler Rozstram’da ücretsiz kullanılabilir.</p>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------ müzik sayfası */
export function MusicScreen({ id }) {
  const app = useApp();
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    app.sb.from('music_tracks').select('id,title,artist,genre,mood,url,duration').eq('id', id).maybeSingle().then(({ data }) => setTrack(data || false));
    return () => stopMusic('page:' + id);
  }, [id]);
  const posts = app.visiblePosts.filter((p) => p.music && p.music.id === id && !app.hidden[p.id]);
  const m = track || (posts[0] && posts[0].music) || null;
  const toggle = () => {
    if (!m) return;
    if (playing) { pauseMusic('page:' + id); setPlaying(false); } else { playMusic('page:' + id, { url: m.url, start: 0 }, { full: true }); setPlaying(true); }
  };
  return (
    <Fragment>
      <TopBar back title="Müzik" line />
      <div className="body">
        {m ? (
          <div className="g mus-head">
            <MusicCover m={m} size={96} playing={playing} />
            <div className="grow">
              <h2>{m.title}</h2>
              <span className="sub">{m.artist}{m.genre ? ' · ' + m.genre : ''}</span>
              <span className="sub">{posts.length} gönderi</span>
              <div className="adm-actions">
                <button className="btn" onClick={toggle}><Icon n={playing ? 'pause' : 'play'} size={16} fill />{playing ? 'Durdur' : 'Dinle'}</button>
                <button className="btn grad" onClick={() => { stopMusic(); app.openCreate('reel', { music: { id, title: m.title, artist: m.artist, url: m.url, start: 0, dur: SEGMENT } }); }}>Bu müzikle oluştur</button>
              </div>
            </div>
          </div>
        ) : track === false ? <Empty icon="music" title="Müzik bulunamadı" /> : <div className="center-pad"><Spinner /></div>}
        {posts.length ? <div className="grid">{posts.map((p) => <GridTile key={p.id} post={p} reel={p.kind === 'reel'} />)}</div>
          : m ? <Empty icon="reels" title="Henüz kimse kullanmadı" text="Bu müzikle ilk paylaşımı sen yap." /> : null}
      </div>
    </Fragment>
  );
}

/* ------------------------------------------------------------ yönetici: müzik */
export function AdminMusic() {
  const app = useApp();
  const [list, load, setList] = useTracks();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [genre, setGenre] = useState('');
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => { load(true); return () => stopMusic('admin'); }, []);
  const listen = (t) => {
    if (prev === t.id) { stopMusic('admin'); setPrev(null); return; }
    stopMusic('admin'); playMusic('admin', { url: t.url, start: 0 }, { full: true }); setPrev(t.id);
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { app.toast('Müzik dosyası en fazla 20 MB olabilir.'); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 80));
  };
  const add = async () => {
    if (!file || !title.trim()) return;
    setBusy(true);
    const ok = await app.admin.addTrack(file, { title: title.trim(), artist: artist.trim(), genre: genre.trim() });
    setBusy(false);
    if (ok) { setFile(null); setTitle(''); setArtist(''); setGenre(''); load(true); }
  };
  const toggle = async (t) => {
    const ok = await app.admin.setTrackActive(t.id, !t.active);
    if (ok) setList((l) => l.map((x) => (x.id === t.id ? { ...x, active: !t.active } : x)));
  };
  return (
    <Fragment>
      <p className="adm-note">Buraya sadece kullanma hakkın olan müzikleri yükle: kendi müziğin ya da telifsiz siteler (Pixabay Music, YouTube Ses Kitaplığı vb.). Bilinen şarkıları izinsiz yüklemek telif şikayetine yol açar.</p>
      <div className="adm-card">
        <input ref={fileRef} id="adm-music-file" type="file" accept="audio/*" hidden onChange={onFile} />
        <button className="btn block" onClick={() => fileRef.current && fileRef.current.click()}><Icon n="music" size={16} />{file ? file.name : 'Müzik dosyası seç (mp3, m4a)'}</button>
        <input className="adm-input" id="adm-music-title" placeholder="Şarkı adı" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        <input className="adm-input" id="adm-music-artist" placeholder="Sanatçı" value={artist} maxLength={80} onChange={(e) => setArtist(e.target.value)} />
        <input className="adm-input" id="adm-music-genre" placeholder="Tür (Pop, Lo-fi…)" value={genre} maxLength={40} onChange={(e) => setGenre(e.target.value)} />
        <div className="adm-actions"><button className="btn grad" id="adm-music-add" disabled={!file || !title.trim() || busy} onClick={add}>{busy ? 'Yükleniyor…' : 'Kütüphaneye ekle'}</button></div>
      </div>
      <div className="set-head">Kütüphane ({list ? list.filter((t) => t.active).length : 0} aktif)</div>
      {!list ? <div className="center-pad"><Spinner /></div> : list.map((t) => (
        <div className="adm-card row-card" key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
          <button className="mus-play" onClick={() => listen(t)} aria-label="Dinle"><MusicCover m={t} size={44} playing={prev === t.id} /></button>
          <div className="grow"><b>{t.title}</b><span>{t.artist}{t.genre ? ' · ' + t.genre : ''} · {fmtDur(t.duration)}</span></div>
          <button className="btn" onClick={() => toggle(t)}>{t.active ? 'Gizle' : 'Göster'}</button>
        </div>
      ))}
    </Fragment>
  );
}

