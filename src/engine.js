/*
 * Cocktail Shack rules engine.
 *
 * A pure library: no network, no clock, no DOM. Every rule and number comes from the
 * Game Design & Build Handbook (sections 6 to 11, 15 and 16). The Durable Object in
 * worker.js, the tests and the balance simulator all drive the game through these functions.
 *
 * Money is whole pence throughout.
 */

// ---------------------------------------------------------------- constants (Section 6)
export const C = {
  weeks: 12,
  startCash: 100,
  mixCost: 6,
  adCost: 5,
  mixInflation: 0.5,
  adInflation: 0.3,
  perStaff: 25,
  wage: 50,
  maxStaff: 8,
  maxAds: 99,
  minPrice: 1,
  maxPrice: 199,
  loanBase: 40,
  loanPerWeek: 10,
  loanInterest: 0.25,
  loanRepay: 0.5,
  loanThreshold: 8,
  // crowd by fixture (replaces the handbook's single 1.2 Big Match multiplier)
  crowdByStage: { none: 0.7, league: 1.0, semi: 1.25, final: 1.5 },
  // attendance = (base + range × U) × (1 + perPlayer × (N − 1)); retuned from the handbook's 90 + 140U and 0.25
  // so sell-outs are rare: a typical bar sees 30–45 thirsty customers on a sunny league day
  crowdBase: 52, crowdRange: 28, crowdPerPlayer: 0.45,
  // a beach party (the 'extra' event on a no-match day) packs the beach whatever the weather: people come for the
  // party, so the weather's crowd × thirst counts as at least 0.9 (sunny is 1.1), and then the party adds 80%
  party: { mult: 1.8, weatherFloor: 0.9 },
  // the season builds: week 1 has 70% of the crowd, rising 7.5 points a week to full strength by week 5
  seasonStart: 0.7, seasonStep: 0.075,
  maxPlayers: 4,
  nameMax: 14,
};

export const DEFAULT_SETTINGS = {
  weeks: 12,          // 8, 12, 16
  planningSec: 90,    // 0 (off), 60, 90, 120
  resultsSec: 25,     // 15, 25, 0 (wait for all)
  bigMatch: true,
  tvFaces: true,
};

export const SEATS = [
  { colour: 'coral',  hex: '#ff6b5e', corner: 'Front left',  name: 'The Red Parrot', letter: 'A', pattern: 'stripes' },
  { colour: 'teal',   hex: '#14b8a6', corner: 'Front right', name: 'Blue Lagoon',    letter: 'B', pattern: 'dots' },
  { colour: 'amber',  hex: '#f59e0b', corner: 'Back left, by the shoreline',  name: "Banana Joe's",  letter: 'C', pattern: 'zigzag' },
  { colour: 'violet', hex: '#8b5cf6', corner: 'Back right, by the shoreline', name: 'Pink Flamingo', letter: 'D', pattern: 'checks' },
];

// ---------------------------------------------------------------- weather (Section 7)
export const WEATHER = {
  sunny:    { label: 'Warm and sunny',       crowd: 1.00, thirst: 1.10 },
  scorcher: { label: 'An absolute scorcher', crowd: 1.10, thirst: 1.60 },
  cloud:    { label: 'Grey and overcast',    crowd: 0.80, thirst: 0.75 },
  cool:     { label: 'A chilly sea breeze',  crowd: 0.70, thirst: 0.50 },
  storm:    { label: 'A tropical storm',     crowd: 0.25, thirst: 0.60 },
};
export const WEATHER_TYPES = ['sunny', 'scorcher', 'cloud', 'cool', 'storm'];
// worst to best: a wrong forecast is only ever one step out along this scale
export const WEATHER_SCALE = ['storm', 'cool', 'cloud', 'sunny', 'scorcher'];
const WEATHER_POOL = ['sunny', 'scorcher', 'cloud', 'cool', 'storm', 'sunny', 'scorcher', 'cloud', 'cool'];

// ---------------------------------------------------------------- events (Section 9)
export const EVENTS = {
  van:   { mult: 0.45, banner: "A rival juice van has pulled up on the sand and pinched half of everyone's customers!" },
  gulls: { mult: 0.15, banner: 'A mob of seagulls has raided the beach, and the crowd has scattered!',
           bannerMatch: 'A mob of seagulls has raided the beach! The crowd has scattered and the match has been abandoned.' },
  extra: { mult: 1.60, banner: 'The match went to a third set, and the crowd is gasping for a cold one!',
           bannerNoMatch: 'A beach party has kicked off, and everyone is gasping for a cold one!' },
  storm: { mult: 1.00, banner: 'A storm rolled in off the sea. The beach all but emptied.',
           bannerMatch: 'A storm rolled in off the sea. The beach all but emptied and the match was abandoned.' },
};

