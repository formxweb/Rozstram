import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useBack } from './ctx.js';
import { rowMessage, toMs } from './backend.js';
import { REACTIONS, ago, copyText, haptic, mediaUrl, postFilter, snapshotFile } from './lib.js';
import { Avatar, AvatarStack, Empty, Icon, PersonRow, Sheet, Spinner, Toggle, TopBar, UName, useLongPress, useTaps } from './ui.jsx';

const EMOJI_ONLY = new RegExp('^(\\p{Extended_Pictographic}|\\uFE0F|\\u200D|\\s){1,6}$', 'u');
const EDIT_WINDOW = 15 * 60000;

function threadTitle(app, t) {
  if (!t) return '';
  if (t.isGroup) {
    if (t.title) return t.title;
    const names = t.members.filter((m) => m.id !== app.me.id).map((m) => app.nameOf(m.id));
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : '') || 'Grup';
  }
  const o = app.otherOf(t);
  const p = app.profiles[o];
  return (p && (p.displayName || p.username)) || app.nameOf(o);
}

function ThreadAvatar({ t, size }) {
  const app = useApp();
  if (t.isGroup) {
    const ids = t.members.filter((m) => m.id !== app.me.id).map((m) => m.id).slice(0, 2);
    return (
      <span className="group-av" style={{ width: size, height: size }}>
        {ids[1] ? <Avatar uid={ids[1]} size={size * 0.68} /> : null}
        <Avatar uid={ids[0] || app.me.id} size={size * 0.68} />
      </span>
    );
  }
  const o = app.otherOf(t);
  return <Avatar uid={o} size={size} ring={app.storyRing(o)} online={app.isOnline(o)} />;
}

