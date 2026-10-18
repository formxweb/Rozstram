-- Rozstram veritabanı testleri (yerel Postgres + Supabase taklidi)
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = warning;

create schema if not exists t;
grant usage on schema t to anon, authenticated, service_role;
create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;
create or replace function t.err(q text, pat text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlerrm ~* pat then raise notice 'ok: % (%)', label, sqlerrm; return; end if;
    raise exception 'FAIL: % — beklenmeyen hata: %', label, sqlerrm;
  end;
  raise exception 'FAIL: % — hata bekleniyordu', label;
end $$;
create or replace function t.as_user(u uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false) $$;
grant execute on all functions in schema t to anon, authenticated, service_role;
set client_min_messages = notice;

-- ------------------------------------------------------------------ kayıt
\echo '== kayıt'
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ua@hesap.rozstram.app', '{"username":"Alice.Kaya","full_name":"Alice Kaya","contact_email":"Alice@Mail.com "}'),
  ('00000000-0000-0000-0000-00000000000b', 'ub@hesap.rozstram.app', '{"username":"bob_42","full_name":"Bob","contact_phone":"0532 123 45 67"}'),
  ('00000000-0000-0000-0000-00000000000c', 'uc@hesap.rozstram.app', '{"username":"carol","full_name":"Carol","contact_email":"carol@mail.com"}'),
  ('00000000-0000-0000-0000-00000000000d', 'ud@hesap.rozstram.app', '{"username":"dave","full_name":"Dave","contact_email":"dave@mail.com"}');
select t.ok((select count(*) = 4 from public.profiles), '4 profil oluştu');
select t.ok((select username from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'alice.kaya', 'kullanıcı adı küçük harfe çevrildi');
select t.ok((select email from public.accounts where user_id = '00000000-0000-0000-0000-00000000000a') = 'alice@mail.com', 'e-posta normalize');
select t.ok((select phone from public.accounts where user_id = '00000000-0000-0000-0000-00000000000b') = '+905321234567', 'telefon normalize (+90)');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x1@h.app', '{"username":"carol","contact_email":"z@z.com"}')$q$, 'duplicate|unique', 'aynı kullanıcı adı ikinci kez alınamaz');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x2@h.app', '{"username":"admin","contact_email":"z@z.com"}')$q$, 'duplicate|unique', 'ayrılmış ad (admin) alınamaz');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x3@h.app', '{"username":"a..b","contact_email":"z@z.com"}')$q$, 'username_invalid', 'geçersiz ad (iki nokta)');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x4@h.app', '{"username":"12345","contact_email":"z@z.com"}')$q$, 'username_invalid', 'sadece rakam olamaz');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x5@h.app', '{"username":"eve"}')$q$, 'contact_required', 'e-posta ya da telefon şart');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x6@h.app', '{"username":"evelyn","contact_email":"ALICE@mail.com"}')$q$, 'duplicate|unique', 'aynı e-posta iki hesapta olamaz');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x7@h.app', '{"username":"evelyn","contact_phone":"+90 532 123 4567"}')$q$, 'duplicate|unique', 'aynı telefon iki hesapta olamaz');

-- ------------------------------------------------------------------ giriş / kontrol (anon)
\echo '== giriş anahtarı (anonim)'
set role anon;
select t.ok(public.login_email('alice.kaya') = 'ua@hesap.rozstram.app', 'kullanıcı adıyla giriş');
select t.ok(public.login_email('@Alice.Kaya') = 'ua@hesap.rozstram.app', '@ ve büyük harfle giriş');
select t.ok(public.login_email(' alice@MAIL.com ') = 'ua@hesap.rozstram.app', 'e-postayla giriş');
select t.ok(public.login_email('05321234567') = 'ub@hesap.rozstram.app', 'telefonla giriş (0532…)');
select t.ok(public.login_email('+90 (532) 123 45 67') = 'ub@hesap.rozstram.app', 'telefonla giriş (+90 …)');
select t.ok(public.login_email('yok.boyle') is null, 'olmayan kullanıcı');
select t.ok(public.username_available('carol') = false, 'carol alınmış');
select t.ok(public.username_available('rozstram') = false, 'rozstram ayrılmış');
select t.ok(public.username_available('yeni.ad') = true, 'yeni.ad boşta');
select t.ok(public.username_available('Ab') = false, 'çok kısa ad geçersiz');
select t.err($q$select public.signup_check('x','y','z')$q$, 'permission denied', 'anonim signup_check çağıramaz');
select t.err($q$select * from public.profiles$q$, 'permission denied', 'anonim profilleri okuyamaz');
select t.err($q$select * from public.accounts$q$, 'permission denied', 'anonim hesap bilgisini okuyamaz');
reset role;
set role service_role;
select t.ok(public.signup_check('carol', 'n@n.com', null) = 'username_taken', 'signup_check: ad alınmış');
select t.ok(public.signup_check('newbie', 'carol@mail.com', null) = 'email_taken', 'signup_check: e-posta alınmış');
select t.ok(public.signup_check('newbie', null, '+905321234567') = 'phone_taken', 'signup_check: telefon alınmış');
select t.ok(public.signup_check('newbie', 'n@n.com', null) = 'ok', 'signup_check: uygun');
select t.ok(public.signup_rate_ok('1.2.3.4'), 'kayıt hız sınırı: ilk deneme');
reset role;

