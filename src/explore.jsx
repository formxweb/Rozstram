import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { CATEGORIES, fmt, mediaUrl, onKeys, store, tagsOf } from './lib.js';
import { Empty, Icon, PersonRow, TopBar } from './ui.jsx';
import { GridTile } from './feed.jsx';

export function ExploreScreen() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [cat, setCat] = useState('all');
  const [rtab, setRtab] = useState('people');
  const [recent, setRecent] = useState(() => store.get('recent', []));
  const scRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { if (app.retap.tab === 'explore' && scRef.current) scRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [app.retap.n]);

  const term = q.trim().toLowerCase().replace(/^[@#]/, '');
  const searching = focused || !!q.trim();
  const people = useMemo(() => {
    if (!term) return [];
    return Object.keys(app.profiles).filter((uid) => {
      const p = app.profiles[uid];
      if (app.blocks[uid]) return false;
      return (p.username || '').indexOf(term) >= 0 || (p.displayName || '').toLocaleLowerCase('tr').indexOf(term) >= 0;
    }).sort((a, b) => {
      const pa = app.profiles[a], pb = app.profiles[b];
      const sa = (pa.username.indexOf(term) === 0 ? 4 : 0) + (app.following.has(a) ? 2 : 0) + (pa.verified ? 1 : 0);
      const sb = (pb.username.indexOf(term) === 0 ? 4 : 0) + (app.following.has(b) ? 2 : 0) + (pb.verified ? 1 : 0);
      return sb - sa;
    }).slice(0, 50);
  }, [term, app.profiles, app.blocks, app.following]);
  const tags = useMemo(() => {
    const m = {};
    app.visiblePosts.forEach((p) => tagsOf(p.caption).forEach((t) => { m[t] = (m[t] || 0) + 1; }));
    return Object.keys(m).filter((t) => !term || t.indexOf(term) >= 0).sort((a, b) => m[b] - m[a]).slice(0, 30).map((t) => ({ t, n: m[t] }));
  }, [term, app.visiblePosts]);
  const ranked = useMemo(() => {
    let list = app.visiblePosts.filter((p) => !app.hidden[p.id] && !app.mutes[p.author] && p.author !== app.me.id);
    if (cat !== 'all') {
      const c = CATEGORIES.find((x) => x.id === cat);
      list = list.filter((p) => tagsOf(p.caption).some((t) => c.tags.indexOf(t) >= 0));
    }
    return app.rankList(list, true);
  }, [app.visiblePosts, app.rankList, cat, app.hidden, app.mutes, app.me.id]);
  const counts = useMemo(() => {
    const m = {};
    CATEGORIES.forEach((c) => { m[c.id] = app.visiblePosts.filter((p) => tagsOf(p.caption).some((t) => c.tags.indexOf(t) >= 0)).length; });
    return m;
  }, [app.visiblePosts]);

  const remember = (item) => {
    const next = [item].concat(recent.filter((r) => !(r.type === item.type && r.v === item.v))).slice(0, 12);
    setRecent(next); store.set('recent', next);
  };
  const openPerson = (uid) => { remember({ type: 'user', v: uid }); app.openUser(uid); };
  const openTagItem = (t) => { remember({ type: 'tag', v: t }); app.openTag(t); };
  const cancel = () => { setQ(''); setFocused(false); if (inputRef.current) inputRef.current.blur(); };

  return (
    <div className="scroller" ref={scRef}>
      <header className="topbar">
        <div className="searchbar" style={{ flex: 1 }}>
          <label className="search"><Icon n="search" size={17} />
            <input ref={inputRef} id="explore-q" type="search" placeholder="Ara" value={q} autoComplete="off" autoCapitalize="none"
              onFocus={() => setFocused(true)} onChange={(e) => setQ(e.target.value)} />
            {q ? <button onClick={() => setQ('')} aria-label="Temizle"><Icon n="close" size={16} /></button> : null}
          </label>
          {searching ? <button className="cancel-btn" onClick={cancel}>Vazgeç</button> : null}
        </div>
      </header>

      {searching ? (
        !term ? (
          <div className="g">
            <div className="recent-head"><span>Son aramalar</span>{recent.length ? <button onClick={() => { setRecent([]); store.set('recent', []); }}>Tümünü temizle</button> : null}</div>
            {recent.length ? recent.map((r, i) => (
              r.type === 'user' && app.profiles[r.v]
                ? <PersonRow key={i} uid={r.v} onClick={() => app.openUser(r.v)} right={<button className="icon-btn" aria-label="Kaldır" onClick={() => { const n = recent.filter((_, j) => j !== i); setRecent(n); store.set('recent', n); }}><Icon n="close" size={18} /></button>} />
                : r.type === 'tag' ? (
                  <div className="row" key={i}>
                    <button className="row-main" onClick={() => app.openTag(r.v)}><span className="hl"><span className="cv" style={{ width: 48, height: 48 }}><span className="add"><b>#</b></span></span></span><span className="grow"><b>#{r.v}</b></span></button>
                    <button className="icon-btn" aria-label="Kaldır" onClick={() => { const n = recent.filter((_, j) => j !== i); setRecent(n); store.set('recent', n); }}><Icon n="close" size={18} /></button>
                  </div>
                ) : null
            )) : <p className="sub" style={{ paddingBlock: 8 }}>Henüz arama yapmadın.</p>}
          </div>
        ) : (
          <Fragment>
            <div className="seg-tabs">
              <button className={rtab === 'people' ? 'on' : ''} onClick={() => setRtab('people')}>Hesaplar</button>
              <button className={rtab === 'tags' ? 'on' : ''} onClick={() => setRtab('tags')}>Etiketler</button>
              <span className="bar" style={{ width: '50%', transform: rtab === 'people' ? 'translateX(0)' : 'translateX(100%)' }} />
            </div>
            <div className="g">
              {rtab === 'people'
                ? (people.length ? people.map((uid) => <PersonRow key={uid} uid={uid} onClick={() => openPerson(uid)} />) : <Empty title="Sonuç yok" text={'"' + q.trim() + '" ile eşleşen hesap bulunamadı.'} />)
                : (tags.length ? tags.map(({ t, n }) => (
                  <button className="row" key={t} onClick={() => openTagItem(t)}>
                    <span className="hl"><span className="cv" style={{ width: 48, height: 48 }}><span className="add"><b style={{ fontSize: 20 }}>#</b></span></span></span>
                    <span className="grow"><b>#{t}</b><span className="sub">{fmt(n)} gönderi</span></span>
                  </button>
                )) : <Empty title="Sonuç yok" text="Bu etiketle gönderi bulunamadı." />)}
            </div>
          </Fragment>
        )
      ) : (
        <Fragment>
          <div className="chips g">
            <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}><Icon n="sparkle" size={15} />Senin için</button>
            {CATEGORIES.filter((c) => counts[c.id]).map((c) => <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
          {ranked.length
            ? <div className="grid dense" key={cat}>{ranked.map((p, i) => <GridTile key={p.id} post={p} tall={p.media && p.media[0] && p.media[0].type === 'video' && (i % 5 === 2)} />)}</div>
            : <Empty icon="search" title="Keşfedecek bir şey yok" text="Herkese açık hesaplar paylaşım yaptıkça burada popüler olanları göreceksin. Yukarıdan kişi arayabilirsin." />}
          <p className="sub g" style={{ textAlign: 'center', paddingBlock: 14 }}>Basılı tutarak gönderiyi önizle</p>
        </Fragment>
      )}
    </div>
  );
}

export function TagScreen({ tag }) {
  const app = useApp();
  const [tab, setTab] = useState('top');
  const t = (tag || '').toLocaleLowerCase('tr');
  const list = app.visiblePosts.filter((p) => tagsOf(p.caption).indexOf(t) >= 0 || (p.location || '').replace(/\s+/g, '').toLocaleLowerCase('tr') === t);
  const shown = tab === 'top' ? list.slice().sort((a, b) => onKeys(b.likes).length - onKeys(a.likes).length) : list.slice().sort((a, b) => b.at - a.at);
  const cover = list[0] && list[0].media && list[0].media[0];
  return (
    <Fragment>
      <TopBar back title={'#' + tag} line />
      <div className="body">
        <div className="g prof-head" style={{ paddingBlock: 16 }}>
          <span style={{ width: 86, height: 86, borderRadius: 26, overflow: 'hidden', background: 'var(--grad)', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff' }}>
            {cover && (cover.type !== 'video' || cover.thumb) ? <img src={mediaUrl(cover.type === 'video' ? cover.thumb : cover.id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <b style={{ fontSize: 34 }}>#</b>}
          </span>
          <div className="grow" style={{ gap: 4 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>#{tag}</b>
            <span className="sub">{fmt(list.length)} gönderi</span>
          </div>
        </div>
        <div className="seg-tabs">
          <button className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')}>En iyiler</button>
          <button className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>En yeniler</button>
          <span className="bar" style={{ width: '50%', transform: tab === 'top' ? 'translateX(0)' : 'translateX(100%)' }} />
        </div>
        {shown.length ? <div className="grid">{shown.map((p) => <GridTile key={p.id} post={p} />)}</div> : <Empty title="Gönderi yok" text={'#' + tag + ' etiketiyle henüz gönderi yok.'} />}
      </div>
    </Fragment>
  );
}
