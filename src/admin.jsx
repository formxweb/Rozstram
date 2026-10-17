// Yönetici paneli: genel bakış, algoritma ayarı, şikayetler, kullanıcılar (ban), öne çıkanlar, müzik, mavi tik.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './ctx.js';
import { ago, fmt, initialsAvatar, mediaUrl } from './lib.js';
import { RANK_DEFAULTS, rankWeights } from './rank.js';
import { Avatar, Empty, Icon, Sheet, Spinner, TopBar, Verified } from './ui.jsx';
import { AdminMusic } from './music.jsx';

const TABS = [['genel', 'Genel'], ['kisi', 'Kullanıcılar'], ['sikayet', 'Şikayetler'], ['algoritma', 'Algoritma'], ['one', 'Öne çıkanlar'], ['muzik', 'Müzik'], ['tik', 'Mavi tik']];

const SLIDERS = [
  ['video', 'Video önceliği', 'Reels ve videolar akışta ne kadar öne çıksın.'],
  ['follow', 'Takip ve ilişki', 'Kişinin takip ettiği, beğendiği, mesajlaştığı hesaplar.'],
  ['interest', 'İlgi alanı', 'Beğendiği konulara (#etiket) ve içerik türüne benzerlik.'],
  ['popular', 'Popülerlik', 'Çok beğenilen, yorum alan, izlenen gönderiler.'],
  ['fresh', 'Tazelik', 'Yeni gönderiler ne kadar önde olsun. 0: tarihe bakılmaz, sadece başarı.'],
  ['newcomer', 'Yeni gönderiye şans', 'Henüz etkileşim almamış yeni gönderilere ilk görünürlük.'],
];
const level = (v) => (v === 0 ? 'Kapalı' : v < 0.8 ? 'Az' : v <= 1.2 ? 'Normal' : 'Çok');
const KIND = { post: 'Gönderi', user: 'Profil', comment: 'Yorum', story: 'Hikaye', message: 'Mesaj' };

function Stat({ n, label, sub }) {
  return <div className="adm-stat"><b>{fmt(n || 0)}</b><span>{label}</span>{sub ? <i>{sub}</i> : null}</div>;
}

function Overview({ data }) {
  if (!data) return <div className="center-pad"><Spinner /></div>;
  return (
    <div className="adm-stats">
      <Stat n={data.users} label="Kullanıcı" sub={data.usersToday ? '+' + data.usersToday + ' bugün' : null} />
      <Stat n={data.posts} label="Gönderi" sub={data.postsToday ? '+' + data.postsToday + ' bugün' : null} />
      <Stat n={data.stories} label="Aktif hikaye" />
      <Stat n={data.messagesToday} label="Bugünkü mesaj" />
      <Stat n={data.views} label="Video izlenme" />
      <Stat n={data.openReports} label="Açık şikayet" />
      <Stat n={data.banned} label="Banlı hesap" sub={data.appeals ? data.appeals + ' itiraz bekliyor' : null} />
    </div>
  );
}

function Algorithm() {
  const app = useApp();
  const [w, setW] = useState(() => rankWeights(app.settings && app.settings.rank));
  const [busy, setBusy] = useState(false);
  const saved = rankWeights(app.settings && app.settings.rank);
  const dirty = Object.keys(w).some((k) => w[k] !== saved[k]);
  const save = async () => { setBusy(true); await app.admin.setRank(w); setBusy(false); };
  return (
    <Fragment>
      <p className="adm-note">Ayarlar herkesin akışına, Reels ve Keşfet sıralamasına uygulanır. Kişiler bir sonraki açılışta yeni sıralamayı görür.</p>
      {SLIDERS.map(([k, label, sub]) => (
        <div className="adm-slider" key={k}>
          <div className="row"><b>{label}</b><span className={'lvl' + (w[k] === 1 ? '' : ' on')}>{level(w[k])} · {w[k].toFixed(1)}</span></div>
          <input type="range" min="0" max="2" step="0.1" value={w[k]} aria-label={label} id={'adm-' + k}
            onChange={(e) => setW((o) => ({ ...o, [k]: Math.round(Number(e.target.value) * 10) / 10 }))} />
          <div className="sub">{sub}</div>
        </div>
      ))}
      <div className="adm-actions">
        <button className="btn" onClick={() => setW({ ...RANK_DEFAULTS })}>Varsayılana dön</button>
        <button className="btn grad" disabled={!dirty || busy} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
    </Fragment>
  );
}

