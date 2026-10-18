// Video yükleme hatası için tekrar üretme testi.
// Android Chrome, galeriden (ör. Google Fotoğraflar) seçilen dosya seçimden sonra değişmiş görünürse
// yüklemeyi sunucuya hiç göndermeden "Failed to fetch" ile keser (ERR_UPLOAD_FILE_CHANGED).
// Burada aynı durumu masaüstü Chromium'da üretiyoruz: dosyayı seçtikten sonra diskte değiştiriyoruz.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const H = require('./helpers');
const { BASE, IMG, newUser, apiSignup, top, text, wait, sql } = H;

(async () => {
  const browser = await chromium.launch();
  let code = 0;
  try {
    const s = await apiSignup({ username: 'video.test' + Date.now().toString().slice(-5), full_name: 'Video Test', email: 'v' + Date.now() + '@mail.com', password: 'videotest1' });
    const P = await newUser(browser, 'video', s);
    await P.goto(BASE + '/');
    await P.waitForSelector('nav');
    const tmp = '/var/tmp/roztest/degisen-video.webm';
    fs.copyFileSync(IMG + 'reel.webm', tmp);
    await P.locator('nav button[aria-label="Ana sayfa"]').click(); await P.locator('#home-create').click();
    await top(P).getByRole('button', { name: 'REELS', exact: true }).click();
    await P.setInputFiles('#create-file', tmp);
    await text(P, 'Filtre');
    await wait(600);
    // telefondaki gibi: dosya seçimden sonra "değişiyor"
    fs.appendFileSync(tmp, Buffer.alloc(16));
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(tmp, t, t);
    await P.getByRole('button', { name: 'İleri' }).click();
    await P.fill('#create-caption', 'değişen dosya');
    await P.locator('.btn.grad.block.big', { hasText: 'Paylaş' }).click();
    const res = await Promise.race([
      P.waitForSelector('.reel video', { timeout: 15000 }).then(() => 'yuklendi'),
      text(P, 'İnternet bağlantını kontrol et', 15000).then(() => 'internet-hatasi'),
      text(P, 'okunamadı', 15000).then(() => 'okunamadi'),
    ]);
    const n = await sql(`select count(*) from public.posts where caption = 'değişen dosya'`);
    console.log('SONUÇ:', res, '| kayıtlı gönderi:', n);
    if (res !== 'yuklendi' || Number(n) !== 1) code = 1;
  } catch (e) {
    console.log('HATA', e.message);
    code = 2;
  } finally {
    await browser.close();
    process.exit(code);
  }
})();
