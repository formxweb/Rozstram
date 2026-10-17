"""Rozstram özgün müzik kütüphanesi.

Tamamen bu dosyadaki sentezle üretilir (örnek/sample yok) — telif uygulamaya aittir.
Çıktı: tools/music/out/<id>.mp3 ve tracks.json  (python3 tools/music/generate.py)
"""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'out')
os.makedirs(OUT, exist_ok=True)
SR = 44100


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR / 2 - 200), 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, min(hi, SR / 2 - 200)], 'band', fs=SR, output='sos'), x)


def saw(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    out = 2 * ph - 1
    m1 = ph < dt; t = ph[m1] / dt[m1]; out[m1] -= 2 * t - t * t - 1
    m2 = ph > 1 - dt; t = (ph[m2] - 1) / dt[m2]; out[m2] -= t * t + 2 * t + 1
    return out


def env(n, a=0.005, d=0.1, s=0.7, r=0.05):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    return e * np.clip((dur - t) / max(r, 1e-6), 0, 1)


class Mix:
    def __init__(self, seconds):
        self.N = int(seconds * SR)
        self.b = {}

    def bus(self, name):
        if name not in self.b: self.b[name] = np.zeros((2, self.N))
        return self.b[name]

    def add(self, name, sig, t0, gain=1.0, pan=0.0):
        b = self.bus(name)
        if sig.ndim == 1:
            sig = np.vstack([sig * np.cos((pan + 1) * np.pi / 4), sig * np.sin((pan + 1) * np.pi / 4)]) * np.sqrt(2)
        i0 = int(round(t0 * SR))
        if i0 >= self.N: return
        i1 = min(self.N, i0 + sig.shape[1])
        b[:, i0:i1] += gain * sig[:, :i1 - i0]


# ------------------------------------------------------------------ enstrümanlar
class Kit:
    def __init__(self, rng): self.rng = rng

    def kick(self, punch=1.0, low=46):
        n = int(0.45 * SR); t = np.arange(n) / SR
        f = low + 120 * punch * np.exp(-t * 30)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
        click = hp(self.rng.standard_normal(n), 2500) * np.exp(-t * 400) * 0.3 * punch
        return np.tanh(1.5 * (body + click)) * 0.9

    def snare(self, tone=190, decay=22):
        n = int(0.3 * SR); t = np.arange(n) / SR
        body = np.sin(2 * np.pi * tone * t) * np.exp(-t * 28) * 0.5
        nz = bp(self.rng.standard_normal(n), 1200, 8000) * np.exp(-t * decay)
        return body + nz * 0.8

    def clap(self):
        n = int(0.35 * SR); t = np.arange(n) / SR
        noise = bp(self.rng.standard_normal(n), 900, 4200)
        e = np.zeros(n)
        for k, o in enumerate([0, 0.011, 0.022]):
            m = t >= o; e[m] += np.exp(-(t[m] - o) * (180 if k < 2 else 16))
        return noise * e * 0.6

    def hat(self, open_=False):
        n = int((0.25 if open_ else 0.06) * SR); t = np.arange(n) / SR
        return hp(self.rng.standard_normal(n), 7500, 4) * np.exp(-t * (12 if open_ else 70))

    def shaker(self):
        n = int(0.09 * SR); t = np.arange(n) / SR
        return bp(self.rng.standard_normal(n), 5000, 12000) * np.sin(np.pi * t / t[-1]) ** 2 * 0.6

    def doum(self):  # darbuka düm
        n = int(0.5 * SR); t = np.arange(n) / SR
        f = 90 + 60 * np.exp(-t * 40)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) + bp(self.rng.standard_normal(n), 200, 900) * np.exp(-t * 60) * 0.2

    def tek(self):  # darbuka tek
        n = int(0.15 * SR); t = np.arange(n) / SR
        return (np.sin(2 * np.pi * 620 * t) * 0.5 + bp(self.rng.standard_normal(n), 2500, 9000)) * np.exp(-t * 45) * 0.7

    def tom(self, f0=140):
        n = int(0.4 * SR); t = np.arange(n) / SR
        f = f0 + 50 * np.exp(-t * 25)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def piano(m, dur, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = mtof(m)
    x = np.zeros(n)
    for h, a in [(1, 1), (2, 0.5 * bright), (3, 0.25 * bright), (4, 0.12 * bright), (5, 0.06 * bright)]:
        x += a * np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h * h)) * np.exp(-t * (1.6 + h * 0.9))
    hammer = np.exp(-t * 300) * np.sin(2 * np.pi * f * 7 * t) * 0.08
    return (x + hammer) * np.minimum(1, t / 0.003) * np.clip((dur - t) / 0.08, 0, 1) * 0.5


