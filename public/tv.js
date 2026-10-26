// TV host display (Handbook Section 13). Read-only: it shows the room and plays back the server's day script.
import { Conn, money, esc, WEATHER_ICON, SPORT_ICON, FACE, LETTER } from '/net.js';
import { Beach } from '/scene.js';
import { Sound } from '/audio.js';

const $ = id => document.getElementById(id);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const beach = new Beach($('c'));
window.__beach = beach;   // handy for debugging from the console
const sound = new Sound();
let S = null, P = null;           // current and previous server snapshot
let conn = null, code = null;
let debug = false, menuOpen = false;
let lastSaleTimes = [];

// ------------------------------------------------------------------ room
async function newRoom() {
  const r = await fetch('/api/new', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
  if (!r.code) { showError('Could not open a room. Check the connection and reload.'); return; }
  connect(r.code);
}
function connect(c) {
  code = c;
  history.replaceState(null, '', '/tv?room=' + c);
  try { sessionStorage.setItem('cocktail-shack-tv', c); } catch (e) {}
  conn = new Conn(c, 'tv', {
    onMessage: m => {
      if (m.type === 'tv') onState(m);
      else if (m.type === 'error' && m.code === 'noroom') { conn.closedForGood = true; newRoom(); }
      else if (m.type === 'replaced') showError('The game moved to another TV tab. Close this one.');
    },
    onStatus: s => { if (s !== 'open') caption('Reconnecting to the game server…'); },
  });
}
function showError(t) { const e = $('err'); e.textContent = t; e.classList.remove('hide'); }

const param = new URLSearchParams(location.search).get('room');
if (param && /^[A-Za-z]{4}$/.test(param)) connect(param.toUpperCase()); else newRoom();

// ------------------------------------------------------------------ overlays
const show = (id, on) => $(id).classList.toggle('hide', !on);
function caption(t) { $('cap').textContent = t || ''; }

function topBadges() {
  if (!S || S.phase === 'lobby') { $('tl').innerHTML = ''; $('tr').innerHTML = ''; return; }
  const f = S.fixture, c = S.costs;
  $('tl').innerHTML = S.phase === 'finale' ? `<div class="pillbox wk">Final standings</div>`
    : `<div class="pillbox wk">Week ${S.week} of ${S.weeks}</div>${f ? `<div class="pillbox">${SPORT_ICON[f.sport]} ${esc(f.sportName)}: Home v ${esc(f.away)}${f.big ? ` · 🏆 ${esc(f.big)}` : ''}</div>` : ''}`;
  const wx = S.weather && S.phase !== 'briefing' && S.phase !== 'planning' ? S.weather : S.forecast;
  const lbl = S.weather && S.phase !== 'briefing' && S.phase !== 'planning' ? S.weatherLabel : `Forecast: ${S.forecastLabel}`;
  const up = (a, b) => a > b ? ` <span class="up">▲</span>` : '';
  $('tr').innerHTML = S.phase === 'finale' ? '' : `<div class="pillbox">${WEATHER_ICON[wx] || ''} ${esc(lbl || '')}</div>
    <div class="pillbox">🍹 ${c.mixCost}p${up(c.mixCost, c.prevMixCost)} · 📣 ${c.adCost}p${up(c.adCost, c.prevAdCost)}</div>`;
}

function renderLobby() {
  show('lobby', true);
  $('code').textContent = S.code;
  $('joinurl').textContent = S.joinUrl.replace(/^https?:\/\//, '').replace(/\/play\/.*/, '/play');
  if ($('qr').dataset.url !== S.joinUrl && window.qrcode) {
    const q = qrcode(0, 'M'); q.addData(S.joinUrl); q.make();
    $('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $('qr').dataset.url = S.joinUrl;
  }
  $('seats').innerHTML = [0, 1, 2, 3].map(i => {
    const b = S.bars.find(x => x.slot === i);
    return b ? `<div class="seat" style="background:${b.colour}"><span class="l">${LETTER[i]}</span>${esc(b.bar)}${b.bot ? ' 🤖' : ''}${b.connected ? '' : ' 📵'}</div>`
      : `<div class="seat empty"><span class="l">${LETTER[i]}</span>Free</div>`;
  }).join('');
  const starter = S.bars.find(b => b.starter);
  $('lobbyhint').innerHTML = S.bars.length
    ? `${starter ? `<b>${esc(starter.bar)}</b> can press Start on their phone, or press <span class="kbd">Enter</span> here.` : 'Press <span class="kbd">Enter</span> to start.'} <span class="kbd">Esc</span> for settings.`
    : `Waiting for the first bar to open… <span class="kbd">Esc</span> for settings and computer bars.`;
}

const GULL_SVG = `<svg class="gull" viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="62" rx="30" ry="22" fill="#fff" stroke="#123c4a" stroke-width="3"/>
  <circle cx="58" cy="36" r="17" fill="#fff" stroke="#123c4a" stroke-width="3"/><circle cx="63" cy="33" r="3.5" fill="#123c4a"/>
  <path d="M73 38 L92 43 L73 46 Z" fill="#f59e0b" stroke="#123c4a" stroke-width="2"/><path d="M28 56 Q12 40 22 70 Z" fill="#cbd5e1" stroke="#123c4a" stroke-width="3"/>
  <rect x="40" y="16" width="30" height="7" rx="3" fill="#ff6b5e"/><rect x="47" y="6" width="16" height="12" rx="3" fill="#ff6b5e"/></svg>`;

function renderBriefing() {
  const f = S.fixture, c = S.costs, r = S.rollover;
  const delta = (now, prev) => now > prev ? `<div class="s up">▲ up ${now - prev}p</div>` : `<div class="s">no change</div>`;
  const left = r?.left?.length ? r.left.map(x => `${esc(S.bars.find(b => b.slot === x.slot)?.bar || '')}: ${x.n} staff left`).join(' · ') : '';
  const changes = [r?.mixUp ? `Cocktails now ${c.mixCost}p` : '', r?.adUp ? `Ads now ${c.adCost}p` : '', left].filter(Boolean).join(' · ');
  $('brief').innerHTML = `
    ${f?.big ? `<div class="bigmatch">🏆 ${esc(f.big)}! Expect a bigger crowd.</div>` : ''}
    <div class="bcard">${GULL_SVG}<div class="k">Beach Weather</div><div class="big">${WEATHER_ICON[S.forecast]}</div><div class="v">${esc(S.forecastLabel)}</div><div class="s">Usually right… usually.</div></div>
    <div class="bcard"><div class="k">This Saturday</div><div class="big">${SPORT_ICON[f.sport]}</div><div class="v">${esc(f.sportName)}</div><div class="s">Home v ${esc(f.away)}</div></div>
    <div class="bcard"><div class="k">Cost bulletin</div><div class="v" style="margin-top:.6em">🍹 ${c.mixCost}p a cocktail</div>${delta(c.mixCost, c.prevMixCost)}
      <div class="v">📣 ${c.adCost}p an ad</div>${delta(c.adCost, c.prevAdCost)}<div class="s">Extra staff ${c.wage}p a day</div></div>
    ${changes && S.week > 1 ? `<div class="roll">Rollover: ${changes}</div>` : ''}`;
  show('brief', true);
}

function renderResults() {
  const rows = S.standings.map(st => {
    const r = S.results.find(x => x.slot === st.slot);
    const faces = r?.faces ? ['mix', 'ads', 'price', 'staff'].map(k => FACE[r.faces[k]]).join('') : (r ? '⛈️' : '');
    return `<tr class="${st.out && !r?.eliminated ? 'out' : ''}">
      <td class="bar"><span class="sw" style="background:${st.colour}">${LETTER[st.slot]}</span>${esc(st.bar)}${st.out ? ' <span class="neg">OUT</span>' : ''}</td>
      <td>${money(st.netWorth)}</td><td>${r ? money(r.takings) : '—'}</td>
      <td class="${r && r.profit < 0 ? 'neg' : 'pos'}">${r ? (r.profit >= 0 ? '+' : '') + money(r.profit) : '—'}</td>
      <td>${money(st.cash)}</td><td class="${st.debt ? 'neg' : ''}">${st.debt ? money(st.debt) : '—'}</td>
      ${S.settings.tvFaces ? `<td class="faces">${faces}</td><td class="note">${r?.note ? '“' + esc(r.note) + '”' : ''}</td>` : ''}</tr>`;
  }).join('');
  const bust = S.results.filter(r => r.eliminated).map(r => `${esc(r.bar)} is bankrupt. The shack is boarded up.`).join(' ');
  const last = S.week >= S.weeks;
  $('results').innerHTML = `<h2>📋 Week ${S.week} results <span style="margin-left:auto;font-size:.6em;color:var(--muted)">${WEATHER_ICON[S.weather]} ${esc(S.weatherLabel)} · ${S.forecastRight ? 'forecast right ✓' : 'forecast wrong!'}</span></h2>
    <table class="lb"><tr><th>Bar</th><th>Net worth</th><th>Takings</th><th>Profit</th><th>Cash</th><th>Debt</th>${S.settings.tvFaces ? '<th>🍹📣🏷️👥</th><th></th>' : ''}</tr>${rows}</table>
    ${S.best ? `<div class="best">⭐ Best trade of the day: ${esc(S.best.bar)}, ${money(S.best.profit)} profit.</div>` : ''}${bust ? `<div class="bust">${bust}</div>` : ''}
    <div class="hint">${last ? 'Final reckoning next.' : 'Next Saturday'} when everyone taps Ready${S.endsAt ? '' : ''}, or press <span class="kbd">Enter</span>.</div>`;
  show('results', true);
}

function renderFinale() {
  const st = S.standings;
  const order = [1, 0, 2].map(i => st[i]).filter(Boolean);
  const h = { 1: 26, 2: 19, 3: 14 };
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const solo = st.length === 1;
  $('finale').innerHTML = `<h1>${solo ? esc(st[0].bar) : `🏆 ${esc(st[0].bar)} takes the beach!`}</h1>
    <div class="podium">${order.map(s => `<div class="step" style="background:${s.out ? '#94a3b8' : s.colour};height:calc(var(--u)*${h[Math.min(3, s.position)] || 12})">
      <div class="m">${s.out ? '🏚️' : medal[s.position] || ''}</div><div class="n">${esc(s.bar)}</div><div class="w">${money(s.netWorth)}</div></div>`).join('')}</div>
    ${st.length > 3 || st.some(s => s.out) ? `<table class="lb" style="max-width:40em;margin:0 auto">${st.map(s => `<tr class="${s.out ? 'out' : ''}"><td class="bar"><b>${s.position}</b><span class="sw" style="background:${s.colour}">${LETTER[s.slot]}</span>${esc(s.bar)}${s.out ? ' OUT' : ''}</td><td>${money(s.netWorth)}${s.debt ? ` <span class="neg">(owes ${money(s.debt)})</span>` : ''}</td></tr>`).join('')}</table>` : ''}
    <div class="hint">Press <span class="kbd">Enter</span> or tap Play again on a phone for another game with the same bars.</div>`;
  show('finale', true);
}

function renderMenu() {
  if (!menuOpen || !S) { show('menu', false); return; }
  const s = S.settings, lobby = S.phase === 'lobby';
  const sel = (key, opts, label) => `<div class="row"><span>${label}</span><select data-set="${key}" ${lobby ? '' : 'disabled'}>${opts.map(([v, t]) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  $('menu').innerHTML = `<h2>Host menu</h2>
    ${sel('weeks', [[8, '8'], [12, '12'], [16, '16']], 'Weeks per game')}
    ${sel('planningSec', [[0, 'Off'], [60, '60 s'], [90, '90 s'], [120, '120 s']], 'Planning timer')}
    ${sel('resultsSec', [[15, '15 s'], [25, '25 s'], [0, 'Wait for all']], 'Results auto-advance')}
    ${sel('bigMatch', [['true', 'On'], ['false', 'Off']], 'Big Match weeks')}
    ${sel('tvFaces', [['true', 'On'], ['false', 'Off']], 'Feedback faces on the TV')}
    ${lobby && S.bars.length < 4 ? `<div class="row"><span>Fill a seat with a computer bar</span><button data-act="bot">Add computer bar</button></div>` : ''}
    ${S.bars.map(b => `<div class="row"><span><span class="sw" style="background:${b.colour}">${LETTER[b.slot]}</span> ${esc(b.bar)}${b.bot ? ' 🤖' : ''}${b.status === 'out' ? ' (out)' : ''}</span>${b.status !== 'out' || lobby ? `<button class="danger" data-act="remove" data-slot="${b.slot}">Remove</button>` : ''}</div>`).join('')}
    ${!lobby && S.phase !== 'finale' ? `<div class="row"><span>Stop now and show the standings</span><button class="danger" data-act="end">End game</button></div>` : ''}
    <div class="row"><span>Full screen <span class="kbd">F</span> · Mute <span class="kbd">M</span> · Debug <span class="kbd">D</span></span><button data-act="close">Close</button></div>`;
  show('menu', true);
  $('menu').querySelectorAll('[data-set]').forEach(el => el.onchange = () => {
    const v = el.value, key = el.dataset.set;
    conn.send({ type: 'host.settings', settings: { [key]: v === 'true' ? true : v === 'false' ? false : Number(v) } });
  });
  $('menu').querySelectorAll('[data-act]').forEach(el => el.onclick = () => {
    const a = el.dataset.act;
    if (a === 'bot') conn.send({ type: 'host.bot' });
    if (a === 'remove') conn.send({ type: 'host.remove', slot: Number(el.dataset.slot) });
    if (a === 'end') { conn.send({ type: 'host.end' }); menuOpen = false; }
    if (a === 'close') menuOpen = false;
    renderMenu();
  });
}

// ------------------------------------------------------------------ state changes
function onState(m) {
  P = S; S = m;
  const phaseChanged = !P || P.phase !== S.phase || P.week !== S.week || P.gameNo !== S.gameNo;
  beach.setBars(S.bars);

  if (phaseChanged) enterPhase();
  // lobby: a pop when a bar joins
  if (S.phase === 'lobby') { if (P && S.bars.length > P.bars.length) sound.blip(); renderLobby(); }
  topBadges();
  if (menuOpen) renderMenu();
}

function enterPhase() {
  const ph = S.phase;
  ['lobby', 'brief', 'results', 'finale'].forEach(id => show(id, false));
  $('clock').classList.add('hide');
  beach.mode = ph;
  beach.pullTarget = ph === 'results' || ph === 'finale' ? 1 : 0;
  if (ph !== 'matchday') { beach.stopDay(); sound.rain(false); sound.setMurmur?.(0); }
  if (ph !== 'finale') stopConfetti();

  switch (ph) {
    case 'lobby':
      beach.setWeather('sunny'); beach.hidePrices();
      caption('');
      break;
    case 'briefing':
      beach.setWeather(S.forecast); beach.setFixture(S.fixture); beach.hidePrices();
      if (S.week === 1) sound.riff(); else sound.riff(7);
      renderBriefing();
      caption(`Week ${S.week}: ${S.fixture.sportName}, Home v ${S.fixture.away}. The Beach Weather says ${S.forecastLabel.toLowerCase()}.${S.fixture.big ? ' Big Match week! Expect a bigger crowd.' : ''}`);
      break;
    case 'planning':
      beach.setWeather(S.forecast); beach.setFixture(S.fixture);
      $('clock').classList.toggle('hide', !S.endsAt);
      caption('Bars are planning on their phones. Nobody can see anyone else’s plan.');
      break;
    case 'matchday': {
      if (!S.script) break;
      beach.setFixture(S.script.fixture);
      beach.sport.onScore = () => sound.cheer();
      lastSaleTimes = [];
      beach.playDay(S.script, S.startAt, () => conn.now(), {
        onSale: () => { lastSaleTimes.push(performance.now()); },
        onChime: () => sound.till(),
        onEvent: ev => {
          if (ev.type === 'van') sound.jingle();
          if (ev.type === 'gulls') sound.gulls();
          if (ev.type === 'extra') sound.cheer();
          caption(ev.banner);
        },
      });
      // the real weather arrives in the first second
      const startIn = Math.max(0, S.startAt - conn.now());
      setTimeout(() => {
        beach.setWeather(S.weather);
        sound.shaker(); sound.whistle();
        if (S.weather === 'storm') sound.rain(true);
        caption(`Serving cocktails. Actual weather: ${S.weatherLabel.toLowerCase()}.`);
      }, startIn);
      setTimeout(() => sting(S.weather === S.forecast), startIn + 1300);
      break;
    }
    case 'results': {
      beach.setWeather(S.weather, true);
      renderResults();
      const profits = S.results.map(r => r.profit);
      if (S.results.some(r => r.eliminated) || (profits.length && profits.every(p => p <= 0))) sound.wrong();
      if (S.bars.length === 1 && S.results[0]?.eliminated) caption('The till is empty. Time to pack up the blender.');
      else if (S.best) caption(`Best trade of the day: ${S.best.bar}, ${money(S.best.profit)} profit.`);
      else caption('A grim day on the sand. The ice melted for nothing.');
      break;
    }
    case 'finale': {
      renderFinale();
      const w = S.standings[0];
      caption(S.standings.length > 1 ? `Champion of the sand: ${w.bar}, ${money(w.netWorth)}.` : `Final net worth: ${money(w.netWorth)}.`);
      if (!w.out) { sound.fanfare(); setTimeout(() => sound.riff(), 1200); startConfetti(); }
      else sound.wrong();
      break;
    }
  }
}

function sting(right) {
  const el = $('sting');
  el.textContent = right ? '✓ Forecast spot on' : 'The forecast was wrong!';
  el.classList.toggle('ok', right);
  el.classList.add('show');
  if (right) sound.tick(); else sound.sting();
  setTimeout(() => el.classList.remove('show'), right ? 1600 : 2600);
}

// ------------------------------------------------------------------ per frame
const tags = $('tags');
function frame() {
  beach.frame();
  if (S && conn) {
    // countdown
    if (S.phase === 'planning' && S.endsAt) {
      const left = Math.max(0, Math.ceil((S.endsAt - conn.now()) / 1000));
      const el = $('clock'); el.classList.remove('hide');
      el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      el.classList.toggle('low', left <= 10);
    }
    // projected tags over each bar: planning pills, then live counters
    let html = '';
    const ds = beach.dayState();
    for (const b of S.bars) {
      const p = beach.screenPos(b.slot, 21); if (!p) continue;
      const pos = `left:${Math.max(80, Math.min(innerWidth - 80, p.x))}px;top:${Math.max(60, p.y)}px`;
      if (S.phase === 'planning' && b.status === 'active') {
        html += `<div class="tag3d ${b.away ? 'away' : b.locked ? 'locked' : ''}" style="${pos}">${b.away ? '📵 Away' : b.locked ? '🔒 Locked in' : '✏️ Planning'}</div>`;
      } else if (S.phase === 'matchday' && ds?.bars[b.slot]) {
        const d = ds.bars[b.slot];
        html += `<div class="tag3d counter" style="${pos};background:${b.colour}">${d.served}<small> / ${d.mixed}</small>${d.served && d.served === d.mixed ? ' <small>SOLD OUT</small>' : ''}</div>`;
      } else if (S.phase === 'matchday' && S.script && !ds) {
        const sb = S.script.bars.find(x => x.slot === b.slot);
        if (sb) html += `<div class="tag3d counter" style="${pos};background:${b.colour}">0<small> / ${sb.mixed}</small></div>`;
      }
    }
    if (tags.dataset.k !== html) { tags.innerHTML = html; tags.dataset.k = html; }
    // crowd murmur swells with the rate of sales
    if (sound.on) { const now = performance.now(); lastSaleTimes = lastSaleTimes.filter(x => now - x < 1000); sound.setMurmur(lastSaleTimes.length * 0.006); }
    if (debug) $('debug').textContent = `room ${S.code}  phase ${S.phase}  week ${S.week}/${S.weeks}\nends in ${S.endsAt ? ((S.endsAt - conn.now()) / 1000).toFixed(1) + 's' : '—'}  paused ${S.paused}\nclock offset ${conn.offset.toFixed(0)}ms  fps ${beach.fps?.toFixed(0) || '…'}  quality tier ${beach.tierLevel}`;
  }
  drawConfetti();
  requestAnimationFrame(frame);
}
// keep results counters showing after the day ends
const _stop = beach.stopDay.bind(beach);
beach.stopDay = () => { if (S?.phase === 'results') { beach.sport.idle(); beach.van.visible = false; beach.gulls.forEach(g => g.visible = false); return; } _stop(); };
requestAnimationFrame(frame);

beach.onThunder = () => {
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = 0.55;
  requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; });
  setTimeout(() => sound.thunder(), 300 + Math.random() * 600);
};

// ------------------------------------------------------------------ confetti
const cc = $('confetti'), cx = cc.getContext('2d');
let confetti = [];
function startConfetti() {
  if (REDUCED) return;
  cc.width = innerWidth; cc.height = innerHeight;
  const cols = ['#ff6b5e', '#14b8a6', '#f59e0b', '#8b5cf6', '#ffffff', '#facc15'];
  confetti = Array.from({ length: 220 }, () => ({ x: Math.random() * cc.width, y: -Math.random() * cc.height, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], s: 6 + Math.random() * 8, life: 600 }));
}
function stopConfetti() { confetti = []; cx.clearRect(0, 0, cc.width, cc.height); }
function drawConfetti() {
  if (!confetti.length) return;
  cx.clearRect(0, 0, cc.width, cc.height);
  for (const p of confetti) {
    p.x += p.vx; p.y += p.vy; p.r += 0.08; p.life--;
    if (p.y > cc.height) { p.y = -10; p.x = Math.random() * cc.width; }
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore();
  }
  confetti = confetti.filter(p => p.life > 0);
  if (!confetti.length) cx.clearRect(0, 0, cc.width, cc.height);
}

// ------------------------------------------------------------------ host controls
function enableSound() { sound.enable(); setTimeout(() => show('soundhint', !sound.on), 200); }
addEventListener('pointerdown', enableSound);
addEventListener('keydown', e => {
  enableSound();
  if (e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === 'enter') { if (S?.phase === 'briefing') conn.send({ type: 'host.skip' }); else conn.send({ type: 'host.start' }); }
  else if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  else if (k === 'm') { const m = sound.toggleMute(); caption(m ? '🔇 Sound muted' : '🔊 Sound on'); }
  else if (k === 'escape') { menuOpen = !menuOpen; renderMenu(); }
  else if (k === 'd') { debug = !debug; show('debug', debug); }
});