-- ------------------------------------------------------------------ profil ve kullanıcı adı
\echo '== profil ve kullanıcı adı'
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok((public.bootstrap() ->> 'me') = '00000000-0000-0000-0000-00000000000a', 'bootstrap çalışıyor');
update public.profiles set bio = 'Merhaba', is_private = false where id = auth.uid();
select t.ok((select bio from public.profiles where id = auth.uid()) = 'Merhaba', 'biyografi güncellendi');
select t.err($q$update public.profiles set username = 'hacker' where id = auth.uid()$q$, 'permission denied', 'kullanıcı adı doğrudan değiştirilemez');
select t.err($q$update public.profiles set verified = true where id = auth.uid()$q$, 'permission denied', 'onay rozeti kendine verilemez');
update public.profiles set bio = 'hack' where id = '00000000-0000-0000-0000-00000000000b';
select t.ok((select bio from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = '', 'başkasının profili değiştirilemez');
select t.ok(public.change_username('alice') = 'alice', 'ad değişti: alice');
select t.ok((select username from public.profiles where id = auth.uid()) = 'alice', 'profilde yeni ad');
select t.err($q$select * from public.usernames$q$, 'permission denied', 'kullanıcı adları tablosu okunamaz');
select t.ok((select count(*) from public.accounts) = 1, 'sadece kendi hesap bilgisini görür');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.err($q$select public.change_username('alice.kaya')$q$, 'username_taken', 'eski ad (alice.kaya) başkasına verilmez');
select t.err($q$select public.change_username('alice')$q$, 'username_taken', 'alınmış ad verilmez');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok(public.change_username('alice.kaya') = 'alice.kaya', 'kendi eski adına geri dönebilir');
select t.err($q$select public.update_contact('carol@mail.com', null)$q$, 'email_taken', 'başkasının e-postası alınamaz');
select public.update_contact('alice2@mail.com', '0555 000 11 22');
select t.ok((select phone from public.accounts where user_id = auth.uid()) = '+905550001122', 'iletişim bilgisi güncellendi');

-- ------------------------------------------------------------------ gizli hesap ve takip isteği
\echo '== takip ve gizli hesap'
select t.as_user('00000000-0000-0000-0000-00000000000c');
update public.profiles set is_private = true where id = auth.uid();
insert into public.posts (media, caption) values ('[{"id":"c/1.jpg","type":"image","aspect":1}]', 'gizli foto');
select t.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-00000000000a');
insert into public.follows (follower, following, status) values (auth.uid(), '00000000-0000-0000-0000-00000000000c', 'accepted');
select t.ok((select status from public.follows where follower = auth.uid() and following = '00000000-0000-0000-0000-00000000000c') = 'pending', 'gizli hesaba takip = istek (accepted yazsa bile)');
select t.ok((select status from public.follows where follower = auth.uid() and following = '00000000-0000-0000-0000-00000000000a') = 'accepted', 'açık hesaba takip direkt');
select t.ok((select count(*) from public.posts where author = '00000000-0000-0000-0000-00000000000c') = 0, 'istek kabul edilmeden gizli gönderi görünmez');
update public.follows set status = 'accepted' where follower = auth.uid() and following = '00000000-0000-0000-0000-00000000000c';
select t.ok((select status from public.follows where follower = auth.uid() and following = '00000000-0000-0000-0000-00000000000c') = 'pending', 'isteği takip eden kendisi kabul edemez');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok((select count(*) from public.notifications where kind = 'request') = 1, 'carol''a takip isteği bildirimi');
update public.follows set status = 'accepted' where follower = '00000000-0000-0000-0000-00000000000b' and following = auth.uid();
select t.ok((select count(*) from public.notifications where kind = 'request') = 0 and (select count(*) from public.notifications where kind = 'follow') = 1, 'kabul edince istek → takip bildirimi');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.posts where author = '00000000-0000-0000-0000-00000000000c') = 1, 'kabulden sonra gizli gönderi görünür');
select t.ok((select count(*) from public.notifications where kind = 'accepted') = 1, 'bob''a "isteğini kabul etti" bildirimi');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.posts where author = '00000000-0000-0000-0000-00000000000c') = 0, 'takip etmeyen dave gizli gönderiyi görmez');
select t.ok((select count(*) from public.follows where following = '00000000-0000-0000-0000-00000000000c') = 1, 'açık hesap bob''un takip listesi görünür (Instagram gibi)');
select t.as_user('00000000-0000-0000-0000-00000000000b');
update public.profiles set is_private = true where id = auth.uid();
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.follows where following = '00000000-0000-0000-0000-00000000000c') = 0, 'iki taraf gizliyse takip ilişkisi görünmez');
select t.as_user('00000000-0000-0000-0000-00000000000b');
update public.profiles set is_private = false where id = auth.uid();
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-00000000000c');
select t.as_user('00000000-0000-0000-0000-00000000000c');
update public.profiles set is_private = false where id = auth.uid();
select t.ok((select status from public.follows where follower = '00000000-0000-0000-0000-00000000000d' and following = auth.uid()) = 'accepted', 'hesap açılınca bekleyen istekler kabul olur');

-- ------------------------------------------------------------------ gönderi, beğeni, yorum, bildirim
\echo '== gönderi, beğeni, yorum'
select t.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.posts (id, media, caption, tagged) values ('10000000-0000-0000-0000-000000000001', '[{"id":"a/1.jpg","type":"image","aspect":1}]', 'Selam @bob_42 ve @dave #tatil', array['00000000-0000-0000-0000-00000000000c'::uuid, '00000000-0000-0000-0000-00000000000a'::uuid]);
select t.ok((select tagged from public.posts where id = '10000000-0000-0000-0000-000000000001') = array['00000000-0000-0000-0000-00000000000c'::uuid], 'kendini etiketleme temizlendi');
select t.err($q$insert into public.posts (author, media) values ('00000000-0000-0000-0000-00000000000b', '[{"id":"x","type":"image"}]')$q$, 'row-level security', 'başkası adına gönderi atılamaz');
select t.err($q$insert into public.posts (media) values ('[]')$q$, 'check', 'boş gönderi atılamaz');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.notifications where kind = 'mentionPost') = 1, 'bob''a bahsetme bildirimi');
insert into public.post_likes (post_id) values ('10000000-0000-0000-0000-000000000001');
insert into public.comments (id, post_id, text) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Harika @carol');
select t.err($q$update public.posts set caption = 'hack' where id = '10000000-0000-0000-0000-000000000001'$q$, '.*', 'başkasının gönderisi düzenlenemez (sessiz)') where false;
update public.posts set caption = 'hack' where id = '10000000-0000-0000-0000-000000000001';
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok((select caption from public.posts where id = '10000000-0000-0000-0000-000000000001') like 'Selam%', 'başkasının gönderisi değişmedi');
select t.ok((select count(*) from public.notifications where kind = 'like') = 1, 'alice''e beğeni bildirimi');
select t.ok((select count(*) from public.notifications where kind = 'comment') = 1, 'alice''e yorum bildirimi');
insert into public.comments (id, post_id, parent_id, text) values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Teşekkürler!');
insert into public.comments (id, post_id, parent_id, text) values ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'yanıta yanıt');
select t.ok((select parent_id from public.comments where id = '20000000-0000-0000-0000-000000000003') = '20000000-0000-0000-0000-000000000001', 'yanıtlar tek seviyeye indirildi');
insert into public.comment_likes (comment_id) values ('20000000-0000-0000-0000-000000000001');
update public.posts set comments_off = true, pinned = true where id = '10000000-0000-0000-0000-000000000001';
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.notifications where kind = 'reply') = 2, 'bob''a 2 yanıt bildirimi');
select t.ok((select count(*) from public.notifications where kind = 'clike') = 1, 'bob''a yorum beğeni bildirimi');
select t.err($q$insert into public.comments (post_id, text) values ('10000000-0000-0000-0000-000000000001', 'kapalı mı')$q$, 'row-level security', 'yorumlar kapalıyken yorum yapılamaz');
delete from public.post_likes where post_id = '10000000-0000-0000-0000-000000000001';
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from public.notifications where kind = 'like') = 0, 'beğeni geri alınınca bildirim silindi');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok((select count(*) from public.notifications where kind = 'tag') = 1, 'carol''a etiket bildirimi');
select t.ok((select count(*) from public.notifications where kind = 'mention') = 1, 'carol''a yorumda bahsetme bildirimi');
select t.err($q$delete from public.notifications$q$, '.*', 'x') where false;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.notifications where user_id <> auth.uid()) = 0, 'başkasının bildirimleri görünmez');
select t.ok(jsonb_array_length(public.bootstrap() -> 'posts') >= 2, 'bootstrap gönderileri döndürüyor');

