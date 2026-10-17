// Postgres'e (trust auth, unix soket) basit sorgu protokolüyle bağlanan küçük istemci — sadece test için
const net = require('net');

class PgConn {
  constructor(opts) {
    this.opts = opts;
    this.buf = Buffer.alloc(0);
    this.queue = [];
    this.cur = null;
    this.onNotify = null;
    this.ready = new Promise((res, rej) => { this._readyRes = res; this._readyRej = rej; });
    const sock = net.createConnection(opts.socket);
    this.sock = sock;
    sock.on('connect', () => {
      const params = Buffer.from('user\0' + opts.user + '\0database\0' + opts.database + '\0client_encoding\0UTF8\0\0', 'utf8');
      const head = Buffer.alloc(8);
      head.writeInt32BE(8 + params.length, 0);
      head.writeInt32BE(196608, 4);
      sock.write(Buffer.concat([head, params]));
    });
    sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this._parse(); });
    sock.on('error', (e) => { this._readyRej(e); if (this.cur) this.cur.rej(e); });
  }
  _parse() {
    while (this.buf.length >= 5) {
      const type = String.fromCharCode(this.buf[0]);
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < 1 + len) return;
      const body = this.buf.subarray(5, 1 + len);
      this.buf = this.buf.subarray(1 + len);
      this._msg(type, body);
    }
  }
  _msg(type, b) {
    const c = this.cur;
    if (type === 'R') { if (b.readInt32BE(0) !== 0) this._readyRej(new Error('auth not supported')); return; }
    if (type === 'Z') {
      if (!this.started) { this.started = true; this._readyRes(); return; }
      if (c) { this.cur = null; c.status = String.fromCharCode(b[0]); if (c.error) c.rej(c.error); else c.res(c.results); this._next(); }
      return;
    }
    if (type === 'A') {
      let o = 4;
      const ch = b.toString('utf8', o, b.indexOf(0, o)); o = b.indexOf(0, o) + 1;
      const payload = b.toString('utf8', o, b.indexOf(0, o));
      if (this.onNotify) this.onNotify(ch, payload);
      return;
    }
    if (!c) return;
    if (type === 'T') {
      const n = b.readInt16BE(0); let o = 2; const fields = [];
      for (let i = 0; i < n; i++) { const e = b.indexOf(0, o); const name = b.toString('utf8', o, e); o = e + 1; const oid = b.readInt32BE(o + 6); o += 18; fields.push({ name, oid }); }
      c.curRes = { fields, rows: [] };
    } else if (type === 'D') {
      const n = b.readInt16BE(0); let o = 2; const row = [];
      for (let i = 0; i < n; i++) { const l = b.readInt32BE(o); o += 4; if (l < 0) row.push(null); else { row.push(b.toString('utf8', o, o + l)); o += l; } }
      c.curRes.rows.push(row);
    } else if (type === 'C') {
      if (c.curRes) { c.results.push(c.curRes); c.curRes = null; }
    } else if (type === 'E') {
      const f = {}; let o = 0;
      while (o < b.length && b[o] !== 0) { const k = String.fromCharCode(b[o]); const e = b.indexOf(0, o + 1); f[k] = b.toString('utf8', o + 1, e); o = e + 1; }
      if (!c.error) { c.error = new Error(f.M); c.error.code = f.C; c.error.detail = f.D; c.error.hint = f.H; }
    }
  }
  query(sql) {
    return this.ready.then(() => new Promise((res, rej) => { this.queue.push({ sql, res, rej, results: [] }); if (!this.cur) this._next(); }));
  }
  _next() {
    const q = this.queue.shift();
    if (!q) return;
    this.cur = q;
    const s = Buffer.from(q.sql + '\0', 'utf8');
    const head = Buffer.alloc(5); head.write('Q', 0); head.writeInt32BE(4 + s.length, 1);
    this.sock.write(Buffer.concat([head, s]));
  }
}

const lit = (v) => (v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'");

class Pool {
  constructor(opts, n) { this.conns = Array.from({ length: n }, () => new PgConn(opts)); this.i = 0; this.opts = opts; }
  /** role: 'postgres' | 'anon' | 'authenticated' | 'service_role'; sub: kullanıcı kimliği */
  async run(sql, role, sub) {
    const c = this.conns[this.i++ % this.conns.length];
    const pre = role && role !== 'postgres'
      ? 'BEGIN; SET LOCAL ROLE ' + role + '; SELECT set_config(\'request.jwt.claim.sub\', ' + lit(sub || '') + ', true); '
      : 'BEGIN; SELECT set_config(\'request.jwt.claim.sub\', ' + lit(sub || '') + ', true); ';
    try {
      const results = await c.query(pre + sql + '; COMMIT;');
      const sets = results.filter((r) => r.fields && r.fields.length);
      return sets[sets.length - 1] || { fields: [], rows: [] };
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    }
  }
  async one(sql, role, sub) {
    const r = await this.run(sql, role, sub);
    if (!r.rows.length) return null;
    const v = r.rows[0][0];
    const oid = r.fields[0].oid;
    if (v === null) return null;
    if (oid === 114 || oid === 3802) return JSON.parse(v);
    if (oid === 16) return v === 't';
    if (oid === 20 || oid === 21 || oid === 23 || oid === 700 || oid === 701 || oid === 1700) return Number(v);
    return v;
  }
  listen(channel, cb) {
    const c = new PgConn(this.opts);
    c.onNotify = (ch, payload) => { if (ch === channel) cb(payload); };
    return c.query('LISTEN ' + channel);
  }
}

module.exports = { Pool, lit };
