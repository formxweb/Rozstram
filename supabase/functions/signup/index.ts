// Rozstram — kayıt fonksiyonu (Supabase Edge Function)
// E-posta doğrulaması beklemeden hesabı açar; giriş için iç bir e-posta adresi
// kullanır, kullanıcının gerçek e-postası/telefonu gizli `accounts` tablosunda durur.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const username = String(b.username ?? '').trim().toLowerCase();
  const fullName = String(b.full_name ?? '').trim().slice(0, 60);
  const email = b.email ? String(b.email).trim().toLowerCase() : null;
  const phone = b.phone ? String(b.phone).trim() : null;
  const password = String(b.password ?? '');
  const thisYear = new Date().getUTCFullYear();
  const birthYear = b.birth_year == null || b.birth_year === '' ? null : Number(b.birth_year);

  if (!USERNAME_RE.test(username) || !/[a-z]/.test(username) || /^\.|\.$|\.\./.test(username)) return json({ error: 'username_invalid' }, 400);
  if (!email && !phone) return json({ error: 'contact_required' }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'email_invalid' }, 400);
  if (phone && phone.replace(/\D/g, '').length < 10) return json({ error: 'phone_invalid' }, 400);
  if (password.length < 8) return json({ error: 'password_short' }, 400);
  if (password.length > 72) return json({ error: 'password_long' }, 400);
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < thisYear - 120 || birthYear > thisYear)) return json({ error: 'birth_year_invalid' }, 400);
  if (birthYear !== null && thisYear - birthYear < 13) return json({ error: 'too_young' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
  const rate = await admin.rpc('signup_rate_ok', { p_ip: ip });
  if (rate.error) return json({ error: 'server', detail: rate.error.message }, 500);
  if (!rate.data) return json({ error: 'rate_limited' }, 429);

  const check = await admin.rpc('signup_check', { p_username: username, p_email: email, p_phone: phone });
  if (check.error) return json({ error: 'server', detail: check.error.message }, 500);
  if (check.data !== 'ok') return json({ error: check.data }, 409);

  const loginEmail = 'u' + crypto.randomUUID().replace(/-/g, '').slice(0, 24) + '@hesap.rozstram.app';
  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: { username, full_name: fullName, contact_email: email, contact_phone: phone, birth_year: birthYear },
  });
  if (created.error) {
    // aynı anda aynı adla kayıt olunduysa doğru hatayı döndür
    const again = await admin.rpc('signup_check', { p_username: username, p_email: email, p_phone: phone });
    const code = again.data && again.data !== 'ok' ? again.data : 'create_failed';
    return json({ error: code, detail: created.error.message }, 409);
  }
  return json({ ok: true, login_email: loginEmail, user_id: created.data.user?.id });
});