def rhodes(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = mtof(m)
    mod = np.sin(2 * np.pi * f * t) * 1.2 * np.exp(-t * 4)
    x = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.4) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3)
    trem = 1 + 0.15 * np.sin(2 * np.pi * 4.5 * t)
    return x * trem * np.minimum(1, t / 0.004) * np.clip((dur - t) / 0.1, 0, 1) * 0.45


def bell(m, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t + 2.0 * np.sin(2 * np.pi * f * 3.5 * t) * np.exp(-t * 6))
    return x * np.exp(-t * 3.2) * np.minimum(1, t / 0.002) * 0.35


def pluck(m, dur=0.35, cut=3800):
    n = int(dur * SR); t = np.arange(n) / SR
    x = saw(mtof(m), n) * 0.7 + saw(mtof(m) * 1.006, n) * 0.5
    return lp(x, cut) * np.exp(-t * 13) * np.minimum(1, t / 0.002) * 0.6


def guitar(m, dur, rng, bright=0.5):
    """Karplus-Strong telli çalgı (IIR filtre ile)"""
    from scipy.signal import lfilter
    n = int(dur * SR)
    p = max(2, int(round(SR / mtof(m))))
    c = 0.5 * (0.990 + 0.0085 * bright)  # ortalama × sönüm (2c < 1 → kararlı)
    x = np.zeros(n); x[:p] = lp(rng.uniform(-1, 1, p), 2500 + 4000 * bright)[:min(p, n)]
    a = np.zeros(p + 2); a[0] = 1; a[p] = -c; a[p + 1] = -c
    out = lfilter([1.0], a, x)
    return lp(out, 5000) * np.clip((dur - np.arange(n) / SR) / 0.05, 0, 1) * 0.6


def lead(m, dur, kind='saw', vib=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = mtof(m) * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.3))
    if kind == 'saw': x = lp(saw(f, n) * 0.6 + saw(f * 1.004, n) * 0.4, 3200)
    elif kind == 'square': x = lp(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5, 2600)
    else: x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * env(n, a=0.01, d=0.2, s=0.75, r=0.06) * 0.4


def ney(m, dur, rng):
    n = int(dur * SR); t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.006 * np.sin(2 * np.pi * 5 * t) * np.minimum(1, t / 0.4))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    breath = bp(rng.standard_normal(n), mtof(m) * 1.5, mtof(m) * 6) * 0.35
    return (tone + breath) * env(n, a=0.08, d=0.3, s=0.85, r=0.12) * 0.35


def pad(notes, dur, cut, rng, voices=5):
    n = int(dur * SR)
    L = np.zeros(n); R = np.zeros(n)
    for m in notes:
        for v in range(voices):
            det = (v - (voices - 1) / 2) * 0.07
            x = saw(mtof(m + det), n, rng.random())
            pan = (v - (voices - 1) / 2) / max(1, voices - 1) * 1.6
            L += x * np.cos((pan + 1) * np.pi / 4); R += x * np.sin((pan + 1) * np.pi / 4)
    e = env(n, a=0.25, d=0.8, s=0.85, r=0.25)
    return np.vstack([lp(L, cut), lp(R, cut)]) * e / (voices * len(notes) * 0.6)