/* ================================================================ gelen kutusu */
export function InboxScreen() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('main');
  const [noteOpen, setNoteOpen] = useState(false);
  const term = q.trim().toLowerCase();
  const list = (tab === 'main' ? app.inboxThreads.filter((t) => !app.isRequest(t)) : app.requestThreads).filter((t) => {
    if (!term) return true;
    if (threadTitle(app, t).toLowerCase().indexOf(term) >= 0) return true;
    return t.members.some((m) => m.id !== app.me.id && app.nameOf(m.id).indexOf(term) >= 0);
  });
  const notes = useMemo(() => {
    const seen = {};
    const cands = app.inboxThreads.filter((t) => !t.isGroup).map((t) => app.otherOf(t)).concat(Array.from(app.following));
    return cands.filter((u) => u && !seen[u] && (seen[u] = true) && app.profiles[u] && !app.blocks[u] && (app.profiles[u].note || app.isOnline(u))).slice(0, 20);
  }, [app.inboxThreads, app.following, app.profiles, app.blocks, app.isOnline]);
  const mine = app.myProfile || {};
  return (
    <Fragment>
      <TopBar back title={mine.username || 'Mesajlar'}
        right={<button className="icon-btn" aria-label="Yeni mesaj" onClick={() => app.push({ type: 'newmsg' })}><Icon n="newmsg" /></button>} />
      <div className="body g">
        <label className="search" style={{ marginBlock: '4px 4px' }}><Icon n="search" size={17} /><input id="inbox-q" type="search" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {!term ? (
          <div className="notes-row">
            <button className="note-item" onClick={() => setNoteOpen(true)}>
              <span className="note-bubble mine">{mine.note || 'Not bırak'}</span>
              <Avatar uid={app.me.id} size={62} />
              <span className="nm">Notun</span>
            </button>
            {notes.map((u) => (
              <button key={u} className="note-item" onClick={() => app.openChatWith(u)}>
                {app.profiles[u].note ? <span className="note-bubble">{app.profiles[u].note}</span> : <span className="note-bubble empty" />}
                <Avatar uid={u} size={62} online={app.isOnline(u)} />
                <span className="nm">{(app.profiles[u].displayName || app.nameOf(u)).split(' ')[0]}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="inbox-tabs">
          <button className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>Mesajlar</button>
          <button className={tab === 'req' ? 'on' : ''} onClick={() => setTab('req')}>İstekler{app.requestThreads.length ? ' (' + app.requestThreads.length + ')' : ''}</button>
        </div>
        {tab === 'req' ? <div className="privacy-note">Takip etmediğin kişilerden gelen mesajlar burada. Sen kabul edene kadar mesajı okuduğunu göremezler.</div> : null}
        {list.length ? list.map((t, i) => {
          const unread = app.isUnread(t);
          const typing = app.typingIn(t.id, t.isGroup ? null : app.otherOf(t));
          const last = t.last;
          const member = app.myMember(t) || {};
          const sender = last && last.from !== app.me.id && t.isGroup ? app.nameOf(last.from) + ': ' : '';
          const preview = !last ? (t.isGroup ? 'Grup oluşturuldu' : 'Sohbeti başlat') : (last.from === app.me.id ? 'Sen: ' : sender) + (last.text || 'Mesaj');
          let seen = false;
          if (last && last.from === app.me.id && !t.isGroup) {
            const o = t.members.find((m) => m.id !== app.me.id);
            seen = !!(o && o.read >= last.at);
          }
          return (
            <button className="row inbox-row" key={t.id} style={{ animationDelay: Math.min(i, 12) * 0.03 + 's' }} onClick={() => app.openThread(t.id)}>
              <ThreadAvatar t={t} size={56} />
              <span className="grow">
                <span style={{ fontWeight: unread ? 800 : 600 }}>{threadTitle(app, t)}</span>
                <span className="sub preview-line" style={unread ? { color: 'var(--fg)', fontWeight: 700 } : undefined}>
                  {typing ? <span className="typing-text">yazıyor…</span> : <span>{seen ? 'Görüldü' : preview}</span>}
                  <span> · {ago(t.at)}</span>
                </span>
              </span>
              {member.muted ? <Icon n="volOff" size={16} className="muted-ico" /> : null}
              {unread && !member.muted ? <span className="unread-dot" /> : null}
            </button>
          );
        }) : tab === 'req'
          ? <Empty icon="mail" title="Mesaj isteği yok" text="Takip etmediğin biri sana mesaj atarsa burada görünür." />
          : <Empty icon="send" title="Mesajların" text="Arkadaşlarına özel fotoğraf, video, sesli mesaj gönder ya da grup kur." action={<button className="btn grad" onClick={() => app.push({ type: 'newmsg' })}>Mesaj gönder</button>} />}
      </div>
      {noteOpen ? <NoteSheet onClose={() => setNoteOpen(false)} /> : null}
    </Fragment>
  );
}

function NoteSheet({ onClose }) {
  const app = useApp();
  const cur = (app.myProfile && app.myProfile.note) || '';
  const [text, setText] = useState(cur);
  const [busy, setBusy] = useState(false);
  const save = async (v) => { setBusy(true); const ok = await app.setNote(v); setBusy(false); if (ok) { app.toast(v ? 'Notun paylaşıldı (24 saat)' : 'Not silindi'); onClose(); } };
  return (
    <Sheet onClose={onClose} title="Not" z={70}>
      <div className="g sheet-body" style={{ paddingBottom: 16 }}>
        <div className="note-edit">
          <span className="note-bubble big">{text || 'Aklından ne geçiyor?'}</span>
          <Avatar uid={app.me.id} size={84} />
        </div>
        <div className="field"><input id="note-input" value={text} maxLength={60} placeholder="Bir şey paylaş…" onChange={(e) => setText(e.target.value)} autoFocus /></div>
        <p className="sub" style={{ textAlign: 'center', paddingBlock: 6 }}>Notlar takipçilerinin mesaj kutusunda 24 saat görünür.</p>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn grad block big" disabled={busy || !text.trim() || text.trim() === cur} onClick={() => save(text)}>Paylaş</button>
          {cur ? <button className="btn block big" disabled={busy} onClick={() => save('')}>Notu sil</button> : null}
        </div>
      </div>
    </Sheet>
  );
}

/* ================================================================ yeni mesaj / grup */
export function NewMessageScreen({ addTo }) {
  const app = useApp();
  const back = useBack();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const thread = addTo ? app.threads.find((t) => t.id === addTo) : null;
  const existing = thread ? thread.members.map((m) => m.id) : [];
  const term = q.trim().toLowerCase();
  const ids = Object.keys(app.profiles).filter((u) => u !== app.me.id && !app.blocks[u] && existing.indexOf(u) < 0
    && (!term || app.nameOf(u).indexOf(term) >= 0 || (app.profiles[u].displayName || '').toLowerCase().indexOf(term) >= 0))
    .sort((a, b) => (app.following.has(b) ? 1 : 0) - (app.following.has(a) ? 1 : 0)).slice(0, 80);
  const toggle = (u) => { haptic(6); setSel((s) => (s.indexOf(u) >= 0 ? s.filter((x) => x !== u) : s.concat([u]))); };
  const go = async () => {
    if (!sel.length || busy) return;
    setBusy(true);
    if (addTo) {
      const ok = await app.addGroupMembers(addTo, sel);
      setBusy(false);
      if (ok) { app.toast(sel.length + ' kişi eklendi'); back(); }
      return;
    }
    let tid = null;
    if (sel.length === 1) tid = await app.ensureDm(sel[0]);
    else tid = await app.createGroup(sel, title.trim());
    setBusy(false);
    if (tid) app.replaceTop({ type: 'chat', tid });
  };
  return (
    <Fragment>
      <TopBar back title={addTo ? 'Kişi ekle' : 'Yeni mesaj'} line
        right={sel.length ? <button className="text-btn" onClick={go} disabled={busy}>{busy ? '…' : addTo ? 'Ekle' : sel.length > 1 ? 'Grup kur' : 'Sohbet'}</button> : null} />
      <div className="g" style={{ paddingBlock: 10, flex: 'none', display: 'grid', gap: 8 }}>
        {sel.length ? (
          <div className="chips-sel">{sel.map((u) => <button key={u} className="chip on" onClick={() => toggle(u)}>{app.nameOf(u)} <Icon n="close" size={13} /></button>)}</div>
        ) : null}
        <label className="search"><span style={{ fontWeight: 700, color: 'var(--fg)' }}>Kime:</span><input id="newmsg-q" placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
        {sel.length > 1 && !addTo ? <label className="search"><Icon n="users" size={17} /><input id="group-title" placeholder="Grup adı (isteğe bağlı)" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></label> : null}
      </div>
      <div className="body g">
        <div className="inbox-head"><span>{term ? 'Sonuçlar' : 'Önerilenler'}</span></div>
        {ids.length ? ids.map((u) => (
          <PersonRow key={u} uid={u} sub={app.lastSeenText(u)} onClick={() => toggle(u)}
            right={<span className={'check-ring' + (sel.indexOf(u) >= 0 ? ' on' : '')} onClick={() => toggle(u)}>{sel.indexOf(u) >= 0 ? <Icon n="check" size={14} stroke={3} /> : null}</span>} />
        )) : <Empty title="Kimse bulunamadı" text={term ? 'Bu aramayla eşleşen hesap yok.' : 'Rozstram’da henüz başka kimse yok. Arkadaşlarını davet et!'} />}
      </div>
    </Fragment>
  );
}

/* ================================================================ mesaj parçaları */
function SharedPost({ id }) {
  const app = useApp();
  const post = app.postById[id];
  const [tried, setTried] = useState(false);
  useEffect(() => { if (!post && !tried) { setTried(true); app.ensurePost(id); } }, [id, !!post]);
  if (!post) return <div className="bubble unsent">{tried ? 'Gönderi görüntülenemiyor' : '…'}</div>;
  const m = (post.media || [])[0] || {};
  const thumb = m.type === 'video' ? m.thumb : m.id;
  return (
    <button className="shared-post" onClick={() => app.openPost(id)}>
      <span className="hd"><Avatar uid={post.author} size={24} />{app.nameOf(post.author)}</span>
      {thumb ? <img src={mediaUrl(thumb)} alt="" style={{ filter: postFilter(post) }} /> : null}
      {post.caption ? <span className="cap">{post.caption}</span> : null}
    </button>
  );
}

function fmtDur(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function VoiceNote({ src, duration, seed }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const [dur, setDur] = useState(duration || 0);
  const bars = useMemo(() => {
    let x = 0;
    for (let i = 0; i < (seed || '').length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 28 }, () => { x = (x * 1103515245 + 12345) >>> 0; return 0.25 + ((x >> 16) % 75) / 100; });
  }, [seed]);
  const toggle = (e) => {
    e.stopPropagation();
    const a = ref.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => {}); } else a.pause();
  };
  return (
    <div className="voice">
      <button onClick={toggle} aria-label={playing ? 'Duraklat' : 'Oynat'}><Icon n={playing ? 'pause' : 'play'} size={18} fill={!playing} /></button>
      <div className="wave">{bars.map((h, i) => <i key={i} style={{ height: h * 100 + '%', opacity: i / bars.length < prog ? 1 : 0.4 }} />)}</div>
      <span className="t">{fmtDur(playing || prog ? (dur * prog) : dur)}</span>
      <audio ref={ref} src={src} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProg(0); }}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setDur(d); }}
        onTimeUpdate={(e) => { const a = e.currentTarget; const d = isFinite(a.duration) && a.duration > 0 ? a.duration : dur; if (d) setProg(a.currentTime / d); }} />
    </div>
  );
}

