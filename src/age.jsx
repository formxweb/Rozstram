// Doğum yılı olmayan (eski) hesaplara bir kez sorulur. Yaşa uygun deneyim (genç hesap) bunun üzerine kurulur.
import { useState } from 'react';
import { errCodeOf, errText } from './backend.js';
import { BIRTH_YEARS, THIS_YEAR } from './auth.jsx';
import { Icon, Mark } from './ui.jsx';

export function BirthYearScreen({ sb, username, onDone, onLogout }) {
  const [birth, setBirth] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const age = birth ? THIS_YEAR - Number(birth) : null;
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
          {age !== null && age < 13 ? <div className="banned-err" role="alert">Rozstram’ı kullanmak için en az 13 yaşında olmalısın.</div> : null}
          {age !== null && age >= 13 && age < 18 ? <p className="age-note">18 yaşından küçük olduğun için hesabın gizli olur, hassas içerik kapalı kalır ve sana sadece takip ettiğin kişiler yeni mesaj başlatabilir.</p> : null}
          {err ? <div className="banned-err" role="alert">{err}</div> : null}
          <button className="btn grad block big" id="birth-save" onClick={save} disabled={!birth || busy || (age !== null && age < 13)}>{busy ? 'Kaydediliyor…' : 'Devam et'}</button>
        </div>
        <div className="banned-actions single">
          <button className="btn block" onClick={onLogout}><Icon n="logout" size={18} />Çıkış yap</button>
        </div>
      </div>
    </div>
  );
}
