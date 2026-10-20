-- =====================================================================
--  ROZSTRAM — veritabanı şeması (Supabase / Postgres)
--  Tekrar çalıştırmak güvenlidir.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- =====================================================================
-- 1) TABLOLAR
-- =====================================================================

-- Profil (herkese açık bilgiler)
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique,
  full_name     text not null default '' check (char_length(full_name) <= 60),
  bio           text not null default '' check (char_length(bio) <= 300),
  website       text not null default '' check (char_length(website) <= 200),
  category      text not null default '' check (char_length(category) <= 40),
  avatar        text,
  is_private    boolean not null default false,
  verified      boolean not null default false,
  show_activity boolean not null default true,
  highlights    jsonb not null default '[]'::jsonb,
  note          text check (char_length(note) <= 60),
  note_at       timestamptz,
  last_seen     timestamptz,
  created_at    timestamptz not null default now()
);

-- Alınmış bütün kullanıcı adları. Satırlar asla silinmez: bir ad bir kez
-- alındıysa (hesap silinse ya da ad değişse bile) başkası kullanamaz.
create table if not exists public.usernames (
  name       text primary key,
  user_id    uuid references auth.users (id) on delete set null,
  reserved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists usernames_user_idx on public.usernames (user_id, created_at desc);

-- Gizli hesap bilgileri (e-posta / telefon). Sadece sahibi görür.
create table if not exists public.accounts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  login_email text not null unique,
  email       text unique,
  phone       text unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.signup_log (
  id         bigint generated always as identity primary key,
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists signup_log_ip_idx on public.signup_log (ip, created_at desc);

create table if not exists public.blocks (
  blocker    uuid not null references public.profiles (id) on delete cascade,
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked);

-- Banlanan hesaplar: yönetici banlar, until boşsa kalıcıdır. Ban kaldırılınca satır silinmez, active=false olur.
create table if not exists public.user_bans (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  active          boolean not null default true,
  reason          text check (char_length(reason) <= 300),
  until           timestamptz,
  banned_by       uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  appeal          text check (char_length(appeal) <= 1000),
  appeal_at       timestamptz,
  appeal_rejected boolean not null default false,
  lifted_at       timestamptz
);

create table if not exists public.follows (
  follower   uuid not null references public.profiles (id) on delete cascade,
  following  uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'accepted' check (status in ('accepted', 'pending')),
  created_at timestamptz not null default now(),
  primary key (follower, following),
  check (follower <> following)
);
create index if not exists follows_following_idx on public.follows (following, status);

create table if not exists public.mutes (
  owner      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, target)
);

create table if not exists public.close_friends (
  owner      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  friend     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, friend),
  check (owner <> friend)
);
create index if not exists close_friends_friend_idx on public.close_friends (friend);

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  author       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind         text not null default 'post' check (kind in ('post', 'reel')),
  media        jsonb not null check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) between 1 and 10),
  caption      text not null default '' check (char_length(caption) <= 2200),
  location     text not null default '' check (char_length(location) <= 80),
  filter       text not null default 'none' check (char_length(filter) <= 20),
  adjust       jsonb,
  tagged       uuid[] not null default '{}',
  hide_likes   boolean not null default false,
  comments_off boolean not null default false,
  pinned       boolean not null default false,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  edited_at    timestamptz
);
create index if not exists posts_author_idx on public.posts (author, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_tagged_idx on public.posts using gin (tagged);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id, created_at desc);

-- Video görüntülenmeleri: kişi başına bir kez sayılır, sahibinin kendi izlemesi sayılmaz
create table if not exists public.post_views (
  post_id    uuid not null references public.posts (id) on delete cascade,
  viewer     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, viewer)
);

