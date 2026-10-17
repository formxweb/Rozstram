// Akış sırası testi: beğeni / izleme sırasında akış yer değiştirmemeli, yenilemede yeniden sıralanmalı.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const H = require('./helpers');
const { BASE, newUser, sql, wait } = H;
(async () => {
  const browser = await chromium.launch();
  let code = 0;
  try {
    // birkaç gönderi ekle (farklı yazarlar, farklı yaşlar)
    const media = await sql(`select media from public.posts where media->0->>'type' = 'image' limit 1`);
    await sql(`update public.profiles set is_private = false`);
    await sql(`insert into public.posts (author, media, caption, created_at)
      select a.id, '${JSON.stringify(media)}'::jsonb, 'sıra testi ' || g, now() - (g || ' hours')::interval
      from (select id from public.profiles where username <> 'can') a, generate_series(1, 4) g`);
    const uid = await sql(`select id from public.profiles where username = 'can'`);
    const P = await newUser(browser, 'sira', { access_token: 'uid:' + uid, refresh_token: 'r', user: { id: uid } });
    await P.addInitScript(() => localStorage.setItem('roz:feedMode', JSON.stringify('foryou')));
    await P.goto(BASE + '/');
    await P.waitForSelector('nav');
    await wait(1500);
    await P.screenshot({ path: '/var/tmp/rozshots/sira.png' });
    await P.waitForSelector('article.post');
    await wait(800);
    const order = () => P.$$eval('article.post', (els) => els.map((e) => e.getAttribute('data-id')));
    const before = await order();
    console.log('akış:', before.length, 'gönderi');
    const second = P.locator('article.post').nth(1);
    await second.scrollIntoViewIfNeeded();
    await second.locator('button[aria-label="Beğen"], button[aria-label="Beğeniyi geri al"]').first().click();
    await wait(1200);
    const after = await order();
    if (JSON.stringify(before) !== JSON.stringify(after)) { console.log('FAIL: beğenince sıra değişti', before, after); code = 1; }
    else console.log('ok: beğenince akış yerinde kaldı');
  } catch (e) { console.log('HATA', e.message); code = 2; }
  await browser.close();
  process.exit(code);
})();
