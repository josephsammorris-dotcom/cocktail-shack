// Server test without graphics: a TV and phones play a whole game over WebSockets against `wrangler dev`.
// Checks the day script always agrees with the reports, reconnection keeps a seat, and the game reaches the finale.
// Usage: node tests/server.mjs [players] [weeks]
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const N = Number(process.argv[2] || 2), WEEKS = Number(process.argv[3] || 8);
const WS = BASE.replace(/^http/, 'ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const check = (c, m) => { if (!c) { fail++; console.log('  ✗', m); } };

function client(code, role, onMsg) {
  const ws = new WebSocket(`${WS}/ws/${code}?role=${role}`);
  ws.onmessage = e => { if (e.data !== 'pong') onMsg(JSON.parse(e.data), ws); };
  ws.send2 = m => ws.readyState === 1 && ws.send(JSON.stringify({ v: 1, cid: 'c' + Math.random().toString(36).slice(2), ...m }));
  return new Promise(res => ws.onopen = () => res(ws));
}

const { code } = await (await fetch(BASE + '/api/new')).json();
console.log('room', code);
let tv = null, scripts = {}, results = {};
const tvWs = await client(code, 'tv', m => {
  if (m.type !== 'tv') return; tv = m;
  if (m.phase === 'matchday' && m.script) scripts[m.week] = m.script;
});
tvWs.send2({ type: 'host.settings', settings: { weeks: WEEKS, planningSec: 60, resultsSec: 15 } });

const phones = [];
async function phone(i, token) {
  const p = phones[i] ||= { i, state: null, token: null, reports: {} };
  p.ws = await client(code, 'player', (m, ws) => {
    if (m.type === 'hello') ws.send2(token ? { type: 'rejoin', token } : { type: 'join', name: 'Bar ' + i });
    if (m.type === 'joined') p.token = m.token;
    if (m.type === 'state') {
      const prev = p.state; p.state = m;
      if (m.report) p.reports[m.week] = m.report;
      if (m.phase === 'planning' && !m.me.locked && m.me.status === 'active' && (!prev || prev.phase !== 'planning' || prev.week !== m.week || p.relock)) {
        p.relock = false;
        const info = m.info;
        if (info.loan && i === 1) ws.send2({ type: 'loan.take' });
        if (i === 0 && m.week === 2) ws.send2({ type: 'staff.hire' });
        const k = m.costs.mixCost, budget = m.me.cash - (m.me.staff - 1) * 50 - 2 * m.costs.adCost;
        const drinks = Math.max(0, Math.min(m.me.staff * 25, Math.floor(budget / k)));
        setTimeout(() => ws.send2({ type: 'plan.lock', plan: { drinks, ads: 2, price: 14 + i * 3 } }), 200 + i * 150);
      }
      if (m.phase === 'results' && !m.me.ready && m.me.status === 'active') setTimeout(() => ws.send2({ type: 'ready' }), 300);
    }
  });
  return p;
}
for (let i = 0; i < N; i++) { await phone(i); await sleep(200); }
await sleep(500);
check(tv.bars.length === N, 'all phones seated');
phones[0].ws.send2({ type: 'start' });

let reconnected = false;
const t0 = Date.now();
while (Date.now() - t0 < WEEKS * 60000) {
  await sleep(500);
  if (!tv) continue;
  // drop and rejoin phone 1 in week 2 planning
  if (!reconnected && tv.phase === 'planning' && tv.week === 2 && N > 1) {
    reconnected = true;
    const before = JSON.stringify(phones[1].state.me.plan), cash = phones[1].state.me.cash;
    phones[1].ws.close(); await sleep(400);
    phones[1].relock = true;
    await phone(1, phones[1].token); await sleep(800);
    check(phones[1].state.me.cash === cash, 'reconnected phone keeps its cash');
    check(phones[1].state.me.slot === 1, 'reconnected phone keeps its seat');
    console.log('  reconnect ok, plan', before);
  }
  if (tv.phase === 'finale') break;
}
check(tv.phase === 'finale', 'reached the finale, phase ' + tv?.phase);
for (const [w, s] of Object.entries(scripts)) for (const b of s.bars) {
  const r = phones.find(p => p.state.me.slot === b.slot)?.reports[w];
  if (r) check(r.sold === b.saleTimesMs.length, `week ${w} slot ${b.slot}: script ${b.saleTimesMs.length} = report ${r.sold}`);
  if (r) check(r.cashAfter >= 0, 'cash never negative');
}
console.log('weeks played', Object.keys(scripts).length, 'standings', tv.standings?.map(s => `${s.bar} ${s.netWorth}p${s.out ? ' OUT' : ''}`).join(', '));
// play again returns to the lobby with the same bars
phones[0].ws.send2({ type: 'playagain' }); await sleep(800);
check(tv.phase === 'lobby' && tv.bars.length === N, 'play again returns to the lobby with the same bars');
console.log(fail ? `${fail} checks failed` : 'all server checks passed', `in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
process.exit(fail ? 1 : 0);
