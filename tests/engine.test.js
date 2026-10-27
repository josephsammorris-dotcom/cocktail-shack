// Golden test cases for the rules engine (Handbook Section 17). Run: node tests/engine.test.js
import * as E from '../src/engine.js';

let pass = 0, fail = 0;
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b, msg = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

function soloGame({ week = 1, weather = 'sunny' } = {}) {
  const g = E.createGame(1);
  E.addPlayer(g, { id: 'a', token: 'ta', name: 'A' });
  E.startGame(g);
  g.week = week; g.weather = weather; g.forecast = weather;
  g.fixture = { ...E.fixtureFor(g, week), seed: 1 };
  E.beginPlanning(g);
  return g;
}

console.log('Rules engine');

// The crowd was retuned (see C.crowdBase, crowdByStage, seasonFactor), so the handbook's example 1 now reads:
// week 6 league match (full season, crowd × 1.0), sunny, U = 0.5: attendance 52 + 14 = 66, buyers 66 × 1.1 = 72.6,
// share 0.522, demand 37.9. The money and the verdicts are unchanged.
t('1  solo worked example (retuned crowd)', () => {
  const g = soloGame({ week: 6 });
  eq(g.fixture.stage, 'league');
  const p = g.players[0];
  E.updatePlan(g, p, { drinks: 15, ads: 1, price: 15 });
  eq(E.lock(g, p).ok, true);
  const day = E.resolveDay(g, { U: 0.5, event: null });
  const r = day.results[0];
  ok(near(day.B, 72.6, 1e-9), 'buyers ' + day.B);
  ok(near(r.demand, 37.9, 0.1), 'demand ' + r.demand);
  eq([r.sold, r.takings, r.spent.total, r.profit, r.cashAfter], [15, 225, 95, 130, 230]);
  eq(r.verdicts.mix[0], 'mid'); eq(r.verdicts.ads[0], 'mid'); eq(r.verdicts.price[0], 'good'); eq(r.verdicts.staff[0], 'good');
});

t('2  two bars worked example', () => {
  const s = E.splitCrowd([{ mixed: 50, ads: 2, price: 15 }, { mixed: 30, ads: 0, price: 22 }], 206, 1, 7);
  ok(near(s[0].pull, 1.24) && near(s[1].pull, 0.686, 0.002), 'pulls');
  ok(near(s[0].demand, 87.3, 0.1) && near(s[1].demand, 48.3, 0.1), 'demands ' + s[0].demand + ' ' + s[1].demand);
  eq([s[0].sold, s[1].sold], [50, 30]);
  // money: bar A 2 staff, bar B 1 staff, ad cost 5
  eq(50 * 15 - (50 * 7 + 2 * 5 + 50), 340);
  eq(30 * 22 - (30 * 7), 450);
});

t('3  loan offer, size, interest and repayment', () => {
  const g = soloGame({ week: 3 });
  const p = g.players[0]; p.cash = 30;
  const info = E.planInfo(g, p);
  ok(info.loan, 'offered');
  eq([info.loan.amount, info.loan.debt], [70, 88]);
  E.takeLoan(g, p);
  eq([p.cash, p.debt], [100, 88]);
  // takings 120: 10 sold at 12p (the cocktails cost 60p, which does not affect the repayment)
  E.updatePlan(g, p, { drinks: 0, ads: 0, price: 12 });
  p.plan = { drinks: 10, ads: 0, price: 12 }; E.lock(g, p);
  let day = E.resolveDay(g, { U: 0.99, event: null });
  eq([day.results[0].takings, day.results[0].repaid, p.debt], [120, 60, 28]);
  g.phase = 'planning'; p.plan = { drinks: 10, ads: 0, price: 8 };
  day = E.resolveDay(g, { U: 0.99, event: null });
  eq([day.results[0].takings, day.results[0].repaid, p.debt, day.results[0].loanCleared], [80, 28, 0, true]);
});

t('4  hire check', () => {
  const g = soloGame(); const p = g.players[0];
  p.cash = 50; eq(E.hire(g, p).ok, true); eq(p.staff, 2);
  const g2 = soloGame(); const q = g2.players[0];
  q.cash = 49; ok(E.hire(g2, q).error, 'refused'); eq(q.staff, 1);
});

