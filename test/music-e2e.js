// Müzik uçtan uca testi: node test/music-e2e.js (test/restart.sh sonrası)
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const H = require('./helpers');
const { BASE, IMG, newUser, apiSignup, sql, top, text, wait, nav, shot, ok } = H;

const trackPlays = () => {
  window.__plays = [];
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (this.src && this.src.indexOf('/music/') >= 0) window.__plays.push(this.src); return orig.apply(this, arguments); };
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let code = 0;
  try {
    const t = Date.now().toString().slice(-5);
    const a = await apiSignup({ username: 'muzik' + t, full_name: 'Müzik Sever', email: 'm' + t + '@mail.com', password: 'muziksever1' });
    const b = await apiSignup({ username: 'dinleyici' + t, full_name: 'Dinleyici', email: 'd' + t + '@mail.com', password: 'dinleyici1' });

    const A = await newUser(browser, 'muzik', a);
    await A.addInitScript(trackPlays);
    await A.goto(BASE + '/');
    await A.waitForSelector('nav');

    // Reels + müzik
    await A.locator('nav button[aria-label="Ana sayfa"]').click(); await A.locator('#home-create').click();
    await top(A).getByRole('button', { name: 'REELS', exact: true }).click();
    await A.setInputFiles('#create-file', IMG + 'reel.webm');
    await text(A, 'Filtre');
    await A.getByRole('button', { name: 'İleri' }).click();
    await A.locator('#create-music').click();
    await A.waitForSelector('#music-q');
    const rows = await A.locator('.mus-row').count();
    if (rows < 12) throw new Error('kütüphane yüklenmedi: ' + rows);
    await A.fill('#music-q', 'neon');
    await wait(700);
    await shot(A, 'muzik-secici');
    await A.locator('.mus-row', { hasText: 'Neon Şehir' }).getByRole('button', { name: 'Seç' }).click();
    await text(A, 'Parçanın yerini seç');
    await wait(500);
    await shot(A, 'muzik-parca');
    await A.locator('#music-done').click();
    await text(A, 'Neon Şehir');
    const plays = await A.evaluate(() => window.__plays);
    if (!plays.some((u) => u.indexOf('neon-sehir') >= 0)) throw new Error('önizleme çalmadı');
    ok('müzik seçici açıldı, Neon Şehir seçildi ve önizleme çaldı');
    await A.fill('#create-caption', 'Müzikli reels ' + t);
    await A.locator('.btn.grad.block.big', { hasText: 'Paylaş' }).click();
    await A.waitForSelector('.reel video', { timeout: 15000 });
    const pm = await sql(`select music ->> 'title' from public.posts where caption = 'Müzikli reels ${t}'`);
    if (pm !== 'Neon Şehir') throw new Error('gönderide müzik yok: ' + pm);
    ok('müzikli Reels paylaşıldı');

    // yazı hikayesi + müzik
    await A.locator('nav button[aria-label="Ana sayfa"]').click(); await A.locator('#home-create').click();
    await top(A).getByRole('button', { name: 'HİKAYE', exact: true }).click();
    await top(A).getByRole('button', { name: 'Yazı' }).click();
    await A.fill('#story-text', 'Kahve zamanı ' + t);
    await A.locator('.se button[aria-label="Müzik ekle"]').click();
    await A.locator('.mus-row', { hasText: 'Kahve Molası' }).getByRole('button', { name: 'Seç' }).click();
    await A.locator('#music-done').click();
    await A.locator('.se-music', { hasText: 'Kahve Molası' }).waitFor();
    await shot(A, 'hikaye-muzik');
    await A.locator('.se-share', { hasText: 'Hikayen' }).click();
    await wait(1500);
    const sm = await sql(`select music ->> 'title' from public.stories where text_story ->> 'body' = 'Kahve zamanı ${t}'`);
    if (sm !== 'Kahve Molası') throw new Error('hikayede müzik yok: ' + sm);
    ok('müzikli hikaye paylaşıldı');

    // izleyici: Reels'te müzik satırı, ses açınca müzik çalar, müzik sayfası
    await sql(`insert into public.follows (follower, following) values ('${b.user.id}', '${a.user.id}')`);
    const B = await newUser(browser, 'dinleyici', b);
    await B.addInitScript(trackPlays);
    await B.goto(BASE + '/');
    await B.waitForSelector('nav');
    await nav(B, 'Reels');
    await B.waitForSelector('.reel video');
    await B.locator('.reel .audio', { hasText: 'Neon Şehir' }).first().waitFor();
    await B.locator('.reel').first().click({ position: { x: 150, y: 300 } });
    await wait(1200);
    const bp = await B.evaluate(() => window.__plays);
    if (!bp.some((u) => u.indexOf('neon-sehir') >= 0)) throw new Error('Reels müziği çalmadı');
    await shot(B, 'reels-muzik');
    ok('izleyici sesi açınca Reels müziği çaldı');
    await B.locator('.reel .audio', { hasText: 'Neon Şehir' }).first().click();
    await text(B, 'Bu müzikle oluştur');
    await text(B, '1 gönderi');
    await shot(B, 'muzik-sayfasi');
    ok('müzik sayfası açıldı (1 gönderi)');

    // hikayede müzik etiketi
    await nav(B, 'Ana sayfa');
    await B.locator('.stories button').filter({ hasText: 'muzik' }).first().click();
    await B.locator('.story-music', { hasText: 'Kahve Molası' }).waitFor({ timeout: 8000 });
    await wait(700);
    await shot(B, 'hikaye-muzik-izle');
    ok('hikayede müzik etiketi görünüyor');

    // yönetici müzik yükler
    await sql(`insert into public.app_admins (user_id) values ('${a.user.id}')`);
    await A.reload();
    await A.waitForSelector('nav');
    await nav(A, 'Profil');
    await A.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
    await top(A).getByRole('button', { name: /Yönetici paneli/ }).click();
    await top(A).getByRole('tab', { name: 'Müzik' }).click();
    await A.setInputFiles('#adm-music-file', '/home/claude/rozstram/music/enerji.mp3');
    await A.fill('#adm-music-title', 'Yönetici Şarkısı ' + t);
    await A.fill('#adm-music-artist', 'Test');
    await A.fill('#adm-music-genre', 'Deneme');
    await A.locator('#adm-music-add').click();
    await text(A, 'Müzik kütüphaneye eklendi', 15000);
    const n = await sql(`select count(*) from public.music_tracks where title = 'Yönetici Şarkısı ${t}' and url like '${a.user.id}/music/%'`);
    if (Number(n) !== 1) throw new Error('yüklenen müzik kütüphanede yok');
    await shot(A, 'yonetici-muzik');
    ok('yönetici panelinden müzik yüklendi');
    console.log('\nTAMAM: müzik testleri');
  } catch (e) {
    console.log('HATA', e.message);
    code = 1;
    await H.failShots();
  }
  await browser.close();
  process.exit(code);
})();
