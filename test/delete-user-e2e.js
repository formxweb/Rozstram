// Yönetici panelinden hesap silme uçtan uca testi: node test/delete-user-e2e.js (test/restart.sh sonrası)
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const H = require('./helpers');
const { BASE, newUser, apiSignup, sql, top, text, gone, wait, nav, shot, ok } = H;

const openUsers = async (P) => {
  await nav(P, 'Profil');
  await P.locator('button[aria-label="Ayarlar"]').filter({ visible: true }).click();
  await top(P).getByRole('button', { name: /Yönetici paneli/ }).click();
  await top(P).getByRole('tab', { name: 'Kullanıcılar' }).click();
};
const call = async (session, body) => {
  const r = await fetch(BASE + '/mock/functions/admin-delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

(async () => {
  const browser = await chromium.launch();
  let code = 0;
  try {
    const t = Date.now().toString().slice(-5);
    const a = await apiSignup({ username: 'yonet' + t, full_name: 'Yönetici', email: 'yo' + t + '@mail.com', password: 'yonetici12' });
    const d = await apiSignup({ username: 'silinecek' + t, full_name: 'Silinecek', email: 'si' + t + '@mail.com', password: 'silinecek1' });
    const e = await apiSignup({ username: 'kilitli' + t, full_name: 'Kilitli Ad', email: 'ki' + t + '@mail.com', password: 'kilitli123' });
    const n = await apiSignup({ username: 'normal' + t, full_name: 'Normal', email: 'no' + t + '@mail.com', password: 'normal1234' });
    const dName = 'silinecek' + t, eName = 'kilitli' + t;
    await sql(`insert into public.app_admins (user_id) values ('${a.user.id}')`);
    await sql(`insert into public.posts (author, media, caption) values ('${d.user.id}', '[{"id":"${d.user.id}/p/1.jpg","type":"image","aspect":1}]', 'Silinecek gönderi ${t}')`);
    await sql(`insert into storage.objects (bucket_id, name, owner) values ('media', '${d.user.id}/p/1.jpg', '${d.user.id}'), ('media', '${d.user.id}/i/snap.jpg', '${d.user.id}')`);

    // yetkisiz çağrılar
    let r = await call(n, { user_id: d.user.id });
    if (r.status !== 403 || r.body.error !== 'not_admin') throw new Error('normal üye silebildi: ' + JSON.stringify(r));
    r = await call(a, { user_id: a.user.id });
    if (r.body.error !== 'self_delete') throw new Error('yönetici kendini panelden sildi');
    ok('normal üye hesap silemiyor, yönetici kendini panelden silemiyor');

    const A = await newUser(browser, 'yonetici', a);
    await A.goto(BASE + '/');
    await text(A, 'Silinecek gönderi ' + t);
    await openUsers(A);
    await A.fill('#adm-user-q', dName);
    const row = A.locator('.user-card[data-user="' + dName + '"]');
    await row.waitFor();
    await row.getByRole('button', { name: '@' + dName + ' hesabını sil' }).click();
    await text(A, 'kalıcı olarak');
    await A.fill('#del-confirm', 'yanlis');
    if (!(await A.locator('#del-submit').isDisabled())) throw new Error('yanlış adla silme açık');
    await A.fill('#del-confirm', dName);
    await A.locator('#del-free').click();
    await text(A, 'yeniden alabilir');
    await shot(A, 'hesap-sil-onay');
    await A.locator('#del-submit').click();
    await text(A, '@' + dName + ' silindi');
    await row.waitFor({ state: 'detached' });
    const left = await sql(`select (select count(*) from public.profiles where id = '${d.user.id}') + (select count(*) from public.posts where author = '${d.user.id}') + (select count(*) from storage.objects where name like '${d.user.id}/%') + (select count(*) from public.usernames where name = '${dName}')`);
    if (String(left) !== '0') throw new Error('silinen hesaptan kalan: ' + left);
    ok('yönetici hesabı sildi: profil, gönderi, dosyalar (şipşak dahil) gitti, ad serbest');
    await nav(A, 'Ana sayfa');
    await gone(A, 'Silinecek gönderi ' + t);
    ok('silinen hesabın gönderisi akıştan da kalktı');

    // ad kilitli kalsın (varsayılan)
    await openUsers(A);
    await A.fill('#adm-user-q', eName);
    const row2 = A.locator('.user-card[data-user="' + eName + '"]');
    await row2.waitFor();
    await row2.getByRole('button', { name: '@' + eName + ' hesabını sil' }).click();
    await A.fill('#del-confirm', '@' + eName);
    await A.locator('#del-submit').click();
    await text(A, '@' + eName + ' silindi');
    const locked = await sql(`select count(*) from public.usernames where name = '${eName}' and user_id is null`);
    if (String(locked) !== '1') throw new Error('ad kilitli kalmadı');
    const again = await fetch(BASE + '/mock/functions/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-ip': 'x' + t }, body: JSON.stringify({ username: eName, full_name: 'X', email: 'x' + t + '@mail.com', password: 'xxxxxxxx1', birth_year: 1995 }) }).then((x) => x.json());
    if (again.ok) throw new Error('kilitli ad yeniden alındı');
    const reuse = await fetch(BASE + '/mock/functions/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-ip': 'y' + t }, body: JSON.stringify({ username: dName, full_name: 'Y', email: 'y' + t + '@mail.com', password: 'yyyyyyyy1', birth_year: 1995 }) }).then((x) => x.json());
    if (!reuse.ok) throw new Error('serbest bırakılan ad alınamadı: ' + JSON.stringify(reuse));
    ok('varsayılan: ad kilitli kalıyor; serbest bırakılan ad yeniden alınabiliyor');

    // yönetici satırında silme yok
    await A.fill('#adm-user-q', 'yonet' + t);
    await A.locator('.user-card[data-user="yonet' + t + '"]').waitFor();
    if (await A.locator('.user-card[data-user="yonet' + t + '"] button[title="Hesabı sil"]').count()) throw new Error('yönetici satırında silme var');
    ok('yönetici hesaplarında silme düğmesi yok');
    console.log('\nTAMAM: hesap silme testleri');
  } catch (err) {
    console.log('HATA', err.message);
    await H.failShots();
    code = 1;
  }
  await browser.close();
  process.exit(code);
})();