function MessageBubble({ m, mine, isGroup, showAvatar, showName, gap, onMenu, onDouble, onImage }) {
  const app = useApp();
  const lp = useLongPress(() => { haptic(12); onMenu(m); }, 420);
  const tap = useTaps(null, () => onDouble(m));
  const onlyEmoji = m.text && !m.media && !m.post && EMOJI_ONLY.test(m.text);
  const reacts = Object.keys(m.reactions || {}).map((k) => m.reactions[k]).filter(Boolean);
  const media = m.media;
  let content;
  if (m.unsent) content = <div className="bubble unsent">{mine ? 'Bir mesajı geri aldın' : 'Mesaj geri alındı'}</div>;
  else if (m.post) content = <SharedPost id={m.post} />;
  else if (media && media.type === 'image') content = <img className="msg-img" src={mediaUrl(media.id)} alt="Gönderilen fotoğraf" draggable="false" onClick={(e) => { e.stopPropagation(); onImage(mediaUrl(media.id)); }} />;
  else if (media && media.type === 'video') content = <video className="msg-img" src={mediaUrl(media.id)} poster={media.thumb ? mediaUrl(media.thumb) : undefined} controls playsInline preload="metadata" />;
  else if (media && media.type === 'audio') content = <div className="bubble voice-wrap"><VoiceNote src={mediaUrl(media.id)} duration={media.duration} seed={m.id} /></div>;
  else content = <div className={'bubble' + (onlyEmoji ? ' emoji' : '')}>{m.text}</div>;
  const caption = !m.unsent && m.text && (m.media || m.post) ? <div className="bubble" style={{ marginTop: 4 }}>{m.text}</div> : null;
  return (
    <div className={'bubble-row' + (mine ? ' me' : '') + (gap ? ' gap' : '') + (m.pending ? ' pending' : '')}>
      {!mine ? <div style={{ width: 28, flex: 'none' }}>{showAvatar ? <Avatar uid={m.from} size={28} onClick={() => app.openUser(m.from)} /> : null}</div> : null}
      <div className="bwrap" {...(m.unsent ? {} : lp.handlers)} onClick={() => { if (lp.fired.current) { lp.fired.current = false; return; } if (!m.unsent) tap(); }}>
        {showName && isGroup && !mine ? <div className="sender-name">{app.nameOf(m.from)}</div> : null}
        {m.replyTo && !m.unsent ? <div className="reply-quote">↪ {m.replyTo.from === app.me.id ? 'Sen' : app.nameOf(m.replyTo.from)}: {m.replyTo.text}</div> : null}
        {m.story && !m.unsent ? (
          <Fragment>
            <div className="reply-tag">{mine ? 'Hikayesine yanıt verdin' : m.story.author === app.me.id ? 'Hikayene yanıt verdi' : 'Hikayeye yanıt'}</div>
            {m.story.thumb ? <img src={mediaUrl(m.story.thumb)} alt="" className="story-thumb" /> : m.story.text ? <div className="story-thumb text">{m.story.text}</div> : null}
          </Fragment>
        ) : null}
        {content}
        {caption}
        {m.edited && !m.unsent ? <span className="edited">Düzenlendi</span> : null}
        {reacts.length ? <span className="reacts">{reacts.slice(0, 3).join('')}{reacts.length > 1 ? ' ' + reacts.length : ''}</span> : null}
      </div>
    </div>
  );
}