// ---------------------------------------------------------------- fixtures (Sections 13, 18)
// Beach volleyball only. Not every Saturday has a match: see fixtureFor().
export const STAGE_NAMES = { league: 'Beach Volleyball League', semi: 'Beach Cup Semi-final', final: 'Beach Cup Final' };
export const TEAMS = ['Sandy Cove', 'Palm Bay', 'Coral Point', 'Driftwood', 'Laguna Rocks', 'Sunset Strip',
  'Pelican Key', 'Tidewater', 'Shell Harbour', 'Breaker Bay', 'Mango Reef', 'Saltwind'];

// ---------------------------------------------------------------- seeded random (Section 15)
// mulberry32 with its state kept as a plain integer so it survives JSON snapshots.
export function rngNext(holder, key = 'rng') {
  let t = (holder[key] = (holder[key] + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function makeRng(seed) { const h = { rng: seed | 0 }; return () => rngNext(h); }

// ---------------------------------------------------------------- helpers
export const roundHalfUp = x => Math.floor(x + 0.5);
export const money = p => (p < 0 ? '−' : '') + '£' + (Math.abs(p) / 100).toFixed(2);
export const capacity = p => p.staff * C.perStaff;
export const wages = p => (p.staff - 1) * C.wage;
export const loanAmount = week => C.loanBase + C.loanPerWeek * week;
export const loanDebt = amount => roundHalfUp(amount * (1 + C.loanInterest));
export const netWorth = p => p.cash - p.debt;
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// ---------------------------------------------------------------- demand (Section 8)
export function adPull(a) { return 1 + Math.min(1.1, 0.12 * a) - (a === 0 ? 0.15 : 0); }

export function priceFactor(p, k, m) {
  if (m === 0) return 0;
  if (p < k) return 1.05;
  const fair = 2.4 * k;
  if (p <= fair) return 1;
  return Math.max(0, 1 - (p - fair) / (3.84 * k));
}

export const seasonFactor = w => Math.min(1, C.seasonStart + C.seasonStep * (w - 1));
export function attendance(U, N) { return (C.crowdBase + C.crowdRange * U) * (1 + C.crowdPerPlayer * (N - 1)); }

/**
 * Split one crowd between bars.
 * bars: [{ mixed, ads, price }], buyers B (already × weather × big match), E event multiplier, k cocktail cost.
 * Returns [{ pull, adPull, priceFactor, demand, demandUnmodified, sold }].
 */
export function splitCrowd(bars, B, E, k) {
  const info = bars.map(b => {
    const ap = adPull(b.ads), pf = priceFactor(b.price, k, b.mixed);
    return { adPull: ap, priceFactor: pf, pull: ap * pf };
  });
  const divisor = 1 + info.reduce((s, x) => s + x.pull, 0);
  return info.map((x, i) => {
    const share = x.pull / divisor;
    const demand = B * E * share;
    const demandUnmodified = B * share;
    const sold = Math.min(bars[i].mixed, Math.max(0, roundHalfUp(demand)));
    return { ...x, share, demand, demandUnmodified, sold };
  });
}

// ---------------------------------------------------------------- feedback (Section 11)
export function feedback({ mixed, sold, ads, price, staff, d, k, ap, pf, adCost = C.adCost }) {
  const waste = mixed - sold, wasteShare = mixed > 0 ? waste / mixed : 0;
  const fair = 2.4 * k, cap = staff * C.perStaff;
  let mix, adv, pr, st;

  if (mixed === 0) mix = ['bad', 'you mixed nothing at all'];
  else if (sold >= mixed && d > 1.15 * mixed) mix = ['mid', 'sold out, and there was thirst for more'];
  else if (wasteShare > 0.30) mix = ['bad', `${waste} went to warm slush, so mix fewer`];
  else if (wasteShare > 0.12) mix = ['mid', `${waste} wasted, so trim the batch a little`];
  else mix = ['good', 'well-judged batch'];

  if (ads === 0) {
    adv = d < 0.8 * mixed ? ['mid', 'an ad or two might have pulled more custom'] : ['good', 'no ads needed today'];
  } else {
    const gain = (d * 0.12 / ap) * price;
    if (0.12 * ads > 1.1) adv = ['bad', 'the beach stopped listening, far too many ads'];
    else if (sold >= mixed && d > mixed) adv = ['mid', "you'd have sold out with fewer ads"];
    else if (gain >= adCost) adv = ['good', 'the ads paid their way'];
    else if (gain >= 0.5 * adCost) adv = ['mid', 'the last ads barely paid for themselves'];
    else adv = ['bad', 'ad money down the drain'];
  }

  if (price < k) pr = ['bad', 'selling below cost!'];
  else if (pf < 0.5) pr = ['bad', 'far too dear for this crowd'];
  else if (pf < 0.85) pr = ['mid', 'a touch steep'];
  else if (sold >= mixed && mixed > 0 && price < 0.8 * fair) pr = ['mid', 'sold out cheap, so you could charge more'];
  else pr = ['good', 'priced about right'];

  if (staff > 1 && mixed <= (staff - 1) * C.perStaff) st = ['bad', 'paying wages for idle hands'];
  else if (mixed >= cap && sold >= cap) st = ['mid', 'at full capacity, so hiring could pay'];
  else st = ['good', 'crew earning their keep'];

  return { mix, ads: adv, price: pr, staff: st };
}

export function worstNote(v) {
  if (!v) return 'the storm washed out any feedback';
  const order = ['mix', 'ads', 'price', 'staff'];
  for (const lvl of ['bad', 'mid']) for (const k of order) if (v[k][0] === lvl) return v[k][1];
  return "a tidy day's work all round";
}

// ---------------------------------------------------------------- rank titles (Section 10)
export function rankTitle(nw, out) {
  if (out) return 'Bankrupt — the shack is boarded up.';
  if (nw >= 2500) return 'Cocktail kingpin! They name the beach after you.';
  if (nw >= 1200) return 'Master mixologist — a roaring trade.';
  if (nw >= 500) return 'A steady hand on the shaker.';
  if (nw >= 100) return "At least you didn't lose the float.";
  return 'Maybe stick to selling suncream.';
}

// ================================================================ game state machine
// A game is one plain JSON object, so the Durable Object can snapshot it as is.

export function createGame(seed, settings = {}) {
  return {
    v: 1,
    seed: seed >>> 0,
    rng: seed | 0,                       // outcome generator (fixed draw order)
    crng: (seed ^ 0x9E3779B9) | 0,       // cosmetic generator (animation only)
    settings: { ...DEFAULT_SETTINGS, ...settings },
    phase: 'lobby',
    week: 0,
    mixCost: C.mixCost, adCost: C.adCost,
    prevMixCost: C.mixCost, prevAdCost: C.adCost,
    weather: null, forecast: null, fixture: null,
    players: [],
    day: null,            // the settled results and script of the current week
    rollover: null,       // what changed at the last rollover
    gameNo: 1,
  };
}

const PROFANITY = ['fuck', 'shit', 'cunt', 'bitch', 'bastard', 'wank', 'twat', 'dick', 'cock', 'piss', 'slut', 'whore', 'nigg', 'fag', 'arse', 'prick', 'bollock'];
export function cleanName(raw, slot, taken) {
  let name = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, C.nameMax);
  for (const w of PROFANITY) name = name.replace(new RegExp(w, 'gi'), m => m[0] + '*'.repeat(m.length - 1));
  if (!name) name = SEATS[slot].name;
  let base = name, n = 2;
  while (taken.some(t => t.toLowerCase() === name.toLowerCase())) {
    const suffix = ' ' + n++;
    name = base.slice(0, C.nameMax - suffix.length) + suffix;
  }
  return name;
}

/** Up to two initials, from the player's own name if they gave one, else their bar ("The" doesn't count). */
export function initialsOf(owner, bar) {
  const words = String(owner || bar || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const useful = words.length > 1 ? words.filter((w, i) => !(i === 0 && /^the$/i.test(w))) : words;
  if (!useful.length) return '?';
  const first = useful[0], last = useful.length > 1 ? useful[useful.length - 1] : '';
  return ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase();
}
function cleanOwner(raw) {
  let n = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, C.nameMax);
  for (const w of PROFANITY) n = n.replace(new RegExp(w, 'gi'), m => m[0] + '*'.repeat(m.length - 1));
  return n;
}

export function addPlayer(g, { id, token, name, owner = '', bot = false }) {
  if (g.phase !== 'lobby') return { error: 'The game has already started.' };
  if (g.players.length >= C.maxPlayers) return { error: 'The beach is full: four bars at most.' };
  const used = new Set(g.players.map(p => p.slot));
  const slot = [0, 1, 2, 3].find(s => !used.has(s));
  const p = {
    id, token, slot, bot,
    bar: cleanName(name, slot, g.players.map(q => q.bar)),
    owner: cleanOwner(owner),
    colour: SEATS[slot].hex,
    status: 'active', cash: C.startCash, debt: 0, staff: 1, leaving: 0,
    plan: { drinks: 15, ads: 2, price: 15 }, locked: false, touched: false, ready: false,
    history: [], missed: 0, away: false, joinedAt: g.players.length,
  };
  g.players.push(p);
  g.players.sort((a, b) => a.slot - b.slot);
  return { player: p };
}

export function removePlayer(g, id) {
  const i = g.players.findIndex(p => p.id === id);
  if (i < 0) return false;
  if (g.phase === 'lobby') g.players.splice(i, 1);
  else { const p = g.players[i]; p.status = 'out'; p.removed = true; p.locked = true; }
  return true;
}

export const firstPlayer = g => g.players.filter(p => !p.bot).sort((a, b) => a.joinedAt - b.joinedAt)[0] || null;
export const activePlayers = g => g.players.filter(p => p.status === 'active');

export function startGame(g) {
  if (g.phase !== 'lobby' || g.players.length === 0) return false;
  g.week = 1;
  g.mixCost = g.prevMixCost = C.mixCost;
  g.adCost = g.prevAdCost = C.adCost;
  for (const p of g.players) Object.assign(p, {
    status: 'active', cash: C.startCash, debt: 0, staff: 1, leaving: 0,
    plan: { drinks: 15, ads: 2, price: 15 }, history: [], missed: 0, away: false, removed: false,
  });
  g.rollover = null;
  beginBriefing(g);
  return true;
}

/** The season's fixture list: league matches on even weeks, then the semi-final and the final in the last two weeks. */
export function stageFor(weeks, w, bigMatch = true) {
  if (w === weeks) return bigMatch ? 'final' : 'league';
  if (w === weeks - 1) return bigMatch ? 'semi' : 'league';
  return w % 2 === 0 ? 'league' : null;
}
export function fixtureFor(g, w) {
  const stage = stageFor(g.settings.weeks, w, g.settings.bigMatch);
  const crowd = C.crowdByStage[stage || 'none'];
  if (!stage) return { match: false, stage: null, sport: null, name: 'No match today', away: null, big: null, crowd };
  // opponents in list order, one per match played so far
  let n = 0; for (let i = 1; i < w; i++) if (stageFor(g.settings.weeks, i, g.settings.bigMatch)) n++;
  const away = TEAMS[n % TEAMS.length];
  const big = stage === 'semi' || stage === 'final' ? STAGE_NAMES[stage] : null;
  return { match: true, stage, sport: 'volleyball', sportName: 'Beach Volleyball', name: STAGE_NAMES[stage], away, big, crowd };
}

/** Briefing: draw the real weather and the forecast (draws 1 and 2), set the fixture, prefill plans. */
export function beginBriefing(g) {
  g.phase = 'briefing';
  const idx = Math.floor(rngNext(g) * WEATHER_POOL.length);
  g.weather = WEATHER_POOL[idx];
  if (rngNext(g) < 0.75) g.forecast = g.weather;
  else {
    // a wrong forecast is one step better or worse than the real weather, never a storm-to-scorcher surprise
    const i = WEATHER_SCALE.indexOf(g.weather), down = rngNext(g) < 0.5;
    g.forecast = WEATHER_SCALE[i === 0 ? 1 : i === WEATHER_SCALE.length - 1 ? i - 1 : down ? i - 1 : i + 1];
  }
  g.fixture = fixtureFor(g, g.week);
  g.fixture.seed = Math.floor(rngNext(g, 'crng') * 1e6);
  g.day = null;
  for (const p of g.players) {
    if (p.status !== 'active') continue;
    p.locked = false; p.touched = false; p.ready = false;
    p.plan = clampPlan(g, p, p.plan);
  }
}

export function beginPlanning(g) {
  g.phase = 'planning';
  for (const p of activePlayers(g)) { p.locked = false; p.ready = false; }
}

export function clampPlan(g, p, plan) {
  return {
    drinks: clampInt(plan.drinks, 0, capacity(p)),
    ads: clampInt(plan.ads, 0, C.maxAds),
    price: clampInt(plan.price, C.minPrice, C.maxPrice),
  };
}

export function outlay(g, p, plan = p.plan) {
  const drinks = plan.drinks * g.mixCost, ads = plan.ads * g.adCost, w = wages(p);
  return { drinks, ads, wages: w, total: drinks + ads + w };
}

export const wageEmergency = p => wages(p) > p.cash;
export const loanEligible = (g, p) => p.status === 'active' && p.debt === 0 && p.cash < C.loanThreshold * g.mixCost;

/** Everything a phone needs about its own plan. */
export function planInfo(g, p) {
  const o = outlay(g, p);
  const amount = loanAmount(g.week);
  return {
    outlay: o, capacity: capacity(p), cash: p.cash, debt: p.debt,
    canLock: o.total <= p.cash,
    wageEmergency: wageEmergency(p),
    loan: loanEligible(g, p) ? { amount, debt: loanDebt(amount) } : null,
    canHire: (p.leaving > 0) || (p.staff < C.maxStaff && p.staff * C.wage <= p.cash),
    canFire: p.staff - p.leaving > 1,
  };
}

const inPlanning = g => g.phase === 'planning';

export function updatePlan(g, p, plan) {
  if (!inPlanning(g) || p.status !== 'active') return { error: 'Plans can only change while planning.' };
  if (p.locked) return { error: 'Unlock your plan to change it.' };
  p.plan = clampPlan(g, p, { ...p.plan, ...plan });
  p.touched = true;
  return { ok: true };
}

export function hire(g, p) {
  if (!inPlanning(g) || p.status !== 'active' || p.locked) return { error: 'You can only hire while planning.' };
  if (p.leaving > 0) { p.leaving--; return { ok: true, note: 'Notice cancelled: they are staying on.' }; }
  if (p.staff >= C.maxStaff) return { error: 'Eight staff is the most the shack can hold.' };
  if (p.staff * C.wage > p.cash) return { error: `You need ${money(p.staff * C.wage)} to cover the new wage bill.` };
  p.staff++;
  p.touched = true;
  return { ok: true };
}

export function fire(g, p) {
  if (!inPlanning(g) || p.status !== 'active' || p.locked) return { error: 'You can only let staff go while planning.' };
  if (p.staff - p.leaving <= 1) return { error: "You can't let your last member of staff go." };
  let note;
  if (wageEmergency(p)) {
    p.staff--;
    p.leaving = Math.min(p.leaving, p.staff - 1);
    note = 'They left at once, unpaid.';
  } else {
    p.leaving++;
    note = 'They work today and leave tomorrow.';
  }
  p.plan = clampPlan(g, p, p.plan);
  p.touched = true;
  return { ok: true, note };
}

export function takeLoan(g, p) {
  if (!inPlanning(g) || p.locked) return { error: 'Loans are only offered while planning.' };
  if (!loanEligible(g, p)) return { error: "Sandy isn't offering you a loan right now." };
  const amount = loanAmount(g.week);
  p.cash += amount;
  p.debt = loanDebt(amount);
  p.touched = true;
  return { ok: true, amount, debt: p.debt };
}

export function lock(g, p) {
  if (g.phase !== 'planning' || p.status !== 'active') return { error: 'Nothing to lock right now.' };
  if (outlay(g, p).total > p.cash) return { error: "That plan costs more than you've got." };
  p.locked = true;
  return { ok: true };
}
export function unlock(g, p) {
  if (g.phase !== 'planning' || p.status !== 'active') return { error: 'Too late to change your plan.' };
  p.locked = false;
  return { ok: true };
}
export const allLocked = g => activePlayers(g).every(p => p.locked);

/** Autopilot (Section 16): last plan, clamp to capacity, emergency-fire if wages alone don't fit, lower ads, then cocktails. */
export function autopilot(g, p, base = p.plan) {
  while (wageEmergency(p) && p.staff > 1) { p.staff--; p.leaving = Math.min(p.leaving, p.staff - 1); }
  const plan = clampPlan(g, p, base);
  const fits = () => outlay(g, p, plan).total <= p.cash;
  while (!fits() && plan.ads > 0) plan.ads--;
  if (!fits()) plan.drinks = Math.max(0, Math.floor((p.cash - wages(p) - plan.ads * g.adCost) / g.mixCost));
  plan.drinks = Math.min(plan.drinks, capacity(p));
  return plan;
}

/** A simple computer bar: mixes for the forecast at a fair price. */
export function botPlan(g, p) {
  const w = WEATHER[g.forecast];
  const n = g.players.length;
  const k = g.mixCost;
  // expected buyers at a typical day, split between the bars
  const B = attendance(0.5, n) * seasonFactor(g.week) * w.crowd * w.thirst * (g.fixture?.crowd ?? 1);
  const price = Math.max(k + 1, Math.round(2.4 * k + (g.forecast === 'scorcher' ? 3 : 0)));
  const ads = p.cash > 400 ? 4 : p.cash > 150 ? 2 : 1;
  const share = 1.4 / (1 + 1.4 * n);
  // stocks a little above the expected crowd: margins are high, so a few spare cocktails beat a sell-out
  let drinks = Math.round(B * share * 1.25);
  // grow the crew when the crowd outstrips it and the cash is there
  if (drinks > capacity(p) + 10 && p.staff < C.maxStaff && p.staff * C.wage * 3 <= p.cash) hire(g, p);
  return autopilot(g, p, { drinks, ads, price });
}

/** Choose the final plan of every active bar when planning ends. */
export function finalisePlans(g, connected = () => true) {
  for (const p of activePlayers(g)) {
    if (p.bot) { p.plan = botPlan(g, p); p.locked = true; continue; }
    const online = connected(p);
    p.missed = online ? 0 : p.missed + 1;
    p.away = p.missed >= 2;
    if (!p.locked) {
      const ok = online && p.touched && outlay(g, p).total <= p.cash && p.plan.drinks <= capacity(p);
      if (!ok) p.plan = autopilot(g, p);
      p.autopilot = !ok;
      p.locked = true;
    } else p.autopilot = false;
  }
}

/**
 * Settle the day (Sections 8 to 10). Draws 3 to 6, sells, moves money, grades decisions,
 * tests for bankruptcy and builds the TV's day script. Returns g.day.
 * `inject` lets tests fix the random numbers: { U, event }.
 */
export function resolveDay(g, inject = {}) {
  g.phase = 'matchday';
  const W = WEATHER[g.weather];
  const N = g.players.length;
  const U = inject.U ?? rngNext(g);
  let event = null;
  if (g.weather === 'storm') event = 'storm';
  else if ('event' in inject) event = inject.event;
  else {
    const r1 = rngNext(g);
    if (r1 < 0.16) event = rngNext(g) < 0.5 ? 'van' : 'gulls';
    else if (rngNext(g) < 0.08) event = 'extra';
  }
  const isParty = event === 'extra' && !g.fixture?.match;
  const E = !event ? 1 : isParty ? C.party.mult * Math.max(1, C.party.weatherFloor / (W.crowd * W.thirst)) : EVENTS[event].mult;
  const M = g.fixture?.crowd ?? 1;
  const A = attendance(U, N);
  const B = A * seasonFactor(g.week) * W.crowd * W.thirst * M;
  const k = g.mixCost;

  const bars = activePlayers(g);
  const split = splitCrowd(bars.map(p => ({ mixed: p.plan.drinks, ads: p.plan.ads, price: p.plan.price })), B, E, k);

  const results = {};
  bars.forEach((p, i) => {
    const s = split[i];
    const plan = p.plan;
    const spent = outlay(g, p, plan);
    // cash can never go below zero: validation guarantees the outlay fits
    spent.total = Math.min(spent.total, p.cash);
    const takings = s.sold * plan.price;
    const profit = takings - spent.total;
    const cashBefore = p.cash, debtBefore = p.debt;
    p.cash = cashBefore - spent.total + takings;
    let repaid = 0;
    if (p.debt > 0 && takings > 0) {
      repaid = Math.min(p.debt, Math.floor(takings * C.loanRepay));
      p.cash -= repaid; p.debt -= repaid;
    }
    const verdicts = g.weather === 'storm' ? null : feedback({
      mixed: plan.drinks, sold: s.sold, ads: plan.ads, price: plan.price, staff: p.staff,
      d: s.demandUnmodified, k, ap: s.adPull, pf: s.priceFactor, adCost: g.adCost,
    });
    // bankruptcy (Section 10), straight after the report
    let eliminated = false;
    if (p.cash < k && p.debt > 0) eliminated = true;
    results[p.slot] = {
      slot: p.slot, bar: p.bar, week: g.week,
      mixed: plan.drinks, ads: plan.ads, price: plan.price, staff: p.staff, wages: spent.wages,
      sold: s.sold, takings, spent, profit, repaid, debtBefore, debtAfter: p.debt,
      cashBefore, cashAfter: p.cash, demand: s.demand, demandUnmodified: s.demandUnmodified,
      verdicts, eliminated, loanCleared: debtBefore > 0 && p.debt === 0, autopilot: !!p.autopilot,
    };
    p.history.push({ week: g.week, mixed: plan.drinks, sold: s.sold, price: plan.price, ads: plan.ads,
      staff: p.staff, takings, profit, cash: p.cash, debt: p.debt });
    if (eliminated) { p.status = 'out'; p.outWeek = g.week; }
  });

  // seagulls or a storm on a match day: the match is abandoned
  g.fixture.abandoned = !!(g.fixture.match && (event === 'gulls' || event === 'storm'));
  const ev = event && EVENTS[event];
  const banner = !event ? null : event === 'extra' && !g.fixture.match ? ev.bannerNoMatch : g.fixture.abandoned ? ev.bannerMatch : ev.banner;

  g.fixture.score = g.fixture.abandoned ? null : makeScore(g);
  const script = buildScript(g, bars, results, event, banner, split, B * E);
  const best = Object.values(results).filter(r => r.profit > 0).sort((a, b) => b.profit - a.profit)[0] || null;
  g.day = { week: g.week, U, A, B, E, M, event, banner, results, script,
    best: best ? { slot: best.slot, bar: best.bar, profit: best.profit } : null };
  return g.day;
}

function makeScore(g) {
  if (!g.fixture.match) return null;
  const r = () => rngNext(g, 'crng');
  const home = r() < 0.55, close = r() < 0.5;            // sets, best of three
  return home ? [2, close ? 1 : 0] : [close ? 1 : 0, 2];
}

/** The TV's timeline (Section 13): a timestamp for every sale so the counters always end on `sold`. */
/**
 * Walk-aways, for the TV to act out (cosmetic: the sales above are already settled).
 * From the same sums: customers a bar's price put off (some of them to a cheaper rival), and thirsty
 * customers who found it sold out. Each figure on screen stands for about four people, at most five a reason.
 */
function walkaways(bars, results, split, BE, r) {
  const sumPull = split.reduce((a, x) => a + x.pull, 0);
  const show = x => (x < 0.5 ? 0 : Math.min(5, Math.max(1, Math.round(x / 4))));
  return bars.map((p, i) => {
    const s = split[i], res = results[p.slot], out = [];
    if (!res.mixed) return out;
    // the share the bar would have had at a fair price, against what it got
    const atFair = BE * s.adPull / (1 + sumPull - s.pull + s.adPull);
    const priceLost = s.priceFactor < 1 ? Math.max(0, atFair - s.demand) : 0;
    const rivals = bars.map((q, j) => ({ slot: q.slot, price: results[q.slot].price, mixed: results[q.slot].mixed, j }))
      .filter(q => q.slot !== p.slot && q.mixed > 0 && q.price < res.price).sort((a, b) => a.price - b.price);
    const toRival = rivals.length ? priceLost * 0.5 : 0;
    for (let k = 0; k < show(toRival); k++) out.push({ atMs: Math.round(1500 + r() * 10500), reason: 'cheaper', to: rivals[0].slot });
    for (let k = 0; k < show(priceLost - toRival); k++) out.push({ atMs: Math.round(1500 + r() * 10500), reason: 'price' });
    // sold out: the rest of the thirsty crowd turns away once the last cocktail has gone
    const soldOut = Math.max(0, roundHalfUp(s.demand) - res.sold);
    if (res.sold >= res.mixed && soldOut > 0) {
      for (let k = 0; k < show(soldOut); k++) out.push({ atMs: 0, reason: 'soldout' });
    }
    return out;
  });
}

function buildScript(g, bars, results, event, banner, split, BE) {
  const durationMs = 14000;
  const r = () => rngNext(g, 'crng');
  const out = [];
  for (const p of bars) {
    const res = results[p.slot];
    const pace = 0.85 + ((p.slot * 37) % 30) / 100;
    const sold = res.sold;
    const times = [];
    // a bar that sells out early runs through its stock faster; pacing differs per seat so the lead changes
    const fill = sold > 0 ? Math.sqrt(Math.min(1, sold / Math.max(sold, res.demand || sold))) : 1;
    for (let i = 0; i < sold; i++) {
      const f = ((i + 0.3 + 0.6 * r()) / sold) * fill;
      const curve = Math.pow(f, 1 / pace);
      times.push(Math.round(1000 + 11800 * Math.min(1, curve)));
    }
    times.sort((a, b) => a - b);
    out.push({ slot: p.slot, bar: p.bar, colour: p.colour, price: res.price, mixed: res.mixed, staff: p.staff,
      ads: res.ads, saleTimesMs: times, walkaways: [] });
  }
  if (split) {
    const wa = walkaways(bars, results, split, BE, r);
    out.forEach((b, i) => {
      const last = b.saleTimesMs.length ? b.saleTimesMs[b.saleTimesMs.length - 1] : 1000;
      b.walkaways = wa[i].map(w => w.reason === 'soldout' ? { ...w, atMs: Math.round(Math.min(12800, last + 400 + r() * Math.max(500, 12600 - last))) } : w)
        .sort((x, y) => x.atMs - y.atMs);
    });
  }
  const totals = {};
  for (const b of out) totals[b.slot] = { sold: b.saleTimesMs.length };
  return {
    week: g.week, durationMs,
    weather: { actual: g.weather, forecast: g.forecast },
    fixture: { ...g.fixture },
    event: event ? { type: event, atMs: event === 'storm' ? 0 : 1700, durationMs: event === 'storm' ? durationMs : 6000, banner } : null,
    bars: out, totals,
  };
}

export function beginResults(g) { g.phase = 'results'; for (const p of g.players) p.ready = p.bot || p.status !== 'active'; }

export const isLastWeek = g => g.week >= g.settings.weeks || activePlayers(g).length === 0;

/** Rollover (Section 6): staff on notice leave, the week advances, costs roll (draws 7 and 8). */
export function rollover(g) {
  g.phase = 'rollover';
  const left = [];
  for (const p of g.players) {
    if (p.leaving > 0) { left.push({ slot: p.slot, n: p.leaving }); p.staff = Math.max(1, p.staff - p.leaving); p.leaving = 0; }
  }
  g.week++;
  g.prevMixCost = g.mixCost; g.prevAdCost = g.adCost;
  if (rngNext(g) < C.mixInflation) g.mixCost++;
  if (rngNext(g) < C.adInflation) g.adCost++;
  g.rollover = { left, mixUp: g.mixCost - g.prevMixCost, adUp: g.adCost - g.prevAdCost };
}

/** After Results: either the finale or the next week's briefing. */
export function endWeek(g) {
  if (isLastWeek(g)) { g.phase = 'finale'; return 'finale'; }
  rollover(g);
  beginBriefing(g);
  return 'briefing';
}

export function standings(g) {
  const rows = g.players.map(p => ({ slot: p.slot, bar: p.bar, colour: p.colour, initials: initialsOf(p.owner, p.bar), netWorth: netWorth(p),
    cash: p.cash, debt: p.debt, out: p.status === 'out', bot: p.bot }));
  rows.sort((a, b) => b.netWorth - a.netWorth);
  let pos = 0, last = null;
  rows.forEach((r, i) => { if (r.netWorth !== last) { pos = i + 1; last = r.netWorth; } r.position = pos; });
  return rows;
}

export function playAgain(g, seed) {
  const keep = g.players.filter(p => !p.removed);
  const fresh = createGame(seed, g.settings);
  fresh.gameNo = (g.gameNo || 1) + 1;
  fresh.players = keep.map(p => ({ ...p, status: 'active', locked: false, ready: false, history: [] }));
  return fresh;
}

// ---------------------------------------------------------------- public / private views (Section 15)
export function publicBar(g, p) {
  const showPlan = g.phase === 'matchday' || g.phase === 'results' || g.phase === 'finale';
  const showMoney = g.phase === 'results' || g.phase === 'finale' || g.week > 1 || g.phase === 'lobby';
  return {
    slot: p.slot, bar: p.bar, colour: p.colour, staff: p.staff, locked: p.locked, status: p.status,
    bot: p.bot, away: p.away, ready: p.ready, initials: initialsOf(p.owner, p.bar),
    netWorth: showMoney ? netWorth(p) : null, cash: showMoney ? p.cash : null, debt: showMoney ? p.debt : null,
    ...(showPlan && p.history.length ? { price: p.plan.price, mixed: p.plan.drinks, ads: p.plan.ads } : {}),
  };
}
