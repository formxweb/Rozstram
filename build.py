#!/usr/bin/env python3
"""Rozstram üretim derlemesi → public/ (Vercel bu klasörü olduğu gibi yayınlar).

Kullanım:  python3 build.py            (config.json'daki Supabase bilgileriyle)
           python3 build.py --test     (yerel test sunucusu için)
"""
import hashlib, json, math, os, shutil, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'public')
ESB = '/opt/npm-tools/node_modules/.bin/esbuild'
env = dict(os.environ, NODE_PATH='/opt/npm-tools/node_modules')
TEST = '--test' in sys.argv

cfg_path = os.path.join(ROOT, 'config.test.json' if TEST else 'config.json')
cfg = json.load(open(cfg_path)) if os.path.exists(cfg_path) else {}
config = {'url': cfg.get('url', ''), 'key': cfg.get('key', '')}

r = subprocess.run([ESB, os.path.join(ROOT, 'src/app.jsx'), '--bundle', '--minify', '--format=iife', '--jsx=automatic',
                    '--target=es2020', '--define:process.env.NODE_ENV="production"', '--legal-comments=none', '--log-level=error'],
                   capture_output=True, text=True, env=env)
if r.returncode != 0:
    print(r.stderr); sys.exit(1)
js = r.stdout
css = open(os.path.join(ROOT, 'src/styles.css'), encoding='utf-8').read()
h = lambda s: hashlib.sha256(s.encode('utf-8')).hexdigest()[:10]
jsname, cssname = 'app-' + h(js) + '.js', 'app-' + h(css) + '.css'

if os.path.exists(OUT): shutil.rmtree(OUT)
os.makedirs(os.path.join(OUT, 'assets'))
os.makedirs(os.path.join(OUT, 'icons'))
# özgün müzik kütüphanesi (tools/music/generate.py ile üretildi)
if os.path.isdir(os.path.join(ROOT, 'music')):
    shutil.copytree(os.path.join(ROOT, 'music'), os.path.join(OUT, 'music'), ignore=shutil.ignore_patterns('*.json'))
open(os.path.join(OUT, 'assets', jsname), 'w', encoding='utf-8').write(js)
open(os.path.join(OUT, 'assets', cssname), 'w', encoding='utf-8').write(css)

# ------------------------------------------------------------------ simgeler
G = [(255, 201, 60), (255, 122, 47), (255, 46, 110), (177, 60, 255)]
def grad(size):
    w, hh = size
    im = Image.new('RGB', size)
    px = im.load()
    for y in range(hh):
        for x in range(w):
            t = (x / w + y / hh) / 2
            stops = [0, 0.3, 0.62, 1]
            for i in range(3):
                if stops[i] <= t <= stops[i + 1]:
                    f = (t - stops[i]) / (stops[i + 1] - stops[i])
                    px[x, y] = tuple(int(G[i][k] + (G[i + 1][k] - G[i][k]) * f) for k in range(3))
                    break
    return im
def sparkle(draw, cx, cy, r, fill):
    pts = []
    for i, (dx, dy) in enumerate([(0, -1), (0.22, -0.22), (1, 0), (0.22, 0.22), (0, 1), (-0.22, 0.22), (-1, 0), (-0.22, -0.22)]):
        pts.append((cx + dx * r, cy + dy * r))
    draw.polygon(pts, fill=fill)
def icon(size, radius_frac, mark_frac):
    s4 = size * 4
    im = grad((s4, s4)).convert('RGBA')
    d = ImageDraw.Draw(im)
    sparkle(d, s4 / 2, s4 / 2, s4 * mark_frac / 2, (255, 255, 255, 255))
    if radius_frac:
        m = Image.new('L', (s4, s4), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, s4 - 1, s4 - 1), radius=int(s4 * radius_frac), fill=255)
        im.putalpha(m)
    return im.resize((size, size), Image.LANCZOS)
