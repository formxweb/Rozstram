import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { COMMENT_EMOJIS, ago, fmt, haptic, isOn, mediaUrl, onKeys, postFilter, shareLink } from './lib.js';
import { MusicTag, useMusic } from './player.jsx';
import {
  Avatar, AvatarStack, Empty, FollowButton, HeartBurst, Icon, Mark, PersonRow, RichText, Sheet, SkeletonPost, TopBar, UName, Vid,
  useInView, useLongPress, useTaps, SensitiveCover, useBackClose } from './ui.jsx';
import { FeedPrompt } from './recap.jsx';

/* ================================================================ ana sayfa */
export function HomeScreen({ live }) {
  const app = useApp();
  const scRef = useRef(null);
  const lastY = useRef(0);
  const pullStart = useRef(null);
  const [hide, setHide] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { main, rest } = app.feed;

  useEffect(() => {
    if (app.retap.tab === 'home' && scRef.current) scRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [app.retap.n]);

  const onScroll = (e) => {
    const y = e.currentTarget.scrollTop;
    const d = y - lastY.current;
    if (y < 80) setHide(false);
    else if (d > 8) setHide(true);
    else if (d < -8) setHide(false);
    lastY.current = y;
  };
  const onTouchStart = (e) => { if (scRef.current && scRef.current.scrollTop <= 0 && !refreshing) pullStart.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    if (pullStart.current == null) return;
    const d = e.touches[0].clientY - pullStart.current;
    setPull(d > 0 && scRef.current.scrollTop <= 0 ? Math.min(120, d * 0.45) : 0);
  };
  const onTouchEnd = () => {
    if (pullStart.current == null) return;
    pullStart.current = null;
    if (pull > 60) {
      setRefreshing(true); setPull(58); haptic(12);
      const t0 = Date.now();
      Promise.resolve(app.refresh()).finally(() => setTimeout(() => { setRefreshing(false); setPull(0); }, Math.max(0, 700 - (Date.now() - t0))));
    } else setPull(0);
  };

  const feedMenu = () => app.setSheet({
    title: 'Akış',
    items: [
      { label: (app.feedMode === 'following' ? '✓ ' : '') + 'Takip edilenler', icon: 'user', onClick: () => app.setFeedMode('following') },
      { label: (app.feedMode === 'foryou' ? '✓ ' : '') + 'Senin için', icon: 'sparkle', onClick: () => app.setFeedMode('foryou') },
    ],
  });

  const suggestionsAt = app.feedMode === 'following' ? Math.min(1, Math.max(0, main.length - 1)) : 2;
  return (
    <div className="scroller" ref={scRef} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <TopBar hidden={hide}
        left={(
          <Fragment>
            <button className="icon-btn home-create" id="home-create" aria-label="Oluştur" onClick={() => app.openCreate('post')}><Icon n="plusSq" size={26} /></button>
            <button className="logo-btn" onClick={feedMenu} aria-label="Akışı değiştir"><Mark size={24} /><span className="wordmark">rozstram</span><Icon n="chevDown" size={16} stroke={2.4} /></button>
          </Fragment>
        )}
        right={(
          <Fragment>
            <button className="icon-btn badge-wrap" aria-label="Bildirimler" onClick={() => app.push({ type: 'activity' })}>
              <Icon n="heart" />{app.unreadActivity ? <span className="dot" /> : null}
            </button>
          </Fragment>
        )} />
      <div className={'ptr' + (refreshing ? ' go' : '')} style={{ height: pull }} aria-hidden={!pull}>
        <span style={{ transform: 'rotate(' + pull * 3 + 'deg) scale(' + Math.min(1, pull / 60) + ')' }}><Mark size={26} /></span>
      </div>
      <StoriesBar />
      {app.loaded.posts ? <FeedPrompt /> : null}
      {!app.loaded.posts ? <Fragment><SkeletonPost /><SkeletonPost /></Fragment> : null}
      {app.loaded.posts && app.feedMode === 'following' && !main.length && rest.length ? (
        <div className="g feed-note">Takip ettiğin hesapların paylaşımı yok. Aşağıda senin için seçtiklerimiz var.</div>
      ) : null}
      {main.map((p, i) => (
        <Fragment key={p.id}>
          <PostCard post={p} live={live} />
          {i === suggestionsAt ? <Suggestions /> : null}
        </Fragment>
      ))}
      {app.loaded.posts && main.length < 2 && app.feedMode === 'following' ? <Suggestions /> : null}
      {rest.length ? (
        <Fragment>
          {main.length ? (
            <div className="caught-up g">
              <span className="ck"><Icon n="check" size={30} stroke={2.6} /></span>
              <b>Hepsini gördün</b>
              <span className="sub">Son 3 günde takip ettiklerinin tüm gönderilerini gördün.</span>
            </div>
          ) : null}
          <div className="g sug-head" style={{ paddingTop: 0 }}><span>Önerilen gönderiler</span></div>
          {rest.map((p) => <PostCard key={p.id} post={p} live={live} />)}
        </Fragment>
      ) : null}
      {app.loaded.posts && !main.length && !rest.length ? (
        <Empty icon="users" title="Rozstram’a hoş geldin" text="Arkadaşlarını davet et, takip edeceğin kişileri bul ya da ilk paylaşımını yap."
          action={(
            <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <button className="btn grad" onClick={async () => { const r = await shareLink('Rozstram’a katıl', location.origin); if (r === 'copied') app.toast('Davet bağlantısı kopyalandı'); }}>Arkadaşlarını davet et</button>
              <button className="btn" onClick={() => app.goTab('explore')}>Kişileri bul</button>
            </div>
          )} />
      ) : null}
    </div>
  );
}

/* ================================================================ hikaye çubuğu */
export function StoriesBar() {
  const app = useApp();
  const mine = app.storyGroups.find((g) => g.uid === app.me.id);
  const others = app.storyGroups.filter((g) => g.uid !== app.me.id);
  return (
    <div className="stories g">
      {app.me.id ? (
        <div className="story-chip">
          <Avatar uid={app.me.id} size={66} ring={mine ? app.storyRing(app.me.id) : null}
            onClick={() => (mine ? app.openStories(app.me.id) : app.openCreate('story'))} />
          <button className="plus" aria-label="Hikaye ekle" onClick={() => app.openCreate('story')}><Icon n="plus" size={13} stroke={3} /></button>
          <span>Hikayen</span>
        </div>
      ) : null}
      {others.map((g) => {
        const seen = app.groupSeen(g);
        return (
          <button className={'story-chip' + (seen ? ' seen' : '')} key={g.uid} onClick={() => app.openStories(g.uid)}>
            <Avatar uid={g.uid} size={66} ring={app.storyRing(g.uid) || 'seen'} online={app.isOnline(g.uid)} />
            <span>{app.nameOf(g.uid)}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================ önerilen hesaplar */
function Suggestions() {
  const app = useApp();
  const [dismissed, setDismissed] = useState({});
  /* öneriler sunucuda hesaplanır: 18 yaş altı hesaplar kimseye önerilmez, onlara da öneri gösterilmez */
  const list = useMemo(() => {
    const mine = app.following;
    return (app.suggest || []).filter((u) => app.profiles[u] && u !== app.me.id && !mine.has(u) && !app.requested.has(u) && !dismissed[u] && !app.blocks[u])
      .slice(0, 15)
      .map((u) => ({ u, mutual: Object.keys(app.profiles).filter((x) => mine.has(x) && isOn(app.profiles[x].following, u)) }));
  }, [app.suggest, app.profiles, app.following, app.requested, dismissed, app.blocks]);
  if (!list.length) return null;
  return (
    <section className="sug">
      <div className="g sug-head"><span>Senin için öneriler</span><button onClick={() => app.push({ type: 'people', ids: list.map((x) => x.u), title: 'Önerilenler' })}>Tümünü gör</button></div>
      <div className="sug-row g">
        {list.map(({ u, mutual }) => {
          const followsMe = isOn(app.profiles[u].following, app.me.id);
          return (
            <div className="sug-card" key={u}>
              <button className="x" aria-label="Öneriyi kaldır" onClick={() => setDismissed((d) => ({ ...d, [u]: true }))}><Icon n="close" size={16} /></button>
              <Avatar uid={u} size={76} onClick={() => app.openUser(u)} ring={app.storyRing(u)} />
              <UName uid={u} />
              <span className="sub">{followsMe ? 'Seni takip ediyor' : mutual.length ? app.nameOf(mutual[0]) + (mutual.length > 1 ? ' ve ' + (mutual.length - 1) + ' kişi' : '') + ' takip ediyor' : app.profiles[u].displayName || 'Senin için öneriliyor'}</span>
              <FollowButton uid={u} small />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================ gönderi */
function PostMedia({ post, live, onDouble, tagged }) {
  const app = useApp();
  const media = post.media || [];
  const boxRef = useRef(null);
  const slidesRef = useRef(null);
  const inView = useInView(boxRef, 0.6);
  const [idx, setIdx] = useState(0);
  const [burst, setBurst] = useState(0);
  const [prog, setProg] = useState(0);
  const [counterOn, setCounterOn] = useState(true);
  const counterTimer = useRef(null);
  const aspect = (media[0] && media[0].aspect) || 1;
  const filter = postFilter(post);
  const cur = media[idx];
  const hasSound = !!(post.music || (cur && cur.type === 'video'));
  const covered = app.covered(post);
  useMusic(post.music, live && inView && !covered, 'post:' + post.id);
  const tap = useTaps(hasSound ? () => app.setSound(!app.sound) : null, () => { setBurst((b) => b + 1); haptic(12); onDouble(); });
  const showCounter = () => { setCounterOn(true); clearTimeout(counterTimer.current); counterTimer.current = setTimeout(() => setCounterOn(false), 2600); };
  useEffect(() => { showCounter(); return () => clearTimeout(counterTimer.current); }, []);
  const onScroll = () => {
    const el = slidesRef.current;
    if (!el) return;
    const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (n !== idx) { setIdx(n); setProg(0); showCounter(); }
  };
  return (
    <Fragment>
      <div className="media" ref={boxRef} style={{ aspectRatio: String(aspect) }} onClick={tap}>
        <div className="slides" ref={slidesRef} onScroll={onScroll}>
          {media.map((m, i) => (
            <div className="slide" key={i}>
              {m.type === 'video'
                ? <Vid src={mediaUrl(m.id)} poster={m.thumb ? mediaUrl(m.thumb) : undefined} filter={filter} playing={live && inView && i === idx && !covered} onProgress={i === idx ? setProg : undefined} onWatched={() => app.viewPost(post)} forceMute={!!post.music} />
                : <img className="fill" src={mediaUrl(m.id)} alt={post.caption || 'Gönderi'} loading="lazy" decoding="async" style={filter ? { filter } : undefined} draggable="false" />}
            </div>
          ))}
        </div>
        {media.length > 1 ? <div className="counter" style={{ opacity: counterOn ? 1 : 0 }}>{idx + 1}/{media.length}</div> : null}
        {hasSound ? (
          <button className="mute-btn" aria-label={app.sound ? 'Sesi kapat' : 'Sesi aç'} onClick={(e) => { e.stopPropagation(); app.setSound(!app.sound); }}>
            <Icon n={app.sound ? 'volOn' : 'volOff'} size={16} />
          </button>
        ) : null}
        {cur && cur.type === 'video' ? <div className="vbar"><b style={{ width: prog * 100 + '%' }} /></div> : null}
        <HeartBurst k={burst} />
        <SensitiveCover post={post} />
        {tagged && tagged.length ? (
          <button className="tag-btn" aria-label="Etiketlenen kişiler" onClick={(e) => { e.stopPropagation(); app.openLikes(tagged, 'Bu gönderideki kişiler'); }}><Icon n="user" size={15} /></button>
        ) : null}
      </div>
      {media.length > 1 ? <div className="dots">{media.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}</div> : null}
    </Fragment>
  );
}

export function PostCard({ post, live }) {
  const app = useApp();
  const [expanded, setExpanded] = useState(false);
  const [pop, setPop] = useState(0);
  const [savePop, setSavePop] = useState(0);
  const liked = isOn(post.likes, app.me.id);
  const likes = onKeys(post.likes);
  const saved = !!app.saved[post.id];
  const list = app.commentsByPost[post.id] || [];
  const tops = list.filter((c) => !c.parent);
  const preview = tops.slice(-2);
  const author = app.profiles[post.author] || {};
  const isMine = post.author === app.me.id;
  const reposted = app.myRepost(post.id);
  const showFollow = !isMine && !app.following.has(post.author) && !app.requested.has(post.author);
  const tagged = (post.tagged || []).filter((u) => app.profiles[u]);
  const like = (v) => { if (v && !liked) setPop((p) => p + 1); app.setLike(post, v); };
  const friends = likes.filter((u) => u !== app.me.id && app.profiles[u]).sort((a, b) => (app.following.has(b) ? 1 : 0) - (app.following.has(a) ? 1 : 0));
  const first = friends[0];
  const quick = (e) => app.addComment(post.id, e);

  return (
    <article className="post" data-id={post.id}>
      {post.repostBy ? (
        <button className="repost-line g" onClick={() => app.openUser(post.repostBy)}><Icon n="repost" size={15} stroke={2.2} /><b>{app.nameOf(post.repostBy)}</b> yeniden paylaştı</button>
      ) : null}
      {post.removed ? <div className="removed-note"><Icon n="eyeOff" size={16} />Bu gönderi yönetici tarafından kaldırıldı. Sadece sen görebilirsin.</div> : null}
      <div className="post-head g">
        <div className="who">
          <Avatar uid={post.author} size={36} ring={app.storyRing(post.author)} onClick={() => (app.storyRing(post.author) ? app.openStories(post.author) : app.openUser(post.author))} />
          <div className="who-text">
            <div className="who-line">
              <UName uid={post.author} />
              {showFollow ? <Fragment><span className="sub">•</span><button className="follow-link" onClick={() => app.setFollow(post.author, true)}>Takip et</button></Fragment> : null}
            </div>
            {post.music ? <MusicTag m={post.music} onClick={() => app.openMusic(post.music.id)} />
              : post.location ? <button className="loc" onClick={() => app.openTag(post.location.replace(/\s+/g, ''))}>{post.location}</button>
              : post.kind === 'reel' ? <span className="loc"><Icon n="music" size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> Orijinal ses</span>
              : tagged.length ? <span className="sub">{tagged.length === 1 ? app.nameOf(tagged[0]) + ' ile' : app.nameOf(tagged[0]) + ' ve ' + (tagged.length - 1) + ' kişi ile'}</span>
              : author.displayName ? <span className="sub">{author.displayName}</span> : null}
          </div>
        </div>
        <button className="icon-btn" aria-label="Seçenekler" onClick={() => app.postMenu(post)}><Icon n="more" size={24} /></button>
      </div>
      <PostMedia post={post} live={live} onDouble={() => like(true)} tagged={tagged} />
      <div className="g">
        <div className="actions">
          <div className="l">
            <button className={'act' + (liked ? ' liked' : '') + (pop ? ' pop' : '')} key={'l' + pop} onClick={() => like(!liked)} aria-label={liked ? 'Beğeniyi geri al' : 'Beğen'}>
              <Icon n="heart" fill={liked} />{!post.hideLikes && likes.length ? <span>{fmt(likes.length)}</span> : null}
            </button>
            {!post.noComments ? (
              <button className="act" onClick={() => app.openComments(post.id)} aria-label="Yorumlar"><Icon n="comment" />{list.length ? <span>{fmt(list.length)}</span> : null}</button>
            ) : null}
            {!isMine ? (
              <button className={'act repost' + (reposted ? ' on' : '')} onClick={() => app.setRepost(post, !reposted)} aria-label={reposted ? 'Yeniden paylaşımı geri al' : 'Yeniden paylaş'} aria-pressed={reposted}>
                <Icon n="repost" stroke={reposted ? 2.4 : 1.9} />{post.reposts ? <span>{fmt(post.reposts)}</span> : null}
              </button>
            ) : post.reposts ? <span className="act repost-count"><Icon n="repost" />{fmt(post.reposts)}</span> : null}
            <button className="act" onClick={() => app.openSend(post)} aria-label="Gönder"><Icon n="send" /></button>
          </div>
          <button className={'act' + (savePop ? ' pop' : '')} key={'s' + savePop} onClick={() => { if (!saved) setSavePop((x) => x + 1); app.setSaved(post.id, !saved); }} aria-label={saved ? 'Kaydedilenlerden çıkar' : 'Kaydet'}>
            <Icon n="bookmark" fill={saved} />
          </button>
        </div>
        <div className="meta">
          {post.views && (post.media || []).some((x) => x.type === 'video') ? <div className="views-line"><b>{fmt(post.views)} görüntülenme</b></div> : null}
          {likes.length ? (
            <button className="likes-line" onClick={() => app.openLikes(likes)}>
              {friends.length ? <AvatarStack ids={friends} size={20} /> : null}
              {first && likes.length > 1
                ? <span><b>{app.nameOf(first)}</b> ve {post.hideLikes ? <b>diğerleri</b> : <b>diğer {fmt(likes.length - 1)} kişi</b>} beğendi</span>
                : first ? <span><b>{app.nameOf(first)}</b> beğendi</span>
                : <span><b>{post.hideLikes ? 'Beğenenleri gör' : fmt(likes.length) + ' beğenme'}</b></span>}
            </button>
          ) : null}
          {post.caption ? (
            <div className={'caption' + (expanded ? '' : ' clamp')} onClick={() => setExpanded(true)}>
              <UName uid={post.author} />{' '}<RichText text={post.caption} />
            </div>
          ) : null}
          {!post.noComments && list.length > preview.length ? (
            <button className="more-btn" onClick={() => app.openComments(post.id)}>{list.length} yorumun tümünü gör</button>
          ) : null}
          {!post.noComments ? preview.map((c) => <InlineComment key={c.id} c={c} />) : null}
          {!post.noComments ? (
            <div className="quick-cmt">
              <Avatar uid={app.me.id} size={24} />
              <button className="ph" onClick={() => app.openComments(post.id, null, true)}>Yorum ekle…</button>
              <button className="em" onClick={() => quick('❤️')} aria-label="Kalp yorumu">❤️</button>
              <button className="em" onClick={() => quick('🙌')} aria-label="Alkış yorumu">🙌</button>
            </div>
          ) : null}
          <div className="time">{ago(post.at, true)}{post.edited ? ' · Düzenlendi' : ''}</div>
        </div>
      </div>
    </article>
  );
}

function InlineComment({ c }) {
  const app = useApp();
  const liked = isOn(c.likes, app.me.id);
  return (
    <div className="cmt-line">
      <div className="caption"><UName uid={c.author} />{' '}<RichText text={c.text} /></div>
      <button className={'mini-heart' + (liked ? ' on' : '')} onClick={() => app.setCommentLike(c, !liked)} aria-label="Yorumu beğen"><Icon n="heart" size={13} fill={liked} /></button>
    </div>
  );
}

export function PostScreen({ id }) {
  const app = useApp();
  const post = app.postById[id];
  const [state, setState] = useState(post ? 'ok' : 'loading');
  useEffect(() => {
    if (post) { setState('ok'); return; }
    let alive = true;
    app.ensurePost(id).then((p) => { if (alive) setState(p ? 'ok' : 'none'); });
    return () => { alive = false; };
  }, [id, !!post]);
  return (
    <Fragment>
      <TopBar back title="Gönderi" sub={post ? app.nameOf(post.author) : ''} line />
      <div className="body">{post ? <PostCard post={post} live /> : state === 'loading' ? <SkeletonPost /> : <Empty title="Gönderi bulunamadı" text="Silinmiş ya da gizli bir hesaba ait olabilir." />}</div>
    </Fragment>
  );
}

/* ================================================================ ızgara karesi (basılı tutunca önizleme) */
export function GridTile({ post, tall, reel, pinned }) {
  const app = useApp();
  const m = (post.media || [])[0] || {};
  const thumb = m.type === 'video' ? m.thumb : m.id;
  const filter = postFilter(post);
  const lp = useLongPress(() => { haptic(14); app.setPeek(post.id); }, 420);
  return (
    <button className={'tile' + (tall ? ' tall' : '') + (reel ? ' reel' : '')} {...lp.handlers}
      onClick={() => { if (lp.fired.current) { lp.fired.current = false; return; } app.openPost(post.id); }} aria-label="Gönderiyi aç">
      {thumb
        ? <img className="fill" src={mediaUrl(thumb)} alt="" loading="lazy" style={filter ? { filter } : undefined} draggable="false" />
        : m.type === 'video' ? <video className="fill" src={mediaUrl(m.id) + '#t=0.5'} muted playsInline preload="metadata" /> : null}
      {pinned ? <Icon n="thumb" size={18} className="badge-ico" fill /> : m.type === 'video' ? <Icon n="reels" size={20} className="badge-ico" /> : (post.media || []).length > 1 ? <Icon n="multi" size={20} className="badge-ico" /> : null}
      {reel ? <span className="stat"><Icon n="play" size={13} fill />{fmt(post.views || 0)}</span> : null}
      <SensitiveCover post={post} compact />
    </button>
  );
}

export function PeekModal({ postId, onClose }) {
  const app = useApp();
  useBackClose(onClose);
  const post = app.postById[postId];
  if (!post) return null;
  const m = (post.media || [])[0] || {};
  const liked = isOn(post.likes, app.me.id);
  const filter = postFilter(post);
  return (
    <div className="peek" onClick={onClose}>
      <div className="peek-card" onClick={(e) => e.stopPropagation()}>
        <div className="hd"><Avatar uid={post.author} size={30} /><UName uid={post.author} onClick={() => { onClose(); app.openUser(post.author); }} /></div>
        <div className="media" style={{ aspectRatio: String(Math.max(0.8, m.aspect || 1)) }}>
          {m.type === 'video' ? <Vid src={mediaUrl(m.id)} poster={m.thumb ? mediaUrl(m.thumb) : undefined} filter={filter} playing={!app.covered(post)} onWatched={() => app.viewPost(post)} forceMute={!!post.music} />
            : <img className="fill" src={mediaUrl(m.id)} alt="" style={filter ? { filter } : undefined} />}
          <SensitiveCover post={post} />
        </div>
        <div className="ft">
          <button className={'act' + (liked ? ' liked' : '')} onClick={() => app.setLike(post, !liked)} aria-label="Beğen"><Icon n="heart" fill={liked} /></button>
          <button className="act" onClick={() => { onClose(); app.openComments(post.id); }} aria-label="Yorumlar"><Icon n="comment" /></button>
          <button className="act" onClick={() => { onClose(); app.openSend(post); }} aria-label="Gönder"><Icon n="send" /></button>
          <button className="act" onClick={() => { onClose(); app.openPost(post.id); }} aria-label="Gönderiyi aç"><Icon n="chevRight" /></button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================ yorumlar */
function CommentItem({ c, post, isReply, onReply, flash }) {
  const app = useApp();
  const liked = isOn(c.likes, app.me.id);
  const n = onKeys(c.likes).length;
  const [pop, setPop] = useState(0);
  const canDelete = c.author === app.me.id || post.author === app.me.id;
  const lp = useLongPress(() => {
    haptic(12);
    const items = [];
    if (!post.noComments) items.push({ label: 'Yanıtla', icon: 'reply', onClick: () => onReply(c) });
    items.push({ label: 'Kopyala', icon: 'copy', onClick: async () => { try { await navigator.clipboard.writeText(c.text); app.toast('Kopyalandı'); } catch (e) { app.toast('Kopyalanamadı'); } } });
    if (post.author === app.me.id && !c.parent) items.push({ label: c.pinned ? 'Sabitlemeyi kaldır' : 'Yorumu sabitle', icon: 'thumb', onClick: () => app.pinComment(c, !c.pinned) });
    if (c.author !== app.me.id) items.push({ label: 'Şikayet et', icon: 'flag', danger: true, onClick: () => app.openReport('comment', c.id) });
    if (canDelete) items.push({ label: 'Sil', icon: 'trash', danger: true, onClick: () => app.deleteComment(c) });
    app.setSheet({ items });
  }, 450);
  const tap = useTaps(null, () => { if (!liked) { setPop((p) => p + 1); app.setCommentLike(c, true); } });
  return (
    <div className={'comment' + (isReply ? ' reply' : '') + (flash ? ' flash' : '')} id={'c-' + c.id} {...lp.handlers}
      onClick={() => { if (lp.fired.current) { lp.fired.current = false; return; } tap(); }}>
      <Avatar uid={c.author} size={isReply ? 26 : 34} onClick={() => app.openUser(c.author)} />
      <div className="body">
        <div className="hd">
          <UName uid={c.author} />
          <span className="time">{ago(c.at)}</span>
          {c.author === post.author ? <span className="author-badge">• Yazar</span> : null}
          {c.pinned ? <span className="author-badge"><Icon n="thumb" size={11} fill style={{ display: 'inline', verticalAlign: '-1px' }} /> Sabitlendi</span> : null}
        </div>
        <div className="caption"><RichText text={c.text} /></div>
        <div className="foot">
          {n ? <span>{n} beğenme</span> : null}
          {!post.noComments ? <button onClick={(e) => { e.stopPropagation(); onReply(c); }}>Yanıtla</button> : null}
        </div>
      </div>
      <button className={'cmt-like' + (liked ? ' on' : '')} key={'p' + pop} aria-label={liked ? 'Beğeniyi geri al' : 'Yorumu beğen'}
        onClick={(e) => { e.stopPropagation(); if (!liked) setPop((p) => p + 1); app.setCommentLike(c, !liked); }}>
        <Icon n="heart" fill={liked} size={15} />{n ? <span>{n}</span> : null}
      </button>
    </div>
  );
}

export function CommentsSheet({ postId, replyTo: initialReply, focus, onClose }) {
  const app = useApp();
  const post = app.postById[postId];
  const all = app.commentsByPost[postId] || [];
  const tops = all.filter((c) => !c.parent);
  const replies = useMemo(() => { const m = {}; all.forEach((c) => { if (c.parent) (m[c.parent] = m[c.parent] || []).push(c); }); return m; }, [all]);
  const [text, setText] = useState('');
  const [reply, setReply] = useState(initialReply ? app.commentById[initialReply] || null : null);
  const [open, setOpen] = useState({});
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  useEffect(() => { if ((focus || initialReply) && inputRef.current) setTimeout(() => inputRef.current && inputRef.current.focus(), 320); }, []);

  const startReply = (c) => {
    const top = c.parent ? app.commentById[c.parent] || c : c;
    setReply(top);
    setText('@' + app.nameOf(c.author) + ' ');
    setOpen((o) => ({ ...o, [top.id]: true }));
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
  };
  const send = async (override) => {
    const t = (override || text).trim();
    if (!t || busy) return;
    setBusy(true);
    const id = await app.addComment(postId, t, reply ? reply.id : null);
    setBusy(false);
    if (!id) return;
    if (!override) setText('');
    if (reply) setOpen((o) => ({ ...o, [reply.id]: true }));
    setReply(null);
    setFlash(id);
    setTimeout(() => { const el = document.getElementById('c-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
  };

  if (!post) return null;
  return (
    <Sheet onClose={onClose} title="Yorumlar" tall>
      <div className="sheet-body g" ref={listRef}>
        {post.caption ? (
          <div className="comment" style={{ borderBottom: '1px solid var(--line)', borderRadius: 0 }}>
            <Avatar uid={post.author} size={34} />
            <div className="body">
              <div className="hd"><UName uid={post.author} /><span className="time">{ago(post.at)}</span></div>
              <div className="caption"><RichText text={post.caption} /></div>
            </div>
          </div>
        ) : null}
        {tops.length ? tops.map((c) => {
          const rs = replies[c.id] || [];
          const isOpen = open[c.id];
          return (
            <Fragment key={c.id}>
              <CommentItem c={c} post={post} onReply={startReply} flash={flash === c.id} />
              {rs.length ? (
                <Fragment>
                  {isOpen ? rs.map((r) => <CommentItem key={r.id} c={r} post={post} isReply onReply={startReply} flash={flash === r.id} />) : null}
                  <button className="replies-toggle" onClick={() => setOpen((o) => ({ ...o, [c.id]: !isOpen }))}>
                    {isOpen ? 'Yanıtları gizle' : rs.length + ' yanıtı gör'}
                  </button>
                </Fragment>
              ) : null}
            </Fragment>
          );
        }) : <Empty title="Henüz yorum yok" text={post.noComments ? 'Bu gönderide yorumlar kapalı.' : 'Sohbeti sen başlat.'} />}
      </div>
      {post.noComments ? <div className="closed-note">Bu gönderide yorumlar kapatıldı.</div> : true ? (
        <div className="composer g">
          <div className="emojis">{COMMENT_EMOJIS.map((e) => <button key={e} onClick={() => setText((t) => t + e)} aria-label={e}>{e}</button>)}</div>
          {reply ? (
            <div className="reply-chip"><span><b>{app.nameOf(reply.author)}</b> kişisine yanıt veriyorsun</span>
              <button onClick={() => { setReply(null); setText(''); }} aria-label="Yanıtı iptal et"><Icon n="close" size={16} /></button></div>
          ) : null}
          <div className="input-row">
            <Avatar uid={app.me.id} size={34} />
            <textarea ref={inputRef} id="comment-input" className="pill-input" rows={1} value={text} maxLength={1000}
              placeholder={reply ? 'Yanıt yaz…' : app.nameOf(post.author) + ' için yorum ekle…'} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="text-btn" disabled={!text.trim() || busy} onClick={() => send()}>{busy ? '…' : 'Paylaş'}</button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

/* ================================================================ beğenenler */
export function LikesSheet({ ids, title, onClose }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = ids.filter((u) => app.profiles[u] && (!term || app.nameOf(u).indexOf(term) >= 0 || (app.profiles[u].displayName || '').toLowerCase().indexOf(term) >= 0))
    .sort((a, b) => (b === app.me.id ? -1 : 0) - (a === app.me.id ? -1 : 0) || (app.following.has(b) ? 1 : 0) - (app.following.has(a) ? 1 : 0));
  return (
    <Sheet onClose={onClose} title={title} tall>
      <div className="g" style={{ paddingBlock: 10 }}>
        <label className="search"><Icon n="search" size={17} /><input id="likes-q" type="search" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="sheet-body g">
        {shown.length ? shown.map((u) => <PersonRow key={u} uid={u} onClick={() => { onClose(); app.openUser(u); }} />) : <Empty title="Kimse yok" text="Bu aramayla eşleşen kişi yok." />}
      </div>
    </Sheet>
  );
}

/* ================================================================ gönder */
export function SendSheet({ post, onClose }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = useMemo(() => {
    const recent = app.inboxThreads.filter((t) => !t.isGroup).map((t) => app.otherOf(t)).filter(Boolean);
    const seen = {};
    return recent.concat(Array.from(app.following), Object.keys(app.profiles))
      .filter((u) => u !== app.me.id && app.profiles[u] && !app.blocks[u] && !seen[u] && (seen[u] = true));
  }, [app.inboxThreads, app.profiles, app.following, app.blocks]);
  const term = q.trim().toLowerCase();
  const shown = ids.filter((u) => !term || app.nameOf(u).indexOf(term) >= 0 || (app.profiles[u].displayName || '').toLowerCase().indexOf(term) >= 0);
  const chosen = Object.keys(sel).filter((k) => sel[k]);
  const send = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    let ok = true;
    for (const u of chosen) {
      ok = (await app.sendTo(u, { post: post.id })) && ok;
      if (msg.trim()) ok = (await app.sendTo(u, { text: msg.trim() })) && ok;
    }
    setBusy(false);
    if (ok) { app.toast(chosen.length > 1 ? chosen.length + ' kişiye gönderildi' : 'Gönderildi'); onClose(); }
  };
  return (
    <Sheet onClose={onClose} tall>
      <div className="g" style={{ paddingBlock: '4px 4px' }}>
        <label className="search"><Icon n="search" size={17} /><input id="send-q" type="search" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="sheet-body g">
        <div className="send-grid">
          {shown.map((u) => (
            <button key={u} className="send-person" onClick={() => { haptic(6); setSel((s) => ({ ...s, [u]: !s[u] })); }} aria-pressed={!!sel[u]}>
              <span className="sel"><Avatar uid={u} size={64} online={app.isOnline(u)} />{sel[u] ? <span className="chk"><Icon n="check" size={14} stroke={3} /></span> : null}</span>
              <span>{(app.profiles[u].displayName || app.nameOf(u))}</span>
            </button>
          ))}
        </div>
      </div>
      {chosen.length ? (
        <div className="send-foot g">
          <input id="send-msg" placeholder="Mesaj yaz…" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} />
          <button className="btn primary block big" onClick={send} disabled={busy}>{busy ? 'Gönderiliyor…' : chosen.length > 1 ? 'Ayrı ayrı gönder' : 'Gönder'}</button>
        </div>
      ) : (
        <div className="send-actions g">
          <button onClick={() => { onClose(); app.shareToStory(post); }}><span className="ic"><Icon n="plusSq" size={24} /></span>Hikayene ekle</button>
          <button onClick={() => { onClose(); app.copyLink(post); }}><span className="ic"><Icon n="link" size={24} /></span>Bağlantıyı paylaş</button>
          <button onClick={() => { onClose(); app.openPost(post.id); }}><span className="ic"><Icon n="image" size={24} /></span>Gönderiyi aç</button>
        </div>
      )}
    </Sheet>
  );
}
