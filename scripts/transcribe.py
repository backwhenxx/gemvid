"""Тайминги слов из озвучки (faster-whisper).

python scripts/transcribe.py voice.mp3 words.json --prompt "текст сценария" [--model small]
"""
import argparse
import json

from faster_whisper import WhisperModel

ap = argparse.ArgumentParser()
ap.add_argument("audio")
ap.add_argument("out")
ap.add_argument("--prompt", default="")
ap.add_argument("--model", default="small")
ap.add_argument("--lang", default="ru")
a = ap.parse_args()

model = WhisperModel(a.model, device="cpu", compute_type="int8")
segments, info = model.transcribe(
    a.audio,
    language=a.lang,
    word_timestamps=True,
    beam_size=5,
    vad_filter=False,
    condition_on_previous_text=False,
)
words = []
for s in segments:
    for w in s.words or []:
        t = w.word.strip()
        if t:
            words.append({"text": t, "start": round(w.start, 3), "end": round(w.end, 3)})

with open(a.out, "w", encoding="utf-8") as f:
    json.dump({"duration": info.duration, "words": words}, f, ensure_ascii=False, indent=1)
print(f"whisper: {len(words)} слов, {info.duration:.1f} с")
