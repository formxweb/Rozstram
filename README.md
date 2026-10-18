# Rozstram

Instagram benzeri, gerçek kişilerle çalışan sosyal uygulama (PWA).

- **Arayüz:** React 19, tek sayfa uygulama. Derlenmiş hali `public/` klasöründe, Vercel buradan yayınlar.
- **Sunucu:** Supabase (Postgres + Auth + Realtime + Storage + Edge Function).
  - `supabase/schema.sql`: veritabanının tamamı (tablolar, güvenlik kuralları, tetikleyiciler).
  - `supabase/functions/signup`: kayıt fonksiyonu (e-posta veya telefon + kullanıcı adı).
  - `supabase/functions/delete-account`: hesap silme (dosyalar + hesap; kullanıcı adı kilitli kalır).
- **Ayar:** `config.json` (Supabase adresi + herkese açık anon anahtar).

## Akış algoritması

`src/rank.js` her kullanıcı için kişisel sıralama yapar: etkileştiğin hesaplar (beğeni, yorum, kayıt,
izleme, takip, yakın arkadaş, mesajlaşma), ilgilendiğin #etiketler, video/fotoğraf tercihin, gönderinin
takipçi sayısına göre başarısı, tazelik, "İlgilenmiyorum" sinyalleri ve çeşitlilik. Ağırlıklar dosyanın
başındaki `W` ve `scorePost` içindedir.

## Yönetici paneli

Ayarlar → Yönetim → Yönetici paneli (sadece `app_admins` tablosundaki hesaplar görür).
Genel bakış, algoritma ağırlıkları, şikayetler (gönderiyi kaldır / görmezden gel), öne çıkanlar ve
mavi tik. Gönderiyi öne çıkarmak için gönderinin ••• menüsü → "Öne çıkar (Yönetici)".
Banlama: Yönetici paneli → Kullanıcılar (ara → Banla), profilin ••• menüsü ya da gönderinin ••• menüsü →
"Banla (Yönetici)". Neden ve süre (1 / 7 / 30 gün ya da kalıcı) seçilir. Banlı hesap uygulamada sadece
"Hesabın askıya alındı" ekranını görür (neden, süre, bir kez itiraz); paylaşım, beğeni, yorum, mesaj, takip,
dosya yükleme sunucuda engellenir; profili ve içeriği başkalarından gizlenir. İtirazlar Kullanıcılar sekmesinde
kabul edilir (ban kalkar) ya da reddedilir. Yönetici kendini ya da başka bir yöneticiyi banlayamaz.
Yeni yönetici eklemek: Supabase SQL Editor'de
`insert into public.app_admins (user_id) select id from public.profiles where username = 'KULLANICI_ADI';`

## Güvenlik ve yaş

- Kayıtta doğum yılı sorulur; 13 yaş altı kayıt olamaz. Doğum yılı olmayan eski hesaplara uygulama bir kez sorar.
- 18 yaş altı (genç hesap): hesap gizli başlar, hassas içerik hep gizli kalır, sadece takip ettiği kişiler yeni sohbet başlatabilir,
  Renkli tema ve çıkartmalı yıl özeti varsayılan olur. Başkasının yaşı hiçbir yoldan sorgulanamaz.
- Hassas içerik: gönderi oluştururken ya da ••• menüsünden işaretlenir (yönetici de işaretleyebilir, sahibi bu işareti kaldıramaz).
  Ayarlar → Hassas içerik: Göster / Bulanık / Gizle.

## Şipşak

Mesajlar → Şipşak çek: kamera açılır, çekilen foto filtresiz anında gider (karşılıklı takipleşilen arkadaşlar ya da Yakın Arkadaşlar).
Alıcı bir kez görür, tepki bırakabilir; 24 saatte kaybolur. Gönderen kimin gördüğünü ve tepkiyi görür, geri alabilir.

## Uçtan uca şifreli sohbet

Profil ••• → Şifreli sohbet. Her cihaz kendi anahtarını üretir (gizli anahtar cihazdan çıkmaz, `device_keys`
tablosunda sadece açık anahtar durur). Mesajlar AES-GCM ile şifrelenir, anahtar her cihaz için ECDH ile sarılır; sunucu sadece
şifreli içeriği saklar. Sohbet bilgisinde iki tarafta aynı çıkan güvenlik kodu var. Şimdilik yazı ve emoji; yeni bir cihaz eski mesajları açamaz.

## Yıl özeti ve en sevdiğin yıl

Ayarlar → Yıl özetin (15 Aralık–31 Ocak arası akışta kart olarak da çıkar): paylaşımlar, beğeniler, en sevilen gönderi,
etiketler, yeni takipçiler ve "En sevdiğin yıl" (X yıl geçmiş, vay be! → kışı mı yazı mı) → hikayede paylaş.

## Müzik

Hikaye, Reels ve gönderilere müzik eklenebilir. Hazır kütüphane `music/` klasöründedir ve
`tools/music/generate.py` ile sentezlenerek üretilmiştir (örnek/sample kullanılmadı, telif uygulamaya aittir).
Yönetici panelindeki "Müzik" sekmesinden yeni parça yüklenebilir; sadece kullanım hakkı olan müzikler yüklenmelidir.

## Yeniden derleme

```
python3 build.py          # public/ klasörünü üretir
python3 build.py --test   # yerel test sunucusuna bağlı derleme
```

## Testler

```
bash supabase/test/run.sh        # veritabanı testleri (yerel Postgres)
bash test/restart.sh && node test/e2e.js && STEP0=40 node test/e2e2.js   # tarayıcı testleri
node test/rank.test.js           # akış algoritması testleri
node test/admin-e2e.js           # yönetici paneli testi
node test/music-e2e.js           # müzik testi
node test/ban-e2e.js             # banlama testi
node test/features-e2e.js        # yaş, hassas içerik, Şipşak, şifreli sohbet, yıl özeti
```
