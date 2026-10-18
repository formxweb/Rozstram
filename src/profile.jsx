import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useBack } from './ctx.js';
import { USERNAME_RE, fmt, isOn, mediaUrl, mentionsOf, onKeys, shareLink, slugify } from './lib.js';
import { Avatar, AvatarStack, Empty, FollowButton, Icon, PersonRow, RichText, Sheet, Spinner, TopBar, UName, Verified } from './ui.jsx';
import { GridTile } from './feed.jsx';
import { StoryMedia } from './stories.jsx';

const isVideoPost = (x) => !!(x.media && x.media[0] && x.media[0].type === 'video');

/* ================================================================ profil */
export function ProfileScreen({ uid, isTab }) {
  const app = useApp();
  const [tab, setTab] = useState('grid');
  const [showSug, setShowSug] = useState(false);
  const scRef = useRef(null);
  const p = app.profiles[uid];
  const isMe = uid === app.me.id;
  const locked = !isMe && p && (p.private && !app.following.has(uid));
  useEffect(() => { if (isTab && app.retap.tab === 'profile' && scRef.current) scRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [app.retap.n]);
  useEffect(() => { if (p && !locked) app.loadUserPosts(uid); }, [uid, locked]);

  const posts = useMemo(() => app.posts.filter((x) => x.author === uid && !x.archived)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.at - a.at), [app.posts, uid]);
  const reels = posts.filter((x) => x.media && x.media[0] && x.media[0].type === 'video');
  const tagged = p ? app.posts.filter((x) => x.author !== uid && !x.archived && ((x.tagged || []).indexOf(uid) >= 0 || mentionsOf(x.caption).indexOf(p.username) >= 0)) : [];
  const savedPosts = isMe ? Object.keys(app.saved).sort((a, b) => app.saved[b] - app.saved[a]).map((id) => app.postById[id]).filter(Boolean) : [];
  const followers = Object.keys(app.profiles).filter((x) => isOn(app.profiles[x].following, uid));
  const followingIds = onKeys(p && p.following).filter((x) => app.profiles[x]);
  const mutual = isMe ? [] : followers.filter((x) => app.following.has(x));
  const followsMe = !isMe && p && isOn(p.following, app.me.id);
  const reposted = useMemo(() => app.repostsBy(uid), [app.repostsBy, uid]);
  const list = tab === 'grid' ? posts : tab === 'reels' ? reels : tab === 'reposts' ? reposted : tab === 'tagged' ? tagged : savedPosts;
  const ring = locked ? null : app.storyRing(uid);
  const highlights = locked ? [] : (p && p.highlights) || [];
  const similar = useMemo(() => Object.keys(app.profiles).filter((x) => x !== uid && x !== app.me.id && !app.following.has(x) && !app.requested.has(x) && !app.blocks[x]).slice(0, 10), [app.profiles, uid, app.following, app.requested, app.blocks]);

  const ownCreate = () => app.setSheet({
    title: 'Oluştur',
    items: [
      { label: 'Gönderi', icon: 'gallery', onClick: () => app.openCreate('post') },
      { label: 'Reels', icon: 'reels', onClick: () => app.openCreate('reel') },
      { label: 'Hikaye', icon: 'camera', onClick: () => app.openCreate('story') },
      { label: 'Öne çıkan hikaye', icon: 'star', onClick: () => app.push({ type: 'grid', kind: 'archive', title: 'Hikaye arşivi' }) },
    ],
  });
  const otherMenu = () => app.setSheet({
    header: <div className="sheet-user"><Avatar uid={uid} size={44} /><b>{app.nameOf(uid)}</b></div>,
    items: [
      { label: 'Profili paylaş', icon: 'share', onClick: () => app.setPanel({ type: 'shareProfile', uid, k: Date.now() }) },
      { label: 'Mesaj gönder', icon: 'send', onClick: () => app.openChatWith(uid) },
      { label: 'Şifreli sohbet', icon: 'lock', onClick: () => app.openSecretChatWith(uid) },
      ...(app.following.has(uid) ? [{ label: app.closeFriends[uid] ? 'Yakın Arkadaşlar’dan çıkar' : 'Yakın Arkadaşlar’a ekle', icon: 'star', onClick: () => app.setCloseFriend(uid, !app.closeFriends[uid]) }] : []),
      { label: app.mutes[uid] ? 'Sesini aç' : 'Sessize al', icon: 'volOff', onClick: () => app.setMute(uid, !app.mutes[uid]) },
      ...(followsMe ? [{ label: 'Takipçilerimden çıkar', icon: 'userX', onClick: () => app.removeFollower(uid) }] : []),
      { label: app.blocks[uid] ? 'Engeli kaldır' : 'Engelle', icon: 'shield', danger: !app.blocks[uid], onClick: () => (app.blocks[uid] ? app.unblock(uid) : app.block(uid)) },
      { label: 'Şikayet et', icon: 'flag', danger: true, onClick: () => app.openReport('user', uid) },
      ...(app.isAdmin ? [{ label: (app.profiles[uid] && app.profiles[uid].verified ? 'Mavi tiki kaldır' : 'Mavi tik ver') + ' (Yönetici)', icon: 'verified', onClick: () => app.admin.verify(uid, !(app.profiles[uid] && app.profiles[uid].verified)) }] : []),
      ...(app.isAdmin ? [p && p.banned
        ? { label: 'Banı kaldır (Yönetici)', icon: 'shield', onClick: () => app.admin.unban(uid) }
        : { label: 'Banla (Yönetici)', icon: 'shield', danger: true, onClick: () => app.openBan(uid) }] : []),
    ],
  });

  const top = (
    <TopBar back={!isTab}
      left={isTab ? (
        <button className="title-btn" onClick={() => app.setPanel({ type: 'shareProfile', uid, k: Date.now() })}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{p && p.private ? <Icon n="lock" size={16} stroke={2.4} /> : null}{(p && p.username) || 'Profilin'}{p && p.verified ? <Verified size={16} /> : null}<Icon n="chevDown" size={16} stroke={2.4} /></h1>
        </button>
      ) : null}
      title={(p && p.username) || 'Profil'}
      right={isMe ? (
        <Fragment>
          <button className="icon-btn" aria-label="Oluştur" onClick={ownCreate}><Icon n="plusSq" /></button>
          <button className="icon-btn badge-wrap" aria-label="Ayarlar" onClick={() => app.push({ type: 'settings' })}><Icon n="menu" />{app.incoming.length ? <span className="dot" /> : null}</button>
        </Fragment>
      ) : <button className="icon-btn" aria-label="Seçenekler" onClick={otherMenu}><Icon n="more" /></button>} />
  );

  if (!p) {
    return <div className={isTab ? 'scroller' : 'body'} ref={scRef}>{top}{isTab ? <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><Spinner /></div> : <Empty icon="user" title="Kullanıcı bulunamadı" text="Bu hesap silinmiş ya da seni engellemiş olabilir." />}</div>;
  }

  return (
    <div className={isTab ? 'scroller' : 'body'} ref={scRef}>
      {top}
      {app.isAdmin && !isMe && p && p.banned ? (
        <div className="removed-note ban-note" role="status"><Icon n="shield" size={16} /><span className="grow">Bu hesap banlı. Kullanıcılar profili ve paylaşımları göremez.</span>
          <button className="btn small" onClick={() => app.admin.unban(uid)}>Banı kaldır</button></div>
      ) : null}
      <div className="g">
        <div className="prof-head">
          <Avatar uid={uid} size={88} ring={ring} online={app.isOnline(uid)} onClick={ring ? () => app.openStories(uid) : isMe ? () => app.openCreate('story') : undefined} />
          <div className="stats">
            <button onClick={() => setTab('grid')}><b>{fmt(posts.length)}</b><span>gönderi</span></button>
            <button onClick={() => (locked ? null : app.push({ type: 'people', uid, tab: 'followers' }))}><b>{fmt(app.followerCount(uid))}</b><span>takipçi</span></button>
            <button onClick={() => (locked ? null : app.push({ type: 'people', uid, tab: 'following' }))}><b>{fmt(followingIds.length)}</b><span>takip</span></button>
          </div>
        </div>
        <div className="bio">
          {p.displayName ? <span className="name">{p.displayName}</span> : null}
          {p.category ? <span className="cat">{p.category}</span> : null}
          {p.bio ? <span className="caption"><RichText text={p.bio} /></span> : null}
          {p.website ? <a className="website" href={/^https?:\/\//.test(p.website) ? p.website : 'https://' + p.website} target="_blank" rel="noopener noreferrer nofollow"><Icon n="link" size={14} />{p.website.replace(/^https?:\/\//, '')}</a> : null}
          {followsMe ? <span className="sub" style={{ paddingTop: 4 }}>Seni takip ediyor</span> : null}
        </div>
        {mutual.length ? (
          <button className="mutual" onClick={() => app.push({ type: 'people', ids: mutual, title: 'Ortak takipçiler' })}>
            <AvatarStack ids={mutual} size={20} />
            <span><b>{app.nameOf(mutual[0])}</b>{mutual.length > 1 ? <Fragment> ve <b>{mutual.length - 1} kişi</b></Fragment> : null} takip ediyor</span>
          </button>
        ) : null}
        <div className="prof-btns">
          {isMe ? (
            <Fragment>
              <button className="btn" onClick={() => app.push({ type: 'edit' })}>Profili düzenle</button>
              <button className="btn" onClick={() => app.setPanel({ type: 'shareProfile', uid, k: Date.now() })}>Profili paylaş</button>
            </Fragment>
          ) : app.blocks[uid] ? (
            <button className="btn primary" onClick={() => app.unblock(uid)}>Engeli kaldır</button>
          ) : (
            <Fragment>
              {app.following.has(uid)
                ? <button className="btn" onClick={() => app.confirmUnfollow(uid)}>Takip ediliyor <Icon n="chevDown" size={14} stroke={2.4} /></button>
                : <FollowButton uid={uid} />}
              <button className="btn" onClick={() => app.openChatWith(uid)}>Mesaj</button>
            </Fragment>
          )}
          {similar.length && !isMe ? <button className={'btn sq' + (showSug ? ' primary' : '')} aria-label="Benzer hesaplar" onClick={() => setShowSug((s) => !s)}><Icon n="userPlus" size={17} /></button> : null}
        </div>
      </div>
      {showSug ? (
        <div style={{ paddingBottom: 8 }}>
          <div className="g sug-head" style={{ paddingTop: 6 }}><span>Önerilen hesaplar</span></div>
          <div className="sug-row g">
            {similar.map((u) => (
              <div className="sug-card" key={u}>
                <Avatar uid={u} size={66} onClick={() => app.openUser(u)} />
                <UName uid={u} />
                <span className="sub">{app.profiles[u].displayName || ''}</span>
                <FollowButton uid={u} small />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {highlights.length || isMe ? (
        <div className="highlights g">
          {highlights.map((hl) => (
            <button className="hl" key={hl.id} onClick={() => app.openHighlight(uid, hl)}>
              <span className="cv">{hl.cover ? <img src={mediaUrl(hl.cover)} alt="" /> : <span className="add"><Icon n="star" size={22} /></span>}</span>
              <span>{hl.title}</span>
            </button>
          ))}
          {isMe ? (
            <button className="hl" onClick={() => app.push({ type: 'grid', kind: 'archive', title: 'Hikaye arşivi' })}>
              <span className="cv"><span className="add"><Icon n="plus" size={24} /></span></span><span>Yeni</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {locked ? (
        <div className="locked g">
          <span className="circle"><Icon n="lock" size={30} /></span>
          <b>Bu hesap gizli</b>
          <span className="sub">{app.requested.has(uid) ? 'Takip isteğin gönderildi. Kabul edilince fotoğraf ve videolarını görebilirsin.' : 'Fotoğraf ve videolarını görmek için bu hesabı takip et.'}</span>
        </div>
      ) : (
        <Fragment>
          <div className="tabs" style={isTab ? undefined : { top: 0 }}>
            <button className={tab === 'grid' ? 'on' : ''} onClick={() => setTab('grid')} aria-label="Gönderiler"><Icon n="grid" size={22} /></button>
            <button className={tab === 'reels' ? 'on' : ''} onClick={() => setTab('reels')} aria-label="Reels"><Icon n="reels" size={22} /></button>
            <button className={tab === 'reposts' ? 'on' : ''} onClick={() => setTab('reposts')} aria-label="Yeniden paylaşılanlar"><Icon n="repost" size={22} /></button>
            <button className={tab === 'tagged' ? 'on' : ''} onClick={() => setTab('tagged')} aria-label="Etiketlenenler"><Icon n="tag" size={22} /></button>
            {isMe ? <button className={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')} aria-label="Kaydedilenler"><Icon n="bookmark" size={22} /></button> : null}
          </div>
          {list.length
            ? <div className="grid" key={tab}>{list.map((x) => <GridTile key={x.id} post={x} reel={tab === 'reels' || (tab === 'reposts' && isVideoPost(x))} pinned={tab === 'grid' && x.pinned} />)}</div>
            : <Empty
                icon={tab === 'saved' ? 'bookmark' : tab === 'reels' ? 'reels' : tab === 'reposts' ? 'repost' : tab === 'tagged' ? 'tag' : 'camera'}
                title={tab === 'saved' ? 'Kaydedilen yok' : tab === 'reels' ? 'Henüz Reels yok' : tab === 'reposts' ? 'Yeniden paylaşım yok' : tab === 'tagged' ? 'Etiketlenen gönderi yok' : isMe ? 'İlk gönderini paylaş' : 'Henüz gönderi yok'}
                text={tab === 'saved' ? 'Beğendiğin gönderileri yer imi simgesiyle kaydet. Bunu sadece sen görürsün.' : tab === 'reposts' ? (isMe ? 'Beğendiğin bir Reels’i ya da gönderiyi yeniden paylaşınca takipçilerin görür ve burada durur.' : '@' + p.username + ' yeniden paylaştığında burada görünür.') : tab === 'tagged' ? (isMe ? 'Biri seni bir gönderide etiketlediğinde burada görünür.' : '@' + p.username + ' etiketlendiğinde burada görünür.') : null}
                action={isMe && tab === 'grid' ? <button className="btn grad" onClick={() => app.openCreate('post')}>Paylaşım yap</button> : null} />}
        </Fragment>
      )}
    </div>
  );
}

/* ================================================================ takipçiler / takip */
export function PeopleScreen({ uid, initial, ids, title }) {
  const app = useApp();
  const [tab, setTab] = useState(initial || 'followers');
  const [q, setQ] = useState('');
  const p = uid ? app.profiles[uid] : null;
  const isMe = uid === app.me.id;
  const followers = uid ? Object.keys(app.profiles).filter((x) => isOn(app.profiles[x].following, uid)) : [];
  const following = uid ? onKeys(p && p.following).filter((x) => app.profiles[x]) : [];
  const base = ids || (tab === 'followers' ? followers : following);
  const term = q.trim().toLowerCase();
  const shown = base.filter((u) => app.profiles[u] && (!term || app.nameOf(u).indexOf(term) >= 0 || (app.profiles[u].displayName || '').toLowerCase().indexOf(term) >= 0));
  return (
    <Fragment>
      <TopBar back title={ids ? title : (p && p.username) || ''} line={!!ids} />
      {!ids ? (
        <div className="seg-tabs">
          <button className={tab === 'followers' ? 'on' : ''} onClick={() => setTab('followers')}>{fmt(followers.length)} takipçi</button>
          <button className={tab === 'following' ? 'on' : ''} onClick={() => setTab('following')}>{fmt(following.length)} takip</button>
          <span className="bar" style={{ width: '50%', transform: tab === 'followers' ? 'translateX(0)' : 'translateX(100%)' }} />
        </div>
      ) : null}
      <div className="body g">
        <div style={{ paddingBlock: 10 }}><label className="search"><Icon n="search" size={17} /><input id="people-q" type="search" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
        {isMe && tab === 'followers' && !ids && app.incoming.length ? (
          <button className="set-row" onClick={() => app.push({ type: 'requests' })}><Icon n="userPlus" size={24} /><span className="grow"><span>Takip istekleri</span><span className="sub">{app.incoming.length} kişi bekliyor</span></span><Icon n="chevRight" size={18} /></button>
        ) : null}
        {shown.length ? shown.map((u) => (
          <PersonRow key={u} uid={u}
            right={isMe && tab === 'followers' && !ids ? (
              <span style={{ display: 'flex', gap: 6 }}>
                {!app.following.has(u) && !app.requested.has(u) ? <button className="btn small primary" onClick={() => app.setFollow(u, true)}>Geri takip et</button> : null}
                <button className="btn small" onClick={() => app.removeFollower(u)}>Kaldır</button>
              </span>
            ) : undefined} />
        )) : <Empty title={term ? 'Sonuç yok' : tab === 'followers' && !ids ? 'Henüz takipçi yok' : 'Kimse yok'} text={term ? 'Bu aramayla eşleşen kişi yok.' : null} />}
      </div>
    </Fragment>
  );
}

/* ================================================================ profili düzenle */
export function EditProfileScreen() {
  const app = useApp();
  const back = useBack();
  const p = app.myProfile || {};
  const [username, setUsername] = useState(p.username || '');
  const [displayName, setDisplayName] = useState(p.displayName || '');
  const [category, setCategory] = useState(p.category || '');
  const [bio, setBio] = useState(p.bio || '');
  const [website, setWebsite] = useState(p.website || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [remove, setRemove] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [avail, setAvail] = useState(null);
  const fileRef = useRef(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const changed = username !== p.username;
  useEffect(() => {
    if (!changed || !USERNAME_RE.test(username)) { setAvail(null); return undefined; }
    setAvail('checking');
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await app.sb.rpc('username_available', { name: username });
      if (alive) setAvail(!!data);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [username]);
  const valid = !changed || (USERNAME_RE.test(username) && avail === true);
  const save = async () => {
    if (!valid) { app.toast(!USERNAME_RE.test(username) ? 'Kullanıcı adı geçersiz.' : 'Bu kullanıcı adı alınmış.'); return; }
    setBusy(true);
    const ok = await app.saveProfile({ username, displayName: displayName.trim(), bio: bio.trim(), category: category.trim(), website: website.trim() }, avatarFile, remove);
    setBusy(false);
    if (ok) back();
  };
  const avatarMenu = () => app.setSheet({
    items: [
      { label: 'Yeni profil fotoğrafı', icon: 'image', onClick: () => fileRef.current && fileRef.current.click() },
      ...(p.avatar || avatarFile ? [{ label: 'Fotoğrafı kaldır', icon: 'trash', danger: true, onClick: () => { setRemove(true); setAvatarFile(null); setPreview(null); } }] : []),
    ],
  });
  return (
    <Fragment>
      <TopBar left={<button className="icon-btn" onClick={back} aria-label="Vazgeç"><Icon n="close" size={26} /></button>} title="Profili düzenle"
        right={<button className="text-btn" onClick={save} disabled={busy || !valid}>{busy ? 'Kaydediliyor…' : 'Bitti'}</button>} line />
      <div className="body g">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingBlock: 20 }}>
          {preview ? <img className="av" src={preview} alt="" style={{ width: 96, height: 96 }} /> : remove ? <Avatar uid="__none" size={96} /> : <Avatar uid={app.me.id} size={96} />}
          <button className="text-btn" onClick={avatarMenu}>Fotoğrafı düzenle</button>
          <input ref={fileRef} id="avatar-file" type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (f) { setAvatarFile(f); setRemove(false); setPreview(URL.createObjectURL(f)); }
            e.target.value = '';
          }} />
        </div>
        <div className="field"><label htmlFor="ed-name">Ad</label><input id="ed-name" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} placeholder="Adın" /></div>
        <div className="field"><label htmlFor="ed-user">Kullanıcı adı</label>
          <input id="ed-user" value={username} maxLength={30} autoCapitalize="none" autoCorrect="off" onChange={(e) => setUsername(slugify(e.target.value))} />
          {!changed ? null
            : !USERNAME_RE.test(username) ? <div className="err">3-30 karakter: küçük harf, rakam, nokta, alt çizgi. En az bir harf.</div>
            : avail === 'checking' ? <div className="hint">Kontrol ediliyor…</div>
            : avail === false ? <div className="err">Bu kullanıcı adı alınmış.</div>
            : avail === true ? <div className="hint ok">@{username} kullanılabilir. Eski adın (@{p.username}) sana ayrılır, başkası alamaz.</div> : null}
        </div>
        <div className="field"><label htmlFor="ed-cat">Kategori</label><input id="ed-cat" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} placeholder="Örn. Fotoğrafçı, Web tasarımcısı" /></div>
        <div className="field"><label htmlFor="ed-bio">Biyografi</label>
          <textarea id="ed-bio" rows={3} value={bio} maxLength={150} onChange={(e) => setBio(e.target.value)} placeholder="Kendinden bahset" />
          <div className="hint">{bio.length}/150</div></div>
        <div className="field"><label htmlFor="ed-web">Bağlantı</label><input id="ed-web" value={website} maxLength={200} autoCapitalize="none" onChange={(e) => setWebsite(e.target.value)} placeholder="ornek.com" /></div>
      </div>
    </Fragment>
  );
}

/* ================================================================ ızgara listeleri */
export function GridScreen({ kind, title }) {
  const app = useApp();
  if (kind === 'archive') {
    const mine = app.stories.filter((s) => s.author === app.me.id).sort((a, b) => b.at - a.at);
    return (
      <Fragment>
        <TopBar back title={title} line />
        <div className="body">
          {mine.length ? (
            <Fragment>
              <p className="sub g" style={{ paddingBlock: 10 }}>Bir hikayeyi açıp “Öne çıkar” ile profiline ekle.</p>
              <div className="grid">
                {mine.map((s, i) => (
                  <button key={s.id} className="tile reel" onClick={() => app.openArchive(mine.slice().reverse(), mine.length - 1 - i)} aria-label="Hikayeyi aç">
                    <span style={{ position: 'absolute', inset: 0, display: 'block' }}><StoryMedia s={s} playing={false} small /></span>
                    <span className="stat" style={{ top: 6, bottom: 'auto' }}>{new Date(s.at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                  </button>
                ))}
              </div>
            </Fragment>
          ) : <Empty icon="history" title="Arşiv boş" text="Paylaştığın hikayeler 24 saat sonra burada saklanır." action={<button className="btn grad" onClick={() => app.openCreate('story')}>Hikaye paylaş</button>} />}
        </div>
      </Fragment>
    );
  }
  const list = kind === 'saved'
    ? Object.keys(app.saved).sort((a, b) => app.saved[b] - app.saved[a]).map((id) => app.postById[id]).filter(Boolean)
    : kind === 'postArchive' ? app.posts.filter((p) => p.author === app.me.id && p.archived)
    : app.posts.filter((p) => isOn(p.likes, app.me.id)).sort((a, b) => b.likes[app.me.id] - a.likes[app.me.id]);
  return (
    <Fragment>
      <TopBar back title={title} line />
      <div className="body">
        {list.length ? <div className="grid">{list.map((p) => <GridTile key={p.id} post={p} />)}</div>
          : <Empty icon={kind === 'saved' ? 'bookmark' : kind === 'postArchive' ? 'history' : 'heart'}
              title={kind === 'saved' ? 'Kaydedilen yok' : kind === 'postArchive' ? 'Arşivlenen gönderi yok' : 'Henüz beğeni yok'}
              text={kind === 'saved' ? 'Gönderilerdeki yer imi simgesine dokunarak kaydet.' : kind === 'postArchive' ? 'Gönderi menüsünden “Arşivle” dediğin gönderiler burada sadece sana görünür.' : 'Beğendiğin gönderiler burada görünür.'} />}
      </div>
    </Fragment>
  );
}

/* ================================================================ profili paylaş */
function ProfileCode({ seed }) {
  const cells = [];
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 49; i++) { x = (x * 1103515245 + 12345) >>> 0; cells.push((x >> 16) & 1); }
  return (
    <svg width="132" height="132" viewBox="0 0 7 7" aria-label="Rozstram kodu">
      {cells.map((on, i) => (on ? <rect key={i} x={i % 7 + 0.08} y={Math.floor(i / 7) + 0.08} width=".84" height=".84" rx=".22" fill="#111" /> : null))}
      <rect x="0.08" y="0.08" width="2.2" height="2.2" rx=".5" fill="none" stroke="#ff2e6e" strokeWidth=".35" />
    </svg>
  );
}

export function ShareProfileSheet({ uid, onClose }) {
  const app = useApp();
  const p = app.profiles[uid] || {};
  const url = app.profileUrl(uid);
  return (
    <Sheet onClose={onClose} z={65}>
      <div className="g sheet-body" style={{ paddingBottom: 16 }}>
        <div className="share-card">
          <Avatar uid={uid} size={72} />
          <span className="handle">@{p.username}</span>
          <span className="codebox"><ProfileCode seed={p.username || 'rozstram'} /></span>
          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>{url.replace(/^https?:\/\//, '')}</span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn grad block big" onClick={async () => { const r = await shareLink('@' + p.username + ' Rozstram’da', url); if (r === 'copied') app.toast('Profil bağlantısı kopyalandı'); }}><Icon n="share" size={18} />Profil bağlantısını paylaş</button>
          {uid !== app.me.id ? null : <button className="btn block big" onClick={() => { onClose(); app.push({ type: 'edit' }); }}><Icon n="edit" size={18} />Profili düzenle</button>}
        </div>
      </div>
    </Sheet>
  );
}

/* ================================================================ öne çıkar */
export function HighlightSheet({ storyId, onClose }) {
  const app = useApp();
  const list = (app.myProfile && app.myProfile.highlights) || [];
  const [title, setTitle] = useState('');
  return (
    <Sheet onClose={onClose} title="Öne çıkanlara ekle" z={80}>
      <div className="g sheet-body" style={{ paddingBottom: 16 }}>
        <div className="highlights" style={{ paddingBlock: 14 }}>
          {list.map((hl) => {
            const has = hl.items.indexOf(storyId) >= 0;
            return (
              <button className="hl" key={hl.id} disabled={has} onClick={() => { app.addToHighlight(storyId, hl.id); onClose(); }}>
                <span className="cv" style={has ? { borderColor: 'var(--primary)' } : undefined}>{hl.cover ? <img src={mediaUrl(hl.cover)} alt="" /> : <span className="add"><Icon n="star" size={22} /></span>}</span>
                <span>{has ? '✓ ' : ''}{hl.title}</span>
              </button>
            );
          })}
        </div>
        <div className="field"><label htmlFor="hl-title">Yeni öne çıkan</label>
          <input id="hl-title" placeholder="Başlık, ör. Tatil" value={title} maxLength={16} onChange={(e) => setTitle(e.target.value)} /></div>
        <button className="btn grad block big" disabled={!title.trim()} onClick={() => { app.addToHighlight(storyId, null, title.trim()); onClose(); }}>Oluştur ve ekle</button>
      </div>
    </Sheet>
  );
}
