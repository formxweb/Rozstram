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
Yeni yönetici eklemek: Supabase SQL Editor'de
`insert into public.app_admins (user_id) select id from public.profiles where username = 'KULLANICI_ADI';`

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
```
