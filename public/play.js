// Phone controller (Handbook Section 12). The server is the source of truth; this page only edits a draft and draws.
import { Conn, money, pence, esc, WEATHER_ICON, FACE, VERDICT_COLOUR, LETTER } from '/net.js';

const $ = id => document.getElementById(id);
const hdr = $('hdr'), main = $('main'), foot = $('foot');
const code = (location.pathname.split('/')[2] || new URLSearchParams(location.search).get('code') || '').toUpperCase();
const KEY = 'cocktail-shack:' + code;
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} },
  clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
};

let S = null;            // last server state
let joined = store.get();
let screen = null, screenKey = '';
let draft = null, lastEdit = 0, sendTimer = null;
let fatal = null;
let wakeLock = null;

const vibrate = ms => { try { navigator.vibrate?.(ms); } catch (e) {} };

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2600);
}

// ------------------------------------------------------------------ connection
if (!/^[A-Z]{4}$/.test(code)) renderCodeEntry();
const conn = /^[A-Z]{4}$/.test(code) ? new Conn(code, 'player', {
  onMessage, onStatus: s => $('offline').classList.toggle('show', s !== 'open' && !fatal),
}) : null;
if (conn) conn.onOpen = () => { if (joined?.token) conn.send({ type: 'rejoin', token: joined.token }); else render(); };

function onMessage(m) {
  switch (m.type) {
    case 'hello': if (!joined?.token) render(); break;
    case 'joined':
      joined = { token: m.token, id: m.id, slot: m.slot, colour: m.colour };
      store.set(joined); break;
    case 'state': S = m; render(); break;
    case 'refused': toast(m.reason); vibrate([30, 40, 30]); lastEdit = 0; break;
    case 'note': toast(m.text); break;
    case 'error':
      if (m.code === 'notoken') { store.clear(); joined = null; S = null; render(); }
      else if (m.code === 'noroom') { fatal = m.message; render(); }
      else { toast(m.message); if (m.code === 'full') { fatal = m.message; render(); } }
      break;
    case 'replaced': fatal = 'This game is open in another tab or phone.'; render(); break;
    case 'removed': store.clear(); fatal = 'The host removed your bar from this game.'; render(); break;
  }
}

// ------------------------------------------------------------------ screen selection
function pickScreen() {
  if (fatal) return 'fatal';
  if (!joined?.token || !S) return 'join';
  const me = S.me;
  if (me.removed) return 'fatal';
  if (S.phase === 'lobby') return 'wait';
  if (S.phase === 'finale') return 'final';
  if (S.phase === 'results' && S.report) return 'report';
  if (me.status === 'out') return 'spectator';
  return { briefing: 'briefing', planning: 'planning', matchday: 'match', results: 'report', rollover: 'briefing' }[S.phase] || 'wait';
}

function render() {
  const sc = pickScreen();
  const key = [sc, S?.week, S?.gameNo, S?.me?.locked, S?.me?.status].join('|');
  if (S?.me) document.documentElement.style.setProperty('--me', S.me.colour);
  if (key !== screenKey) {
    screenKey = key; screen = sc;
    if (sc !== 'planning') draft = null;
    BUILD[sc]();
    main.scrollTop = 0;
  }
  UPDATE[screen]?.();
  renderHeader();
  wake(screen === 'planning' || screen === 'match');
}

async function wake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}

