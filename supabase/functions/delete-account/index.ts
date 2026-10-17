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

  // kullanıcının yüklediği dosyalar: media/<uid>/{p,s,a,m}/...
  const bucket = admin.storage.from('media');
  for (const folder of ['p', 's', 'a', 'm']) {
    for (let round = 0; round < 20; round++) {
      const { data: files } = await bucket.list(`${uid}/${folder}`, { limit: 1000 });
      if (!files || !files.length) break;
      await bucket.remove(files.map((f) => `${uid}/${folder}/${f.name}`));
      if (files.length < 1000) break;
    }
  }

  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return json({ error: 'server', detail: error.message }, 500);
  return json({ ok: true });
});
