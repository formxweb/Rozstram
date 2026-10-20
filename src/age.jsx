// Doğum yılı olmayan (eski) hesaplara bir kez sorulur. Yaşa uygun deneyim (genç hesap) bunun üzerine kurulur.
import { useState } from 'react';
import { errCodeOf, errText } from './backend.js';
import { BIRTH_YEARS, THIS_YEAR, underageNote, underageYear } from './auth.jsx';
import { Icon, Mark } from './ui.jsx';

export function BirthYearScreen({ sb, username, onDone, onLogout }) {
  const [birth, setBirth] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const age = birth ? THIS_YEAR - Number(birth) : null;
  const young = age !== null && underageYear(birth);
  const save = async () => {
    if (!birth || busy) return;
    setBusy(true); setErr('');
    const { data, error } = await sb.rpc('set_birth_year', { y: Number(birth) });
    setBusy(false);
    if (error) {
      setErr(errText(error, 'Kaydedilemedi, tekrar dene.'));
      if (errCodeOf(error) === 'birth_year_set') onDone(null);
      return;
    }
    onDone(data);
  };
  return (
    <div className="banned" role="main">
      <div className="banned-card">
        <Mark size={40} />
        <div className="banned-icon age-icon"><Icon n="sparkle" size={32} stroke={2} /></div>
        <h1>Doğum yılını ekle</h1>
        <p className="banned-text">
          {username ? <b>@{username}</b> : 'Hesabın'}{username ? ', ' : ' '}Rozstram’ı yaşına uygun ve güvenli hale getirmek için doğum yılını soruyoruz.
          {' '}Profilinde görünmez ve bir kez girilir.
        </p>
        <div className="banned-appeal">
          <label htmlFor="birth-year">Doğum yılın</label>
          <select id="birth-year" className="age-select" value={birth} onChange={(e) => { setBirth(e.target.value); setErr(''); }}>
            <option value="">Seç</option>
            {BIRTH_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {young ? <div className="banned-err" role="alert">{underageNote(birth)} Bu doğum yılıyla devam edersen hesabın kapanır ve doğum yılın sonradan değiştirilemez.</div> : null}
          {age !== null && !young && age < 18 ? <p className="age-note">18 yaşından küçük olduğun için hesabın gizli olur, takip listelerin başkalarına görünmez, hassas içerik kapalı kalır ve sana sadece takip ettiğin kişiler yeni mesaj başlatabilir.</p> : null}
          {err ? <div className="banned-err" role="alert">{err}</div> : null}
          <button className="btn grad block big" id="birth-save" onClick={save} disabled={!birth || busy}>{busy ? 'Kaydediliyor…' : 'Devam et'}</button>
        </div>
        <div className="banned-actions single">
          <button className="btn block" onClick={onLogout}><Icon n="logout" size={18} />Çıkış yap</button>
        </div>
      </div>
    </div>
  );
}

// 15 yaşını doldurmamış (eski) hesap: 7578 sayılı Kanun gereği kullanıma kapalı. Profil ve içerik kimseye görünmez.
// Kural doğum yılına göre olduğu için hesap, 16 yaşına girilen yılın başında kendiliğinden yeniden açılır.
export function UnderageScreen({ username, birthYear, onDelete, onLogout }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const opens = birthYear ? Number(birthYear) + 16 : null;
  const del = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onDelete();
    if (!ok) setBusy(false);
  };
  return (
    <div className="banned" role="main">
      <div className="banned-card">
        <Mark size={40} />
        <div className="banned-icon age-icon"><Icon n="shield" size={32} stroke={2} /></div>
        <h1>Hesabın şimdilik kapalı</h1>
        <p className="banned-text">
          {username ? <b>@{username}</b> : 'Bu hesap'}{', '}7578 sayılı Kanun gereği 15 yaşını doldurmamış kişilere sosyal ağ hizmeti verilemediği için kullanıma kapatıldı.
          {' '}Profilin ve paylaşımların kimseye görünmez, yeni bir şey paylaşamaz ve mesaj gönderemezsin.
        </p>
        <div className="banned-box">
          <div><span>Doğum yılı</span><b>{birthYear || '—'}</b></div>
          <div><span>Hesabın açılacağı tarih</span><b id="underage-opens">{opens ? '1 Ocak ' + opens : '—'}</b></div>
        </div>
        <p className="age-note">O tarihte hesabın kendiliğinden geri açılır. İstersen hesabını ve tüm içeriğini şimdi kalıcı olarak silebilirsin.</p>
        {ask ? (
          <div className="banned-appeal">
            <div className="banned-err" role="alert">Hesabın, gönderilerin, mesajların ve dosyaların kalıcı olarak silinecek. Bu geri alınamaz.</div>
            <button className="btn danger-solid block big" id="underage-delete-yes" onClick={del} disabled={busy}>{busy ? 'Siliniyor…' : 'Evet, hesabımı sil'}</button>
            <button className="btn block" onClick={() => setAsk(false)} disabled={busy}>Vazgeç</button>
          </div>
        ) : null}
        <div className="banned-actions">
          {ask ? null : <button className="btn block" id="underage-delete" onClick={() => setAsk(true)}><Icon n="trash" size={18} />Hesabımı sil</button>}
          <button className="btn block" onClick={onLogout}><Icon n="logout" size={18} />Çıkış yap</button>
        </div>
      </div>
    </div>
  );
}
