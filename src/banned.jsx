// Banlanan hesabın gördüğü ekran: neden, süre, itiraz ve çıkış.
import { useState } from 'react';
import { errText } from './backend.js';
import { Icon, Mark } from './ui.jsx';

const dateText = (ms) => new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function BannedScreen({ ban, username, sb, onLogout, onCheck }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const temp = !!ban.until;
  const send = async () => {
    const v = text.trim();
    if (v.length < 3) { setErr('Ne olduğunu birkaç kelimeyle anlat.'); return; }
    setBusy(true); setErr('');
    const { error } = await sb.rpc('ban_appeal', { p_text: v });
    setBusy(false);
    if (error) { setErr(errText(error, 'İtiraz gönderilemedi, tekrar dene.')); return; }
    setText('');
    onCheck();
  };
  return (
    <div className="banned" role="main">
      <div className="banned-card">
        <Mark size={40} />
        <div className="banned-icon"><Icon n="shield" size={34} stroke={2} /></div>
        <h1>{temp ? 'Hesabın geçici olarak askıya alındı' : 'Hesabın askıya alındı'}</h1>
        <p className="banned-text">
          {username ? <b>@{username}</b> : 'Bu hesap'}{', Rozstram kurallarına uymadığı için '}
          {temp ? <b>{dateText(ban.until)}</b> : null}{temp ? ' tarihine kadar kullanıma kapatıldı.' : 'kullanıma kapatıldı.'}
          {' Bu sürede paylaşım yapamaz, mesaj gönderemez, profilin de başkalarına görünmez.'}
        </p>
        <div className="banned-box">
          <div><span>Neden</span><b id="ban-reason-text">{ban.reason || 'Topluluk kurallarının ihlali'}</b></div>
          <div><span>Karar tarihi</span><b>{dateText(ban.at)}</b></div>
          <div><span>Süre</span><b>{temp ? dateText(ban.until) + ' tarihine kadar' : 'Kalıcı'}</b></div>
        </div>
        {ban.appealAt ? (
          <div className={'banned-appeal done' + (ban.appealRejected ? ' rejected' : '')} id="ban-appeal-status">
            <Icon n={ban.appealRejected ? 'info' : 'checkCircle'} size={20} />
            <span>{ban.appealRejected
              ? 'İtirazın incelendi ve karar değişmedi.'
              : 'İtirazın alındı. Yöneticiler inceleyince sonucu burada göreceksin.'}</span>
          </div>
        ) : (
          <div className="banned-appeal">
            <label htmlFor="ban-appeal">Bunun bir hata olduğunu düşünüyorsan itiraz et</label>
            <textarea id="ban-appeal" rows={3} maxLength={1000} value={text} placeholder="Ne olduğunu kısaca anlat…" onChange={(e) => setText(e.target.value)} />
            {err ? <div className="banned-err" role="alert">{err}</div> : null}
            <button className="btn grad block big" id="ban-appeal-send" onClick={send} disabled={busy}>{busy ? 'Gönderiliyor…' : 'İtiraz et'}</button>
          </div>
        )}
        <div className="banned-actions">
          <button className="btn block" onClick={onCheck}><Icon n="history" size={18} />Durumu yenile</button>
          <button className="btn block" onClick={onLogout}><Icon n="logout" size={18} />Çıkış yap</button>
        </div>
      </div>
    </div>
  );
}
