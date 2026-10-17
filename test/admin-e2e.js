// Yönetici paneli uçtan uca testi: node test/admin-e2e.js (test/restart.sh sonrası)
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const H = require('./helpers');
const { BASE, newUser, apiSignup, sql, top, text, wait, nav, shot, ok } = H;

(async () => {
  const browser = await chromium.launch();
  let code = 0;
  try {
    const t = Date.now().toString().slice(-5);
    const adm = await apiSignup({ username: 'yonetici' + t, full_name: 'Yönetici', email: 'y' + t + '@mail.com', password: 'yonetici1' });
    const usr = await apiSignup({ username: 'uye' + t, full_name: 'Üye Kişi', email: 'u' + t + '@mail.com', password: 'uyekisi1' });
    await sql(`insert into public.app_admins (user_id) values ('${adm.user.id}')`);
    await sql(`insert into public.posts (author, media, caption) values
      ('${usr.user.id}', '[{"id":"x/p/a.jpg","type":"image","w":1080,"h":1080,"aspect":1}]', 'birinci gönderi ${t}'),
      ('${usr.user.id}', '[{"id":"x/p/b.jpg","type":"image","w":1080,"h":1080,"aspect":1}]', 'ikinci gönderi ${t}')`);
    await sql(`insert into public.reports (reporter, kind, target, reason) select '${adm.user.id}', 'post', id::text, 'uygunsuz' from public.posts where caption = 'ikinci gönderi ${t}'`);

    // normal üye panel girişini görmez
    const U = await newUser(browser, 'uye', usr);
    await U.goto(BASE + '/');
    await U.waitForSelector('nav');
    await nav(U, 'Profil');
    await U.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
    await text(U, 'Hesabın');
    if (await U.getByText('Yönetici paneli').count()) throw new Error('üye yönetici panelini görüyor');
    ok('normal üye yönetici panelini görmüyor');

    // yönetici paneli
    const A = await newUser(browser, 'yonetici', adm);
    await A.goto(BASE + '/');
    await A.waitForSelector('nav');
    await nav(A, 'Profil');
    await A.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
    await top(A).getByRole('button', { name: /Yönetici paneli/ }).click();
    await text(A, 'Kullanıcı');
    await text(A, 'Açık şikayet');
    await shot(A, 'yonetici-genel');
    ok('yönetici paneli açıldı, genel bakış görünüyor');

    // algoritma ayarı
    await top(A).getByRole('tab', { name: 'Algoritma' }).click();
    await A.locator('#adm-video').fill('2');
    await A.locator('#adm-fresh').fill('0.5');
    await shot(A, 'yonetici-algoritma');
    await top(A).getByRole('button', { name: 'Kaydet' }).click();
    await text(A, 'Algoritma ayarları kaydedildi');
    const rank = await sql(`select value from public.app_settings where key = 'rank'`);
    if (Number(rank.video) !== 2 || Number(rank.fresh) !== 0.5) throw new Error('ayar kaydedilmedi: ' + JSON.stringify(rank));
    ok('algoritma ağırlıkları kaydedildi (video 2, tazelik 0.5)');

    // şikayet → kaldır
    await top(A).getByRole('tab', { name: /Şikayetler/ }).click();
    await text(A, 'uygunsuz');
    await shot(A, 'yonetici-sikayet');
    await top(A).locator('.adm-card').first().getByRole('button', { name: 'Kaldır' }).click();
    await text(A, 'Gönderi kaldırıldı');
    await text(A, 'Açık şikayet yok');
    const removed = await sql(`select count(*) from public.post_removals r join public.posts p on p.id = r.post_id where r.active and p.caption = 'ikinci gönderi ${t}'`);
    if (Number(removed) !== 1) throw new Error('gönderi kaldırılmadı');
    ok('şikayet edilen gönderi kaldırıldı, şikayet kapandı');

    // ana sayfada gönderi menüsünden öne çıkar
    await H.back(A);
    await H.back(A);
    await nav(A, 'Ana sayfa');
    const card = A.locator('article.post', { hasText: 'birinci gönderi ' + t });
    await card.waitFor({ timeout: 8000 });
    await card.locator('button[aria-label="Seçenekler"]').click();
    await A.locator('.menu-item', { hasText: 'Öne çıkar (Yönetici)' }).click();
    await A.locator('.menu-item', { hasText: '3 gün' }).click();
    await text(A, 'öne çıkarıldı');
    const boost = await sql(`select public.boost_of(id) from public.posts where caption = 'birinci gönderi ${t}'`);
    if (Number(boost) <= 0) throw new Error('öne çıkarılmadı');
    ok('gönderi menüsünden 3 gün öne çıkarıldı');

    // üyenin akışı: kaldırılan gönderi başkasına görünmez, öne çıkan en üstte
    const other = await apiSignup({ username: 'izleyici' + t, full_name: 'İzleyici', email: 'i' + t + '@mail.com', password: 'izleyici1' });
    const V = await newUser(browser, 'izleyici', other);
    await V.addInitScript(() => localStorage.setItem('roz:feedMode', JSON.stringify('foryou')));
    await V.goto(BASE + '/');
    await V.waitForSelector('article.post');
    const first = await V.locator('article.post').first().innerText();
    if (first.indexOf('birinci gönderi ' + t) < 0) throw new Error('öne çıkan gönderi en üstte değil');
    if (await V.getByText('ikinci gönderi ' + t).count()) throw new Error('kaldırılan gönderi görünüyor');
    await shot(V, 'one-cikan-akista');
    ok('başka kullanıcının akışında öne çıkan en üstte, kaldırılan görünmüyor');

    // mavi tik
    await nav(A, 'Profil');
    await A.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
    await top(A).getByRole('button', { name: /Yönetici paneli/ }).click();
    await top(A).getByRole('tab', { name: 'Mavi tik' }).click();
    await A.fill('#adm-q', 'uye' + t);
    await top(A).getByRole('button', { name: 'Mavi tik ver' }).click();
    await text(A, 'Mavi tik verildi');
    const ver = await sql(`select verified from public.profiles where id = '${usr.user.id}'`);
    if (ver !== true) throw new Error('mavi tik verilmedi');
    await shot(A, 'yonetici-mavi-tik');
    ok('mavi tik verildi');

    // üye kendi kaldırılan gönderisini notla görür
    await U.reload();
    await U.waitForSelector('nav');
    await nav(U, 'Profil');
    await U.waitForTimeout(800);
    const notes = await sql(`select count(*) from public.posts where caption = 'ikinci gönderi ${t}'`);
    if (Number(notes) !== 1) throw new Error('gönderi silinmiş olmamalı');
    ok('kaldırılan gönderi silinmedi, sahibinde duruyor');
    console.log('\nTAMAM: yönetici testleri');
  } catch (e) {
    console.log('HATA', e.message);
    code = 1;
    await H.failShots();
  }
  await browser.close();
  process.exit(code);
})();