create table if not exists public.saves (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.hidden_posts (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  parent_id  uuid references public.comments (id) on delete cascade,
  text       text not null check (char_length(btrim(text)) between 1 and 1000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_parent_idx on public.comments (parent_id);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.stories (
  id            uuid primary key default gen_random_uuid(),
  author        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  media         jsonb,
  text_story    jsonb,
  filter        text not null default 'none' check (char_length(filter) <= 20),
  adjust        jsonb,
  overlay       jsonb,
  shared_post   uuid references public.posts (id) on delete set null,
  mentions      uuid[] not null default '{}',
  close_friends boolean not null default false,
  created_at    timestamptz not null default now(),
  check (media is not null or text_story is not null)
);
create index if not exists stories_author_idx on public.stories (author, created_at desc);
create index if not exists stories_created_idx on public.stories (created_at desc);

create table if not exists public.story_views (
  story_id   uuid not null references public.stories (id) on delete cascade,
  viewer     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, viewer)
);
create index if not exists story_views_viewer_idx on public.story_views (viewer);

create table if not exists public.story_likes (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.threads (
  id         uuid primary key default gen_random_uuid(),
  is_group   boolean not null default false,
  title      text check (char_length(title) <= 60),
  dm_key     text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  last       jsonb
);

create table if not exists public.thread_members (
  thread_id    uuid not null references public.threads (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  accepted     boolean not null default true,
  muted        boolean not null default false,
  last_read_at timestamptz not null default to_timestamp(0),
  joined_at    timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists thread_members_user_idx on public.thread_members (user_id);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.threads (id) on delete cascade,
  sender     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text       text check (char_length(text) <= 2000),
  media      jsonb,
  post_id    uuid references public.posts (id) on delete set null,
  story      jsonb,
  reply_to   jsonb,
  unsent     boolean not null default false,
  edited_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at desc);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  actor      uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  post_id    uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  story_id   uuid references public.stories (id) on delete cascade,
  text       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  reporter   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('user', 'post', 'comment', 'story', 'message')),
  target     text not null,
  reason     text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------
-- 1b) YAŞ, HASSAS İÇERİK, ŞİPŞAK, UÇTAN UCA ŞİFRELİ SOHBET, EN SEVDİĞİN YIL
-- ---------------------------------------------------------------------

-- doğum yılı (gizli; sadece sahibi görür) ve kişisel tercihler (ör. hassas içerik)
alter table public.accounts add column if not exists birth_year int check (birth_year between 1900 and 2100);
alter table public.accounts add column if not exists prefs jsonb not null default '{}'::jsonb
  check (jsonb_typeof(prefs) = 'object' and char_length(prefs::text) <= 2000);

-- hassas içerik: sahibi ya da yönetici işaretler; yöneticinin işareti sahibince kaldırılamaz
alter table public.posts add column if not exists sensitive boolean not null default false;
alter table public.posts add column if not exists sensitive_admin boolean not null default false;

-- Şipşak: anında çekilen foto; arkadaşlar bir kez görür, 24 saatte kaybolur
create table if not exists public.snaps (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  media      jsonb not null check (jsonb_typeof(media) = 'object' and char_length(media::text) <= 1000),
  caption    text check (char_length(caption) <= 80),
  audience   text not null default 'mutual' check (audience in ('close', 'mutual')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists snaps_sender_idx on public.snaps (sender, created_at desc);
create table if not exists public.snap_recipients (
  snap_id  uuid not null references public.snaps (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  seen_at  timestamptz,
  reaction text check (char_length(reaction) <= 16),
  primary key (snap_id, user_id)
);
create index if not exists snap_recipients_user_idx on public.snap_recipients (user_id, seen_at);

-- Uçtan uca şifreli sohbet: her cihazın açık anahtarı (gizli anahtar cihazdan hiç çıkmaz)
create table if not exists public.device_keys (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  public_key jsonb not null check (jsonb_typeof(public_key) = 'object' and char_length(public_key::text) <= 600),
  label      text check (char_length(label) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists device_keys_user_idx on public.device_keys (user_id, created_at desc);
alter table public.threads add column if not exists e2ee boolean not null default false;
alter table public.messages add column if not exists enc jsonb check (enc is null or (jsonb_typeof(enc) = 'object' and char_length(enc::text) <= 60000));

-- En sevdiğin yıl (sadece toplu istatistik paylaşılır)
create table if not exists public.favorite_years (
  user_id    uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  year       int not null check (year between 1950 and 2100),
  season     text check (season in ('kis', 'yaz')),
  updated_at timestamptz not null default now()
);
create index if not exists favorite_years_year_idx on public.favorite_years (year);

-- Yeniden paylaşım: başkasının gönderisini/Reels'ini kendi takipçilerinin akışına taşır
create table if not exists public.reposts (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists reposts_post_idx on public.reposts (post_id);
create index if not exists reposts_user_idx on public.reposts (user_id, created_at desc);

-- 18 yaş altı hesapların sohbette nereye kadar okuduğu (okundu bilgisi başkalarına gösterilmez; sadece sahibi görür)
create table if not exists public.read_marks (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null references public.threads (id) on delete cascade,
  at        timestamptz not null,
  primary key (user_id, thread_id)
);

-- =====================================================================
-- 2) YARDIMCI FONKSİYONLAR
-- =====================================================================

create or replace function public.norm_phone(p text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if p is null or btrim(p) = '' then return null; end if;
  d := regexp_replace(p, '[^0-9]', '', 'g');
  if d = '' then return null; end if;
  if left(btrim(p), 1) = '+' then return '+' || d; end if;
  if left(d, 2) = '00' then return '+' || substr(d, 3); end if;
  if length(d) = 11 and left(d, 1) = '0' then return '+90' || substr(d, 2); end if;
  if length(d) = 10 and left(d, 1) = '5' then return '+90' || d; end if;
  if length(d) = 12 and left(d, 2) = '90' then return '+' || d; end if;
  return '+' || d;
end $$;

create or replace function public.norm_email(e text) returns text
language sql immutable as $$ select nullif(lower(btrim(e)), '') $$;

-- 3-30 karakter: küçük harf, rakam, nokta, alt çizgi; en az bir harf;
-- nokta ile başlayamaz/bitemez, iki nokta yan yana olamaz.
create or replace function public.username_valid(n text) returns boolean
language sql immutable as $$
  select coalesce(n ~ '^[a-z0-9._]{3,30}$' and n ~ '[a-z]' and n !~ '^\.' and n !~ '\.$' and n !~ '\.\.', false)
$$;

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

create or replace function public.blocked_me(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where blocker = owner and blocked = auth.uid());
$$;

-- 18 yaş altı mı? (doğum yılına göre; bilinmiyorsa yetişkin sayılır, uygulama doğum yılını sorar)
create or replace function public.is_minor(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select birth_year > extract(year from now())::int - 18 from public.accounts where user_id = uid), false);
$$;

-- sadece kendi yaş durumum (başkasının 18 yaş altı olup olmadığı kimseye açık değildir)
create or replace function public.am_minor() returns boolean
language sql stable security definer set search_path = public as $$ select public.is_minor(auth.uid()) $$;

-- API'ye açık olmayan yardımcılar: sadece erişim kuralları ve sunucu fonksiyonları kullanır, uygulama doğrudan çağıramaz
-- (böylece kimse başka bir hesabın yaşını sorgulayamaz)
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.teen(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.is_minor(uid) $$;

-- 15 yaşını doldurmamış olabilir mi? (7578 sayılı Kanun: 15 yaş altına sosyal ağ hizmeti verilemez)
-- Sadece doğum yılı bilindiği için ihtiyatlı davranılır: bu yıl 15'ine basan doğum yılı da, doğum günü gelmemiş olabileceğinden kapsam dışı.
create or replace function private.underage(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select birth_year > extract(year from now())::int - 16 from public.accounts where user_id = uid), false);
$$;

-- giriş yapan kişi hassas içeriği hiç görmemeli mi? (18 yaş altı ya da tercihi "gizle")
create or replace function public.hide_sensitive() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select birth_year > extract(year from now())::int - 18 or prefs ->> 'sensitive' = 'hide'
                   from public.accounts where user_id = auth.uid()), false);
$$;

-- Bu hesap şu an banlı mı? (süresi dolan geçici ban sayılmaz)
create or replace function public.user_banned(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_bans b where b.user_id = uid and b.active and (b.until is null or b.until > now()));
$$;

-- Banlı ya da 15 yaşını doldurmamış hesabın profili ve içeriği herkesten gizlenir (kendisi ve yöneticiler hariç)
create or replace function public.ban_hidden(uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if uid is null or uid = auth.uid() or not (public.user_banned(uid) or private.underage(uid)) then return false; end if;
  return not exists (select 1 from public.app_admins a where a.user_id = auth.uid());
end $$;

-- Erişim kuralları bunları kullanır; public sürümleri API'den çağrılamaz (bir hesabın banlı mı 15 yaş altı mı olduğu ayırt edilemesin)
create or replace function private.hidden(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.ban_hidden(uid) $$;
create or replace function private.banned(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.user_banned(uid) $$;

-- Giriş yapan kullanıcı bu kişinin içeriğini görebilir mi?
create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
    or (
      auth.uid() is not null
      and not public.blocked_between(owner, auth.uid())
      and not public.ban_hidden(owner)
      and (
        not coalesce((select is_private from public.profiles where id = owner), false)
        or exists (select 1 from public.follows f where f.follower = auth.uid() and f.following = owner and f.status = 'accepted')
      )
    );
$$;

create or replace function public.is_close_friend_of(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or exists (select 1 from public.close_friends where owner = is_close_friend_of.owner and friend = auth.uid());
$$;

create or replace function public.story_in_highlight(sid uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p, jsonb_array_elements(p.highlights) h
    where p.id = owner and coalesce(h -> 'items', '[]'::jsonb) ? sid::text
  );
$$;

create or replace function public.is_member(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.thread_members where thread_id = tid and user_id = auth.uid());
$$;

-- Bildirim hâlâ geçerli mi? Geri alınan beğeni, bırakılan takip, kabul edilen
-- ya da silinen istek bildirimleri listede görünmez.
create or replace function public.notif_live(k text, a uuid, u uuid, p uuid, c uuid, s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case k
    when 'like' then exists (select 1 from public.post_likes where post_id = p and user_id = a)
    when 'repost' then exists (select 1 from public.reposts where post_id = p and user_id = a)
    when 'clike' then exists (select 1 from public.comment_likes where comment_id = c and user_id = a)
    when 'slike' then exists (select 1 from public.story_likes where story_id = s and user_id = a)
    when 'request' then exists (select 1 from public.follows where follower = a and following = u and status = 'pending')
    when 'follow' then exists (select 1 from public.follows where follower = a and following = u and status = 'accepted')
    else true end;
$$;

-- 1:1 sohbette karşı taraf engellenmiş mi?
create or replace function public.dm_blocked(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.threads t join public.thread_members m on m.thread_id = t.id
    where t.id = tid and not t.is_group and m.user_id <> auth.uid() and (public.blocked_between(m.user_id, auth.uid()) or public.user_banned(m.user_id) or private.underage(m.user_id))
  );
$$;

create or replace function public.ms(t timestamptz) returns bigint
language sql immutable as $$ select (extract(epoch from t) * 1000)::bigint $$;

-- Bildirim ekler (kendine, engelliye bildirim gitmez)
create or replace function public.notify(p_user uuid, p_actor uuid, p_kind text, p_post uuid default null, p_comment uuid default null, p_story uuid default null, p_text text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_actor is null or p_user = p_actor then return; end if;
  if public.blocked_between(p_user, p_actor) then return; end if;
  insert into public.notifications (user_id, actor, kind, post_id, comment_id, story_id, text)
  values (p_user, p_actor, p_kind, p_post, p_comment, p_story, left(p_text, 140));
end $$;

-- Metindeki @kullanici adlarını profil kimliklerine çevirir
create or replace function public.mentioned_ids(t text) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from regexp_matches(lower(coalesce(t, '')), '@([a-z0-9._]{3,30})', 'g') as m(x)
  join public.profiles p on p.username = rtrim(m.x[1], '.');
$$;

-- =====================================================================
-- 3) HESAP: KAYIT, GİRİŞ, KULLANICI ADI
-- =====================================================================

-- Yeni hesap: profil + kullanıcı adı kilidi + iletişim bilgisi (tek seferde)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  u  text := lower(btrim(coalesce(m ->> 'username', '')));
  em text := public.norm_email(m ->> 'contact_email');
  ph text := public.norm_phone(m ->> 'contact_phone');
  cy int := extract(year from now())::int;
  byr int := case when (m ->> 'birth_year') ~ '^[0-9]{4}$' then (m ->> 'birth_year')::int else null end;
begin
  if not public.username_valid(u) then raise exception 'username_invalid'; end if;
  if em is null and ph is null then raise exception 'contact_required'; end if;
  if byr is not null and (byr < cy - 120 or byr > cy) then raise exception 'birth_year_invalid'; end if;
  if byr is not null and byr > cy - 16 then raise exception 'too_young'; end if;  -- 15 yaşını doldurmuş olmalı (bkz. private.underage)
  insert into public.usernames (name, user_id) values (u, new.id);
  insert into public.profiles (id, username, full_name, is_private)
  values (new.id, u, left(btrim(coalesce(m ->> 'full_name', '')), 60), coalesce(byr > cy - 18, false));
  insert into public.accounts (user_id, login_email, email, phone, birth_year, prefs)
  values (new.id, lower(new.email), em, ph, byr, case when byr > cy - 18 then '{"sensitive":"hide"}'::jsonb else '{}'::jsonb end);
  return new;
end $$;

create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.username_valid(lower(btrim(coalesce(name, ''))))
     and not exists (select 1 from public.usernames u where u.name = lower(btrim(coalesce(username_available.name, ''))));
$$;

-- Sadece kayıt fonksiyonu (sunucu) çağırır
create or replace function public.signup_check(p_username text, p_email text, p_phone text) returns text
language plpgsql stable security definer set search_path = public as $$
declare u text := lower(btrim(coalesce(p_username, '')));
begin
  if not public.username_valid(u) then return 'username_invalid'; end if;
  if exists (select 1 from public.usernames where name = u) then return 'username_taken'; end if;
  if public.norm_email(p_email) is null and public.norm_phone(p_phone) is null then return 'contact_required'; end if;
  if public.norm_email(p_email) is not null and exists (select 1 from public.accounts where email = public.norm_email(p_email)) then return 'email_taken'; end if;
  if public.norm_phone(p_phone) is not null and exists (select 1 from public.accounts where phone = public.norm_phone(p_phone)) then return 'phone_taken'; end if;
  return 'ok';
end $$;

-- Sadece kayıt fonksiyonu çağırır: aynı IP'den saatte en fazla 8 kayıt
create or replace function public.signup_rate_ok(p_ip text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.signup_log where ip = coalesce(p_ip, '?') and created_at > now() - interval '1 hour';
  if n >= 8 then return false; end if;
  insert into public.signup_log (ip) values (coalesce(p_ip, '?'));
  return true;
end $$;

-- Kullanıcı adı / e-posta / telefon → giriş anahtarı (iç e-posta)
create or replace function public.login_email(identifier text) returns text
language plpgsql stable security definer set search_path = public as $$
declare i text := btrim(coalesce(identifier, '')); r text;
begin
  if i = '' then return null; end if;
  if position('@' in i) > 1 then
    select login_email into r from public.accounts where email = public.norm_email(i);
  elsif i ~ '^[+0-9 ()-]{7,}$' then
    select login_email into r from public.accounts where phone = public.norm_phone(i);
  end if;
  if r is null then
    select a.login_email into r from public.profiles p join public.accounts a on a.user_id = p.id
    where p.username = lower(ltrim(i, '@'));
  end if;
  return r;
end $$;

-- Kullanıcı adını değiştir: eski ad sende kalır, kimse alamaz.
create or replace function public.change_username(new_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  u   text := lower(btrim(coalesce(new_name, '')));
  me  uuid := auth.uid();
  cur text;
  n   int;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  select username into cur from public.profiles where id = me;
  if u = cur then return u; end if;
  if not public.username_valid(u) then raise exception 'username_invalid'; end if;
  if exists (select 1 from public.usernames where name = u and user_id is distinct from me) then raise exception 'username_taken'; end if;
  select count(*) into n from public.usernames where user_id = me and created_at > now() - interval '14 days';
  if n >= 3 and not exists (select 1 from public.usernames where name = u and user_id = me) then raise exception 'too_many_changes'; end if;
  insert into public.usernames (name, user_id) values (u, me) on conflict (name) do nothing;
  update public.profiles set username = u where id = me;
  return u;
end $$;

-- E-posta / telefon güncelle
create or replace function public.update_contact(p_email text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); em text := public.norm_email(p_email); ph text := public.norm_phone(p_phone);
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if em is null and ph is null then raise exception 'contact_required'; end if;
  if em is not null and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalid'; end if;
  if ph is not null and ph !~ '^\+[0-9]{8,15}$' then raise exception 'phone_invalid'; end if;
  if em is not null and exists (select 1 from public.accounts where email = em and user_id <> me) then raise exception 'email_taken'; end if;
  if ph is not null and exists (select 1 from public.accounts where phone = ph and user_id <> me) then raise exception 'phone_taken'; end if;
  update public.accounts set email = em, phone = ph where user_id = me;
end $$;


-- =====================================================================
-- 4) TETİKLEYİCİLER (bütünlük + bildirimler)
-- =====================================================================

-- profil: gizli → herkese açık olunca bekleyen istekleri kabul et
create or replace function public.profiles_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_private and not new.is_private then
    update public.follows set status = 'accepted', created_at = now() where following = new.id and status = 'pending';
  end if;
  return new;
end $$;
create or replace trigger profiles_after_update after update of is_private on public.profiles
  for each row execute function public.profiles_after_update();

-- takip: gizli hesaba takip isteği
create or replace function public.follows_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if public.blocked_between(new.follower, new.following) then raise exception 'blocked'; end if;
    new.status := case when coalesce((select is_private from public.profiles where id = new.following), false) then 'pending' else 'accepted' end;
    new.created_at := now();
  else
    new.follower := old.follower; new.following := old.following;
    new.status := 'accepted'; new.created_at := now();
  end if;
  return new;
end $$;
create or replace trigger follows_before before insert or update on public.follows
  for each row execute function public.follows_before();

create or replace function public.follows_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.following, new.follower, case when new.status = 'pending' then 'request' else 'follow' end);
  elsif old.status = 'pending' and new.status = 'accepted' then
    perform public.notify(new.following, new.follower, 'follow');
    perform public.notify(new.follower, new.following, 'accepted');
  end if;
  return null;
end $$;
create or replace trigger follows_after after insert or update on public.follows
  for each row execute function public.follows_after();


-- gönderi: yazar sabit, en fazla 3 sabitlenmiş gönderi
create or replace function public.posts_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.edited_at := null; new.sensitive_admin := false;
    new.tagged := coalesce((select array_agg(distinct t) from unnest(new.tagged) t where t <> new.author), '{}');
  else
    new.id := old.id; new.author := old.author; new.created_at := old.created_at; new.media := old.media; new.kind := old.kind;
    if not public.is_admin() then
      new.sensitive_admin := old.sensitive_admin;
      if old.sensitive_admin then new.sensitive := true; end if;
    end if;
    if new.caption is distinct from old.caption or new.location is distinct from old.location or new.tagged is distinct from old.tagged then
      new.edited_at := now();
    end if;
  end if;
  if new.pinned and (tg_op = 'INSERT' or not old.pinned) then
    if (select count(*) from public.posts where author = new.author and pinned and id <> new.id) >= 3 then raise exception 'pin_limit'; end if;
  end if;
  return new;
end $$;
create or replace trigger posts_before before insert or update on public.posts
  for each row execute function public.posts_before();

create or replace function public.posts_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  foreach u in array public.mentioned_ids(new.caption) loop
    if tg_op = 'INSERT' or not (u = any (public.mentioned_ids(old.caption))) then
      perform public.notify(u, new.author, 'mentionPost', new.id, null, null, new.caption);
    end if;
  end loop;
  foreach u in array coalesce(new.tagged, '{}') loop
    if tg_op = 'INSERT' or not (u = any (coalesce(old.tagged, '{}'))) then
      perform public.notify(u, new.author, 'tag', new.id);
    end if;
  end loop;
  return null;
end $$;
create or replace trigger posts_after after insert or update of caption, tagged on public.posts
  for each row execute function public.posts_after();

-- beğeni bildirimleri
create or replace function public.post_likes_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify((select author from public.posts where id = new.post_id), new.user_id, 'like', new.post_id);
  return null;
end $$;
create or replace trigger post_likes_after after insert on public.post_likes
  for each row execute function public.post_likes_after();

-- yeniden paylaşım: kendi gönderini yeniden paylaşamazsın; gönderi sahibine bildirim gider
create or replace function public.reposts_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  if exists (select 1 from public.posts where id = new.post_id and author = new.user_id) then raise exception 'own_post'; end if;
  return new;
end $$;
create or replace trigger reposts_before before insert on public.reposts
  for each row execute function public.reposts_before();

create or replace function public.reposts_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify((select author from public.posts where id = new.post_id), new.user_id, 'repost', new.post_id);
  return null;
end $$;
create or replace trigger reposts_after after insert on public.reposts
  for each row execute function public.reposts_after();

-- yorum: yanıtlar tek seviye, yazar sabit
create or replace function public.comments_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare par_post uuid; par_parent uuid;
begin
  new.created_at := now();
  new.text := btrim(new.text);
  if new.parent_id is not null then
    select c.post_id, c.parent_id into par_post, par_parent from public.comments c where c.id = new.parent_id;
    if par_post is null or par_post <> new.post_id then raise exception 'bad_parent'; end if;
    if par_parent is not null then new.parent_id := par_parent; end if;
  end if;
  return new;
end $$;
create or replace trigger comments_before before insert on public.comments
  for each row execute function public.comments_before();

create or replace function public.comments_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  post_author uuid := (select author from public.posts where id = new.post_id);
  par_author  uuid := (select author from public.comments where id = new.parent_id);
  u uuid;
begin
  if par_author is not null then perform public.notify(par_author, new.author, 'reply', new.post_id, new.id, null, new.text); end if;
  if par_author is distinct from post_author then perform public.notify(post_author, new.author, 'comment', new.post_id, new.id, null, new.text); end if;
  foreach u in array public.mentioned_ids(new.text) loop
    if u is distinct from post_author and u is distinct from par_author then
      perform public.notify(u, new.author, 'mention', new.post_id, new.id, null, new.text);
    end if;
  end loop;
  return null;
end $$;
create or replace trigger comments_after after insert on public.comments
  for each row execute function public.comments_after();

create or replace function public.comment_likes_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select author, post_id, text into c from public.comments where id = new.comment_id;
  perform public.notify(c.author, new.user_id, 'clike', c.post_id, new.comment_id, null, c.text);
  return null;
end $$;
create or replace trigger comment_likes_after after insert on public.comment_likes
  for each row execute function public.comment_likes_after();

-- hikaye
create or replace function public.stories_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_at := now();
  return new;
end $$;
create or replace trigger stories_before before insert on public.stories
  for each row execute function public.stories_before();

create or replace function public.stories_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  foreach u in array coalesce(new.mentions, '{}') loop
    perform public.notify(u, new.author, 'storyMention', null, null, new.id);
  end loop;
  return null;
end $$;
create or replace trigger stories_after after insert on public.stories
  for each row execute function public.stories_after();

create or replace function public.story_likes_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.notify((select author from public.stories where id = new.story_id), new.user_id, 'slike', null, null, new.story_id);
  return null;
end $$;
create or replace trigger story_likes_after after insert on public.story_likes
  for each row execute function public.story_likes_after();

-- mesaj: sohbetin son mesajını ve okundu bilgisini güncelle
create or replace function public.msg_preview(m public.messages) returns text
language sql immutable as $$
  select case
    when m.unsent then 'Mesaj geri alındı'
    when m.enc is not null then '🔒 Şifreli mesaj'
    when m.text is not null and m.text <> '' then left(m.text, 120)
    when m.media ->> 'type' = 'audio' then '🎤 Sesli mesaj'
    when m.media ->> 'type' = 'video' then '🎬 Video'
    when m.media is not null then '📷 Fotoğraf'
    when m.post_id is not null then 'Bir gönderi paylaştı'
    else 'Mesaj' end
$$;

create or replace function public.messages_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.unsent := false; new.edited_at := null;
    if coalesce((select e2ee from public.threads where id = new.thread_id), false) then
      -- uçtan uca şifreli sohbet: sunucu sadece şifreli içeriği saklar, düz metin/medya/alıntı kabul edilmez
      if new.enc is null or new.text is not null or new.media is not null or new.post_id is not null or new.story is not null then
        raise exception 'e2ee_only';
      end if;
      new.reply_to := case when jsonb_typeof(new.reply_to) = 'object' and new.reply_to ? 'id' then jsonb_build_object('id', new.reply_to ->> 'id') else null end;
    else
      if new.enc is not null then raise exception 'e2ee_only'; end if;
      if coalesce(btrim(new.text), '') = '' and new.media is null and new.post_id is null then raise exception 'empty_message'; end if;
    end if;
  else
    new.id := old.id; new.thread_id := old.thread_id; new.sender := old.sender; new.created_at := old.created_at;
    if old.unsent then return old; end if;
    new.enc := old.enc;
    if new.unsent then
      new.text := null; new.media := null; new.post_id := null; new.story := null; new.reply_to := null; new.enc := null;
    elsif old.enc is not null then
      new.text := old.text;  -- şifreli mesaj düzenlenemez
    elsif new.text is distinct from old.text then
      if old.created_at < now() - interval '15 minutes' then raise exception 'edit_window'; end if;
      new.media := old.media; new.post_id := old.post_id; new.edited_at := now();
    end if;
  end if;
  return new;
end $$;
create or replace trigger messages_before before insert or update on public.messages
  for each row execute function public.messages_before();

create or replace function public.messages_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.threads set last_at = new.created_at,
      last = jsonb_build_object('id', new.id, 'from', new.sender, 'at', public.ms(new.created_at), 'text', public.msg_preview(new), 'post', new.post_id)
      where id = new.thread_id;
    update public.thread_members set last_read_at = new.created_at, accepted = true
      where thread_id = new.thread_id and user_id = new.sender;
  elsif (new.unsent and not old.unsent) or new.text is distinct from old.text then
    update public.threads set last = jsonb_set(jsonb_set(last, '{text}', to_jsonb(public.msg_preview(new))), '{post}', 'null'::jsonb)
      where id = new.thread_id and last ->> 'id' = new.id::text;
  end if;
  return null;
end $$;
create or replace trigger messages_after after insert or update on public.messages
  for each row execute function public.messages_after();

-- Banlı ya da 15 yaşını doldurmamış hesap paylaşamaz, beğenemez, yorum/mesaj yazamaz, takip edemez, profilini değiştiremez
create or replace function public.ban_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.user_banned(auth.uid()) then raise exception 'banned'; end if;
  if auth.uid() is not null and private.underage(auth.uid()) then raise exception 'too_young'; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'posts', 'post_likes', 'comments', 'comment_likes', 'stories', 'story_likes',
                           'follows', 'threads', 'thread_members', 'messages', 'message_reactions', 'reposts'] loop
    execute format('create or replace trigger aa_ban_guard before insert or update on public.%I for each row execute function public.ban_guard()', t);
  end loop;
end $$;

-- 15–18 yaş: hesap herkese açık yapılamaz
create or replace function public.profiles_teen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_private is distinct from true and private.teen(new.id) then new.is_private := true; end if;
  return new;
end $$;
create or replace trigger profiles_teen before update on public.profiles
  for each row execute function public.profiles_teen();

-- 15–18 yaş: okundu bilgisi gösterilmez. Gencin okuma konumu sohbet üyelerine görünen satıra değil, sadece kendisine açık tabloya yazılır.
create or replace function public.thread_members_teen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_read_at is distinct from old.last_read_at and private.teen(new.user_id) then
    insert into public.read_marks (user_id, thread_id, at) values (new.user_id, new.thread_id, new.last_read_at)
    on conflict (user_id, thread_id) do update set at = greatest(public.read_marks.at, excluded.at);
    new.last_read_at := old.last_read_at;
  end if;
  return new;
end $$;
create or replace trigger thread_members_teen before update on public.thread_members
  for each row execute function public.thread_members_teen();

-- Takip önerileri: 18 yaş altı hesaplar kimseye önerilmez, onlara da öneri gösterilmez
create or replace function private.suggestions(me uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(id order by score desc), '[]'::jsonb) from (
    select p.id,
      3 * (select count(*) from public.follows a join public.follows b on b.follower = a.following
           where a.follower = me and a.status = 'accepted' and b.following = p.id and b.status = 'accepted')
      + case when exists (select 1 from public.follows f where f.follower = p.id and f.following = me and f.status = 'accepted') then 5 else 0 end
      + case when p.avatar is not null then 1 else 0 end
      + extract(epoch from p.created_at) / 1e10 as score
    from public.profiles p
    where me is not null and not private.teen(me)
      and p.id <> me
      and not private.teen(p.id)
      and not exists (select 1 from public.follows f where f.follower = me and f.following = p.id)
      and not public.blocked_between(me, p.id)
      and not public.ban_hidden(p.id)
    order by score desc
    limit 30
  ) q;
$$;

-- =====================================================================
-- 5) MESAJLAŞMA FONKSİYONLARI
-- =====================================================================

-- 1:1 sohbet aç (secret = uçtan uca şifreli ayrı sohbet). 18 yaş altına sadece takip ettiği kişiler yeni sohbet açabilir.
create or replace function public.open_dm(other uuid, secret boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  k   text;
  tid uuid;
  follows_me boolean;
begin
  if me is null or other is null or other = me then raise exception 'bad_target'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'not_found'; end if;
  if public.blocked_between(me, other) then raise exception 'blocked'; end if;
  if public.ban_hidden(other) then raise exception 'not_found'; end if;
  follows_me := exists (select 1 from public.follows where follower = other and following = me and status = 'accepted');
  k := case when secret then 'e2e:' else '' end || least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into tid from public.threads where dm_key = k;
  if tid is null then
    if public.is_minor(other) and not follows_me then raise exception 'teen_dm'; end if;
    insert into public.threads (is_group, dm_key, created_by, e2ee) values (false, k, me, coalesce(secret, false))
    on conflict (dm_key) do update set dm_key = excluded.dm_key returning id into tid;
  end if;
  insert into public.thread_members (thread_id, user_id, accepted) values (tid, me, true) on conflict do nothing;
  insert into public.thread_members (thread_id, user_id, accepted) values (tid, other, follows_me) on conflict do nothing;
  return tid;
end $$;

create or replace function public.start_dm(other uuid) returns uuid
language sql security definer set search_path = public as $$ select public.open_dm(other, false) $$;

create or replace function public.start_secret_dm(other uuid) returns uuid
language sql security definer set search_path = public as $$ select public.open_dm(other, true) $$;

create or replace function public.create_group(member_ids uuid[], p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tid uuid; u uuid; n int := 0;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  insert into public.threads (is_group, title, created_by) values (true, nullif(left(btrim(coalesce(p_title, '')), 60), ''), me) returning id into tid;
  insert into public.thread_members (thread_id, user_id) values (tid, me);
  foreach u in array coalesce(member_ids, '{}') loop
    if u <> me and exists (select 1 from public.profiles where id = u) and not public.blocked_between(me, u) then
      insert into public.thread_members (thread_id, user_id) values (tid, u) on conflict do nothing;
      n := n + 1;
    end if;
    exit when n >= 31;
  end loop;
  if n < 1 then raise exception 'need_members'; end if;
  return tid;
end $$;

create or replace function public.add_group_members(tid uuid, member_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); u uuid;
begin
  if not exists (select 1 from public.threads where id = tid and is_group) or not public.is_member(tid) then raise exception 'not_allowed'; end if;
  foreach u in array coalesce(member_ids, '{}') loop
    if (select count(*) from public.thread_members where thread_id = tid) >= 32 then exit; end if;
    if exists (select 1 from public.profiles where id = u) and not public.blocked_between(me, u) then
      insert into public.thread_members (thread_id, user_id) values (tid, u) on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function public.rename_group(tid uuid, p_title text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.threads where id = tid and is_group) or not public.is_member(tid) then raise exception 'not_allowed'; end if;
  update public.threads set title = nullif(left(btrim(coalesce(p_title, '')), 60), '') where id = tid;
end $$;


-- görüntülenme sayısı (kimin izlediği gizli kalır)
create or replace function public.view_count(pid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.post_views where post_id = pid;
$$;

-- video izlendi: görebildiği bir gönderiyse ve sahibi değilse bir kez sayılır.
-- Yeni sayıldıysa true döner.
create or replace function public.view_post(pid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.post_views (post_id, viewer)
  select p.id, auth.uid() from public.posts p
  where p.id = pid and p.author <> auth.uid() and not p.archived and public.can_view(p.author)
    and exists (select 1 from jsonb_array_elements(p.media) m where m ->> 'type' = 'video')
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- yorum sabitleme (gönderi sahibi)
create or replace function public.pin_comment(cid uuid, v boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select c.post_id into pid from public.comments c join public.posts p on p.id = c.post_id where c.id = cid and p.author = auth.uid();
  if pid is null then raise exception 'not_allowed'; end if;
  if v and (select count(*) from public.comments where post_id = pid and pinned) >= 3 then raise exception 'pin_limit'; end if;
  update public.comments set pinned = v where id = cid;
end $$;

-- =====================================================================
-- 5b) YÖNETİCİ (öne çıkarma, algoritma ayarı, şikayetler, mavi tik)
-- =====================================================================

-- Yöneticiler (uygulamadan değiştirilemez; sadece veritabanından eklenir)
create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Uygulama ayarları (ör. akış algoritmasının ağırlıkları). Herkes okur, sadece yönetici yazar.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Öne çıkarılan gönderiler
create table if not exists public.post_boosts (
  post_id    uuid primary key references public.posts (id) on delete cascade,
  weight     numeric not null check (weight >= 0 and weight <= 10),
  until      timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Yöneticinin kaldırdığı gönderiler (sahibi dışında kimse göremez)
create table if not exists public.post_removals (
  post_id    uuid primary key references public.posts (id) on delete cascade,
  active     boolean not null default true,
  reason     text check (char_length(reason) <= 300),
  removed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.reports add column if not exists resolved_at timestamptz;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.boost_of(pid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select weight from public.post_boosts where post_id = pid and until > now()), 0);
$$;

create or replace function public.post_removed(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.post_removals where post_id = pid and active);
$$;

create or replace function public.admin_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
end $$;

-- Genel bakış
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_check();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'usersToday', (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'posts', (select count(*) from public.posts),
    'postsToday', (select count(*) from public.posts where created_at > now() - interval '24 hours'),
    'stories', (select count(*) from public.stories where created_at > now() - interval '24 hours'),
    'messagesToday', (select count(*) from public.messages where created_at > now() - interval '24 hours'),
    'views', (select count(*) from public.post_views),
    'openReports', (select count(*) from public.reports where resolved_at is null),
    'banned', (select count(*) from public.user_bans where active and (until is null or until > now())),
    'appeals', (select count(*) from public.user_bans where active and (until is null or until > now()) and appeal_at is not null and not appeal_rejected),
    'boosts', coalesce((select jsonb_agg(jsonb_build_object('post', b.post_id, 'weight', b.weight, 'until', public.ms(b.until)) order by b.created_at desc)
                        from public.post_boosts b where b.until > now()), '[]'::jsonb),
    'removed', coalesce((select jsonb_agg(jsonb_build_object('post', r.post_id, 'reason', r.reason, 'at', public.ms(r.created_at)) order by r.created_at desc)
                         from public.post_removals r where r.active), '[]'::jsonb)
  );
end $$;

-- Açık şikayetler (önizlemeleriyle)
create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_check();
  return coalesce((select jsonb_agg(x order by (x ->> 'at')::bigint desc) from (
    select jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'target', r.target, 'reason', r.reason, 'at', public.ms(r.created_at), 'reporter', r.reporter,
      'count', (select count(*) from public.reports r2 where r2.kind = r.kind and r2.target = r.target and r2.resolved_at is null),
      'preview', case r.kind
        when 'post' then (select jsonb_build_object('author', p.author, 'caption', p.caption, 'media', p.media, 'removed', public.post_removed(p.id))
                          from public.posts p where p.id::text = r.target)
        when 'user' then (select jsonb_build_object('author', p.id, 'caption', p.bio) from public.profiles p where p.id::text = r.target)
        when 'comment' then (select jsonb_build_object('author', c.author, 'caption', c.text, 'post', c.post_id) from public.comments c where c.id::text = r.target)
        when 'story' then (select jsonb_build_object('author', s.author, 'media', s.media) from public.stories s where s.id::text = r.target)
        when 'message' then (select jsonb_build_object('author', m.sender, 'caption', m.text) from public.messages m where m.id::text = r.target)
      end
    ) as x
    from public.reports r where r.resolved_at is null
    order by r.created_at desc limit 200
  ) q), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_report(rid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare k text; t text;
begin
  perform public.admin_check();
  select kind, target into k, t from public.reports where id = rid;
  update public.reports set resolved_at = now() where kind = k and target = t and resolved_at is null;
end $$;

-- Gönderiyi kaldır / geri getir
create or replace function public.admin_remove_post(pid uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  insert into public.post_removals (post_id, active, reason, removed_by) values (pid, true, left(p_reason, 300), auth.uid())
  on conflict (post_id) do update set active = true, reason = excluded.reason, removed_by = excluded.removed_by, created_at = now();
  update public.reports set resolved_at = now() where kind = 'post' and target = pid::text and resolved_at is null;
end $$;

create or replace function public.admin_restore_post(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  update public.post_removals set active = false where post_id = pid;
end $$;

-- Öne çıkar (weight 0 = öne çıkarmayı bitir)
create or replace function public.admin_boost_post(pid uuid, p_weight numeric, p_days int default 3) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  if not exists (select 1 from public.posts where id = pid) then raise exception 'not_found'; end if;
  insert into public.post_boosts (post_id, weight, until, created_by)
  values (pid, greatest(0, least(10, coalesce(p_weight, 0))), case when coalesce(p_weight, 0) > 0 then now() + make_interval(days => greatest(1, least(30, coalesce(p_days, 3)))) else now() end, auth.uid())
  on conflict (post_id) do update set weight = excluded.weight, until = excluded.until, created_by = excluded.created_by, created_at = now();
end $$;

-- Algoritma ağırlıkları: her biri 0 ile 2 arası (1 = normal)
create or replace function public.admin_set_rank(v jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text; out jsonb := '{}'::jsonb; n numeric;
begin
  perform public.admin_check();
  foreach k in array array['video', 'follow', 'fresh', 'popular', 'newcomer', 'interest'] loop
    begin n := (v ->> k)::numeric; exception when others then n := null; end;
    if n is not null then out := out || jsonb_build_object(k, round(greatest(0, least(2, n)), 2)); end if;
  end loop;
  insert into public.app_settings (key, value, updated_at) values ('rank', out, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return out;
end $$;

-- Mavi tik
create or replace function public.admin_set_verified(uid uuid, v boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  update public.profiles set verified = coalesce(v, false) where id = uid;
end $$;

-- Ban bilgisi (yalnızca yönetici fonksiyonları ve kişinin kendisi için)
create or replace function public.ban_json(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when b.user_id is null then null else jsonb_build_object(
    'reason', b.reason, 'until', case when b.until is null then null else public.ms(b.until) end, 'at', public.ms(b.created_at),
    'appeal', b.appeal, 'appealAt', case when b.appeal_at is null then null else public.ms(b.appeal_at) end, 'appealRejected', b.appeal_rejected
  ) end
  from (select 1) one
  left join public.user_bans b on b.user_id = uid and b.active and (b.until is null or b.until > now());
$$;

-- Banla: p_days boş ya da 0 ise kalıcı. Yönetici kendini ya da başka bir yöneticiyi banlayamaz.
create or replace function public.admin_ban_user(uid uuid, p_reason text default null, p_days int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  if uid is null or uid = auth.uid() or exists (select 1 from public.app_admins where user_id = uid) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'not_found'; end if;
  insert into public.user_bans (user_id, active, reason, until, banned_by, created_at, appeal, appeal_at, appeal_rejected, lifted_at)
  values (uid, true, nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
          case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(3650, p_days)) else null end,
          auth.uid(), now(), null, null, false, null)
  on conflict (user_id) do update set active = true, reason = excluded.reason, until = excluded.until, banned_by = excluded.banned_by,
    created_at = now(), appeal = null, appeal_at = null, appeal_rejected = false, lifted_at = null;
  update public.reports set resolved_at = now() where kind = 'user' and target = uid::text and resolved_at is null;
  update public.profiles set last_seen = last_seen where id = uid;  -- banlanan kişinin uygulaması anında haberdar olsun
  return public.ban_json(uid);
end $$;

create or replace function public.admin_unban_user(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  update public.user_bans set active = false, lifted_at = now() where user_id = uid and active;
  update public.profiles set last_seen = last_seen where id = uid;
end $$;

-- İtirazı reddet (ban sürer, kişi itirazının incelendiğini görür)
create or replace function public.admin_reject_appeal(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  update public.user_bans set appeal_rejected = true where user_id = uid and active and appeal_at is not null;
  update public.profiles set last_seen = last_seen where id = uid;
end $$;

create or replace function public.admin_user_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.full_name, 'avatar', p.avatar, 'verified', p.verified, 'at', public.ms(p.created_at),
    'admin', exists (select 1 from public.app_admins a where a.user_id = p.id),
    'posts', (select count(*) from public.posts where author = p.id),
    'followers', (select count(*) from public.follows where following = p.id and status = 'accepted'),
    'reports', (select count(*) from public.reports r where r.kind = 'user' and r.target = p.id::text and r.resolved_at is null),
    'ban', public.ban_json(p.id)
  );
$$;

-- Kullanıcılar: arama sonuçları (boş aramada en yeni hesaplar) + şu an banlı olanlar
create or replace function public.admin_users(q text default '') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t text := regexp_replace(lower(btrim(coalesce(q, ''))), '^@', '');
begin
  perform public.admin_check();
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(public.admin_user_json(p) order by (p.username = t) desc, p.created_at desc) from (
        select * from public.profiles p
        where t = '' or position(t in p.username) > 0 or position(t in lower(p.full_name)) > 0
        order by (p.username = t) desc, p.created_at desc limit 40) p), '[]'::jsonb),
    'banned', coalesce((select jsonb_agg(public.admin_user_json(p) order by (b.appeal_at is not null and not b.appeal_rejected) desc, b.created_at desc)
        from public.user_bans b join public.profiles p on p.id = b.user_id
        where b.active and (b.until is null or b.until > now())), '[]'::jsonb)
  );
end $$;

-- Kişinin kendi ban durumu ve itirazı
create or replace function public.my_ban() returns jsonb
language sql stable security definer set search_path = public as $$
  select public.ban_json(auth.uid());
$$;

create or replace function public.ban_appeal(p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(btrim(coalesce(p_text, ''))) < 3 then raise exception 'empty_message'; end if;
  if exists (select 1 from public.user_bans where user_id = auth.uid() and active and appeal_at is not null) then raise exception 'appeal_sent'; end if;
  update public.user_bans set appeal = left(btrim(p_text), 1000), appeal_at = now()
  where user_id = auth.uid() and active and (until is null or until > now());
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- =====================================================================
-- 5c) MÜZİK KÜTÜPHANESİ
-- =====================================================================
create table if not exists public.music_tracks (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique,
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  artist     text not null default '' check (char_length(artist) <= 80),
  genre      text not null default '' check (char_length(genre) <= 40),
  mood       text not null default '' check (char_length(mood) <= 40),
  url        text not null check (char_length(url) <= 500),
  duration   numeric not null check (duration > 0 and duration <= 900),
  active     boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.posts add column if not exists music jsonb check (music is null or (jsonb_typeof(music) = 'object' and char_length(music::text) <= 1000));
alter table public.stories add column if not exists music jsonb check (music is null or (jsonb_typeof(music) = 'object' and char_length(music::text) <= 1000));

create or replace function public.admin_add_track(p_title text, p_artist text, p_genre text, p_url text, p_duration numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  perform public.admin_check();
  if coalesce(p_url, '') !~ ('^' || auth.uid()::text || '/music/') then raise exception 'bad_url'; end if;
  insert into public.music_tracks (title, artist, genre, url, duration, created_by)
  values (left(btrim(p_title), 80), left(btrim(coalesce(p_artist, '')), 80), left(btrim(coalesce(p_genre, '')), 40), p_url, p_duration, auth.uid())
  returning id into tid;
  return tid;
end $$;

create or replace function public.admin_set_track_active(tid uuid, v boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  update public.music_tracks set active = coalesce(v, false) where id = tid;
end $$;

-- =====================================================================
-- 5d) YAŞ, HASSAS İÇERİK, ŞİPŞAK, ŞİFRELİ SOHBET, YIL ÖZETİ
-- =====================================================================

-- Doğum yılı bir kez girilir (sonradan değiştirilemez). 15 yaşını doldurmamış kullanamaz (yıl kaydedilir, hesap kapanır);
-- 18 altı: gizli hesap, hassas içerik kapalı, takip listeleri gizli, okundu bilgisi yok, önerilerde çıkmaz.
create or replace function public.set_birth_year(y int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cy int := extract(year from now())::int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if y is null or y < cy - 120 or y > cy then raise exception 'birth_year_invalid'; end if;
  if y > cy - 16 then
    update public.accounts set birth_year = y where user_id = auth.uid() and birth_year is null;
    if not found then raise exception 'birth_year_set'; end if;
    return jsonb_build_object('birthYear', y, 'minor', true, 'underage', true);
  end if;
  update public.accounts set birth_year = y,
    prefs = case when y > cy - 18 then prefs || '{"sensitive":"hide"}'::jsonb else prefs end
  where user_id = auth.uid() and birth_year is null;
  if not found then raise exception 'birth_year_set'; end if;
  if y > cy - 18 then update public.profiles set is_private = true where id = auth.uid(); end if;
  return jsonb_build_object('birthYear', y, 'minor', y > cy - 18);
end $$;

-- Kişisel tercihler. sensitive: show (göster) | blur (bulanık, varsayılan) | hide (gizle). 18 altı için hep gizle.
create or replace function public.set_prefs(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb; sv text := p ->> 'sensitive';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if sv is not null and sv not in ('show', 'blur', 'hide') then raise exception 'bad_value'; end if;
  if sv is not null and sv <> 'hide' and public.is_minor(auth.uid()) then raise exception 'teen_locked'; end if;
  update public.accounts set prefs = prefs || jsonb_strip_nulls(jsonb_build_object('sensitive', sv))
  where user_id = auth.uid() returning prefs into cur;
  return cur;
end $$;

-- Yönetici bir gönderiyi hassas olarak işaretler (sahibi bu işareti kaldıramaz)
create or replace function public.admin_set_sensitive(pid uuid, v boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check();
  update public.posts set sensitive = coalesce(v, false), sensitive_admin = coalesce(v, false) where id = pid;
end $$;

-- Şipşak: gönderen; alıcılar onu takip eden ve (yakın arkadaş | karşılıklı takip) olanlar
create or replace function public.snap_sender(sid uuid) returns uuid
language sql stable security definer set search_path = public as $$ select sender from public.snaps where id = sid $$;

create or replace function public.send_snap(p_media jsonb, p_audience text default 'mutual', p_caption text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); sid uuid; n int;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if public.user_banned(me) then raise exception 'banned'; end if;
  if coalesce(p_audience, '') not in ('close', 'mutual') then raise exception 'bad_value'; end if;
  if jsonb_typeof(p_media) is distinct from 'object' or p_media ->> 'type' is distinct from 'image'
     or coalesce(p_media ->> 'id', '') !~ ('^' || me::text || '/i/') then raise exception 'bad_media'; end if;
  insert into public.snaps (sender, media, caption, audience)
  values (me, p_media, nullif(left(btrim(coalesce(p_caption, '')), 80), ''), p_audience) returning id into sid;
  insert into public.snap_recipients (snap_id, user_id)
  select sid, f.follower from public.follows f
  where f.following = me and f.status = 'accepted'
    and case when p_audience = 'close'
          then exists (select 1 from public.close_friends c where c.owner = me and c.friend = f.follower)
          else exists (select 1 from public.follows g where g.follower = me and g.following = f.follower and g.status = 'accepted') end
    and not public.blocked_between(me, f.follower) and not public.user_banned(f.follower) and not private.underage(f.follower);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'no_recipients'; end if;
  return jsonb_build_object('id', sid, 'count', n);
end $$;

-- Şipşağı aç (bir kez görülür) ve isteğe bağlı tepki bırak
create or replace function public.open_snap(sid uuid, p_reaction text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.snap_recipients set seen_at = coalesce(seen_at, now()), reaction = coalesce(nullif(left(btrim(coalesce(p_reaction, '')), 16), ''), reaction)
  where snap_id = sid and user_id = auth.uid();
end $$;

-- Bana gelen (henüz görmediğim) ve son 24 saatte gönderdiğim şipşaklar
create or replace function public.my_snaps() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'inbox', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'from', s.sender, 'media', s.media, 'caption', s.caption, 'at', public.ms(s.created_at)) order by s.created_at)
      from public.snaps s join public.snap_recipients r on r.snap_id = s.id
      where r.user_id = auth.uid() and r.seen_at is null and s.expires_at > now()
        and not public.blocked_between(s.sender, auth.uid()) and not public.ban_hidden(s.sender)), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'media', s.media, 'caption', s.caption, 'audience', s.audience, 'at', public.ms(s.created_at),
        'to', (select count(*) from public.snap_recipients r where r.snap_id = s.id),
        'seen', (select coalesce(jsonb_agg(jsonb_build_object('id', r.user_id, 'at', public.ms(r.seen_at), 'reaction', r.reaction) order by r.seen_at), '[]'::jsonb)
                 from public.snap_recipients r where r.snap_id = s.id and r.seen_at is not null)) order by s.created_at desc)
      from public.snaps s where s.sender = auth.uid() and s.expires_at > now()), '[]'::jsonb)
  );
$$;

-- Yıl özeti: o yıl paylaştıkların, topladıkların, en sevilen gönderin, etiketlerin, en çok etkileşimde olduğun kişiler
create or replace function public.year_recap(y int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t0 timestamptz;
  t1 timestamptz;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if y is null or y < 2000 or y > extract(year from now())::int then raise exception 'bad_value'; end if;
  t0 := make_timestamptz(y, 1, 1, 0, 0, 0, 'Europe/Istanbul');
  t1 := make_timestamptz(y + 1, 1, 1, 0, 0, 0, 'Europe/Istanbul');
  return jsonb_build_object(
    'year', y,
    'joined', (select extract(year from created_at)::int from public.profiles where id = me),
    'posts', (select count(*) from public.posts where author = me and kind = 'post' and created_at >= t0 and created_at < t1),
    'reels', (select count(*) from public.posts where author = me and kind = 'reel' and created_at >= t0 and created_at < t1),
    'stories', (select count(*) from public.stories where author = me and created_at >= t0 and created_at < t1),
    'likes', (select count(*) from public.post_likes l join public.posts p on p.id = l.post_id
              where p.author = me and l.user_id <> me and l.created_at >= t0 and l.created_at < t1),
    'comments', (select count(*) from public.comments c join public.posts p on p.id = c.post_id
                 where p.author = me and c.author <> me and c.created_at >= t0 and c.created_at < t1),
    'views', (select count(*) from public.post_views v join public.posts p on p.id = v.post_id
              where p.author = me and v.viewer <> me and v.created_at >= t0 and v.created_at < t1),
    'followers', (select count(*) from public.follows where following = me and status = 'accepted' and created_at >= t0 and created_at < t1),
    'messages', (select count(*) from public.messages where sender = me and created_at >= t0 and created_at < t1),
    'likesGiven', (select count(*) from public.post_likes where user_id = me and created_at >= t0 and created_at < t1),
    'activeDays', (select count(distinct d) from (
        select (created_at at time zone 'Europe/Istanbul')::date d from public.posts where author = me and created_at >= t0 and created_at < t1
        union select (created_at at time zone 'Europe/Istanbul')::date from public.stories where author = me and created_at >= t0 and created_at < t1
        union select (created_at at time zone 'Europe/Istanbul')::date from public.comments where author = me and created_at >= t0 and created_at < t1
        union select (created_at at time zone 'Europe/Istanbul')::date from public.messages where sender = me and created_at >= t0 and created_at < t1) x),
    'topPost', (select public.post_json(p) from public.posts p
                where p.author = me and not p.archived and p.created_at >= t0 and p.created_at < t1
                order by (select count(*) from public.post_likes l where l.post_id = p.id) desc, p.created_at desc limit 1),
    'topTags', coalesce((select jsonb_agg(tag order by n desc, tag) from (
        select lower(m[1]) tag, count(*) n from public.posts p, regexp_matches(p.caption, '#([^[:space:]#.,!?;:()]+)', 'g') m
        where p.author = me and p.created_at >= t0 and p.created_at < t1 group by 1 order by 2 desc, 1 limit 3) q), '[]'::jsonb),
    'topPeople', coalesce((select jsonb_agg(uid order by n desc) from (
        select p.author uid, count(*) n from public.post_likes l join public.posts p on p.id = l.post_id
        where l.user_id = me and p.author <> me and l.created_at >= t0 and l.created_at < t1
          and not public.blocked_between(me, p.author) and not public.ban_hidden(p.author)
        group by 1 order by 2 desc limit 3) q), '[]'::jsonb)
  );
end $$;

-- En sevdiğin yıl: senin seçimin + toplu istatistik (kimin neyi seçtiği paylaşılmaz)
create or replace function public.favorite_year_info() returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (select year, season from public.favorite_years where user_id = auth.uid())
  select jsonb_build_object(
    'mine', (select jsonb_build_object('year', year, 'season', season) from mine),
    'total', (select count(*) from public.favorite_years),
    'sameYear', (select count(*) from public.favorite_years f join mine on f.year = mine.year),
    'summer', (select count(*) from public.favorite_years f join mine on f.year = mine.year where f.season = 'yaz'),
    'winter', (select count(*) from public.favorite_years f join mine on f.year = mine.year where f.season = 'kis'),
    'top', (select jsonb_build_object('year', year, 'count', count(*)) from public.favorite_years group by year order by count(*) desc, year desc limit 1)
  );
$$;

create or replace function public.set_favorite_year(y int, p_season text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if y is null or y < 1950 or y > extract(year from now())::int then raise exception 'bad_value'; end if;
  if p_season is not null and p_season not in ('kis', 'yaz') then raise exception 'bad_value'; end if;
  insert into public.favorite_years (user_id, year, season, updated_at) values (auth.uid(), y, p_season, now())
  on conflict (user_id) do update set
    season = case when public.favorite_years.year = excluded.year then coalesce(excluded.season, public.favorite_years.season) else excluded.season end,
    year = excluded.year, updated_at = now();
  return public.favorite_year_info();
end $$;

-- =====================================================================
-- 6) VERİ OKUMA (tek seferde açılış verisi)
-- =====================================================================

create or replace function public.post_json(p public.posts) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'author', p.author, 'kind', p.kind, 'media', p.media, 'caption', p.caption, 'location', p.location,
    'filter', p.filter, 'adjust', p.adjust, 'tagged', to_jsonb(p.tagged), 'hideLikes', p.hide_likes, 'noComments', p.comments_off,
    'pinned', p.pinned, 'archived', p.archived, 'at', public.ms(p.created_at), 'edited', case when p.edited_at is null then null else public.ms(p.edited_at) end,
    'likes', coalesce((select jsonb_object_agg(l.user_id, public.ms(l.created_at)) from public.post_likes l where l.post_id = p.id), '{}'::jsonb),
    'views', public.view_count(p.id),
    'boost', public.boost_of(p.id), 'removed', public.post_removed(p.id), 'music', p.music,
    'sensitive', p.sensitive, 'sensitiveAdmin', p.sensitive_admin,
    'reposts', (select count(*) from public.reposts r where r.post_id = p.id)
  );
$$;

create or replace function public.comment_json(c public.comments) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'post', c.post_id, 'author', c.author, 'parent', c.parent_id, 'text', c.text, 'pinned', c.pinned, 'at', public.ms(c.created_at),
    'likes', coalesce((select jsonb_object_agg(l.user_id, public.ms(l.created_at)) from public.comment_likes l where l.comment_id = c.id), '{}'::jsonb)
  );
$$;

create or replace function public.story_json(s public.stories) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', s.id, 'author', s.author, 'media', s.media, 'text', s.text_story, 'filter', s.filter, 'adjust', s.adjust, 'overlay', s.overlay,
    'sharedPost', s.shared_post, 'mentions', to_jsonb(s.mentions), 'closeFriends', s.close_friends, 'at', public.ms(s.created_at), 'music', s.music,
    'views', coalesce((select jsonb_object_agg(v.viewer, public.ms(v.created_at)) from public.story_views v where v.story_id = s.id), '{}'::jsonb),
    'likes', coalesce((select jsonb_object_agg(l.user_id, public.ms(l.created_at)) from public.story_likes l where l.story_id = s.id), '{}'::jsonb)
  );
$$;

create or replace function public.profile_json(p public.profiles) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'displayName', p.full_name, 'bio', p.bio, 'website', p.website, 'category', p.category,
    'avatar', p.avatar, 'private', p.is_private, 'verified', p.verified, 'showActivity', p.show_activity, 'highlights', p.highlights,
    'note', case when p.note_at > now() - interval '24 hours' then p.note else null end, 'noteAt', case when p.note_at is null then null else public.ms(p.note_at) end,
    'lastSeen', case when p.show_activity and p.last_seen is not null then public.ms(p.last_seen) else null end, 'at', public.ms(p.created_at),
    'banned', case when public.is_admin() then private.banned(p.id) else false end
  );
$$;

create or replace function public.thread_json(t public.threads) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', t.id, 'isGroup', t.is_group, 'title', t.title, 'createdBy', t.created_by, 'at', public.ms(t.last_at), 'last', t.last, 'e2ee', t.e2ee,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id,
                           'read', case when m.user_id = auth.uid()
                                          then public.ms(greatest(m.last_read_at, coalesce((select r.at from public.read_marks r where r.user_id = m.user_id and r.thread_id = t.id), m.last_read_at)))
                                        when private.teen(m.user_id) then null
                                        else public.ms(m.last_read_at) end,
                           'accepted', m.accepted, 'muted', m.muted) order by m.joined_at)
                         from public.thread_members m where m.thread_id = t.id), '[]'::jsonb)
  );
$$;

-- izlediğim videolar (akış algoritması için; sadece kendi listemi görürüm)
create or replace function public.my_views() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(post_id), '[]'::jsonb) from (
    select post_id from public.post_views where viewer = auth.uid() order by created_at desc limit 2000
  ) v;
$$;

create or replace function public.bootstrap() returns jsonb
language sql stable set search_path = public as $$
  with me as (select auth.uid() as id),
  rp as (
    select r.* from public.reposts r
    where r.created_at > now() - interval '30 days'
      and (r.user_id = (select id from me)
           or exists (select 1 from public.follows f where f.follower = (select id from me) and f.following = r.user_id and f.status = 'accepted'))
    order by r.created_at desc limit 500
  ),
  ids as (
    select x.id from (select p.id from public.posts p order by p.created_at desc limit 400) x
    union select p.id from public.posts p where p.author = (select id from me)
    union select s.post_id from public.saves s where s.user_id = (select id from me)
    union select rp.post_id from rp
  ),
  feed as (select p.* from public.posts p where p.id in (select id from ids))
  select jsonb_build_object(
    'me', (select id from me),
    'account', (select jsonb_build_object('email', a.email, 'phone', a.phone, 'birthYear', a.birth_year, 'minor', public.am_minor(), 'prefs', a.prefs)
                from public.accounts a where a.user_id = auth.uid()),
    'profiles', coalesce((select jsonb_agg(public.profile_json(p)) from (select * from public.profiles order by created_at limit 5000) p), '[]'::jsonb),
    'follows', coalesce((select jsonb_agg(jsonb_build_array(f.follower, f.following, f.status, public.ms(f.created_at))) from public.follows f), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(public.post_json(f)) from feed f), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(public.comment_json(c) order by c.created_at) from public.comments c where c.post_id in (select id from feed)), '[]'::jsonb),
    'stories', coalesce((select jsonb_agg(public.story_json(s)) from public.stories s where s.created_at > now() - interval '24 hours' or s.author = auth.uid()), '[]'::jsonb),
    'threads', coalesce((select jsonb_agg(public.thread_json(t)) from public.threads t where public.is_member(t.id)), '[]'::jsonb),
    'saves', coalesce((select jsonb_object_agg(s.post_id, public.ms(s.created_at)) from public.saves s where s.user_id = auth.uid()), '{}'::jsonb),
    'hidden', coalesce((select jsonb_object_agg(h.post_id, public.ms(h.created_at)) from public.hidden_posts h where h.user_id = auth.uid()), '{}'::jsonb),
    'blocks', coalesce((select jsonb_agg(b.blocked) from public.blocks b where b.blocker = auth.uid()), '[]'::jsonb),
    'mutes', coalesce((select jsonb_agg(m.target) from public.mutes m where m.owner = auth.uid()), '[]'::jsonb),
    'closeFriends', coalesce((select jsonb_agg(c.friend) from public.close_friends c where c.owner = auth.uid()), '[]'::jsonb),
    'reposts', coalesce((select jsonb_agg(jsonb_build_array(r.user_id, r.post_id, public.ms(r.created_at))) from rp r
                         where exists (select 1 from feed f where f.id = r.post_id)), '[]'::jsonb),
    'viewed', public.my_views(),
    'isAdmin', public.is_admin(),
    'ban', public.my_ban(),
    'underage', private.underage(auth.uid()),
    'suggest', private.suggestions(auth.uid()),
    'snaps', public.my_snaps(),
    'favoriteYear', public.favorite_year_info() -> 'mine',
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.app_settings s), '{}'::jsonb),
    'notifications', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('id', n.id, 'kind', n.kind, 'actor', n.actor, 'post', n.post_id, 'cid', n.comment_id, 'story', n.story_id,
                                  'text', n.text, 'at', public.ms(n.created_at), 'read', n.read_at is not null) x
        from public.notifications n where n.user_id = auth.uid() order by n.created_at desc limit 200) q), '[]'::jsonb)
  );
