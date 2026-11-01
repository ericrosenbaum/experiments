# Spoken Worlds — design notes

A way to **make and play small text adventures almost entirely by talking**.
The author speaks scenes and choices into the phone; their recordings become
the game's voice. A synthesized "narrator" voice runs the tool and fills in
anything that wasn't recorded. Everything — speech recognition, the AI, audio,
storage — runs on the device.

Status: speculative. This doc maps the whole workflow for one small but
complete adventure, then the tech plan. The prototype in this branch
(`index.html`) implements a first cut of all of it so we can feel it out.

---

## 1. The core idea: AI as a decision model, not a writer

Like the Q&A blocks in the Scratch editor experiments, the AI never *makes up*
content. At every turn it does exactly one job:

> **input:** what the player said (text) + a fixed list of choices
> **output:** `{ "choice": "<one of the ids>" | null, "confidence": 0..1 }`

Everything the player hears was authored (recorded or typed). Everything that
*happens* — items, locked doors, winning — is plain deterministic code. The AI
is only the bridge between messy speech and a clean choice.

The same decision model runs the **authoring tool** too: when the tool asks
"Does this take the player somewhere?", the author's answer is matched against
`[stay here, a new place, <each existing place>]`. One mechanism, used
everywhere, which keeps the system small and predictable.

```
 mic ──► speech-to-text ──► decision model ──► game engine ──► speech queue ──► speaker
        (on-device ASR)    (pick 1 of N)      (deterministic)  (recording or TTS)
```

---

## 2. The world model

A world is a graph of **scenes**. Each scene has a description and a few
**options**. Choosing an option plays a **result**, applies some simple
**rules**, and maybe moves you to another scene (which then plays its own
description).

```
World
├─ title, start scene
├─ items        name + optional recording ("a keycard")
└─ scenes
   └─ Scene     name, description (recording + transcript)
      └─ Option
         ├─ phrase        what the player says ("look around")  ← matched by the AI
         ├─ also          extra phrasings ("search the room")   ← optional
         ├─ result        what you hear when it works
         └─ rules         (optional, see below)
```

Every bit of spoken content is a **Line**: `{ text, clip? }`. `text` is the
transcript (or typed text); `clip` is a reference to a recording. At play time
a line plays its clip if it has one, otherwise the synth voice reads the text.
That's how recorded and synthesized voice mix naturally.

### Rules — a tiny, speakable logic language

Kept deliberately small. One rule per line, each one something you could say
out loud:

| rule | meaning |
|---|---|
| `go <scene>` | after the result, move to that scene |
| `needs <thing>` | only works if you have the item or the fact is true |
| `needs no <thing>` | only works if you *don't* |
| `else <text>` | what you hear if a `needs` fails (default: "You can't do that yet.") |
| `gives <item>` | adds an item to your inventory |
| `takes <item>` | removes an item |
| `sets <fact>` / `clears <fact>` | hidden true/false facts (door unlocked, alarm off…) |
| `sound <name>` | play a short sound effect before the result (Scratch library, see §5b) |
| `once` | option disappears after it's used |
| `win` / `lose` | ends the game after the result |

Items are things you carry and can ask about; facts are invisible switches.
`needs` checks both. That's enough for keys-and-doors, fetch quests, simple
puzzles, and multiple endings, and it's all inspectable on a debug screen.

Example (one option):

```
phrase: go to the bridge
result: You swipe the keycard. The bridge door hisses open.
rules:
  needs keycard
  else The bridge door is locked. There's a slot for a keycard.
  go bridge
```

**Variants.** Two options with the same phrase are one choice to the player;
the engine plays the first whose `needs` are met. That gives "first time vs.
again" without new syntax:

```
pet Biscuit → Biscuit purrs and bumps her head…   needs no biscuit-friend / sets biscuit-friend / sound meow
pet Biscuit → Biscuit flops over for belly rubs.  needs biscuit-friend
```

### Built-in commands (free in every world)

These are always added to the choice list the AI picks from, so the player
can say them anytime without the author doing anything:

| say something like | what happens |
|---|---|
| "what can I do?" / "help" | lists this scene's options (synth reads the phrases, or plays recorded phrases) |
| "repeat" / "where am I?" / "look" | replays the scene description |
| "what do I have?" / "inventory" | lists items (recorded item names if available) |
| "where have I been?" / "map" | lists places visited |
| "start over" | restarts |

If nothing matches well enough, the narrator says "Hmm, I'm not sure what you
mean" and offers the options — the same fallback the Scratch Q&A games use.

---

## 3. Walkthrough: authoring "Space Adventure" by voice