// ------------------------------------------------------------------ header
function renderHeader() {
  if (!S?.me || screen === 'join' || screen === 'fatal') {
    hdr.innerHTML = `<div class="chip" style="background:var(--coral)">🍹 Cocktail Shack</div><div class="hstats"><div class="sub">Room</div><div class="cash">${esc(code || '—')}</div></div>`;
    return;
  }
  const me = S.me;
  const week = S.phase === 'lobby' ? 'Waiting to start' : S.phase === 'finale' ? 'Game over' : `Week ${S.week} of ${S.weeks}`;
  const html = `<div class="chip"><span class="badge">${LETTER[me.slot]}</span>${esc(me.bar)}</div>
    <div class="hstats"><div class="cash">${money(me.cash)}</div><div class="sub">${week}${me.debt ? ` · <span class="debt">owe ${money(me.debt)}</span>` : ''}</div></div>
    <div class="ring" id="ring"></div>`;
  if (hdr.dataset.k !== html) { hdr.innerHTML = html; hdr.dataset.k = html; }
  tickRing();
}
function tickRing() {
  const el = $('ring'); if (!el || !S) return;
  if (!S.endsAt || S.paused || !['briefing', 'planning', 'results'].includes(S.phase)) { el.innerHTML = S.paused ? '<b>⏸</b>' : ''; return; }
  const total = S.phase === 'planning' ? S.settings.planningSec * 1000 : S.phase === 'results' ? S.settings.resultsSec * 1000 : 13000;
  const left = Math.max(0, S.endsAt - conn.now());
  const f = Math.max(0, Math.min(1, left / total));
  const C = 2 * Math.PI * 18, col = left < 10000 && S.phase === 'planning' ? 'var(--bad)' : 'var(--teal)';
  el.innerHTML = `<svg width="44" height="44"><circle cx="22" cy="22" r="18" fill="none" stroke="#f3e6cf" stroke-width="5"/>
    <circle cx="22" cy="22" r="18" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg><b>${Math.ceil(left / 1000)}</b>`;
}
setInterval(() => { tickRing(); if (screen === 'briefing') UPDATE.briefing(); }, 250);

// ------------------------------------------------------------------ helpers
function bulletinHTML() {
  const c = S.costs, f = S.fixture;
  const up = (now, prev) => now > prev ? ` <span class="up">▲${now - prev}p</span>` : '';
  return `<div class="bulletin">
      <span class="pill">${WEATHER_ICON[S.forecast] || ''} Forecast: ${esc(S.forecastLabel || '')}</span>
      ${f ? (f.match ? `<span class="pill">🏐 ${esc(f.big || 'Volleyball')}: Home v ${esc(f.away)}</span>` : `<span class="pill">🏖️ No match: a quieter beach</span>`) : ''}
      ${f?.big ? `<span class="pill big">🏆 ${f.stage === 'final' ? 'Biggest crowd of the season' : 'Bigger crowd'}</span>` : ''}
      <span class="pill">🍹 ${c.mixCost}p each${up(c.mixCost, c.prevMixCost)}</span>
      <span class="pill">📣 ${c.adCost}p per ad${up(c.adCost, c.prevAdCost)}</span>
    </div>`;
}

function stepper(id, unit = '') {
  return `<div class="stepper"><button data-step="${id}" data-d="-1" aria-label="less">−</button>
    <div class="val"><span id="v-${id}">0</span><small>${unit}</small></div>
    <button data-step="${id}" data-d="1" aria-label="more">+</button></div>`;
}

// press-and-hold steppers: first tick on press, repeat every 80 ms after a 420 ms hold (as built)
function wireSteppers(onStep) {
  main.querySelectorAll('[data-step]').forEach(b => {
    let hold, rep;
    const stop = () => { clearTimeout(hold); clearInterval(rep); };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); if (b.disabled) return;
      b.setPointerCapture?.(e.pointerId);
      const d = +b.dataset.d, id = b.dataset.step;
      onStep(id, d); vibrate(8);
      hold = setTimeout(() => { rep = setInterval(() => onStep(id, d), 80); }, 420);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, stop));
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
}

function sparkline(hist) {
  const vals = [100, ...hist.map(h => h.cash - h.debt)];
  if (vals.length < 2) return '';
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0), w = 300, h = 46;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 4 - ((v - min) / (max - min || 1)) * (h - 8)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function rivalsHTML() {
  if (!S.rivals.length) return '';
  return `<div class="card"><h3>🏖️ Rival bars</h3><div class="rivals">${S.rivals.map(r => `
    <div class="rival"><span class="dot" style="background:${r.colour}"></span>${esc(r.bar)}
      <span class="hint" style="margin:0">${r.status === 'out' ? 'OUT' : `${r.staff} staff${S.phase === 'planning' ? (r.locked ? ' · locked in' : ' · planning') : ''}`}</span>
      <span class="nw">${r.netWorth == null ? '' : money(r.netWorth)}</span></div>`).join('')}</div></div>`;
}

