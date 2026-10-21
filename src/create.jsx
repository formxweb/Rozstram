import { Fragment, useEffect, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { ADJUSTS, FILTERS, MAX_UPLOAD, STORY_BGS, STORY_FONTS, TEXT_COLORS, filterCss, haptic, snapshotFile } from './lib.js';
import { Avatar, Empty, Icon, PersonRow, Sheet, Toggle, TopBar, Vid, useBackIntercept } from './ui.jsx';
import { StoryText } from './stories.jsx';
import { MusicPicker } from './music.jsx';
import { MusicTag, pauseMusic, playMusic, stopMusic } from './player.jsx';

const TITLES = { post: 'Yeni gönderi', reel: 'Yeni Reels', story: 'Hikayene ekle' };
const ASPECTS = [{ id: '1', name: '1:1', v: 1 }, { id: '45', name: '4:5', v: 0.8 }, { id: 'o', name: 'Orijinal', v: null }];

function UploadOverlay({ progress, done }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="upload-overlay">
      <div className="upload-card">
        {done ? <span className="done-check"><Icon n="check" size={38} stroke={2.6} /></span> : (
          <svg width="84" height="84" className="ring-progress" aria-hidden="true">
            <defs><linearGradient id="kg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--g1)" /><stop offset=".5" stopColor="var(--g3)" /><stop offset="1" stopColor="var(--g4)" /></linearGradient></defs>
            <circle cx="42" cy="42" r={r} fill="none" stroke="var(--soft-2)" strokeWidth="7" />
            <circle cx="42" cy="42" r={r} fill="none" stroke="url(#kg)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
          </svg>
        )}
        <b>{done ? 'Paylaşıldı' : 'Paylaşılıyor… %' + Math.round(progress * 100)}</b>
        {!done ? <span className="sub">Uygulamayı kapatma</span> : null}
      </div>
    </div>
  );
}