$$;

create or replace function public.get_posts(ids uuid[]) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(public.post_json(p)) from public.posts p where p.id = any (ids)), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(public.comment_json(c) order by c.created_at) from public.comments c where c.post_id = any (ids)), '[]'::jsonb)
  );
$$;

create or replace function public.user_posts(uid uuid) returns jsonb
language sql stable set search_path = public as $$
  with rp as (select * from public.reposts r where r.user_id = uid order by r.created_at desc limit 200),
  ps as (
    (select * from public.posts where author = uid or uid = any (tagged) order by created_at desc limit 300)
    union select p.* from public.posts p where p.id in (select post_id from rp)
  )
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(public.post_json(p)) from ps p), '[]'::jsonb),
    'reposts', coalesce((select jsonb_agg(jsonb_build_array(r.user_id, r.post_id, public.ms(r.created_at))) from rp r
                         where exists (select 1 from ps where ps.id = r.post_id)), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(public.comment_json(c) order by c.created_at) from public.comments c where c.post_id in (select id from ps)), '[]'::jsonb)
  );
$$;

create or replace function public.get_stories(ids uuid[]) returns jsonb
language sql stable set search_path = public as $$
  select coalesce((select jsonb_agg(public.story_json(s)) from public.stories s where s.id = any (ids)), '[]'::jsonb);