const tvBanner = () => (!S.tvOnline || S.paused) ? `<div class="banner amber">📺 Waiting for the TV…</div>` : '';

// ------------------------------------------------------------------ screens
const BUILD = {}, UPDATE = {};

function renderCodeEntry() {
  hdr.innerHTML = `<div class="chip" style="background:var(--coral)">🍹 Cocktail Shack</div>`;
  main.innerHTML = `<div class="shack">🍹</div><h1 class="title">Join a game</h1><p class="tag">Type the four-letter code on the TV.</p>
    <div class="card"><input type="text" id="code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="CODE" style="text-transform:uppercase;text-align:center;letter-spacing:.3em"></div>`;
  foot.innerHTML = `<button class="btn" id="go">Join</button>`;
  const go = () => { const c = $('code').value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) location.href = '/play/' + c; else toast('Room codes are four letters.'); };
  $('go').onclick = go; $('code').onkeydown = e => { if (e.key === 'Enter') go(); };
}

BUILD.fatal = () => {
  main.innerHTML = `<div class="shack">🏝️</div><h1 class="title">Hold on</h1><p class="tag">${esc(fatal || 'You are no longer in this game.')}</p>`;
  foot.innerHTML = `<button class="btn ghost" onclick="location.href='/play'">Enter another code</button>`;
};

BUILD.join = () => {
  main.innerHTML = `<div class="shack">🍹</div><h1 class="title">Cocktail Shack</h1>
    <p class="tag">A beachside business game for 1 to 4 players</p>
    <div class="card"><h3>Name your bar</h3>
      <input type="text" id="name" maxlength="14" autocomplete="off" placeholder="The Red Parrot" enterkeyhint="go">
      <div class="hint">Up to 14 characters. You'll get the next free colour on the beach.</div></div>
    ${tvBanner ? '' : ''}`;
  foot.innerHTML = `<button class="btn" id="join">Join room ${esc(code)}</button>`;
  const go = () => { conn.send({ type: 'join', name: $('name').value, token: joined?.token }); $('join').disabled = true; setTimeout(() => { const b = $('join'); if (b) b.disabled = false; }, 2500); };
  $('join').onclick = go; $('name').onkeydown = e => { if (e.key === 'Enter') go(); };
};

BUILD.wait = () => {
  main.innerHTML = `<div class="card center"><div class="shack" style="font-size:56px">🏖️</div>
      <h2 style="margin:6px 0 0">You're on the beach!</h2><p class="hint" id="w-msg"></p></div>
    <div class="card"><h3>Bars joined</h3><div class="rivals" id="w-list"></div></div><div id="w-tv"></div>`;
  foot.innerHTML = '';
};
UPDATE.wait = () => {
  $('w-list').innerHTML = S.lobby.map(p => `<div class="rival"><span class="dot" style="background:${p.colour}"></span>
    <b>${LETTER[p.slot]}</b> ${esc(p.bar)} ${p.bot ? '<span class="hint" style="margin:0">computer</span>' : ''}${p.slot === S.me.slot ? '<span class="nw">you</span>' : ''}</div>`).join('');
  $('w-msg').textContent = S.isStarter ? 'Press Start when everyone is in.' : 'Waiting for the first player to press Start.';
  $('w-tv').innerHTML = tvBanner();
  const html = S.isStarter ? `<button class="btn" id="start">Start the game (${S.lobby.length} ${S.lobby.length === 1 ? 'bar' : 'bars'})</button>` : '';
  if (foot.dataset.k !== html) { foot.innerHTML = html; foot.dataset.k = html; if ($('start')) $('start').onclick = () => { conn.cmd('start'); vibrate(20); }; }
};

