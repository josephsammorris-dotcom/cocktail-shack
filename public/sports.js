// Match-day fixtures (Handbook Section 13). Cosmetic only: the scoreline comes from the server's day script,
// the choreography from its seed. Every object stays inside the 38 × 20 pitch keep-out zone.
import * as THREE from 'three';

const PW = 19, PD = 10;                                      // half sizes of the pitch
const HOME = { shirt: '#ffffff', shorts: '#0ea5e9' }, AWAY = { shirt: '#1f2937', shorts: '#facc15' };
const UNIT = { volleyball: 'Sets', football: 'Goals', frisbee: 'Points', rugby: 'Tries' };
const PER_SIDE = { volleyball: 2, football: 5, frisbee: 4, rugby: 5 };

function mulberry(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clampX = x => Math.max(-PW + 0.8, Math.min(PW - 0.8, x)), clampZ = z => Math.max(-PD + 0.8, Math.min(PD - 0.8, z));

export class Sport {
  constructor(scene, h) {
    this.scene = scene; this.h = h;
    this.root = new THREE.Group(); scene.add(this.root);
    this.kit = new THREE.Group(); this.root.add(this.kit);
    this.ballPos = new THREE.Vector3(); this.cheer = 0;
    this.kind = null; this.mode = 'idle'; this.score = [0, 0]; this.flashText = null;
    this.buildPitch(); this.buildBoard();
  }

  buildPitch() {
    const { toon } = this.h;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(PW * 2, PD * 2), toon('#fff1d6'));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.04; base.receiveShadow = true; this.root.add(base);
    this.lineMat = toon('#ffffff');
    const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), this.lineMat); m.position.set(x, 0.08, z); m.receiveShadow = true; this.root.add(m); };
    line(PW * 2, 0.35, 0, -PD); line(PW * 2, 0.35, 0, PD); line(0.35, PD * 2, -PW, 0); line(0.35, PD * 2, PW, 0);
    // corner flags
    for (const [x, z] of [[-PW, -PD], [PW, -PD], [-PW, PD], [PW, PD]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 5), toon('#ffffff')); p.position.set(x, 1.1, z); this.root.add(p);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 3), toon('#ff6b5e')); f.rotation.z = -Math.PI / 2; f.position.set(x + 0.4, 2, z); this.root.add(f);
    }
  }

  buildBoard() {
    const { toon, canvasTex } = this.h;
    this.boardTex = canvasTex(768, 220, () => {});
    const board = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(18, 5.15), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    face.position.set(0, 6.8, 0.26);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(18.8, 5.9, 0.5), toon('#123c4a')); frame.position.y = 6.8; frame.castShadow = true;
    for (const x of [-7, 7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), toon('#123c4a')); p.position.set(x, 2, 0); board.add(p); }
    board.add(frame, face); board.position.set(0, 0, -15.5);
    this.root.add(board);
    this.drawBoard();
  }

  drawBoard() {
    const c = this.boardTex.userData.canvas, ctx = c.getContext('2d'), w = c.width, h = c.height;
    ctx.fillStyle = '#0b2530'; ctx.fillRect(0, 0, w, h);
    const away = (this.fixture?.away || 'Away').toUpperCase();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = '800 46px Inter, system-ui, sans-serif'; ctx.fillStyle = '#e0f2fe';
    ctx.fillText('HOME', w * 0.2, 70); ctx.fillText(away.length > 12 ? away.slice(0, 12) : away, w * 0.8, 70);
    ctx.font = '900 96px Inter, system-ui, sans-serif'; ctx.fillStyle = '#fde68a';
    ctx.fillText(`${this.score[0]} – ${this.score[1]}`, w / 2, 78);
    ctx.font = '700 38px Inter, system-ui, sans-serif';
    if (this.flashText && Math.floor(performance.now() / 400) % 2 === 0) { ctx.fillStyle = '#ff8a5e'; ctx.fillText(this.flashText, w / 2, 172); }
    else { ctx.fillStyle = '#7dd3fc'; ctx.fillText(this.fixture ? `${(this.fixture.big || this.fixture.sportName || '').toUpperCase()} · ${UNIT[this.kind] || ''}` : 'COCKTAIL SHACK BEACH', w / 2, 172); }
    this.boardTex.needsUpdate = true;
  }

  setSport(kind, fixture) {
    this.fixture = fixture;
    if (this.kind === kind && this.players) { this.drawBoard(); return; }
    this.kind = kind;
    this.root.remove(this.kit); this.kit = new THREE.Group(); this.root.add(this.kit);
    const { toon, figure } = this.h, K = this.kit;
    const white = toon('#ffffff');
    if (kind === 'volleyball') {
      for (const z of [-PD - 0.4, PD + 0.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6.2, 8), white); p.position.set(0, 3.1, z); p.castShadow = true; K.add(p); }
      const netTex = this.h.canvasTex(256, 64, (ctx, w, h) => { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; for (let x = 0; x <= w; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y <= h; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, 7); });
      const net = new THREE.Mesh(new THREE.PlaneGeometry(PD * 2 + 0.8, 1.8), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      net.rotation.y = Math.PI / 2; net.position.set(0, 5.1, 0); K.add(net);
      const mid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, PD * 2), white); mid.position.y = 0.09; K.add(mid);
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), toon('#fde047'));
    } else if (kind === 'football') {
      for (const s of [-1, 1]) {
        const gx = s * PW;
        const postM = white;
        for (const z of [-3, 3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 8), postM); p.position.set(gx, 1.6, z); p.castShadow = true; K.add(p); }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6.2, 8), postM); bar.rotation.x = Math.PI / 2; bar.position.set(gx, 3.2, 0); K.add(bar);
        const netM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
        const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), netM); back.rotation.y = Math.PI / 2; back.position.set(gx - s * 0.1, 1.6, 0); K.add(back);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 8), white); box.position.set(gx - s * 4, 0.09, 0); K.add(box);
        for (const z of [-4, 4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(4, 0.06, 0.25), white); l.position.set(gx - s * 2, 0.09, z); K.add(l); }
      }
      const mid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, PD * 2), white); mid.position.y = 0.09; K.add(mid);
      const circle = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.5, 32), new THREE.MeshBasicMaterial({ color: '#ffffff' })); circle.rotation.x = -Math.PI / 2; circle.position.y = 0.1; K.add(circle);
      const tex = this.h.canvasTex(128, 64, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#111'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc((i * 23) % w, (i * 37) % h, 9, 0, 7); ctx.fill(); } });
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshToonMaterial({ map: tex }));
    } else if (kind === 'frisbee') {
      for (const s of [-1, 1]) {
        const ez = new THREE.Mesh(new THREE.PlaneGeometry(5, PD * 2), new THREE.MeshBasicMaterial({ color: s < 0 ? '#14b8a6' : '#f59e0b', transparent: true, opacity: 0.28, depthWrite: false }));
        ez.rotation.x = -Math.PI / 2; ez.position.set(s * (PW - 2.5), 0.07, 0); K.add(ez);
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, PD * 2), white); l.position.set(s * (PW - 5), 0.09, 0); K.add(l);
        for (const z of [-PD, PD]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), toon('#f97316')); c.position.set(s * (PW - 5), 0.6, z); K.add(c); }
      }
      this.ball = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 0.16, 18), toon('#f97316'));
    } else {
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, PD * 2), white); l.position.set(s * (PW - 4), 0.09, 0); K.add(l);
        const ez = new THREE.Mesh(new THREE.PlaneGeometry(4, PD * 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false })); ez.rotation.x = -Math.PI / 2; ez.position.set(s * (PW - 2), 0.07, 0); K.add(ez);
        // H posts
        for (const z of [-2.2, 2.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 7, 8), white); p.position.set(s * PW, 3.5, z); p.castShadow = true; K.add(p); }
        const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8), white); cb.rotation.x = Math.PI / 2; cb.position.set(s * PW, 2.6, 0); K.add(cb);
      }
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), toon('#92400e')); this.ball.scale.set(1.45, 0.9, 0.9);
    }
    this.ball.castShadow = true; K.add(this.ball);
    this.trail = [];
    if (kind === 'volleyball') for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.42 - i * 0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.4 - i * 0.045, depthWrite: false })); K.add(m); this.trail.push(m); }
    this.history = [];

    // players
    const n = PER_SIDE[kind];
    this.players = [];
    for (let team = 0; team < 2; team++) for (let i = 0; i < n; i++) {
      const kit = team ? AWAY : HOME;
      const f = figure({ shirt: kit.shirt, shorts: kit.shorts, scale: 0.85 });
      f.userData.team = team; f.userData.idx = i; f.userData.form = this.formation(kind, team, i, n);
      f.position.copy(f.userData.form); K.add(f); this.players.push(f);
    }
    this.score = [0, 0];
    this.holder = this.players[0];
    this.ballPos.set(0, 0.6, 0); this.ball.position.copy(this.ballPos);
    this.drawBoard();
  }

  formation(kind, team, i, n) {
    const s = team ? 1 : -1;   // home on the left, attacking +x
    if (kind === 'volleyball') return new THREE.Vector3(s * (i ? 11 : 5), 0, i ? 3.5 : -3.5);
    if (kind === 'football' && i === 0) return new THREE.Vector3(s * (PW - 1.5), 0, 0);
    const cols = kind === 'football' ? [[9, -5], [9, 5], [3, -2.5], [3, 3.5]] : kind === 'frisbee' ? [[12, -5], [8, 5], [4, -2], [2, 6]] : [[10, -6], [8, -2], [6, 2], [4, 6], [11, 0]];
    const [x, z] = cols[(kind === 'football' ? i - 1 : i) % cols.length];
    return new THREE.Vector3(s * x, 0, z);
  }

  // ---------------------------------------------------------------- the match
  startMatch(fixture, script) {
    this.setSport(fixture.sport, fixture);
    this.mode = 'play';
    this.rnd = mulberry(fixture.seed || 1);
    this.score = [0, 0]; this.flashText = null;
    const final = fixture.score || [0, 0];
    const pts = [...Array(final[0]).fill(0), ...Array(final[1]).fill(1)];
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    this.scores = pts.map((team, i) => ({ team, at: 1800 + (10600 * (i + 0.6)) / pts.length + (this.rnd() - 0.5) * 500 }));
    this.scores.sort((a, b) => a.at - b.at);
    this.storm = script.weather?.actual === 'storm';
    this.action = null; this.holder = this.players[0]; this.lastMs = 0;
    this.drawBoard();
  }
  idle() { this.mode = 'idle'; this.action = null; this.flashText = null; this.drawBoard(); }
  onEvent(type) {
    if (type === 'extra') { this.flashText = this.kind === 'volleyball' ? 'THIRD SET!' : this.kind === 'football' ? 'EXTRA TIME!' : 'OVERTIME!'; this.cheer = 1; }
  }

  teamPlayers(team) { return this.players.filter(p => p.userData.team === team); }
  attackDir(team) { return team === 0 ? 1 : -1; }

  nextAction(ms) {
    const r = this.rnd, kind = this.kind, h = this.holder, team = h.userData.team;
    const pending = this.scores.find(s => !s.done);
    const from = this.ballPos.clone();
    const mk = (o) => { this.action = { t0: ms, from, ...o }; };
    const mates = this.teamPlayers(team).filter(p => p !== h), foes = this.teamPlayers(1 - team);
    const pick = arr => arr[Math.floor(r() * arr.length)];

    // set up the scoring play so it lands on its scheduled time
    if (pending && pending.at - ms < 1800) {
      const dur = Math.max(450, pending.at - ms);
      if (pending.team !== team && kind !== 'volleyball') {
        const to = pick(this.teamPlayers(pending.team));
        return mk({ t1: ms + Math.min(dur * 0.4, 700), to: to.position.clone().setY(1), height: 1.2, receiver: to });
      }
      const dir = this.attackDir(pending.team);
      if (kind === 'volleyball') {
        const shooter = team === pending.team ? h : pick(this.teamPlayers(pending.team));
        return mk({ t1: ms + dur, to: new THREE.Vector3(-dir * 0 + dir * (6 + r() * 10), 0.6, (r() - 0.5) * 14), height: 8, score: pending, shooter });
      }
      if (kind === 'football') return mk({ t1: ms + Math.min(dur, 900), to: new THREE.Vector3(dir * (PW - 0.3), 1 + r() * 1.5, (r() - 0.5) * 4.5), height: 1.5, score: pending });
      if (kind === 'rugby') return mk({ t1: ms + dur, to: new THREE.Vector3(dir * (PW - 1.6), 0.5, h.position.z * 0.5), height: 0, carry: true, score: pending });
      const catcher = pick(mates.length ? mates : [h]);
      return mk({ t1: ms + dur, to: new THREE.Vector3(dir * (PW - 2.2), 2.2, (r() - 0.5) * 12), height: 2.5, receiver: catcher, score: pending, run: true });
    }
    if (kind === 'volleyball') {
      // a touch inside the side, then over the net
      const sameSide = (this.touches || 0) < 1 && r() < 0.7;
      if (sameSide) { this.touches = (this.touches || 0) + 1; const to = mates[0] || h; return mk({ t1: ms + 650, to: to.position.clone().setY(3.8), height: 4, receiver: to }); }
      this.touches = 0;
      const to = pick(foes);
      const land = new THREE.Vector3(-this.attackDir(team) * -1 * (4 + r() * 9) * 1, 3.6, (r() - 0.5) * 14);
      land.x = Math.abs(land.x) * this.attackDir(team);
      return mk({ t1: ms + 1100 + r() * 300, to: land, height: 8.5, receiver: to, moveReceiver: true });
    }
    if (kind === 'rugby' && r() < 0.55) {
      const dir = this.attackDir(team);
      return mk({ t1: ms + 900 + r() * 500, to: new THREE.Vector3(clampX(h.position.x + dir * (3 + r() * 5)), 0.9, clampZ(h.position.z + (r() - 0.5) * 5)), height: 0, carry: true });
    }
    if (kind === 'football' && r() < 0.4) {
      const dir = this.attackDir(team);
      return mk({ t1: ms + 800 + r() * 400, to: new THREE.Vector3(clampX(h.position.x + dir * (2 + r() * 4)), 0.55, clampZ(h.position.z + (r() - 0.5) * 4)), height: 0, carry: true });
    }
    // a turnover now and then
    const target = r() < 0.18 ? pick(foes) : pick(mates.length ? mates : foes);
    const height = kind === 'frisbee' ? 2.2 : kind === 'rugby' ? 1.3 : 0.8;
    const dur = kind === 'frisbee' ? 1000 + r() * 400 : 650 + r() * 400;
    return mk({ t1: ms + dur, to: target.position.clone().setY(kind === 'football' ? 0.55 : 2.2), height, receiver: target, moveReceiver: kind === 'frisbee' });
  }

  update(t, dt, mode, ms) {
    if (!this.players) return;
    const { animateFigure } = this.h;
    this.cheer = Math.max(0, this.cheer - dt * 0.6);
    if (this.flashText) this.drawBoardThrottled(t);

    if (mode === 'storm') {
      // the match stops and everyone runs for cover
      this.players.forEach((p, i) => {
        const target = new THREE.Vector3((i % 2 ? 1 : -1) * 70, 0, 40);
        const d = target.sub(p.position); const run = d.length() > 1;
        if (run) { d.normalize(); p.position.addScaledVector(d, dt * 13); p.rotation.y = Math.atan2(d.x, d.z); }
        animateFigure(p, t, { walk: run ? 1 : 0 });
      });
      this.ball.position.y = Math.max(0.6, this.ball.position.y - dt * 6);
      this.ballPos.copy(this.ball.position);
      this.trail.forEach(m => m.visible = false);
      return;
    }

    if (mode === 'play' && this.mode === 'play') {
      if (!this.action || ms >= this.action.t1) {
        if (this.action) this.finishAction(ms);
        if (ms < 13000) this.nextAction(ms);
      }
      const a = this.action;
      if (a) {
        const f = Math.max(0, Math.min(1, (ms - a.t0) / Math.max(1, a.t1 - a.t0)));
        this.ballPos.lerpVectors(a.from, a.to, f);
        this.ballPos.y = a.from.y + (a.to.y - a.from.y) * f + Math.sin(f * Math.PI) * a.height;
        if (a.carry) { this.holder.position.set(this.ballPos.x, 0, this.ballPos.z); this.ballPos.y = 2.4; }
      }
    } else {
      // idle: a little warm-up bounce in front of the first player
      const p = this.players[0];
      this.ballPos.set(p.position.x + 1, 1.2 + Math.abs(Math.sin(t * 2.4)) * 2.2, p.position.z + 0.8);
    }
    this.ball.position.copy(this.ballPos);
    if (this.kind === 'frisbee') this.ball.rotation.y += dt * 14;
    else if (mode === 'play') { this.ball.rotation.x += dt * 6; this.ball.rotation.z += dt * 4; }

    if (this.trail.length) {
      this.history.unshift(this.ballPos.clone()); this.history.length = Math.min(this.history.length, 24);
      this.trail.forEach((m, i) => { const h = this.history[(i + 1) * 3]; m.visible = !!h && mode === 'play'; if (h) m.position.copy(h); });
    }

    // players move toward their spot: formation shifted with play, receivers to the ball
    const a = this.action;
    this.players.forEach(p => {
      const u = p.userData;
      let target;
      if (mode !== 'play' || this.mode !== 'play') target = u.form.clone();
      else if (a?.carry && p === this.holder) target = p.position.clone();
      else if (a && (p === a.receiver)) target = a.to.clone().setY(0);
      else if (a?.shooter === p) target = a.from.clone().setY(0);
      else {
        target = u.form.clone();
        if (this.kind !== 'volleyball') { target.x += this.ballPos.x * 0.45; target.z += (this.ballPos.z - target.z) * 0.25; }
        else target.z += (this.ballPos.z - target.z) * 0.2 * (Math.sign(this.ballPos.x) === Math.sign(u.form.x) ? 1 : 0);
      }
      if (this.kind === 'volleyball') target.x = u.team === 0 ? Math.min(-1.2, target.x) : Math.max(1.2, target.x);
      target.x = clampX(target.x); target.z = clampZ(target.z); target.y = 0;
      const d = target.sub(p.position); const dist = d.length();
      const moving = dist > 0.35 && !(a?.carry && p === this.holder);
      if (moving) p.position.addScaledVector(d.normalize(), Math.min(dist, dt * 11));
      const look = moving ? Math.atan2(d.x, d.z) : Math.atan2(this.ballPos.x - p.position.x, this.ballPos.z - p.position.z);
      p.rotation.y += ((((look - p.rotation.y) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 8);
      const jump = this.kind === 'volleyball' && a && p === a.receiver && this.ballPos.y > 3 && this.ballPos.distanceTo(p.position) < 4;
      animateFigure(p, t, { walk: moving || (a?.carry && p === this.holder) ? 1 : 0, cheer: jump ? 0.8 : this.cheer * 0.4 });
    });
  }

  finishAction(ms) {
    const a = this.action;
    if (a.score) {
      a.score.done = true;
      this.score[a.score.team]++;
      this.cheer = 1;
      this.onScore?.(a.score.team);
      this.drawBoard();
      // restart from the middle with the other side
      const other = this.teamPlayers(1 - a.score.team);
      this.holder = other[other.length - 1];
      if (this.kind !== 'volleyball') this.ballPos.set(0, 0.6, 0);
      return;
    }
    if (a.receiver) this.holder = a.receiver;
  }

  drawBoardThrottled(t) { if (!this._bt || t - this._bt > 0.2) { this._bt = t; this.drawBoard(); } }
}
