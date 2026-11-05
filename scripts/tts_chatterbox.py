"""Запасная озвучка без ElevenLabs — Chatterbox Multilingual (русский поддерживается).

pip install -r requirements-tts.txt
python scripts/tts_chatterbox.py "текст" voice.wav [--ref образец_голоса.wav]

Без видеокарты работает медленно (минуты на ролик). Основной путь — mp3 из ElevenLabs.
"""
import argparse

import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

ap = argparse.ArgumentParser()
ap.add_argument("text")
ap.add_argument("out")
ap.add_argument("--ref", default=None, help="wav-образец голоса для клонирования")
ap.add_argument("--exaggeration", type=float, default=0.6)
a = ap.parse_args()

model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
wav = model.generate(a.text, language_id="ru", audio_prompt_path=a.ref, exaggeration=a.exaggeration)
torchaudio.save(a.out, wav, model.sr)
print("готово:", a.out)