BUILD.briefing = () => {
  main.innerHTML = `<div class="card wide"><h3>📺 This Saturday</h3><div id="b-bul"></div><div id="b-roll"></div></div>
    <div class="card center"><div style="font-size:64px" id="b-icon"></div><h2 style="margin:4px 0" id="b-fc"></h2>
      <p class="hint">The forecast is usually right… usually.</p></div>
    <div class="card center"><b id="b-left"></b><p class="hint">Watch the TV for the Beach Weather.</p></div><div id="b-tv"></div>`;
  foot.innerHTML = '';
};
UPDATE.briefing = () => {
  if (!S || screen !== 'briefing') return;
  $('b-bul').innerHTML = bulletinHTML();
  $('b-icon').textContent = WEATHER_ICON[S.forecast] || '';
  $('b-fc').textContent = S.forecastLabel || '';
  const left = S.endsAt ? Math.max(0, Math.ceil((S.endsAt - conn.now()) / 1000)) : 0;
  $('b-left').textContent = `Planning opens in ${left}s`;
  $('b-roll').innerHTML = S.myLeft ? `<div class="hint">👋 ${S.myLeft} member${S.myLeft > 1 ? 's' : ''} of staff left at the end of last week.</div>` : '';
  $('b-tv').innerHTML = tvBanner();
};

// ---- planning (the main screen)
BUILD.planning = () => {
  draft = { ...S.me.plan };
  lastEdit = 0;
  main.innerHTML = `
    <div class="card wide"><h3>📺 Bulletin</h3><div id="p-bul"></div></div>
    <div id="p-tv" class="wide"></div>
    <div class="card"><h3>👥 Staff <span class="r" id="p-cap"></span></h3>
      <div id="p-emerg"></div>
      <div class="staffrow"><div class="n" id="p-staff"></div><div class="people" id="p-people"></div>
        <button class="btn ghost small" id="fire">Fire</button><button class="btn teal small" id="hire">Hire</button></div>
      <div class="hint">First is free. Extras cost 50p a day. Staff stay until fired, so normally they work today and leave tomorrow.</div></div>
    <div class="card"><h3>🍹 Cocktails to mix <span class="r" id="p-mixcost"></span></h3>${stepper('drinks')}
      <div class="gauge"><i id="p-gauge"></i></div><div class="hint" id="p-mixhint"></div>
      <div class="quick"><button id="q-same">Same as last week</button><button id="q-max">Max I can afford</button></div></div>
    <div class="card"><h3>📣 Loudhailer ads <span class="r" id="p-adcost"></span></h3>${stepper('ads')}
      <div class="hint" id="p-adhint"></div></div>
    <div class="card"><h3>🏷️ Price per cocktail</h3>${stepper('price', 'p')}
      <div class="hint">${S.players > 1 ? 'Undercut your rivals. The crowd shops around.' : "Too dear and they'll drink seawater."}</div></div>
    <div class="card"><h3>🧾 Outlay</h3><div class="outlay" id="p-outlay"></div><div class="hint" id="p-left"></div></div>
    <div id="p-loan"></div>
    <div class="card" id="p-hist"></div>
    <div id="p-rivals"></div>`;
  wireSteppers((id, d) => {
    if (S.me.locked) return;
    const cap = S.me.staff * 25;
    const lim = { drinks: [0, cap], ads: [0, 99], price: [1, 199] }[id];
    draft[id] = Math.max(lim[0], Math.min(lim[1], draft[id] + d));
    edited();
  });
  $('hire').onclick = () => { conn.cmd('staff.hire'); lastEdit = 0; vibrate(15); };
  $('fire').onclick = () => { conn.cmd('staff.fire'); lastEdit = 0; vibrate(15); };
  $('q-same').onclick = () => { const h = S.me.history.at(-1); if (h) { draft = { drinks: Math.min(h.mixed, S.me.staff * 25), ads: h.ads, price: h.price }; edited(); } };
  $('q-max').onclick = () => {
    const c = S.costs, w = (S.me.staff - 1) * c.wage;
    draft.drinks = Math.max(0, Math.min(S.me.staff * 25, Math.floor((S.me.cash - w - draft.ads * c.adCost) / c.mixCost)));
    edited();
  };
};

function edited() {
  lastEdit = Date.now();
  UPDATE.planning();
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => conn.cmd('plan.update', { ...draft }), 160);
}