-- ------------------------------------------------------------------ hikayeler
\echo '== hikayeler'
select t.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.stories (id, media) values ('30000000-0000-0000-0000-000000000001', '{"id":"c/s1.jpg","type":"image"}');
insert into public.stories (id, media, close_friends) values ('30000000-0000-0000-0000-000000000002', '{"id":"c/s2.jpg","type":"image"}', true);
insert into public.close_friends (friend) values ('00000000-0000-0000-0000-00000000000b');
insert into public.stories (id, media) values ('30000000-0000-0000-0000-000000000003', '{"id":"c/old.jpg","type":"image"}');
reset role; update public.stories set created_at = now() - interval '2 days' where id = '30000000-0000-0000-0000-000000000003'; set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.stories where author = '00000000-0000-0000-0000-00000000000c') = 2, 'bob (yakın arkadaş) 2 güncel hikaye görür');
insert into public.story_views (story_id) values ('30000000-0000-0000-0000-000000000001');
insert into public.story_likes (story_id) values ('30000000-0000-0000-0000-000000000001');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.stories where author = '00000000-0000-0000-0000-00000000000c') = 1, 'dave yakın arkadaş hikayesini görmez, eskiyi görmez');
select t.ok((select count(*) from public.story_views) = 0, 'dave başkasının görüntüleme listesini görmez');
select t.as_user('00000000-0000-0000-0000-00000000000c');
update public.profiles set highlights = '[{"id":"h1","title":"Yaz","cover":"c/old.jpg","items":["30000000-0000-0000-0000-000000000003"]}]' where id = auth.uid();
select t.ok((select count(*) from public.story_views where story_id = '30000000-0000-0000-0000-000000000001') = 1, 'carol görüntüleyenleri görür');
select t.ok((select count(*) from public.notifications where kind = 'slike') = 1, 'carol''a hikaye beğeni bildirimi');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.stories where id = '30000000-0000-0000-0000-000000000003') = 1, 'öne çıkan eski hikaye görünür');
select t.as_user('00000000-0000-0000-0000-00000000000a');
update public.profiles set highlights = '[{"id":"h9","title":"Çalıntı","items":["30000000-0000-0000-0000-000000000002"]}]' where id = auth.uid();
select t.ok((select count(*) from public.stories where id = '30000000-0000-0000-0000-000000000002') = 0, 'başkasının hikayesi kendi öne çıkanına koyularak açılamaz');

-- ------------------------------------------------------------------ mesajlar
\echo '== mesajlar'
select t.as_user('00000000-0000-0000-0000-00000000000a');
select public.start_dm('00000000-0000-0000-0000-00000000000d') as tid \gset
select t.ok(public.start_dm('00000000-0000-0000-0000-00000000000d') = :'tid', 'aynı kişiyle tek sohbet');
select t.ok((select accepted from public.thread_members where thread_id = :'tid' and user_id = '00000000-0000-0000-0000-00000000000d') = false, 'takip etmeyene mesaj = istek');
insert into public.messages (id, thread_id, text) values ('40000000-0000-0000-0000-000000000001', :'tid', 'Selam Dave');
select t.ok((select last ->> 'text' from public.threads where id = :'tid') = 'Selam Dave', 'sohbet önizlemesi güncellendi');
select t.err($q$insert into public.messages (thread_id, text) values ('$q$ || :'tid' || $q$', '')$q$, 'empty_message', 'boş mesaj gönderilemez');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((select count(*) from public.messages where thread_id = :'tid') = 0, 'üye olmayan mesajları göremez');
select t.err($q$insert into public.messages (thread_id, text) values ('$q$ || :'tid' || $q$', 'sızma')$q$, 'row-level security', 'üye olmayan mesaj atamaz');
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.message_reactions (message_id, emoji) values ('40000000-0000-0000-0000-000000000001', '❤️');
insert into public.messages (thread_id, text, reply_to) values (:'tid', 'Merhaba!', '{"id":"40000000-0000-0000-0000-000000000001","text":"Selam Dave"}');
select t.ok((select accepted from public.thread_members where thread_id = :'tid' and user_id = auth.uid()) = true, 'yanıt verince istek kabul edildi');
update public.messages set text = 'değişti' where id = '40000000-0000-0000-0000-000000000001';
select t.ok((select text from public.messages where id = '40000000-0000-0000-0000-000000000001') = 'Selam Dave', 'başkasının mesajı değiştirilemez');
select t.as_user('00000000-0000-0000-0000-00000000000a');
update public.messages set text = 'Selam Dave!!' where id = '40000000-0000-0000-0000-000000000001';
select t.ok((select edited_at is not null from public.messages where id = '40000000-0000-0000-0000-000000000001'), 'mesaj düzenlendi');
update public.messages set unsent = true where id = '40000000-0000-0000-0000-000000000001';
select t.ok((select text is null and unsent from public.messages where id = '40000000-0000-0000-0000-000000000001'), 'mesaj geri alındı');
update public.thread_members set last_read_at = now() where thread_id = :'tid' and user_id = auth.uid();
select t.ok(jsonb_array_length(public.get_messages(:'tid')) = 2, 'get_messages 2 mesaj');
select public.create_group(array['00000000-0000-0000-0000-00000000000b'::uuid, '00000000-0000-0000-0000-00000000000c'::uuid], 'Ekip') as gid \gset
select t.ok((select count(*) from public.thread_members where thread_id = :'gid') = 3, 'grup 3 kişi');
insert into public.messages (thread_id, text) values (:'gid', 'Grup selam');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok((select count(*) from public.messages where thread_id = :'gid') = 1, 'grup üyesi mesajı görür');
delete from public.thread_members where thread_id = :'gid' and user_id = auth.uid();
select t.ok((select count(*) from public.messages where thread_id = :'gid') = 0, 'gruptan çıkan artık görmez');

