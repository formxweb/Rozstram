// İkinci tur: giriş yöntemleri, grup sohbeti, düzenleme/geri alma, not, yakın arkadaş hikayesi,
// engelleme, kullanıcı adı değişimi, sabitleme/arşiv, şikayet, şifre değişimi, hesap silme.
// e2e.js'den sonra (aynı veritabanıyla) çalıştırılır.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const H = require('./helpers');
const { BASE, ok, results, newUser, shot, wait, sql, apiSignup, top, text, gone, back, nav } = H;

async function login(page, id, pw) {
  await page.goto(BASE + '/');
  await page.waitForSelector('#login-id');
  await page.fill('#login-id', id);
  await page.fill('#login-pw', pw);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
async function logout(page) {
  await nav(page, 'Profil');
  await page.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
  await top(page).getByRole('button', { name: 'Çıkış yap' }).click();
  await page.locator('.dialog button.danger').click();
  await page.waitForSelector('#login-id');
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

  /* ---------------------------------------------------------- giriş yöntemleri */
  const A = await newUser(browser, 'ali2');
  await login(A, 'ali.veli', 'yanlis-sifre');
  await text(A, 'Şifre hatalı');
  await shot(A, 'giris-hatali-sifre');
  ok('yanlış şifre reddedildi');
  await login(A, 'yok.boyle.biri', 'x12345678');
  await text(A, 'kayıtlı bir hesap bulunamadı');
  ok('olmayan hesap için doğru uyarı');
  await login(A, '0532 111 22 33', 'sifre1234');
  await A.waitForSelector('nav');
  ok('telefon numarasıyla giriş');
  await logout(A);
  await login(A, '@Ali.Veli', 'sifre1234');
  await A.waitForSelector('nav');
  ok('kullanıcı adıyla giriş (büyük harf ve @ ile)');
  await shot(A, 'giris-sonrasi');

  const B = await newUser(browser, 'ayse2');
  await login(B, 'AYSE@mail.com', 'guclu-sifre');
  await B.waitForSelector('nav');
  ok('e-postayla giriş');

  /* ---------------------------------------------------------- bağlantıyla profil açma */
  await B.goto(BASE + '/@ali.veli');
  await text(B, 'Ali Veli');
  await B.waitForSelector('.page .prof-head');
  await shot(B, 'baglanti-profil');
  ok('rozstram.app/@ali.veli bağlantısı profili açtı');
  await back(B);

  /* ---------------------------------------------------------- üçüncü kullanıcı (Can) + grup sohbeti */
  const canSession = await apiSignup({ username: 'can', full_name: 'Can Demir', email: 'can@mail.com', password: 'cancan123' });
  const C = await newUser(browser, 'can', canSession);
  await C.goto(BASE + '/');
  await C.waitForSelector('nav');
  await nav(A, 'Ana sayfa');
  await A.locator('button[aria-label="Mesajlar"]').filter({ visible: true }).click();
  await top(A).locator('button[aria-label="Yeni mesaj"]').click();
  await top(A).locator('#newmsg-q').fill('a');
  await top(A).locator('.person', { hasText: 'ayse' }).locator('.check-ring').click();
  await top(A).locator('#newmsg-q').fill('can');
  await top(A).locator('.person', { hasText: 'can' }).locator('.check-ring').click();
  await top(A).locator('#group-title').fill('Ekip');
  await shot(A, 'grup-kur');
  await top(A).getByRole('button', { name: 'Grup kur' }).click();
  await A.waitForSelector('#chat-input');
  await A.fill('#chat-input', 'Merhaba ekip!');
  await top(A).getByRole('button', { name: 'Gönder', exact: true }).click();
  await text(A, 'Merhaba ekip');
  ok('grup kuruldu ve mesaj atıldı');
  await nav(C, 'Ana sayfa');
  await C.locator('button[aria-label="Mesajlar"]').filter({ visible: true }).click();
  await text(C, 'Ekip');
  await top(C).locator('.inbox-row', { hasText: 'Ekip' }).click();
  await text(C, 'Merhaba ekip');
  await C.fill('#chat-input', 'Selam!');
  await top(C).getByRole('button', { name: 'Gönder', exact: true }).click();
  await text(A, 'Selam!');
  await shot(C, 'grup-sohbet');
  ok('gruptaki mesajlar canlı geldi (Can → Ali)');

  /* düzenle + geri al */
  const bub = top(A).locator('.bubble', { hasText: 'Merhaba ekip' });
  await bub.hover();
  await A.mouse.down(); await wait(600); await A.mouse.up();
  await A.waitForSelector('.react-menu');
  await shot(A, 'mesaj-menu');
  await A.locator('.react-menu button', { hasText: 'Düzenle' }).click();
  await A.fill('#chat-input', 'Merhaba ekip! (düzenlendi)');
  await top(A).getByRole('button', { name: 'Kaydet', exact: true }).click();
  await text(C, '(düzenlendi)');
  await text(C, 'Düzenlendi');
  ok('mesaj düzenlendi, karşı tarafta canlı güncellendi');
  const bub2 = top(A).locator('.bubble', { hasText: 'düzenlendi' });
  await bub2.hover();
  await A.mouse.down(); await wait(600); await A.mouse.up();
  await A.locator('.react-menu button', { hasText: 'Geri al' }).click();
  await text(C, 'Mesaj geri alındı');
  await shot(C, 'mesaj-geri-alindi');
  ok('mesaj geri alındı');

  /* grup bilgisi */
  await top(C).locator('button[aria-label="Grup bilgisi"]').click();
  await text(C, 'Grup bilgisi');
  await shot(C, 'grup-bilgisi');
  await back(C);
  await back(C);
  await back(A);

  /* ---------------------------------------------------------- not */
  await top(A).locator('.note-item').first().click();
  await A.fill('#note-input', 'Kahve içen var mı? ☕');
  await A.getByRole('button', { name: 'Paylaş', exact: true }).click();
  await wait(500);
  await back(A);
  await B.locator('button[aria-label="Mesajlar"]').filter({ visible: true }).click();
  await text(B, 'Kahve içen var mı');
  await shot(B, 'notlar');
  ok('not paylaşıldı, Ayşe’nin mesaj kutusunda göründü');
  await back(B);

  /* ---------------------------------------------------------- yakın arkadaş hikayesi */
  await nav(A, 'Profil');
  await A.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
  await top(A).getByRole('button', { name: /Yakın Arkadaşlar/ }).click();
  await top(A).locator('.person', { hasText: 'ayse' }).locator('.check-ring').click();
  await wait(400);
  await shot(A, 'yakin-arkadaslar');
  await back(A); await back(A);
  await nav(A, 'Ana sayfa');
  await A.locator('.stories .story-chip button.plus').click();
  await A.getByRole('button', { name: 'Yazı', exact: true }).click();
  await A.fill('#story-text', 'Sadece yakın arkadaşlarım 💚');
  await A.locator('.se-share.cf').click();
  await wait(1200);
  await nav(B, 'Ana sayfa');
  await B.waitForSelector('.stories .ring.r-cf', { timeout: 8000 });
  await shot(B, 'yesil-halka');
  await B.locator('.stories .story-chip').nth(1).click();
  await text(B, 'Sadece yakın arkadaşlarım');
  await text(B, 'Yakın Arkadaşlar');
  await shot(B, 'yakin-arkadas-hikayesi');
  await B.locator('.story button[aria-label="Kapat"]').click();
  await wait(500);
  const canSees = await sql(`select count(*) from public.stories where close_friends`);
  ok('yakın arkadaş hikayesi yeşil halkayla göründü (toplam ' + canSees + ')');
  await nav(C, 'Ana sayfa');
  await wait(800);
  if (await C.locator('.stories .story-chip').count() > 1) {
    const names = await C.locator('.stories .story-chip').allInnerTexts();
    // Can'ın gördüğü hikayelerde yakın arkadaş hikayesi olmamalı (Ali'nin normal hikayesi görünebilir)
    await C.locator('.stories .story-chip').nth(1).click();
    await wait(600);
    if (await C.getByText('Sadece yakın arkadaşlarım').count()) throw new Error('Can yakın arkadaş hikayesini gördü!');
    await C.locator('.story button[aria-label="Kapat"]').click().catch(() => {});
    await wait(400);
  }
  ok('listede olmayan Can yakın arkadaş hikayesini göremedi');

  /* ---------------------------------------------------------- sabitle + arşivle */
  await nav(B, 'Profil');
  await B.locator('.tab-view:not([hidden]) .grid .tile').first().click();
  await top(B).locator('button[aria-label="Seçenekler"]').first().click();
  await B.locator('.menu-item', { hasText: 'Profiline sabitle' }).click();
  await wait(700);
  await back(B);
  await B.waitForSelector('.tab-view:not([hidden]) .tile .badge-ico');
  await shot(B, 'sabitlenmis');
  ok('gönderi profile sabitlendi');

  /* ---------------------------------------------------------- engelleme */
  await nav(C, 'Keşfet');
  await C.fill('#explore-q', 'ali');
  await C.locator('.tab-view:not([hidden]) .person .row-main').first().click();
  await top(C).locator('button[aria-label="Seçenekler"]').click();
  await C.locator('.menu-item', { hasText: 'Engelle' }).click();
  await C.locator('.dialog button.danger').click();
  await text(C, 'engellendi');
  ok('Can Ali’yi engelledi');
  await wait(800);
  const blocked = await sql(`select count(*) from public.blocks`);
  if (Number(blocked) !== 1) throw new Error('engel kaydı yok');
  await A.goto(BASE + '/@can');
  await A.waitForSelector('nav');
  await text(A, '@can bulunamadı');
  await shot(A, 'engellenmis-profil');
  ok('engellenen Ali, Can’ın profilini bulamadı');

  /* ---------------------------------------------------------- şikayet */
  await A.goto(BASE + '/@ayse');
  await A.waitForSelector('.page .prof-head');
  await top(A).locator('button[aria-label="Seçenekler"]').click();
  await A.locator('.menu-item', { hasText: 'Şikayet et' }).click();
  await A.locator('.menu-item', { hasText: 'Spam' }).click();
  await text(A, 'Şikayetin incelenecek');
  await shot(A, 'sikayet');
  const reps = await sql(`select count(*) from public.reports`);
  if (Number(reps) < 1) throw new Error('şikayet kaydı yok');
  ok('şikayet kaydedildi');
  await A.keyboard.press('Escape');
  await A.locator('.scrim').last().click({ position: { x: 10, y: 10 } }).catch(() => {});
  await wait(400);

  /* ---------------------------------------------------------- kullanıcı adı değiştirme */
  await A.goto(BASE + '/');
  await A.waitForSelector('nav');
  await nav(A, 'Profil');
  await A.locator('.tab-view:not([hidden])').getByRole('button', { name: 'Profili düzenle' }).click();
  await top(A).locator('#ed-user').fill('ayse');
  await text(A, 'Bu kullanıcı adı alınmış');
  await top(A).locator('#ed-user').fill('ali.yeni');
  await text(A, 'kullanılabilir');
  await shot(A, 'kullanici-adi-degistir');
  await top(A).getByRole('button', { name: 'Bitti' }).click();
  await wait(800);
  const uname = await sql(`select username from public.profiles where full_name = 'Ali Veli'`);
  if (uname !== 'ali.yeni') throw new Error('ad değişmedi: ' + uname);
  ok('kullanıcı adı ali.yeni oldu');
  const D = await newUser(browser, 'deniz');
  await D.goto(BASE + '/');
  await D.getByRole('button', { name: 'Kaydol' }).click();
  await D.getByRole('tab', { name: 'E-posta' }).click();
  await D.fill('#su-email', 'deniz@mail.com');
  await D.getByRole('button', { name: 'İleri' }).click();
  await D.fill('#su-name', 'Deniz');
  await D.fill('#su-pw', 'denizdeniz');
  await D.getByRole('button', { name: 'İleri' }).click();
  await D.fill('#su-user', 'ali.veli');
  await D.waitForSelector('.auth-input.uname.bad');
  await shot(D, 'eski-ad-kilitli');
  ok('Ali’nin eski adı (ali.veli) yeni kayıtta kullanılamadı');
  await D.fill('#su-user', 'deniz');
  await D.waitForSelector('.auth-input.uname.good');
  await D.getByRole('button', { name: 'İleri' }).click();
  await D.selectOption('#su-birth', '1995');
  await D.getByRole('button', { name: 'Kaydol' }).click();
  await text(D, 'Hoş geldin, @deniz');
  await D.getByRole('button', { name: 'Şimdilik atla' }).click();
  await D.getByRole('button', { name: 'İleri' }).click();
  await D.getByRole('button', { name: 'Rozstram’a başla' }).click();
  ok('Deniz kaydoldu');

  /* ---------------------------------------------------------- hesap silme */
  await nav(D, 'Profil');
  await D.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
  await top(D).locator('.set-row', { hasText: 'Hesap' }).first().click();
  await top(D).locator('.set-row', { hasText: 'Hesabı sil' }).click();
  await D.fill('#del-name', 'deniz');
  await shot(D, 'hesap-sil');
  await D.getByRole('button', { name: 'Hesabımı sil' }).click();
  await D.waitForSelector('#login-id', { timeout: 10000 });
  const left = await sql(`select count(*) from public.profiles where username = 'deniz'`);
  const locked = await sql(`select count(*) from public.usernames where name = 'deniz' and user_id is null`);
  if (Number(left) !== 0 || Number(locked) !== 1) throw new Error('silme hatalı ' + left + ' ' + locked);
  ok('Deniz hesabını sildi; @deniz adı kilitli kaldı');
  await login(D, 'deniz@mail.com', 'denizdeniz');
  await text(D, 'kayıtlı bir hesap bulunamadı');
  ok('silinen hesapla giriş yapılamıyor');

  /* ---------------------------------------------------------- şifre değiştirme */
  await nav(A, 'Profil');
  await A.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
  await top(A).locator('.set-row', { hasText: 'Hesap' }).first().click();
  await A.fill('#acc-pw', 'yeni-sifre-99');
  await A.fill('#acc-pw2', 'yeni-sifre-99');
  await top(A).getByRole('button', { name: 'Şifreyi değiştir' }).click();
  await text(A, 'Şifren değişti');
  await back(A); await back(A);
  await logout(A);
  await login(A, 'ali.yeni', 'sifre1234');
  await text(A, 'Şifre hatalı');
  await login(A, 'ali.yeni', 'yeni-sifre-99');
  await A.waitForSelector('nav');
  ok('şifre değişti, eski şifre artık çalışmıyor');

  fs.writeFileSync(path.join(H.SHOTS, 'results2.txt'), results.join('\n'));
  console.log('\nTAMAM:', results.length, 'adım');
  await browser.close();
})().catch(async (e) => { await H.failShots(); console.error('HATA:', e.message.split('\n').filter((l) => /HATA|Timeout|intercepts|waiting for locator|Error/.test(l)).slice(0, 6).join('\n')); fs.writeFileSync(path.join(H.SHOTS, 'results2.txt'), results.join('\n') + '\nHATA: ' + e.message); process.exit(1); });
