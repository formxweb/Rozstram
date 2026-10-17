import { useEffect, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { fmt, haptic, isOn, mediaUrl, onKeys, postFilter } from './lib.js';
import { Avatar, HeartBurst, Icon, RichText, Vid, useInView, useTaps } from './ui.jsx';

function ReelItem({ post, live }) {
  const app = useApp();
  const ref = useRef(null);
  const inView = useInView(ref, 0.7);
  const [burst, setBurst] = useState(0);
  const [hold, setHold] = useState(false);
  const [flash, setFlash] = useState(null);
  const [prog, setProg] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [pop, setPop] = useState(0);
  const holdTimer = useRef(null);
  const wasHold = useRef(false);
  const m = (post.media || [])[0] || {};
  const liked = isOn(post.likes, app.me.id);
  const saved = !!app.saved[post.id];
  const playing = live && inView && !hold;
  const tap = useTaps(() => {
    const next = !app.sound;
    app.setSound(next);
    setFlash({ n: next ? 'volOn' : 'volOff', k: Date.now() });
  }, () => { setBurst((b) => b + 1); haptic(12); if (!liked) { setPop((p) => p + 1); app.setLike(post, true); } });
  const down = () => { wasHold.current = false; holdTimer.current = setTimeout(() => { wasHold.current = true; setHold(true); haptic(6); }, 260); };
  const up = () => { clearTimeout(holdTimer.current); if (hold) setHold(false); };
  const click = () => { if (wasHold.current) { wasHold.current = false; return; } tap(); };
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const following = app.following.has(post.author);
  const comments = (app.commentsByPost[post.id] || []).length;

  return (
    <section className="reel" ref={ref}>
      <div style={{ position: 'absolute', inset: 0 }} onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onClick={click} onContextMenu={(e) => e.preventDefault()}>
        <Vid src={mediaUrl(m.id)} poster={m.thumb ? mediaUrl(m.thumb) : undefined} filter={postFilter(post)} playing={playing} onProgress={setProg} onWatched={() => app.viewPost(post)} />
      </div>
      <div className="shade-top" />
      <div className="shade" />
      {flash ? <div className="center-ico" key={flash.k}><div><Icon n={flash.n} size={30} /></div></div> : null}
      {hold ? <div className="center-ico hold"><div><Icon n="pause" size={30} /></div></div> : null}
      <HeartBurst k={burst} size={110} />
      <div className="side" style={{ opacity: hold ? 0 : 1, transition: 'opacity .2s' }}>
        <button className={liked ? 'liked' : ''} key={'l' + pop} onClick={() => { if (!liked) setPop((p) => p + 1); app.setLike(post, !liked); }} aria-label={liked ? 'Beğeniyi geri al' : 'Beğen'}>
          <Icon n="heart" fill={liked} size={32} />{post.hideLikes ? '' : fmt(onKeys(post.likes).length)}
        </button>
        {!post.noComments ? <button onClick={() => app.openComments(post.id)} aria-label="Yorumlar"><Icon n="comment" size={31} />{fmt(comments)}</button> : null}
        <button onClick={() => app.openSend(post)} aria-label="Gönder"><Icon n="send" size={30} /></button>
        <button onClick={() => app.setSaved(post.id, !saved)} aria-label="Kaydet"><Icon n="bookmark" fill={saved} size={29} /></button>
        <button onClick={() => app.postMenu(post)} aria-label="Seçenekler"><Icon n="more" size={26} /></button>
        <button onClick={() => app.openUser(post.author)} aria-label="Ses"><span className={'disc' + (playing ? '' : ' paused')}><img src={app.avatarOf(post.author)} alt="" /></span></button>
      </div>
      <div className="info" style={{ opacity: hold ? 0 : 1, transition: 'opacity .2s' }}>
        <div className="who">
          <Avatar uid={post.author} size={34} onClick={() => app.openUser(post.author)} />
          <button className="uname" style={{ color: 'var(--on-night)' }} onClick={() => app.openUser(post.author)}>{app.nameOf(post.author)}</button>
          {post.author !== app.me.id && !following && !app.requested.has(post.author) ? <button className="follow" onClick={() => app.setFollow(post.author, true)}>Takip et</button> : null}
        </div>
        {post.caption ? (
          <div className="caption" style={expanded ? undefined : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} onClick={() => setExpanded((e) => !e)}>
            <RichText text={post.caption} />
          </div>
        ) : null}
        {post.views ? <div className="views"><Icon n="play" size={12} fill />{fmt(post.views)} görüntülenme</div> : null}
        <div className="audio"><Icon n="music" size={14} /><span className="track"><span>{app.nameOf(post.author)} · Orijinal ses</span><span>{app.nameOf(post.author)} · Orijinal ses</span></span></div>
      </div>
      <div className="vprog"><b style={{ width: prog * 100 + '%' }} /></div>
    </section>
  );
}

export function ReelsScreen({ live }) {
  const app = useApp();
  const [mode, setMode] = useState('foryou');
  const list = app.reelsFor(mode);
  const ref = useRef(null);
  useEffect(() => { if (app.retap.tab === 'reels' && ref.current) ref.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [app.retap.n]);
  const switchMode = (m) => { setMode(m); if (ref.current) ref.current.scrollTo({ top: 0 }); };
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--night)' }}>
      <div className="reels" ref={ref}>
        {list.length ? list.map((p) => <ReelItem key={p.id} post={p} live={live} />) : (
          <section className="reel" style={{ display: 'grid', placeItems: 'center' }}>
            <div className="empty" style={{ color: 'var(--night-muted)' }}>
              <h3 style={{ color: 'var(--on-night)' }}>{mode === 'following' ? 'Takip ettiklerinden Reels yok' : 'Henüz Reels yok'}</h3>
              <p>{mode === 'following' ? 'Daha fazla kişiyi takip et ya da Senin için akışına bak.' : 'Kısa bir video paylaş, ilk Reels senin olsun.'}</p>
              <button className="btn grad" onClick={() => app.openCreate('reel')}>Reels oluştur</button>
            </div>
          </section>
        )}
      </div>
      <div className="reels-top">
        <div className="reel-tabs">
          <button className={mode === 'foryou' ? 'on' : ''} onClick={() => switchMode('foryou')}>Senin için</button>
          <button className={mode === 'following' ? 'on' : ''} onClick={() => switchMode('following')}>Takip edilenler</button>
        </div>
        <button className="icon-btn" aria-label="Reels oluştur" onClick={() => app.openCreate('reel')}><Icon n="camera" size={27} /></button>
      </div>
    </div>
  );
}
