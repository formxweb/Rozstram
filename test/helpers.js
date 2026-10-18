// Ortak test yardımcıları
const fs = require('fs');
const path = require('path');
const BASE = 'http://127.0.0.1:8787';
const SHOTS = process.env.SHOTS || '/var/tmp/rozshots';
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const IMG = '/var/tmp/roztest/';
fs.mkdirSync(SHOTS, { recursive: true });
let step = Number(process.env.STEP0 || 0);
const pages = [];
async function failShots() { for (const p of pages) { try { await p.screenshot({ path: path.join(SHOTS, 'FAIL-' + p.name + '.png') }); } catch (e) { /* yok */ } } }
const results = [];
const ok = (label) => { results.push('ok: ' + label); console.log('ok:', label); };
async function newUser(browser, name, session) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', permissions: ['microphone'] });
  await ctx.route(/https:\/\/(cdn\.jsdelivr\.net|esm\.sh)\/.*supabase.*/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: MOCK }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (session) await ctx.addInitScript((s) => { if (!localStorage.getItem('rozstram-auth')) localStorage.setItem('rozstram-auth', s); }, JSON.stringify(session));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[' + name + '] PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) console.log('[' + name + '] console.error', m.text().slice(0, 300)); });
  page.name = name;
  pages.push(page);
  return page;
}
const shot = async (page, label) => { step++; await page.screenshot({ path: path.join(SHOTS, String(step).padStart(2, '0') + '-' + page.name + '-' + label + '.png') }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function sql(q) {
  const r = await fetch(BASE + '/mock/sql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql: q }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.data;
}
async function apiSignup(body, ip) {
  body = { birth_year: 1995, ...body };
  const r = await fetch(BASE + '/mock/functions/signup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-ip': ip || String(Math.random()) }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error('signup: ' + JSON.stringify(j));
  return { access_token: 'uid:' + j.user_id, refresh_token: 'r', user: { id: j.user_id } };
}
const top = (page) => page.locator('.page').last();
const text = async (page, t, ms) => { await page.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: ms || 8000 }); };
const gone = async (page, t, ms) => { await page.getByText(t, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'detached', timeout: ms || 8000 }).catch(async () => { if (await page.getByText(t, { exact: false }).filter({ visible: true }).count()) throw new Error('hala görünüyor: ' + t); }); };
const back = async (page) => { await top(page).locator('header button[aria-label="Geri"]').first().click(); await wait(320); };
const nav = async (page, label) => { await page.locator('nav button[aria-label="' + label + '"]').click(); await wait(250); };
module.exports = { pages, failShots, BASE, SHOTS, IMG, ok, results, newUser, shot, wait, sql, apiSignup, top, text, gone, back, nav };
