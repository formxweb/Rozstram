import { Fragment, useEffect, useRef, useState } from 'react';
import { errText, functionError } from './backend.js';
import { USERNAME_RE, normPhone, slugify } from './lib.js';
import { Icon, Mark, Sheet, Spinner } from './ui.jsx';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const THIS_YEAR = new Date().getFullYear();
export const BIRTH_YEARS = Array.from({ length: 100 }, (_, i) => THIS_YEAR - i);

function PasswordInput({ id, value, onChange, placeholder, autoComplete, onEnter }) {
  const [show, setShow] = useState(false);
  return (
    <div className="auth-input pw">
      <input id={id} type={show ? 'text' : 'password'} value={value} placeholder={placeholder} autoComplete={autoComplete} maxLength={72}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }} />
      {value ? <button type="button" className="show" onClick={() => setShow((s) => !s)}>{show ? 'Gizle' : 'Göster'}</button> : null}
    </div>
  );
}

export function LegalSheet({ kind, onClose }) {
  return (
    <Sheet onClose={onClose} title={kind === 'privacy' ? 'Gizlilik İlkesi' : 'Kullanım Koşulları'} tall z={95}>
      <div className="g sheet-body legal">
        {kind === 'privacy' ? (
          <Fragment>
            <p><b>Topladığımız bilgiler.</b> Kaydolurken verdiğin ad, kullanıcı adı, e-posta adresi ya da telefon numarası; paylaştığın fotoğraf, video, hikaye, yorum ve mesajlar; takip ettiğin hesaplar ve beğenilerin.</p>
            <p><b>Kim görür?</b> Profilin, gönderilerin ve hikayelerin hesabın herkese açıksa tüm Rozstram kullanıcılarına, gizliyse sadece onayladığın takipçilere görünür. E-posta adresin ve telefon numaran kimseye gösterilmez.</p>
            <p><b>Mesajlar.</b> Mesajların sadece sohbetteki kişilere gösterilir ama uçtan uca şifreli değildir. Şifre, kart bilgisi gibi gizli bilgileri mesajla gönderme.</p>
            <p><b>Bilgilerin nerede?</b> Veriler Supabase altyapısında saklanır. Reklam için kullanılmaz, kimseye satılmaz.</p>
            <p><b>Silme.</b> Ayarlar → Hesap → Hesabı sil ile hesabını, gönderilerini, mesajlarını ve dosyalarını kalıcı olarak silebilirsin. Kullanıcı adın güvenlik için kilitli kalır ve başka biri tarafından alınamaz.</p>
          </Fragment>
        ) : (
          <Fragment>
            <p>Rozstram’ı kullanmak için en az 13 yaşında olmalısın.</p>
            <p>Başkası adına hesap açma, başkasını taklit etme. Kullanıcı adları bir kez alındığında bir daha başkasına verilmez.</p>
            <p>Yasa dışı, nefret söylemi içeren, taciz eden, şiddet veya çıplaklık içeren ya da başkasının telif hakkını ihlal eden içerik paylaşma. Bu tür içerikler ve hesaplar kaldırılabilir.</p>
            <p>Rahatsız eden hesapları engelleyebilir, sessize alabilir ve şikayet edebilirsin.</p>
            <p>Paylaştığın içeriğin sahibi sensin; Rozstram’da gösterilmesi için gereken izni vermiş olursun.</p>
          </Fragment>
        )}
      </div>
    </Sheet>
  );
}

