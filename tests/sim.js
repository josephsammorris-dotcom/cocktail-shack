// Plays many bot-vs-bot games and checks the invariants never break (Handbook Section 17).
// Run: node tests/sim.js [games]
import * as E from '../src/engine.js';

const games = Number(process.argv[2] || 1000);
let broken = 0, bankrupt = 0, loans = 0, sellThrough = [], tops = [], medians = [];

function check(g, cond, msg) { if (!cond) { broken++; if (broken < 10) console.log('INVARIANT', msg, 'seed', g.seed, 'week', g.week); } }

for (let n = 0; n < games; n++) {
  const g = E.createGame(1000 + n);
  const players = 1 + (n % 4);
  for (let i = 0; i < players; i++) E.addPlayer(g, { id: 'b' + i, token: 't' + i, name: '', bot: true });
  E.startGame(g);
  while (g.phase !== 'finale') {
    E.beginPlanning(g);
    // half the bars play randomly, to stress the rules
    for (const p of E.activePlayers(g)) {
      if (n % 2 && p.slot % 2) {
        p.bot = false;
        if (Math.random() < 0.2) E.hire(g, p);
        if (Math.random() < 0.2) E.fire(g, p);
        if (E.planInfo(g, p).loan && Math.random() < 0.7) { E.takeLoan(g, p); loans++; }
        E.updatePlan(g, p, { drinks: Math.floor(Math.random() * 200), ads: Math.floor(Math.random() * 12), price: 1 + Math.floor(Math.random() * 40) });
        if (Math.random() < 0.5) E.lock(g, p);
      } else if (E.planInfo(g, p).loan) { E.takeLoan(g, p); loans++; }
    }
    E.finalisePlans(g);
    const day = E.resolveDay(g);
    for (const r of Object.values(day.results)) {
      const p = g.players.find(q => q.slot === r.slot);
      check(g, p.cash >= 0, 'cash negative');
      check(g, r.mixed <= r.staff * 25, 'capacity exceeded');
      check(g, r.sold <= r.mixed, 'sold > mixed');
      check(g, r.spent.total <= r.cashBefore, 'outlay > cash');
      check(g, day.script.totals[r.slot].sold === r.sold, 'script disagrees');
      if (r.mixed) sellThrough.push(r.sold / r.mixed);
      if (r.eliminated) bankrupt++;
    }
    E.beginResults(g);
    E.endWeek(g);
  }
  const st = E.standings(g);
  for (const s of st) check(g, s.netWorth === s.cash - s.debt, 'net worth');
  if (players === 4) { tops.push(st[0].netWorth); medians.push((st[1].netWorth + st[2].netWorth) / 2); }
}
const avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
console.log(`${games} games, invariants broken: ${broken}`);
console.log(`bankruptcies ${bankrupt}, loans ${loans}, mean sell-through ${(avg(sellThrough) * 100).toFixed(1)}%`);
console.log(`4-player games: mean winner ${E.money(avg(tops))}, mean median ${E.money(avg(medians))}`);
if (broken) process.exit(1);