-- ------------------------------------------------------------------ engelleme
\echo '== engelleme'
select t.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.blocks (blocker, blocked) values (auth.uid(), '00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from public.follows where (follower = auth.uid() and following = '00000000-0000-0000-0000-00000000000a') or (following = auth.uid() and follower = '00000000-0000-0000-0000-00000000000a')) = 0, 'engelleyince takipler silindi');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 0, 'engellenen, engelleyenin profilini görmez');
select t.err($q$insert into public.messages (thread_id, text) values ('$q$ || :'tid' || $q$', 'hâlâ orada mısın')$q$, 'row-level security', 'engellenen mesaj atamaz');
select t.err($q$insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-00000000000d')$q$, 'blocked', 'engellenen takip edemez');
select t.err($q$select public.start_dm('00000000-0000-0000-0000-00000000000d')$q$, 'blocked', 'engellenen yeni sohbet açamaz');

-- ------------------------------------------------------------------ depolama
\echo '== depolama'
insert into storage.objects (bucket_id, name) values ('media', auth.uid()::text || '/foto.jpg');
select t.err($q$insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-00000000000b/foto.jpg')$q$, 'row-level security', 'başkasının klasörüne dosya yüklenemez');

-- ------------------------------------------------------------------ video görüntülenme
\echo '== video görüntülenme'
select t.as_user('00000000-0000-0000-0000-00000000000b');
update public.profiles set is_private = false where id = auth.uid();
insert into public.posts (id, kind, media) values ('10000000-0000-0000-0000-0000000000f1', 'reel', '[{"id":"b/p/v.mp4","type":"video"}]');
insert into public.posts (id, media) values ('10000000-0000-0000-0000-0000000000f2', '[{"id":"b/p/f.jpg","type":"image"}]');
select t.ok(public.view_post('10000000-0000-0000-0000-0000000000f1') = false, 'sahibinin kendi izlemesi sayılmaz');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok(public.view_post('10000000-0000-0000-0000-0000000000f1') = true, 'ilk izleme sayıldı');
select t.ok(public.view_post('10000000-0000-0000-0000-0000000000f1') = false, 'aynı kişinin tekrar izlemesi bir daha sayılmaz');
select t.ok(public.view_post('10000000-0000-0000-0000-0000000000f2') = false, 'fotoğraf gönderisi izlenme saymaz');
select t.ok((public.get_posts(array['10000000-0000-0000-0000-0000000000f1'::uuid]) -> 'posts' -> 0 ->> 'views')::int = 1, 'görüntülenme sayısı 1');
select t.err($q$select count(*) from public.post_views$q$, 'permission denied', 'kimin izlediği başkalarına görünmez');
select t.as_user('00000000-0000-0000-0000-00000000000c');
update public.profiles set is_private = true where id = auth.uid();
insert into public.posts (id, kind, media) values ('10000000-0000-0000-0000-0000000000f3', 'reel', '[{"id":"c/p/v.mp4","type":"video"}]');
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.ok(not exists (select 1 from public.follows where follower = auth.uid() and following = '00000000-0000-0000-0000-00000000000c'), 'alice carol''u takip etmiyor');
select t.ok(public.view_post('10000000-0000-0000-0000-0000000000f3') = false, 'göremediği gizli hesabın videosu sayılmaz');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok(public.view_post('10000000-0000-0000-0000-0000000000f3') = true, 'takipçi gizli hesabın videosunu izleyince sayılır');
select t.as_user('00000000-0000-0000-0000-00000000000a');

-- ------------------------------------------------------------------ yönetici
\echo '== yönetici'
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.err($q$select public.admin_overview()$q$, 'not_allowed', 'yönetici olmayan paneli açamaz');
select t.err($q$select public.admin_set_rank('{"video":2}')$q$, 'not_allowed', 'yönetici olmayan algoritmayı değiştiremez');
select t.err($q$select public.admin_boost_post('10000000-0000-0000-0000-0000000000f1', 5, 3)$q$, 'not_allowed', 'yönetici olmayan öne çıkaramaz');
select t.err($q$insert into public.app_settings (key, value) values ('rank', '{}')$q$, 'permission denied|row-level', 'ayarlar doğrudan yazılamaz');
select t.err($q$update public.profiles set verified = true where id = auth.uid()$q$, 'permission denied', 'kimse kendine mavi tik veremez');
reset role;
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(public.is_admin(), 'bob yönetici');
select t.ok((public.admin_overview() ->> 'users')::int >= 4, 'genel bakış sayıları');
select t.ok(public.admin_set_rank('{"video":3,"fresh":"x","follow":0.5}') = '{"video":2,"follow":0.5}'::jsonb, 'ağırlıklar 0-2 arasına sınırlandı, hatalı değer atlandı');
select public.admin_boost_post('10000000-0000-0000-0000-0000000000f1', 3, 2);
select t.ok(public.boost_of('10000000-0000-0000-0000-0000000000f1') = 3, 'gönderi öne çıkarıldı');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select (value ->> 'video')::numeric from public.app_settings where key = 'rank') = 2, 'herkes algoritma ayarını okur');
select t.ok((public.get_posts(array['10000000-0000-0000-0000-0000000000f1'::uuid]) -> 'posts' -> 0 ->> 'boost')::numeric = 3, 'öne çıkarma gönderide görünür');
select t.ok((public.bootstrap() ->> 'isAdmin')::boolean = false, 'dave yönetici değil');
insert into public.reports (kind, target, reason) values ('post', '10000000-0000-0000-0000-0000000000f3', 'spam');
select t.ok((select count(*) from public.posts where id = '10000000-0000-0000-0000-0000000000f3') = 1, 'kaldırılmadan önce dave görür');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok(jsonb_array_length(public.admin_reports()) >= 1, 'şikayet yöneticiye düştü');
select public.admin_remove_post('10000000-0000-0000-0000-0000000000f3', 'spam');
select t.ok((public.admin_overview() ->> 'openReports')::int = 0, 'kaldırınca şikayet kapandı');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.posts where id = '10000000-0000-0000-0000-0000000000f3') = 0, 'kaldırılan gönderiyi başkası görmez');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok((public.get_posts(array['10000000-0000-0000-0000-0000000000f3'::uuid]) -> 'posts' -> 0 ->> 'removed')::boolean, 'sahibi kaldırıldığını görür');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select public.admin_restore_post('10000000-0000-0000-0000-0000000000f3');
select public.admin_set_verified('00000000-0000-0000-0000-00000000000d', true);
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.posts where id = '10000000-0000-0000-0000-0000000000f3') = 1, 'geri getirilen gönderi yine görünür');
select t.ok((select verified from public.profiles where id = auth.uid()), 'yönetici mavi tik verdi');
select t.as_user('00000000-0000-0000-0000-00000000000a');

