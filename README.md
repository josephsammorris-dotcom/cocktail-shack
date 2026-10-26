# Cocktail Shack

A beachside business game for 1 to 4 players, rebuilt from the *Game Design & Build Handbook*.
The TV shows a living 3D beach (three.js); each player's phone is a private control panel for stock,
staff and prices. Twelve Saturdays, one shared crowd, and the richest bar takes the beach.

Inspired by the 1983 BBC Micro school simulation *Tea Shop*. All code, art and music here are original.

## Playing

1. On the laptop plugged into the TV, open **`/tv`** (or the home page → *Host on this screen*) and go full screen (**F**).
2. Each player scans the QR code, names their bar and joins. Up to four bars; one is fine for solo play.
3. The first player presses **Start** on their phone, or the host presses **Enter**.

Each week: **Briefing** (forecast, fixture, costs) → **Planning** on phones (90 s) → **Match day** on the TV →
**Results** (leaderboard on the TV, private report on each phone) → next Saturday.

Host keys on the TV: **Enter** start / skip results · **F** full screen · **M** mute · **Esc** host menu
(settings, computer bars, remove a player, end game) · **D** debug overlay. The first key press also turns the sound on.

## How it works

| Part | What it does |
| --- | --- |
| `src/engine.js` | The rules: a pure, seeded, deterministic library. Weather, crowd and sales, staff, loans, bankruptcy, feedback, autopilot, computer bars. Every number is from the handbook. |
| `src/worker.js` | Cloudflare Worker plus one **Durable Object per room**. The room is the authoritative game server: it runs the phase machine on alarms, validates every command, settles each day with the engine, and sends the TV only public state and each phone only its own private state. |
| `public/tv.html`, `tv.js` | The TV: overlays for every phase, host controls, and playback of the server's day script. |
| `public/scene.js`, `sports.js` | The three.js beach: bars with staff and queues, weather looks, events (juice van, seagulls, extra time, storm), and the four fixtures (volleyball, football, frisbee, rugby). |
| `public/audio.js` | All sound, generated with the Web Audio API (title riff, till chimes, rain and so on). |
| `public/play.html`, `play.js` | The phone controller. |
| `public/net.js` | Shared WebSocket client with reconnection, heartbeat and clock sync. |

The server settles every day before anything animates, and the TV only plays back the timestamps it is sent,
so the live counters always finish on the real totals. Phones keep a token in local storage, so a reload or a
sleeping phone rejoins its seat; a player who misses the planning timer gets an autopilot plan.

Deviations from the handbook, kept small: the four bar positions and the camera are pulled in a little so every
bar fits a 16:9 TV, and room codes are claimed with a short `/api/new` call before the TV opens its socket.

## Developing

Needs Node.js 20 or later.

```sh
npm install
npm run dev               # wrangler dev on http://127.0.0.1:8787
npm test                  # rules tests (handbook golden cases) + 1,000 simulated games
node tests/server.mjs 3 8 # a whole 8-week game over WebSockets against the dev server
node tests/e2e.cjs 2      # TV + three phones in real browsers, with screenshots (needs Playwright)
```

`npm run build` copies three.js and the QR library into `public/vendor/` (they're committed, so deploys need no build).

## Hosting on Cloudflare

`wrangler.jsonc` serves `public/` as static files and routes `/api/*`, `/ws/*` and `/play/*` to the Worker.
Connect the repository in Cloudflare (**Workers & Pages → Create → Import a repository**) and every push to `main`
deploys. Or run `npx wrangler deploy` once you're logged in with `npx wrangler login`.
Durable Objects with SQLite storage are available on the Workers free plan.