t('5  wage emergency', () => {
  const g = soloGame(); const p = g.players[0];
  p.staff = 2; p.cash = 49;
  eq(E.planInfo(g, p).wageEmergency, true);
  E.fire(g, p);
  eq([p.staff, p.leaving], [1, 0]);
});

t('6  fire timing', () => {
  const g = soloGame(); const p = g.players[0];
  p.staff = 3; p.cash = 1000;
  E.fire(g, p);
  eq([p.leaving, E.wages(p)], [1, 100]);
  E.rollover(g);
  eq(p.staff, 2);
});

t('7  bankruptcy', () => {
  const g = soloGame(); const p = g.players[0];
  p.cash = 5; p.debt = 10; p.plan = { drinks: 0, ads: 0, price: 10 };
  E.resolveDay(g, { U: 0.5, event: null });
  eq(p.status, 'out');
  const g2 = soloGame(); const q = g2.players[0];
  q.cash = 5; q.debt = 0; q.plan = { drinks: 0, ads: 0, price: 10 };
  E.resolveDay(g2, { U: 0.5, event: null });
  eq(q.status, 'active');
});

t('8  rounding half up', () => { eq(E.roundHalfUp(62.5), 63); eq(E.roundHalfUp(62.49), 62); });

t('9  ad pull', () => {
  const v = [0, 1, 5, 10, 20].map(E.adPull);
  [0.85, 1.12, 1.60, 2.10, 2.10].forEach((x, i) => ok(near(v[i], x, 1e-9), `ads ${[0, 1, 5, 10, 20][i]} -> ${v[i]}`));
});

t('10 price factor at cocktail cost 6', () => {
  eq(E.priceFactor(14, 6, 10), 1);
  ok(near(E.priceFactor(25.92, 6, 10), 0.5, 1e-9));
  eq(E.priceFactor(37.44, 6, 10), 0);
  eq(E.priceFactor(5, 6, 10), 1.05);
  eq(E.priceFactor(15, 6, 0), 0);
});

t('11 autopilot', () => {
  const g = soloGame(); const p = g.players[0];
  p.staff = 2; p.cash = 100; p.plan = { drinks: 50, ads: 2, price: 15 };
  const plan = E.autopilot(g, p);
  eq([plan.ads, plan.drinks, E.outlay(g, p, plan).total], [0, 8, 98]);
});

t('12 weather odds over 100,000 draws', () => {
  const g = E.createGame(42); g.settings.weeks = 12;
  const n = 100000, count = {}; let right = 0;
  for (let i = 0; i < n; i++) { g.week = 1; E.beginBriefing(g); count[g.weather] = (count[g.weather] || 0) + 1; if (g.weather === g.forecast) right++; }
  ok(Math.abs(count.storm / n - 0.111) < 0.005, 'storm ' + count.storm / n);
  for (const w of ['sunny', 'scorcher', 'cloud', 'cool']) ok(Math.abs(count[w] / n - 0.222) < 0.005, w + ' ' + count[w] / n);
  ok(Math.abs(right / n - 0.80) < 0.005, 'forecast right ' + right / n);
});

t('13 event odds over 100,000 non-storm days', () => {
  const g = soloGame(); g.weather = 'sunny';
  const n = 100000, c = { van: 0, gulls: 0, extra: 0, none: 0 };
  for (let i = 0; i < n; i++) { g.phase = 'planning'; g.players[0].status = 'active'; g.players[0].history = []; const d = E.resolveDay(g); c[d.event || 'none']++; }
  const want = { van: 0.08, gulls: 0.08, extra: 0.0672, none: 0.7728 };
  for (const k in want) ok(Math.abs(c[k] / n - want[k]) < 0.005, `${k} ${c[k] / n}`);
});

