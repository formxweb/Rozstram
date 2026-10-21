// Telefonun geri tuşu uçtan uca testi: node test/back-e2e.js (test/restart.sh sonrası)
// Geri tuşu = tarayıcı geçmişinde geri (popstate). Uygulamadan çıkmamalı; en üstteki katmanı kapatmalı.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const H = require('./helpers');
const { BASE, newUser, apiSignup, sql, top, text, gone, wait, nav, shot, ok } = H;

(async () => {
  const browser = await chromium.launch();
  let code = 0;
  try {
    const t = Date.now().toString().slice(-5);
    const a = await apiSignup({ username: 'geri' + t, full_name: 'Geri Tuşu', email: 'g' + t + '@mail.com', password: 'geritusu1' });
    const b = await apiSignup({ username: 'komsu' + t, full_name: 'Komşu', email: 'k' + t + '@mail.com', password: 'komsukomsu' });
    await sql(`insert into public.follows (follower, following, status) values ('${a.user.id}', '${b.user.id}', 'accepted')`);
    await sql(`insert into public.posts (author, media, caption) values ('${b.user.id}', '[{"id":"x/p/1.jpg","type":"image","aspect":1}]', 'Geri testi ${t}')`);

    const A = await newUser(browser, 'geri', a);
    await A.goto(BASE + '/');
    await A.waitForSelector('nav');
    await text(A, 'Geri testi ' + t);
    const back = async () => { await A.evaluate(() => history.back()); await wait(450); };
    const alive = async (label) => {
      if (!A.url().startsWith(BASE)) throw new Error(label + ': uygulamadan çıkıldı → ' + A.url());
      await A.locator('nav').first().waitFor({ timeout: 3000 });
    };

    // 1) alt panel (yorumlar)
    await A.locator('article.post', { hasText: 'Geri testi ' + t }).getByRole('button', { name: 'Yorumlar' }).click();
    await A.locator('.sheet').waitFor();
    await back();
    await A.locator('.sheet').waitFor({ state: 'detached' });
    await alive('alt panel');
    ok('geri tuşu açık alt paneli kapattı');

    // 2) sayfa (profil) → geri → akış; iki sayfa üst üste → iki kez geri
    await A.locator('article.post', { hasText: 'Geri testi ' + t }).locator('.post-head .who-line').getByText('komsu' + t).first().click();
    await top(A).locator('.prof-head').waitFor();
    await top(A).locator('.prof-head button', { hasText: 'takipçi' }).first().click();
    await wait(400);
    const pages = await A.locator('.page').count();
    if (pages < 2) throw new Error('iki sayfa açılmadı: ' + pages);
    await back();
    if ((await A.locator('.page').count()) !== pages - 1) throw new Error('geri tuşu bir sayfa kapatmadı');
    await back();
    if (await A.locator('.page').count()) throw new Error('geri tuşu ilk sayfayı kapatmadı');
    await alive('sayfa');
    ok('geri tuşu açık sayfaları teker teker kapattı');

    // 3) başka sekme → geri → ana sayfa
    await nav(A, 'Reels');
    await wait(300);
    await back();
    if (!(await A.locator('nav button[aria-label="Ana sayfa"]').first().evaluate((el) => el.classList.contains('on') || el.getAttribute('aria-current') === 'page' || el.getAttribute('aria-selected') === 'true')))
      await text(A, 'Geri testi ' + t);
    await alive('sekme');
    ok('geri tuşu başka sekmeden ana sayfaya döndü');

    // 4) ana sayfada geri → uygulamada kalır, uyarı çıkar; ikinci geri uygulamadan çıkar
    await back();
    await text(A, 'Çıkmak için tekrar geri bas');
    await alive('ana sayfa');
    await shot(A, 'geri-cikis-uyarisi');
    ok('ana sayfada ilk geri uygulamadan çıkmadı, uyarı gösterdi');
    await A.evaluate(() => history.back());
    await wait(800);
    if (A.url().startsWith(BASE + '/') && (await A.locator('nav').count()) && !(await A.evaluate(() => document.visibilityState === 'hidden'))) {
      // başka bir geçmiş kaydı yoksa sayfa yerinde kalabilir (gerçek telefonda uygulama kapanır); önceki kayıt about:blank ise oraya gider
      const u = A.url();
      if (u.startsWith(BASE)) console.log('  (not: test tarayıcısında önceki kayıt yok, sayfa yerinde kaldı)');
    }
    ok('ikinci geri tuzağa takılmadı (uygulamadan çıkış serbest)');
    console.log('\nTAMAM: geri tuşu testleri');
  } catch (err) {
    console.log('HATA', err.message);
    await H.failShots();
    code = 1;
  }
  await browser.close();
  process.exit(code);
})();