-- ------------------------------------------------------------------ müzik
\echo '== müzik'
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.music_tracks) = 12, 'hazır kütüphanede 12 müzik');
select t.err($q$insert into public.music_tracks (title, url, duration) values ('x', '/x.mp3', 10)$q$, 'permission denied', 'kullanıcı müzik ekleyemez');
select t.err($q$select public.admin_add_track('x', '', '', 'd/music/x.mp3', 30)$q$, 'not_allowed', 'yönetici olmayan müzik ekleyemez');
insert into public.posts (id, kind, media, music) values ('10000000-0000-0000-0000-0000000000f9', 'reel', '[{"id":"d/p/v.mp4","type":"video"}]',
  jsonb_build_object('id', (select id from public.music_tracks where slug = 'neon-sehir'), 'title', 'Neon Şehir', 'url', '/music/neon-sehir.mp3', 'start', 5, 'dur', 15));
select t.ok((public.get_posts(array['10000000-0000-0000-0000-0000000000f9'::uuid]) -> 'posts' -> 0 -> 'music' ->> 'title') = 'Neon Şehir', 'gönderide müzik kayıtlı');
select t.err($q$insert into public.posts (media, music) values ('[{"id":"d/p/a.jpg","type":"image"}]', '"metin"')$q$, 'check', 'müzik alanı nesne olmalı');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.err($q$select public.admin_add_track('Şarkı', 'Ben', 'Pop', 'baskasi/music/x.mp3', 30)$q$, 'bad_url', 'yönetici sadece kendi yüklediği dosyayı ekler');
select public.admin_add_track('Benim Şarkım', 'Bob', 'Pop', '00000000-0000-0000-0000-00000000000b/music/a.mp3', 42.5) as new_track \gset
select t.ok((select count(*) from public.music_tracks) = 13, 'yönetici müzik ekledi');
select public.admin_set_track_active(:'new_track', false);
select t.ok((select count(*) from public.music_tracks) = 13, 'yönetici gizli müziği görür');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((select count(*) from public.music_tracks) = 12, 'gizlenen müzik kullanıcıya görünmez');
select t.as_user('00000000-0000-0000-0000-00000000000a');

