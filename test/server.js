// Rozstram yerel test sunucusu: gerçek Postgres şeması + RLS üzerinde Supabase'in küçük bir taklidi.
// Statik dosyalar (public/), REST benzeri sorgular, RPC, giriş, kayıt fonksiyonu, dosya depolama ve canlı güncellemeler.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Pool, lit } = require('./pgwire');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const STORE = process.env.STORE || '/var/tmp/rozstore';
const PORT = Number(process.env.PORT || 8787);
const pool = new Pool({ socket: '/var/tmp/rozpg/.s.PGSQL.5433', user: 'postgres', database: process.env.DB || 'roz' }, 8);
const RT_TABLES = ['profiles', 'follows', 'posts', 'post_likes', 'comments', 'comment_likes', 'stories', 'story_views', 'story_likes',
  'threads', 'thread_members', 'messages', 'message_reactions', 'notifications'];
const IDENT = /^[a-z_][a-z0-9_]*$/;
let COLS = {}, PKS = {}, FNS = {};
const log = (...a) => { if (process.env.VERBOSE) console.log(...a); };

async function loadCatalog() {
  COLS = await pool.one(`select jsonb_object_agg(table_name, cols) from (select table_name, jsonb_object_agg(column_name, udt_name) cols
    from information_schema.columns where table_schema = 'public' group by table_name) x`);
  PKS = await pool.one(`select jsonb_object_agg(c.conrelid::regclass::text, (select jsonb_agg(a.attname order by k.i) from unnest(c.conkey) with ordinality k(n, i)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n)) from pg_constraint c join pg_namespace ns on ns.oid = c.connamespace
    where ns.nspname = 'public' and c.contype = 'p'`);
  FNS = await pool.one(`select jsonb_object_agg(p.proname, jsonb_build_object('ret', format_type(p.prorettype, null),
    'args', coalesce((select jsonb_agg(jsonb_build_object('name', a.n, 'type', format_type(a.t, null)) order by a.i)
      from unnest(coalesce(p.proargnames, '{}'), p.proargtypes::oid[]) with ordinality a(n, t, i)), '[]'::jsonb)))
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public'`);
  // canlı güncelleme tetikleyicileri (sadece test ortamında)
  await pool.run(`create or replace function public.t_rt() returns trigger language plpgsql security definer as $$
    declare k jsonb := '{}'; r jsonb; i int;
    begin
      if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
      for i in 0 .. tg_nargs - 1 loop k := k || jsonb_build_object(tg_argv[i], r -> tg_argv[i]); end loop;
      perform pg_notify('rt', jsonb_build_object('table', tg_table_name, 'op', tg_op, 'pk', k)::text);
      return null;
    end $$`);
  for (const t of RT_TABLES) {
    const pk = (PKS['public.' + t] || PKS[t] || ['id']).map((x) => lit(x)).join(', ');
    await pool.run(`drop trigger if exists zz_rt on public.${t}; create trigger zz_rt after insert or update or delete on public.${t} for each row execute function public.t_rt(${pk})`);
  }
}
const pkOf = (t) => PKS['public.' + t] || PKS[t] || ['id'];

function val(v, udt) {
  if (v === null || v === undefined) return 'NULL';
  if (udt === 'jsonb' || udt === 'json') return lit(JSON.stringify(v)) + '::jsonb';
  if (udt && udt[0] === '_') return 'ARRAY[' + (v || []).map((x) => lit(x)).join(',') + ']::' + udt.slice(1) + '[]';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return lit(v) + (udt ? '::' + udt : '');
}
function argVal(v, type) {
  if (v === null || v === undefined) return 'NULL::' + type;
  if (type.endsWith('[]')) return 'ARRAY[' + (v || []).map((x) => lit(x)).join(',') + ']::' + type;
  if (type === 'jsonb' || type === 'json') return lit(JSON.stringify(v)) + '::jsonb';
  return lit(typeof v === 'object' ? JSON.stringify(v) : v) + '::' + type;
}
function auth(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer uid:([0-9a-f-]{36})$/);
  return m ? { role: 'authenticated', sub: m[1] } : { role: 'anon', sub: '' };
}
const pgErr = (e) => ({ code: e.code || 'XX000', message: e.message, details: e.detail || null, hint: e.hint || null });