def bassnote(m, dur, kind='saw'):
    n = int(dur * SR); t = np.arange(n) / SR
    if kind == 'sub': x = np.sin(2 * np.pi * mtof(m) * t)
    elif kind == 'pluck': x = lp(saw(mtof(m), n), 900) * np.exp(-t * 6) + np.sin(2 * np.pi * mtof(m) * t) * 0.6
    else: x = lp(saw(mtof(m), n), 500) * 0.8 + np.sin(2 * np.pi * mtof(m) * t) * 0.6
    return np.tanh(1.3 * x) * env(n, a=0.004, d=0.15, s=0.8, r=0.03) * 0.6


def vinyl(n, rng):
    crackle = (rng.random(n) > 0.9993) * rng.uniform(-1, 1, n)
    hiss = lp(rng.standard_normal(n), 6000) * 0.012
    return lp(crackle, 5000) * 0.25 + hiss


# ------------------------------------------------------------------ armoni yardımcıları
SCALES = {
    'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10],
    'hicaz': [0, 1, 4, 5, 7, 8, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10],
}


def chord(root, quality):
    iv = {'M': [0, 4, 7], 'm': [0, 3, 7], 'M7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], '7': [0, 4, 7, 10], 'sus': [0, 5, 7]}[quality]
    return [root + i for i in iv]


def melody(rng, tonic, scale, chords, bars, beat, density=0.6, octave=72, rhythm=None):
    """Akor seslerine oturan, adım adım ilerleyen basit melodi üret."""
    sc = SCALES[scale]
    pitches = [tonic % 12 + o * 12 + s for o in range(3, 8) for s in sc]
    pitches = sorted(set(p for p in pitches if octave - 10 <= p <= octave + 12))
    notes = []
    cur = min(pitches, key=lambda p: abs(p - octave))
    motif = None
    for b in range(bars):
        ch = chords[b % len(chords)]
        tones = set(x % 12 for x in ch)
        if motif is None or b % 4 == 0:
            pattern = rhythm or [(0, 1), (1, 0.5), (1.5, 0.5), (2, 1), (3, 0.5), (3.5, 0.5)]
            motif = [(s, d) for s, d in pattern if rng.random() < density or s == 0]
        for s, d in motif:
            strong = s in (0, 2)
            cands = [p for p in pitches if abs(p - cur) <= 4]
            if strong:
                ct = [p for p in cands if p % 12 in tones]
                cands = ct or cands
            cur = cands[int(rng.integers(len(cands)))]
            notes.append((b * 4 * beat + s * beat, d * beat * 0.95, cur))
    return notes


def master(mix, path, total):
    x = sum(mix.b.values())
    x = hp(x, 30)
    peak = np.max(np.abs(x)) or 1
    x = np.tanh(x / peak * 1.4) / np.tanh(1.4)
    # baş/son 15 ms yumuşat (tık sesini önler)
    k = int(0.015 * SR)
    x[:, :k] *= np.linspace(0, 1, k); x[:, -k:] *= np.linspace(1, 0, k)
    wav = path + '.wav'
    wavfile.write(wav, SR, (x.T * 32000).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1.2:LRA=9',
                    '-ar', '44100', '-ac', '2', '-b:a', '128k', path + '.mp3'], check=True)
    os.remove(wav)


