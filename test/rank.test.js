// Akış algoritması birim testleri: node test/rank.test.js
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const out = '/var/tmp/rank.test.bundle.js';
execFileSync('/opt/npm-tools/node_modules/.bin/esbuild', [path.join(__dirname, '../src/rank.js'), '--bundle', '--format=cjs', '--platform=node', '--outfile=' + out, '--log-level=error']);
const { interestModel, scorePost, rankPosts, rankWeights } = require(out);
fs.unlinkSync(out);

let n = 0;
const ok = (cond, label) => { if (!cond) { console.log('FAIL:', label); process.exit(1); } n++; console.log('ok:', label); };
const H = 36e5;
const now = Date.now();
const me = 'me';
const post = (id, author, o) => ({ id, author, at: now - (o.age || 1) * H, caption: o.caption || '', media: [{ type: o.video ? 'video' : 'image' }], likes: o.likes || {}, views: o.views || 0 });
const likes = (k) => { const m = {}; for (let i = 0; i < k; i++) m['u' + i] = 1; return m; };
const ctxBase = { me, now, commentCount: {}, followerCount: () => 10, viewed: {}, following: new Set() };
const rankWith = (posts, model, ctx) => rankPosts(posts, (p) => scorePost(p, model, { ...ctxBase, ...ctx })).map((p) => p.id);