export function CreateFlow({ mode: initialMode, music: initialMusic, onDone }) {
  const app = useApp();
  const [mode, setMode] = useState(initialMode || 'post');
  const [step, setStep] = useState('pick');
  const [items, setItems] = useState([]);
  const [aspect, setAspect] = useState('1');
  const [filter, setFilter] = useState('none');
  const [adjust, setAdjust] = useState({ b: 0, c: 0, s: 0, w: 0 });
  const [editTab, setEditTab] = useState('filter');
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [hideLikes, setHideLikes] = useState(false);
  const [noComments, setNoComments] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [tagged, setTagged] = useState([]);
  const [tagOpen, setTagOpen] = useState(false);
  const camRef = useRef(null);
  const [overlay, setOverlay] = useState(null);
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textStory, setTextStory] = useState({ body: '', bg: 0, font: 'klasik', color: '#ffffff' });
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [slide, setSlide] = useState(0);
  const [music, setMusic] = useState(initialMusic || null);
  const [musicOpen, setMusicOpen] = useState(false);
  // seçilen müziği düzenlerken çal (seçici açıkken o kendi önizlemesini çalar)
  useEffect(() => {
    if (music && !musicOpen && step !== 'pick' && progress == null) playMusic('create:' + music.id + ':' + music.start, music);
    else pauseMusic();
  }, [music, musicOpen, step, progress]);
  useEffect(() => () => stopMusic(), []);
  const musicBtn = (cls) => (
    <button className={cls || 'round'} onClick={() => setMusicOpen(true)} aria-label="Müzik ekle"><Icon n="music" size={cls ? 14 : 22} />{cls ? (music ? music.title : 'Müzik') : null}</button>
  );
  const musicSticker = music ? (
    <div className="se-music">
      <MusicTag m={music} dark onClick={() => setMusicOpen(true)} />
      <button className="x" onClick={() => setMusic(null)} aria-label="Müziği kaldır"><Icon n="close" size={14} /></button>
    </div>
  ) : null;
  const picker = musicOpen ? <MusicPicker value={music} onPick={setMusic} onClose={() => setMusicOpen(false)} /> : null;
  const fileRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  useEffect(() => () => items.forEach((it) => URL.revokeObjectURL(it.url)), [items]);

  const pick = () => fileRef.current && fileRef.current.click();
  const onFiles = async (e) => {
    const files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setError('');
    const vids = files.filter((f) => f.type.indexOf('video') === 0);
    let chosen;
    if (mode === 'reel') chosen = vids.slice(0, 1);
    else if (mode === 'story') chosen = files.slice(0, 1);
    else chosen = vids.length && files.length > 1 ? files.filter((f) => f.type.indexOf('image') === 0).slice(0, 10) : files.slice(0, 10);
    if (!chosen.length) { setError(mode === 'reel' ? 'Reels için bir video seç.' : 'Desteklenen bir dosya seç.'); return; }
    if (chosen.find((f) => f.size > MAX_UPLOAD && f.type.indexOf('video') === 0)) { setError('Bu video 50 MB’tan büyük. Daha kısa bir video seç ya da telefonunda kırp.'); return; }
    if (vids.length && files.length > 1 && mode === 'post') setError('Birden fazla dosya seçince sadece fotoğraflar alınır.');
    try { chosen = await Promise.all(chosen.map(snapshotFile)); } catch (err) {
      setError('Bu dosya okunamadı. Telefonuna indirip galeriden tekrar seç.');
      return;
    }
    setItems(chosen.map((f) => ({ file: f, url: URL.createObjectURL(f), type: f.type.indexOf('video') === 0 ? 'video' : 'image' })));
    setSlide(0);
    setStep(mode === 'story' ? 'story' : 'edit');
  };
  const reset = () => { setItems([]); setStep('pick'); setFilter('none'); setAdjust({ b: 0, c: 0, s: 0, w: 0 }); setOverlay(null); };
  const switchMode = (m) => { if (progress != null) return; setMode(m); reset(); };

  const share = async (closeFriends) => {
    if (progress != null) return;
    setError('');
    setProgress(0);
    const asp = ASPECTS.find((a) => a.id === aspect);
    const ok = await app.publish({
      mode, items, filter, adjust, caption: caption.trim(), location: location.trim(), hideLikes, noComments, sensitive, aspect: asp ? asp.v : null,
      overlay: overlay && overlay.text ? overlay : null, textStory: step === 'text' ? textStory : null, tagged, closeFriends: closeFriends === true, music,
    }, (p) => setProgress(p));
    if (ok) {
      setDone(true); haptic(20);
      setTimeout(() => onDone(mode === 'reel' ? 'reels' : mode === 'story' ? 'home' : 'home'), 900);
    } else setProgress(null);
  };

  const fcss = filterCss(filter, adjust);
  const first = items[0];
  const back = () => {
    if (step === 'details') setStep('edit');
    else if (step === 'edit' || step === 'story' || step === 'text') reset();
    else onDone();
  };
  /* telefonun geri tuşu: önce yazı düzenleme kapanır, sonra adım adım geri gidilir; ilk adımda sayfa kapanır */
  useBackIntercept(() => {
    if (editingText) { setEditingText(false); return true; }
    if (step === 'pick') return false;
    back();
    return true;
  });

  /* ---------------- hikaye: yazı modu ---------------- */
  if (step === 'text') {
    return (
      <div className="se">
        <div className="se-stage" style={{ background: STORY_BGS[textStory.bg] }}>
          <div className="se-top">
            <button className="round" onClick={back} aria-label="Geri"><Icon n="close" size={22} /></button>
            <div className="tools">
              <button className="round txt" onClick={() => setTextStory((t) => ({ ...t, font: STORY_FONTS[(STORY_FONTS.findIndex((f) => f.id === t.font) + 1) % STORY_FONTS.length].id }))} aria-label="Yazı tipi">Aa</button>
              <button className="round" onClick={() => setTextStory((t) => ({ ...t, bg: (t.bg + 1) % STORY_BGS.length }))} aria-label="Arka plan"><Icon n="palette" size={22} /></button>
              {musicBtn()}
            </div>
          </div>
          <textarea id="story-text" className={'story-text f-' + textStory.font} autoFocus value={textStory.body} maxLength={220} placeholder="Bir şey yaz…"
            onChange={(e) => setTextStory((t) => ({ ...t, body: e.target.value }))}
            style={{ position: 'absolute', inset: '70px 20px 60px', background: 'none', border: 0, outline: 'none', resize: 'none', color: textStory.color, textAlign: 'center', paddingTop: '30%' }} />
          {musicSticker}
          <div className="color-dots" style={{ position: 'absolute', left: 0, right: 0, bottom: 8 }}>
            {TEXT_COLORS.map((c) => <button key={c} className={textStory.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setTextStory((t) => ({ ...t, color: c }))} aria-label={'Renk ' + c} />)}
          </div>
        </div>
        <div className="se-bottom">
          <button className="se-share" disabled={!textStory.body.trim()} onClick={() => share(false)}><Avatar uid={app.me.id} size={26} />Hikayen</button>
          <button className="se-share cf" disabled={!textStory.body.trim()} onClick={() => share(true)}><span className="cf-dot"><Icon n="star" size={13} fill /></span>Yakın Arkadaşlar</button>
        </div>
        {progress != null ? <UploadOverlay progress={progress} done={done} /> : null}
        {picker}
      </div>
    );
  }

  /* ---------------- hikaye: fotoğraf/video düzenleyici ---------------- */
  if (step === 'story' && first) {
    const onDragDown = (e) => { e.stopPropagation(); dragRef.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ } };
    const onDragMove = (e) => {
      if (!dragRef.current || !stageRef.current) return;
      const r = stageRef.current.getBoundingClientRect();
      setOverlay((o) => ({ ...o, x: Math.min(0.92, Math.max(0.08, (e.clientX - r.left) / r.width)), y: Math.min(0.92, Math.max(0.08, (e.clientY - r.top) / r.height)) }));
    };
    const onDragUp = () => { dragRef.current = false; };
    const fIdx = FILTERS.findIndex((f) => f.id === filter);
    return (
      <div className="se">
        <div className="se-stage" ref={stageRef}>
          {first.type === 'video' ? <Vid src={first.url} filter={fcss} playing forceMute={!!music} /> : <img src={first.url} alt="" style={fcss ? { filter: fcss } : undefined} />}
          {musicSticker}
          {overlay && overlay.text ? (
            <div className="overlay-text drag-text" style={{ left: overlay.x * 100 + '%', top: overlay.y * 100 + '%', color: overlay.color }}
              onPointerDown={onDragDown} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
              onDoubleClick={() => { setDraftText(overlay.text); setTextColor(overlay.color); setEditingText(true); }}>{overlay.text}</div>
          ) : null}
          <div className="se-top">
            <button className="round" onClick={back} aria-label="Geri"><Icon n="close" size={22} /></button>
            <div className="tools">
              <button className="round txt" onClick={() => { setDraftText(overlay ? overlay.text : ''); setTextColor(overlay ? overlay.color : '#ffffff'); setEditingText(true); }} aria-label="Yazı ekle">Aa</button>
              <button className="round" onClick={() => setFilter(FILTERS[(fIdx + 1) % FILTERS.length].id)} aria-label="Filtre"><Icon n="filter" size={22} /></button>
              {musicBtn()}
            </div>
          </div>
          <span className="pill" style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)' }} key={filter}>{FILTERS[fIdx].name}</span>
          {editingText ? (
            <div className="se-text-input">
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
                <button className="se-share" onClick={() => { setOverlay(draftText.trim() ? { text: draftText.trim(), x: overlay ? overlay.x : 0.5, y: overlay ? overlay.y : 0.45, color: textColor } : null); setEditingText(false); }}>Bitti</button>
              </div>
              <textarea id="overlay-text" autoFocus value={draftText} maxLength={120} onChange={(e) => setDraftText(e.target.value)} style={{ color: textColor }} placeholder="Yazı ekle" />
              <div className="color-dots">{TEXT_COLORS.map((c) => <button key={c} className={textColor === c ? 'on' : ''} style={{ background: c }} onClick={() => setTextColor(c)} aria-label={'Renk ' + c} />)}</div>
            </div>
          ) : null}
        </div>
        <div className="se-bottom">
          <button className="se-share" onClick={() => share(false)}><Avatar uid={app.me.id} size={26} />Hikayen</button>
          <button className="se-share cf" onClick={() => share(true)}><span className="cf-dot"><Icon n="star" size={13} fill /></span>Yakın Arkadaşlar</button>
        </div>
        {error ? <div className="toast">{error}</div> : null}
        {progress != null ? <UploadOverlay progress={progress} done={done} /> : null}
        {picker}
      </div>
    );
  }

  /* ---------------- gönderi / reels ---------------- */
  const asp = mode === 'post' ? (ASPECTS.find((a) => a.id === aspect).v || 0.8) : 9 / 16;
  const right = step === 'edit' ? <button className="text-btn" onClick={() => setStep('details')}>İleri</button>
    : step === 'details' ? <button className="text-btn" onClick={() => share(false)} disabled={progress != null}>Paylaş</button> : null;
  return (
    <Fragment>
      <TopBar left={(
        <Fragment>
          <button className="icon-btn" onClick={back} aria-label={step === 'pick' ? 'Kapat' : 'Geri'}><Icon n={step === 'pick' ? 'close' : 'back'} size={28} /></button>
          <div className="title-btn"><h1>{step === 'details' ? (mode === 'reel' ? 'Yeni Reels' : 'Yeni gönderi') : step === 'edit' ? 'Düzenle' : TITLES[mode]}</h1></div>
        </Fragment>
      )} right={right} line />
      <input ref={fileRef} id="create-file" type="file" accept={mode === 'reel' ? 'video/*' : 'image/*,video/*'} multiple={mode === 'post'} hidden onChange={onFiles} />
      <input ref={camRef} id="create-cam" type="file" accept={mode === 'reel' ? 'video/*' : 'image/*'} capture="environment" hidden onChange={onFiles} />
      <div className="body" style={{ paddingBottom: 70 }}>
        {step === 'pick' ? (
          <div className="dropzone">
            <span className="bigmark"><Icon n={mode === 'reel' ? 'reels' : mode === 'story' ? 'camera' : 'gallery'} size={40} /></span>
            <h3>{mode === 'reel' ? 'Bir video seç ya da çek' : mode === 'story' ? '24 saat görünen bir hikaye paylaş' : 'Fotoğraf ve videolarını paylaş'}</h3>
            <p>{mode === 'post' ? 'En fazla 10 fotoğraf seçebilirsin, kaydırmalı gönderi olur. Videolar en fazla 50 MB.' : mode === 'story' ? 'Fotoğraf, video ya da renkli bir yazı paylaş.' : 'Dikey videolar en iyi görünür. En fazla 50 MB.'}</p>
            <div className="pick-alts">
              <button className="btn grad big" onClick={pick}><Icon n="image" size={18} />Galeriden seç</button>
              <button className="btn big" onClick={() => camRef.current && camRef.current.click()}><Icon n="camera" size={18} />{mode === 'reel' ? 'Video çek' : 'Fotoğraf çek'}</button>
              {mode === 'story' ? <button className="btn big" onClick={() => setStep('text')}><Icon n="text" size={18} />Yazı</button> : null}
            </div>
          </div>
        ) : null}

        {step === 'edit' && first ? (
          <Fragment>
            <div className="preview" style={{ aspectRatio: String(asp) }}>
              <div className="slides" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}>
                {items.map((it) => (
                  <div className="slide" key={it.url}>
                    {it.type === 'video' ? <Vid src={it.url} filter={fcss} playing forceMute={!!music} /> : <img className="fill" src={it.url} alt="" style={{ filter: fcss, objectFit: aspect === 'o' ? 'contain' : 'cover' }} />}
                  </div>
                ))}
              </div>
              {items.length > 1 ? <div className="counter">{slide + 1}/{items.length}</div> : null}
              <div className="preview-tools">
                {mode === 'post' && first.type === 'image' ? ASPECTS.map((a) => <button key={a.id} className={'pill' + (aspect === a.id ? ' on' : '')} onClick={() => setAspect(a.id)}>{a.name}</button>) : null}
                <button className="pill" onClick={pick}><Icon n="image" size={14} />Değiştir</button>
                {musicBtn('pill' + (music ? ' on' : ''))}
              </div>
            </div>
            <div className="edit-tabs">
              <button className={editTab === 'filter' ? 'on' : ''} onClick={() => setEditTab('filter')}>Filtre</button>
              <button className={editTab === 'adjust' ? 'on' : ''} onClick={() => setEditTab('adjust')}>Düzenle</button>
            </div>
            {editTab === 'filter' ? (
              <div className="filters g">
                {FILTERS.map((f) => (
                  <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
                    <span className="sw">{first.type === 'image' ? <img src={first.url} alt="" style={f.css ? { filter: f.css } : undefined} /> : <span style={{ display: 'block', width: '100%', height: '100%', background: 'var(--grad)', filter: f.css || undefined }} />}</span>
                    {f.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="adjust g">
                {ADJUSTS.map((a) => (
                  <label key={a.id} htmlFor={'adj-' + a.id}>
                    <span>{a.name}</span>
                    <input id={'adj-' + a.id} type="range" min={a.min} max={a.max} value={adjust[a.id]} onChange={(e) => setAdjust((x) => ({ ...x, [a.id]: Number(e.target.value) }))} />
                    <output>{adjust[a.id] > 0 ? '+' : ''}{adjust[a.id]}</output>
                  </label>
                ))}
                <button className="text-btn" style={{ justifySelf: 'start' }} onClick={() => setAdjust({ b: 0, c: 0, s: 0, w: 0 })}>Sıfırla</button>
              </div>
            )}
          </Fragment>
        ) : null}

        {step === 'details' && first ? (
          <div className="g">
            <div className="details-row">
              {first.type === 'image' ? <img src={first.url} alt="" style={{ filter: fcss }} /> : <video className="thumb" src={first.url} muted playsInline style={{ filter: fcss }} />}
              <textarea id="create-caption" className="cap-input" placeholder={mode === 'reel' ? 'Videonu anlat… #etiket ekle' : 'Açıklama yaz… #etiket ya da @kişi ekle'} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} autoFocus />
            </div>
            <div className="sub" style={{ textAlign: 'right', paddingTop: 6 }}>{caption.length}/2200</div>
            <label className="opt-row" htmlFor="create-loc"><Icon n="pin" size={22} /><input id="create-loc" placeholder="Konum ekle" value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} /></label>
            <button className="opt-row" id="create-music" onClick={() => setMusicOpen(true)}><Icon n="music" size={22} /><span className="grow"><span>{music ? music.title : 'Müzik ekle'}</span>{music ? <span className="sub">{music.artist}</span> : <span className="sub">Kütüphaneden bir müzik seç</span>}</span>{music ? <span className="text-btn" onClick={(e) => { e.stopPropagation(); setMusic(null); }}>Kaldır</span> : <Icon n="chevRight" size={18} />}</button>
            <button className="opt-row" onClick={() => setTagOpen(true)}><Icon n="user" size={22} /><span className="grow"><span>Kişileri etiketle</span>{tagged.length ? <span className="sub">{tagged.map((u) => '@' + app.nameOf(u)).join(', ')}</span> : null}</span><Icon n="chevRight" size={18} /></button>
            <div className="opt-row"><Icon n="eyeOff" size={22} /><span className="grow"><span>Beğeni sayısını gizle</span><span className="sub">Beğeni sayısını sadece sen görürsün.</span></span><Toggle id="opt-hide" on={hideLikes} onChange={setHideLikes} label="Beğeni sayısını gizle" /></div>
            <div className="opt-row"><Icon n="comment" size={22} /><span className="grow"><span>Yorumları kapat</span><span className="sub">Bu ayarı daha sonra gönderi menüsünden değiştirebilirsin.</span></span><Toggle id="opt-nocom" on={noComments} onChange={setNoComments} label="Yorumları kapat" /></div>
            <div className="opt-row"><Icon n="eyeOff" size={22} /><span className="grow"><span>Hassas içerik olarak işaretle</span><span className="sub">Bulanık görünür, isteyen dokunup açar. 18 yaş altına hiç gösterilmez.</span></span><Toggle id="opt-sensitive" on={sensitive} onChange={setSensitive} label="Hassas içerik olarak işaretle" /></div>
            <div style={{ paddingBlock: 18 }}><button className="btn grad block big" onClick={() => share(false)} disabled={progress != null}>Paylaş</button></div>
          </div>
        ) : null}
        {error ? <div className="g" style={{ color: 'var(--like)', paddingBlock: 12, fontSize: 14 }}>{error}</div> : null}
      </div>
      {step === 'pick' ? (
        <div className="mode-tabs">
          {[['post', 'GÖNDERİ'], ['story', 'HİKAYE'], ['reel', 'REELS']].map((m) => <button key={m[0]} className={mode === m[0] ? 'on' : ''} onClick={() => switchMode(m[0])}>{m[1]}</button>)}
        </div>
      ) : null}
      {progress != null ? <UploadOverlay progress={progress} done={done} /> : null}
      {tagOpen ? <TagPeopleSheet value={tagged} onChange={setTagged} onClose={() => setTagOpen(false)} /> : null}
      {picker}
    </Fragment>
  );
}