icon(192, 0.22, 0.6).save(os.path.join(OUT, 'icons/icon-192.png'))
icon(512, 0.22, 0.6).save(os.path.join(OUT, 'icons/icon-512.png'))
icon(512, 0, 0.44).save(os.path.join(OUT, 'icons/maskable-512.png'))
icon(180, 0, 0.56).convert('RGB').save(os.path.join(OUT, 'icons/apple-touch-icon.png'))
icon(32, 0.22, 0.66).save(os.path.join(OUT, 'icons/icon-32.png'))
# paylaşım görseli
og = Image.new('RGB', (1200, 630), (12, 12, 16))
mk = icon(220, 0.24, 0.6)
og.paste(mk, (160, 205), mk)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 112)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 38)
except OSError:
    font = small = ImageFont.load_default()
dd = ImageDraw.Draw(og)
dd.text((420, 225), 'rozstram', font=font, fill=(255, 255, 255))
dd.text((424, 370), 'Paylaş, keşfet, mesajlaş.', font=small, fill=(200, 200, 210))
og.save(os.path.join(OUT, 'icons/og.png'), optimize=True)

# ------------------------------------------------------------------ manifest
manifest = {
    'name': 'Rozstram', 'short_name': 'Rozstram', 'lang': 'tr', 'start_url': '/', 'scope': '/', 'display': 'standalone',
    'background_color': '#ffffff', 'theme_color': '#ffffff', 'description': 'Fotoğraf, video, hikaye ve Reels paylaş; arkadaşlarınla mesajlaş.',
    'icons': [
        {'src': '/icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
        {'src': '/icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
        {'src': '/icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
    ],
}
json.dump(manifest, open(os.path.join(OUT, 'manifest.webmanifest'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ service worker
version = h(js + css)
sw = """/* Rozstram service worker — uygulama kabuğunu önbelleğe alır */
const V = 'roz-%s';
const SHELL = ['/', '/assets/%s', '/assets/%s', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k.indexOf('roz-') === 0).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(V).then((c) => c.put('/', copy)); return res; }).catch(() => caches.match('/')));
      return;
    }
    if (url.pathname.indexOf('/assets/') === 0 || url.pathname.indexOf('/icons/') === 0) {
      e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); return res; })));
    }
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.indexOf('/npm/@supabase/') === 0) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); } return res; })));
  }
});
""" % (version, jsname, cssname)
open(os.path.join(OUT, 'sw.js'), 'w', encoding='utf-8').write(sw)

# ------------------------------------------------------------------ index.html
cfg_js = json.dumps(config).replace('</', '<\\/')
html = """<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Rozstram</title>
<meta name="description" content="Rozstram — fotoğraf, video, hikaye ve Reels paylaş; arkadaşlarınla mesajlaş.">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Rozstram">
<meta property="og:type" content="website">
<meta property="og:title" content="Rozstram">
<meta property="og:description" content="Fotoğraf, video, hikaye ve Reels paylaş; arkadaşlarınla mesajlaş.">
<meta property="og:image" content="/icons/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="/assets/%s">
<script>window.ROZ_CONFIG=%s;</script>
</head>
<body>
<div id="root"><div class="loading"><div style="display:grid;justify-items:center;gap:18px"><span class="mark" style="width:54px;height:54px;border-radius:17px"><i></i></span><span class="spinner"></span></div></div></div>
<noscript>Rozstram’ı kullanmak için JavaScript’i aç.</noscript>
<script src="/assets/%s" defer></script>
</body>
</html>
""" % (cssname, cfg_js, jsname)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(html)
print('public/ hazır:', jsname, round(len(js) / 1024), 'KB js,', cssname, round(len(css) / 1024), 'KB css', '(test)' if TEST else '', '' if config['url'] else '— UYARI: config.json yok, uygulama "Kurulum bekleniyor" gösterir')

# Netlify vb. statik barındırıcılar için tek sayfa yönlendirmesi (Vercel vercel.json kullanır)
open(os.path.join(OUT, '_redirects'), 'w').write('/assets/*  /assets/:splat  200\n/icons/*  /icons/:splat  200\n/*  /index.html  200\n')
