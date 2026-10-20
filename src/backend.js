/* Rozstram — sunucu bağlantısı (Supabase) ve veri dönüştürücüler */

export const CONFIG = (typeof window !== 'undefined' && window.ROZ_CONFIG) || {};

const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
  'https://esm.sh/@supabase/supabase-js@2.45.4?bundle',
];

let clientPromise = null;
/** Supabase istemcisini bir kez yükler (CDN'den) */
export function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      let mod = null;
      let lastErr = null;
      for (const u of CDN) {
        try { mod = await import(u); break; } catch (e) { lastErr = e; }
      }
      if (!mod || !mod.createClient) throw lastErr || new Error('supabase_load');
      return mod.createClient(CONFIG.url, CONFIG.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'rozstram-auth' },
        realtime: { params: { eventsPerSecond: 20 } },
      });
    })();
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/** Postgres zaman damgası → milisaniye */
export function toMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/[+-]\d\d$/.test(s)) s += ':00';
  else if (!/([zZ]|[+-]\d\d:?\d\d)$/.test(s)) s += 'Z';
  const t = Date.parse(s);
  return isNaN(t) ? 0 : t;
}
export const iso = (ms) => new Date(ms || Date.now()).toISOString();

const DAY = 864e5;

/* ---------------------------------------------------- satır → uygulama nesnesi */
export function rowProfile(r) {
  const noteAt = r.note_at ? toMs(r.note_at) : null;
  return {
    id: r.id, username: r.username, displayName: r.full_name || '', bio: r.bio || '', website: r.website || '', category: r.category || '',
    avatar: r.avatar || null, private: !!r.is_private, verified: !!r.verified, showActivity: r.show_activity !== false,
    highlights: r.highlights || [], note: noteAt && Date.now() - noteAt < DAY ? r.note || null : null, noteAt,
    lastSeen: r.show_activity !== false && r.last_seen ? toMs(r.last_seen) : null, at: toMs(r.created_at),
  };
}

export function rowPost(r, prev) {
  return {
    id: r.id, author: r.author, kind: r.kind || 'post', media: r.media || [], caption: r.caption || '', location: r.location || '',
    filter: r.filter || 'none', adjust: r.adjust || null, tagged: r.tagged || [], hideLikes: !!r.hide_likes, noComments: !!r.comments_off,
    pinned: !!r.pinned, archived: !!r.archived, at: toMs(r.created_at), edited: r.edited_at ? toMs(r.edited_at) : null,
    likes: (prev && prev.likes) || {},
    views: (prev && prev.views) || 0,
    boost: (prev && prev.boost) || 0,
    removed: !!(prev && prev.removed),
    music: r.music || null,
    sensitive: !!r.sensitive, sensitiveAdmin: !!r.sensitive_admin,
    reposts: (prev && prev.reposts) || 0,
  };
}

export function rowComment(r, prev) {
  return { id: r.id, post: r.post_id, author: r.author, parent: r.parent_id || null, text: r.text, pinned: !!r.pinned, at: toMs(r.created_at), likes: (prev && prev.likes) || {} };
}

export function rowStory(r, prev) {
  return {
    id: r.id, author: r.author, media: r.media || null, text: r.text_story || null, filter: r.filter || 'none', adjust: r.adjust || null,
    overlay: r.overlay || null, sharedPost: r.shared_post || null, mentions: r.mentions || [], closeFriends: !!r.close_friends,
    at: toMs(r.created_at), views: (prev && prev.views) || {}, likes: (prev && prev.likes) || {}, music: r.music || null,
  };
}

export function rowThread(r, prev) {
  return {
    id: r.id, isGroup: !!r.is_group, title: r.title || '', createdBy: r.created_by || null, at: toMs(r.last_at), last: r.last || null, e2ee: !!r.e2ee,
    members: (prev && prev.members) || [],
  };
}

export function rowMessage(r, prev) {
  return {
    id: r.id, thread: r.thread_id, from: r.sender, text: r.text, media: r.media || null, post: r.post_id || null, story: r.story || null,
    replyTo: r.reply_to || null, unsent: !!r.unsent, edited: !!r.edited_at, at: toMs(r.created_at), reactions: (prev && prev.reactions) || {}, enc: r.enc || null,
  };
}