The authoring tool is itself a spoken conversation. The narrator (synth voice)
asks; the author answers by **tap-to-talk** (tap, speak, tap again — or
release, on a hold-to-talk button). Every answer is recorded *and*
transcribed from the same capture, so it's both the audio that will be played
and the text the AI matches against.

The tool works through a **to-do queue** of unfinished scenes, breadth-first,
so the author is never lost in the graph: it always knows the next question to
ask.

```
NARRATOR  Let's make a world. What's it called?
AUTHOR    Space Adventure.
NARRATOR  Describe the first scene — where is the player, and what's going on?
AUTHOR    [recorded] "You wake up in a narrow sleeping cabin on a rocket ship.
          A red light is flashing and an alarm is going off. What do you do?"
NARRATOR  What's a short name for this place?
AUTHOR    The cabin.
NARRATOR  What can the player do here? Say one thing at a time.
          Say "that's all" when you're done.
AUTHOR    Look around.
AUTHOR    Open the closet.
AUTHOR    Open the door.
AUTHOR    That's all.
```

Then for each option:

```
NARRATOR  When the player says "look around", what happens?
AUTHOR    [recorded] "Under your pillow you find a keycard. It says BRIDGE."
NARRATOR  Does that take them somewhere? Say "stay here", "a new place",
          or the name of a place.
AUTHOR    Stay here.
NARRATOR  Any rules? You can say "gives an item", "needs something",
          "only once", "wins", "loses", or "no rules".
AUTHOR    Gives an item.
NARRATOR  What item?
AUTHOR    [recorded] "A keycard."
NARRATOR  Got it: gives keycard. Any other rules?
AUTHOR    Only once.
AUTHOR    No more rules.
```

```
NARRATOR  When the player says "open the door", what happens?
AUTHOR    [recorded] "The door slides open."
NARRATOR  Does that take them somewhere?
AUTHOR    A new place.
NARRATOR  What's it called?
AUTHOR    The corridor.
          → "corridor" is added to the to-do queue
```

When the cabin's options are done, the tool moves to the next scene in the
queue ("Now let's describe the corridor…"). When the queue is empty:

```
NARRATOR  Every place has been described. Say "play" to try it,
          or "edit" plus a place name to change something.
```

### Commands available at any point while authoring

Matched by the same decision model as everything else:

- **"go back" / "redo that"** — re-record the last answer
- **"play it back"** — hear the last recording
- **"skip"** — leave it blank for now (synth fills in "…" / it stays on the to-do list)
- **"where am I?"** — narrator summarizes: which scene, which option, what's left
- **"play from here"** — jump into play mode at the scene being edited
- **"edit the corridor"** — reopen a scene

### Playtesting closes the loop

The best moment to improve matching is right after it fails. In play mode,
when the AI picks nothing (or the wrong thing), the debug panel shows what was
heard and the scores. The author can tap "that should have meant ▸ open the
door" (or say it), which adds the utterance to that option's `also` phrases.
Worlds get better at understanding players by being played.

### Is audio-only enough?

For **playing**: yes — it's designed to be. Screen optional.

