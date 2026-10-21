import { Fragment, useEffect, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { QUICK_EMOJIS, STORY_BGS, ago, filterCss, haptic, isOn, mediaUrl, onKeys, postFilter } from './lib.js';
import { Avatar, AvatarStack, Empty, Icon, PersonRow, Sheet, Vid, useBackClose } from './ui.jsx';
import { MusicTag, useMusic } from './player.jsx';

export function StoryText({ t, small }) {
  if (!t) return null;
  return (
    <div className="text-bg" style={{ background: STORY_BGS[t.bg || 0] || STORY_BGS[0] }}>
      <div className={'story-text f-' + (t.font || 'klasik')} style={{ color: t.color || '#fff', fontSize: small ? 12 : undefined }}>{t.body}</div>
    </div>
  );
}

export function StoryMedia({ s, playing, onMeta, small }) {
  const app = useApp();
  if (!s) return null;
  if (s.text) return <StoryText t={s.text} small={small} />;
  const f = filterCss(s.filter, s.adjust);
  const shared = s.sharedPost ? app.postById[s.sharedPost] : null;
  return (
    <Fragment>
      {shared ? (
        <div className="text-bg" style={{ background: STORY_BGS[3] }}>
          <div className="shared-card">
            <div className="hd"><Avatar uid={shared.author} size={24} />{app.nameOf(shared.author)}</div>
            <img src={mediaUrl(s.media.id)} alt="" style={{ filter: postFilter(shared) }} />
            {shared.caption && !small ? <div className="cap">{shared.caption}</div> : null}
          </div>
        </div>
      ) : s.media.type === 'video'
        ? <Vid src={mediaUrl(s.media.id)} poster={s.media.thumb ? mediaUrl(s.media.thumb) : undefined} filter={f} playing={playing} loop={false} onMeta={onMeta} forceMute={!!s.music} />
        : <img src={mediaUrl(s.media.id)} alt="" style={f ? { filter: f } : undefined} draggable="false" />}
      {s.overlay && s.overlay.text ? (
        <div className="overlay-text" style={{ left: (s.overlay.x || 0.5) * 100 + '%', top: (s.overlay.y || 0.5) * 100 + '%', color: s.overlay.color || '#fff', fontSize: small ? 9 : undefined }}>{s.overlay.text}</div>
      ) : null}
    </Fragment>
  );
}

export function StoryViewer({ groups, index, highlight, archive, startAt, onClose }) {
  const app = useApp();
  const [gi, setGi] = useState(index || 0);
  const [si, setSi] = useState(startAt || 0);
  const [dir, setDir] = useState('');
  const [paused, setPaused] = useState(false);
  const [hideUi, setHideUi] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState('');
  const [viewers, setViewers] = useState(false);
  const [dur, setDur] = useState(5);
  const [drag, setDrag] = useState(null);
  const [closing, setClosing] = useState(false);
  const [flyers, setFlyers] = useState([]);
  const [likePop, setLikePop] = useState(0);
  const g0 = useRef(null);
  const holdTimer = useRef(null);
  const held = useRef(false);
  const moved = useRef(false);

  const group = groups[gi];
  const live = group ? group.items.map((s) => app.storyById[s.id] || (archive || highlight ? s : null)).filter(Boolean) : [];
  const items = live.length ? live : [];
  const story = items[Math.min(si, Math.max(0, items.length - 1))];
  const uid = group && group.uid;
  const isMe = uid === app.me.id;
  const stopped = paused || typing || viewers || closing;
  useMusic(story && story.music, !!story && !stopped, 'story:' + (story ? story.id : ''));

  const close = () => { if (closing) return; setClosing(true); setTimeout(onClose, 200); };
  useBackClose(close);
  useEffect(() => { if (!story) close(); }, [!!story]);
  useEffect(() => {
    if (!story) return;
    app.markStorySeen(story);
    setDur(story.media && story.media.type === 'video' && !story.sharedPost ? 0 : story.music ? Math.min(15, Math.max(5, story.music.dur || 15)) : 5);
  }, [story && story.id]);

  const goGroup = (d) => {
    const n = gi + d;
    if (n < 0 || n >= groups.length) { if (d > 0) close(); return; }
    setDir(d > 0 ? 'in-r' : 'in-l');
    setGi(n); setSi(0);
  };
  const next = () => { if (si < items.length - 1) setSi(si + 1); else goGroup(1); };
  const prev = () => { if (si > 0) setSi(si - 1); else if (gi > 0) goGroup(-1); };

  const onDown = (e) => {
    g0.current = { x: e.clientX, y: e.clientY };
    moved.current = false; held.current = false;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { held.current = true; setPaused(true); setHideUi(true); }, 220);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
  };
  const onMove = (e) => {
    if (!g0.current) return;
    const dx = e.clientX - g0.current.x, dy = e.clientY - g0.current.y;
    if (!moved.current && Math.hypot(dx, dy) > 12) { moved.current = true; clearTimeout(holdTimer.current); setPaused(true); }
    if (moved.current) setDrag(Math.abs(dy) > Math.abs(dx) ? { dy: Math.max(0, dy), dx: 0 } : { dx, dy: 0 });
  };
  const onUp = (e) => {
    if (!g0.current) return;
    const dx = e.clientX - g0.current.x, dy = e.clientY - g0.current.y;
    const w = e.currentTarget.clientWidth || 400;
    g0.current = null;
    clearTimeout(holdTimer.current);
    setDrag(null);
    if (moved.current) {
      setPaused(false);
      if (dy > 110 && Math.abs(dy) > Math.abs(dx)) close();
      else if (dx < -70) goGroup(1);
      else if (dx > 70) goGroup(-1);
      return;
    }
    if (held.current) { held.current = false; setPaused(false); setHideUi(false); return; }
    if (e.clientX - e.currentTarget.getBoundingClientRect().left < w * 0.3) prev(); else next();
  };

  const sendReply = async (text) => {
    const t = (text || reply).trim();
    if (!t || !story) return;
    const thumb = story.media ? (story.media.type === 'video' ? story.media.thumb || null : story.media.id) : null;
    const ok = await app.sendTo(uid, { text: t, story: { id: story.id, thumb, text: story.text ? story.text.body.slice(0, 60) : null, author: uid } });
    if (ok && !text) { setReply(''); app.toast('Yanıtın gönderildi'); }
  };
  const fly = (emoji) => {
    haptic(10);
    const k = Date.now() + Math.random();
    setFlyers((f) => f.concat([{ k, emoji, x: 20 + Math.random() * 60, r: Math.random() * 40 - 20 }]));
    setTimeout(() => setFlyers((f) => f.filter((x) => x.k !== k)), 1400);
    sendReply(emoji);
    if (document.activeElement) document.activeElement.blur();
    setTyping(false);
  };
  const more = () => {
    setPaused(true);
    const items2 = [];
    if (isMe) {
      if (story.media || story.text) items2.push({ label: 'Öne çıkar', icon: 'star', onClick: () => { app.setPanel({ type: 'highlight', storyId: story.id, k: Date.now() }); } });
      if (highlight) items2.push({ label: 'Öne çıkanı sil', icon: 'trash', danger: true, onClick: () => app.confirm({ title: '"' + highlight.title + '" silinsin mi?', ok: 'Sil', danger: true, onOk: () => { app.removeHighlight(highlight.id); close(); } }) });
      items2.push({ label: 'Hikayeyi sil', icon: 'trash', danger: true, onClick: () => app.confirm({ title: 'Hikaye silinsin mi?', ok: 'Sil', danger: true, onOk: () => { app.deleteStory(story); }, onCancel: () => setPaused(false) }) });
    } else {
      items2.push({ label: 'Profile git', icon: 'user', onClick: () => { close(); app.openUser(uid); } });
      items2.push({ label: 'Mesaj gönder', icon: 'send', onClick: () => { close(); app.openChatWith(uid); } });
      items2.push({ label: app.mutes[uid] ? 'Sesini aç' : 'Hikayelerini sessize al', icon: 'volOff', onClick: () => { app.setMute(uid, !app.mutes[uid]); if (!app.mutes[uid]) close(); } });
      items2.push({ label: 'Şikayet et', icon: 'flag', danger: true, onClick: () => app.openReport('story', story.id) });
    }
    app.setSheet({ items: items2 });
    setTimeout(() => setPaused(false), 400);
  };

  if (!story) return null;
  const liked = isOn(story.likes, app.me.id);
  const viewIds = onKeys(story.views).filter((k) => k !== app.me.id);
  const shared = story.sharedPost ? app.postById[story.sharedPost] : null;
  const frameStyle = drag ? { transform: drag.dy ? 'translateY(' + drag.dy + 'px) scale(' + Math.max(0.82, 1 - drag.dy / 900) + ')' : 'translateX(' + drag.dx + 'px)', transition: 'none', borderRadius: drag.dy ? 24 : 0, overflow: 'hidden' } : undefined;

  return (
    <div className={'story' + (closing ? ' closing' : '')} role="dialog" aria-label={app.nameOf(uid) + ' hikayesi'}>
      <div className={'frame ' + dir} key={uid} style={frameStyle}>
        <div className="stage" key={story.id}>
          <StoryMedia s={story} playing={!stopped} onMeta={(e) => setDur(Math.min(30, Math.max(3, e.currentTarget.duration || 8)))} />
        </div>
        <div className={'top' + (hideUi ? ' ui-hidden' : '')}>
          <div className="bars">
            {items.map((s, i) => (
              <i key={s.id} className={i < si ? 'done' : i === si ? 'cur' : ''}>
                {i === si ? <b key={story.id + ':' + dur} style={{ '--d': (dur || 600) + 's', animationPlayState: stopped || !dur ? 'paused' : 'running' }} onAnimationEnd={next} /> : <b />}
              </i>
            ))}
          </div>
          <div className="hdr">
            <button className="who" onClick={() => { close(); app.openUser(uid); }}>
              <Avatar uid={uid} size={32} />
              <b>{highlight ? highlight.title : app.nameOf(uid)}</b>
              {story.closeFriends && !highlight ? <span className="cf-pill"><Icon n="star" size={11} fill /> Yakın Arkadaşlar</span> : null}
              <small>{ago(story.at)}</small>
            </button>
            <div className="r">
              {story.music || (story.media && story.media.type === 'video') ? (
                <button onClick={() => app.setSound(!app.sound)} aria-label={app.sound ? 'Sesi kapat' : 'Sesi aç'}><Icon n={app.sound ? 'volOn' : 'volOff'} size={24} /></button>
              ) : null}
              <button onClick={more} aria-label="Seçenekler"><Icon n="more" size={24} /></button>
              <button onClick={close} aria-label="Kapat"><Icon n="close" size={28} /></button>
            </div>
          </div>
        </div>
        <div className="taps" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()}>
          <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            <button onClick={prev}>Önceki</button><button onClick={next}>Sonraki</button>
          </span>
        </div>
        {story.music && !hideUi ? <div className="story-music"><MusicTag m={story.music} dark onClick={() => { close(); app.openMusic(story.music.id); }} /></div> : null}
        {shared && !hideUi ? <button className="shared-go" onClick={() => { close(); app.openPost(shared.id); }}>Gönderiye git</button> : null}
        {typing && !reply && !isMe ? (
          <div className="quick-react" onPointerDown={(e) => e.preventDefault()}>
            <p>Hızlı tepkiler</p>
            {QUICK_EMOJIS.map((e) => <button key={e} onClick={() => fly(e)} aria-label={e}>{e}</button>)}
          </div>
        ) : null}
        <div className={'bottom' + (hideUi ? ' ui-hidden' : '')}>
          {isMe ? (
            <div className="own-bar">
              <button className="viewers" onClick={() => setViewers(true)}>
                {viewIds.length ? <AvatarStack ids={viewIds} size={22} /> : <Icon n="eye" size={22} />}
                <span>{viewIds.length ? viewIds.length + ' görüntüleme' : 'Henüz görüntüleme yok'}</span>
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => app.setPanel({ type: 'highlight', storyId: story.id, k: Date.now() })}><Icon n="star" size={22} />Öne çıkar</button>
                <button onClick={() => { setPaused(true); app.confirm({ title: 'Hikaye silinsin mi?', ok: 'Sil', danger: true, onOk: () => app.deleteStory(story), onCancel: () => setPaused(false) }); }}><Icon n="trash" size={22} />Sil</button>
              </div>
            </div>
          ) : true ? (
            <Fragment>
              <input id="story-reply" placeholder={app.nameOf(uid) + ' kişisine yanıt ver…'} value={reply} onChange={(e) => setReply(e.target.value)}
                onFocus={() => setTyping(true)} onBlur={() => setTimeout(() => setTyping(false), 120)} onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }} />
              <button className={liked ? 'liked' : ''} key={'h' + likePop} aria-label={liked ? 'Beğeniyi geri al' : 'Beğen'}
                onClick={() => { if (!liked) setLikePop((p) => p + 1); app.setStoryLike(story, !liked); }}>
                <Icon n="heart" fill={liked} size={28} />
              </button>
              <button aria-label="Gönder" onClick={() => (reply.trim() ? sendReply() : app.openChatWith(uid))}><Icon n="send" size={26} /></button>
            </Fragment>
          ) : null}
        </div>
        {flyers.map((f) => <span key={f.k} className="fly" style={{ left: f.x + '%', bottom: 90, '--r': f.r + 'deg' }}>{f.emoji}</span>)}
      </div>
      {viewers ? (
        <Sheet onClose={() => setViewers(false)} title="Görüntüleyenler" z={75}>
          <div className="sheet-body g" style={{ minHeight: 180 }}>
            {viewIds.length ? viewIds.sort((a, b) => story.views[b] - story.views[a]).map((v) => (
              <PersonRow key={v} uid={v} sub={ago(story.views[v], true)}
                right={isOn(story.likes, v) ? <span style={{ color: 'var(--like)' }}><Icon n="heart" fill size={20} /></span> : null}
                onClick={() => { setViewers(false); close(); app.openUser(v); }} />
            )) : <Empty title="Henüz kimse görmedi" text="Hikayeni görenler burada listelenir." />}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