$$;

create or replace function public.get_thread(tid uuid) returns jsonb
language sql stable set search_path = public as $$
  select public.thread_json(t) from public.threads t where t.id = tid and public.is_member(t.id);
$$;

create or replace function public.message_json(m public.messages) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', m.id, 'thread', m.thread_id, 'from', m.sender, 'text', m.text, 'media', m.media, 'post', m.post_id, 'story', m.story,
    'replyTo', m.reply_to, 'unsent', m.unsent, 'edited', m.edited_at is not null, 'at', public.ms(m.created_at), 'enc', m.enc,
    'reactions', coalesce((select jsonb_object_agg(r.user_id, r.emoji) from public.message_reactions r where r.message_id = m.id), '{}'::jsonb)
  );
$$;

create or replace function public.get_messages(tid uuid, before_ms bigint default null, lim int default 80) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(public.message_json(x) order by x.created_at), '[]'::jsonb) from (
    select * from public.messages m
    where m.thread_id = tid and public.is_member(tid) and (before_ms is null or m.created_at < to_timestamp(before_ms / 1000.0))
    order by m.created_at desc limit least(greatest(lim, 1), 200)
  ) x;
$$;

-- =====================================================================
-- 7) GÜVENLİK KURALLARI (Row Level Security)
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.usernames         enable row level security;
alter table public.accounts          enable row level security;
alter table public.signup_log        enable row level security;
alter table public.blocks            enable row level security;
alter table public.follows           enable row level security;
alter table public.mutes             enable row level security;
alter table public.close_friends     enable row level security;
alter table public.posts             enable row level security;
alter table public.post_likes        enable row level security;
alter table public.post_views        enable row level security;
alter table public.saves             enable row level security;
alter table public.hidden_posts      enable row level security;
alter table public.comments          enable row level security;
alter table public.comment_likes     enable row level security;
alter table public.stories           enable row level security;
alter table public.story_views       enable row level security;
alter table public.story_likes       enable row level security;
alter table public.threads           enable row level security;
alter table public.thread_members    enable row level security;
alter table public.messages          enable row level security;
alter table public.message_reactions enable row level security;
alter table public.notifications     enable row level security;
alter table public.reports           enable row level security;
alter table public.app_admins        enable row level security;
alter table public.app_settings      enable row level security;
alter table public.post_boosts       enable row level security;
alter table public.post_removals     enable row level security;
alter table public.music_tracks      enable row level security;
alter table public.user_bans         enable row level security;
alter table public.snaps             enable row level security;
alter table public.snap_recipients   enable row level security;
alter table public.device_keys       enable row level security;
alter table public.favorite_years    enable row level security;
alter table public.reposts           enable row level security;
alter table public.read_marks        enable row level security;

