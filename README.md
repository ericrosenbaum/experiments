# worldchat

A video call inside a 2D world that you change by talking. Everyone appears as
their camera picture on a shared canvas that starts black. Say what you want
("make my video a circle", "put us on a soccer field with a ball", "give me
legs and make them dance") and Claude rewrites the world's code for everyone.

## Run it

```sh
npm install
cp .env.example .env.local    # add your ANTHROPIC_API_KEY
npm run dev                   # http://localhost:8787
```

Open the page in Chrome, join, and open the same address (it now includes
`?room=...`) in a second window or send it to a friend on your network. To try
it with someone elsewhere, host the call from your computer:

```sh
brew install cloudflared      # once
npm run dev:remote            # or dev:remote:cc to use your Claude Code login
```

It prints an https link to one room. Open it yourself and send it to your
friend. The link works until you press Ctrl+C, and anyone who has it can spend
your Claude usage while it is up.

Speak a change, or type it in the box. "Undo" (spoken, typed or the button)
takes back the last change. The menu in the bar picks which Claude writes the
changes for the room: Opus is the most capable, Sonnet and Haiku answer sooner.
`CODE_MODEL` sets the one a room starts on.

`npm run dev:cc` needs no key: it sends each request through the `claude`
command on your machine, so it runs on your Claude Code login and usage. It is
for prototyping on your own computer; each answer takes a few seconds longer.
If it says your Claude Code is too old for the model, run `claude update` or
start it with `CODE_MODEL=opus`.

`npm run dev:mock` runs without a key, with a few canned answers (circle,
field, walk, ball). `npm test` drives two Chrome pages through that mode.
`node tools/try.mjs <screenshot-dir> "request" ...` does the same against the
real Claude and saves a screenshot after each request.

## How it works

```
browser (each person)                             server (one Node process)
  camera/mic ── WebRTC, peer to peer ──────────►  the other browsers
  speech recognition ── what was said ─────────►  room ── is it a request? (Haiku) ── write code (Opus)
  camera tracking ── my hands/face/pose, my state ► relayed to the room
  world worker ◄── modules, shared state, everyone's state, video frames
```

- **The world is a set of small modules** ([server/prompt.js](server/prompt.js) explains
  the format to Claude; [src/world/primitives.js](src/world/primitives.js) is the one
  list of what module code can use). Each module returns hooks: `control` runs
  on your computer for your own player, `simulate` runs on one computer (the
  host, whoever has been in the room longest) for shared things like a ball,
  and `draw` runs everywhere.
- **Modules run in a Web Worker** ([src/world/world.worker.js](src/world/world.worker.js))
  that draws the canvas and has no network access. The page sends it each
  camera frame as a bitmap. If a module throws, or loops forever and the
  worker stops answering, the page reports it, the server rolls the change
  back and asks Claude once more with the error.
- **The server** ([server/room.js](server/room.js)) keeps the modules and their
  history, relays state and WebRTC signalling, and queues requests one at a
  time. It runs no generated code.
- **Camera tracking** ([src/perception.js](src/perception.js)) uses MediaPipe and loads
  only when a module asks for hands, face, pose or background removal.

## Limits

- Chrome only (speech recognition, canvas in workers).
- Two to six people, connected directly to each other. There is no relay
  server, so some office and mobile networks will not connect.
- No sign-in. Anyone with a room link can join and spend the server's Claude
  key, up to 300 changes per room.
- Everything said in a room is sent to Claude as text so it can spot requests.
- Use headphones: a friend's voice from your speakers can be heard as a request.
- Needs a running server, so it cannot be hosted on GitHub Pages like the
  other experiments. `Dockerfile` and `fly.toml` are set up for Fly.io.
