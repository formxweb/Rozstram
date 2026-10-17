// supabase-js v2'nin uygulamanın kullandığı kısmını taklit eden istemci — sadece yerel testler için.
// Gerçek API ile aynı imzalar: createClient, auth, from().select/insert/update/delete/upsert, rpc, functions.invoke, storage, channel.

class Query {
  constructor(c, table) { this.c = c; this.b = { table, op: 'select', filters: [], order: [], select: null }; }
  select(cols) { if (this.b.op === 'select') this.b.select = cols || '*'; else this.b.select = cols || '*'; return this; }
  insert(values) { this.b.op = 'insert'; this.b.values = values; return this; }
  upsert(values, opts) { this.b.op = 'upsert'; this.b.values = values; this.b.onConflict = opts && opts.onConflict; this.b.ignoreDuplicates = !!(opts && opts.ignoreDuplicates); return this; }
  update(values) { this.b.op = 'update'; this.b.values = values; return this; }
  delete() { this.b.op = 'delete'; return this; }
  eq(c, v) { this.b.filters.push(['eq', c, v]); return this; }
  neq(c, v) { this.b.filters.push(['neq', c, v]); return this; }
  is(c, v) { this.b.filters.push(['is', c, v]); return this; }
  in(c, v) { this.b.filters.push(['in', c, v]); return this; }
  match(o) { Object.keys(o).forEach((k) => this.eq(k, o[k])); return this; }
  order(c, o) { this.b.order.push([c, !o || o.ascending !== false]); return this; }
  limit(n) { this.b.limit = n; return this; }
  single() { this.b.single = true; return this; }
  maybeSingle() { this.b.single = true; return this; }
  then(res, rej) {
    if (this.b.op === 'select' && !this.b.select) this.b.select = '*';
    return this.c._post('/mock/q', this.b).then(res, rej);
  }
}

class Channel {
  constructor(c, name, opts) {
    this.c = c; this.topic = 'realtime:' + name; this.name = name;
    this.pg = []; this.pres = []; this.state = {}; this.key = opts && opts.config && opts.config.presence && opts.config.presence.key;
    this.cb = null; this.joined = false;
  }
  on(type, filter, cb) {
    if (type === 'postgres_changes') this.pg.push({ filter, cb });
    else if (type === 'presence') this.pres.push({ event: filter.event, cb });
    return this;
  }
  subscribe(cb) {
    this.cb = cb;
    this.c._channels.add(this);
    this.c._ws().then(() => this._join());
    return this;
  }
  _join() {
    this.c._send({ t: 'join', topic: this.topic, token: this.c._token(), tables: this.pg.map((h) => h.filter.table), presenceKey: this.key || null, presence: this.pres.length > 0 });
  }
  _msg(m) {
    if (m.t === 'joined') { this.joined = true; if (this.cb) this.cb('SUBSCRIBED'); }
    else if (m.t === 'change') {
      this.pg.forEach((h) => {
        if (h.filter.table !== m.table) return;
        if (h.filter.event && h.filter.event !== '*' && h.filter.event !== m.eventType) return;
        h.cb({ schema: 'public', table: m.table, eventType: m.eventType, new: m.new, old: m.old, commit_timestamp: new Date().toISOString() });
      });
    } else if (m.t === 'presence') {
      this.state = m.state || {};
      this.pres.forEach((h) => { if (h.event === 'sync') h.cb(); });
    }
  }
  track(meta) { this.c._send({ t: 'track', topic: this.topic, token: this.c._token(), meta }); return Promise.resolve('ok'); }
  untrack() { this.c._send({ t: 'untrack', topic: this.topic, token: this.c._token() }); return Promise.resolve('ok'); }
  presenceState() { return this.state; }
  unsubscribe() { this.c._send({ t: 'leave', topic: this.topic }); this.c._channels.delete(this); if (this.cb) this.cb('CLOSED'); return Promise.resolve('ok'); }
}

