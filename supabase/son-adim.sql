-- Rozstram son kurulum adımı: Supabase > SQL Editor'e yapıştırıp Run'a basın. Mevcut veri silinmez.
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
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
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
create or replace function public.blocks_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows where (follower = new.blocker and following = new.blocked) or (follower = new.blocked and following = new.blocker);
  delete from public.close_friends where (owner = new.blocker and friend = new.blocked) or (owner = new.blocked and friend = new.blocker);
  return null;
end $$;
create or replace trigger blocks_after after insert on public.blocks
  for each row execute function public.blocks_after();
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
create or replace function public.leave_thread(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.thread_members where thread_id = tid and user_id = auth.uid();
  if not exists (select 1 from public.thread_members where thread_id = tid) then delete from public.threads where id = tid; end if;
end $$;
revoke execute on function public.signup_rate_ok(text), public.delete_my_account(), public.leave_thread(uuid),
  public.follows_after(), public.blocks_after(), public.post_likes_after(), public.comment_likes_after(), public.story_likes_after()
  from public, anon, authenticated;
grant execute on function public.delete_my_account(), public.leave_thread(uuid) to authenticated;
grant execute on function public.signup_rate_ok(text) to service_role;
