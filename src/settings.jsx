import { Fragment, useEffect, useRef, useState } from 'react';
import { useApp, useBack } from './ctx.js';
import { normPhone, shareLink } from './lib.js';
import { Avatar, Empty, FollowButton, Icon, Mark, PersonRow, Sheet, Spinner, Toggle, TopBar } from './ui.jsx';
import { LegalSheet } from './auth.jsx';

/* uygulamayı ana ekrana ekleme isteği (Android / masaüstü Chrome) */
let installEvent = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });
}
const isStandalone = () => (typeof window !== 'undefined') && (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');

export function InstallHint({ compact }) {
  const [open, setOpen] = useState(false);
  if (isStandalone()) return null;
  const go = async () => {
    if (installEvent) { installEvent.prompt(); try { await installEvent.userChoice; } catch (e) { /* yok say */ } installEvent = null; return; }
    setOpen(true);
  };
  return (
    <Fragment>
      {compact ? <button className="btn block big" onClick={go}><Icon n="phone" size={18} />Ana ekrana ekle</button> : (
        <button className="set-row" onClick={go}><Icon n="phone" size={24} /><span className="grow"><span>Ana ekrana ekle</span><span className="sub">Rozstram telefonunda uygulama gibi açılsın</span></span><Icon n="chevRight" size={18} /></button>
      )}
      {open ? (
        <Sheet onClose={() => setOpen(false)} title="Ana ekrana ekle" z={96}>
          <div className="g sheet-body legal">
            {isIOS() ? (
              <Fragment>
                <p>1. Safari’nin altındaki <b>Paylaş</b> düğmesine dokun (kare ve yukarı ok).</p>
                <p>2. Listeyi kaydırıp <b>Ana Ekrana Ekle</b>’yi seç.</p>
                <p>3. Sağ üstten <b>Ekle</b>’ye dokun. Rozstram simgesi ana ekranında belirir.</p>
              </Fragment>
            ) : (
              <Fragment>
                <p>1. Tarayıcının sağ üstündeki <b>⋮</b> menüsünü aç.</p>
                <p>2. <b>Ana ekrana ekle</b> ya da <b>Uygulamayı yükle</b>’yi seç.</p>
                <p>3. Onayla. Rozstram simgesi ana ekranında belirir.</p>
              </Fragment>
            )}
          </div>
        </Sheet>
      ) : null}
    </Fragment>
  );
}

function Row({ icon, label, sub, onClick, right, danger }) {
  return (
    <button className={'set-row' + (danger ? ' danger' : '')} onClick={onClick} disabled={!onClick && !right}>
      <Icon n={icon} size={24} /><span className="grow"><span>{label}</span>{sub ? <span className="sub">{sub}</span> : null}</span>{right || (onClick ? <Icon n="chevRight" size={18} /> : null)}
    </button>
  );
}

/* ================================================================ ayarlar */
export function SettingsScreen() {
  const app = useApp();
  const [legal, setLegal] = useState(null);
  const p = app.myProfile || {};
  const hiddenCount = Object.keys(app.hidden || {}).length;
  const count = (m) => Object.keys(m || {}).length;
  return (
    <Fragment>
      <TopBar back title="Ayarlar ve etkinlik" line />
      <div className="body g">
        <div className="set-head">Hesabın</div>
        <Row icon="user" label="Hesap" sub="Kişisel bilgiler, şifre, hesabı silme" onClick={() => app.push({ type: 'account' })} />
        {app.incoming.length ? <Row icon="userPlus" label="Takip istekleri" sub={app.incoming.length + ' kişi bekliyor'} onClick={() => app.push({ type: 'requests' })} /> : null}

        {app.isAdmin ? <Fragment><div className="set-head">Yönetim</div><Row icon="shield" label="Yönetici paneli" sub="Algoritma, öne çıkarma, şikayetler, mavi tik" onClick={() => app.push({ type: 'admin' })} /></Fragment> : null}

        <div className="set-head">Senin etkinliğin</div>
        <Row icon="bookmark" label="Kaydedilenler" sub={count(app.saved) + ' gönderi'} onClick={() => app.push({ type: 'grid', kind: 'saved', title: 'Kaydedilenler' })} />
        <Row icon="heart" label="Beğendiklerin" onClick={() => app.push({ type: 'grid', kind: 'liked', title: 'Beğendiklerin' })} />
        <Row icon="history" label="Hikaye arşivi" sub="Tüm hikayelerin, öne çıkarmak için" onClick={() => app.push({ type: 'grid', kind: 'archive', title: 'Hikaye arşivi' })} />
        <Row icon="gallery" label="Gönderi arşivi" sub="Profilinden gizlediğin gönderiler" onClick={() => app.push({ type: 'grid', kind: 'postArchive', title: 'Gönderi arşivi' })} />
        <Row icon="activity" label="Bildirimler" onClick={() => app.push({ type: 'activity' })} />

        <div className="set-head">Kimler görebilir</div>
        <Row icon="lock" label="Gizli hesap" sub={p.private ? 'Sadece onayladığın takipçiler gönderilerini görür' : 'Herkes profilini ve gönderilerini görebilir'}
          right={<Toggle id="set-private" on={!!p.private} onChange={(v) => app.setPrivacy({ private: v })} label="Gizli hesap" />} />
        <Row icon="star" label="Yakın Arkadaşlar" sub={count(app.closeFriends) + ' kişi'} onClick={() => app.push({ type: 'plist', kind: 'close' })} />
        <Row icon="shield" label="Engellenenler" sub={count(app.blocks) + ' hesap'} onClick={() => app.push({ type: 'plist', kind: 'blocked' })} />
        <Row icon="volOff" label="Sessize alınanlar" sub={count(app.mutes) + ' hesap'} onClick={() => app.push({ type: 'plist', kind: 'muted' })} />
        <Row icon="clock" label="Etkinlik durumu" sub="Kapatırsan sen de başkalarının ne zaman aktif olduğunu göremezsin"
          right={<Toggle id="set-activity" on={p.showActivity !== false} onChange={(v) => app.setPrivacy({ showActivity: v })} label="Etkinlik durumu" />} />

        <div className="set-head">Uygulama</div>
        <div style={{ paddingBlock: 8 }}>
          <div className="seg" role="radiogroup" aria-label="Tema">
            {[['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']].map(([k, l]) => <button key={k} role="radio" aria-checked={app.theme === k} className={app.theme === k ? 'on' : ''} onClick={() => app.setTheme(k)}>{l}</button>)}
          </div>
        </div>
        <div style={{ paddingBlock: 8 }}>
          <div className="seg" role="radiogroup" aria-label="Akış">
            {[['following', 'Takip edilenler'], ['foryou', 'Senin için']].map(([k, l]) => <button key={k} role="radio" aria-checked={app.feedMode === k} className={app.feedMode === k ? 'on' : ''} onClick={() => app.setFeedMode(k)}>{l}</button>)}
          </div>
        </div>
        <Row icon="eyeOff" label="Gizlenen gönderiler" sub={hiddenCount ? hiddenCount + ' gönderi gizli' : 'Gizlediğin gönderi yok'} onClick={hiddenCount ? app.restoreHidden : undefined} right={hiddenCount ? <span className="text-btn">Geri getir</span> : <span />} />
        <InstallHint />
        <Row icon="share" label="Arkadaşlarını davet et" onClick={async () => { const r = await shareLink('Rozstram’a katıl', location.origin); if (r === 'copied') app.toast('Davet bağlantısı kopyalandı'); }} />

        <div className="set-head">Hakkında</div>
        <Row icon="shield" label="Gizlilik İlkesi" onClick={() => setLegal('privacy')} />
        <Row icon="info" label="Kullanım Koşulları" onClick={() => setLegal('terms')} />
        <div className="set-row" style={{ alignItems: 'flex-start' }}>
          <Mark size={24} /><span className="grow"><span>Rozstram 3.0</span><span className="sub">Mesajlar uçtan uca şifreli değildir. Şifre ya da kart bilgisi paylaşma.</span></span>
        </div>
        <div style={{ paddingBlock: '10px 24px' }}>
          <button className="btn block big danger-btn" onClick={() => app.confirm({ title: 'Çıkış yapılsın mı?', text: '@' + (p.username || '') + ' hesabından çıkış yapacaksın.', ok: 'Çıkış yap', danger: true, onOk: app.logout })}>Çıkış yap</button>
        </div>
      </div>
      {legal ? <LegalSheet kind={legal} onClose={() => setLegal(null)} /> : null}
    </Fragment>
  );
}

/* ================================================================ hesap */
export function AccountScreen() {
  const app = useApp();
  const acc = app.account || {};
  const [email, setEmail] = useState(acc.email || '');
  const [phone, setPhone] = useState(acc.phone || '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState('');
  const [del, setDel] = useState(false);
  const contactChanged = (email.trim().toLowerCase() || null) !== (acc.email || null) || (normPhone(phone) || null) !== (acc.phone || null);
  const saveContact = async () => {
    setBusy('c');
    await app.updateContact(email.trim() || null, phone.trim() ? normPhone(phone) : null);
    setBusy('');
  };
  const savePw = async () => {
    if (pw.length < 8) { app.toast('Şifre en az 8 karakter olmalı.'); return; }
    if (pw !== pw2) { app.toast('Şifreler aynı değil.'); return; }
    setBusy('p');
    const ok = await app.changePassword(pw);
    setBusy('');
    if (ok) { setPw(''); setPw2(''); }
  };
  return (
    <Fragment>
      <TopBar back title="Hesap" line />
      <div className="body g">
        <div className="set-head">Kullanıcı adı</div>
        <Row icon="user" label={'@' + ((app.myProfile && app.myProfile.username) || '')} sub="Değiştirmek için Profili düzenle’ye git. Eski adın sana ayrılır." onClick={() => app.push({ type: 'edit' })} />

        <div className="set-head">Kişisel bilgiler</div>
        <p className="sub" style={{ paddingBottom: 8 }}>Bu bilgiler kimseye gösterilmez. Giriş yaparken kullanabilirsin.</p>
        <div className="field"><label htmlFor="acc-email">E-posta</label><input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@mail.com" autoCapitalize="none" /></div>
        <div className="field"><label htmlFor="acc-phone">Telefon</label><input id="acc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XX XXX XX XX" /></div>
        <button className="btn primary block" disabled={!contactChanged || busy === 'c' || (!email.trim() && !phone.trim())} onClick={saveContact}>{busy === 'c' ? 'Kaydediliyor…' : 'Bilgileri kaydet'}</button>

        <div className="set-head">Şifre</div>
        <div className="field"><label htmlFor="acc-pw">Yeni şifre</label><input id="acc-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="En az 8 karakter" autoComplete="new-password" maxLength={72} /></div>
        <div className="field"><label htmlFor="acc-pw2">Yeni şifre (tekrar)</label><input id="acc-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" maxLength={72} /></div>
        <button className="btn primary block" disabled={!pw || !pw2 || busy === 'p'} onClick={savePw}>{busy === 'p' ? 'Değiştiriliyor…' : 'Şifreyi değiştir'}</button>

        <div className="set-head">Oturum</div>
        <Row icon="logout" label="Çıkış yap" onClick={() => app.confirm({ title: 'Çıkış yapılsın mı?', ok: 'Çıkış yap', danger: true, onOk: app.logout })} />
        <Row icon="trash" label="Hesabı sil" sub="Gönderilerin, mesajların ve dosyaların kalıcı olarak silinir" danger onClick={() => setDel(true)} />
      </div>
      {del ? <DeleteAccountSheet onClose={() => setDel(false)} /> : null}
    </Fragment>
  );
}

function DeleteAccountSheet({ onClose }) {
  const app = useApp();
  const name = (app.myProfile && app.myProfile.username) || '';
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (typed.trim().toLowerCase() !== name || busy) return;
    setBusy(true);
    const ok = await app.deleteAccount();
    setBusy(false);
    if (!ok) onClose();
  };
  return (
    <Sheet onClose={onClose} title="Hesabı kalıcı olarak sil" z={70}>
      <div className="g sheet-body" style={{ paddingBottom: 16 }}>
        <p className="legal">Profilin, gönderilerin, hikayelerin, yorumların, mesajların ve yüklediğin tüm dosyalar <b>kalıcı olarak silinir</b>. Bu işlem geri alınamaz.</p>
        <p className="legal">Güvenlik için <b>@{name}</b> kullanıcı adı kilitli kalır; sen dahil kimse bir daha alamaz.</p>
        <div className="field"><label htmlFor="del-name">Onaylamak için kullanıcı adını yaz</label><input id="del-name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoCapitalize="none" /></div>
        <button className="btn block big danger-solid" disabled={typed.trim().toLowerCase() !== name || busy} onClick={go}>{busy ? 'Siliniyor…' : 'Hesabımı sil'}</button>
      </div>
    </Sheet>
  );
}

/* ================================================================ kişi listeleri (engellenen, sessiz, yakın arkadaş) */
export function PeopleListScreen({ kind }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const match = (u) => app.profiles[u] && (!term || app.nameOf(u).indexOf(term) >= 0 || (app.profiles[u].displayName || '').toLowerCase().indexOf(term) >= 0);
  let title, list, right, empty;
  if (kind === 'blocked') {
    title = 'Engellenenler';
    list = Object.keys(app.blocks).filter(match);
    right = (u) => <button className="btn small" onClick={() => app.unblock(u)}>Engeli kaldır</button>;
    empty = 'Engellediğin kimse yok.';
  } else if (kind === 'muted') {
    title = 'Sessize alınanlar';
    list = Object.keys(app.mutes).filter(match);
    right = (u) => <button className="btn small" onClick={() => app.setMute(u, false)}>Sesini aç</button>;
    empty = 'Sessize aldığın kimse yok.';
  } else {
    title = 'Yakın Arkadaşlar';
    const inList = Object.keys(app.closeFriends).filter(match);
    const others = Array.from(app.following).filter((u) => !app.closeFriends[u] && match(u));
    list = inList.concat(others);
    right = (u) => (
      <button className={'check-ring' + (app.closeFriends[u] ? ' on cf' : '')} onClick={() => app.setCloseFriend(u, !app.closeFriends[u])} aria-label={app.closeFriends[u] ? 'Listeden çıkar' : 'Listeye ekle'}>
        {app.closeFriends[u] ? <Icon n="check" size={14} stroke={3} /> : null}
      </button>
    );
    empty = 'Takip ettiğin kişiler burada görünür. Önce birkaç kişiyi takip et.';
  }
  return (
    <Fragment>
      <TopBar back title={title} line />
      <div className="body g">
        {kind === 'close' ? <p className="sub" style={{ paddingTop: 10 }}>Hikaye paylaşırken “Yakın Arkadaşlar”ı seçersen sadece bu listedekiler görür. Listeye eklendiklerini öğrenmezler.</p> : null}
        <div style={{ paddingBlock: 10 }}><label className="search"><Icon n="search" size={17} /><input id="plist-q" type="search" placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
        {list.length ? list.map((u) => <PersonRow key={u} uid={u} right={right(u)} />) : <Empty title="Kimse yok" text={term ? 'Bu aramayla eşleşen kişi yok.' : empty} />}
      </div>
    </Fragment>
  );
}

/* ================================================================ takip istekleri */
export function RequestsScreen() {
  const app = useApp();
  return (
    <Fragment>
      <TopBar back title="Takip istekleri" line />
      <div className="body g">
        {app.incoming.length ? app.incoming.map((u) => (
          <PersonRow key={u} uid={u} right={(
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn small primary" onClick={() => app.acceptRequest(u)}>Onayla</button>
              <button className="btn small" onClick={() => app.declineRequest(u)}>Sil</button>
            </span>
          )} />
        )) : <Empty icon="userPlus" title="Bekleyen istek yok" text="Hesabın gizliyken biri seni takip etmek istediğinde burada görünür." />}
      </div>
    </Fragment>
  );
}

/* ================================================================ şikayet */
const REASONS = ['Spam', 'Çıplaklık veya cinsel içerik', 'Nefret söylemi veya semboller', 'Şiddet veya tehlikeli kişiler', 'Zorbalık veya taciz', 'Sahte hesap ya da taklit', 'Dolandırıcılık', 'Fikri mülkiyet ihlali', 'Başka bir şey'];
export function ReportSheet({ kind, target, onClose }) {
  const app = useApp();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const owner = kind === 'user' ? target : kind === 'post' ? (app.postById[target] || {}).author : kind === 'comment' ? (app.commentById[target] || {}).author : kind === 'story' ? (app.storyById[target] || {}).author : null;
  const send = async (r) => {
    if (busy) return;
    setBusy(true);
    const ok = await app.report(kind, target, r);
    setBusy(false);
    if (ok) setDone(true);
  };
  return (
    <Sheet onClose={onClose} title={done ? 'Teşekkürler' : 'Neden şikayet ediyorsun?'} z={85}>
      <div className="g sheet-body" style={{ paddingBottom: 16 }}>
        {done ? (
          <div style={{ display: 'grid', gap: 12, textAlign: 'center', paddingBlock: 8 }}>
            <span className="done-check" style={{ margin: '0 auto' }}><Icon n="check" size={30} stroke={2.6} /></span>
            <p className="legal">Şikayetin incelenecek. Kimin şikayet ettiği karşı tarafa söylenmez.</p>
            {owner && owner !== app.me.id && !app.blocks[owner] ? (
              <Fragment>
                <button className="btn block big" onClick={() => { onClose(); app.setMute(owner, true); }}>@{app.nameOf(owner)} sessize al</button>
                <button className="btn block big danger-btn" onClick={() => { onClose(); app.block(owner); }}>@{app.nameOf(owner)} engelle</button>
              </Fragment>
            ) : null}
          </div>
        ) : REASONS.map((r) => (
          <button key={r} className="menu-item" disabled={busy} onClick={() => send(r)}><span>{r}</span><Icon n="chevRight" size={16} /></button>
        ))}
      </div>
    </Sheet>
  );
}

/* ================================================================ ilk açılış (kayıttan sonra) */
export function Onboarding({ onDone }) {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const p = app.myProfile || {};
  const people = Object.keys(app.profiles).filter((u) => u !== app.me.id).sort((a, b) => (app.profiles[b].avatar ? 1 : 0) - (app.profiles[a].avatar ? 1 : 0)).slice(0, 30);
  const saveStep1 = async () => {
    if (!file && !bio.trim()) { setStep(1); return; }
    setBusy(true);
    const ok = await app.saveProfile({ username: p.username, displayName: p.displayName, bio: bio.trim(), category: p.category, website: p.website }, file, false);
    setBusy(false);
    if (ok) setStep(1);
  };
  return (
    <div className="onboard">
      <div className="onboard-in g">
        {step === 0 ? (
          <Fragment>
            <h2 className="auth-h" style={{ textAlign: 'center' }}>Hoş geldin, @{p.username}!</h2>
            <p className="auth-p" style={{ textAlign: 'center' }}>Arkadaşlarının seni tanıması için bir profil fotoğrafı ekle.</p>
            <button className="onboard-av" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Profil fotoğrafı seç">
              {preview ? <img src={preview} alt="" /> : <Avatar uid={app.me.id} size={128} />}
              <span className="plus"><Icon n="camera" size={18} /></span>
            </button>
            <input ref={fileRef} id="ob-file" type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } }} />
            <div className="field"><label htmlFor="ob-bio">Biyografi (isteğe bağlı)</label><textarea id="ob-bio" rows={2} maxLength={150} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Kendinden kısaca bahset" /></div>
            <button className="btn grad block big" onClick={saveStep1} disabled={busy}>{busy ? <Spinner size={18} /> : file || bio.trim() ? 'Kaydet ve devam et' : 'Şimdilik atla'}</button>
          </Fragment>
        ) : step === 1 ? (
          <Fragment>
            <h2 className="auth-h" style={{ textAlign: 'center' }}>Takip edeceğin kişileri bul</h2>
            <p className="auth-p" style={{ textAlign: 'center' }}>Takip ettiğin kişilerin paylaşımları ana sayfanda görünür.</p>
            <div className="onboard-list">
              {people.length ? people.map((u) => <PersonRow key={u} uid={u} right={<FollowButton uid={u} small />} />)
                : <Empty icon="users" title="Henüz kimse yok" text="Rozstram’ın ilk kullanıcılarındansın! Arkadaşlarını davet et." />}
            </div>
            <button className="btn block big" onClick={async () => { const r = await shareLink('Rozstram’a katıl', location.origin); if (r === 'copied') app.toast('Davet bağlantısı kopyalandı'); }}><Icon n="share" size={18} />Arkadaşlarını davet et</button>
            <button className="btn grad block big" onClick={() => setStep(2)}>İleri</button>
          </Fragment>
        ) : (
          <Fragment>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 12, paddingTop: 24 }}><Mark size={72} /></div>
            <h2 className="auth-h" style={{ textAlign: 'center' }}>Hazırsın!</h2>
            <p className="auth-p" style={{ textAlign: 'center' }}>Rozstram’ı ana ekranına ekle, telefonunda uygulama gibi tek dokunuşla açılsın.</p>
            <InstallHint compact />
            <button className="btn grad block big" onClick={onDone}>Rozstram’a başla</button>
          </Fragment>
        )}
      </div>
    </div>
  );
}