function pickMime() {
  const opts = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return opts.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
}

function VoiceRecorder({ onSend, onCancel }) {
  const app = useApp();
  const [sec, setSec] = useState(0);
  const [ready, setReady] = useState(false);
  const rec = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const started = useRef(0);
  const mode = useRef('cancel');
  useEffect(() => {
    let alive = true;
    let iv = null;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const mime = pickMime();
        const r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
        rec.current = r;
        r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
        r.onstop = () => {
          s.getTracks().forEach((t) => t.stop());
          if (mode.current !== 'send') return;
          const type = (r.mimeType || mime || 'audio/webm').split(';')[0];
          const blob = new Blob(chunks.current, { type });
          const dur = (Date.now() - started.current) / 1000;
          if (dur < 0.8 || !blob.size) { app.toast('Kaydetmek için biraz daha uzun konuş.'); onCancel(); return; }
          onSend(blob, dur);
        };
        r.start(250);
        started.current = Date.now();
        setReady(true);
        iv = setInterval(() => {
          const d = (Date.now() - started.current) / 1000;
          setSec(d);
          if (d >= 120) { mode.current = 'send'; r.stop(); clearInterval(iv); }
        }, 200);
      } catch (e) {
        app.toast('Mikrofona erişilemedi. Tarayıcı ayarlarından izin ver.');
        onCancel();
      }
    })();
    return () => {
      alive = false;
      clearInterval(iv);
      try { if (rec.current && rec.current.state !== 'inactive') { if (mode.current !== 'send') mode.current = 'cancel'; rec.current.stop(); } } catch (e) { /* yok say */ }
      if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const stop = (m) => { mode.current = m; try { if (rec.current && rec.current.state !== 'inactive') rec.current.stop(); } catch (e) { /* yok say */ } if (m === 'cancel') onCancel(); };
  return (
    <div className="chat-input rec">
      <button aria-label="İptal" className="rec-x" onClick={() => stop('cancel')}><Icon n="trash" size={20} /></button>
      <span className="rec-dot" />
      <span className="rec-time">{ready ? fmtDur(sec) : 'Hazırlanıyor…'}</span>
      <span className="grow sub">Kaydediliyor</span>
      <button className="rec-send" aria-label="Gönder" disabled={!ready} onClick={() => stop('send')}><Icon n="send" size={20} /></button>
    </div>
  );
}

