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
  created_at timestamptz not null default now()
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

-- Giriş yapan kullanıcı bu kişinin içeriğini görebilir mi?
create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
    or (
      auth.uid() is not null
      and not public.blocked_between(owner, auth.uid())
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

-- 1:1 sohbette karşı taraf engellenmiş mi?
create or replace function public.dm_blocked(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.threads t join public.thread_members m on m.thread_id = t.id
    where t.id = tid and not t.is_group and m.user_id <> auth.uid() and public.blocked_between(m.user_id, auth.uid())
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
begin
  if not public.username_valid(u) then raise exception 'username_invalid'; end if;
  if em is null and ph is null then raise exception 'contact_required'; end if;
  insert into public.usernames (name, user_id) values (u, new.id);
  insert into public.profiles (id, username, full_name) values (new.id, u, left(btrim(coalesce(m ->> 'full_name', '')), 60));
  insert into public.accounts (user_id, login_email, email, phone) values (new.id, lower(new.email), em, ph);
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
  delete from public.signup_log where created_at < now() - interval '2 days';
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

-- Hesabı kalıcı olarak sil (kullanıcı adı kilitli kalır)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();
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
  elsif tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'accepted' then
      delete from public.notifications where user_id = new.following and actor = new.follower and kind = 'request';
      perform public.notify(new.following, new.follower, 'follow');
      perform public.notify(new.follower, new.following, 'accepted');
    end if;
  else
    delete from public.notifications where user_id = old.following and actor = old.follower and kind in ('request', 'follow');
  end if;
  return null;
end $$;
create or replace trigger follows_after after insert or update or delete on public.follows
  for each row execute function public.follows_after();

-- engelleme: iki yönlü takibi kaldır
create or replace function public.blocks_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows where (follower = new.blocker and following = new.blocked) or (follower = new.blocked and following = new.blocker);
  delete from public.close_friends where (owner = new.blocker and friend = new.blocked) or (owner = new.blocked and friend = new.blocker);
  return null;
end $$;
create or replace trigger blocks_after after insert on public.blocks
  for each row execute function public.blocks_after();

-- gönderi: yazar sabit, en fazla 3 sabitlenmiş gönderi
create or replace function public.posts_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.edited_at := null;
    new.tagged := coalesce((select array_agg(distinct t) from unnest(new.tagged) t where t <> new.author), '{}');
  else
    new.id := old.id; new.author := old.author; new.created_at := old.created_at; new.media := old.media; new.kind := old.kind;
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
  if tg_op = 'INSERT' then
    perform public.notify((select author from public.posts where id = new.post_id), new.user_id, 'like', new.post_id);
  else
    delete from public.notifications where kind = 'like' and actor = old.user_id and post_id = old.post_id;
  end if;
  return null;
end $$;
create or replace trigger post_likes_after after insert or delete on public.post_likes
  for each row execute function public.post_likes_after();

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
  if tg_op = 'INSERT' then
    select author, post_id, text into c from public.comments where id = new.comment_id;
    perform public.notify(c.author, new.user_id, 'clike', c.post_id, new.comment_id, null, c.text);
  else
    delete from public.notifications where kind = 'clike' and actor = old.user_id and comment_id = old.comment_id;
  end if;
  return null;
end $$;
create or replace trigger comment_likes_after after insert or delete on public.comment_likes
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
  if tg_op = 'INSERT' then
    perform public.notify((select author from public.stories where id = new.story_id), new.user_id, 'slike', null, null, new.story_id);
  else
    delete from public.notifications where kind = 'slike' and actor = old.user_id and story_id = old.story_id;
  end if;
  return null;
end $$;
create or replace trigger story_likes_after after insert or delete on public.story_likes
  for each row execute function public.story_likes_after();

-- mesaj: sohbetin son mesajını ve okundu bilgisini güncelle
create or replace function public.msg_preview(m public.messages) returns text
language sql immutable as $$
  select case
    when m.unsent then 'Mesaj geri alındı'
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
    if coalesce(btrim(new.text), '') = '' and new.media is null and new.post_id is null then raise exception 'empty_message'; end if;
  else
    new.id := old.id; new.thread_id := old.thread_id; new.sender := old.sender; new.created_at := old.created_at;
    if old.unsent then return old; end if;
    if new.unsent then
      new.text := null; new.media := null; new.post_id := null; new.story := null; new.reply_to := null;
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

-- =====================================================================
-- 5) MESAJLAŞMA FONKSİYONLARI
-- =====================================================================

create or replace function public.start_dm(other uuid) returns uuid
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
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into tid from public.threads where dm_key = k;
  if tid is null then
    insert into public.threads (is_group, dm_key, created_by) values (false, k, me)
    on conflict (dm_key) do update set dm_key = excluded.dm_key returning id into tid;
  end if;
  follows_me := exists (select 1 from public.follows where follower = other and following = me and status = 'accepted');
  insert into public.thread_members (thread_id, user_id, accepted) values (tid, me, true) on conflict do nothing;
  insert into public.thread_members (thread_id, user_id, accepted) values (tid, other, follows_me) on conflict do nothing;
  return tid;
end $$;

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

create or replace function public.leave_thread(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.thread_members where thread_id = tid and user_id = auth.uid();
  if not exists (select 1 from public.thread_members where thread_id = tid) then delete from public.threads where id = tid; end if;
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
-- 6) VERİ OKUMA (tek seferde açılış verisi)
-- =====================================================================

create or replace function public.post_json(p public.posts) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'author', p.author, 'kind', p.kind, 'media', p.media, 'caption', p.caption, 'location', p.location,
    'filter', p.filter, 'adjust', p.adjust, 'tagged', to_jsonb(p.tagged), 'hideLikes', p.hide_likes, 'noComments', p.comments_off,
    'pinned', p.pinned, 'archived', p.archived, 'at', public.ms(p.created_at), 'edited', case when p.edited_at is null then null else public.ms(p.edited_at) end,
    'likes', coalesce((select jsonb_object_agg(l.user_id, public.ms(l.created_at)) from public.post_likes l where l.post_id = p.id), '{}'::jsonb)
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
    'sharedPost', s.shared_post, 'mentions', to_jsonb(s.mentions), 'closeFriends', s.close_friends, 'at', public.ms(s.created_at),
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
    'lastSeen', case when p.show_activity and p.last_seen is not null then public.ms(p.last_seen) else null end, 'at', public.ms(p.created_at)
  );
