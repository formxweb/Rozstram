// Yıl özeti (hikaye gibi kayan sayfalar) ve "En sevdiğin yıl" sorusu. 18 yaş altına daha renkli, çocuksu bir sürüm gösterilir.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { mediaUrl, store } from './lib.js';
import { Avatar, Icon, Sheet, Spinner } from './ui.jsx';

const NOW = () => new Date();
export const recapYear = () => { const d = NOW(); return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); };
export const recapSeason = () => { const d = NOW(); return (d.getMonth() === 11 && d.getDate() >= 15) || d.getMonth() === 0; };
const n = (x) => Number(x || 0).toLocaleString('tr-TR');
const SEASONS = { kis: { e: '❄️', l: 'Kışı' }, yaz: { e: '☀️', l: 'Yazı' } };
const STICKERS = ['🎈', '⭐', '🍭', '🦄', '🌈', '🎉', '🧁', '🚀', '🐣', '🍦'];

function yearsAgoText(y, kid) {
  const d = NOW().getFullYear() - y;
  if (d <= 0) return kid ? 'Bu yıl! Demek en güzel yıl şu an yaşadığın yıl 🥳' : 'Bu yıl! Demek en güzel zamanı şu an yaşıyorsun ✨';
  if (d === 1) return kid ? 'Daha geçen yıl! 1 yıl geçmiş bile 🙈' : 'Daha geçen yıl… 1 yıl geçmiş bile!';
  return d + ' yıl geçmiş, vay be! ' + (kid ? '🤩' : '⏳');
}