function localOutlay() {
  const c = S.costs, me = S.me;
  const drinks = draft.drinks * c.mixCost, ads = draft.ads * c.adCost, wages = (me.staff - 1) * c.wage;
  return { drinks, ads, wages, total: drinks + ads + wages };
}

UPDATE.planning = () => {
  const me = S.me, info = S.info, c = S.costs;
  // adopt the server's numbers unless the player is mid-edit (the server may have clamped the plan)
  if (!draft || Date.now() - lastEdit > 900) draft = { ...me.plan };
  draft.drinks = Math.min(draft.drinks, me.staff * 25);
  const cap = me.staff * 25, o = localOutlay(), over = o.total > me.cash, locked = me.locked;

  $('p-bul').innerHTML = bulletinHTML();
  $('p-tv').innerHTML = tvBanner();
  $('p-staff').textContent = me.staff;
  $('p-people').textContent = '🧑‍🍳'.repeat(me.staff - me.leaving) + '🚶'.repeat(me.leaving);
  $('p-cap').textContent = `can mix ${cap} · wages ${money((me.staff - 1) * c.wage)}${me.leaving ? ` · (${me.leaving} leaving)` : ''}`;
  $('p-emerg').innerHTML = info.wageEmergency ? `<div class="banner red" style="margin-bottom:10px">You can't cover today's wage bill of ${money((me.staff - 1) * c.wage)}. Let staff go (they'll leave at once, unpaid) or take a loan to keep them.</div>` : '';
  $('hire').disabled = locked || !info.canHire;
  $('hire').textContent = me.leaving ? 'Keep' : 'Hire';
  $('fire').disabled = locked || !info.canFire;

  $('v-drinks').textContent = draft.drinks;
  $('v-ads').textContent = draft.ads;
  $('v-price').textContent = draft.price;
  $('p-mixcost').textContent = `${money(o.drinks)}`;
  $('p-adcost').textContent = `${money(o.ads)}`;
  $('p-gauge').style.width = (cap ? (draft.drinks / cap) * 100 : 0) + '%';
  $('p-mixhint').textContent = `Costs ${c.mixCost}p each. Your crew can mix up to ${cap}. Leftovers are wasted.`;
  $('p-adhint').textContent = `${c.adCost}p each. Pulls the crowd to your bar.`;
  main.querySelectorAll('[data-step]').forEach(b => b.disabled = locked);
  $('q-same').disabled = locked || !me.history.length; $('q-max').disabled = locked;

  const ol = $('p-outlay');
  ol.className = 'outlay' + (over ? ' over' : '');
  ol.textContent = `Total outlay: ${money(o.total)}${o.wages ? ` (incl. ${money(o.wages)} wages)` : ''}`;
  $('p-left').textContent = over ? `You only have ${money(me.cash)}!` : `${money(me.cash - o.total)} left`;

  const loanHTML = info.loan && !locked ? `<div class="card loan"><h3>🏦 Sandy's Beach Loans</h3>
      <p style="margin:0 0 10px">Short of ice money? Sandy will lend you ${money(info.loan.amount)}. You'll owe ${money(info.loan.debt)}, repaid at 50p in the £ of your takings each week.</p>
      <button class="btn teal" id="loan">Take the loan of ${money(info.loan.amount)}</button></div>` : '';
  const pl = $('p-loan');
  if (pl.dataset.k !== loanHTML) { pl.innerHTML = loanHTML; pl.dataset.k = loanHTML; if ($('loan')) $('loan').onclick = () => { conn.cmd('loan.take'); vibrate(20); }; }

  const h = me.history.at(-1);
  const histHTML = h ? `<details><summary><h3 style="margin:0">📈 Last week <span class="r">${h.profit >= 0 ? '+' : ''}${money(h.profit)}</span></h3></summary>
      <div class="hint">Mixed ${h.mixed}, sold ${h.sold} (${h.mixed ? Math.round(h.sold / h.mixed * 100) : 0}%), at ${h.price}p.</div>${sparkline(me.history)}</details>`
    : `<h3 style="margin:0">📈 History</h3><div class="hint">Your first Saturday. You start with a £1.00 float.</div>`;
  const ph = $('p-hist'); if (ph.dataset.k !== histHTML) { ph.innerHTML = histHTML; ph.dataset.k = histHTML; }
  const rv = rivalsHTML(); const pr = $('p-rivals'); if (pr.dataset.k !== rv) { pr.innerHTML = rv; pr.dataset.k = rv; }

  const fhtml = locked
    ? `<div class="lockedmsg">🔒 Locked in${S.waiting ? `, waiting for ${S.waiting} ${S.waiting === 1 ? 'player' : 'players'}` : ''}</div><button class="btn ghost small" id="unlock">Unlock</button>`
    : `<button class="btn" id="lock" ${over ? 'disabled' : ''}>Lock in</button>`;
  if (foot.dataset.k !== fhtml) {
    foot.innerHTML = fhtml; foot.dataset.k = fhtml;
    if ($('lock')) $('lock').onclick = () => { clearTimeout(sendTimer); conn.cmd('plan.lock', { plan: { ...draft } }); vibrate([20, 30, 20]); };
    if ($('unlock')) $('unlock').onclick = () => { conn.cmd('plan.unlock'); vibrate(10); };
  }
};