function PostThumb({ media }) {
  const m = (media || [])[0];
  if (!m) return <div className="adm-thumb" />;
  const src = m.type === 'video' ? (m.thumb ? mediaUrl(m.thumb) : null) : mediaUrl(m.id);
  return <div className="adm-thumb">{src ? <img src={src} alt="" /> : <Icon n="play" fill size={18} />}</div>;
}

function Reports({ onChange }) {
  const app = useApp();
  const [list, setList] = useState(null);
  const [banFor, setBanFor] = useState(null);
  const load = async () => { const d = await app.admin.reports(); setList(Array.isArray(d) ? d : []); };
  useEffect(() => { load(); }, []);
  if (!list) return <div className="center-pad"><Spinner /></div>;
  const seen = {};
  const rows = list.filter((r) => { const k = r.kind + ':' + r.target; if (seen[k]) return false; seen[k] = true; return true; });
  if (!rows.length) return <Empty icon="checkCircle" title="Açık şikayet yok" text="Kullanıcıların şikayetleri buraya düşer." />;
  const done = async (p) => { await p; await load(); onChange(); };
  return (<Fragment>{rows.map((r) => {
    const pv = r.preview || {};
    return (
      <div className="adm-card" key={r.id}>
        <div className="row">
          <span className="pill">{KIND[r.kind] || r.kind}</span>
          {r.count > 1 ? <span className="pill warn">{r.count} şikayet</span> : null}
          <span className="when">{ago(r.at)}</span>
        </div>
        {r.reason ? <div className="reason">“{r.reason}”</div> : null}
        {pv.author ? (
          <div className="pv">
            {r.kind === 'post' || r.kind === 'story' ? <PostThumb media={Array.isArray(pv.media) ? pv.media : pv.media ? [pv.media] : []} /> : <Avatar uid={pv.author} size={40} />}
            <div className="grow"><b>{app.nameOf(pv.author)}</b>{pv.caption ? <span>{pv.caption}</span> : null}</div>
          </div>
        ) : <div className="reason">İçerik artık yok (silinmiş).</div>}
        <div className="adm-actions">
          {r.kind === 'post' && pv.author ? <button className="btn" onClick={() => app.openPost(r.target)}>Aç</button> : null}
          {pv.author ? <button className="btn" onClick={() => app.openUser(pv.author)}>Profil</button> : null}
          {r.kind === 'post' && pv.author && !pv.removed ? <button className="btn danger-btn" onClick={() => done(app.admin.remove({ id: r.target, author: pv.author }, r.reason))}>Kaldır</button> : null}
          {pv.author && pv.author !== app.me.id ? <button className="btn danger-btn" onClick={() => setBanFor({ uid: pv.author, reason: r.reason })}>Banla</button> : null}
          <button className="btn" onClick={() => done(app.admin.resolve(r.id))}>Görmezden gel</button>
        </div>
      </div>
    );
  })}
  {banFor ? <BanSheet uid={banFor.uid} presetNote={banFor.reason} onClose={() => setBanFor(null)} onDone={() => { load(); onChange(); }} /> : null}
  </Fragment>);
}