-- ------------------------------------------------------------------ banlama
\echo '== banlama'
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.err($q$select public.admin_ban_user('00000000-0000-0000-0000-00000000000d', 'spam', 7)$q$, 'not_allowed', 'yönetici olmayan banlayamaz');
select t.err($q$select * from public.user_bans$q$, 'permission denied', 'ban listesi doğrudan okunamaz');
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 1, 'bandan önce dave görünür');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.err($q$select public.admin_ban_user('00000000-0000-0000-0000-00000000000b', 'x', 1)$q$, 'not_allowed', 'yönetici kendini banlayamaz');
select t.ok((public.admin_ban_user('00000000-0000-0000-0000-00000000000d', '  Spam  ', null) ->> 'reason') = 'Spam', 'yönetici daveyi kalıcı banladı');
select t.ok(public.user_banned('00000000-0000-0000-0000-00000000000d'), 'dave banlı');
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 1, 'yönetici banlı profili görür');
select t.ok((select (public.profile_json(p) ->> 'banned')::boolean from public.profiles p where id = '00000000-0000-0000-0000-00000000000d'), 'yönetici profilde ban işaretini görür');
select t.ok((public.admin_users('dave') -> 'users' -> 0 -> 'ban' ->> 'reason') = 'Spam', 'yönetici aramasında ban bilgisi');
select t.ok(jsonb_array_length(public.admin_users('') -> 'banned') = 1, 'banlılar listesi');
select t.ok((public.admin_overview() ->> 'banned')::int = 1, 'genel bakışta banlı sayısı');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 0, 'banlı profil başkalarına görünmez');
select t.ok((select count(*) from public.posts where author = '00000000-0000-0000-0000-00000000000d') = 0, 'banlı hesabın gönderileri görünmez');
select t.ok((select (profile_json(p) ->> 'banned')::boolean from public.profiles p where id = auth.uid()) = false, 'normal kullanıcıya ban işareti hep kapalı');
select t.err($q$insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-00000000000d')$q$, 'row-level security', 'banlı hesap takip edilemez');
select t.err($q$select public.start_dm('00000000-0000-0000-0000-00000000000d')$q$, 'not_found', 'banlı hesaba yeni sohbet açılamaz');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((public.bootstrap() -> 'ban' ->> 'reason') = 'Spam', 'banlı kişi açılışta ban bilgisini alır');
select t.ok((public.my_ban() ->> 'until') is null, 'kalıcı ban (bitiş yok)');
select t.ok((select count(*) from public.profiles where id = auth.uid()) = 1, 'banlı kişi kendi profilini görür');
select t.err($q$insert into public.posts (media) values ('[{"id":"d/p/z.jpg","type":"image"}]')$q$, 'banned', 'banlı kişi paylaşım yapamaz');
select t.err($q$update public.profiles set bio = 'yeni' where id = auth.uid()$q$, 'banned', 'banlı kişi profilini değiştiremez');
select t.err($q$insert into public.post_likes (post_id) values ('10000000-0000-0000-0000-0000000000f1')$q$, 'banned', 'banlı kişi beğenemez');
select t.err($q$insert into public.comments (post_id, text) values ('10000000-0000-0000-0000-0000000000f1', 'selam')$q$, 'banned', 'banlı kişi yorum yapamaz');
select t.err($q$select public.ban_appeal('  ')$q$, 'empty_message', 'boş itiraz gönderilemez');
select public.ban_appeal('Hesabım çalınmıştı, artık güvende.');
select t.ok((public.my_ban() ->> 'appeal') = 'Hesabım çalınmıştı, artık güvende.', 'itiraz gönderildi');
select t.err($q$select public.ban_appeal('tekrar')$q$, 'appeal_sent', 'itiraz bir kez gönderilir');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((public.admin_overview() ->> 'appeals')::int = 1, 'itiraz yöneticiye düştü');
select public.admin_reject_appeal('00000000-0000-0000-0000-00000000000d');
select t.ok((public.admin_overview() ->> 'appeals')::int = 0, 'reddedilen itiraz listeden düştü');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok((public.my_ban() ->> 'appealRejected')::boolean, 'kişi itirazının reddedildiğini görür');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select public.admin_unban_user('00000000-0000-0000-0000-00000000000d');
select t.ok(not public.user_banned('00000000-0000-0000-0000-00000000000d'), 'ban kaldırıldı');
select t.as_user('00000000-0000-0000-0000-00000000000c');
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000d') = 1, 'ban kalkınca profil yine görünür');
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok(public.my_ban() is null, 'ban kalkınca açılışta ban yok');
update public.profiles set bio = 'geri döndüm' where id = auth.uid();
select t.ok(true, 'ban kalkınca profil düzenlenebilir');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select t.ok((public.admin_ban_user('00000000-0000-0000-0000-00000000000d', 'Taciz', 7) ->> 'until') is not null, '7 günlük geçici ban');
select t.ok((public.admin_users('dave') -> 'users' -> 0 -> 'ban' ->> 'appeal') is null, 'yeni banda eski itiraz silinir');
select t.err($q$select public.ban_json('00000000-0000-0000-0000-00000000000d')$q$, 'permission denied', 'ban ayrıntısı herkese açık değil');
reset role;
update public.user_bans set until = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-00000000000d';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000d');
select t.ok(public.my_ban() is null and not public.user_banned(auth.uid()), 'süresi dolan ban kendiliğinden biter');
select t.as_user('00000000-0000-0000-0000-00000000000a');