/* ================================================================ sohbet */
export function ChatScreen({ tid }) {
  const app = useApp();
  const thread = app.threads.find((t) => t.id === tid);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [sending, setSending] = useState(0);
  const [recording, setRecording] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const stick = useRef(true);
  const isGroup = !!(thread && thread.isGroup);
  const other = thread && !isGroup ? app.otherOf(thread) : null;
  const typing = thread ? app.typingIn(tid, other) : false;
  const isReq = thread ? app.isRequest(thread) : false;
  const blocked = other && app.blocks[other];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    app.loadMessages(tid).then((list) => {
      if (!alive || !list) { setLoading(false); return; }
      setMsgs((cur) => {
        const m = {};
        list.forEach((x) => { m[x.id] = x; });
        cur.forEach((x) => { if (!m[x.id] && x.pending) m[x.id] = x; });
        return Object.keys(m).map((k) => m[k]).sort((a, b) => a.at - b.at);
      });
      setMore(list.length >= 80);
      setLoading(false);
    });
    const off = app.onChat((table, ev, nw, old) => {
      if (table === 'messages') {
        if (ev === 'DELETE') { setMsgs((l) => l.filter((x) => x.id !== old.id)); return; }
        if (nw.thread_id !== tid) return;
        setMsgs((l) => {
          const i = l.findIndex((x) => x.id === nw.id);
          const row = { ...rowMessage(nw, i >= 0 ? l[i] : null), pending: !!nw.pending };
          if (i >= 0) { const n = l.slice(); n[i] = row; return n; }
          return l.concat([row]).sort((a, b) => a.at - b.at);
        });
      } else {
        const r = ev === 'DELETE' ? old : nw;
        setMsgs((l) => l.map((x) => {
          if (x.id !== r.message_id) return x;
          const reactions = { ...(x.reactions || {}) };
          if (ev === 'DELETE') delete reactions[r.user_id]; else reactions[r.user_id] = nw.emoji;
          return { ...x, reactions };
        }));
      }
    });
    return () => { alive = false; off(); };
  }, [tid]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: msgs.length > 1 ? 'smooth' : 'auto' });
  }, [msgs.length, typing, sending]);
  const lastAt = thread && thread.last ? thread.last.at : 0;
  useEffect(() => { if (thread && !isReq) app.markRead(thread); }, [lastAt, !!thread, isReq]);
  useEffect(() => () => { clearTimeout(typingTimer.current); app.setTyping(null); }, []);

  const loadOlder = async () => {
    if (!msgs.length) return;
    const el = scrollRef.current;
    const h0 = el ? el.scrollHeight : 0;
    const list = await app.loadMessages(tid, msgs[0].at);
    if (!list) return;
    stick.current = false;
    setMsgs((cur) => { const m = {}; list.concat(cur).forEach((x) => { m[x.id] = x; }); return Object.keys(m).map((k) => m[k]).sort((a, b) => a.at - b.at); });
    setMore(list.length >= 80);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - h0; });
  };
  const onScroll = (e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };

  const onType = (v) => {
    setText(v);
    app.setTyping(v ? tid : null);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => app.setTyping(null), 2500);
  };
  const quote = (m) => ({ id: m.id, from: m.from, text: (m.text || (m.media ? (m.media.type === 'audio' ? '🎤 Sesli mesaj' : m.media.type === 'video' ? '🎬 Video' : '📷 Fotoğraf') : 'Gönderi')).slice(0, 80) });
  const send = async (payload, file) => {
    stick.current = true;
    const extra = replyTo ? { replyTo: quote(replyTo) } : {};
    if (file) setSending((n) => n + 1);
    const ok = await app.sendMessage(tid, { ...payload, ...extra }, file);
    if (file) setSending((n) => n - 1);
    if (ok) setReplyTo(null);
    return ok;
  };
  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    if (editing) {
      app.setTyping(null);
      const ok = await app.editMessage(tid, editing, t);
      if (ok) { setEditing(null); setText(''); }
      return;
    }
    setText('');
    const ok = await send({ text: t });
    if (!ok) setText(t);
  };

  if (!thread) {
    return (
      <Fragment>
        <TopBar back title="Sohbet" line />
        <div className="body"><Empty icon="send" title="Sohbet bulunamadı" text="Bu sohbetten çıkmış ya da sohbet silinmiş olabilir." /></div>
      </Fragment>
    );
  }

  const p = (other && app.profiles[other]) || {};
  const lastMine = [...msgs].reverse().find((m) => m.from === app.me.id && !m.unsent && !m.pending);
  let seenText = null;
  if (lastMine) {
    const readers = thread.members.filter((m) => m.id !== app.me.id && m.read >= lastMine.at);
    if (!isGroup && readers.length) seenText = 'Görüldü';
    else if (isGroup && readers.length) seenText = 'Görenler: ' + readers.slice(0, 3).map((r) => app.nameOf(r.id)).join(', ') + (readers.length > 3 ? ' +' + (readers.length - 3) : '');
  }
  const memberCount = thread.members.length;
  const sub = typing ? 'yazıyor…' : isGroup ? memberCount + ' kişi' : app.lastSeenText(other);

  return (
    <Fragment>
      <TopBar back line left={(
        <button className="row" style={{ padding: 0, minWidth: 0 }} onClick={() => (isGroup ? app.push({ type: 'groupinfo', tid }) : app.openUser(other))}>
          <ThreadAvatar t={thread} size={36} />
          <span className="grow"><span className="uname">{threadTitle(app, thread)}</span><span className="sub">{sub}</span></span>
        </button>
      )} right={isGroup ? <button className="icon-btn" aria-label="Grup bilgisi" onClick={() => app.push({ type: 'groupinfo', tid })}><Icon n="info" /></button>
        : <button className="icon-btn" aria-label="Sohbet seçenekleri" onClick={() => app.setSheet({
          items: [
            { label: 'Profili gör', icon: 'user', onClick: () => app.openUser(other) },
            { label: (app.myMember(thread) || {}).muted ? 'Bildirimleri aç' : 'Sessize al', icon: 'volOff', onClick: () => app.muteThread(thread, !(app.myMember(thread) || {}).muted) },
            { label: app.blocks[other] ? 'Engeli kaldır' : 'Engelle', icon: 'shield', danger: !app.blocks[other], onClick: () => (app.blocks[other] ? app.unblock(other) : app.block(other)) },
            { label: 'Şikayet et', icon: 'flag', danger: true, onClick: () => app.openReport('user', other) },
            { label: 'Sohbeti sil', icon: 'trash', danger: true, onClick: () => app.confirm({ title: 'Sohbet silinsin mi?', text: 'Sohbet senin mesaj kutundan kaldırılır.', ok: 'Sil', danger: true, onOk: () => app.leaveThread(thread) }) },
          ],
        })}><Icon n="info" /></button>} />
      <div className="body g" ref={scrollRef} onScroll={onScroll}>
        {!more ? (
          <div className="chat-intro">
            <ThreadAvatar t={thread} size={92} />
            <b>{threadTitle(app, thread)}</b>
            {isGroup ? <span className="sub">{memberCount} kişi · Rozstram grubu</span> : <span className="sub">@{app.nameOf(other)} · {p.private ? 'Gizli hesap' : 'Rozstram'}</span>}
            <button className="btn small" style={{ marginTop: 8 }} onClick={() => (isGroup ? app.push({ type: 'groupinfo', tid }) : app.openUser(other))}>{isGroup ? 'Grubu gör' : 'Profili gör'}</button>
          </div>
        ) : <button className="load-older" onClick={loadOlder}>Daha eski mesajlar</button>}
        {loading && !msgs.length ? <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}><Spinner /></div> : null}
        <div className="bubbles">
          {msgs.map((m, i) => {
            const mine = m.from === app.me.id;
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            const stamp = !prev || m.at - prev.at > 36e5;
            const lastOfRun = !next || next.from !== m.from || next.at - m.at > 36e5;
            const firstOfRun = !prev || prev.from !== m.from || stamp;
            return (
              <Fragment key={m.id}>
                {stamp ? <div className="stamp">{new Date(m.at).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div> : null}
                <MessageBubble m={m} mine={mine} isGroup={isGroup} showAvatar={lastOfRun} showName={firstOfRun} gap={!!prev && prev.from !== m.from && !stamp}
                  onMenu={setMenu} onDouble={(x) => app.reactMessage(tid, x, '❤️')} onImage={setLightbox} />
                {lastMine && m.id === lastMine.id && seenText && !typing ? <div className="seen">{seenText}</div> : null}
              </Fragment>
            );
          })}
          {typing ? <div className="bubble-row"><div style={{ width: 28 }}>{other ? <Avatar uid={other} size={28} /> : null}</div><span className="typing"><i /><i /><i /></span></div> : null}
          {sending > 0 ? <div className="bubble-row me"><div className="bwrap"><div className="msg-img" style={{ display: 'grid', placeItems: 'center', height: 120 }}><span className="spinner" /></div></div></div> : null}
        </div>
      </div>
      {isReq ? (
        <div className="req-bar g">
          <p><b>{threadTitle(app, thread)}</b> sana mesaj göndermek istiyor. Kabul edersen mesajları okuduğunu görebilir.</p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn block" onClick={() => app.confirm({ title: 'İstek silinsin mi?', ok: 'Sil', danger: true, onOk: () => app.leaveThread(thread) })}>Sil</button>
            {other ? <button className="btn block" onClick={() => app.block(other)}>Engelle</button> : null}
            <button className="btn primary block" onClick={() => app.acceptThread(thread)}>Kabul et</button>
          </div>
        </div>
      ) : blocked ? (
        <div className="req-bar g">
          <p>Bu hesabı engelledin. Mesaj göndermek için engeli kaldır.</p>
          <button className="btn primary block" onClick={() => app.unblock(other)}>Engeli kaldır</button>
        </div>
      ) : (
        <div className="chat-composer g">
          {replyTo || editing ? (
            <div className="reply-chip">
              <span>{editing ? <Fragment><Icon n="edit" size={13} /> Mesajı düzenliyorsun</Fragment> : <Fragment>↪ <b>{replyTo.from === app.me.id ? 'Kendine' : app.nameOf(replyTo.from)}</b> yanıt veriyorsun</Fragment>}</span>
              <button onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(''); } }} aria-label="İptal"><Icon n="close" size={16} /></button>
            </div>
          ) : null}
          {recording ? (
            <VoiceRecorder onCancel={() => setRecording(false)} onSend={async (blob, dur) => { setRecording(false); await send({ duration: dur }, blob); }} />
          ) : (
            <div className="chat-input">
              <button className="cam" aria-label="Fotoğraf ya da video gönder" onClick={() => fileRef.current && fileRef.current.click()}><Icon n="camera" size={20} /></button>
              <input ref={fileRef} id="chat-file" type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) snapshotFile(f).then((c) => send({}, c), () => app.toast('Bu dosya okunamadı. Telefonuna indirip tekrar seç.')); }} />
              <textarea id="chat-input" rows={1} placeholder={editing ? 'Mesajı düzenle…' : 'Mesaj…'} value={text} maxLength={2000} onChange={(e) => onType(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }} />
              {text.trim()
                ? <button className="text-btn" onClick={sendText}>{editing ? 'Kaydet' : 'Gönder'}</button>
                : (
                  <Fragment>
                    {typeof MediaRecorder !== 'undefined' ? <button aria-label="Sesli mesaj kaydet" onClick={() => setRecording(true)}><Icon n="mic" size={24} /></button> : null}
                    <button aria-label="Kalp gönder" onClick={() => send({ text: '❤️' })}><Icon n="heart" size={26} /></button>
                  </Fragment>
                )}
            </div>
          )}
        </div>
      )}
      {menu ? (
        <div className="react-layer" onClick={() => setMenu(null)}>
          <div className="react-bar" onClick={(e) => e.stopPropagation()}>
            {REACTIONS.map((r) => (
              <button key={r} className={menu.reactions && menu.reactions[app.me.id] === r ? 'on' : ''} onClick={() => { app.reactMessage(tid, menu, r); setMenu(null); }} aria-label={'Tepki ' + r}>{r}</button>
            ))}
          </div>
          <div className="react-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setReplyTo(menu); setEditing(null); setMenu(null); }}>Yanıtla <Icon n="reply" size={18} /></button>
            {menu.text ? <button onClick={async () => { const ok = await copyText(menu.text); app.toast(ok ? 'Kopyalandı' : 'Kopyalanamadı'); setMenu(null); }}>Kopyala <Icon n="copy" size={18} /></button> : null}
            {menu.from === app.me.id && menu.text && !menu.media && !menu.post && Date.now() - menu.at < EDIT_WINDOW
              ? <button onClick={() => { setEditing(menu); setReplyTo(null); setText(menu.text); setMenu(null); }}>Düzenle <Icon n="edit" size={18} /></button> : null}
            {menu.from === app.me.id ? <button className="danger" onClick={() => { app.unsendMessage(tid, menu); setMenu(null); }}>Geri al <Icon n="undo" size={18} /></button>
              : <button className="danger" onClick={() => { app.openReport('message', menu.id); setMenu(null); }}>Şikayet et <Icon n="flag" size={18} /></button>}
          </div>
        </div>
      ) : null}
      {lightbox ? (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Fotoğraf">
          <img src={lightbox} alt="" />
          <button className="icon-btn close" aria-label="Kapat"><Icon n="close" size={28} /></button>
        </div>
      ) : null}
    </Fragment>
  );
}