# ------------------------------------------------------------------ parçalar
def song(spec):
    rng = np.random.default_rng(spec['seed'])
    kit = Kit(rng)
    bpm = spec['bpm']; beat = 60 / bpm; bar = 4 * beat
    bars = spec.get('bars', 16)
    total = bars * bar + spec.get('tail', 1.2)
    mix = Mix(total)
    chords = spec['chords']
    style = spec['style']
    swing = spec.get('swing', 0)
    sw = lambda i: (beat / 4) * swing if i % 2 == 1 else 0  # 16'lık swing

    K = kit.kick(spec.get('punch', 1.0), spec.get('kick_low', 46))
    SN = kit.snare(spec.get('snare_tone', 190), spec.get('snare_decay', 22))
    CL, HC, HO, SH = kit.clap(), kit.hat(), kit.hat(True), kit.shaker()
    kicks = []
    intro = spec.get('intro', 2)

    for b in range(bars):
        t0 = b * bar
        ch = chords[b % len(chords)]
        root = ch[0]
        full = b >= intro
        last = b == bars - 1

        # ---------------- akor katmanı
        if style in ('pop', 'synth', 'dance', 'chill', 'energy', 'cinema', 'oriental'):
            cut = 900 + (2600 if full else 0) * (0.6 if style == 'cinema' else 1)
            mix.add('pad', pad([n + 12 for n in ch] if style != 'oriental' else [root + 12, root + 19], bar + 0.2, cut, rng), t0, spec.get('pad_gain', 0.5))
        if style in ('pop', 'hiphop', 'piano', 'cinema'):
            hits = {'pop': [0, 1.5, 2.5], 'hiphop': [0, 2.75], 'piano': [0, 1, 2, 3], 'cinema': [0, 2]}[style]
            for h in hits:
                for k, nn in enumerate(sorted(ch)):
                    mix.add('keys', piano(nn + 12, beat * (2.2 if style != 'piano' else 1.4), 0.8), t0 + h * beat + k * 0.012, 0.42 if style != 'piano' else 0.5, -0.2 + 0.2 * k)
            if style == 'piano':
                for e8 in range(8):
                    mix.add('keys', piano(sorted(ch)[e8 % len(ch)] + 24, beat * 0.9, 0.6), t0 + e8 * beat / 2, 0.22, 0.3)
        if style == 'lofi':
            for k, nn in enumerate(sorted(ch)):
                mix.add('keys', rhodes(nn + 12, bar * 0.95), t0 + k * 0.03, 0.45, -0.3 + 0.2 * k)
        if style == 'acoustic':
            strum = [0, 1, 1.5, 2.5, 3, 3.5]
            for s in strum:
                down = s in (0, 1, 3)
                order = sorted(ch) + [sorted(ch)[0] + 12]
                if not down: order = order[::-1]
                for k, nn in enumerate(order):
                    mix.add('keys', guitar(nn + 12, beat * 1.4, rng, 0.6 if down else 0.4), t0 + s * beat + k * 0.012, 0.38 if down else 0.26, -0.25 + 0.15 * k)
        if style == 'funk':
            for s in [0.5, 1.5, 1.75, 2.5, 3.5]:
                for k, nn in enumerate(sorted(ch)):
                    mix.add('keys', pluck(nn + 24, beat * 0.25, 2600), t0 + s * beat + k * 0.004, 0.3, 0.3)
        if style in ('synth', 'dance', 'chill') and full:
            tones = sorted(ch) + [sorted(ch)[0] + 12]
            pat = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2]
            for s16 in range(16):
                if style == 'chill' and s16 % 2: continue
                f = bell if style == 'chill' else pluck
                mix.add('arp', f(tones[pat[s16]] + 24, beat * (0.5 if style == 'chill' else 0.3)), t0 + s16 * beat / 4, 0.24 if s16 % 4 else 0.32, 0.25 if s16 % 2 else -0.25)

        # ---------------- bas
        if full or style in ('oriental', 'funk'):
            bk = spec.get('bass', 'saw')
            if style in ('dance', 'energy', 'synth'):
                for e8 in range(8):
                    if style == 'dance' and e8 % 2 == 0: continue
                    mix.add('bass', bassnote(root - 12 + (12 if (style == 'synth' and e8 % 2) else 0), beat / 2 * 0.9, bk), t0 + e8 * beat / 2, 0.5)
            elif style == 'funk':
                for s, o in [(0, 0), (0.75, 12), (1.5, 0), (2, 7), (2.75, 12), (3.5, 10)]:
                    mix.add('bass', bassnote(root - 12 + o, beat * 0.4, 'pluck'), t0 + s * beat, 0.55)
            elif style == 'oriental':
                for s in [0, 1.5, 2, 3]:
                    mix.add('bass', bassnote(root - 12, beat * 0.8, 'pluck'), t0 + s * beat, 0.5)
            else:
                for s in ([0, 2] if style in ('pop', 'acoustic', 'lofi', 'chill') else [0, 1.5, 2.75] if style == 'hiphop' else [0]):
                    mix.add('bass', bassnote(root - 12, beat * (1.8 if s == 0 else 1.2), 'sub' if style in ('hiphop', 'lofi') else bk), t0 + s * beat, 0.55)

        # ---------------- davul
        if not full and style not in ('oriental',): continue
        if style in ('piano',): continue
        if style == 'cinema' and b < bars // 2: continue
        for q in range(4):
            tq = t0 + q * beat
            if style in ('dance', 'energy') or (style == 'synth' and q % 2 == 0):
                mix.add('drums', K, tq, 1.0); kicks.append(tq)
            elif style in ('pop', 'chill') and q in (0, 2):
                mix.add('drums', K, tq, 0.95); kicks.append(tq)
            elif style == 'hiphop' and q == 0:
                mix.add('drums', K, tq, 1.0); kicks.append(tq)
            elif style in ('lofi', 'acoustic', 'funk', 'cinema') and q in (0, 2):
                mix.add('drums', K, tq, 0.8 if style != 'funk' else 1.0); kicks.append(tq)
            if q in (1, 3):
                if style in ('dance', 'funk'): mix.add('drums', CL, tq, 0.55, 0.05)
                elif style == 'acoustic': mix.add('drums', SN, tq, 0.25, 0.05)
                elif style == 'oriental': pass
                else: mix.add('drums', SN, tq, 0.5 if style not in ('lofi', 'chill') else 0.38, 0.05)
            # hihat
            if style == 'acoustic':
                for s16 in range(4): mix.add('drums', SH, tq + s16 * beat / 4 + sw(s16), 0.12 if s16 % 2 else 0.2, 0.3)
            elif style != 'oriental':
                for s in ([0.5] if style in ('pop', 'synth', 'cinema') else [0, 0.5] if style in ('lofi', 'hiphop', 'chill') else [0.5] if style == 'dance' else [0, 0.25, 0.5, 0.75]):
                    h = HO if (style == 'dance' and s == 0.5) else HC
                    i16 = int(s * 4)
                    mix.add('drums', h, tq + s * beat + sw(i16), 0.18 if style != 'dance' else 0.22, 0.25)
        if style == 'hiphop':
            mix.add('drums', K, t0 + 2.5 * beat + sw(1), 0.8); kicks.append(t0 + 2.5 * beat)
        if style == 'oriental':  # maksum: düm tek - tek düm - tek -
            for s, kind in [(0, 'd'), (1, 't'), (1.5, 't'), (2, 'd'), (3, 't'), (3.5, 't')]:
                mix.add('drums', kit.doum() if kind == 'd' else kit.tek(), t0 + s * beat, 0.7 if kind == 'd' else 0.45, 0 if kind == 'd' else 0.2)
        if b % 4 == 3 and style in ('pop', 'energy', 'synth', 'dance') and not last:
            for k in range(4): mix.add('drums', SN, t0 + 3 * beat + k * beat / 4, 0.16 + 0.07 * k, 0.1)
        if style == 'energy':
            for q in range(4): mix.add('drums', HO if q % 2 else HC, t0 + q * beat + beat / 2, 0.2, -0.2)

    # ---------------- melodi
    mstart = spec.get('melody_from', intro + 2)
    if mstart < bars - 1:
        mel = melody(rng, spec['tonic'], spec['scale'], chords, bars - mstart - 1, beat, spec.get('density', 0.6), spec.get('mel_oct', 72), spec.get('rhythm'))
        inst = spec.get('lead', 'pluck')
        for t, d, m in mel:
            tt = mstart * bar + t
            if inst == 'pluck': s = pluck(m, max(0.2, d * 1.2))
            elif inst == 'bell': s = bell(m, d * 2)
            elif inst == 'piano': s = piano(m, d * 2, 1.0)
            elif inst == 'ney': s = ney(m, d * 1.05, rng)
            elif inst == 'whistle': s = lead(m, d, 'sine', 0.012)
            elif inst == 'guitar': s = guitar(m, d * 1.5, rng, 0.7)
            else: s = lead(m, d, inst, 0.004)
            mix.add('lead', s, tt, spec.get('lead_gain', 0.5), 0.1)

    # ---------------- kapanış akoru
    end = bars * bar
    ch = chords[0]
    if style in ('piano', 'cinema', 'lofi'):
        for k, nn in enumerate(sorted(ch)): mix.add('keys', piano(nn + 12, spec.get('tail', 1.2) + 0.3), end + k * 0.02, 0.4)
    else:
        mix.add('drums', K, end, 0.9)
        mix.add('pad', pad([n + 12 for n in ch], spec.get('tail', 1.2), 2400, rng) * np.linspace(1, 0, int(spec.get('tail', 1.2) * SR)), end, 0.5)

    # ---------------- efektler
    if 'lead' in mix.b:  # geri besleme gecikmesi
        src = mix.b['lead'].copy(); dl = int(beat * 0.75 * SR)
        for k in range(1, 3):
            sh = np.zeros_like(src); sh[:, dl * k:] = src[:, :mix.N - dl * k] * (0.3 ** k)
            mix.b['lead'] += lp(sh[::-1] if k % 2 else sh, 3500)
    if style in ('dance', 'synth', 'energy') and kicks:  # sidechain
        sc = np.ones(mix.N); tt = np.arange(mix.N) / SR
        for tb in kicks:
            i0 = int(tb * SR); i1 = min(mix.N, i0 + int(0.3 * SR))
            sc[i0:i1] = np.minimum(sc[i0:i1], 1 - 0.55 * np.exp(-(tt[i0:i1] - tb) / 0.1))
        for k in ('pad', 'bass', 'arp'):
            if k in mix.b: mix.b[k] *= sc
    if style == 'lofi':
        for k in list(mix.b): mix.b[k] = lp(mix.b[k], 5200)
        v = vinyl(mix.N, rng); mix.add('fx', v, 0, 1.0)
    if 'drums' in mix.b: mix.b['drums'] *= spec.get('drum_gain', 0.85)
    return mix, total