-- ------------------------------------------------------------------ yaş, hassas içerik, şipşak, şifreli sohbet, yıl özeti
\echo '== yaş ve genç hesap'
reset role;
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('k1@h.app', jsonb_build_object('username', 'kucuk', 'contact_email', 'k@k.com', 'birth_year', extract(year from now())::int - 10))$q$, 'too_young', '13 yaş altı kayıt olamaz');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'ue1@h.app', jsonb_build_object('username', 'genc', 'full_name', 'Genç', 'contact_email', 'genc@mail.com', 'birth_year', extract(year from now())::int - 15)),
  ('00000000-0000-0000-0000-0000000000e2', 'ue2@h.app', '{"username":"eren","full_name":"Eren","contact_email":"eren@mail.com"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'ue3@h.app', jsonb_build_object('username', 'fatma', 'full_name', 'Fatma', 'contact_email', 'fatma@mail.com', 'birth_year', 1990));
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.ok(public.am_minor(), 'genç hesap 18 yaş altı');
select t.err($q$select public.is_minor('00000000-0000-0000-0000-0000000000e2')$q$, 'permission denied', 'başkasının yaşı sorgulanamaz');
select t.ok((select is_private from public.profiles where id = auth.uid()), 'genç hesap gizli başlar');
select t.ok((public.bootstrap() -> 'account' -> 'prefs' ->> 'sensitive') = 'hide', 'gençte hassas içerik kapalı başlar');
select t.err($q$select public.set_prefs('{"sensitive":"show"}')$q$, 'teen_locked', 'genç hassas içeriği açamaz');
select t.err($q$select public.set_birth_year(1990)$q$, 'birth_year_set', 'doğum yılı sonradan değiştirilemez');
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok((public.bootstrap() -> 'account' ->> 'birthYear') is null, 'eski hesapta doğum yılı yok');
select t.err($q$select public.set_birth_year(extract(year from now())::int - 8)$q$, 'too_young', '13 yaş altı doğum yılı kabul edilmez');
select t.ok((public.set_birth_year(1995) ->> 'minor')::boolean = false, 'yetişkin doğum yılını ekledi');
select t.ok(not public.am_minor(), 'eren yetişkin');
select t.err($q$select public.set_prefs('{"sensitive":"acik"}')$q$, 'bad_value', 'geçersiz tercih');
select t.ok((public.set_prefs('{"sensitive":"show"}') ->> 'sensitive') = 'show', 'yetişkin hassas içeriği açtı');
select t.ok((select count(*) from public.accounts where user_id <> auth.uid()) = 0, 'başkasının doğum yılı görünmez');

\echo '== hassas içerik'
select t.as_user('00000000-0000-0000-0000-0000000000e2');
insert into public.posts (id, media, caption, sensitive) values ('10000000-0000-0000-0000-0000000000e1', '[{"id":"e/p/1.jpg","type":"image"}]', 'hassas #yaz #deniz', true);
insert into public.posts (id, media, caption) values ('10000000-0000-0000-0000-0000000000e2', '[{"id":"e/p/2.jpg","type":"image"}]', 'normal #yaz');
select t.ok((select count(*) from public.posts where id = '10000000-0000-0000-0000-0000000000e1') = 1, 'sahibi kendi hassas gönderisini görür');
select t.as_user('00000000-0000-0000-0000-0000000000e3');
select t.ok((select sensitive from public.posts where id = '10000000-0000-0000-0000-0000000000e1'), 'yetişkin (bulanık) hassas gönderiyi işaretli görür');
select public.set_prefs('{"sensitive":"hide"}');
select t.ok((select count(*) from public.posts where id = '10000000-0000-0000-0000-0000000000e1') = 0, 'gizle seçince hassas gönderi hiç gelmez');
select public.set_prefs('{"sensitive":"blur"}');
select t.as_user('00000000-0000-0000-0000-0000000000e1');
select t.ok((select count(*) from public.posts where id = '10000000-0000-0000-0000-0000000000e1') = 0, 'genç hassas gönderiyi göremez');
select t.ok((select count(*) from public.posts where id = '10000000-0000-0000-0000-0000000000e2') = 1, 'genç normal gönderiyi görür');
select t.as_user('00000000-0000-0000-0000-00000000000b');
select public.admin_set_sensitive('10000000-0000-0000-0000-0000000000e2', true);
select t.as_user('00000000-0000-0000-0000-0000000000e2');
update public.posts set sensitive = false where id = '10000000-0000-0000-0000-0000000000e2';
select t.ok((select sensitive from public.posts where id = '10000000-0000-0000-0000-0000000000e2'), 'yöneticinin hassas işaretini sahibi kaldıramaz');
update public.posts set sensitive = false where id = '10000000-0000-0000-0000-0000000000e1';
select t.ok(not (select sensitive from public.posts where id = '10000000-0000-0000-0000-0000000000e1'), 'sahibi kendi işaretini kaldırabilir');

\echo '== gençlere mesaj'
select t.err($q$select public.start_dm('00000000-0000-0000-0000-0000000000e1')$q$, 'teen_dm', 'takip etmediği yetişkin gence yazamaz');
select t.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-0000000000e2');
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok(public.start_dm('00000000-0000-0000-0000-0000000000e1') is not null, 'gencin takip ettiği kişi yazabilir');

\echo '== şipşak'
select t.as_user('00000000-0000-0000-0000-0000000000e2');
insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-0000000000e3');
select t.as_user('00000000-0000-0000-0000-0000000000e3');
insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-0000000000e2');
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.err($q$select public.send_snap('{"id":"baskasi/i/a.jpg","type":"image"}', 'mutual')$q$, 'bad_media', 'başkasının dosyasıyla şipşak atılamaz');
select t.err($q$insert into public.snaps (media) values ('{"id":"x","type":"image"}')$q$, 'permission denied', 'şipşak doğrudan eklenemez');
select t.err($q$select public.send_snap('{"id":"00000000-0000-0000-0000-0000000000e2/i/a.jpg","type":"image"}', 'close')$q$, 'no_recipients', 'yakın arkadaş yoksa gönderilmez');
select (public.send_snap('{"id":"00000000-0000-0000-0000-0000000000e2/i/a.jpg","type":"image","aspect":0.75}', 'mutual') ->> 'id') as snap_id \gset
select t.ok((select count(*) from public.snap_recipients where snap_id = :'snap_id') = 1, 'şipşak sadece karşılıklı takipleşilen kişiye gitti (genç takip edilmiyor)');
select t.as_user('00000000-0000-0000-0000-0000000000e3');
select t.ok(jsonb_array_length(public.my_snaps() -> 'inbox') = 1, 'fatma şipşağı aldı');
select t.ok((select count(*) from public.snaps) = 0, 'alıcı şipşak tablosunu doğrudan okuyamaz');
select public.open_snap(:'snap_id', '😍');
select t.ok(jsonb_array_length(public.my_snaps() -> 'inbox') = 0, 'görülen şipşak kaybolur');
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok((public.my_snaps() -> 'sent' -> 0 -> 'seen' -> 0 ->> 'reaction') = '😍', 'gönderen gören kişiyi ve tepkisini görür');
reset role; update public.snaps set expires_at = now() - interval '1 minute' where id = :'snap_id'; set role authenticated;
select t.ok(jsonb_array_length(public.my_snaps() -> 'sent') = 0, '24 saat dolunca şipşak kaybolur');

\echo '== uçtan uca şifreli sohbet'
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select public.start_secret_dm('00000000-0000-0000-0000-0000000000e3') as sec \gset
select public.start_dm('00000000-0000-0000-0000-0000000000e3') as plain \gset
select t.ok(:'sec' <> :'plain', 'şifreli sohbet normal sohbetten ayrı');
select t.ok((select e2ee from public.threads where id = :'sec'), 'sohbet şifreli işaretli');
select t.err($q$insert into public.messages (thread_id, text) values ('$q$ || :'sec' || $q$', 'düz metin')$q$, 'e2ee_only', 'şifreli sohbete düz metin yazılamaz');
select t.err($q$insert into public.messages (thread_id, enc) values ('$q$ || :'plain' || $q$', '{"v":1}')$q$, 'e2ee_only', 'normal sohbete şifreli mesaj karışmaz');
insert into public.messages (id, thread_id, enc, reply_to) values ('40000000-0000-0000-0000-0000000000e1', :'sec', '{"v":1,"iv":"x","ct":"y","k":{}}', '{"id":"40000000-0000-0000-0000-000000000001","text":"sızan alıntı"}');
select t.ok((select reply_to from public.messages where id = '40000000-0000-0000-0000-0000000000e1') = '{"id":"40000000-0000-0000-0000-000000000001"}'::jsonb, 'alıntının düz metni sunucuya kaydedilmez');
select t.ok((select last ->> 'text' from public.threads where id = :'sec') = '🔒 Şifreli mesaj', 'sohbet listesinde içerik görünmez');
update public.messages set text = 'düzenleme' where id = '40000000-0000-0000-0000-0000000000e1';
select t.ok((select text is null from public.messages where id = '40000000-0000-0000-0000-0000000000e1'), 'şifreli mesaja düz metin eklenemez');
insert into public.device_keys (public_key) values ('{"kty":"EC","crv":"P-256","x":"a","y":"b"}');
select t.err($q$insert into public.device_keys (user_id, public_key) values ('00000000-0000-0000-0000-0000000000e3', '{"kty":"EC"}')$q$, 'row-level security', 'başkası adına anahtar eklenemez');
insert into public.device_keys (public_key) select '{"kty":"EC"}' from generate_series(1, 9);
select t.err($q$insert into public.device_keys (public_key) values ('{"kty":"EC"}')$q$, 'row-level security', 'en fazla 10 cihaz');
select t.as_user('00000000-0000-0000-0000-0000000000e3');
select t.ok((select count(*) from public.device_keys where user_id = '00000000-0000-0000-0000-0000000000e2') = 10, 'açık anahtarlar okunabilir');

\echo '== yeniden paylaşım'
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.err($q$insert into public.reposts (post_id) values ('10000000-0000-0000-0000-0000000000e2')$q$, 'own_post', 'kendi gönderini yeniden paylaşamazsın');
select t.as_user('00000000-0000-0000-0000-0000000000e3');
insert into public.reposts (post_id) values ('10000000-0000-0000-0000-0000000000e1');
select t.err($q$insert into public.reposts (post_id) values ('10000000-0000-0000-0000-0000000000e1')$q$, 'duplicate|unique', 'aynı gönderi iki kez yeniden paylaşılamaz');
select t.err($q$insert into public.reposts (user_id, post_id) values ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e2')$q$, 'row-level security', 'başkası adına yeniden paylaşılamaz');
select t.ok((public.get_posts(array['10000000-0000-0000-0000-0000000000e1'::uuid]) -> 'posts' -> 0 ->> 'reposts')::int = 1, 'gönderide yeniden paylaşım sayısı');
select t.ok(jsonb_array_length(public.user_posts('00000000-0000-0000-0000-0000000000e3') -> 'reposts') = 1, 'profilde yeniden paylaşılanlar');
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok((select count(*) from public.notifications where user_id = auth.uid() and kind = 'repost') = 1, 'gönderi sahibine yeniden paylaşım bildirimi');
select t.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.follows (follower, following) values (auth.uid(), '00000000-0000-0000-0000-0000000000e3');
select t.ok(exists (select 1 from jsonb_array_elements(public.bootstrap() -> 'reposts') r where r ->> 1 = '10000000-0000-0000-0000-0000000000e1'), 'takip ettiğinin yeniden paylaşımı akışa gelir');
delete from public.reposts where user_id = '00000000-0000-0000-0000-0000000000e3';
select t.ok((select count(*) from public.reposts where user_id = '00000000-0000-0000-0000-0000000000e3') = 1, 'başkasının yeniden paylaşımı silinemez');
select t.as_user('00000000-0000-0000-0000-0000000000e3');
delete from public.reposts where post_id = '10000000-0000-0000-0000-0000000000e1';
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select t.ok((select count(*) from public.notifications where user_id = auth.uid() and kind = 'repost') = 0, 'geri alınınca bildirim de kaybolur');

\echo '== yıl özeti ve en sevdiğin yıl'
select t.as_user('00000000-0000-0000-0000-0000000000e3');
insert into public.post_likes (post_id) values ('10000000-0000-0000-0000-0000000000e1');
select t.as_user('00000000-0000-0000-0000-0000000000e2');
select public.year_recap(extract(year from now())::int) as rc \gset
select t.ok((:'rc'::jsonb ->> 'posts')::int = 2 and (:'rc'::jsonb ->> 'likes')::int = 1, 'yıl özeti: 2 gönderi, 1 beğeni');
select t.ok((:'rc'::jsonb -> 'topPost' ->> 'id') = '10000000-0000-0000-0000-0000000000e1', 'en çok beğenilen gönderi');
select t.ok((:'rc'::jsonb -> 'topTags' ->> 0) = 'yaz', 'en çok kullanılan etiket');
select t.err($q$select public.year_recap(1990)$q$, 'bad_value', 'geçersiz yıl');
select t.ok((public.set_favorite_year(2018, 'kis') -> 'mine' ->> 'year') = '2018', 'en sevdiğin yıl kaydedildi');
select t.as_user('00000000-0000-0000-0000-0000000000e3');
select public.set_favorite_year(2018);
select public.set_favorite_year(2018, 'yaz') as fy \gset
select t.ok((:'fy'::jsonb ->> 'sameYear')::int = 2 and (:'fy'::jsonb ->> 'summer')::int = 1 and (:'fy'::jsonb ->> 'winter')::int = 1, '2018 istatistiği (1 yaz, 1 kış)');
select t.ok((:'fy'::jsonb -> 'top' ->> 'year') = '2018', 'en sevilen yıl 2018');
select t.ok((public.bootstrap() -> 'favoriteYear' ->> 'season') = 'yaz', 'açılışta kendi seçimin gelir');
select t.err($q$select public.set_favorite_year(1900)$q$, 'bad_value', 'çok eski yıl seçilemez');
select t.err($q$select * from public.favorite_years$q$, 'permission denied', 'kimin hangi yılı seçtiği okunamaz');
select t.as_user('00000000-0000-0000-0000-00000000000a');

-- ------------------------------------------------------------------ hesap silme
\echo '== hesap silme'
reset role;
-- delete-account sunucu fonksiyonunun yaptığı: auth.admin.deleteUser
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 0, 'profil silindi');
select t.ok((select count(*) from public.posts where author = '00000000-0000-0000-0000-00000000000a') = 0, 'gönderiler silindi');
select t.ok((select count(*) from public.usernames where name in ('alice', 'alice.kaya') and user_id is null) = 2, 'eski kullanıcı adları kilitli kaldı');
select t.err($q$insert into auth.users (email, raw_user_meta_data) values ('x8@h.app', '{"username":"alice","contact_email":"new@n.com"}')$q$, 'duplicate|unique', 'silinen hesabın adı yeniden alınamaz');
insert into auth.users (email, raw_user_meta_data) values ('x9@h.app', '{"username":"alice.yeni","contact_email":"alice2@mail.com"}');
select t.ok(true, 'silinen hesabın e-postası yeni hesapta kullanılabilir');
\echo '== TÜM TESTLER GEÇTİ'
