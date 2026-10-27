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
| `public/scene.js` | The three.js beach: textured sand and sea out to the horizon, sky, ship, sailboat and banner plane; bars with staff and queues; beachgoers and stands that fill with the weather and the fixture; events (the juice van at the front, seagulls, extra time, storm). |
| `public/volleyball.js` | Beach volleyball on match days: serve, bump, set and spike rallies on projectile physics, with players who run to where the ball will land, jump to spike and block, and celebrate points. |
| `public/audio.js` | All sound, generated with the Web Audio API (title riff, till chimes, rain and so on). |
| `public/play.html`, `play.js` | The phone controller. |
| `public/net.js` | Shared WebSocket client with reconnection, heartbeat and clock sync. |

The server settles every day before anything animates, and the TV only plays back the timestamps it is sent,
so the live counters always finish on the real totals. Phones keep a token in local storage, so a reload or a
sleeping phone rejoins its seat; a player who misses the planning timer gets an autopilot plan.

Changes from the handbook:

- **Beach volleyball is the only fixture, and not every Saturday has a match.** League matches fall on even weeks,
  then the Beach Cup semi-final and final take the last two weeks (`stageFor` in `src/engine.js`). On other days the
  court disappears and the beach fills with sunbathers, swimmers, games and sandcastles, depending on the weather.
- **The crowd depends on the fixture and the weather.** Buyers are multiplied by 0.7 with no match, 1.0 for a league
  match, 1.25 for the semi-final and 1.5 for the final (replacing the single 1.2 Big Match multiplier), and the season
  builds from 70% of the crowd in week 1 to full strength by week 5.
- **Sell-outs are rarer.** Attendance is 52 + 28U (was 90 + 140U) and grows by 45% per extra player (was 25%), so a
  typical bar sees 30 to 45 thirsty customers on a sunny league day and the forecast, not luck, decides most days.
- **A wrong forecast is only ever one step out** on the scale storm, chilly, cloudy, sunny, scorcher, so it is right
  75% of the time (was 80%, but a wrong one could be anything).
- **Seagulls or a storm on a match day abandon the match.** The crowd scatters and the players run for cover.
- **Walk-aways.** The day script lists customers who turned away, from the same sums as the sales: put off by the
  price, gone to a cheaper rival, or too late because the bar sold out. The TV shows them at the front of the queue
  with a speech bubble. They're for show: the sales and takings are unchanged.
- **Selfies.** Players can take an optional photo when they join (or later in the waiting room). It appears on their
  bar's badge on the TV, in the lobby, the results table and the final podium. Photos travel in their own `photos`
  message, so the frequent state updates stay small. Without a photo, the same circle shows the player's initials
  (from the optional "Your name" box, else the bar's name).
- **Beach parties.** On a day with no match, the "extra" event is a beach party: a DJ booth with spinning decks,
  thumping speakers, flashing bulbs and light beams goes up in the middle of the beach, a crowd streams in to dance, and
  the TV plays a party loop. (On match days the same event is a third set.) A party multiplies demand by 1.8 and
  never lets the weather pull it below 90% of a normal day's, so even a chilly party sells plenty of cocktails.
- **People walk around things.** Towels, sandcastles, palms, bars, the court, the DJ booth and the juice van are
  obstacles; everyone on the beach steers round them rather than walking through.
- **Seagulls clear the beach properly.** Sunbathers, sandcastle builders, ball players and walkers jump up and run
  off the beach, leaving their towels and castles behind; everything is back in place the next day.
- **Clothes.** Queues are dressed in a mix of colours (they used to wear their bar's colour, which made every
  customer of the coral bar red), and on chilly or stormy days the volleyball crowd wears bright jumpers rather than dark ones.
- **The briefing is a slim, see-through strip along the bottom of the TV**, and the lobby (QR code, room code and bars)
  is a slim see-through panel down the left side, so the beach stays in view.
- **Price signs.** Each bar's price is painted on a wooden sign on a stick beside the bar, turned towards the camera.
- **Forecast record.** Once each day is over, a small card in the bottom-right corner of the TV shows every week so far:
  what the forecast said, what the weather was, and a tick or cross. During the briefing the weather card shows the
  same record as a row of ticks and crosses. (The room keeps a `wxLog`; `forecastRecord()` only shows a day after it ends.)
- **Customers have their say, live.** During the day each phone shows a feed of customer comments under the sales
  count: happy, funny, angry, sad or matter-of-fact, about the price, running out, adverts, staff, the weather, the
  match and the day's surprises. They're written from the settled results (`src/quotes.js`, the same verdicts as the
  report and the day's walk-aways), so they always match what happened, and a bar doesn't hear the same line again for a while.
- **A cleared beach stays cleared.** After seagulls or a storm empty the beach, nobody comes back during the results;
  everyone returns when the next day begins.
- **How to play.** A **?** button in the phone's header (and a *How to play* button in the waiting room) opens the rules
  and the game's mechanics: costs, staff, weather, fixtures, price, adverts, surprises and loans.
- **Customers keep their cocktails.** Each customer walks in from a spot on the beach and, once served, strolls back
  there with the drink in hand and stays, sipping, until the end of the day (or until seagulls or a storm clear the beach).
- The four bar positions and the camera are pulled in a little so every bar fits a 16:9 TV, and room codes are claimed
  with a short `/api/new` call before the TV opens its socket.

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
