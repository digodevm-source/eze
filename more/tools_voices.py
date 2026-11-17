import json, numpy as np, librosa
words = json.load(open('audio/asr_mix.json'))
lines_txt = [l.strip() for l in open('audio/lyrics.txt') if l.strip()]
# group words into lines by known word counts
counts = [len(l.replace(' - ', ' ').split()) for l in lines_txt]
ws = [w for w in words if w['s'] >= 7.0]
lines = []; i = 0
for c in counts:
    lines.append(ws[i:i + c]); i += c
y, sr = librosa.load('audio/vocal_guess.wav', sr=22050)
feats = []
for k, L in enumerate(lines):
    a, b = L[0]['s'], L[-1]['e']
    seg = y[int(a * sr):int(b * sr)]
    f0, vf, vp = librosa.pyin(seg, fmin=70, fmax=400, sr=sr, frame_length=2048)
    f0v = f0[vf & (vp > 0.5)]
    mf = librosa.feature.mfcc(y=seg, sr=sr, n_mfcc=13).mean(1)
    cen = librosa.feature.spectral_centroid(y=seg, sr=sr).mean()
    feats.append(mf)
    print(f"{k+1:2d} {a:6.2f}-{b:6.2f} f0 med {np.nanmedian(f0v) if len(f0v) else 0:6.1f} n={len(f0v):4d} centroid {cen:6.0f} | {' '.join(w['w'] for w in L)}")
F = np.array(feats); F = (F - F.mean(0)) / (F.std(0) + 1e-9)
from numpy.linalg import norm
D = np.array([[norm(F[i] - F[j]) for j in range(12)] for i in range(12)])
np.set_printoptions(precision=1, suppress=True, linewidth=200)
print(D)
