// Rozstram uçtan uca test: iki (üç) gerçek kullanıcı, yerel sunucu, telefon ekranı
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8787';
const SHOTS = process.env.SHOTS || '/var/tmp/rozshots';
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const IMG = '/var/tmp/roztest/';
fs.mkdirSync(SHOTS, { recursive: true });
let step = 0;
const results = [];
const ok = (label) => { results.push('ok: ' + label); console.log('ok:', label); };

async function newUser(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', permissions: ['microphone'] });
  await ctx.route(/https:\/\/(cdn\.jsdelivr\.net|esm\.sh)\/.*supabase.*/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[' + name + '] PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[' + name + '] console.error', m.text().slice(0, 300)); });
  page.name = name;
  return page;
}
const shot = async (page, label) => { step++; await page.screenshot({ path: path.join(SHOTS, String(step).padStart(2, '0') + '-' + page.name + '-' + label + '.png') }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function sql(q) {
  const r = await fetch(BASE + '/mock/sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: q }) });
  return (await r.json()).data;
}
const top = (page) => page.locator('.page').last();
async function tap(page, sel, opts) { await page.locator(sel).filter({ visible: true }).first().click(opts); }
async function text(page, t, ms) { await page.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: ms || 8000 }); }

async function signup(page, { via, contact, name, pw, username }) {
  await page.goto(BASE + '/');
  await text(page, 'Kaydol');
  await page.getByRole('button', { name: 'Kaydol' }).click();
  if (via === 'email') await page.getByRole('tab', { name: 'E-posta' }).click();
  await page.fill(via === 'email' ? '#su-email' : '#su-phone', contact);
  await shot(page, 'kayit-1-iletisim');
  await page.getByRole('button', { name: 'İleri' }).click();
  await page.fill('#su-name', name);
  await page.fill('#su-pw', pw);
  await shot(page, 'kayit-2-ad-sifre');
  await page.getByRole('button', { name: 'İleri' }).click();
  await page.waitForSelector('#su-user');
  if (username) { await page.fill('#su-user', ''); await page.fill('#su-user', username); }
  await page.waitForSelector('.auth-input.uname.good, .auth-input.uname.bad', { timeout: 8000 });
  await shot(page, 'kayit-3-kullanici-adi');
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const A = await newUser(browser, 'ali');
  const B = await newUser(browser, 'ayse');

  /* ---------------------------------------------------------- kayıt: Ali (telefon) */
  await signup(A, { via: 'phone', contact: '0532 111 22 33', name: 'Ali Veli', pw: 'sifre1234' });
  const sug = await A.inputValue('#su-user');
  if (!/^ali/.test(sug)) throw new Error('öneri beklenmedik: ' + sug);
  ok('kullanıcı adı önerisi: ' + sug);
  await A.getByRole('button', { name: 'İleri' }).click();
  await A.check('#su-age');
  await shot(A, 'kayit-4-onay');
  await A.getByRole('button', { name: 'Kaydol' }).click();
  await text(A, 'Hoş geldin, @' + sug);
  await shot(A, 'onboarding-1');
  await A.setInputFiles('#ob-file', IMG + 'avatar.jpg');
  await A.fill('#ob-bio', 'Web siteleri yapıyorum 🚀');
  await A.getByRole('button', { name: 'Kaydet ve devam et' }).click();
  await text(A, 'Takip edeceğin kişileri bul');
  await shot(A, 'onboarding-2');
  await A.getByRole('button', { name: 'İleri' }).click();
  await A.getByRole('button', { name: 'Rozstram’a başla' }).click();
  await text(A, 'Rozstram’a hoş geldin');
  await shot(A, 'ana-sayfa-bos');
  ok('Ali telefonla kaydoldu, profil fotoğrafı yüklendi');

  /* ---------------------------------------------------------- kayıt: Ayşe (e-posta), alınmış ad denemesi */
  await signup(B, { via: 'email', contact: 'ayse@mail.com', name: 'Ayşe Yılmaz', pw: 'guclu-sifre', username: sug });
  if (!(await B.locator('.auth-input.uname.bad').count())) throw new Error('alınmış ad uyarısı yok');
  await shot(B, 'alinmis-ad');
  ok('alınmış kullanıcı adı reddedildi');
  await B.fill('#su-user', 'ayse');
  await B.waitForSelector('.auth-input.uname.good');
  await B.getByRole('button', { name: 'İleri' }).click();
  await B.check('#su-age');
  await B.getByRole('button', { name: 'Kaydol' }).click();
  await text(B, 'Hoş geldin, @ayse');
  await B.getByRole('button', { name: 'Şimdilik atla' }).click();
  await text(B, 'Takip edeceğin kişileri bul');
  await text(B, sug);
  await shot(B, 'onboarding-oneriler');
  await B.getByRole('button', { name: 'İleri' }).click();
  await B.getByRole('button', { name: 'Rozstram’a başla' }).click();
  ok('Ayşe e-postayla kaydoldu');

  /* ---------------------------------------------------------- Ayşe hesabını gizli yapar */
  await B.locator('nav button[aria-label="Profil"]').click();
  await B.locator('button[aria-label="Ayarlar"]').click();
  await text(B, 'Gizli hesap');
  await B.click('#set-private');
  await wait(400);
  await shot(B, 'ayarlar-gizli');
  const priv = await sql(`select is_private from public.profiles where username = 'ayse'`);
  if (priv !== true) throw new Error('gizli hesap kaydedilmedi');
  ok('Ayşe hesabını gizli yaptı');
  await top(B).locator('header button[aria-label=\"Geri\"]').first().click();
  await wait(300);

  /* ---------------------------------------------------------- Ali Ayşe'yi arar, istek gönderir */
  await A.locator('nav button[aria-label="Keşfet"]').click();
  await A.fill('#explore-q', 'ayse');
  await text(A, 'Ayşe Yılmaz');
  await shot(A, 'arama');
  await A.locator('.person .row-main').filter({ visible: true }).first().click();
  await text(A, 'Bu hesap gizli');
  await top(A).getByRole('button', { name: 'Takip et' }).first().click();
  await text(A, 'İstek gönderildi');
  await shot(A, 'gizli-profil-istek');
  ok('gizli hesaba takip isteği gönderildi');

  /* ---------------------------------------------------------- Ayşe isteği kabul eder (canlı) */
  await B.locator('nav button[aria-label="Ana sayfa"]').click();
  await B.waitForSelector('button[aria-label="Bildirimler"] .dot', { timeout: 8000 });
  await B.locator('button[aria-label="Bildirimler"]').click();
  await text(B, 'Takip istekleri');
  await shot(B, 'bildirim-istek');
  await B.locator('.req-row').click();
  await top(B).getByRole('button', { name: 'Onayla' }).click();
  await wait(600);
  ok('Ayşe isteği canlı gördü ve onayladı');
  await text(A, 'Takip ediliyor');
  await shot(A, 'istek-kabul-edildi');
  ok('Ali kabulü canlı gördü');

  /* ---------------------------------------------------------- Ayşe gönderi paylaşır (etiket + bahsetme) */
  await top(B).locator('header button[aria-label=\"Geri\"]').first().click();
  await wait(300);
  await top(B).locator('header button[aria-label=\"Geri\"]').first().click();
  await wait(300);
  await B.locator('nav button[aria-label="Oluştur"]').click();
  await B.setInputFiles('#create-file', [IMG + 'p1.jpg', IMG + 'p2.jpg']);
  await text(B, 'Filtre');
  await B.getByRole('button', { name: 'Canlı' }).click();
  await shot(B, 'olustur-filtre');
  await B.getByRole('button', { name: 'İleri' }).click();
  await B.fill('#create-caption', 'İlk gönderim! @' + sug + ' #rozstram');
  await B.fill('#create-loc', 'Kadıköy');
  await B.getByRole('button', { name: 'Kişileri etiketle' }).click();
  await B.locator('.sheet .person .row-main').filter({ visible: true }).first().click();
  await B.getByRole('button', { name: /Bitti/ }).click();
  await shot(B, 'olustur-detay');
  await B.locator('.btn.grad.block.big', { hasText: 'Paylaş' }).click();
  await text(B, 'İlk gönderim');
  await shot(B, 'gonderi-paylasildi');
  ok('Ayşe 2 fotoğraflı gönderi paylaştı');

  /* ---------------------------------------------------------- Ali akışında görür, beğenir, yorum yapar */
  await A.locator('nav button[aria-label="Ana sayfa"]').click();
  await text(A, 'İlk gönderim');
  ok('gönderi Ali’nin akışına canlı düştü');
  await A.locator('article.post .media').filter({ visible: true }).first().dblclick();
  await wait(700);
  await shot(A, 'cift-dokun-begen');
  const likes = await sql(`select count(*) from public.post_likes`);
  if (Number(likes) !== 1) throw new Error('beğeni kaydedilmedi: ' + likes);
  ok('çift dokunuşla beğeni kaydedildi');
  await A.locator('article.post .ph').filter({ visible: true }).first().click();
  await A.fill('#comment-input', 'Harika olmuş! 😍');
  await A.getByRole('button', { name: 'Paylaş' }).click();
  await text(A, 'Harika olmuş');
  await shot(A, 'yorum');
  await A.locator('.sheet-drag').filter({ visible: true }).first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await A.keyboard.press('Escape');
  await A.locator('.scrim').filter({ visible: true }).first().click({ position: { x: 10, y: 10 } }).catch(() => {});
  await wait(400);
  ok('yorum yapıldı');

  /* ---------------------------------------------------------- Ayşe bildirimleri görür */
  await B.locator('nav button[aria-label="Ana sayfa"]').click();
  await B.waitForSelector('button[aria-label="Bildirimler"] .dot', { timeout: 8000 });
  await B.locator('button[aria-label="Bildirimler"]').click();
  await text(B, 'gönderini beğendi');
  await text(B, 'yorum yaptı');
  await shot(B, 'bildirimler');
  ok('Ayşe beğeni ve yorum bildirimlerini aldı');
  await top(B).locator('header button[aria-label=\"Geri\"]').first().click();
  await wait(300);

  /* ---------------------------------------------------------- mesaj: Ali → Ayşe (Ayşe Ali'yi takip etmiyor → istek) */
  await A.locator('article.post .who .uname').filter({ visible: true }).first().click();
  await text(A, 'Ayşe Yılmaz');
  await top(A).getByRole('button', { name: 'Mesaj', exact: true }).click();
  await A.waitForSelector('#chat-input');
  await A.fill('#chat-input', 'Selam Ayşe, gönderin çok güzel!');
  await top(A).getByRole('button', { name: 'Gönder', exact: true }).click();
  await text(A, 'Selam Ayşe');
  await shot(A, 'mesaj-gonderildi');
  ok('Ali mesaj gönderdi');
  await B.waitForSelector('button[aria-label="Mesajlar"] .badge, button[aria-label="Mesajlar"]', { timeout: 8000 });
  await B.locator('button[aria-label="Mesajlar"]').click();
  await top(B).getByRole('button', { name: /İstekler/ }).click();
  await text(B, 'Selam Ayşe');
  await shot(B, 'mesaj-istekleri');
  await B.locator('.inbox-row').filter({ visible: true }).first().click();
  await text(B, 'sana mesaj göndermek istiyor');
  await shot(B, 'mesaj-istegi');
  await top(B).getByRole('button', { name: 'Kabul et' }).click();
  await B.waitForSelector('#chat-input');
  ok('mesaj isteği gösterildi ve kabul edildi');
  await B.fill('#chat-input', 'Teşekkürler 😊');
  await wait(500);
  await shot(A, 'yaziyor');
  const typingSeen = await A.locator('.typing').count();
  await top(B).getByRole('button', { name: 'Gönder', exact: true }).click();
  await text(A, 'Teşekkürler');
  ok('Ayşe’nin yanıtı canlı geldi' + (typingSeen ? ' (yazıyor… da göründü)' : ''));
  await top(A).locator('.bubble', { hasText: 'Teşekkürler' }).dblclick();
  await wait(700);
  await shot(B, 'tepki');
  await text(B, 'Görüldü');
  ok('çift dokunuşla kalp tepkisi + görüldü');

  /* ---------------------------------------------------------- sesli mesaj */
  await top(A).locator('button[aria-label="Sesli mesaj kaydet"]').click();
  await text(A, 'Kaydediliyor');
  await wait(1800);
  await shot(A, 'ses-kaydi');
  await top(A).locator('button.rec-send').click();
  await A.waitForSelector('.voice', { timeout: 10000 });
  await B.waitForSelector('.voice', { timeout: 10000 });
  await shot(B, 'sesli-mesaj');
  ok('sesli mesaj gönderildi ve alındı');

  /* ---------------------------------------------------------- hikaye (yazı) + görüntüleyen */
  await top(A).locator('header button[aria-label=\"Geri\"]').first().click();
  await wait(300);
  await top(A).locator('header button[aria-label=\"Geri\"]').first().click();
  await wait(300);
  await A.locator('nav button[aria-label="Ana sayfa"]').click();
  await A.locator('.stories .story-chip button.plus').click();
  await A.getByRole('button', { name: 'Yazı' }).click();
  await A.fill('#story-text', 'Rozstram yayında! 🎉');
  await shot(A, 'hikaye-yazi');
  await A.locator('.se-share', { hasText: 'Hikayen' }).click();
  await wait(1200);
  await top(B).locator('header button[aria-label=\"Geri\"]').first().click().catch(() => {});
  await wait(300);
  await top(B).locator('header button[aria-label=\"Geri\"]').first().click().catch(() => {});
  await wait(300);
  await B.locator('nav button[aria-label="Ana sayfa"]').click();
  await B.waitForSelector('.stories .story-chip:nth-child(2)', { timeout: 8000 });
  await shot(B, 'hikaye-halkasi');
  await B.locator('.stories .story-chip').nth(1).click();
  await text(B, 'Rozstram yayında');
  await wait(800);
  await shot(B, 'hikaye-izleme');
  await B.locator('.story button[aria-label="Kapat"]').click();
  await wait(600);
  const views = await sql(`select count(*) from public.story_views`);
  if (Number(views) < 1) throw new Error('hikaye görüntüleme kaydedilmedi');
  ok('hikaye paylaşıldı ve görüntülendi');

  /* ---------------------------------------------------------- reels videosu */
  await A.locator('nav button[aria-label="Oluştur"]').click();
  await top(A).getByRole('button', { name: 'REELS', exact: true }).click();
  await A.setInputFiles('#create-file', IMG + 'reel.webm');
  await text(A, 'Filtre');
  await A.getByRole('button', { name: 'İleri' }).click();
  await A.fill('#create-caption', 'İlk Reels #deneme');
  await A.locator('.btn.grad.block.big', { hasText: 'Paylaş' }).click();
  await A.waitForSelector('.reel video', { timeout: 15000 });
  await wait(800);
  await shot(A, 'reels');
  ok('Reels videosu yüklendi');

  fs.writeFileSync(path.join(SHOTS, 'results.txt'), results.join('\n'));
  console.log('\nTAMAM:', results.length, 'adım');
  await browser.close();
})().catch(async (e) => { console.error('HATA:', e.message); fs.writeFileSync(path.join(SHOTS, 'results.txt'), results.join('\n') + '\nHATA: ' + e.message); process.exit(1); });