class Client {
  constructor(url, key, opts) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.storageKey = (opts && opts.auth && opts.auth.storageKey) || 'sb-auth';
    try { this.session = JSON.parse(localStorage.getItem(this.storageKey) || 'null'); } catch (e) { this.session = null; }
    this._listeners = new Set();
    this._channels = new Set();
    this._socket = null;
    const self = this;
    this.auth = {
      getSession: async () => ({ data: { session: self.session }, error: null }),
      getUser: async () => ({ data: { user: self.session ? self.session.user : null }, error: null }),
      onAuthStateChange(cb) {
        self._listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => self._listeners.delete(cb) } } };
      },
      async signInWithPassword({ email, password }) {
        const r = await self._post('/mock/auth/login', { email, password });
        if (r.error) return { data: { session: null, user: null }, error: Object.assign(new Error(r.error.message), r.error) };
        self._setSession(r.data.session, 'SIGNED_IN');
        return { data: r.data, error: null };
      },
      async signOut() { self._setSession(null, 'SIGNED_OUT'); return { error: null }; },
      async updateUser(attrs) {
        const r = await self._post('/mock/auth/update', attrs);
        if (r.error) return { data: { user: null }, error: Object.assign(new Error(r.error.message), r.error) };
        self._emit('USER_UPDATED');
        return { data: r.data, error: null };
      },
    };
    this.functions = {
      async invoke(name, opts) {
        const res = await fetch(self.url + '/mock/functions/' + name, { method: 'POST', headers: self._headers(), body: JSON.stringify((opts && opts.body) || {}) });
        if (!res.ok) {
          const err = new Error('Edge Function returned a non-2xx status code');
          err.name = 'FunctionsHttpError';
          err.context = res;
          return { data: null, error: err };
        }
        return { data: await res.json(), error: null };
      },
    };
    this.storage = {
      from() {
        return {
          async upload(p, file, o) {
            const res = await fetch(self.url + '/mock/storage/upload?path=' + encodeURIComponent(p), {
              method: 'POST', headers: { Authorization: 'Bearer ' + self._token(), 'x-content-type': (o && o.contentType) || file.type || 'application/octet-stream' }, body: file,
            });
            const j = await res.json();
            return j.error ? { data: null, error: Object.assign(new Error(j.error.message), j.error) } : { data: j.data, error: null };
          },
          async remove(paths) { return self._post('/mock/storage/remove', { paths }); },
          async list(prefix) { return self._post('/mock/storage/list', { prefix }); },
          getPublicUrl(p) { return { data: { publicUrl: self.url + '/storage/v1/object/public/media/' + p } }; },
        };
      },
    };
  }
  _token() { return this.session ? this.session.access_token : ''; }
  _headers() { return { 'Content-Type': 'application/json', apikey: this.key, Authorization: 'Bearer ' + (this._token() || this.key) }; }
  _emit(ev) { this._listeners.forEach((cb) => { try { cb(ev, this.session); } catch (e) { console.error(e); } }); }
  _setSession(s, ev) {
    this.session = s;
    try { if (s) localStorage.setItem(this.storageKey, JSON.stringify(s)); else localStorage.removeItem(this.storageKey); } catch (e) { /* yok */ }
    setTimeout(() => this._emit(ev), 0);
  }
  async _post(p, body) {
    try {
      const res = await fetch(this.url + p, { method: 'POST', headers: this._headers(), body: JSON.stringify(body) });
      const j = await res.json();
      if (j.error) j.error = Object.assign(new Error(j.error.message), j.error);
      return { data: j.data === undefined ? null : j.data, error: j.error || null };
    } catch (e) { return { data: null, error: e }; }
  }
  from(t) { return new Query(this, t); }
  rpc(fn, args) { return this._post('/mock/rpc', { fn, args: args || {} }); }
  channel(name, opts) { return new Channel(this, name, opts); }
  removeChannel(ch) { return ch.unsubscribe(); }
  _send(m) { if (this._socket && this._socket.readyState === 1) this._socket.send(JSON.stringify(m)); }
  _ws() {
    if (this._wsp) return this._wsp;
    this._wsp = new Promise((res) => {
      const s = new WebSocket(this.url.replace(/^http/, 'ws') + '/mock/rt');
      this._socket = s;
      s.onopen = () => res();
      s.onmessage = (e) => { const m = JSON.parse(e.data); this._channels.forEach((ch) => { if (ch.topic === m.topic) ch._msg(m); }); };
      s.onclose = () => { this._wsp = null; this._channels.forEach((ch) => ch.cb && ch.cb('CLOSED')); };
    });
    return this._wsp;
  }
}

export function createClient(url, key, opts) { return new Client(url, key, opts); }