/* ================================================================ grup bilgisi */
export function GroupInfoScreen({ tid }) {
  const app = useApp();
  const t = app.threads.find((x) => x.id === tid);
  const [title, setTitle] = useState(t ? t.title || '' : '');
  if (!t) return <Fragment><TopBar back title="Grup" line /><div className="body"><Empty title="Grup bulunamadı" /></div></Fragment>;
  const mine = app.myMember(t) || {};
  return (
    <Fragment>
      <TopBar back title="Grup bilgisi" line />
      <div className="body g">
        <div className="chat-intro" style={{ paddingBottom: 8 }}>
          <ThreadAvatar t={t} size={84} />
          <b>{threadTitle(app, t)}</b>
          <span className="sub">{t.members.length} kişi</span>
        </div>
        <div className="field"><label htmlFor="gi-title">Grup adı</label>
          <div className="row" style={{ gap: 8 }}>
            <input id="gi-title" value={title} maxLength={60} placeholder="Grup adı" onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
            <button className="btn small primary" disabled={title.trim() === (t.title || '')} onClick={() => app.renameGroup(tid, title.trim())}>Kaydet</button>
          </div>
        </div>
        <div className="set-row"><Icon n="volOff" size={24} /><span className="grow"><span>Mesajları sessize al</span></span><Toggle id="gi-mute" on={!!mine.muted} onChange={(v) => app.muteThread(t, v)} label="Sessize al" /></div>
        <div className="set-head">Kişiler</div>
        <button className="set-row" onClick={() => app.push({ type: 'newmsg', addTo: tid })}><Icon n="plusCircle" size={24} /><span className="grow"><span>Kişi ekle</span></span></button>
        {t.members.map((m) => <PersonRow key={m.id} uid={m.id} sub={m.id === app.me.id ? 'Sen' : t.createdBy === m.id ? 'Grubu kurdu' : undefined} right={m.id === app.me.id ? null : undefined} />)}
        <div style={{ paddingBlock: 18 }}>
          <button className="btn block big danger-btn" onClick={() => app.confirm({ title: 'Gruptan çıkılsın mı?', text: 'Gruptaki mesajları artık göremezsin.', ok: 'Çık', danger: true, onOk: () => app.leaveThread(t) })}>Gruptan çık</button>
        </div>
      </div>
    </Fragment>
  );
}
