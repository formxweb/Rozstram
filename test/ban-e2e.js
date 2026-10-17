// Banlama uçtan uca testi: node test/ban-e2e.js (test/restart.sh sonrası)
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const H = require('./helpers');
const { BASE, newUser, apiSignup, sql, top, text, gone, wait, nav, shot, ok } = H;

const openAdmin = async (P) => {
  await nav(P, 'Profil');
  await P.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
  await top(P).getByRole('button', { name: /Yönetici paneli/ }).click();
  await top(P).getByRole('tab', { name: 'Kullanıcılar' }).click();
};

(async () => {
  const browser = await chromium.launch();
  let code = 0;
  try {
    const t = Date.now().toString().slice(-5);
    const a = await apiSignup({ username: 'yonetici' + t, full_name: 'Yönetici', email: 'y' + t + '@mail.com', password: 'yonetici12' });
    const b = await apiSignup({ username: 'kuraldisi' + t, full_name: 'Kural Dışı', email: 'k' + t + '@mail.com', password: 'kuraldisi1' });
    const c = await apiSignup({ username: 'izleyen' + t, full_name: 'İzleyen', email: 'i' + t + '@mail.com', password: 'izleyen123' });
    const bName = 'kuraldisi' + t;
    await sql(`insert into public.app_admins (user_id) values ('${a.user.id}')`);
    await sql(`insert into public.posts (author, media, caption) values ('${b.user.id}', '[{"id":"x/p/1.jpg","type":"image","aspect":1}]', 'Kural dışı paylaşım ${t}')`);
    await sql(`insert into public.follows (follower, following, status) values ('${c.user.id}', '${b.user.id}', 'accepted'), ('${a.user.id}', '${b.user.id}', 'accepted')`);

    const C = await newUser(browser, 'izleyen', c);
    await C.goto(BASE + '/');
    await text(C, 'Kural dışı paylaşım ' + t);
    ok('bandan önce gönderi herkese görünüyor');

    const B = await newUser(browser, 'kuraldisi', b);
    await B.goto(BASE + '/');
    await B.waitForSelector('nav');

    // yönetici: gönderi menüsünde ban seçeneği
    const A = await newUser(browser, 'yonetici', a);
    await A.goto(BASE + '/');
    await text(A, 'Kural dışı paylaşım ' + t);
    await A.locator('article.post', { hasText: 'Kural dışı paylaşım ' + t }).locator('button[aria-label="Seçenekler"]').click();
    await text(A, 'Kullanıcıyı banla (Yönetici)');
    await A.getByText('Kullanıcıyı banla (Yönetici)').click();
    await A.locator('#ban-submit').waitFor();
    await text(A, '@' + bName);
    ok('gönderi menüsünden ban paneli açılıyor');
    await A.keyboard.press('Escape');
    await A.locator('.scrim').last().click({ position: { x: 20, y: 20 } }).catch(() => {});
    await wait(400);

    // yönetici paneli > Kullanıcılar > ara > banla
    await openAdmin(A);
    await A.fill('#adm-user-q', bName);
    const row = A.locator('.user-card', { hasText: bName });
    await row.waitFor();
    await row.getByRole('button', { name: 'Banla' }).click();
    await A.locator('.ban-sheet .chip', { hasText: 'Spam' }).click();
    await A.fill('#ban-note', 'Aynı reklamı 20 kez paylaştı');
    await A.locator('.ban-sheet .chip', { hasText: '7 gün' }).click();
    await shot(A, 'ban-paneli');
    await A.locator('#ban-submit').click();
    await text(A, '@' + bName + ' 7 gün banlandı');
    await row.getByRole('button', { name: 'Banı kaldır' }).waitFor();
    await text(A, 'Spam: Aynı reklamı 20 kez paylaştı');
    const dbBan = await sql(`select reason from public.user_bans where user_id = '${b.user.id}' and active and until > now() + interval '6 days'`);
    if (dbBan !== 'Spam: Aynı reklamı 20 kez paylaştı') throw new Error('ban kaydı yanlış: ' + dbBan);
    await shot(A, 'kullanicilar-banli');
    ok('yönetici panelinden 7 günlük ban verildi');

    // banlanan kişi: açık uygulama anında ban ekranına geçer
    await text(B, 'Hesabın geçici olarak askıya alındı', 12000);
    await text(B, 'Spam: Aynı reklamı 20 kez paylaştı');
    if (await B.locator('nav').count()) throw new Error('banlıyken uygulama menüsü görünüyor');
    await shot(B, 'ban-ekrani');
    ok('banlanan kişi anında ban ekranını gördü (neden ve süreyle)');
    const posted = await sql(`select count(*) from public.posts where author = '${b.user.id}'`);
    await B.reload();
    await text(B, 'Hesabın geçici olarak askıya alındı');
    ok('yeniden açınca da ban ekranı');
    await B.fill('#ban-appeal', 'Hesabımı kardeşim kullanmış, bir daha olmayacak.');
    await B.locator('#ban-appeal-send').click();
    await text(B, 'İtirazın alındı');
    await shot(B, 'itiraz-gonderildi');
    ok('banlı kişi itiraz etti');

    // başkaları: profil ve gönderi kayboldu
    await C.reload();
    await C.waitForSelector('nav');
    await wait(800);
    if (await C.getByText('Kural dışı paylaşım ' + t).count()) throw new Error('banlı kişinin gönderisi hâlâ görünüyor');
    await C.goto(BASE + '/@' + bName);
    await text(C, '@' + bName + ' bulunamadı');
    ok('banlı hesabın profili ve gönderisi başkalarına görünmüyor');

    // yönetici itirazı görür, kabul edip banı kaldırır
    await A.reload();
    await A.waitForSelector('nav');
    await openAdmin(A);
    const banned = A.locator('.user-card.is-banned', { hasText: bName });
    await banned.waitFor();
    await banned.getByText('Hesabımı kardeşim kullanmış').waitFor();
    if (!(await A.locator('.adm-tabs [role=tab]', { hasText: 'Kullanıcılar' }).locator('.dot').count())) throw new Error('itiraz rozeti yok');
    await shot(A, 'itiraz-yonetici');
    await banned.getByRole('button', { name: 'Kabul et, banı kaldır' }).click();
    await text(A, 'Ban kaldırıldı');
    await gone(A, 'Hesabımı kardeşim kullanmış');
    ok('yönetici itirazı gördü ve banı kaldırdı');

    // kişi uygulamaya geri döner
    await B.waitForSelector('nav', { timeout: 12000 });
    await gone(B, 'askıya alındı');
    ok('ban kalkınca kişi uygulamaya geri döndü');
    await C.reload();
    await text(C, 'Kural dışı paylaşım ' + t);
    ok('ban kalkınca gönderi yine görünüyor');
    if (Number(posted) !== 1) throw new Error('beklenmeyen gönderi sayısı');

    // profil menüsünden kalıcı ban + yazma engeli
    await A.goto(BASE + '/@' + bName);
    await top(A).locator('button[aria-label="Seçenekler"]').click();
    await A.getByText('Banla (Yönetici)').click();
    await A.locator('.ban-sheet .chip', { hasText: 'Kalıcı' }).click();
    await A.locator('#ban-submit').click();
    await text(A, 'kalıcı olarak banlandı');
    await text(A, 'Bu hesap banlı');
    ok('profil menüsünden kalıcı ban; profilde yöneticiye uyarı');
    await text(B, 'Hesabın askıya alındı', 12000);
    const tok = 'uid:' + b.user.id;
    const r = await fetch(BASE + '/mock/q', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ table: 'posts', op: 'insert', values: { author: b.user.id, media: [{ id: 'x/p/2.jpg', type: 'image' }], caption: 'yasak' } }) });
    const j = await r.json().catch(() => ({}));
    const n2 = await sql(`select count(*) from public.posts where caption = 'yasak'`);
    if (Number(n2) !== 0) throw new Error('banlı kişi sunucuya doğrudan paylaşım yapabildi ' + JSON.stringify(j));
    if (!/banned/.test(JSON.stringify(j))) throw new Error('beklenen ban hatası gelmedi: ' + JSON.stringify(j));
    ok('banlı kişi sunucuya doğrudan da paylaşım yapamıyor');
    await A.locator('.ban-note button', { hasText: 'Banı kaldır' }).click();
    await text(A, 'Ban kaldırıldı');
    await B.waitForSelector('nav', { timeout: 12000 });
    ok('profildeki uyarıdan ban kaldırıldı');
    console.log('\nTAMAM: banlama testleri');
  } catch (e) {
    console.log('HATA', e.message);
    code = 1;
    await H.failShots();
  }
  await browser.close();
  process.exit(code);
})();