export function AuthScreen({ sb, onSignedUp }) {
  const [mode, setMode] = useState('login');
  const [legal, setLegal] = useState(null);
  const [forgot, setForgot] = useState(false);
  return (
    <div className="auth">
      <div className="auth-card">
        {mode === 'login'
          ? <Login sb={sb} onForgot={() => setForgot(true)} />
          : <Signup sb={sb} onSignedUp={onSignedUp} onLegal={setLegal} onCancel={() => setMode('login')} />}
      </div>
      <div className="auth-switch">
        {mode === 'login'
          ? <Fragment>Hesabın yok mu? <button onClick={() => setMode('signup')}>Kaydol</button></Fragment>
          : <Fragment>Hesabın var mı? <button onClick={() => setMode('login')}>Giriş yap</button></Fragment>}
      </div>
      {legal ? <LegalSheet kind={legal} onClose={() => setLegal(null)} /> : null}
      {forgot ? (
        <Sheet onClose={() => setForgot(false)} title="Şifreni mi unuttun?" z={95}>
          <div className="g sheet-body legal">
            <p>E-postayla şifre sıfırlama yakında geliyor.</p>
            <p>Giriş yapmış olduğun bir cihazın varsa <b>Profil → ☰ → Hesap → Şifre</b> bölümünden şifreni hemen değiştirebilirsin.</p>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function Login({ sb, onForgot }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    if (!id.trim() || !pw || busy) return;
    setBusy(true); setErr('');
    try {
      const { data: email, error } = await sb.rpc('login_email', { identifier: id.trim() });
      if (error) { setErr(errText(error, 'Bağlanılamadı, tekrar dene.')); return; }
      if (!email) { setErr('Bu kullanıcı adı, e-posta ya da telefonla kayıtlı bir hesap bulunamadı.'); return; }
      const r = await sb.auth.signInWithPassword({ email, password: pw });
      if (r.error) setErr(/invalid/i.test(r.error.message || '') ? 'Şifre hatalı. Tekrar dene.' : errText(r.error, 'Giriş yapılamadı.'));
    } catch (e) {
      setErr(errText(e, 'Giriş yapılamadı.'));
    } finally { setBusy(false); }
  };
  return (
    <Fragment>
      <div className="auth-brand"><Mark size={58} /><span className="wordmark">rozstram</span></div>
      <div className="auth-input"><input id="login-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="Kullanıcı adı, e-posta veya telefon" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" /></div>
      <PasswordInput id="login-pw" value={pw} onChange={setPw} placeholder="Şifre" autoComplete="current-password" onEnter={go} />
      {err ? <div className="auth-err" role="alert">{err}</div> : null}
      <button className="btn grad block big" onClick={go} disabled={!id.trim() || !pw || busy}>{busy ? <Spinner size={18} /> : 'Giriş yap'}</button>
      <button className="auth-link" onClick={onForgot}>Şifreni mi unuttun?</button>
    </Fragment>
  );
}

function Signup({ sb, onSignedUp, onLegal, onCancel }) {
  const [step, setStep] = useState('contact');
  const [via, setVia] = useState('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [username, setUsername] = useState('');
  const [avail, setAvail] = useState(null);
  const [birth, setBirth] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const checkSeq = useRef(0);

  const contactOk = via === 'phone' ? normPhone(phone).replace(/\D/g, '').length >= 10 : EMAIL_RE.test(email.trim());
  const nameOk = name.trim().length >= 1 && pw.length >= 8;
  const unameOk = USERNAME_RE.test(username) && avail === true;
  const age = birth ? THIS_YEAR - Number(birth) : null;
  const birthOk = age !== null && age >= 13;

  useEffect(() => {
    if (step !== 'username') return undefined;
    if (!USERNAME_RE.test(username)) { setAvail(null); return undefined; }
    setAvail('checking');
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      const { data, error } = await sb.rpc('username_available', { name: username });
      if (seq !== checkSeq.current) return;
      setAvail(error ? null : !!data);
    }, 350);
    return () => clearTimeout(t);
  }, [username, step]);

  const suggest = async () => {
    const baseName = slugify(name) || 'rozstram.kullanici';
    const tries = [baseName, baseName.replace(/\./g, '_'), baseName + '.' + (10 + Math.floor(Math.random() * 89)), baseName + Math.floor(100 + Math.random() * 899)];
    for (const t of tries) {
      if (!USERNAME_RE.test(t)) continue;
      const { data } = await sb.rpc('username_available', { name: t });
      if (data) return t;
    }
    return baseName.slice(0, 24) + Date.now().toString().slice(-4);
  };
  const next = async () => {
    setErr('');
    if (step === 'contact' && contactOk) setStep('name');
    else if (step === 'name' && nameOk) {
      if (!username) setUsername(await suggest());
      setStep('username');
    } else if (step === 'username' && unameOk) setStep('finish');
  };
  const back = () => {
    setErr('');
    if (step === 'name') setStep('contact');
    else if (step === 'username') setStep('name');
    else if (step === 'finish') setStep('username');
    else onCancel();
  };
  const submit = async () => {
    if (busy || !birthOk) return;
    setBusy(true); setErr('');
    try {
      const body = { username, full_name: name.trim(), password: pw, email: via === 'email' ? email.trim() : null, phone: via === 'phone' ? normPhone(phone) : null, birth_year: Number(birth) };
      const { data, error } = await sb.functions.invoke('signup', { body });
      if (error || !data || !data.ok) {
        const b = await functionError(error, data);
        const code = b && b.error;
        setErr(errText({ message: code }, 'Kayıt tamamlanamadı. Tekrar dene.'));
        if (code === 'username_taken' || code === 'username_invalid') { setAvail(false); setStep('username'); }
        else if (code === 'email_taken' || code === 'phone_taken' || code === 'email_invalid' || code === 'phone_invalid') setStep('contact');
        else if (code === 'password_short' || code === 'password_long') setStep('name');
        return;
      }
      if (data.user_id) onSignedUp(data.user_id);
      const r = await sb.auth.signInWithPassword({ email: data.login_email, password: pw });
      if (r.error) setErr('Hesabın açıldı ama giriş yapılamadı. Giriş ekranından dene.');
    } catch (e) {
      setErr(errText(e, 'Kayıt tamamlanamadı.'));
    } finally { setBusy(false); }
  };

  const steps = ['contact', 'name', 'username', 'finish'];
  const idx = steps.indexOf(step);
  return (
    <Fragment>
      <div className="auth-top">
        <button className="icon-btn" onClick={back} aria-label="Geri"><Icon n="back" size={26} /></button>
        <div className="auth-steps">{steps.map((s, i) => <i key={s} className={i <= idx ? 'on' : ''} />)}</div>
        <span style={{ width: 40 }} />
      </div>
      {step === 'contact' ? (
        <Fragment>
          <h2 className="auth-h">{via === 'phone' ? 'Telefon numaran nedir?' : 'E-posta adresin nedir?'}</h2>
          <p className="auth-p">Bu bilgi kimseye gösterilmez. Giriş yaparken de kullanabilirsin.</p>
          <div className="seg" role="tablist" style={{ marginBottom: 14 }}>
            <button role="tab" aria-selected={via === 'phone'} className={via === 'phone' ? 'on' : ''} onClick={() => setVia('phone')}>Telefon</button>
            <button role="tab" aria-selected={via === 'email'} className={via === 'email' ? 'on' : ''} onClick={() => setVia('email')}>E-posta</button>
          </div>
          {via === 'phone' ? (
            <div className="auth-input phone"><span className="cc">TR +90</span>
              <input id="su-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5XX XXX XX XX" autoComplete="tel" onKeyDown={(e) => { if (e.key === 'Enter') next(); }} /></div>
          ) : (
            <div className="auth-input"><input id="su-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@mail.com" autoComplete="email" autoCapitalize="none" onKeyDown={(e) => { if (e.key === 'Enter') next(); }} /></div>
          )}
          {via === 'phone' ? <p className="auth-note">Numaran doğrulama kodu olmadan kaydedilir; SMS gönderilmez.</p> : null}
          {err ? <div className="auth-err" role="alert">{err}</div> : null}
          <button className="btn grad block big" onClick={next} disabled={!contactOk}>İleri</button>
        </Fragment>
      ) : null}
      {step === 'name' ? (
        <Fragment>
          <h2 className="auth-h">Adın ve şifren</h2>
          <p className="auth-p">Adın profilinde görünür. Şifren en az 8 karakter olmalı.</p>
          <div className="auth-input"><input id="su-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ad Soyad" autoComplete="name" /></div>
          <PasswordInput id="su-pw" value={pw} onChange={setPw} placeholder="Şifre (en az 8 karakter)" autoComplete="new-password" onEnter={next} />
          {pw && pw.length < 8 ? <p className="auth-note">{8 - pw.length} karakter daha</p> : null}
          {err ? <div className="auth-err" role="alert">{err}</div> : null}
          <button className="btn grad block big" onClick={next} disabled={!nameOk}>İleri</button>
        </Fragment>
      ) : null}
      {step === 'username' ? (
        <Fragment>
          <h2 className="auth-h">Kullanıcı adını oluştur</h2>
          <p className="auth-p">İstediğin zaman değiştirebilirsin. <b>Bir kez alınan ad bir daha kimseye verilmez.</b></p>
          <div className={'auth-input uname' + (avail === false ? ' bad' : avail === true ? ' good' : '')}>
            <span className="at">@</span>
            <input id="su-user" value={username} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck="false"
              onChange={(e) => { setUsername(slugify(e.target.value)); setErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') next(); }} />
            <span className="st">{avail === 'checking' ? <Spinner size={16} /> : avail === true ? <Icon n="checkCircle" size={22} /> : avail === false ? <Icon n="close" size={20} /> : null}</span>
          </div>
          <p className="auth-note">{!USERNAME_RE.test(username) ? '3-30 karakter: küçük harf, rakam, nokta, alt çizgi. En az bir harf.' : avail === false ? 'Bu kullanıcı adı alınmış.' : avail === true ? '@' + username + ' kullanılabilir.' : ' '}</p>
          {err ? <div className="auth-err" role="alert">{err}</div> : null}
          <button className="btn grad block big" onClick={next} disabled={!unameOk}>İleri</button>
        </Fragment>
      ) : null}
      {step === 'finish' ? (
        <Fragment>
          <h2 className="auth-h">Neredeyse bitti</h2>
          <div className="auth-summary">
            <div><span>Kullanıcı adı</span><b>@{username}</b></div>
            <div><span>Ad</span><b>{name.trim()}</b></div>
            <div><span>{via === 'phone' ? 'Telefon' : 'E-posta'}</span><b>{via === 'phone' ? normPhone(phone) : email.trim()}</b></div>
          </div>
          <div className="auth-birth">
            <label htmlFor="su-birth">Doğum yılın</label>
            <select id="su-birth" value={birth} onChange={(e) => { setBirth(e.target.value); setErr(''); }}>
              <option value="">Seç</option>
              {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <p className="auth-note">{age !== null && age < 13 ? 'Rozstram’ı kullanmak için en az 13 yaşında olmalısın.'
              : age !== null && age < 18 ? '18 yaşından küçük olduğun için hesabın gizli başlar, hassas içerik kapalı olur ve seni sadece takip ettiğin kişiler mesajla bulabilir.'
              : 'Profilinde görünmez. Yaşına uygun bir Rozstram için kullanılır.'}</p>
          </div>
          <p className="auth-p small">Kaydolarak <button className="inline-link" onClick={() => onLegal('terms')}>Kullanım Koşulları</button>’nı ve <button className="inline-link" onClick={() => onLegal('privacy')}>Gizlilik İlkesi</button>’ni kabul etmiş olursun.</p>
          {err ? <div className="auth-err" role="alert">{err}</div> : null}
          <button className="btn grad block big" onClick={submit} disabled={!birthOk || busy}>{busy ? <Spinner size={18} /> : 'Kaydol'}</button>
        </Fragment>
      ) : null}
    </Fragment>
  );
}
