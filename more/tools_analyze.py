import librosa, numpy as np, json, sys
y, sr = librosa.load('audio/song.wav', sr=22050, mono=True, duration=60)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
print('tempo', tempo)
print('beats', np.round(beats[:60], 2).tolist())
# harmonic/percussive split, vocal-ish band energy
H, P = librosa.effects.hpss(y)
S = np.abs(librosa.stft(H, n_fft=2048, hop_length=256))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
band = S[(freqs > 300) & (freqs < 3500)].sum(0)
times = librosa.frames_to_time(np.arange(len(band)), sr=sr, hop_length=256)
band = band / band.max()
for t0 in np.arange(0, 60, 1.0):
    m = (times >= t0) & (times < t0 + 1)
    v = band[m].mean()
    print(f"{t0:5.1f} {'#' * int(v * 80)}")
