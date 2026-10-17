// Rozstram akış algoritması — her kullanıcıya göre kişiselleşen sıralama.
//
// Instagram'ın açıkladığı sinyallere benzer şekilde çalışır:
//  1) İlişki: kimin gönderilerini beğeniyorsun, yorum yapıyorsun, kaydediyorsun, izliyorsun;
//     kimi takip ediyorsun, yakın arkadaşın kim, kiminle mesajlaşıyorsun.
//  2) İlgi alanı: etkileştiğin gönderilerdeki #etiketler.
//  3) İçerik türü: daha çok video mu izliyorsun, fotoğraf mı beğeniyorsun.
//  4) Gönderinin başarısı: beğeni, yorum, görüntülenme — hesabın takipçi sayısına göre oranlanır,
//     böylece küçük hesapların iyi gönderileri de öne çıkabilir.
//  5) Tazelik: yeni gönderi önde; çok yeni ve henüz etkileşim almamış gönderiye ilk görünürlük desteği.
//  6) Olumsuz sinyaller: "İlgilenmiyorum" dediğin gönderilerin sahibi ve konuları geri düşer;
//     zaten izlediğin/beğendiğin gönderiler aşağı iner.
//  7) Çeşitlilik: aynı kişinin gönderileri art arda gelmez.
//
// Yönetici panelinden ayarlanan ağırlıklar (0–2, 1 = normal): video, follow (ilişki), interest (ilgi alanı),
// popular (başarı), fresh (tazelik), newcomer (yeni gönderiye şans). Yöneticinin öne çıkardığı gönderiler
// (boost) ayrıca yukarı taşınır.
import { onKeys, tagsOf } from './lib.js';

const W = { like: 1, comment: 3, save: 4, view: 0.6, hide: -6, follow: 3, closeFriend: 4, followsMe: 1, dm: 2 };

export const isVideo = (p) => !!(p && p.media && p.media[0] && p.media[0].type === 'video');

/** Kullanıcının ilgi profili */
export function interestModel({ me, posts, comments, saved, viewed, hidden, following, closeFriends, followsMe, dmPartners }) {
  const author = {};
  const tags = {};
  let vid = 1;
  let img = 1;
  const byId = {};
  (posts || []).forEach((p) => { byId[p.id] = p; });
  const add = (p, w) => {
    if (!p || p.author === me) return;
    author[p.author] = (author[p.author] || 0) + w;
    tagsOf(p.caption).forEach((t) => { tags[t] = (tags[t] || 0) + w; });
    if (w > 0) { if (isVideo(p)) vid += w; else img += w; }
  };
  (posts || []).forEach((p) => {
    if (p.likes && p.likes[me]) add(p, W.like);
    if (saved && saved[p.id]) add(p, W.save);
    if (viewed && viewed[p.id]) add(p, W.view);
    if (hidden && hidden[p.id]) add(p, W.hide);
  });
  (comments || []).forEach((c) => { if (c.author === me) add(byId[c.post], W.comment); });
  const bump = (ids, w) => (ids || []).forEach((u) => { if (u && u !== me) author[u] = (author[u] || 0) + w; });
  bump(following, W.follow);
  bump(closeFriends, W.closeFriend);
  bump(followsMe, W.followsMe);
  bump(dmPartners, W.dm);
  return { author, tags, videoShare: vid / (vid + img) };
}

export const RANK_DEFAULTS = { video: 1, follow: 1, interest: 1, popular: 1, fresh: 1, newcomer: 1 };
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(2, v)) : d);
export function rankWeights(w) {
  const o = {};
  Object.keys(RANK_DEFAULTS).forEach((k) => { o[k] = num(w && Number(w[k]), RANK_DEFAULTS[k]); });
  return o;
}

const soft = (v) => (v >= 0 ? Math.log2(1 + v) : -1.5 * Math.log2(1 - v));

/** Tek bir gönderinin puanı (yüksek = önde) */
export function scorePost(p, m, ctx) {
  const w = ctx.weights || RANK_DEFAULTS;
  const likes = onKeys(p.likes).length;
  const cc = (ctx.commentCount && ctx.commentCount[p.id]) || 0;
  const video = isVideo(p);
  const eng = likes + 2 * cc + (video ? 0.25 * (p.views || 0) : 0);
  const audience = Math.max(1, ctx.followerCount ? ctx.followerCount(p.author) : 1);
  const quality = Math.log2(2 + eng) + Math.min(2, eng / Math.sqrt(audience + 4));
  const own = p.author === ctx.me;
  const affinity = own ? 0 : soft(m.author[p.author] || 0);
  let topic = 0;
  tagsOf(p.caption).forEach((t) => { if (m.tags[t]) topic += soft(m.tags[t]); });
  topic = Math.max(-3, Math.min(3, topic));
  const type = video ? m.videoShare : 1 - m.videoShare;
  const ageH = Math.max(0, (ctx.now - p.at) / 36e5);
  const decay = 1 / Math.pow(ageH + 2, 0.75 * w.fresh);
  const fresh = ageH < 6 && eng < 3 ? 1 + 0.25 * w.newcomer : 1;
  const videoMult = video ? Math.pow(2, w.video - 1) : 1;
  const boost = 1 + Math.max(0, Number(p.boost) || 0);
  const seen = (ctx.viewed && ctx.viewed[p.id]) || (p.likes && p.likes[ctx.me]) ? 0.4 : 1;
  const discover = ctx.discover && !own && ctx.following && ctx.following.has(p.author) ? 0.5 : 1;
  const mine = own ? (ageH < 24 ? 3 : 0.3) : 1;
  const base = 1 + w.popular * quality + 2 * w.follow * (ctx.discover ? Math.min(affinity, 1) : affinity) + w.interest * (topic + type);
  const score = Math.max(0.05, base) * decay * fresh * seen * discover * mine * videoMult * boost;
  // Yöneticinin öne çıkardığı ve kişinin henüz görmediği gönderi en üst sıraya çıkar
  if (boost > 1 && seen === 1 && !own) return 1000 + score;
  return score;
}

/** Puana göre sırala; aynı kişi art arda iki kez gelmesin */
export function rankPosts(list, scoreOf) {
  const pool = list.map((p) => ({ p, s: scoreOf(p) })).sort((a, b) => b.s - a.s || b.p.at - a.p.at);
  const out = [];
  while (pool.length) {
    const last = out.length ? out[out.length - 1].author : null;
    const prev = out.length > 1 ? out[out.length - 2].author : null;
    let i = pool.findIndex((x) => x.p.author !== last && x.p.author !== prev);
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0].p);
  }
  return out;
}
