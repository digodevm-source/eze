# Builds audio/timing.json: lyric lines with word times, per-frame mouth curves, beats.
import json, re, numpy as np, librosa
FPS = 30
OFFSET = 4.30          # song time at video t=0
END = 52.60            # song time at video end
words = json.load(open('audio/asr_mix.json'))
lines_txt = [l.strip() for l in open('audio/lyrics.txt') if l.strip()]
DISPLAY = [
  'ЕДЕМ НА МОРЕ С БРАТОМ, И ЧЁЛКА ДО КОЛЕНА',
  'В ТВОИХ ТЕКСТАХ ЛИШЬ ВОДА — ОНА НАМ ПО КОЛЕНО',
  'МНОГО НАДО ЧЕ СДЕЛАТЬ, НО ЭТО ПОКА ЛЕНЬ НАМ',
  'И СМОТРИМ НА ЗАКАТ, БАРМЕН, ТЫ ПОКА ЛЕЙ НАМ',
  'МЫ ПОСЫЛАЕМ ЛЕЙМОВ, ВЕДЬ NAHEI НА ВИКЕНДЕ',
  'ПОХУЙ НА ВАШУ МОДУ, ПОХУЙ ЧЕ БУДЕТ В ТРЕНДЕ',
  'И Я СМОТРЮ НА ВОЛНЫ, ИХ РАЗВИВАЕТ ВЕТЕР',
  'ДА Я СО СВОИМ ХОУМИ, И МЫ ПРОВОДИМ ВЕЧЕР',
  'УБИВАЯ ПЕЧЕНЬ И СМОТРЯ НА ЭТИ ВСЕ КРАСОТЫ',
  'ЛЁЖА НА ПЕСКЕ, В ОКРУЖЕНИИ КРАСОТОК',
  'В СТАКАНЕ ТРУБОЧКА С ЗОНТОМ, И ПОВЕРЬ, ЧТО НЕ СОК ТАМ',
  'В ОБЕИХ РУКАХ ДЕРЖИМ 51 ГРАММ',
]
SINGER = ['A'] * 6 + ['B'] * 6
ws = [w for w in words if w['s'] >= 7.0]
out_lines = []
i = 0
for li, disp in enumerate(DISPLAY):
    toks = [t for t in disp.split(' ') if t not in ('—',)]
    n = len(toks)
    seg = ws[i:i + n]; i += n
    assert len(seg) == n, (li, len(seg), n)
    wl = []
    for k, (tok, w) in enumerate(zip(toks, seg)):
        t0 = w['s']; t1 = w['e']
        nxt = seg[k + 1]['s'] if k + 1 < n else None
        if nxt is not None: t1 = min(t1, nxt)
        wl.append({'w': tok, 't0': round(t0 - OFFSET, 3), 't1': round(max(t1, t0 + 0.12) - OFFSET, 3), 'src': w['w']})
    out_lines.append({'text': disp, 'singer': SINGER[li], 't0': wl[0]['t0'], 't1': wl[-1]['t1'], 'words': wl})
# fix line ends: each line lasts until next starts
for li in range(len(out_lines) - 1):
    out_lines[li]['until'] = out_lines[li + 1]['t0']
out_lines[-1]['until'] = round(END - OFFSET, 3)

# syllable-based mouth curves
VOW = 'аеёиоуыэюяaeiouy'
OPEN = {'а': 1.0, 'я': 0.95, 'о': 0.85, 'э': 0.8, 'е': 0.75, 'ё': 0.8, 'ы': 0.55, 'и': 0.5, 'у': 0.55, 'ю': 0.55, 'a': 1, 'e': 0.75, 'i': 0.5, 'o': 0.85, 'u': 0.55, 'y': 0.5}
ROUND = {'о': 1, 'у': 1, 'ю': 0.8, 'ё': 0.7, 'o': 1, 'u': 1}
N = int(round((END - OFFSET) * FPS)) + 1
t = np.arange(N) / FPS
env_t, env = np.load('audio/env.npy')
env_i = np.interp(t + OFFSET, env_t, env)
mouth = {'A': np.zeros(N), 'B': np.zeros(N)}
oshape = {'A': np.zeros(N), 'B': np.zeros(N)}
for L in out_lines:
    who = L['singer']
    for w in L['words']:
        text = w['w'].lower()
        if text == '51': text = 'пятьдесят один'
        if text == 'nahei': text = 'нахуй'
        vs = [c for c in text if c in VOW] or ['а']
        n = len(vs)
        d = w['t1'] - w['t0']
        for k, v in enumerate(vs):
            c = w['t0'] + (k + 0.5) * d / n
            width = max(0.06, d / n * 0.55)
            g = np.exp(-0.5 * ((t - c) / width) ** 2)
            amp = OPEN.get(v, 0.7) * (0.75 + 0.35 * np.clip(env_i, 0, 1.2))
            mouth[who] = np.maximum(mouth[who], g * amp)
            oshape[who] = np.maximum(oshape[who], g * ROUND.get(v, 0))
for k in mouth:
    mouth[k] = np.clip(mouth[k], 0, 1)
y, sr = librosa.load('audio/song.wav', sr=22050, mono=True, offset=OFFSET, duration=END - OFFSET)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
onset = librosa.onset.onset_strength(y=y, sr=sr)
on_t = librosa.times_like(onset, sr=sr)
kick = np.interp(t, on_t, onset / onset.max())
json.dump({
  'fps': FPS, 'offset': OFFSET, 'duration': round(END - OFFSET, 3), 'tempo': float(np.atleast_1d(tempo)[0]),
  'beats': [round(float(b), 3) for b in beats], 'lines': out_lines,
  'mouthA': [round(float(v), 3) for v in mouth['A']], 'mouthB': [round(float(v), 3) for v in mouth['B']],
  'oA': [round(float(v), 3) for v in oshape['A']], 'oB': [round(float(v), 3) for v in oshape['B']],
  'kick': [round(float(v), 3) for v in kick],
}, open('audio/timing.json', 'w'), ensure_ascii=False)
for L in out_lines:
    print(f"{L['singer']} {L['t0']:6.2f}-{L['until']:6.2f} | " + ' '.join(f"{w['w']}({w['t0']:.2f})" for w in L['words']))
print('frames', N, 'tempo', tempo)
