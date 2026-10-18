// Alt menüde Mesajlar + yeniden paylaşım (Reels ve gönderi) uçtan uca testi: node test/repost-e2e.js (test/restart.sh sonrası)
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const H = require('./helpers');
const { BASE, IMG, newUser, apiSignup, sql, top, text, gone, wait, nav, shot, ok } = H;
const STORE = '/var/tmp/rozstore';

const put = (rel, src, type) => {
  const dest = path.join(STORE, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.writeFileSync(dest + '.type', type);
};

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let code = 0;
  try {
    const t = Date.now().toString().slice(-5);
    const a = await apiSignup({ username: 'yapimci' + t, full_name: 'Yapımcı', email: 'yp' + t + '@mail.com', password: 'yapimci12' });
    const b = await apiSignup({ username: 'paylasan' + t, full_name: 'Paylaşan', email: 'pa' + t + '@mail.com', password: 'paylasan1' });
    const c = await apiSignup({ username: 'izleyici' + t, full_name: 'İzleyici', email: 'iz' + t + '@mail.com', password: 'izleyici1' });
    const A_ = 'yapimci' + t, B_ = 'paylasan' + t;
    put(a.user.id + '/p/r' + t + '.webm', IMG + 'reel.webm', 'video/webm');
    put(a.user.id + '/p/f' + t + '.jpg', IMG + 'p1.jpg', 'image/jpeg');
    await sql(`insert into public.posts (author, kind, media, caption) values ('${a.user.id}', 'reel', '[{"id":"${a.user.id}/p/r${t}.webm","type":"video","aspect":0.5625}]', 'Yapımcının Reels ${t} #yeni')`);
    await sql(`insert into public.posts (author, media, caption) values ('${a.user.id}', '[{"id":"${a.user.id}/p/f${t}.jpg","type":"image","aspect":1}]', 'Yapımcının fotoğrafı ${t}')`);
    // İzleyici sadece Paylaşan'ı takip ediyor; Paylaşan, Yapımcı'yı takip ediyor
    await sql(`insert into public.follows (follower, following, status) values ('${c.user.id}', '${b.user.id}', 'accepted'), ('${b.user.id}', '${a.user.id}', 'accepted')`);

    /* ------------------------------------------------ alt menü: Mesajlar */
    const B = await newUser(browser, 'paylasan', b);
    await B.addInitScript(() => localStorage.setItem('roz:feedMode', JSON.stringify('following')));
    await B.goto(BASE + '/');
    await B.waitForSelector('nav');
    const labels = await B.locator('nav > button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    if (labels.join(',') !== 'Ana sayfa,Reels,Mesajlar,Keşfet,Profil') throw new Error('alt menü sırası: ' + labels.join(','));
    await nav(B, 'Mesajlar');
    await B.locator('#snap-open').waitFor();
    await text(B, 'Mesajlar');
    if (await B.locator('.tab-view:not([hidden]) header button[aria-label="Geri"]').count()) throw new Error('mesajlar sekmesinde geri tuşu var');
    await shot(B, 'mesajlar-sekmesi');
    await nav(B, 'Ana sayfa');
    await B.locator('#home-create').waitFor();
    ok('alt menü: Ana sayfa, Reels, Mesajlar, Keşfet, Profil; Oluştur üst çubukta');

    /* ------------------------------------------------ Reels'i yeniden paylaş */
    await nav(B, 'Reels');
    const reel = B.locator('.reel', { hasText: 'Yapımcının Reels ' + t });
    await reel.waitFor();
    await reel.locator('button[aria-label="Yeniden paylaş"]').click();
    await text(B, 'Yeniden paylaşıldı');
    await reel.locator('button[aria-label="Yeniden paylaşımı geri al"]').waitFor();
    await shot(B, 'reels-yeniden-paylas');
    const n1 = await sql(`select count(*) from public.reposts where user_id = '${b.user.id}'`);
    if (Number(n1) !== 1) throw new Error('yeniden paylaşım kaydedilmedi');
    ok('Reels yeniden paylaşıldı');

    /* ------------------------------------------------ gönderiyi akıştan yeniden paylaş */
    await nav(B, 'Ana sayfa');
    const card = B.locator('article.post', { hasText: 'Yapımcının fotoğrafı ' + t });
    await card.waitFor();
    await card.locator('button[aria-label="Yeniden paylaş"]').click();
    await card.locator('button[aria-label="Yeniden paylaşımı geri al"]').waitFor();
    await card.locator('button[aria-label="Yeniden paylaşımı geri al"]', { hasText: '1' }).waitFor();
    ok('gönderi akıştan yeniden paylaşıldı (sayaç 1)');

    /* ------------------------------------------------ takipçi akışta ve Reels'te görür */
    const C = await newUser(browser, 'izleyici', c);
    await C.addInitScript(() => localStorage.setItem('roz:feedMode', JSON.stringify('following')));
    await C.goto(BASE + '/');
    const seen = C.locator('article.post', { hasText: 'Yapımcının fotoğrafı ' + t });
    await seen.waitFor();
    await seen.locator('.repost-line', { hasText: B_ + ' yeniden paylaştı' }).waitFor();
    await seen.scrollIntoViewIfNeeded();
    await shot(C, 'akista-yeniden-paylasim');
    ok('takipçi, takip etmediği hesabın gönderisini "' + B_ + ' yeniden paylaştı" etiketiyle gördü');
    await nav(C, 'Reels');
    await C.locator('.reel-tabs button', { hasText: 'Takip edilenler' }).click();
    const creel = C.locator('.reel', { hasText: 'Yapımcının Reels ' + t });
    await creel.waitFor();
    await creel.locator('.reel-repost', { hasText: B_ + ' yeniden paylaştı' }).waitFor();
    await shot(C, 'reels-yeniden-paylasim-etiket');
    ok('Takip edilenler Reels\'inde de çıktı');

    /* ------------------------------------------------ profil sekmesi ve bildirim */
    await C.goto(BASE + '/@' + B_);
    await top(C).locator('button[aria-label="Yeniden paylaşılanlar"]').click();
    await top(C).locator('.grid .tile').nth(1).waitFor();
    await shot(C, 'profil-yeniden-paylasilanlar');
    ok('profilde "Yeniden paylaşılanlar" sekmesi 2 gönderi');
    const A = await newUser(browser, 'yapimci', a);
    await A.goto(BASE + '/');
    await A.locator('button[aria-label="Bildirimler"]').click();
    await text(A, 'gönderini yeniden paylaştı');
    await shot(A, 'bildirim-yeniden-paylasim');
    ok('gönderi sahibine "yeniden paylaştı" bildirimi');

    /* ------------------------------------------------ geri al */
    await nav(B, 'Ana sayfa');
    await card.locator('button[aria-label="Yeniden paylaşımı geri al"]').click();
    await text(B, 'Yeniden paylaşım geri alındı');
    await card.locator('button[aria-label="Yeniden paylaş"]').waitFor();
    const n2 = await sql(`select count(*) from public.reposts where user_id = '${b.user.id}'`);
    if (Number(n2) !== 1) throw new Error('geri alma çalışmadı: ' + n2);
    await C.goto(BASE + '/');
    await C.locator('article.post', { hasText: 'Yapımcının Reels ' + t }).waitFor();
    await wait(600);
    if (await C.locator('article.post', { hasText: 'Yapımcının fotoğrafı ' + t }).locator('.repost-line').count()) throw new Error('geri alınan paylaşım etiketi duruyor');
    ok('geri alınınca takipçinin akışından kalktı');
    console.log('\nTAMAM: yeniden paylaşım testleri');
  } catch (e) {
    console.log('HATA', e.message);
    code = 1;
    await H.failShots();
  }
  await browser.close();
  process.exit(code);
})();