// ---- match day
let matchRAF = 0, lastServed = 0;
BUILD.match = () => {
  lastServed = 0;
  main.innerHTML = `<div class="card center wide"><div style="font-size:44px">📺</div><h2 style="margin:4px 0">Look at the TV</h2>
      <p class="hint" id="m-wx"></p></div>
    <div class="card center"><h3 style="justify-content:center">Served</h3><div class="big-n" id="m-n">0</div><div class="hint" id="m-cash"></div></div>
    <div id="m-ev"></div>`;
  foot.innerHTML = '';
  cancelAnimationFrame(matchRAF);
  const loop = () => { if (screen !== 'match') return; drawMatch(); matchRAF = requestAnimationFrame(loop); };
  loop();
};
function drawMatch() {
  if (!S?.sales) return;
  const t = conn.now() - (S.startAt || 0);
  const s = S.sales, served = s.saleTimesMs.filter(x => x <= t).length;
  if (served > lastServed) { if (served - lastServed < 4) vibrate(12); lastServed = served; }
  $('m-n').innerHTML = `${served}<small> / ${s.mixed}</small>`;
  $('m-cash').textContent = `Cash ${money(s.cashBefore - s.spent + served * s.price)}${served && served === s.mixed ? ' · Sold out!' : ''}`;
}
UPDATE.match = () => {
  $('m-wx').textContent = S.weatherLabel ? `Serving cocktails. Actual weather: ${S.weatherLabel.toLowerCase()}.` : '';
  $('m-ev').innerHTML = S.banner && S.event !== 'storm' ? `<div class="banner amber">${esc(S.banner)}</div>` : S.event === 'storm' ? `<div class="banner red">${esc(S.banner)}</div>` : '';
};

