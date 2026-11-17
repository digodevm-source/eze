import sys, json
from faster_whisper import WhisperModel
M = '/tmp/claude-0/-home-user-eze/f6a34cb5-293e-5e63-a806-ffe7baac476e/scratchpad/whisper-small'
model = WhisperModel(M, device='cpu', compute_type='int8', cpu_threads=4)
lyrics = open('audio/lyrics.txt').read()
import soundfile as sf, numpy as np
src, _sr = sf.read(sys.argv[1], dtype='float32')
assert _sr == 16000
segs, info = model.transcribe(src, language='ru', word_timestamps=True, beam_size=5, initial_prompt=lyrics.replace('\n', ' '), vad_filter=False, condition_on_previous_text=True)
out = []
for s in segs:
    print(f"[{s.start:6.2f} - {s.end:6.2f}] {s.text}")
    for w in s.words:
        out.append({'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3), 'p': round(w.probability, 3)})
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