export function rowNotification(r) {
  return { id: r.id, kind: r.kind, actor: r.actor, post: r.post_id || null, cid: r.comment_id || null, story: r.story_id || null, text: r.text || null, at: toMs(r.created_at), read: !!r.read_at };
}

/* ---------------------------------------------------- hata mesajları */
const ERRORS = {
  username_taken: 'Bu kullanıcı adı alınmış. Bir kez alınan ad bir daha kullanılamaz.',
  username_invalid: 'Kullanıcı adı 3-30 karakter olmalı; küçük harf, rakam, nokta ve alt çizgi kullanabilirsin. En az bir harf olmalı.',
  email_taken: 'Bu e-posta başka bir hesapta kayıtlı.',
  phone_taken: 'Bu telefon numarası başka bir hesapta kayıtlı.',
  email_invalid: 'Geçerli bir e-posta adresi yaz.',
  phone_invalid: 'Geçerli bir telefon numarası yaz.',
  contact_required: 'E-posta ya da telefon numarası gerekli.',
  password_short: 'Şifre en az 8 karakter olmalı.',
  password_long: 'Şifre en fazla 72 karakter olabilir.',
  rate_limited: 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.',
  too_many_changes: 'Kullanıcı adını 14 gün içinde en fazla 3 kez değiştirebilirsin.',
  blocked: 'Bu kişiyle etkileşim kuramazsın.',
  pin_limit: 'En fazla 3 öğe sabitleyebilirsin.',
  edit_window: 'Mesajlar sadece gönderildikten sonraki 15 dakika içinde düzenlenebilir.',
  not_allowed: 'Bunu yapma iznin yok.',
  need_members: 'Gruba en az bir kişi ekle.',
  empty_message: 'Boş mesaj gönderilemez.',
  banned: 'Hesabın askıya alındı.',
  appeal_sent: 'İtirazın zaten gönderildi.',
  not_found: 'Bulunamadı; hesap ya da içerik artık yok.',
  too_young: 'Rozstram’ı kullanmak için 15 yaşını doldurmuş olmalısın.',
  birth_year_invalid: 'Geçerli bir doğum yılı seç.',
  birth_year_set: 'Doğum yılın zaten kayıtlı.',
  teen_locked: '18 yaşından küçükler için hassas içerik kapalı kalır.',
  teen_dm: 'Bu kişi sadece takip ettiği hesaplardan yeni mesaj alabilir.',
  e2ee_only: 'Şifreli sohbette sadece şifreli mesaj gönderilebilir.',
  no_recipients: 'Şipşak gidecek kimse yok. Karşılıklı takipleştiğin ya da Yakın Arkadaşlar listendeki kişilere gider.',
  bad_media: 'Fotoğraf yüklenemedi, tekrar dene.',
  bad_value: 'Geçersiz değer.',
};
export function errCodeOf(e) {
  if (!e) return '';
  const m = String(e.message || e.error || e.code || e);
  const k = Object.keys(ERRORS).find((x) => m.indexOf(x) >= 0);
  if (k) return k;
  if (e.code === '23505') return 'duplicate';
  if (e.code === '42501' || /row-level security|permission denied/i.test(m)) return 'forbidden';
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(m) || String(e.statusCode) === '413') return 'too_large';
  if (/mime type|not supported/i.test(m)) return 'unsupported_type';
  if (/Invalid login credentials/i.test(m)) return 'bad_login';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'network';
  return m.slice(0, 60);
}
export function errText(e, fallback) {
  const c = errCodeOf(e);
  if (ERRORS[c]) return ERRORS[c];
  if (c === 'forbidden') return 'Bunu yapma iznin yok.';
  if (c === 'too_large') return 'Dosya çok büyük (en fazla 50 MB).';
  if (c === 'unsupported_type') return 'Bu dosya türü desteklenmiyor.';
  if (c === 'bad_login') return 'Kullanıcı adı ya da şifre hatalı.';
  if (c === 'network') return 'İnternet bağlantını kontrol et.';
  return fallback || 'Bir sorun oldu, tekrar dene.';
}

/** Edge fonksiyonu hatasının gövdesini okur */
export async function functionError(error, data) {
  if (data && data.error) return data;
  try {
    if (error && error.context && typeof error.context.json === 'function') return await error.context.json();
  } catch (e) { /* gövde okunamadı */ }
  return { error: error ? errCodeOf(error) : 'unknown' };
}