-- gençlerin okuma konumu: sadece kendisi görür
drop policy if exists read_marks_select on public.read_marks;
create policy read_marks_select on public.read_marks for select to authenticated using (user_id = auth.uid());

-- yeniden paylaşımlar: gönderiyi ve paylaşanı görebiliyorsan görürsün
drop policy if exists reposts_select on public.reposts;
create policy reposts_select on public.reposts for select to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id) and (user_id = auth.uid() or public.can_view(user_id))
);
drop policy if exists reposts_insert on public.reposts;
create policy reposts_insert on public.reposts for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and not p.archived)
);
drop policy if exists reposts_delete on public.reposts;
create policy reposts_delete on public.reposts for delete to authenticated using (user_id = auth.uid());

-- şipşak: gönderen kendi şipşağını görür/geri alır; alıcılar şipşağı my_snaps() ile alır
drop policy if exists snaps_select on public.snaps;
create policy snaps_select on public.snaps for select to authenticated using (sender = auth.uid());
drop policy if exists snaps_delete on public.snaps;
create policy snaps_delete on public.snaps for delete to authenticated using (sender = auth.uid());
drop policy if exists snap_recipients_select on public.snap_recipients;
create policy snap_recipients_select on public.snap_recipients for select to authenticated using (user_id = auth.uid() or public.snap_sender(snap_id) = auth.uid());