async function handleQuery(b, who) {
  const t = b.table;
  if (!IDENT.test(t) || !COLS[t]) return { error: { code: '42P01', message: 'relation "public.' + t + '" does not exist' } };
  const cols = COLS[t];
  const where = (b.filters || []).map(([op, c, v]) => {
    if (!IDENT.test(c) || !cols[c]) throw Object.assign(new Error('column ' + c + ' does not exist'), { code: '42703' });
    if (op === 'eq') return c + ' = ' + val(v, cols[c]);
    if (op === 'neq') return c + ' <> ' + val(v, cols[c]);
    if (op === 'is') return c + ' is ' + (v === null ? 'null' : v ? 'true' : 'false');
    if (op === 'in') return c + ' in (' + (v.length ? v.map((x) => val(x, cols[c])).join(',') : 'NULL') + ')';
    throw new Error('op ' + op);
  });
  const W = where.length ? ' where ' + where.join(' and ') : '';
  let sql;
  const wantRows = !!b.select;
  if (b.op === 'select') {
    const sel = (typeof b.select === 'string' && b.select !== '*') ? b.select.split(',').map((s) => s.trim()).filter((s) => IDENT.test(s) && cols[s]).join(', ') : '*';
    const ord = (b.order || []).filter(([c]) => IDENT.test(c) && cols[c]).map(([c, asc]) => c + (asc ? ' asc' : ' desc')).join(', ');
    sql = `select coalesce(json_agg(x), '[]'::json) from (select ${sel} from public.${t}${W}${ord ? ' order by ' + ord : ''}${b.limit ? ' limit ' + Number(b.limit) : ''}) x`;
  } else if (b.op === 'insert' || b.op === 'upsert') {
    const rows = Array.isArray(b.values) ? b.values : [b.values];
    const names = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((c) => IDENT.test(c) && cols[c]);
    const vals = rows.map((r) => '(' + names.map((c) => (c in r ? val(r[c], cols[c]) : 'DEFAULT')).join(', ') + ')').join(', ');
    let conflict = '';
    if (b.op === 'upsert') {
      const oc = (b.onConflict || pkOf(t).join(',')).split(',').map((s) => s.trim()).filter((c) => IDENT.test(c));
      conflict = ' on conflict (' + oc.join(', ') + ') do ' + (b.ignoreDuplicates ? 'nothing' : 'update set ' + names.filter((c) => oc.indexOf(c) < 0).map((c) => c + ' = excluded.' + c).join(', '));
    }
    const ins = `insert into public.${t} (${names.join(', ')}) values ${vals}${conflict}`;
    sql = wantRows ? `with r as (${ins} returning *) select coalesce(json_agg(r), '[]'::json) from r` : ins;
  } else if (b.op === 'update') {
    const sets = Object.keys(b.values || {}).filter((c) => IDENT.test(c) && cols[c]).map((c) => c + ' = ' + val(b.values[c], cols[c]));
    const up = `update public.${t} set ${sets.join(', ')}${W}`;
    sql = wantRows ? `with r as (${up} returning *) select coalesce(json_agg(r), '[]'::json) from r` : up;
  } else if (b.op === 'delete') {
    const del = `delete from public.${t}${W}`;
    sql = wantRows ? `with r as (${del} returning *) select coalesce(json_agg(r), '[]'::json) from r` : del;
  } else return { error: { message: 'bad op' } };
  try {
    if (wantRows || b.op === 'select') {
      let data = await pool.one(sql, who.role, who.sub);
      if (b.single) data = data && data[0] !== undefined ? data[0] : null;
      return { data, error: null };
    }
    await pool.run(sql, who.role, who.sub);
    return { data: null, error: null };
  } catch (e) { return { data: null, error: pgErr(e) }; }
}

