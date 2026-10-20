// Rozstram — yöneticinin bir hesabı silmesi (Supabase Edge Function)
// Sadece yöneticiler çağırabilir. Hesabın dosyalarını (media/<uid>/...) ve hesabı kalıcı olarak siler;
// profil, gönderi, mesaj vb. veritabanında hesaba bağlı olduğu için onlarla birlikte silinir.
// Kullanıcı adı varsayılan olarak kilitli kalır; `free_username: true` gelirse hesabın adları serbest bırakılır.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// media/<prefix> altındaki bütün dosyaların yolları (alt klasörler dahil)
// deno-lint-ignore no-explicit-any
async function listAll(bucket: any, prefix: string, depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
    if (error || !data || !data.length) break;
    for (const f of data) {
      const p = prefix + '/' + f.name;
      if (f.id === null || f.id === undefined) { if (depth < 4) out.push(...(await listAll(bucket, p, depth + 1))); }
      else out.push(p);
    }
    if (data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const target = String(b.user_id ?? '');
  const freeName = b.free_username === true;
  if (!UUID_RE.test(target)) return json({ error: 'bad_request' }, 400);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: 'not_authenticated' }, 401);
  const me = who.user.id;

  const { data: isAdmin } = await admin.from('app_admins').select('user_id').eq('user_id', me).maybeSingle();
  if (!isAdmin) return json({ error: 'not_admin' }, 403);
  if (target === me) return json({ error: 'self_delete' }, 400);  // kendi hesabını Ayarlar'dan siler
  const { data: other } = await admin.from('app_admins').select('user_id').eq('user_id', target).maybeSingle();
  if (other) return json({ error: 'target_admin' }, 400);
  const { data: prof } = await admin.from('profiles').select('username').eq('id', target).maybeSingle();
  if (!prof) return json({ error: 'not_found' }, 404);

  const { data: names } = await admin.from('usernames').select('name').eq('user_id', target);

  const bucket = admin.storage.from('media');
  const files = await listAll(bucket, target);
  for (let i = 0; i < files.length; i += 500) await bucket.remove(files.slice(i, i + 500));

  const { error } = await admin.auth.admin.deleteUser(target);
  if (error) return json({ error: 'server', detail: error.message }, 500);

  if (freeName && names && names.length) {
    await admin.from('usernames').delete().in('name', names.map((n: { name: string }) => n.name)).is('user_id', null).eq('reserved', false);
  }
  return json({ ok: true, username: prof.username, files: files.length });
});