// ---- report
BUILD.report = () => {
  const r = S.report;
  if (!r) { main.innerHTML = `<div class="card center"><h2>Results are on the TV</h2></div>`; foot.innerHTML = ''; return; }
  const sp = r.spent;
  const row = (a, b, cls = '') => `<tr class="${cls}"><td>${a}</td><td>${b}</td></tr>`;
  const cards = r.verdicts ? [
    ['mix', '🍹', `Mixed ${r.mixed}`], ['ads', '📣', `${r.ads} ad${r.ads === 1 ? '' : 's'}`],
    ['price', '🏷️', `${r.price}p a glass`], ['staff', '👥', `${r.staff} staff`],
  ].map(([k, icon, label]) => { const [v, note] = r.verdicts[k]; return `<div class="fb" style="border-color:${VERDICT_COLOUR[v]}">
      <div class="top">${icon} ${label}<span class="face" aria-label="${v}">${FACE[v]}</span></div><p>${esc(note)}</p></div>`; }).join('')
    : `<div class="hint" style="grid-column:1/-1">The storm washed out any feedback.</div>`;
  main.innerHTML = `
    ${S.banner ? `<div class="banner ${S.event === 'storm' || S.event === 'gulls' ? 'red' : 'amber'} wide">${esc(S.banner)}</div>` : ''}
    <div class="card"><h3>📋 Week ${r.week} report <span class="r">${WEATHER_ICON[S.weather] || ''} ${esc(S.weatherLabel || '')}</span></h3>
      <table class="rep">
        ${row('Cocktails mixed', r.mixed)}
        ${row('Sold', r.sold + (r.sold && r.sold === r.mixed ? ' · Sold out!' : ''))}
        ${row('Price charged', r.price + 'p')}
        ${row('Takings', money(r.takings))}
        ${row('Total spent', money(sp.total))}
        ${row('Cocktails', money(sp.drinks), 'sub')}${row('Ads', money(sp.ads), 'sub')}${row('Wages', money(sp.wages), 'sub')}
        ${row('Profit', `<span style="color:${r.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${r.profit >= 0 ? '+' : ''}${money(r.profit)}</span>`)}
        ${r.repaid ? row('Loan repayment', '−' + money(r.repaid)) : ''}
        ${r.debtAfter ? row('Still owed to Sandy', money(r.debtAfter)) : ''}
        ${row('Cash in hand', money(r.cashAfter), 'tot')}
      </table>
      ${r.loanCleared ? '<div class="banner teal" style="margin-top:8px">🎉 Loan cleared!</div>' : ''}
      ${r.autopilot ? '<div class="hint">⏱️ Time ran out, so autopilot set your plan.</div>' : ''}
    </div>
    <div class="card"><h3>💬 Customer feedback</h3><div class="grid2">${cards}</div></div>
    ${r.eliminated ? `<div class="banner red wide">${esc(r.bar)} is bankrupt. The shack is boarded up.</div>` : ''}`;
};
UPDATE.report = () => {
  const me = S.me, last = S.week >= S.weeks;
  const html = me.status === 'out' ? `<div class="lockedmsg">Watch the rest on the TV.</div>`
    : me.ready ? `<div class="lockedmsg">✅ Ready. Waiting for the others…</div>`
    : `<button class="btn" id="ready">${last ? 'Final reckoning' : 'Ready for next Saturday'}</button>`;
  if (foot.dataset.k !== html) { foot.innerHTML = html; foot.dataset.k = html; if ($('ready')) $('ready').onclick = () => { conn.cmd('ready'); vibrate(15); }; }
};

BUILD.spectator = () => {
  main.innerHTML = `<div class="card center"><div class="shack">🏚️</div><h2 style="margin:8px 0 0">Boarded up</h2>
    <p class="hint">Your shack has gone bust, but the beach carries on. Watch the finale on the TV.</p></div><div id="s-r"></div>`;
  foot.innerHTML = '';
};
UPDATE.spectator = () => { $('s-r').innerHTML = rivalsHTML(); };

BUILD.final = () => {
  const f = S.final;
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
  const medal = f.out ? '🏚️' : ['🥇', '🥈', '🥉'][f.position - 1] || '🏖️';
  main.innerHTML = `<div class="card center"><div class="podium">${medal}</div>
      <h1 style="margin:4px 0">${f.solo ? 'Final score' : ord(f.position) + ' place'}</h1>
      <div class="big-n" style="font-size:44px">${money(f.netWorth)}</div>
      <p class="hint">net worth${f.debt ? ` (after ${money(f.debt)} still owed)` : ''}</p>
      <h3 style="justify-content:center;color:var(--ink);font-size:17px">${f.solo ? esc(f.title) : `${esc(f.winner.bar)} takes the beach!`}</h3></div>
    <div class="card"><h3>🏁 Final standings</h3><div class="rivals">${f.standings.map(s => `<div class="rival"><b>${s.position}</b>
      <span class="dot" style="background:${s.colour}"></span>${esc(s.bar)}${s.out ? ' <span class="hint" style="margin:0">OUT</span>' : ''}
      <span class="nw">${money(s.netWorth)}</span></div>`).join('')}</div></div>`;
  foot.innerHTML = `<button class="btn" id="again">Play again</button>`;
  $('again').onclick = () => { conn.cmd('playagain'); vibrate(20); };
};

if (conn) render();