-- cihaz anahtarları: açık anahtarlar herkese açık (şifrelemek için gerekli); kişi en fazla 10 cihaz ekler, kendi cihazını siler
drop policy if exists device_keys_select on public.device_keys;
create policy device_keys_select on public.device_keys for select to authenticated using (true);
drop policy if exists device_keys_insert on public.device_keys;
create policy device_keys_insert on public.device_keys for insert to authenticated
  with check (user_id = auth.uid() and (select count(*) from public.device_keys d where d.user_id = auth.uid()) < 10);
drop policy if exists device_keys_delete on public.device_keys;
create policy device_keys_delete on public.device_keys for delete to authenticated using (user_id = auth.uid());
drop policy if exists music_select on public.music_tracks;
create policy music_select on public.music_tracks for select to authenticated using (active or public.is_admin());
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated using (true);

-- profiller: herkes görür (seni engelleyenler hariç), sadece kendin düzenlersin
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (not public.blocked_me(id) and not private.hidden(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts for select to authenticated using (user_id = auth.uid());

-- engelleme
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated using (blocker = auth.uid());
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker = auth.uid());
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete to authenticated using (blocker = auth.uid());

-- takip
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated using (
  (follower = auth.uid() or following = auth.uid()
   or (status = 'accepted' and (public.can_view(follower) or public.can_view(following))
       and not private.teen(follower) and not private.teen(following)))
  and not public.blocked_between(follower, following)
  and not private.hidden(follower) and not private.hidden(following)
);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower = auth.uid() and not private.hidden(following));
drop policy if exists follows_update on public.follows;
create policy follows_update on public.follows for update to authenticated using (following = auth.uid()) with check (following = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower = auth.uid() or following = auth.uid());

