/*
 * Cocktail Shack server: a Cloudflare Worker plus one Durable Object per room.
 *
 *   GET  /api/new           -> { code }  claims a fresh four-letter room for a TV
 *   GET  /ws/<CODE>?role=tv|player       -> WebSocket into that room
 *   GET  /play/<CODE>        -> the phone controller page
 *   everything else          -> static files in public/
 *
 * The Room object is the authoritative game server (Handbook Section 3): it owns the game state,
 * runs the phase machine on alarms, validates every command, settles each day with the rules
 * engine, and sends the TV only public state and each phone only its own private state.
 */
import { DurableObject } from 'cloudflare:workers';
import * as E from './engine.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';            // A–Z without I and O
const CODE_RE = /^[A-HJ-NP-Z]{4}$/;
const IDLE_MS = 30 * 60 * 1000;
const BRIEFING_MS = 10000, ROLLOVER_MS = 3000, MATCH_LEAD_MS = 900, MATCH_TAIL_MS = 1400, TV_GRACE_MS = 10000;

const randCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => LETTERS[b % LETTERS.length]).join('');
const randToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const randSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
// a phone's selfie: a small square JPEG data URL (the phone makes it about 160 px, around 10 KB)
const okPhoto = x => typeof x === 'string' && x.length < 60000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(x);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/new') {
      for (let i = 0; i < 12; i++) {
        const code = randCode();
        const res = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(`https://room/claim?code=${code}&origin=${encodeURIComponent(url.origin)}`);
        if (res.ok) return Response.json({ code }, { headers: { 'cache-control': 'no-store' } });
      }
      return Response.json({ error: 'No free room codes, try again.' }, { status: 503 });
    }

    let m = path.match(/^\/ws\/([A-Za-z]{4})$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return new Response('Bad room code', { status: 404 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket upgrade', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }

    if (/^\/play(\/[A-Za-z]{0,4})?\/?$/.test(path)) return env.ASSETS.fetch(new Request(new URL('/play', url), request));
    if (path === '/tv/' ) return Response.redirect(new URL('/tv', url), 302);
    return env.ASSETS.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.r = undefined;             // the room record, loaded lazily (the object may hibernate)
    this.rate = new Map();          // socket -> { t, n } simple rate limit
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // ------------------------------------------------------------------ storage
  async load() {
    if (this.r === undefined) this.r = (await this.ctx.storage.get('r')) || null;
    if (this.r && !this.r.photos) this.r.photos = {};
    return this.r;
  }
  async save() {
    this.r.lastActive = Date.now();
    await this.ctx.storage.put('r', this.r);
    await this.schedule();
  }
  async schedule() {
    const r = this.r;
    let at = Date.now() + IDLE_MS;
    if (r?.endsAt) at = Math.min(at, r.endsAt);
    if (r && !this.tvOnline() && r.tvGoneAt && !r.paused && ['briefing', 'planning', 'matchday', 'results'].includes(r.g.phase))
      at = Math.min(at, r.tvGoneAt + TV_GRACE_MS + 50);
    await this.ctx.storage.setAlarm(at);
  }

  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
  meta(ws) { return ws.deserializeAttachment() || {}; }
  tvOnline() { return this.sockets().some(ws => this.meta(ws).role === 'tv'); }
  online(p) { return p.bot || this.sockets().some(ws => this.meta(ws).pid === p.id); }

  // ------------------------------------------------------------------ HTTP entry
  async fetch(request) {
    const url = new URL(request.url);
    await this.load();

    if (url.pathname === '/claim') {
      const fresh = !this.r || (this.sockets().length === 0 && Date.now() - (this.r.lastActive || 0) > IDLE_MS);
      if (!fresh) return new Response('taken', { status: 409 });
      await this.ctx.storage.deleteAll();
      this.r = { code: url.searchParams.get('code'), origin: url.searchParams.get('origin'), created: Date.now(),
        g: E.createGame(randSeed()), endsAt: null, startAt: null, paused: null, tvGoneAt: null, cids: {}, starter: null, log: [], photos: {} };
      await this.save();
      return new Response('ok');
    }

    const role = url.searchParams.get('role') === 'tv' ? 'tv' : 'player';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role });

    if (!this.r) {
      server.send(JSON.stringify({ v: 1, type: 'error', code: 'noroom', message: 'There is no game with that code. Check the code on the TV.' }));
      server.close(4004, 'no room');
      return new Response(null, { status: 101, webSocket: client });
    }

    if (role === 'tv') {
      for (const ws of this.sockets()) if (ws !== server && this.meta(ws).role === 'tv') { this.send(ws, { type: 'replaced' }); try { ws.close(4000, 'replaced'); } catch (e) {} }
      this.r.tvGoneAt = null;
      if (this.r.paused) this.resume();
      await this.save();
      this.broadcast();
      this.send(server, this.photosMsg());
    } else {
      this.send(server, { type: 'hello', code: this.r.code, phase: this.r.g.phase });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ------------------------------------------------------------------ messages
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 64000) return;
    const now = Date.now();
    const rl = this.rate.get(ws) || { t: now, n: 0 };
    if (now - rl.t > 1000) { rl.t = now; rl.n = 0; }
    if (++rl.n > 20) return;
    this.rate.set(ws, rl);

    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (!msg || typeof msg.type !== 'string') return;
    // a selfie can ride on join, rejoin and photo messages; everything else is a few hundred bytes
    if (data.length > 4096 && !['join', 'rejoin', 'photo'].includes(msg.type)) return;
    await this.load();
    if (!this.r) return;
    const me = this.meta(ws);

    if (msg.type === 'sync') return this.send(ws, { type: 'sync', t: msg.t, now });

    if (me.role === 'tv') return this.onTv(ws, msg);

    // ---- phones
    if (msg.type === 'join') return this.onJoin(ws, msg);
    if (msg.type === 'rejoin') return this.onRejoin(ws, msg);
    const p = this.r.g.players.find(q => q.id === me.pid);
    if (!p) return this.send(ws, { type: 'error', code: 'nojoin', message: 'Join the game first.' });

    // idempotent commands (Section 15)
    if (msg.cid) {
      const seen = (this.r.cids[p.id] ||= []);
      if (seen.includes(msg.cid)) return this.sendState(ws, p);
      seen.push(String(msg.cid).slice(0, 40)); if (seen.length > 40) seen.shift();
    }

    const g = this.r.g;
    let res = { ok: true };
    switch (msg.type) {
      case 'start':
        if (g.phase !== 'lobby') break;
        if (this.r.starter !== p.id) { res = { error: 'The first player to join starts the game.' }; break; }
        this.startGame(); break;
      case 'plan.update': res = E.updatePlan(g, p, { drinks: msg.drinks, ads: msg.ads, price: msg.price }); break;
      case 'staff.hire': res = E.hire(g, p); break;
      case 'staff.fire': res = E.fire(g, p); break;
      case 'loan.take': res = E.takeLoan(g, p); break;
      case 'plan.lock':
        if (msg.plan) { const u = E.updatePlan(g, p, msg.plan); if (u.error && !p.locked) { res = u; break; } }
        res = E.lock(g, p); break;
      case 'plan.unlock': res = E.unlock(g, p); break;
      case 'ready':
        if (g.phase === 'results') p.ready = true; break;
      case 'playagain':
        if (g.phase === 'finale') this.playAgain(); break;
      case 'sound': p.sound = !!msg.on; break;
      case 'photo':
        if (msg.photo === null) delete this.r.photos[p.id];
        else if (okPhoto(msg.photo)) this.r.photos[p.id] = msg.photo;
        else { res = { error: "Couldn't use that photo. Try another." }; break; }
        await this.save(); this.broadcastPhotos(); return;
      default: return;
    }
    if (res.error) this.send(ws, { type: 'refused', cid: msg.cid, reason: res.error });
    else if (res.note) this.send(ws, { type: 'note', text: res.note });
    this.checkAdvance();
    await this.save();
    this.broadcast();
  }

  async onJoin(ws, msg) {
    const g = this.r.g;
    // a phone that already holds a seat in this room just rejoins it
    if (msg.token) { const p = g.players.find(q => q.token === msg.token); if (p) return this.onRejoin(ws, msg); }
    const id = 'p' + randToken().slice(0, 8), token = randToken();
    const res = E.addPlayer(g, { id, token, name: msg.name, owner: msg.owner });
    if (res.error) return this.send(ws, { type: 'error', code: 'full', message: res.error });
    if (!this.r.starter || !g.players.some(q => q.id === this.r.starter)) this.r.starter = id;
    ws.serializeAttachment({ role: 'player', pid: id });
    if (okPhoto(msg.photo)) this.r.photos[id] = msg.photo;
    this.send(ws, { type: 'joined', id, token, slot: res.player.slot, colour: res.player.colour, bar: res.player.bar });
    await this.save();
    this.broadcast();
    this.broadcastPhotos();
  }

  async onRejoin(ws, msg) {
    const p = this.r.g.players.find(q => q.token === msg.token);
    if (!p) return this.send(ws, { type: 'error', code: 'notoken', message: 'That seat has gone. Join again.' });
    for (const old of this.sockets()) if (old !== ws && this.meta(old).pid === p.id) {
      this.send(old, { type: 'replaced' }); try { old.close(4001, 'replaced'); } catch (e) {}
    }
    ws.serializeAttachment({ role: 'player', pid: p.id });
    if ('photo' in msg && okPhoto(msg.photo) && this.r.photos[p.id] !== msg.photo) { this.r.photos[p.id] = msg.photo; this.broadcastPhotos(); }
    this.send(ws, { type: 'joined', id: p.id, token: p.token, slot: p.slot, colour: p.colour, bar: p.bar });
    await this.save();
    this.broadcast();
    this.send(ws, this.photosMsg());
  }

  async onTv(ws, msg) {
    const g = this.r.g;
    switch (msg.type) {
      case 'host.start':
        if (g.phase === 'lobby' && g.players.length) this.startGame();
        else if (g.phase === 'results') this.advance('host');
        else if (g.phase === 'finale') this.playAgain();
        break;
      case 'host.skip': if (['briefing', 'results'].includes(g.phase)) this.advance('host'); break;
      case 'host.bot':
        if (g.phase === 'lobby') { const res = E.addPlayer(g, { id: 'bot' + randToken().slice(0, 6), token: randToken(), name: '', bot: true }); if (res.player) res.player.bar = E.SEATS[res.player.slot].name; }
        break;
      case 'host.remove': {
        const p = g.players.find(q => q.slot === msg.slot);
        if (p) {
          E.removePlayer(g, p.id);
          delete this.r.photos[p.id]; this.broadcastPhotos();
          for (const s of this.sockets()) if (this.meta(s).pid === p.id) { this.send(s, { type: 'removed' }); try { s.close(4002, 'removed'); } catch (e) {} }
          if (this.r.starter === p.id) this.r.starter = E.firstPlayer(g)?.id || null;
          if (g.phase !== 'lobby' && E.activePlayers(g).length === 0) { g.phase = 'finale'; this.r.endsAt = null; }
        }
        this.checkAdvance();
        break;
      }
      case 'host.end': if (g.phase !== 'lobby' && g.phase !== 'finale') { g.phase = 'finale'; this.r.endsAt = null; } break;
      case 'host.settings':
        if (g.phase === 'lobby' && msg.settings) {
          const s = msg.settings, cur = g.settings;
          if ([8, 12, 16].includes(s.weeks)) cur.weeks = s.weeks;
          if ([0, 60, 90, 120].includes(s.planningSec)) cur.planningSec = s.planningSec;
          if ([0, 15, 25].includes(s.resultsSec)) cur.resultsSec = s.resultsSec;
          if (typeof s.bigMatch === 'boolean') cur.bigMatch = s.bigMatch;
          if (typeof s.tvFaces === 'boolean') cur.tvFaces = s.tvFaces;
        }
        break;
      case 'host.playagain': if (g.phase === 'finale') this.playAgain(); break;
      default: return;
    }
    await this.save();
    this.broadcast();
  }

  async webSocketClose(ws) { await this.gone(ws); }
  async webSocketError(ws) { await this.gone(ws); }
  async gone(ws) {
    this.rate.delete(ws);
    await this.load();
    if (!this.r) return;
    if (this.meta(ws).role === 'tv' && !this.tvOnline()) this.r.tvGoneAt = Date.now();
    await this.save();
    this.broadcast();
  }

  // ------------------------------------------------------------------ phase machine (Section 5)
  startGame() {
    const g = this.r.g;
    if (!E.startGame(g)) return;
    this.r.log = [];
    this.r.endsAt = Date.now() + BRIEFING_MS;
  }

  playAgain() {
    this.r.g = E.playAgain(this.r.g, randSeed());
    this.r.endsAt = null; this.r.startAt = null; this.r.cids = {};
    if (!this.r.g.players.some(p => p.id === this.r.starter)) this.r.starter = E.firstPlayer(this.r.g)?.id || null;
  }

  /** Moves on early when everyone has acted. */
  checkAdvance() {
    const g = this.r.g;
    if (this.r.paused) return;
    if (g.phase === 'planning' && E.activePlayers(g).length && E.allLocked(g)) this.advance('locked');
    else if (g.phase === 'results') {
      const humans = E.activePlayers(g).filter(p => !p.bot && !p.removed);
      if (humans.length && humans.every(p => p.ready)) this.advance('ready');
    }
  }

  advance(why) {
    const g = this.r.g, now = Date.now(), s = g.settings;
    switch (g.phase) {
      case 'briefing':
        E.beginPlanning(g);
        for (const p of E.activePlayers(g)) if (p.bot) { p.plan = E.botPlan(g, p); p.locked = true; }
        this.r.endsAt = s.planningSec ? now + s.planningSec * 1000 : null;
        break;
      case 'planning': {
        E.finalisePlans(g, p => this.online(p));
        const day = E.resolveDay(g);
        this.r.startAt = now + MATCH_LEAD_MS;
        this.r.endsAt = this.r.startAt + day.script.durationMs + MATCH_TAIL_MS;
        this.r.log.push({ week: g.week, weather: g.weather, forecast: g.forecast, event: day.event,
          sold: Object.fromEntries(Object.values(day.results).map(x => [x.slot, x.sold])) });
        break;
      }
      case 'matchday':
        E.beginResults(g);
        this.r.endsAt = s.resultsSec ? now + s.resultsSec * 1000 : null;
        break;
      case 'results': {
        const next = E.endWeek(g);
        this.r.startAt = null;
        this.r.endsAt = next === 'briefing' ? now + BRIEFING_MS + (g.week > 1 ? ROLLOVER_MS : 0) : null;
        break;
      }
      default: return;
    }
    // bots are always ready, and a phase may already be complete
    this.checkAdvance();
  }

  pause() {
    const now = Date.now();
    this.r.paused = { at: now, remaining: this.r.endsAt ? Math.max(3000, this.r.endsAt - now) : null };
    this.r.endsAt = null;
  }
  resume() {
    const now = Date.now(), p = this.r.paused;
    if (p.remaining) this.r.endsAt = now + p.remaining;
    if (this.r.startAt) this.r.startAt += now - p.at;
    this.r.paused = null;
  }

  async alarm() {
    await this.load();
    if (!this.r) return;
    const now = Date.now();
    if (this.sockets().length === 0 && now - (this.r.lastActive || 0) > IDLE_MS) {
      await this.ctx.storage.deleteAll(); this.r = null; return;
    }
    const phase = this.r.g.phase;
    if (!this.r.paused && !this.tvOnline() && this.r.tvGoneAt && now - this.r.tvGoneAt >= TV_GRACE_MS && ['briefing', 'planning', 'matchday', 'results'].includes(phase)) {
      this.pause();
    } else if (this.r.endsAt && now >= this.r.endsAt - 30) {
      this.advance('timer');
    }
    await this.save();
    this.broadcast();
  }

  // ------------------------------------------------------------------ views (Section 15)
  send(ws, msg) { try { ws.send(JSON.stringify({ v: 1, now: Date.now(), ...msg })); } catch (e) {} }

  // photos travel separately from the state, only when they change, so the frequent state messages stay small
  photosMsg() {
    const photos = {};
    for (const p of this.r.g.players) if (!p.removed && this.r.photos[p.id]) photos[p.slot] = this.r.photos[p.id];
    return { type: 'photos', photos };
  }
  broadcastPhotos() { const m = this.photosMsg(); for (const ws of this.sockets()) if (this.meta(ws).role === 'tv' || this.meta(ws).pid) this.send(ws, m); }

  broadcast() {
    if (!this.r) return;
    const tv = this.tvView();
    for (const ws of this.sockets()) {
      const m = this.meta(ws);
      if (m.role === 'tv') this.send(ws, tv);
      else if (m.pid) { const p = this.r.g.players.find(q => q.id === m.pid); if (p) this.sendState(ws, p); }
    }
  }

  common() {
    const r = this.r, g = r.g;
    return {
      code: r.code, joinUrl: `${r.origin}/play/${r.code}`, phase: g.phase, week: g.week, weeks: g.settings.weeks,
      endsAt: r.endsAt, startAt: r.startAt, paused: !!r.paused, settings: g.settings, gameNo: g.gameNo,
      forecast: g.forecast, forecastLabel: g.forecast && E.WEATHER[g.forecast].label,
      fixture: g.fixture && { match: g.fixture.match, stage: g.fixture.stage, name: g.fixture.name, sport: g.fixture.sport, sportName: g.fixture.sportName, away: g.fixture.away, big: g.fixture.big, crowd: g.fixture.crowd, seed: g.fixture.seed },
      costs: { mixCost: g.mixCost, adCost: g.adCost, prevMixCost: g.prevMixCost, prevAdCost: g.prevAdCost, wage: E.C.wage },
      rollover: g.rollover, tvOnline: this.tvOnline(), players: g.players.length,
      wxLog: E.forecastRecord(g),
    };
  }

  revealed() { return ['matchday', 'results', 'finale'].includes(this.r.g.phase) && this.r.g.day; }

  tvView() {
    const r = this.r, g = r.g, day = g.day;
    const bars = g.players.map(p => ({ ...E.publicBar(g, p), connected: this.online(p), starter: r.starter === p.id }));
    const v = { type: 'tv', ...this.common(), bars };
    if (this.revealed()) {
      v.weather = g.weather; v.weatherLabel = E.WEATHER[g.weather].label;
      v.script = day.script; v.score = g.fixture.score; v.banner = day.banner; v.event = day.event;
    }
    if (g.phase === 'results' || g.phase === 'finale') {
      v.results = Object.values(day?.results || {}).map(x => ({
        slot: x.slot, bar: x.bar, takings: x.takings, profit: x.profit, cash: x.cashAfter, debt: x.debtAfter,
        sold: x.sold, mixed: x.mixed, price: x.price, eliminated: x.eliminated,
        faces: g.settings.tvFaces && x.verdicts ? { mix: x.verdicts.mix[0], ads: x.verdicts.ads[0], price: x.verdicts.price[0], staff: x.verdicts.staff[0] } : null,
        note: g.settings.tvFaces ? E.worstNote(x.verdicts) : null,
      }));
      v.best = day?.best || null;
      v.standings = E.standings(g);
      v.forecastRight = g.weather === g.forecast;
    }
    if (g.phase === 'finale') v.standings = E.standings(g);
    return v;
  }

  sendState(ws, p) {
    const r = this.r, g = r.g, day = g.day;
    const view = { type: 'state', ...this.common(),
      me: { id: p.id, slot: p.slot, bar: p.bar, colour: p.colour, initials: E.initialsOf(p.owner, p.bar), status: p.status, cash: p.cash, debt: p.debt,
        staff: p.staff, leaving: p.leaving, plan: p.plan, locked: p.locked, ready: p.ready, away: p.away, bot: p.bot,
        history: p.history, removed: !!p.removed },
      info: E.planInfo(g, p),
      isStarter: r.starter === p.id,
      lobby: g.players.map(q => ({ slot: q.slot, bar: q.bar, colour: q.colour, initials: E.initialsOf(q.owner, q.bar), bot: q.bot, connected: this.online(q) })),
      rivals: g.players.filter(q => q.id !== p.id).map(q => ({ slot: q.slot, bar: q.bar, colour: q.colour, initials: E.initialsOf(q.owner, q.bar), staff: q.staff,
        status: q.status, locked: q.locked, netWorth: g.week > 1 || g.phase === 'results' || g.phase === 'finale' ? E.netWorth(q) : null })),
      waiting: E.activePlayers(g).filter(q => !q.locked).length,
      myLeft: g.rollover?.left?.find(x => x.slot === p.slot)?.n || 0,
    };
    if (this.revealed() && day.results[p.slot]) {
      const res = day.results[p.slot];
      view.weather = g.weather; view.weatherLabel = E.WEATHER[g.weather].label;
      view.banner = day.banner; view.event = day.event;
      view.sales = { mixed: res.mixed, saleTimesMs: day.script.bars.find(b => b.slot === p.slot)?.saleTimesMs || [], price: res.price, cashBefore: res.cashBefore, spent: res.spent.total };
      if (g.phase !== 'matchday') view.report = res;
    } else if (this.revealed()) {
      view.weather = g.weather; view.weatherLabel = E.WEATHER[g.weather].label; view.banner = day.banner; view.event = day.event;
    }
    if (g.phase === 'finale') {
      const st = E.standings(g);
      const mine = st.find(x => x.slot === p.slot);
      view.final = { standings: st, position: mine.position, netWorth: mine.netWorth, debt: mine.debt, out: mine.out,
        title: E.rankTitle(mine.netWorth, mine.out), winner: st[0], solo: g.players.length === 1 };
    }
    this.send(ws, view);
  }
}
