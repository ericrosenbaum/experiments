# Spoken Worlds

Make and play small text adventures by talking. The author speaks scenes and
choices; those recordings become the game. A synth "narrator" voice runs the
tool and fills in anything not recorded. An on-device decision model maps
what the player says to one of the author's options — it never writes
content. Game logic (items, locks, endings) is a tiny deterministic rule
language.

- **Design & full workflow walkthrough:** [DESIGN.md](DESIGN.md)
- **Prototype:** `index.html` (static, no build). Serve the folder, e.g.
  `python3 -m http.server`, and open it in desktop Chrome. Deploys to
  https://ericrosenbaum.github.io/experiments/spoken-worlds/

## Prototype map

| file | what |
|---|---|
| `js/engine.js` | world model, rules parser, turn resolution, built-in commands, lint |
| `js/decide.js` | decision model: lexical / sentence embeddings / built-in browser LLM |
| `js/speech.js` | recording, speech-to-text (Whisper on device, or Web Speech), TTS, playing mixed recorded + synth lines |
| `js/author.js` | the spoken authoring conversation (to-do queue of unfinished scenes) |
| `js/store.js` | IndexedDB storage, export/import file, text-only share links |
| `js/sample.js` | "Space Adventure", a complete example world |
| `js/examples.js` | "Rainy Saturday" and "Harbor Morning": exploratory, nothing to win |
| `js/audio.js` | sound effects (Scratch library clips in `sounds/`), shared output and ducking |
| `js/music.js` | scene music from the Story Soundtrack Lab: 16 moods × 4 clips in `music/`, crossfading clip engine, keyword suggestions |
| `js/app.js` | UI: play, author by voice, map editor, debug panel, settings |

Everything runs in the browser. Model files (Whisper, MiniLM) download once
from the Hugging Face hub via transformers.js and are cached; after that it
works offline.