t('14 determinism: same seed and plans give identical results', () => {
  const run = () => {
    const g = E.createGame(913);
    ['a', 'b', 'c'].forEach(id => E.addPlayer(g, { id, token: id, name: id }));
    E.startGame(g);
    const log = [];
    while (g.phase !== 'finale') {
      E.beginPlanning(g);
      g.players.forEach((p, i) => p.status === 'active' && E.updatePlan(g, p, { drinks: 10 + i * 5, ads: i, price: 12 + i * 3 }));
      E.finalisePlans(g);
      log.push(JSON.stringify(E.resolveDay(g)));
      E.beginResults(g); E.endWeek(g);
    }
    return log.join('\n');
  };
  eq(run() === run(), true);
});

t('15 crowd by fixture: no match, league, semi-final, final', () => {
  const B = {};
  for (const week of [5, 6, 11, 12]) {
    const g = soloGame({ week });
    E.updatePlan(g, g.players[0], { drinks: 15, ads: 1, price: 15 });
    B[week] = E.resolveDay(g, { U: 0.5, event: null }).B;
  }
  ok(near(B[5], 72.6 * 0.7, 1e-9), 'no match ' + B[5]);
  ok(near(B[6], 72.6, 1e-9), 'league ' + B[6]);
  ok(near(B[11], 72.6 * 1.25, 1e-9), 'semi ' + B[11]);
  ok(near(B[12], 72.6 * 1.5, 1e-9), 'final ' + B[12]);
});

t('season builds over the first five weeks', () => {
  eq([1, 2, 3, 4, 5, 9].map(w => +E.seasonFactor(w).toFixed(3)), [0.7, 0.775, 0.85, 0.925, 1, 1]);
});

t('fixture list: league on even weeks, then semi-final and final', () => {
  const g = E.createGame(1);
  const stages = Array.from({ length: 12 }, (_, i) => E.fixtureFor(g, i + 1).stage);
  eq(stages, [null, 'league', null, 'league', null, 'league', null, 'league', null, 'league', 'semi', 'final']);
  eq(E.fixtureFor(g, 2).away, 'Sandy Cove'); eq(E.fixtureFor(g, 4).away, 'Palm Bay'); eq(E.fixtureFor(g, 12).away, 'Pelican Key');
  eq(E.fixtureFor(g, 3).match, false); eq(E.fixtureFor(g, 12).big, 'Beach Cup Final');
  g.settings.bigMatch = false;
  eq([E.fixtureFor(g, 11).stage, E.fixtureFor(g, 12).crowd], ['league', 1]);
  g.settings.weeks = 8;
  eq(Array.from({ length: 8 }, (_, i) => E.fixtureFor(g, i + 1).stage), [null, 'league', null, 'league', null, 'league', 'league', 'league']);
});

t('no-match days have no score and a beach-party banner for the extra event', () => {
  const g = soloGame({ week: 3 });
  const d = E.resolveDay(g, { U: 0.5, event: 'extra' });
  eq(g.fixture.score, null);
  ok(/beach party/.test(d.banner), d.banner);
  const g2 = soloGame({ week: 4 });
  ok(/third set/.test(E.resolveDay(g2, { U: 0.5, event: 'extra' }).banner));
});

t('lock refused when outlay exceeds cash; names cleaned', () => {
  const g = soloGame(); const p = g.players[0];
  E.updatePlan(g, p, { drinks: 25, ads: 0, price: 15 });   // 150p > 100p
  ok(E.lock(g, p).error);
  eq(E.cleanName('', 1, []), 'Blue Lagoon');
  eq(E.cleanName('Shack', 0, ['shack']), 'Shack 2');
  eq(E.cleanName('A very long bar name indeed', 0, []).length, 14);
});

t('day script counters end on sold', () => {
  const g = E.createGame(7);
  ['a', 'b'].forEach(id => E.addPlayer(g, { id, token: id, name: id }));
  E.startGame(g); g.weather = 'scorcher'; E.beginPlanning(g);
  E.finalisePlans(g);
  const d = E.resolveDay(g);
  for (const b of d.script.bars) {
    eq(b.saleTimesMs.length, d.results[b.slot].sold);
    ok(b.saleTimesMs.every(x => x >= 1000 && x <= 12800), 'sale window');
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