-- kişisel listeler (sessize alma, yakın arkadaşlar, kaydedilenler, gizlenenler)
drop policy if exists mutes_all on public.mutes;
create policy mutes_all on public.mutes for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists close_friends_all on public.close_friends;
create policy close_friends_all on public.close_friends for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists saves_all on public.saves;
create policy saves_all on public.saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists hidden_all on public.hidden_posts;
create policy hidden_all on public.hidden_posts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- gönderiler
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated using (
  author = auth.uid() or (not archived and public.can_view(author) and not public.post_removed(id) and not (sensitive and public.hide_sensitive()))
);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check (author = auth.uid());
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using (author = auth.uid()) with check (author = auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (author = auth.uid());

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id) and not private.hidden(user_id));
drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- yorumlar
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id) and not public.blocked_between(author, auth.uid()) and not private.hidden(author)
);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check (
  author = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and not p.comments_off)
);
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using (
  author = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author = auth.uid())
);

drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes for select to authenticated using (exists (select 1 from public.comments c where c.id = comment_id) and not private.hidden(user_id));
drop policy if exists comment_likes_insert on public.comment_likes;
create policy comment_likes_insert on public.comment_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.comments c where c.id = comment_id));
drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_delete on public.comment_likes for delete to authenticated using (user_id = auth.uid());

-- hikayeler: 24 saat (öne çıkanlar kalıcı), yakın arkadaş hikayeleri sadece listedekilere
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select to authenticated using (
  author = auth.uid() or (
    public.can_view(author)
    and (created_at > now() - interval '24 hours' or public.story_in_highlight(id, author))
    and (not close_friends or public.is_close_friend_of(author))
  )
);
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated with check (author = auth.uid());
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated using (author = auth.uid());

