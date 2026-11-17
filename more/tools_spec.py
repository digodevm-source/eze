import librosa, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
y, sr = librosa.load('audio/song.wav', sr=22050, mono=False, duration=56)
mid = y.mean(0); side = (y[0] - y[1]) / 2
print('side/mid rms', np.sqrt((side**2).mean()) / np.sqrt((mid**2).mean()))
H, P = librosa.effects.hpss(mid, margin=(1.0, 3.0))
tempo, beats = librosa.beat.beat_track(y=mid, sr=sr, units='time')
S = librosa.amplitude_to_db(np.abs(librosa.stft(H, n_fft=2048, hop_length=256)), ref=np.max)
S2 = librosa.amplitude_to_db(np.abs(librosa.stft(mid, n_fft=2048, hop_length=256)), ref=np.max)
import sys
segs = [(4, 18), (17, 31), (30, 44), (42, 56)]
fig, axes = plt.subplots(len(segs), 1, figsize=(26, 5 * len(segs)))
for ax, (a, b) in zip(axes, segs):
    fa, fb = int(a * sr / 256), int(b * sr / 256)
    ax.imshow(S[:300, fa:fb], origin='lower', aspect='auto', extent=[a, b, 0, 300 * sr / 2048], cmap='magma', vmin=-70, vmax=0)
    for i, bt in enumerate(beats):
        if a <= bt <= b:
            ax.axvline(bt, color='cyan' if i % 4 == 0 else 'white', lw=2 if i % 4 == 0 else 0.5, alpha=0.8)
    ax.set_xticks(np.arange(a, b, 0.5)); ax.tick_params(labelsize=9)
    ax.set_ylim(0, 3200)
plt.tight_layout(); plt.savefig('/tmp/claude-0/-home-user-eze/f6a34cb5-293e-5e63-a806-ffe7baac476e/scratchpad/spec.png', dpi=60)
print('bars', [round(b, 2) for i, b in enumerate(beats) if i % 4 == 0][:32])