function Boosted({ data, reload }) {
  const app = useApp();
  const [posts, setPosts] = useState({});
  useEffect(() => {
    if (!data) return;
    const ids = data.boosts.map((b) => b.post).concat(data.removed.map((r) => r.post)).filter((id) => !app.postById[id]);
    if (ids.length) app.sb.rpc('get_posts', { ids }).then(({ data: d }) => { const m = {}; ((d && d.posts) || []).forEach((p) => { m[p.id] = p; }); setPosts(m); });
  }, [data]);
  if (!data) return <div className="center-pad"><Spinner /></div>;
  const get = (id) => app.postById[id] || posts[id] || null;
  return (
    <Fragment>
      <p className="adm-note">Bir gönderiyi öne çıkarmak için gönderinin ••• menüsünden <b>Öne çıkar</b>’ı seç. Öne çıkan gönderi, görmeyen herkesin akışında en üstte görünür.</p>
      <div className="set-head">Şu an öne çıkanlar</div>
      {data.boosts.length ? data.boosts.map((b) => {
        const p = get(b.post);
        return (
          <div className="adm-card row-card" key={b.post}>
            <PostThumb media={p && p.media} />
            <div className="grow" onClick={() => app.openPost(b.post)}><b>{p ? app.nameOf(p.author) : 'Gönderi'}</b><span>{new Date(b.until).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar</span></div>
            <button className="btn" onClick={async () => { await app.admin.boost({ id: b.post }, 0); reload(); }}>Bitir</button>
          </div>
        );
      }) : <div className="adm-empty">Öne çıkarılan gönderi yok.</div>}
      <div className="set-head">Kaldırılan gönderiler</div>
      {data.removed.length ? data.removed.map((r) => {
        const p = get(r.post);
        return (
          <div className="adm-card row-card" key={r.post}>
            <PostThumb media={p && p.media} />
            <div className="grow"><b>{p ? app.nameOf(p.author) : 'Gönderi'}</b><span>{r.reason || 'Yönetici kaldırdı'} · {ago(r.at)}</span></div>
            <button className="btn" onClick={async () => { await app.admin.restore(r.post); reload(); }}>Geri getir</button>
          </div>
        );
      }) : <div className="adm-empty">Kaldırılan gönderi yok.</div>}
    </Fragment>
  );
}

/* ---------------------------------------------------------------- ban */
const BAN_REASONS = ['Spam', 'Taciz veya zorbalık', 'Sahte hesap', 'Uygunsuz içerik', 'Dolandırıcılık', 'Nefret söylemi'];
const BAN_DAYS = [[1, '1 gün'], [7, '7 gün'], [30, '30 gün'], [0, 'Kalıcı']];
const dayText = (ms) => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const userAvatar = (u) => (u.avatar ? mediaUrl(u.avatar) : initialsAvatar(u.displayName || u.username || '?', u.id));
export const banUntilText = (b) => (b.until ? dayText(b.until) + ' tarihine kadar' : 'Kalıcı');

export function BanSheet({ uid, user, presetNote, onClose, onDone }) {
  const app = useApp();
  const name = (user && user.username) || app.nameOf(uid);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState(presetNote && BAN_REASONS.indexOf(presetNote) < 0 ? presetNote : '');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (presetNote && BAN_REASONS.indexOf(presetNote) >= 0) setReason(presetNote); }, []);
  const submit = async () => {
    setBusy(true);
    const r = [reason, note.trim()].filter(Boolean).join(': ').slice(0, 300);
    const d = await app.admin.ban(uid, r || null, days || null);
    setBusy(false);
    if (d) { if (onDone) onDone(); onClose(); }
  };
  return (
    <Sheet onClose={onClose} title="Kullanıcıyı banla" z={66}>
      <div className="g sheet-body ban-sheet">
        <div className="ban-who">
          <Avatar uid={uid} src={user ? userAvatar(user) : undefined} size={44} />
          <div className="grow"><b>@{name}</b><span>{(user && user.displayName) || (app.profiles[uid] && app.profiles[uid].displayName) || ''}</span></div>
        </div>
        <div className="set-head">Neden</div>
        <div className="chips-sel">
          {BAN_REASONS.map((r) => <button key={r} className={'chip' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}
        </div>
        <div className="field"><label htmlFor="ban-note">Açıklama (isteğe bağlı, kişi de görür)</label>
          <input id="ban-note" value={note} maxLength={200} placeholder="Örn. 3 kez uyarıldı" onChange={(e) => setNote(e.target.value)} /></div>
        <div className="set-head">Süre</div>
        <div className="chips-sel">
          {BAN_DAYS.map(([d, l]) => <button key={d} className={'chip' + (days === d ? ' on' : '')} aria-pressed={days === d} onClick={() => setDays(d)}>{l}</button>)}
        </div>
        <p className="adm-note">Banlanan kişi uygulamayı kullanamaz: paylaşım yapamaz, mesaj atamaz, beğenemez, yorum yazamaz. Profili ve paylaşımları herkesten gizlenir. Nedeni ve süreyi görür, bir kez itiraz edebilir. Banı istediğin an kaldırabilirsin.</p>
        <div style={{ paddingBlock: '6px 16px' }}>
          <button className="btn block big ban-btn" id="ban-submit" disabled={busy} onClick={submit}>{busy ? 'Banlanıyor…' : days ? days + ' gün banla' : 'Kalıcı olarak banla'}</button>
        </div>
      </div>
    </Sheet>
  );
}

function UserRow({ u, onBan, onUnban, onReject }) {
  const app = useApp();
  const b = u.ban;
  return (
    <div className={'adm-card user-card' + (b ? ' is-banned' : '')} data-user={u.username}>
      <div className="row-card-in">
        <Avatar uid={u.id} src={userAvatar(u)} size={44} />
        <div className="grow" onClick={() => app.openUser(u.id)}>
          <b>{u.username}{u.verified ? <Verified /> : null}</b>
          <span>{u.displayName ? u.displayName + ' · ' : ''}{fmt(u.posts)} gönderi · {fmt(u.followers)} takipçi{u.reports ? ' · ' + u.reports + ' şikayet' : ''}</span>
        </div>
        {u.admin ? <span className="pill">Yönetici</span>
          : b ? <button className="btn" onClick={() => onUnban(u)}>Banı kaldır</button>
          : <button className="btn danger-btn" onClick={() => onBan(u)}>Banla</button>}
      </div>
      {b ? (
        <div className="ban-info">
          <div><span className="pill warn">{b.until ? 'Geçici ban' : 'Kalıcı ban'}</span><span className="when">{banUntilText(b)}</span></div>
          <div className="reason">{b.reason || 'Neden belirtilmedi'} · {ago(b.at)}</div>
          {b.appealAt ? (
            <div className={'ban-appeal' + (b.appealRejected ? ' off' : '')}>
              <b>{b.appealRejected ? 'İtiraz reddedildi' : 'İtiraz'} · {ago(b.appealAt)}</b>
              <p>{b.appeal}</p>
              {!b.appealRejected ? (
                <div className="adm-actions">
                  <button className="btn grad" onClick={() => onUnban(u)}>Kabul et, banı kaldır</button>
                  <button className="btn" onClick={() => onReject(u)}>Reddet</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UsersTab({ onChange }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [banFor, setBanFor] = useState(null);
  const seq = useRef(0);
  const load = async (query) => {
    const n = ++seq.current;
    const d = await app.admin.users(query);
    if (n === seq.current && d && d !== true) setData(d);
  };
  useEffect(() => { const t = setTimeout(() => load(q.trim()), q.trim() ? 280 : 0); return () => clearTimeout(t); }, [q]);
  const reload = () => { load(q.trim()); onChange(); };
  const unban = async (u) => { if (await app.admin.unban(u.id)) reload(); };
  const reject = async (u) => { if (await app.admin.rejectAppeal(u.id)) reload(); };
  const rows = (list) => list.map((u) => <UserRow key={u.id} u={u} onBan={setBanFor} onUnban={unban} onReject={reject} />);
  return (
    <Fragment>
      <div className="adm-search"><Icon n="search" size={18} /><input id="adm-user-q" placeholder="Kullanıcı adı ya da isim ara" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" autoCorrect="off" /></div>
      {!data ? <div className="center-pad"><Spinner /></div> : (
        <Fragment>
          {!q.trim() ? (
            <Fragment>
              <div className="set-head">Banlı hesaplar{data.banned.length ? ' · ' + data.banned.length : ''}</div>
              {data.banned.length ? rows(data.banned) : <div className="adm-empty">Banlı hesap yok.</div>}
              <div className="set-head">Yeni katılanlar</div>
            </Fragment>
          ) : <div className="set-head">Sonuçlar</div>}
          {data.users.length ? rows(q.trim() ? data.users : data.users.filter((u) => !u.ban)) : <div className="adm-empty">Kullanıcı bulunamadı.</div>}
        </Fragment>
      )}
      {banFor ? <BanSheet uid={banFor.id} user={banFor} onClose={() => setBanFor(null)} onDone={reload} /> : null}
    </Fragment>
  );
}

function VerifiedTab() {
  const app = useApp();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^@/, '');
    return Object.keys(app.profiles).filter((uid) => {
      const p = app.profiles[uid];
      if (!t) return p.verified;
      return (p.username || '').indexOf(t) >= 0 || (p.displayName || '').toLocaleLowerCase('tr').indexOf(t) >= 0;
    }).slice(0, 40);
  }, [q, app.profiles]);
  return (
    <Fragment>
      <div className="adm-search"><Icon n="search" size={18} /><input id="adm-q" placeholder="Kullanıcı ara" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" /></div>
      {!q.trim() ? <div className="set-head">Mavi tikli hesaplar</div> : null}
      {list.length ? list.map((uid) => {
        const p = app.profiles[uid];
        return (
          <div className="adm-card row-card" key={uid}>
            <Avatar uid={uid} size={40} />
            <div className="grow" onClick={() => app.openUser(uid)}><b>{p.username}{p.verified ? <Verified /> : null}</b><span>{p.displayName}</span></div>
            <button className={'btn' + (p.verified ? '' : ' grad')} onClick={() => app.admin.verify(uid, !p.verified)}>{p.verified ? 'Kaldır' : 'Mavi tik ver'}</button>
          </div>
        );
      }) : <div className="adm-empty">{q.trim() ? 'Kullanıcı bulunamadı.' : 'Henüz mavi tikli hesap yok. Yukarıdan ara.'}</div>}
    </Fragment>
  );
}

export function AdminScreen() {
  const app = useApp();
  const [tab, setTab] = useState('genel');
  const [data, setData] = useState(null);
  const load = async () => { const d = await app.admin.overview(); if (d && d !== true) setData(d); };
  useEffect(() => { load(); }, []);
  if (!app.isAdmin) return (<Fragment><TopBar back title="Yönetici paneli" line /><Empty icon="lock" title="Yetkin yok" text="Bu sayfa sadece yöneticiler içindir." /></Fragment>);
  return (
    <Fragment>
      <TopBar back title="Yönetici paneli" line />
      <div className="adm-tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}{k === 'sikayet' && data && data.openReports ? <span className="dot">{data.openReports}</span> : null}
            {k === 'kisi' && data && data.appeals ? <span className="dot">{data.appeals}</span> : null}
          </button>
        ))}
      </div>
      <div className="body g adm">
        {tab === 'genel' ? <Overview data={data} /> : null}
        {tab === 'kisi' ? <UsersTab onChange={load} /> : null}
        {tab === 'algoritma' ? <Algorithm /> : null}
        {tab === 'sikayet' ? <Reports onChange={load} /> : null}
        {tab === 'one' ? <Boosted data={data} reload={load} /> : null}
        {tab === 'muzik' ? <AdminMusic /> : null}
        {tab === 'tik' ? <VerifiedTab /> : null}
      </div>
    </Fragment>
  );
}