function TagPeopleSheet({ value, onChange, onClose }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const ids = Object.keys(app.profiles).filter((u) => u !== app.me.id && !app.blocks[u] && (!term || app.nameOf(u).indexOf(term) >= 0 || (app.profiles[u].displayName || '').toLowerCase().indexOf(term) >= 0))
    .sort((a, b) => (value.indexOf(b) >= 0 ? 2 : 0) + (app.following.has(b) ? 1 : 0) - (value.indexOf(a) >= 0 ? 2 : 0) - (app.following.has(a) ? 1 : 0)).slice(0, 60);
  const toggle = (u) => onChange(value.indexOf(u) >= 0 ? value.filter((x) => x !== u) : value.concat([u]).slice(0, 20));
  return (
    <Sheet onClose={onClose} title="Kişileri etiketle" tall z={70}>
      <div className="g" style={{ paddingBlock: 8 }}><label className="search"><Icon n="search" size={17} /><input id="tag-q" type="search" placeholder="Kişi ara" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      <div className="sheet-body g">
        {ids.length ? ids.map((u) => (
          <PersonRow key={u} uid={u} onClick={() => toggle(u)} right={<span className={'check-ring' + (value.indexOf(u) >= 0 ? ' on' : '')} onClick={() => toggle(u)}>{value.indexOf(u) >= 0 ? <Icon n="check" size={14} stroke={3} /> : null}</span>} />
        )) : <Empty title="Kimse bulunamadı" />}
      </div>
      <div className="g" style={{ paddingBlock: 10 }}><button className="btn grad block big" onClick={onClose}>Bitti{value.length ? ' (' + value.length + ')' : ''}</button></div>
    </Sheet>
  );
}
