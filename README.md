# Rozstram

Instagram benzeri, gerçek kişilerle çalışan sosyal uygulama (PWA).

- **Arayüz:** React 19, tek sayfa uygulama. Derlenmiş hali `public/` klasöründe, Vercel buradan yayınlar.
- **Sunucu:** Supabase (Postgres + Auth + Realtime + Storage + Edge Function).
  - `supabase/schema.sql`: veritabanının tamamı (tablolar, güvenlik kuralları, tetikleyiciler).
  - `supabase/functions/signup`: kayıt fonksiyonu (e-posta veya telefon + kullanıcı adı).
  - `supabase/functions/delete-account`: hesap silme (dosyalar + hesap; kullanıcı adı kilitli kalır).
- **Ayar:** `config.json` (Supabase adresi + herkese açık anon anahtar).

## Yeniden derleme

```
python3 build.py          # public/ klasörünü üretir
python3 build.py --test   # yerel test sunucusuna bağlı derleme
```

## Testler

```
bash supabase/test/run.sh        # veritabanı testleri (yerel Postgres)
bash test/restart.sh && node test/e2e.js && STEP0=40 node test/e2e2.js   # tarayıcı testleri
```