/* ---------------------------------------------------------------- en sevdiğin yıl akışı */
export function FavoriteYearFlow({ kid, onFinish, compact }) {
  const app = useApp();
  const birth = (app.account && app.account.birthYear) || null;
  const cur = NOW().getFullYear();
  const from = Math.max(1950, birth || 1950);
  const years = useMemo(() => { const a = []; for (let y = cur; y >= from; y--) a.push(y); return a; }, [from, cur]);
  const mine = app.favoriteYear;
  const [step, setStep] = useState('pick');
  const [y, setY] = useState(mine ? mine.year : null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const stripRef = useRef(null);
  useEffect(() => {
    const el = stripRef.current;
    const t = y || Math.max(from, cur - 8);
    const b = el && el.querySelector('[data-y="' + t + '"]');
    if (b && el) el.scrollLeft = b.offsetLeft - el.clientWidth / 2 + b.clientWidth / 2;
  }, [step]);
  const choose = async (season) => {
    setBusy(true);
    const r = await app.setFavoriteYear(y, season);
    setBusy(false);
    if (r) { setInfo(r); setStep('result'); }
  };
  const ageThen = birth && y ? y - birth : null;

  if (step === 'pick') {
    return (
      <div className={'fy' + (compact ? ' compact' : '')}>
        <span className="fy-kicker">{kid ? 'Bir soru 🎈' : 'Bir soru'}</span>
        <h2>En sevdiğin yıl hangisi?</h2>
        <div className="fy-big" aria-live="polite">{y || '— — — —'}</div>
        <div className="fy-strip" ref={stripRef}>
          {years.map((x) => <button key={x} data-y={x} className={'fy-year' + (x === y ? ' on' : '')} onClick={(e) => { e.stopPropagation(); setY(x); }}>{x}</button>)}
        </div>
        <button className="btn fy-go" id="fy-next" disabled={!y} onClick={(e) => { e.stopPropagation(); setStep('wow'); }}>{kid ? 'Bu yıl! 🙌' : 'Bu yıl'}</button>
      </div>
    );
  }
  if (step === 'wow') {
    return (
      <div className={'fy' + (compact ? ' compact' : '')}>
        <div className="fy-big pop">{y}</div>
        <h2 className="fy-wow" id="fy-wow">{yearsAgoText(y, kid)}</h2>
        {ageThen !== null && ageThen >= 0 && ageThen < 120 ? <p className="fy-sub">{ageThen === 0 ? 'O yıl dünyaya gelmiştin 👶' : 'O zamanlar ' + ageThen + ' yaşındaydın' + (kid ? ' 🧒' : '.')}</p> : null}
        <p className="fy-q">{y}’in kışı mı, yazı mı?</p>
        <div className="fy-seasons">
          {Object.keys(SEASONS).map((k) => (
            <button key={k} id={'fy-' + k} className={'fy-season ' + k} disabled={busy} onClick={(e) => { e.stopPropagation(); choose(k); }}>
              <span>{SEASONS[k].e}</span><b>{SEASONS[k].l}</b>
            </button>
          ))}
        </div>
        <button className="fy-back" onClick={(e) => { e.stopPropagation(); setStep('pick'); }}>Başka yıl seç</button>
      </div>
    );
  }
  const same = info ? Number(info.sameYear || 0) : 0;
  const season = info && info.mine ? info.mine.season : null;
  const agree = info ? Number(season === 'yaz' ? info.summer : info.winter) : 0;
  const pct = same ? Math.round((agree / same) * 100) : 100;
  return (
    <div className={'fy' + (compact ? ' compact' : '')}>
      <div className="fy-big">{y} <span>{season ? SEASONS[season].e : ''}</span></div>
      <h2 id="fy-result">{same > 1 ? (y + '’i seçen ' + n(same) + ' kişinin %' + pct + '’i de ' + (season === 'yaz' ? 'yazı' : 'kışı') + ' seçti.') : ('İlk ' + y + ' hayranı sensin! ' + (kid ? '🏆' : '✨'))}</h2>
      {info && info.top ? <p className="fy-sub">Rozstram’ın en sevdiği yıl: <b>{info.top.year}</b> ({n(info.top.count)} kişi)</p> : null}
      <div className="fy-actions">
        <button className="fy-back" onClick={(e) => { e.stopPropagation(); setStep('pick'); }}>Değiştir</button>
        {onFinish ? <button className="btn fy-go" id="fy-done" onClick={(e) => { e.stopPropagation(); onFinish(info); }}>{kid ? 'Süper! Devam 🚀' : 'Devam'}</button> : null}
      </div>
    </div>
  );
}

export function FavoriteYearSheet({ onClose }) {
  const app = useApp();
  return (
    <Sheet onClose={onClose} title="En sevdiğin yıl" z={66} className={'fy-sheet' + (app.minor ? ' kid' : '')}>
      <div className="sheet-body g"><FavoriteYearFlow kid={app.minor} compact onFinish={onClose} /></div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- akıştaki kart */
export function FeedPrompt() {
  const app = useApp();
  const key = 'fyHide:' + app.me.id;
  const [hidden, setHidden] = useState(() => store.get(key, false));
  const season = recapSeason();
  if (season) {
    return (
      <button className={'feed-prompt recap' + (app.minor ? ' kid' : '')} id="recap-card" onClick={() => app.openRecap()}>
        <span className="fp-ic">✨</span>
        <span className="grow"><b>{recapYear()} özetin hazır</b><span>{app.minor ? 'Yılının en eğlenceli anlarına bak! 🎈' : 'Yılına bir bak: paylaşımların, beğenilerin, en sevdiğin yıl…'}</span></span>
        <Icon n="chevRight" size={20} />
      </button>
    );
  }
  if (app.favoriteYear || hidden) return null;
  return (
    <div className={'feed-prompt' + (app.minor ? ' kid' : '')} id="fy-card">
      <span className="fp-ic">🕰️</span>
      <button className="grow" onClick={() => app.openFavoriteYear()}><b>En sevdiğin yıl hangisi?</b><span>Seç, kaç yıl geçtiğine bak, kışı mı yazı mı söyle.</span></button>
      <button className="fp-x" aria-label="Kapat" onClick={() => { store.set(key, true); setHidden(true); }}><Icon n="close" size={16} /></button>
    </div>
  );
}

/* ---------------------------------------------------------------- yıl özeti */
const SLIDE_MS = 5500;

export function YearRecap({ onClose }) {
  const app = useApp();
  const kid = app.minor;
  const year = recapYear();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [i, setI] = useState(0);
  const [fyDone, setFyDone] = useState(false);
  const [sharing, setSharing] = useState(false);
  const me = app.myProfile || {};
  useEffect(() => {
    let alive = true;
    app.sb.rpc('year_recap', { y: year }).then(({ data: d, error }) => { if (!alive) return; if (error || !d) setErr(true); else setData(d); });
    return () => { alive = false; };
  }, []);

  const slides = useMemo(() => {
    if (!data) return [];
    const s = ['intro', 'shares', 'love'];
    if (data.topPost) s.push('top');
    s.push('people');
    if ((data.topTags && data.topTags.length) || (data.topPeople && data.topPeople.length)) s.push('tags');
    s.push('fav', 'end');
    return s;
  }, [data]);
  const cur = slides[i];
  const interactive = cur === 'fav' || cur === 'end';
  useEffect(() => {
    if (!data || interactive) return undefined;
    const t = setTimeout(() => setI((x) => Math.min(x + 1, slides.length - 1)), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, data, interactive]);
  const go = (d) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)));
  const tap = (e) => {
    if (interactive) return;
    const r = e.currentTarget.getBoundingClientRect();
    go(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
  };
  const fav = app.favoriteYear;
  const share = async () => {
    if (!data || sharing) return;
    setSharing(true);
    const lines = [year + ' özetim ' + (kid ? '🎉' : '✨'),
      '📸 ' + n(Number(data.posts) + Number(data.reels)) + ' paylaşım · ' + n(data.stories) + ' hikaye',
      '❤️ ' + n(data.likes) + ' beğeni · 👥 +' + n(data.followers) + ' takipçi'];
    if (fav) lines.push('🕰️ En sevdiğim yıl: ' + fav.year + (fav.season ? ' ' + SEASONS[fav.season].e : ''));
    const ok = await app.publish({ mode: 'story', textStory: { body: lines.join('\n'), bg: kid ? 5 : 0, font: 'modern', color: '#ffffff' } }, () => {});
    setSharing(false);
    if (ok) onClose();
  };

  const bg = (kid ? ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8'] : ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'])[i % 8];
  return (
    <div className={'recap ' + bg + (kid ? ' kid' : '')} role="dialog" aria-label={year + ' özetin'}>
      {kid ? <div className="recap-stickers" aria-hidden="true">{STICKERS.map((s, k) => <i key={k} style={{ left: ((k * 37) % 92) + '%', animationDelay: (k * 0.7) + 's' }}>{s}</i>)}</div> : null}
      <div className="snap-bars recap-bars">{slides.map((s, k) => <i key={s} className={k < i ? 'done' : k === i ? (interactive ? 'on done' : 'run') : ''} style={k === i && !interactive ? { '--d': SLIDE_MS + 'ms' } : undefined} />)}</div>
      <div className="recap-head">
        <span className="recap-brand">{year} · Rozstram</span>
        <button className="snap-round" aria-label="Kapat" onClick={onClose}><Icon n="close" size={24} /></button>
      </div>
      <div className="recap-body" onClick={tap} key={cur || 'load'}>
        {!data && !err ? <Spinner /> : null}
        {err ? <div className="recap-slide"><h2>Özet yüklenemedi</h2><button className="btn" onClick={onClose}>Kapat</button></div> : null}
        {cur === 'intro' ? (
          <div className="recap-slide">
            <div className="recap-year">{year}</div>
            <h2>{kid ? 'Hazır mısın @' + (me.username || '') + '? Yılının özeti geliyor! 🎈' : '@' + (me.username || '') + ', yılın nasıl geçti bir bakalım.'}</h2>
            <p>{Number(data.joined) === year ? 'Rozstram’la tanıştığın yıl!' : Number(data.joined) < year ? 'Rozstram’da ' + (year - Number(data.joined) + 1) + '. yılın.' : ''}</p>
          </div>
        ) : null}
        {cur === 'shares' ? (
          <div className="recap-slide">
            <span className="recap-kicker">{kid ? 'Neler paylaştın? 📸' : 'Paylaştıkların'}</span>
            {Number(data.posts) + Number(data.reels) + Number(data.stories) ? (
              <div className="recap-nums">
                <div><b>{n(data.posts)}</b><span>gönderi</span></div>
                <div><b>{n(data.reels)}</b><span>Reels</span></div>
                <div><b>{n(data.stories)}</b><span>hikaye</span></div>
              </div>
            ) : <h2>{kid ? 'Bu yıl daha çok izledin 👀 Seneye sahne senin!' : 'Bu yıl daha çok izleyiciydin. Seneye sahne senin.'}</h2>}
            {Number(data.activeDays) ? <p>{n(data.activeDays)} gün Rozstram’da bir şeyler yaptın{kid ? ' 🌟' : '.'}</p> : null}
          </div>
        ) : null}
        {cur === 'love' ? (
          <div className="recap-slide">
            <span className="recap-kicker">{kid ? 'Ne kadar sevildin? 💖' : 'Topladığın sevgi'}</span>
            <div className="recap-hero"><b>{n(data.likes)}</b><span>beğeni</span></div>
            <div className="recap-nums two">
              <div><b>{n(data.comments)}</b><span>yorum</span></div>
              <div><b>{n(data.views)}</b><span>video izlenmesi</span></div>
            </div>
            {Number(data.likesGiven) ? <p>Sen de {n(data.likesGiven)} kez kalp bıraktın{kid ? ' 💕' : '.'}</p> : null}
          </div>
        ) : null}
        {cur === 'top' ? (
          <div className="recap-slide">
            <span className="recap-kicker">{kid ? 'Yılın yıldızı ⭐' : 'Yılın en sevilen gönderin'}</span>
            <div className="recap-top">
              {(() => {
                const m = (data.topPost.media || [])[0] || {};
                const src = m.type === 'video' ? (m.thumb ? mediaUrl(m.thumb) : null) : mediaUrl(m.id);
                return src ? <img src={src} alt="" /> : <div className="recap-top-ph"><Icon n="reels" size={40} /></div>;
              })()}
              <span className="recap-top-likes">❤️ {n(Object.keys(data.topPost.likes || {}).length)}</span>
            </div>
            {data.topPost.caption ? <p className="recap-cap">“{String(data.topPost.caption).slice(0, 90)}”</p> : null}
          </div>
        ) : null}
        {cur === 'people' ? (
          <div className="recap-slide">
            <span className="recap-kicker">{kid ? 'Yeni arkadaşlar 🤝' : 'Çevren büyüdü'}</span>
            <div className="recap-hero"><b>+{n(data.followers)}</b><span>yeni takipçi</span></div>
            {Number(data.messages) ? <p>{n(data.messages)} mesaj gönderdin{kid ? ' 💬' : '.'}</p> : null}
          </div>
        ) : null}
        {cur === 'tags' ? (
          <div className="recap-slide">
            {data.topTags && data.topTags.length ? (
              <Fragment>
                <span className="recap-kicker">En çok kullandığın etiketler</span>
                <div className="recap-tags">{data.topTags.map((t) => <span key={t}>#{t}</span>)}</div>
              </Fragment>
            ) : null}
            {data.topPeople && data.topPeople.length ? (
              <Fragment>
                <span className="recap-kicker" style={{ marginTop: 22 }}>{kid ? 'En çok kalp attıkların 💗' : 'En çok beğendiğin hesaplar'}</span>
                <div className="recap-people">{data.topPeople.filter((u) => app.profiles[u]).map((u) => <span key={u}><Avatar uid={u} size={64} /><b>{app.nameOf(u)}</b></span>)}</div>
              </Fragment>
            ) : null}
          </div>
        ) : null}
        {cur === 'fav' ? (
          <div className="recap-slide wide">
            <FavoriteYearFlow kid={kid} onFinish={() => { setFyDone(true); go(1); }} />
            {!fyDone ? <button className="fy-skip" onClick={(e) => { e.stopPropagation(); go(1); }}>Geç</button> : null}
          </div>
        ) : null}
        {cur === 'end' ? (
          <div className="recap-slide">
            <div className="recap-card" id="recap-summary">
              <span className="recap-kicker">{year} özetim</span>
              <div className="recap-card-rows">
                <span>📸 {n(Number(data.posts) + Number(data.reels))} paylaşım</span>
                <span>❤️ {n(data.likes)} beğeni</span>
                <span>👥 +{n(data.followers)} takipçi</span>
                {fav ? <span>🕰️ En sevdiğim yıl: {fav.year} {fav.season ? SEASONS[fav.season].e : ''}</span> : null}
              </div>
              <span className="recap-card-user">@{me.username}</span>
            </div>
            <div className="recap-end-btns">
              <button className="btn grad big" id="recap-share" disabled={sharing} onClick={(e) => { e.stopPropagation(); share(); }}>{sharing ? 'Paylaşılıyor…' : 'Hikayende paylaş'}</button>
              <button className="btn big" onClick={(e) => { e.stopPropagation(); setI(0); }}>Baştan izle</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
