// Yeni özellikler uçtan uca: doğum yılı/genç hesap, hassas içerik, Şipşak, uçtan uca şifreli sohbet, yıl özeti + en sevdiğin yıl.
// node test/features-e2e.js (test/restart.sh sonrası)
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const H = require('./helpers');
const { BASE, newUser, apiSignup, sql, top, text, gone, wait, nav, shot, ok } = H;
const CY = new Date().getFullYear();

const openSettings = async (P) => {
  await nav(P, 'Profil');
  await P.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
  await top(P).getByText('Ayarlar ve etkinlik').first().waitFor();
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  let code = 0;
  try {
    const t = Date.now().toString().slice(-5);
    const a = await apiSignup({ username: 'ayla' + t, full_name: 'Ayla', email: 'ay' + t + '@mail.com', password: 'aylaayla1' });
    const b = await apiSignup({ username: 'baris' + t, full_name: 'Barış', email: 'ba' + t + '@mail.com', password: 'barisbaris' });
    const k = await apiSignup({ username: 'genc' + t, full_name: 'Genç', email: 'ge' + t + '@mail.com', password: 'gencgenc1', birth_year: CY - 15 });
    const o = await apiSignup({ username: 'eski' + t, full_name: 'Eski Üye', email: 'es' + t + '@mail.com', password: 'eskieski1', birth_year: null });
    const A_ = 'ayla' + t, B_ = 'baris' + t;
    await sql(`insert into public.follows (follower, following, status) values
      ('${a.user.id}', '${b.user.id}', 'accepted'), ('${b.user.id}', '${a.user.id}', 'accepted'), ('${k.user.id}', '${a.user.id}', 'accepted')`);
    await sql(`insert into public.posts (author, media, caption, sensitive) values ('${a.user.id}', '[{"id":"x/p/s.jpg","type":"image","aspect":1}]', 'Hassas test ${t} #yaz', true)`);
    await sql(`insert into public.posts (author, media, caption) values ('${a.user.id}', '[{"id":"x/p/n.jpg","type":"image","aspect":1}]', 'Normal test ${t} #yaz')`);

    /* ------------------------------------------------ kayıt: doğum yılı */
    const S = await newUser(browser, 'kayit');
    await S.goto(BASE + '/');
    await S.getByRole('button', { name: 'Kaydol' }).click();
    await S.getByRole('tab', { name: 'E-posta' }).click();
    await S.fill('#su-email', 'kid' + t + '@mail.com');
    await S.getByRole('button', { name: 'İleri' }).click();
    await S.fill('#su-name', 'Minik');
    await S.fill('#su-pw', 'minikminik');
    await S.getByRole('button', { name: 'İleri' }).click();
    await S.fill('#su-user', 'minik' + t);
    await S.waitForSelector('.auth-input.uname.good');
    await S.getByRole('button', { name: 'İleri' }).click();
    await S.selectOption('#su-birth', String(CY - 10));
    await text(S, 'en az 13 yaşında olmalısın');
    if (!(await S.getByRole('button', { name: 'Kaydol' }).isDisabled())) throw new Error('13 yaş altı kaydol açık');
    ok('13 yaş altı kayıt olamıyor');
    await S.selectOption('#su-birth', String(CY - 14));
    await text(S, 'hesabın gizli başlar');
    await shot(S, 'kayit-dogum-yili');
    await S.getByRole('button', { name: 'Kaydol' }).click();
    await text(S, 'Hoş geldin, @minik' + t, 15000);
    const kid = await sql(`select p.is_private::text || ':' || a.birth_year from public.profiles p join public.accounts a on a.user_id = p.id where p.username = 'minik${t}'`);
    if (kid !== 'true:' + (CY - 14)) throw new Error('genç hesap yanlış: ' + kid);
    if ((await S.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'fun') throw new Error('gençte Renkli tema yok');
    await S.getByRole('button', { name: 'Şimdilik atla' }).click();
    await S.getByRole('button', { name: 'İleri' }).click();
    await S.getByRole('button', { name: 'Rozstram’a başla' }).click();
    await shot(S, 'genc-renkli-tema');
    ok('14 yaşında kayıt: hesap gizli, doğum yılı kayıtlı, Renkli tema açık');

    /* ------------------------------------------------ eski hesap: doğum yılı sorulur */
    const O = await newUser(browser, 'eski', o);
    await O.goto(BASE + '/');
    await text(O, 'Doğum yılını ekle');
    await shot(O, 'dogum-yili-sor');
    await O.selectOption('#birth-year', '1988');
    await O.locator('#birth-save').click();
    await O.waitForSelector('nav', { timeout: 10000 });
    ok('doğum yılı olmayan eski hesaba bir kez soruldu');

    /* ------------------------------------------------ hassas içerik */
    const B = await newUser(browser, 'baris', b);
    await B.addInitScript(() => localStorage.setItem('roz:feedMode', JSON.stringify('foryou')));
    await B.goto(BASE + '/');
    const sens = B.locator('article.post', { hasText: 'Hassas test ' + t });
    await sens.locator('.sens-cover').waitFor();
    await shot(B, 'hassas-bulanik');
    await sens.getByRole('button', { name: 'Gönderiyi gör' }).click();
    await sens.locator('.sens-cover').waitFor({ state: 'detached' });
    ok('hassas gönderi bulanık geldi, dokununca açıldı');
    const K = await newUser(browser, 'genc', k);
    await K.goto(BASE + '/');
    await K.waitForSelector('nav');
    await text(K, 'Normal test ' + t);
    if (await K.getByText('Hassas test ' + t).count()) throw new Error('genç hassas gönderiyi gördü');
    await openSettings(K);
    if (!(await K.locator('[aria-label="Hassas içerik"] button', { hasText: 'Göster' }).isDisabled())) throw new Error('gençte hassas içerik açılabiliyor');
    await text(K, 'hassas içerik hep gizli kalır');
    ok('genç hassas gönderiyi hiç görmüyor, ayarı açamıyor');

    /* ------------------------------------------------ şipşak */
    const A = await newUser(browser, 'ayla', a);
    await A.context().grantPermissions(['camera', 'microphone']);
    await A.goto(BASE + '/');
    await A.waitForSelector('nav');
    await A.locator('button[aria-label="Mesajlar"]').filter({ visible: true }).click();
    await A.locator('#snap-open').click();
    await A.locator('.snap-cam-screen video').waitFor();
    await A.waitForFunction(() => { const v = document.querySelector('.snap-cam-screen video'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
    await wait(500);
    await shot(A, 'sipsak-kamera');
    await A.locator('#snap-shutter').click();
    await text(A, 'Şipşak gönderildi', 15000);
    await text(A, '1 kişi bir kez görebilir');
    await shot(A, 'sipsak-gonderildi');
    ok('Şipşak kamerayla çekildi ve 1 arkadaşa gitti');
    await A.locator('.snap-cam-screen button[aria-label="Kapat"]').click();
    await B.locator('nav button[aria-label="Ana sayfa"]').click();
    await B.waitForFunction(() => { const b = document.querySelector('button[aria-label="Mesajlar"] .badge'); return b && Number(b.textContent) > 0; }, null, { timeout: 10000 });
    await B.locator('button[aria-label="Mesajlar"]').filter({ visible: true }).click();
    const item = B.locator('.snap-item.new', { hasText: 'Ayla' });
    await item.waitFor();
    await item.click();
    await B.locator('.snap-viewer .snap-photo img').waitFor();
    await shot(B, 'sipsak-izle');
    await B.locator('.snap-reacts button[aria-label="Tepki ❤️"]').click();
    await wait(600);
    await B.locator('.snap-viewer button[aria-label="Kapat"]').click();
    await item.waitFor({ state: 'detached' });
    ok('Barış şipşağı bir kez gördü, ❤️ bıraktı; şipşak kayboldu');
    await A.locator('#snap-sent').waitFor();
    await A.waitForFunction(() => /1 gördü/.test((document.querySelector('#snap-sent') || {}).textContent || ''), null, { timeout: 10000 });
    await A.locator('#snap-sent').click();
    await text(A, '1 kişi gördü');
    await A.locator('.seen-chip', { hasText: B_ }).getByText('❤️').waitFor();
    await shot(A, 'sipsak-gorenler');
    await A.keyboard.press('Escape');
    await A.locator('.scrim').last().click({ position: { x: 10, y: 10 } }).catch(() => {});
    ok('Ayla kimin gördüğünü ve tepkisini gördü');

    /* ------------------------------------------------ uçtan uca şifreli sohbet */
    await A.goto(BASE + '/@' + B_);
    await top(A).locator('button[aria-label="Seçenekler"]').click();
    await A.getByText('Şifreli sohbet').click();
    await A.locator('.e2ee-banner').waitFor();
    const secretMsg = 'Gizli plan ' + t + ' 🔐';
    await A.fill('#chat-input', secretMsg);
    await A.locator('.chat-input .text-btn').click();
    await A.locator('.bubble-row.me .bubble', { hasText: secretMsg }).waitFor();
    await wait(800);
    const plainInDb = await sql(`select count(*) from public.messages where text like '%Gizli plan ${t}%'`);
    const encInDb = await sql(`select count(*) from public.messages m join public.threads th on th.id = m.thread_id where th.e2ee and m.enc is not null and m.text is null and m.sender = '${a.user.id}'`);
    if (Number(plainInDb) !== 0 || Number(encInDb) !== 1) throw new Error('sunucuda düz metin var ya da şifreli mesaj yok: ' + plainInDb + '/' + encInDb);
    const dbDump = await sql(`select enc::text from public.messages m join public.threads th on th.id = m.thread_id where th.e2ee and m.sender = '${a.user.id}' limit 1`);
    if (dbDump.indexOf('Gizli') >= 0) throw new Error('şifreli içerikte düz metin');
    await shot(A, 'sifreli-sohbet');
    ok('şifreli sohbet: sunucuda sadece şifreli içerik var');
    await B.locator('.snap-viewer').waitFor({ state: 'detached' }).catch(() => {});
    await B.goto(BASE + '/');
    await B.locator('button[aria-label="Mesajlar"]').filter({ visible: true }).click();
    await B.locator('.inbox-row', { has: B.locator('.lock-ico') }).first().click();
    await B.locator('.bubble', { hasText: secretMsg }).waitFor({ timeout: 10000 });
    await B.fill('#chat-input', 'Anlaştık 👍');
    await B.locator('.chat-input .text-btn').click();
    await A.locator('.bubble', { hasText: 'Anlaştık 👍' }).waitFor({ timeout: 10000 });
    await shot(B, 'sifreli-sohbet-alici');
    ok('Barış şifreli mesajı kendi cihazında açtı ve şifreli yanıt verdi');
    await A.locator('button[aria-label="Sohbet seçenekleri"]').click();
    await A.getByText('Güvenlik kodunu gör').click();
    await A.locator('#safety-code b').first().waitFor();
    const codeA = await A.locator('#safety-code').innerText();
    await B.locator('button[aria-label="Sohbet seçenekleri"]').click();
    await B.getByText('Güvenlik kodunu gör').click();
    await B.locator('#safety-code b').first().waitFor();
    const codeB = await B.locator('#safety-code').innerText();
    if (codeA.replace(/\s/g, '') !== codeB.replace(/\s/g, '') || codeA.replace(/\D/g, '').length !== 30) throw new Error('güvenlik kodları farklı: ' + codeA + ' / ' + codeB);
    await shot(A, 'guvenlik-kodu');
    ok('iki tarafta güvenlik kodu aynı');

    /* ------------------------------------------------ en sevdiğin yıl + yıl özeti */
    await B.goto(BASE + '/');
    await B.locator('#fy-card').waitFor();
    await B.locator('#fy-card').getByText('En sevdiğin yıl hangisi?').click();
    await B.locator('.fy-year[data-y="2018"]').click();
    await B.locator('#fy-next').click();
    await text(B, (CY - 2018) + ' yıl geçmiş, vay be!');
    await text(B, '2018’in kışı mı, yazı mı?');
    await shot(B, 'en-sevdigin-yil');
    await B.locator('#fy-yaz').click();
    await B.locator('#fy-result').waitFor();
    await shot(B, 'en-sevdigin-yil-sonuc');
    const fy = await sql(`select year || ':' || season from public.favorite_years where user_id = '${b.user.id}'`);
    if (fy !== '2018:yaz') throw new Error('en sevdiğin yıl kaydı: ' + fy);
    ok('en sevdiğin yıl: 2018 → "' + (CY - 2018) + ' yıl geçmiş, vay be!" → yazı seçildi');
    await B.locator('#fy-done').click();
    await B.locator('#fy-card').waitFor({ state: 'detached' });

    await A.goto(BASE + '/');
    await A.waitForSelector('nav');
    await openSettings(A);
    await top(A).getByText('Yıl özetin').click();
    await A.locator('.recap').waitFor();
    await text(A, CY + '');
    await shot(A, 'yil-ozeti-1');
    for (let i = 0; i < 12 && !(await A.locator('#recap-summary').count()); i++) {
      if (await A.locator('#fy-next').count()) {
        await A.locator('.fy-year[data-y="2016"]').click();
        await A.locator('#fy-next').click();
        await A.locator('#fy-kis').click();
        await A.locator('#fy-done').click();
      } else {
        await A.locator('.recap-body').click({ position: { x: 300, y: 300 } });
      }
      await wait(350);
    }
    await A.locator('#recap-summary').waitFor();
    await text(A, 'En sevdiğim yıl: 2016');
    await shot(A, 'yil-ozeti-son');
    await A.locator('#recap-share').click();
    await A.locator('.recap').waitFor({ state: 'detached' });
    const st = await sql(`select text_story ->> 'body' from public.stories where author = '${a.user.id}' order by created_at desc limit 1`);
    if (!st || st.indexOf(CY + ' özetim') < 0) throw new Error('özet hikayede paylaşılmadı: ' + st);
    ok('yıl özeti izlendi ve hikayede paylaşıldı');

    await K.goto(BASE + '/');
    await K.waitForSelector('nav');
    await openSettings(K);
    await top(K).getByText('Yıl özetin').click();
    await K.locator('.recap.kid .recap-stickers').waitFor();
    await text(K, 'Hazır mısın');
    await shot(K, 'yil-ozeti-cocuk');
    ok('18 yaş altına renkli, çıkartmalı çocuk sürümü');
    console.log('\nTAMAM: yeni özellik testleri');
  } catch (e) {
    console.log('HATA', e.message);
    code = 1;
    await H.failShots();
  }
  await browser.close();
  process.exit(code);
})();