drop policy if exists story_views_select on public.story_views;
create policy story_views_select on public.story_views for select to authenticated using (
  viewer = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author = auth.uid())
);
drop policy if exists story_views_insert on public.story_views;
create policy story_views_insert on public.story_views for insert to authenticated with check (viewer = auth.uid() and exists (select 1 from public.stories s where s.id = story_id));

drop policy if exists story_likes_select on public.story_likes;
create policy story_likes_select on public.story_likes for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.author = auth.uid())
);
drop policy if exists story_likes_insert on public.story_likes;
create policy story_likes_insert on public.story_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.stories s where s.id = story_id));
drop policy if exists story_likes_delete on public.story_likes;
create policy story_likes_delete on public.story_likes for delete to authenticated using (user_id = auth.uid());

-- sohbetler
drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads for select to authenticated using (public.is_member(id));
drop policy if exists thread_members_select on public.thread_members;
create policy thread_members_select on public.thread_members for select to authenticated using (public.is_member(thread_id));
drop policy if exists thread_members_update on public.thread_members;
create policy thread_members_update on public.thread_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists thread_members_delete on public.thread_members;
create policy thread_members_delete on public.thread_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_member(thread_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (
  sender = auth.uid() and public.is_member(thread_id) and not public.dm_blocked(thread_id)
);
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated using (sender = auth.uid()) with check (sender = auth.uid());

drop policy if exists reactions_select on public.message_reactions;
create policy reactions_select on public.message_reactions for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id));
drop policy if exists reactions_insert on public.message_reactions;
create policy reactions_insert on public.message_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id));
drop policy if exists reactions_update on public.message_reactions;
create policy reactions_update on public.message_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists reactions_delete on public.message_reactions;
create policy reactions_delete on public.message_reactions for delete to authenticated using (user_id = auth.uid());

-- bildirimler
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (
  user_id = auth.uid() and not public.blocked_between(user_id, actor) and not private.hidden(actor)
  and public.notif_live(kind, actor, user_id, post_id, comment_id, story_id)
);
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- şikayetler (sadece gönderilir; okumak için Supabase paneli)
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());

-- =====================================================================
-- 8) İZİNLER
-- =====================================================================

revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- profilde sadece bu alanlar düzenlenebilir (kullanıcı adı ve onay rozeti hariç)
revoke update on public.profiles from authenticated;
grant update (full_name, bio, website, category, avatar, is_private, show_activity, highlights, note, note_at, last_seen) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke insert, update, delete on public.usernames, public.accounts, public.signup_log from authenticated;
revoke select on public.usernames, public.signup_log from authenticated;
revoke insert, update, delete on public.threads from authenticated;
revoke insert on public.thread_members from authenticated;
revoke update on public.thread_members from authenticated;
grant update (accepted, muted, last_read_at) on public.thread_members to authenticated;
revoke update on public.messages from authenticated;
grant update (text, unsent) on public.messages to authenticated;
revoke insert on public.notifications from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update on public.comments from authenticated;
revoke update on public.stories from authenticated;
revoke select, update, delete on public.reports from authenticated;
revoke all on public.post_views from authenticated;
revoke all on public.app_admins, public.post_boosts, public.post_removals, public.user_bans from authenticated;
revoke insert, update, delete on public.app_settings from authenticated;
revoke insert, update, delete on public.music_tracks from authenticated;
revoke insert, update on public.snaps from authenticated;
revoke insert, update, delete on public.snap_recipients from authenticated;
revoke update on public.device_keys from authenticated;
revoke all on public.favorite_years from authenticated;
revoke update on public.reposts from authenticated;
revoke insert, update, delete on public.read_marks from authenticated;

-- fonksiyonlar: varsayılan olarak kimse çağıramaz, sonra tek tek açılır
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.login_email(text) to anon, authenticated;
grant execute on function public.norm_phone(text), public.norm_email(text), public.username_valid(text), public.ms(timestamptz) to anon, authenticated;
grant execute on function
  public.blocked_between(uuid, uuid), public.blocked_me(uuid), public.can_view(uuid), public.is_close_friend_of(uuid),
  public.story_in_highlight(uuid, uuid), public.is_member(uuid), public.dm_blocked(uuid),
  public.change_username(text), public.update_contact(text, text),
  public.start_dm(uuid), public.create_group(uuid[], text), public.add_group_members(uuid, uuid[]), public.rename_group(uuid, text),
  public.notif_live(text, uuid, uuid, uuid, uuid, uuid), public.pin_comment(uuid, boolean), public.view_post(uuid), public.view_count(uuid), public.my_views(),
  public.is_admin(), public.boost_of(uuid), public.post_removed(uuid), public.admin_check(), public.admin_overview(), public.admin_reports(),
  public.admin_resolve_report(bigint), public.admin_remove_post(uuid, text), public.admin_restore_post(uuid),
  public.admin_boost_post(uuid, numeric, int), public.admin_set_rank(jsonb), public.admin_set_verified(uuid, boolean),
  public.admin_add_track(text, text, text, text, numeric), public.admin_set_track_active(uuid, boolean),
  public.my_ban(), public.ban_appeal(text),
  public.am_minor(), public.hide_sensitive(), public.set_birth_year(int), public.set_prefs(jsonb), public.admin_set_sensitive(uuid, boolean),
  public.snap_sender(uuid), public.send_snap(jsonb, text, text), public.open_snap(uuid, text), public.my_snaps(),
  public.start_secret_dm(uuid), public.year_recap(int), public.favorite_year_info(), public.set_favorite_year(int, text),
  public.admin_ban_user(uuid, text, int), public.admin_unban_user(uuid), public.admin_reject_appeal(uuid), public.admin_users(text),
  public.post_json(public.posts), public.comment_json(public.comments), public.story_json(public.stories), public.profile_json(public.profiles),
  public.thread_json(public.threads), public.message_json(public.messages), public.msg_preview(public.messages),
  public.bootstrap(), public.get_posts(uuid[]), public.user_posts(uuid), public.get_stories(uuid[]), public.get_thread(uuid),
  public.get_messages(uuid, bigint, int)
  to authenticated;
grant execute on function public.signup_check(text, text, text), public.signup_rate_ok(text) to service_role;
-- özel şemadaki yardımcılar: kurallar ve sunucu fonksiyonları içinden çalışır, API'den çağrılamaz
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ayrılmış kullanıcı adları (kimse alamaz)
insert into public.usernames (name, reserved)
select x, true from unnest(array[
  'rozstram', 'admin', 'administrator', 'root', 'support', 'destek', 'yardim', 'help', 'official', 'resmi', 'moderator', 'mod',
  'system', 'sistem', 'api', 'www', 'app', 'settings', 'ayarlar', 'explore', 'kesfet', 'reels', 'stories', 'hikaye', 'direct',
  'mesajlar', 'inbox', 'login', 'giris', 'signup', 'kayit', 'about', 'hakkinda', 'privacy', 'gizlilik', 'terms', 'security',
  'instagram', 'facebook', 'meta', 'tiktok', 'null', 'undefined', 'anonymous', 'test', 'team', 'ekip'
]) x
on conflict (name) do nothing;

-- =====================================================================
-- 9) CANLI GÜNCELLEMELER (Realtime)
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['profiles', 'follows', 'posts', 'post_likes', 'comments', 'comment_likes', 'stories', 'story_views',
                           'story_likes', 'threads', 'thread_members', 'messages', 'message_reactions', 'notifications', 'snap_recipients', 'reposts'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

-- =====================================================================
-- 10) DOSYA DEPOLAMA (fotoğraf / video / ses) — dosya başına 50 MB
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/*', 'video/*', 'audio/*'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text and not private.banned(auth.uid()));
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists media_select on storage.objects;
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Saf fonksiyonlarda da arama yolunu sabitle (Supabase güvenlik önerisi)
alter function public.norm_email(text) set search_path = public;
alter function public.norm_phone(text) set search_path = public;
alter function public.username_valid(text) set search_path = public;
alter function public.ms(timestamptz) set search_path = public;
alter function public.story_json(public.stories) set search_path = public;
alter function public.post_json(public.posts) set search_path = public;
alter function public.comment_json(public.comments) set search_path = public;
alter function public.profile_json(public.profiles) set search_path = public;
alter function public.thread_json(public.threads) set search_path = public;
alter function public.message_json(public.messages) set search_path = public;
alter function public.msg_preview(public.messages) set search_path = public;

-- algoritma ayarı satırı (boş = varsayılan ağırlıklar)
insert into public.app_settings (key, value) values ('rank', '{}'::jsonb) on conflict (key) do nothing;

-- uygulamanın özgün müzik kütüphanesi (dosyalar sitede /music/ altında)
insert into public.music_tracks (slug, title, artist, genre, mood, url, duration) values
  ('yaz-aksami', 'Yaz Akşamı', 'Rozstram Müzik', 'Pop', 'Neşeli', '/music/yaz-aksami.mp3', 38.12),
  ('kahve-molasi', 'Kahve Molası', 'Rozstram Müzik', 'Lo-fi', 'Sakin', '/music/kahve-molasi.mp3', 36.32),
  ('neon-sehir', 'Neon Şehir', 'Rozstram Müzik', 'Retro', 'Gece', '/music/neon-sehir.mp3', 39.6),
  ('ritim-34', 'Ritim 34', 'Rozstram Müzik', 'Elektronik', 'Enerjik', '/music/ritim-34.mp3', 32.17),
  ('sahil-yolu', 'Sahil Yolu', 'Rozstram Müzik', 'Akustik', 'Huzurlu', '/music/sahil-yolu.mp3', 41.2),
  ('gece-yuruyusu', 'Gece Yürüyüşü', 'Rozstram Müzik', 'Hip-hop', 'Havalı', '/music/gece-yuruyusu.mp3', 44.84),
  ('hicaz-esintisi', 'Hicaz Esintisi', 'Rozstram Müzik', 'Oryantal', 'Gizemli', '/music/hicaz-esintisi.mp3', 41.2),
  ('gun-dogumu', 'Gün Doğumu', 'Rozstram Müzik', 'Sinematik', 'Duygusal', '/music/gun-dogumu.mp3', 40.39),
  ('kalp-atisi', 'Kalp Atışı', 'Rozstram Müzik', 'Romantik', 'Romantik', '/music/kalp-atisi.mp3', 42.5),
  ('enerji', 'Enerji', 'Rozstram Müzik', 'Pop Rock', 'Coşkulu', '/music/enerji.mp3', 31.2),
  ('yildiz-tozu', 'Yıldız Tozu', 'Rozstram Müzik', 'Chill', 'Rüya gibi', '/music/yildiz-tozu.mp3', 36.11),
  ('eski-kaset', 'Eski Kaset', 'Rozstram Müzik', 'Funk', 'Eğlenceli', '/music/eski-kaset.mp3', 35.49)
on conflict (slug) do update set title = excluded.title, artist = excluded.artist, genre = excluded.genre, mood = excluded.mood, url = excluded.url, duration = excluded.duration;