For **authoring**: the happy path works audio-only, but a screen is a big help
for orientation (which scene am I on, what's left, did it hear me right). The
prototype always shows:

- a big tap-to-talk button and a live caption of what was heard;
- a "map" panel: scenes, their options, rules in the text syntax above, and
  the to-do queue — all editable by typing as a fallback;
- in play mode, a debug strip: current scene, inventory, facts, last
  transcript, and the decision model's top scores.

Expect the screen to matter most for **fixing** things; the voice flow matters
most for **creating** things.

---

## 4. Walkthrough: playing it

```
NARRATOR  Space Adventure.                                   (synth: title)
AUTHOR'S VOICE  "You wake up in a narrow sleeping cabin..."  (recording)
PLAYER    um, I'll look around the room
  ASR → "um I'll look around the room"
  AI  → choice: look (0.82)
AUTHOR'S VOICE  "Under your pillow you find a keycard..."
  engine: gives keycard, once
PLAYER    what am I carrying
  AI  → choice: @inventory
NARRATOR  You have: [AUTHOR'S VOICE "a keycard"].               (mixed)
PLAYER    leave
  AI  → choice: door (0.55)
AUTHOR'S VOICE  "The door slides open." → "A long corridor. Emergency lights…"
PLAYER    go to the bridge
  engine: needs keycard ✓ → result → go bridge
...
PLAYER    pull the lever
  engine: needs spacesuit ✗ → else "A warning blinks: pilot must wear a spacesuit."
...
AUTHOR'S VOICE  "Whoosh! The pod blasts away from the ship. You're safe."
NARRATOR  The end. You won! Say "start over" to play again.
```

The full Space Adventure (5 scenes, 2 items, 1 switch, a win) is in
`js/sample.js` and loads from the prototype's home screen. It's text-only, so
it plays in the synth voice; re-record any line in the editor to hear the mix.

### Exploratory worlds (no winning)

Two more examples in `js/examples.js` show the other end of the range —
slice-of-life places to poke around in, not puzzles:

- **Rainy Saturday** — kitchen, living room, attic, backyard, porch. A cat, a
  frog, pancakes, a pirate hat in a trunk.
- **Harbor Morning** — pier, bakery, beach, lighthouse, lamp room. Trade a
  shell for a cinnamon roll, bribe the lighthouse keeper, spot whales.

What makes them work as wandering rather than a puzzle:

- **Short scenes** (1–2 sentences) and **lots of options** (6–11 per place),
  so most things you'd think to say do something.
- **No fail states.** Items and switches unlock *extra* moments, never block
  the only way forward.
- **Every `needs` has a friendly `else` that points somewhere** ("It's pitch
  dark up there. Maybe there's a flashlight in the kitchen.") — the else lines
  *are* the hooks between places.
- **Curiosity rewards**: "listen" in the attic leads to "find the squeak";
  the note in the fisherman's bottle leads to the star on the lighthouse door.
- **Sounds and music** do a lot of the atmosphere so the text can stay short.

### The turn loop in detail

1. Speak the queued lines (scene description first time you enter; result
   lines after a choice).
2. Listen (tap-to-talk; hands-free is a later experiment — see §6).
3. ASR → text.
4. Build the choice list: current scene's options (minus used `once` options)
   + built-ins.
5. Decision model → choice or null.
6. Engine: check `needs` → play `result` or `else` → apply `gives / takes /
   sets / clears` → `go` → `win / lose`.
7. Save progress (so a phone call or app switch doesn't lose your place).

---

## 5. On-device tech plan

Target: a static web app (PWA). Desktop Chrome first for speed of iteration,
but every piece below was chosen to also run on a recent phone.

| need | primary choice | fallback / notes |
|---|---|---|
| **Recording** | `MediaRecorder` (Opus/WebM on Chrome & Android, AAC/MP4 on iOS Safari) | universally supported now; record mono, ~24 kbps |
| **Speech → text** | Whisper or Moonshine via **transformers.js** (WASM/WebGPU), run on the recorded clip | Web Speech API with `processLocally = true` where the browser supports on-device recognition (recent Chrome). Plain Web Speech is *cloud* on Chrome and Siri-backed on Safari — fine for debugging, but not the goal. Typed input always works. |
| **Decision model** | **Sentence embeddings** (all-MiniLM-L6-v2, ~23 MB quantized) — embed each option's phrases once, cosine-compare the utterance, require a minimum score and a margin over the runner-up | **Lexical** matcher (no download, instant) as baseline. **Small LLM** for hard/ambiguous cases: Chrome's built-in Prompt API (Gemini Nano) with a JSON schema constraint where available; WebLLM/transformers.js with a ~0.5–1B model on desktop WebGPU. |
| **Playback** | `<audio>` / Web Audio for recordings | |
| **Speech synthesis** | `speechSynthesis`, preferring voices with `localService === true` | Fine on iOS/Android (OS voices are local). Some Chrome desktop "Google …" voices are network voices — avoid them. |
| **Storage** | IndexedDB: one store for world JSON, one for audio Blobs | Call `navigator.storage.persist()`. iOS Safari may evict site data after ~7 days of non-use unless the app is added to the home screen — another reason to make it a PWA and make export easy. |
| **Sharing** | Export a single `.spokenworld` file (JSON with embedded audio). On mobile, hand it to `navigator.share({ files })` (AirDrop, Messages…); open it with the same app. | **Text-only worlds fit in a link**: deflate (`CompressionStream`) + base64url into the URL hash — no server. Recordings are too big for links. |

### Why embeddings first, LLM second

The job is "pick 1 of ~3–8 short phrases". Embeddings do that well for
paraphrases ("check out the room" ≈ "look around") in ~10–30 ms on a phone,
with a small download and no chance of hallucinating an option. Their weak
spot is *intent that needs reasoning* ("I want to get out of here" → "open the
door"). Two cheap mitigations: the author/playtest loop adds phrasings to
`also`; and a hybrid where, only when the embedding margin is small, the top 3
are sent to an LLM if one is available. The prototype's decision panel lets
you switch backends and compare.

### Mobile realities (things to test early)

- **Mic contention.** You can't reliably run Web Speech recognition and
  `MediaRecorder` at the same time on mobile. Transcribing the *recorded clip*
  with Whisper/Moonshine sidesteps this and gives "one capture → audio + text",
  which is exactly what authoring wants.
- **Model download size & latency.** whisper-tiny.en ≈ 40 MB, MiniLM ≈ 23 MB;
  cached after first load (Cache Storage), so later sessions are offline.
  Moonshine-tiny is faster on short clips (compute scales with clip length),
  worth benchmarking against whisper-tiny on a mid-range Android and an iPhone.
- **Autoplay / audio unlock.** iOS needs a user gesture before the first
  `speechSynthesis.speak()` and audio playback. Every flow starts with a tap.
- **Speech synthesis next to Web Audio.** Some phones won't speak while a
  page's Web Audio (the music) is playing, and mobile speech has other traps
  (first speak() must be in a tap, utterances garbage-collected mid-line,
  speak() right after cancel() dropped, a chosen voice silent where the
  default works). The prototype unlocks speech on the first tap, keeps
  utterances referenced, and if a line doesn't start it walks a ladder:
  pause Web Audio and use the default voice, then close Web Audio entirely
  (music comes back on the next tap). The first fix that works is kept. The
  debug panel shows which, and Settings has a "Test narrator voice" button.
  On one phone, simply pausing Web Audio was *not* enough.
- **Turn-taking.** Tap-to-talk avoids the mic hearing the narrator and avoids
  needing voice-activity detection. Hands-free (VAD + barge-in) is a nice
  later experiment, not a v1 requirement.
- **Mic permission** is per-origin and sticky in Chrome; iOS Safari may
  re-prompt. A home-screen PWA behaves better.

Verdict: nothing here *requires* desktop. The risk is performance of ASR on
lower-end phones, so the plan is to build desktop-first, but measure on a
phone in the first week.

---

## 5b. Music and sound effects (optional, suggested)

Both are suggestions the author can take or ignore; neither is needed for a
world to work.

**Sound effects** are the processed Scratch sound-library clips from the
`brick-behaviors` branch (75 clips, under 1 MB, in `sounds/`). An option gets
one with the rule `sound splash`. Each clip has a few "fits" words (frog →
croak, puddle → splash, shell → sparkle…); after the author records what
happens, the tool checks the option phrase and result for those words and,
if one matches, *plays* it and asks "Add a sound to that? Say yes, no, or
another." On the map editor the same suggestions appear as chips under each
option.

**Scene music** comes from the Story Soundtrack Lab (stars-and-stories): its
16 moods (Settling in, Cozy home, Wonder, Setting off, Searching, Mischief,
Uh-oh, Nightfall, Goodnight…), each with four 30-second excerpts of
open-licensed game music (0 A.D., Battle for Wesnoth, Flare, Hedgewars,
OpenGameArt; `music/`, 9.7 MB, fetched only when a mood plays). A scene's
mood is `scene.music`. Ported from the lab, in `js/music.js`:

- **Clip engine.** A mood's clips play back to back with a 2.5 s crossfade.
  On a mood change (walking into another scene) the old mood fades out over
  3 s (1.5 s for Uh-oh and Rescue!), and the new mood starts on the clip
  closest in key, brightness and busyness to what was playing.
- **Keyword weights.** Each mood's weighted keywords, plus a few added for
  small explorable places (kitchen, attic, pier, alarm…), rank moods for a
  piece of text.
- **Ducking.** The music drops to about a third while the narrator or a
  recording is speaking, the same idea as the lab's "under voices".

After the author describes a scene, the tool ranks the moods for the
description, **starts the top one under the question**, and asks: yes, no,
or say another mood's name. The map editor's music picker lists the
suggested moods first.

What didn't come over: the lab's Tone.js synth cues (this uses the clips
only), its timeline of hand-tagged moods (a scene has one mood), and the
Claude classifier (not on-device).

## 6. Open questions / next experiments

- Hands-free mode: VAD (e.g. Silero VAD in ONNX) to auto-end turns; barge-in
  to interrupt the narrator.
- Should option phrases be *recorded* too, so "what can I do?" plays the
  author's voice listing them? (Prototype records them during voice authoring.)
- Author-time "phrasing expansion" with an on-device LLM: generate 5 ways a
  player might say each option, then the author approves by ear.
- Conditional descriptions (scene sounds different after the alarm is off) —
  could be a `when <fact>` variant line, still deterministic.
- Kid-friendliness: the narrator's prompts should be short; recording should
  be forgiving (trim silence automatically).
- Collaborative worlds: two people add scenes to the same file.
- A `music <mood>` rule, so a moment can change the music (Rescue! when the
  whales appear), the way the lab follows a story as it's told.