// 1) Etkileştiğin hesabın gönderisi, eşit başarıdaki yabancı gönderinin önüne geçer
{
  const old = [post('o1', 'ayse', { likes: { me: 1 }, age: 50 }), post('o2', 'ayse', { likes: { me: 1 }, age: 60 })];
  const a = post('a', 'ayse', { likes: likes(3) });
  const b = post('b', 'yabanci', { likes: likes(3) });
  const m = interestModel({ me, posts: old.concat([a, b]), comments: [], saved: {}, viewed: {}, hidden: {}, following: [], closeFriends: [], followsMe: [], dmPartners: [] });
  ok(rankWith([b, a], m)[0] === 'a', 'beğendiğin kişinin yeni gönderisi önde');
}
// 2) Takip ettiğin kişi öne çıkar
{
  const a = post('a', 'takip', {}); const b = post('b', 'diger', {});
  const m = interestModel({ me, posts: [a, b], following: ['takip'] });
  ok(rankWith([b, a], m)[0] === 'a', 'takip ettiğin kişi önde');
}
// 3) İlgilendiğin #etiket öne çıkar
{
  const hist = [post('h1', 'x', { caption: '#kahve', likes: { me: 1 }, age: 40 }), post('h2', 'y', { caption: '#kahve', likes: { me: 1 }, age: 40 })];
  const a = post('a', 'z1', { caption: 'sabah #kahve' }); const b = post('b', 'z2', { caption: 'maç #futbol' });
  const m = interestModel({ me, posts: hist.concat([a, b]) });
  ok(rankWith([b, a], m)[0] === 'a', 'ilgilendiğin etiket önde');
}
// 4) "İlgilenmiyorum" denen hesabın gönderileri geri düşer
{
  const hid = post('h', 'sikici', { age: 30 });
  const a = post('a', 'sikici', { likes: likes(5) }); const b = post('b', 'normal', { likes: likes(2) });
  const m = interestModel({ me, posts: [hid, a, b], hidden: { h: 1 } });
  ok(rankWith([a, b], m)[0] === 'b', 'gizlenen gönderinin sahibi geri düşer');
}
// 5) Daha başarılı gönderi önde (diğer her şey eşitken)
{
  const a = post('a', 'k1', { likes: likes(20) }); const b = post('b', 'k2', { likes: likes(1) });
  const m = interestModel({ me, posts: [a, b] });
  ok(rankWith([b, a], m)[0] === 'a', 'çok beğenilen önde');
}
// 6) Küçük hesabın iyi gönderisi, büyük hesabın sıradan gönderisiyle yarışabilir
{
  const a = post('a', 'kucuk', { likes: likes(8) }); const b = post('b', 'buyuk', { likes: likes(10) });
  const m = interestModel({ me, posts: [a, b] });
  const fc = (u) => (u === 'buyuk' ? 5000 : 10);
  ok(rankWith([b, a], m, { followerCount: fc })[0] === 'a', 'takipçisine göre iyi giden küçük hesap önde');
}
// 7) Yeni gönderi eskisinin önünde
{
  const a = post('a', 'k1', { likes: likes(3), age: 1 }); const b = post('b', 'k2', { likes: likes(3), age: 72 });
  const m = interestModel({ me, posts: [a, b] });
  ok(rankWith([b, a], m)[0] === 'a', 'yeni gönderi önde');
}
// 8) Zaten izlenen video geri düşer
{
  const a = post('a', 'k1', { video: true, views: 3 }); const b = post('b', 'k2', { video: true, views: 3 });
  const m = interestModel({ me, posts: [a, b] });
  ok(rankWith([a, b], m, { viewed: { a: 1 } })[0] === 'b', 'izlediğin video geri düşer');
}
// 9) Çok video izleyene videolar, fotoğraf beğenene fotoğraflar önde
{
  const hist = [1, 2, 3, 4].map((i) => post('v' + i, 'h' + i, { video: true, age: 50 }));
  const a = post('a', 'k1', { video: true }); const b = post('b', 'k2', {});
  const viewed = { v1: 1, v2: 1, v3: 1, v4: 1 };
  const m = interestModel({ me, posts: hist.concat([a, b]), viewed });
  ok(rankWith([b, a], m)[0] === 'a', 'video izleyene video önde');
}
// 10) Aynı kişi art arda gelmez
{
  const list = [post('a1', 'ayni', { likes: likes(30) }), post('a2', 'ayni', { likes: likes(29) }), post('a3', 'ayni', { likes: likes(28) }), post('b', 'baska', { likes: likes(1) })];
  const m = interestModel({ me, posts: list });
  const r = rankWith(list, m);
  ok(r[1] === 'b', 'çeşitlilik: aynı kişinin gönderileri arasına başkası girer (' + r.join(',') + ')');
}
// 11) Kendi yeni gönderin en üstte
{
  const a = post('a', me, { age: 0.2 }); const b = post('b', 'k', { likes: likes(10) });
  const m = interestModel({ me, posts: [a, b], following: ['k'] });
  ok(rankWith([b, a], m)[0] === 'a', 'kendi yeni gönderin üstte');
}
// 12) Keşfet: takip ettiğin hesaplar keşifte geri planda
{
  const a = post('a', 'takip', { likes: likes(5) }); const b = post('b', 'yeni', { likes: likes(5) });
  const m = interestModel({ me, posts: [a, b], following: ['takip'] });
  ok(rankWith([a, b], m, { discover: true, following: new Set(['takip']) })[0] === 'b', 'keşfette yeni hesaplar önde');
}
// 13) Yönetici: video ağırlığı artınca video öne geçer
{
  const a = post('a', 'k1', { likes: likes(4) }); const b = post('b', 'k2', { video: true, likes: likes(3) });
  const m = interestModel({ me, posts: [a, b] });
  ok(rankWith([b, a], m)[0] === 'a', 'normal ayarda daha beğenilen fotoğraf önde');
  ok(rankWith([a, b], m, { weights: rankWeights({ video: 2 }) })[0] === 'b', 'video ağırlığı 2 iken video önde');
}
// 14) Yönetici: tazelik 0 iken eski ama çok beğenilen gönderi önde
{
  const a = post('a', 'k1', { likes: likes(2), age: 1 }); const b = post('b', 'k2', { likes: likes(40), age: 200 });
  const m = interestModel({ me, posts: [a, b] });
  ok(rankWith([b, a], m)[0] === 'a', 'normal ayarda yeni gönderi önde');
  ok(rankWith([a, b], m, { weights: rankWeights({ fresh: 0 }) })[0] === 'b', 'tazelik 0 iken en beğenilen önde');
}
// 15) Yönetici: öne çıkarılan gönderi en üstte
{
  const a = post('a', 'k1', { likes: likes(30) }); const b = post('b', 'k2', { likes: likes(1), age: 20 });
  b.boost = 5;
  const m = interestModel({ me, posts: [a, b] });
  ok(rankWith([a, b], m)[0] === 'b', 'öne çıkarılan gönderi en üstte');
}
// 16) Hatalı ağırlıklar varsayılana döner / sınırlanır
{
  const w = rankWeights({ video: 9, fresh: 'x', follow: -3 });
  ok(w.video === 2 && w.fresh === 1 && w.follow === 0, 'ağırlıklar 0–2 arasında tutulur');
}
console.log('\nTAMAM:', n, 'algoritma testi');