async function handleRpc(b, who) {
  const f = FNS[b.fn];
  if (!f) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + b.fn } };
  const args = b.args || {};
  const parts = f.args.filter((a) => a.name && a.name in args).map((a) => a.name + ' => ' + argVal(args[a.name], a.type));
  const call = 'public.' + b.fn + '(' + parts.join(', ') + ')';
  try {
    if (f.ret === 'void') { await pool.run('select ' + call, who.role, who.sub); return { data: null, error: null }; }
    const data = await pool.one('select to_jsonb(' + call + ')', who.role, who.sub);
    return { data, error: null };
  } catch (e) { return { data: null, error: pgErr(e) }; }
}

// kayıt fonksiyonu: supabase/functions/signup ile aynı mantık
async function handleSignup(b, ip) {
  const json = (status, body) => ({ status, body });
  const username = String(b.username || '').trim().toLowerCase();
  const fullName = String(b.full_name || '').trim().slice(0, 60);
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  const phone = b.phone ? String(b.phone).trim() : null;
  const password = String(b.password || '');
  if (!/^[a-z0-9._]{3,30}$/.test(username) || !/[a-z]/.test(username) || /^\.|\.$|\.\./.test(username)) return json(400, { error: 'username_invalid' });
  if (!email && !phone) return json(400, { error: 'contact_required' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'email_invalid' });
  if (phone && phone.replace(/\D/g, '').length < 10) return json(400, { error: 'phone_invalid' });
  if (password.length < 8) return json(400, { error: 'password_short' });
  if (password.length > 72) return json(400, { error: 'password_long' });
  if (!(await pool.one('select public.signup_rate_ok(' + lit(ip) + ')', 'service_role'))) return json(429, { error: 'rate_limited' });
  const chk = await pool.one(`select public.signup_check(${lit(username)}, ${lit(email)}, ${lit(phone)})`, 'service_role');
  if (chk !== 'ok') return json(409, { error: chk });
  const loginEmail = 'u' + require('crypto').randomUUID().replace(/-/g, '').slice(0, 24) + '@hesap.rozstram.app';
  const meta = { username, full_name: fullName, contact_email: email, contact_phone: phone };
  try {
    const id = await pool.one(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values (${lit(loginEmail)}, extensions.crypt(${lit(password)}, extensions.gen_salt('bf')), ${lit(JSON.stringify(meta))}::jsonb) returning id`);
    return json(200, { ok: true, login_email: loginEmail, user_id: id });
  } catch (e) {
    const again = await pool.one(`select public.signup_check(${lit(username)}, ${lit(email)}, ${lit(phone)})`, 'service_role');
    return json(409, { error: again !== 'ok' ? again : 'create_failed', detail: e.message });
  }
}

/* ------------------------------------------------------------------ canlı güncellemeler */
const clients = new Set();
const presence = {};
function sendPresence(topic) {
  const st = presence[topic] || {};
  const state = {};
  Object.keys(st).forEach((k) => { state[k] = [st[k]]; });
  clients.forEach((c) => { if (c.subs[topic]) c.send({ t: 'presence', topic, state }); });
}
async function fanout(payload) {
  let msg;
  try { msg = JSON.parse(payload); } catch (e) { return; }
  const { table, op, pk } = msg;
  const cond = Object.keys(pk).map((k) => k + ' = ' + val(pk[k], COLS[table][k])).join(' and ');
  let row = null;
  if (op !== 'DELETE') {
    row = await pool.one(`select to_jsonb(x) from public.${table} x where ${cond}`);
    if (!row) return;
  }
  for (const c of clients) {
    for (const topic of Object.keys(c.subs)) {
      const s = c.subs[topic];
      if (!s.tables || s.tables.indexOf(table) < 0) continue;
      if (op !== 'DELETE') {
        if (!s.sub) continue;
        let ok = false;
        try { ok = await pool.one(`select exists (select 1 from public.${table} where ${cond})`, 'authenticated', s.sub); } catch (e) { ok = false; }
        if (!ok) continue;
      }
      c.send({ t: 'change', topic, table, eventType: op, new: row || {}, old: op === 'DELETE' ? pk : {} });
    }
  }
}

/* ------------------------------------------------------------------ http */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const readBody = (req, limit) => new Promise((res, rej) => {
  const chunks = []; let n = 0;
  req.on('data', (d) => { n += d.length; if (n > limit) { rej(new Error('too_large')); req.destroy(); } else chunks.push(d); });
  req.on('end', () => res(Buffer.concat(chunks)));
  req.on('error', rej);
});
const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

function serveFile(req, res, file, type) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const range = req.headers.range;
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);
  try {
    if (req.method === 'POST' && p.indexOf('/mock/') === 0) {
      const who = auth(req);
      if (p === '/mock/storage/upload') {
        if (who.role !== 'authenticated') return sendJson(res, 401, { error: { message: 'unauthorized' } });
        const fp = u.searchParams.get('path');
        const type = req.headers['x-content-type'] || 'application/octet-stream';
        let body;
        try { body = await readBody(req, 50 * 1024 * 1024); } catch (e) { return sendJson(res, 413, { error: { message: 'The object exceeded the maximum allowed size', statusCode: '413' } }); }
        if (!/^(image|video|audio)\//.test(type)) return sendJson(res, 415, { error: { message: 'mime type ' + type + ' is not supported', statusCode: '415' } });
        try { await pool.run(`insert into storage.objects (bucket_id, name, owner) values ('media', ${lit(fp)}, ${lit(who.sub)})`, 'authenticated', who.sub); } catch (e) { return sendJson(res, 403, { error: { message: e.message, statusCode: '403' } }); }
        const dest = path.join(STORE, fp);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, body);
        fs.writeFileSync(dest + '.type', type);
        return sendJson(res, 200, { data: { path: fp }, error: null });
      }
      const b = JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString('utf8') || '{}');
      log(who.sub.slice(0, 4), p, JSON.stringify(b).slice(0, 160));
      if (p === '/mock/q') return sendJson(res, 200, await handleQuery(b, who));
      if (p === '/mock/rpc') return sendJson(res, 200, await handleRpc(b, who));
      if (p === '/mock/auth/login') {
        const id = await pool.one(`select id from auth.users where email = lower(${lit(b.email)}) and encrypted_password = extensions.crypt(${lit(b.password)}, encrypted_password)`);
        if (!id) return sendJson(res, 400, { error: { message: 'Invalid login credentials', status: 400 } });
        return sendJson(res, 200, { data: { session: { access_token: 'uid:' + id, refresh_token: 'r', user: { id } }, user: { id } }, error: null });
      }
      if (p === '/mock/auth/update') {
        if (who.role !== 'authenticated') return sendJson(res, 401, { error: { message: 'unauthorized' } });
        if (b.password) await pool.run(`update auth.users set encrypted_password = extensions.crypt(${lit(b.password)}, extensions.gen_salt('bf')) where id = ${lit(who.sub)}`);
        return sendJson(res, 200, { data: { user: { id: who.sub } }, error: null });
      }
      if (p === '/mock/functions/signup') {
        const r = await handleSignup(b, req.socket.remoteAddress + ':' + (req.headers['x-test-ip'] || ''));
        return sendJson(res, r.status, r.body);
      }
      if (p === '/mock/functions/delete-account') { // supabase/functions/delete-account ile aynı: dosyalar + auth.admin.deleteUser
        if (who.role !== 'authenticated' || !who.sub) return sendJson(res, 401, { error: 'not_authenticated' });
        const names = await pool.one(`with d as (delete from storage.objects where bucket_id = 'media' and name like ${lit(who.sub + '/%')} returning name) select coalesce(json_agg(name), '[]') from d`);
        (names || []).forEach((n) => { try { fs.unlinkSync(path.join(STORE, n)); fs.unlinkSync(path.join(STORE, n + '.type')); } catch (e) { /* yok */ } });
        await pool.run(`delete from auth.users where id = ${lit(who.sub)}`);
        return sendJson(res, 200, { ok: true });
      }
      if (p === '/mock/storage/remove') {
        const names = await pool.one(`with d as (delete from storage.objects where bucket_id = 'media' and name in (${(b.paths || []).map(lit).join(',') || 'NULL'}) returning name) select coalesce(json_agg(name), '[]') from d`, 'authenticated', who.sub).catch(() => []);
        (names || []).forEach((n) => { try { fs.unlinkSync(path.join(STORE, n)); fs.unlinkSync(path.join(STORE, n + '.type')); } catch (e) { /* yok */ } });
        return sendJson(res, 200, { data: (names || []).map((n) => ({ name: n })), error: null });
      }
      if (p === '/mock/storage/list') {
        const names = await pool.one(`select coalesce(json_agg(name), '[]') from storage.objects where bucket_id = 'media' and name like ${lit((b.prefix || '') + '/%')}`, 'authenticated', who.sub).catch(() => []);
        return sendJson(res, 200, { data: (names || []).map((n) => ({ name: n.slice((b.prefix || '').length + 1) })), error: null });
      }
      if (p === '/mock/sql') { // sadece testler için: postgres olarak sorgu
        try { return sendJson(res, 200, { data: await pool.one(b.sql) }); } catch (e) { return sendJson(res, 200, { error: pgErr(e) }); }
      }
      return sendJson(res, 404, { error: { message: 'no route' } });
    }
    if (p.indexOf('/storage/v1/object/public/media/') === 0) {
      const fp = path.join(STORE, p.slice('/storage/v1/object/public/media/'.length));
      let type = 'application/octet-stream';
      try { type = fs.readFileSync(fp + '.type', 'utf8'); } catch (e) { /* yok */ }
      return serveFile(req, res, fp, type);
    }
    if (p === '/mock-supabase.js') return serveFile(req, res, path.join(__dirname, 'mock-supabase.js'), TYPES['.js']);
    let file = path.join(PUB, p);
    if (!file.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUB, 'index.html');
    return serveFile(req, res, file, TYPES[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: { message: String(e.message || e) } });
  }
});

const wss = new WebSocketServer({ server, path: '/mock/rt' });
wss.on('connection', (ws) => {
  const c = { subs: {}, send: (m) => { try { ws.send(JSON.stringify(m)); } catch (e) { /* kapalı */ } } };
  clients.add(c);
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const sub = (m.token || '').replace(/^uid:/, '');
    if (m.t === 'join') {
      c.subs[m.topic] = { tables: m.tables || [], sub, key: m.presenceKey || null };
      c.send({ t: 'joined', topic: m.topic });
      if (m.presence) sendPresence(m.topic);
    } else if (m.t === 'track') {
      const s = c.subs[m.topic];
      if (!s) return;
      (presence[m.topic] = presence[m.topic] || {})[s.key || sub] = m.meta || {};
      sendPresence(m.topic);
    } else if (m.t === 'untrack') {
      const s = c.subs[m.topic];
      if (s && presence[m.topic]) { delete presence[m.topic][s.key || sub]; sendPresence(m.topic); }
    } else if (m.t === 'leave') {
      const s = c.subs[m.topic];
      delete c.subs[m.topic];
      if (s && presence[m.topic] && s.key) { delete presence[m.topic][s.key]; sendPresence(m.topic); }
    }
  });
  ws.on('close', () => {
    clients.delete(c);
    Object.keys(c.subs).forEach((topic) => { const s = c.subs[topic]; if (s.key && presence[topic]) { delete presence[topic][s.key]; sendPresence(topic); } });
  });
});

(async () => {
  await loadCatalog();
  let chain = Promise.resolve();
  await pool.listen('rt', (payload) => { chain = chain.then(() => fanout(payload)).catch((e) => console.error('fanout', e)); });
  server.listen(PORT, '127.0.0.1', () => console.log('test server http://127.0.0.1:' + PORT));
})().catch((e) => { console.error(e); process.exit(1); });
