# gemvid — фабрика шортсов «ШТА?!»

Вертикальные Shorts 1080×1920 собираются **из кода**, без платных генераторов видео.
Сценарий + озвучка → готовый mp4 в разделе **Releases** этого репо (видно и с телефона).

## Как это работает

```
episodes/<имя>/episode.json  ← сценарий по сценам (пишет Claude)
episodes/<имя>/voice.mp3     ← озвучка из ElevenLabs (голос «Евгений»)
          │
          ▼  push в main → GitHub Actions
faster-whisper  → тайминги каждого слова, сцены встают точно на слова
Remotion        → кадры: 3D, физика, частицы, чертежи, субтитры
Tone.js         → звуки (whoosh, удар, райзер, «динь») и музыкальная подложка
FFmpeg          → громкость −14 LUFS, mp4, превью
          │
          ▼
Releases → <имя>-N → <имя>.mp4
```

## Что из подборки где используется

| Инструмент | Роль |
|---|---|
| **Remotion** | основа: React-компоненты → видео |
| **Anime.js** | влёт текста по буквам в хуке |
| **PixiJS** | светящиеся частицы (хук, финал) |
| **p5.js** | генеративный фон для сцены-числа |
| **Paper.js** | чертёж «от руки» в разрезе |
| **Three.js** | 3D-модели, облёт камерой, разрез |
| **Rapier** | 3D-физика: предметы сыплются в контейнер |
| **Matter.js** | 2D-физика: эмодзи падают в «стакан» |
| **OGL** | шейдерные фоны и GL-переходы |
| **GL Transitions** | переходы между картинками (Nano Banana) |
| **glTF Transform** | сжатие 3D-моделей: `npm run models:optimize` |
| **Tone.js** | звуки и музыка, синтез офлайн |
| **faster-whisper** | тайминги слов для субтитров и смены сцен |
| **Chatterbox** | запасная озвучка без ElevenLabs: `scripts/tts_chatterbox.py` |
| **FFmpeg** | громкость, финальный файл, превью |

Не в конвейере (это программы с ручным интерфейсом):
[OBS Studio](https://github.com/obsproject/obs-studio) — запись экрана,
[OpenCut](https://github.com/OpenCut-app/OpenCut) — ручная правка на таймлайне.
[HyperFrames](https://github.com/heygen-com/hyperframes) дублирует Remotion, поэтому не подключён.

Почему не **tsParticles** и **React Spring**: они живут по реальному времени браузера,
а Remotion рендерит кадры вразнобой — анимация «плыла» бы. Частицы сделаны на PixiJS,
пружины — встроенным `spring()` Remotion (та же физика, но покадровая).

## Сцены (`type` в episode.json)

| type | что это | главные props |
|---|---|---|
| `hook` | крупная фраза влетает по буквам | `text` («слова \*акцент\*»), `sub` |
| `number` | большое число со счётчиком | `value`, `prefix`, `suffix`, `decimals`, `label` |
| `draw` | чертёж-разрез рисуется линиями | `preset` или `paths:[{d,color,width}]`, `labels:[{text,x,y,at}]`, `title` |
| `model3d` | 3D + облёт + разрез | `model` (.glb) или `primitive:"cellar"`, `cutaway`, `title` |
| `physics3d` | предметы сыплются в контейнер | `count`, `shape` (box/sphere/coin), `size`, `label` |
| `physics2d` | эмодзи падают в стакан | `items`, `count`, `radius`, `label` |
| `image` | картинка с наездом; две подряд → GL-переход | `src`, `title`, `transition` |
| `video` | клип (Veo 3) | `src`, `startFrom`, `keepAudio` |
| `outro` | «ПОДПИШИСЬ» с нажатием | `channel`, `cta` |

`say` у каждой сцены — текст озвучки для этой сцены. Сцена начинается, когда звучит её первое слово.
Теги эмоций ElevenLabs в квадратных скобках (`[удивлённо]`) из субтитров вырезаются.

## Новый ролик

1. Claude пишет `episodes/<имя>/episode.json` и присылает текст для ElevenLabs.
2. Озвучка → `episodes/<имя>/voice.mp3` (присылаешь Claude или загружаешь в репо сам).
3. Push в `main` запускает рендер (~10–15 мин). Готовое видео — в **Releases**.

Ручной запуск: Actions → «Рендер шортса» → Run workflow → имя папки.

## Локально (если захочется на компьютере)

```bash
npm install && pip install -r requirements.txt
npm run studio                          # предпросмотр в браузере
node scripts/build.mjs episodes/demo --demo-voice
```

Remotion бесплатен для частных лиц и компаний до 3 человек.