$$;

create or replace function public.thread_json(t public.threads) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', t.id, 'isGroup', t.is_group, 'title', t.title, 'createdBy', t.created_by, 'at', public.ms(t.last_at), 'last', t.last,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'read', public.ms(m.last_read_at), 'accepted', m.accepted, 'muted', m.muted) order by m.joined_at)
                         from public.thread_members m where m.thread_id = t.id), '[]'::jsonb)
  );
$$;

create or replace function public.bootstrap() returns jsonb
language sql stable set search_path = public as $$
  with me as (select auth.uid() as id),
  ids as (
    select x.id from (select p.id from public.posts p order by p.created_at desc limit 400) x
    union select p.id from public.posts p where p.author = (select id from me)
    union select s.post_id from public.saves s where s.user_id = (select id from me)
  ),
  feed as (select p.* from public.posts p where p.id in (select id from ids))
  select jsonb_build_object(
    'me', (select id from me),
    'account', (select jsonb_build_object('email', a.email, 'phone', a.phone) from public.accounts a where a.user_id = auth.uid()),
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
  with ps as (select * from public.posts where author = uid or uid = any (tagged) order by created_at desc limit 300)
  select jsonb_build_object(
    'posts', coalesce((select jsonb_agg(public.post_json(p)) from ps p), '[]'::jsonb),
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
    'replyTo', m.reply_to, 'unsent', m.unsent, 'edited', m.edited_at is not null, 'at', public.ms(m.created_at),
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

-- profiller: herkes görür (seni engelleyenler hariç), sadece kendin düzenlersin
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (not public.blocked_me(id));
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
  follower = auth.uid() or following = auth.uid()
  or (status = 'accepted' and (public.can_view(follower) or public.can_view(following)))
);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower = auth.uid());
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
create policy posts_select on public.posts for select to authenticated using (author = auth.uid() or (not archived and public.can_view(author)));
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check (author = auth.uid());
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using (author = auth.uid()) with check (author = auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (author = auth.uid());

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- yorumlar
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated using (
  exists (select 1 from public.posts p where p.id = post_id) and not public.blocked_between(author, auth.uid())
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
create policy comment_likes_select on public.comment_likes for select to authenticated using (exists (select 1 from public.comments c where c.id = comment_id));
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
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
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
revoke insert, delete on public.thread_members from authenticated;
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

-- fonksiyonlar: varsayılan olarak kimse çağıramaz, sonra tek tek açılır
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.login_email(text) to anon, authenticated;
grant execute on function public.norm_phone(text), public.norm_email(text), public.username_valid(text), public.ms(timestamptz) to anon, authenticated;
grant execute on function
  public.blocked_between(uuid, uuid), public.blocked_me(uuid), public.can_view(uuid), public.is_close_friend_of(uuid),
  public.story_in_highlight(uuid, uuid), public.is_member(uuid), public.dm_blocked(uuid),
  public.change_username(text), public.update_contact(text, text), public.delete_my_account(),
  public.start_dm(uuid), public.create_group(uuid[], text), public.add_group_members(uuid, uuid[]), public.rename_group(uuid, text),
  public.leave_thread(uuid), public.pin_comment(uuid, boolean),
  public.post_json(public.posts), public.comment_json(public.comments), public.story_json(public.stories), public.profile_json(public.profiles),
  public.thread_json(public.threads), public.message_json(public.messages), public.msg_preview(public.messages),
  public.bootstrap(), public.get_posts(uuid[]), public.user_posts(uuid), public.get_stories(uuid[]), public.get_thread(uuid),
  public.get_messages(uuid, bigint, int)
  to authenticated;
grant execute on function public.signup_check(text, text, text), public.signup_rate_ok(text) to service_role;

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
                           'story_likes', 'threads', 'thread_members', 'messages', 'message_reactions', 'notifications'] loop
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
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
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
