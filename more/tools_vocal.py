import librosa, numpy as np, matplotlib, json
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.signal import find_peaks
sr = 22050
y, _ = librosa.load('audio/song.wav', sr=sr, mono=False, duration=56)
L = librosa.stft(y[0], n_fft=2048, hop_length=256); R = librosa.stft(y[1], n_fft=2048, hop_length=256)
mag = np.abs(L) + np.abs(R) + 1e-9
center = np.clip(1 - np.abs(L - R) / mag, 0, 1) ** 3
M = (L + R) / 2 * center
Hm, Pm = librosa.decompose.hpss(M, margin=(1.0, 2.5))
vocal = librosa.istft(Hm, hop_length=256)
import soundfile as sf
sf.write('audio/vocal_guess.wav', vocal, sr)
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
A = np.abs(Hm)
env = A[(freqs > 250) & (freqs < 4000)].sum(0)
env = np.convolve(env, np.hanning(9) / np.hanning(9).sum(), mode='same')
env /= np.percentile(env, 99)
t = librosa.frames_to_time(np.arange(len(env)), sr=sr, hop_length=256)
np.save('audio/env.npy', np.stack([t, env]))
beats = librosa.beat.beat_track(y=y.mean(0), sr=sr, units='time')[1]
bars = beats[::4]
starts = [b for b in bars if 7.0 < b < 52.5]
print('line starts', [round(b, 2) for b in starts[::2]])
fig, axes = plt.subplots(12, 1, figsize=(22, 30))
for i in range(12):
    a = starts[i * 2] - 0.6; b = a + 3.7 + 1.2
    m = (t >= a) & (t <= b)
    axes[i].plot(t[m], env[m], color='k')
    pk, _ = find_peaks(env[m], prominence=0.08, distance=4)
    axes[i].plot(t[m][pk], env[m][pk], 'ro', ms=4)
    for j, bt in enumerate(beats):
        if a <= bt <= b: axes[i].axvline(bt, color='c' if j % 4 == 0 else '0.7', lw=2 if j % 4 == 0 else 1)
    axes[i].set_xlim(a, b); axes[i].set_xticks(np.arange(round(a, 1), b, 0.25)); axes[i].tick_params(labelsize=8)
    axes[i].set_title(f'line {i+1}', fontsize=10, loc='left')
plt.tight_layout(); plt.savefig('/tmp/claude-0/-home-user-eze/f6a34cb5-293e-5e63-a806-ffe7baac476e/scratchpad/env.png', dpi=50)
