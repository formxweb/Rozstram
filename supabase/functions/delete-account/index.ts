// Rozstram — hesap silme (Supabase Edge Function)
// Giriş yapmış kullanıcının dosyalarını ve hesabını kalıcı olarak siler.
// Profil, gönderi, mesaj vb. veritabanında hesaba bağlı olduğu için onlarla birlikte silinir;
// kullanıcı adı `usernames` tablosunda kilitli kalır, kimse tekrar alamaz.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: 'not_authenticated' }, 401);
  const uid = who.user.id;

  // kullanıcının yüklediği bütün dosyalar: media/<uid>/... (gönderi, hikaye, profil, mesaj, şipşak…)
  const bucket = admin.storage.from('media');
  const files = await listAll(bucket, uid);
  for (let i = 0; i < files.length; i += 500) await bucket.remove(files.slice(i, i + 500));

  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return json({ error: 'server', detail: error.message }, 500);
  return json({ ok: true });
});