def C(n, q): return chord(n, q)


TRACKS = [
    dict(id='yaz-aksami', title='Yaz Akşamı', genre='Pop', mood='Neşeli', bpm=104, seed=11, style='pop', tonic=60, scale='major',
         chords=[C(48, 'M'), C(43, 'M'), C(45, 'm'), C(41, 'M')], lead='pluck', mel_oct=76, density=0.7),
    dict(id='kahve-molasi', title='Kahve Molası', genre='Lo-fi', mood='Sakin', bpm=82, seed=22, style='lofi', tonic=65, scale='major', swing=0.55, bars=12,
         chords=[C(41, 'M7'), C(40, 'm7'), C(38, 'm7'), C(36, 'M7')], lead='bell', mel_oct=77, density=0.5, rhythm=[(0, 1.5), (2, 0.5), (2.5, 1), (3.5, 0.5)]),
    dict(id='neon-sehir', title='Neon Şehir', genre='Retro', mood='Gece', bpm=100, seed=33, style='synth', tonic=57, scale='minor',
         chords=[C(45, 'm'), C(41, 'M'), C(48, 'M'), C(43, 'M')], lead='saw', mel_oct=72, snare_decay=10, density=0.6),
    dict(id='ritim-34', title='Ritim 34', genre='Elektronik', mood='Enerjik', bpm=124, seed=44, style='dance', tonic=53, scale='minor',
         chords=[C(41, 'm'), C(37, 'M'), C(44, 'M'), C(39, 'M')], lead='pluck', mel_oct=77, bass='saw', density=0.7),
    dict(id='sahil-yolu', title='Sahil Yolu', genre='Akustik', mood='Huzurlu', bpm=96, seed=55, style='acoustic', tonic=55, scale='major',
         chords=[C(43, 'M'), C(38, 'M'), C(40, 'm'), C(36, 'M')], lead='whistle', mel_oct=79, density=0.55),
    dict(id='gece-yuruyusu', title='Gece Yürüyüşü', genre='Hip-hop', mood='Havalı', bpm=88, seed=66, style='hiphop', tonic=62, scale='minor', swing=0.4,
         chords=[C(38, 'm'), C(46, 'M'), C(43, 'm'), C(45, 'M')], lead='piano', mel_oct=74, density=0.45, punch=1.3, kick_low=42),
    dict(id='hicaz-esintisi', title='Hicaz Esintisi', genre='Oryantal', mood='Gizemli', bpm=96, seed=77, style='oriental', tonic=62, scale='hicaz',
         chords=[C(38, 'M'), C(38, 'M'), C(43, 'm'), C(38, 'M')], lead='ney', mel_oct=74, density=0.65, intro=1, melody_from=2,
         rhythm=[(0, 1.5), (1.5, 0.5), (2, 0.5), (2.5, 0.5), (3, 1)]),
    dict(id='gun-dogumu', title='Gün Doğumu', genre='Sinematik', mood='Duygusal', bpm=76, seed=88, style='cinema', tonic=63, scale='major', bars=12,
         chords=[C(39, 'M'), C(36, 'm'), C(44, 'M'), C(46, 'M')], lead='piano', mel_oct=75, density=0.5, tail=2.5, pad_gain=0.65),
    dict(id='kalp-atisi', title='Kalp Atışı', genre='Romantik', mood='Romantik', bpm=72, seed=99, style='piano', tonic=60, scale='minor', bars=12,
         chords=[C(48, 'm'), C(44, 'M'), C(51, 'M'), C(46, 'M')], lead='piano', mel_oct=79, density=0.55, tail=2.5),
    dict(id='enerji', title='Enerji', genre='Pop Rock', mood='Coşkulu', bpm=128, seed=111, style='energy', tonic=52, scale='minor',
         chords=[C(40, 'm'), C(36, 'M'), C(43, 'M'), C(38, 'M')], lead='square', mel_oct=76, density=0.75),
    dict(id='yildiz-tozu', title='Yıldız Tozu', genre='Chill', mood='Rüya gibi', bpm=110, seed=122, style='chill', tonic=57, scale='major',
         chords=[C(45, 'M'), C(42, 'm'), C(38, 'M'), C(40, 'M')], lead='bell', mel_oct=81, density=0.5),
    dict(id='eski-kaset', title='Eski Kaset', genre='Funk', mood='Eğlenceli', bpm=112, seed=133, style='funk', tonic=52, scale='dorian', swing=0.3,
         chords=[C(40, 'm7'), C(45, '7')], lead='saw', mel_oct=76, density=0.6, intro=1),
]


if __name__ == '__main__':
    only = sys.argv[1:]
    meta = []
    for spec in TRACKS:
        if only and spec['id'] not in only:
            continue
        mix, total = song(spec)
        master(mix, os.path.join(OUT, spec['id']), total)
        meta.append({'id': spec['id'], 'title': spec['title'], 'artist': 'Rozstram Müzik', 'genre': spec['genre'], 'mood': spec['mood'], 'duration': round(total, 2)})
        print('ok', spec['id'], round(total, 1), 's')
    if not only:
        json.dump(meta, open(os.path.join(OUT, 'tracks.json'), 'w'), ensure_ascii=False, indent=1)
