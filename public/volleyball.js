// Beach volleyball on match days (Handbook Section 13, now the only fixture). Cosmetic only: the set score comes
// from the server's day script and the choreography from its seed.
//
// Rallies are simple projectile physics: every touch launches the ball on a parabola that ends exactly where the
// next player will meet it, so players can run to the right spot ahead of time. Touches follow the real pattern:
// serve, bump (pass), set, spike, then a dig on the other side or a point.
import * as THREE from 'three';

export const COURT = { hx: 16, hz: 8 };          // half length (along x, net at x = 0) and half width
const NET_TOP = 5.0, GRAV = 30, PLAYER_SCALE = 0.9;
const HOME = { shirt: '#ffffff', shorts: '#0ea5e9' }, AWAY = { shirt: '#1f2937', shorts: '#facc15' };
const side = team => (team === 0 ? -1 : 1);       // home plays on the left (x < 0)

function mulberry(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// arm poses: [left x, right x], [left z, right z]  (x < 0 swings a hand forward/up; z < 0 lifts the left arm out)
const POSES = {
  ready:     [[-0.75, -0.75], [-0.28, 0.28]],
  bump:      [[-1.2, -1.2], [0.32, -0.32]],
  dig:       [[-1.35, -1.35], [0.35, -0.35]],
  set:       [[-2.95, -2.95], [0.28, -0.28]],
  spikeLoad: [[-2.5, -3.2], [-0.15, 0.25]],
  spikeHit:  [[-1.4, -0.7], [-0.15, 0.1]],
  serveLoad: [[-2.3, -3.1], [-0.1, 0.25]],
  block:     [[-3.05, -3.05], [0.12, -0.12]],
  celebrate: [[-2.8, -2.8], [-0.55, 0.55]],
  sad:       [[-0.1, -0.1], [-0.08, 0.08]],
  run:       null,
};

export class Volleyball {
  constructor(scene, h) {
    this.scene = scene; this.h = h;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.cheer = 0; this.sets = [0, 0]; this.points = [0, 0]; this.flashText = null;
    this.mode = 'warmup'; this.clock = 0; this.fixture = null;
    this.rnd = mulberry(1);
    this.buildCourt(); this.buildBoard(); this.buildPlayers();
    const ballMat = this.h.toon('#ffffff').clone(); ballMat.map = this.ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), ballMat);
    this.ball.castShadow = true; this.group.add(this.ball);
    this.shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false }));
    this.shadowBlob.rotation.x = -Math.PI / 2; this.group.add(this.shadowBlob);
    this.trail = Array.from({ length: 7 }, (_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45 - i * 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#fef9c3', transparent: true, opacity: 0.35 - i * 0.045, depthWrite: false })); this.group.add(m); return m; });
    this.history = [];
    this.newRally(0, true);
  }

  ballTexture() {
    return this.h.canvasTex(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#fde047'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2563eb'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse((i + 0.5) * w / 3, h / 2, w / 12, h / 2, 0, 0, 7); ctx.fill(); }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(i * w / 6, 0); ctx.lineTo(i * w / 6, h); ctx.stroke(); }
    });
  }

  buildCourt() {
    const { toon, canvasTex } = this.h, G = this.group, { hx, hz } = COURT;
    // a raked sand court, a shade lighter than the beach
    const rake = canvasTex(256, 256, (ctx, w, h) => { ctx.fillStyle = '#fff6e4'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = 'rgba(200,160,100,.18)'; ctx.lineWidth = 3; for (let x = 0; x < w; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, h); ctx.stroke(); } });
    rake.wrapS = rake.wrapT = THREE.RepeatWrapping; rake.repeat.set(5, 3);
    const floorMat = toon('#ffffff').clone(); floorMat.map = rake;          // keeps the cartoon shading ramp
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 + 4, hz * 2 + 4), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; floor.receiveShadow = true; G.add(floor);
    // boundary tapes
    const tape = toon('#2563eb');
    const strip = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), tape); m.position.set(x, 0.1, z); m.receiveShadow = true; G.add(m); };
    strip(hx * 2, 0.4, 0, -hz); strip(hx * 2, 0.4, 0, hz); strip(0.4, hz * 2, -hx, 0); strip(0.4, hz * 2, hx, 0);
    // net, posts, antennae
    const white = toon('#ffffff');
    for (const z of [-hz - 1, hz + 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, NET_TOP + 1, 10), toon('#e5e7eb')); p.position.set(0, (NET_TOP + 1) / 2, z); p.castShadow = true; G.add(p);
      const guy = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 4), toon('#94a3b8')); guy.position.set(0, 3, z + Math.sign(z) * 2.2); guy.rotation.x = Math.sign(z) * 0.75; G.add(guy);
    }
    const netTex = canvasTex(512, 64, (ctx, w, h) => { ctx.strokeStyle = 'rgba(20,20,20,.75)'; ctx.lineWidth = 2; for (let x = 0; x <= w; x += 9) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y <= h; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, 8); ctx.fillRect(0, h - 4, w, 4); });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(hz * 2 + 2, 1.9), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    net.rotation.y = Math.PI / 2; net.position.set(0, NET_TOP - 0.95, 0); G.add(net);
    for (const z of [-hz, hz]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), toon('#ef4444')); a.position.set(0, NET_TOP + 0.3, z); G.add(a); }
    const centre = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, hz * 2), white); centre.position.y = 0.09; G.add(centre);
    // umpire's chair
    const chair = new THREE.Group();
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 5), toon('#e5e7eb')); l.position.set(x, 2, z); chair.add(l); }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1.6), toon('#0ea5e9')); seat.position.y = 4; chair.add(seat);
    const ump = this.h.figure({ shirt: '#111827', shorts: '#111827', scale: 0.75 }); ump.position.y = 4.1; ump.rotation.y = Math.PI; chair.add(ump);
    chair.position.set(0, 0, -hz - 2.4); G.add(chair); this.umpire = ump;
  }

  buildBoard() {
    const { toon, canvasTex } = this.h;
    this.boardTex = canvasTex(768, 220, () => {});
    const board = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(18, 5.15), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    face.position.set(0, 8.8, 0.26);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(18.8, 5.9, 0.5), toon('#123c4a')); frame.position.y = 8.8; frame.castShadow = true;
    for (const x of [-7, 7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), toon('#123c4a')); p.position.set(x, 3, 0); board.add(p); }
    board.add(frame, face); board.position.set(0, 0, -COURT.hz - 12.5);
    this.group.add(board);
    this.drawBoard();
  }

  drawBoard() {
    const c = this.boardTex.userData.canvas, ctx = c.getContext('2d'), w = c.width, h = c.height;
    ctx.fillStyle = '#0b2530'; ctx.fillRect(0, 0, w, h);
    const away = (this.fixture?.away || 'Away').toUpperCase();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = '800 44px Inter, system-ui, sans-serif'; ctx.fillStyle = '#e0f2fe';
    ctx.fillText('HOME', w * 0.18, 66); ctx.fillText(away.length > 12 ? away.slice(0, 12) : away, w * 0.82, 66);
    ctx.font = '900 96px Inter, system-ui, sans-serif'; ctx.fillStyle = '#fde68a';
    ctx.fillText(`${this.sets[0]} – ${this.sets[1]}`, w / 2, 76);
    ctx.font = '700 36px Inter, system-ui, sans-serif';
    if (this.flashText && Math.floor(performance.now() / 400) % 2 === 0) { ctx.fillStyle = '#ff8a5e'; ctx.fillText(this.flashText, w / 2, 176); }
    else if (this.mode === 'match') { ctx.fillStyle = '#7dd3fc'; ctx.fillText(`${(this.fixture?.big || 'League match').toUpperCase()} · SETS · POINTS ${this.points[0]}–${this.points[1]}`, w / 2, 176); }
    else { ctx.fillStyle = '#7dd3fc'; ctx.fillText(`${(this.fixture?.big || 'Beach Volleyball League').toUpperCase()} · ${this.mode === 'done' ? 'FULL TIME' : 'WARM-UP'}`, w / 2, 176); }
    this.boardTex.needsUpdate = true;
  }

  buildPlayers() {
    this.players = [];
    for (let team = 0; team < 2; team++) for (let i = 0; i < 2; i++) {
      const kit = team ? AWAY : HOME;
      const f = this.h.figure({ shirt: kit.shirt, shorts: kit.shorts, scale: PLAYER_SCALE, detail: 'full' });
      const p = { f, team, idx: i, pos: new THREE.Vector3(side(team) * 8, 0, i ? 3.5 : -3.5), vel: new THREE.Vector3(), target: new THREE.Vector3(), yaw: team ? -Math.PI / 2 : Math.PI / 2,
        jump: null, pose: 'ready', poseUntil: 0, lean: 0 };
      p.target.copy(p.pos); f.position.copy(p.pos);
      this.group.add(f); this.players.push(p);
    }
    this.servers = [0, 0];
  }

  // ---------------------------------------------------------------- fixture lifecycle
  setMatch(fixture) {
    const was = this.group.visible;
    this.fixture = fixture;
    this.group.visible = !!fixture;
    if (fixture && !was) { this.abandoned = false; this.mode = 'warmup'; this.sets = [0, 0]; this.points = [0, 0]; this.flashText = null; this.rnd = mulberry(fixture.seed || 7); this.newRally(0, true); }
    this.drawBoard();
  }
  startMatch(fixture) {
    if (!fixture?.match) { this.setMatch(null); return; }
    this.setMatch(fixture);
    this.mode = 'match'; this.sets = [0, 0]; this.points = [0, 0]; this.flashText = null;
    this.rnd = mulberry(fixture.seed || 1);
    // when each set is won, spread through the 13-second day
    this.abandoned = false;
    // an abandoned match (seagulls or a storm) never finishes: no sets are awarded
    const final = fixture.abandoned ? [0, 0] : fixture.score || [2, 1];
    const order = [...Array(final[0]).fill(0), ...Array(final[1]).fill(1)];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    // the match winner takes the last set
    const winner = final[0] > final[1] ? 0 : 1, li = order.lastIndexOf(winner);
    if (li >= 0) [order[li], order[order.length - 1]] = [order[order.length - 1], order[li]];
    this.schedule = order.map((team, i) => ({ team, at: 2500 + (9800 * (i + 1)) / order.length, done: false }));
    this.ms = 0;
    this.newRally(winner === 0 ? 1 : 0, false);
    this.drawBoard();
  }
  endMatch() { if (this.mode === 'match') { this.mode = 'done'; this.flashText = this.abandoned ? 'MATCH ABANDONED' : null; this.drawBoard(); } }
  onEvent(type) {
    if (this.mode !== 'match') return;
    if (type === 'extra') { this.flashText = 'THIRD SET!'; this.cheer = 1; }
    if (type === 'gulls' || type === 'storm') { this.abandoned = true; this.flashText = 'MATCH ABANDONED'; this.drawBoard(); }
  }

  // ---------------------------------------------------------------- the rally engine
  newRally(team, quick) {
    this.rally = { touches: 0, len: 0 };
    this.servingTeam = team;
    const srv = this.players.filter(p => p.team === team)[this.servers[team]];
    this.servers[team] = 1 - this.servers[team];
    this.server = srv;
    // everyone to their spots; the server walks back behind the baseline with the ball
    for (const p of this.players) {
      const s = side(p.team);
      if (p === srv) p.target.set(s * (COURT.hx + 1.6), 0, p.idx ? 2.5 : -2.5);
      else if (p.team === team) p.target.set(s * 6, 0, srv.idx ? -3 : 3);
      else p.target.set(s * 9, 0, p.idx ? 3.8 : -3.8);
      if (quick) { p.pos.copy(p.target); p.vel.set(0, 0, 0); }
      p.pose = 'ready';
    }
    for (const p of this.players) { p.contactAt = null; p.approach = null; p.blockAt = null; }
    this.flight = null;
    this.waitUntil = this.clock + (quick ? 0.6 : 1.9);
    this.state = 'preserve';
  }

  /** Launch the ball from p0 to p1 in T seconds, lifting T if needed so it clears the net when it crosses. */
  launch(p0, p1, T, end, { minClear = 0.6 } = {}) {
    const crosses = Math.sign(p0.x) !== Math.sign(p1.x);
    for (let k = 0; k < 20; k++) {
      const v = new THREE.Vector3((p1.x - p0.x) / T, (p1.y - p0.y) / T + 0.5 * GRAV * T, (p1.z - p0.z) / T);
      if (!crosses) { this.flight = { p0: p0.clone(), v, T, t0: this.clock, end }; break; }
      const tc = (0 - p0.x) / v.x, yc = p0.y + v.y * tc - 0.5 * GRAV * tc * tc;
      if (yc > NET_TOP + minClear || k === 19) { this.flight = { p0: p0.clone(), v, T, t0: this.clock, end }; break; }
      T += 0.06;
    }
    const f = this.flight;
    f.to = p1.clone();
    // the player who plays the next touch heads to where the ball will be
    if (end.player) {
      const s = side(end.player.team);
      end.player.target.set(p1.x - s * 0.7, 0, p1.z);
      end.player.contactAt = this.clock + f.T;
    }
    this.history.length = 0;
    this.rally.len++;
    return f;
  }

  forcedWinner() {
    if (this.mode !== 'match') return null;
    const s = this.schedule.find(x => !x.done);
    return s && this.ms >= s.at - 1800 ? s.team : null;
  }

  /** The ball has reached a player: they play their touch and the ball flies on. */
  touch(p, action) {
    const r = this.rnd, s = side(p.team), mate = this.players.find(q => q.team === p.team && q !== p);
    const foes = this.players.filter(q => q.team !== p.team);
    const from = this.ballPos.clone();
    this.posePlayer(p, action === 'pass' ? (from.y < 1.8 ? 'dig' : 'bump') : action === 'set' ? 'set' : action === 'spike' ? 'spikeHit' : 'bump', 0.35);
    if (action === 'pass') {
      // bump up to the setter's spot near the net
      const to = new THREE.Vector3(s * (2.2 + r() * 0.8), 4.3, (r() - 0.5) * 4);
      this.launch(from, to, 1.0 + r() * 0.15, { player: mate, action: 'set' });
      // the passer becomes the hitter: back off to start the approach
      p.target.set(s * 7.5, 0, (r() < 0.5 ? -1 : 1) * (2 + r() * 2));
      this.defend(p.team);
    } else if (action === 'set') {
      const z = (mate.target.z > 0 ? 1 : -1) * (2 + r() * 3);
      const to = new THREE.Vector3(s * (1.6 + r() * 0.6), 6.6, z);
      this.launch(from, to, 0.95, { player: mate, action: 'spike' });
      mate.approach = { from: mate.pos.clone(), jumpAt: this.clock + 0.95 - 0.42 };
      p.target.set(s * 3, 0, -z * 0.5);
      this.block(p.team, z);
    } else if (action === 'spike') {
      const forced = this.forcedWinner();
      const kill = forced === p.team || (forced === null && (r() < 0.3 + this.rally.len * 0.05));
      const target = new THREE.Vector3(-s * (4 + r() * 10), 0, (r() - 0.5) * 13);
      if (kill) {
        target.y = 0.6;
        this.launch(from, target, 0.48, { floor: true, winner: p.team }, { minClear: 0.2 });
        for (const f of foes) f.target.lerp(target.clone().setY(0), 0.5);   // a diving lunge that just misses
      } else {
        const defender = foes.reduce((a, b) => (a.pos.distanceTo(target) < b.pos.distanceTo(target) ? a : b));
        target.y = 1.4;
        this.launch(from, target, 0.55, { player: defender, action: 'pass' }, { minClear: 0.2 });
        defender.approach = null;
      }
      p.target.set(s * 4, 0, p.pos.z);
    }
    this.rally.touches++;
  }

  defend(team) {
    // the other side drops back, ready to dig
    for (const q of this.players) if (q.team !== team && !q.contactAt) q.target.set(side(q.team) * 8.5, 0, q.idx ? 3.5 : -3.5);
  }
  block(team, z) {
    // one opponent steps up to the net to block, the other covers deep
    const foes = this.players.filter(q => q.team !== team);
    const blocker = foes.reduce((a, b) => (Math.abs(a.pos.z - z) < Math.abs(b.pos.z - z) ? a : b));
    const cover = foes.find(q => q !== blocker);
    blocker.target.set(side(blocker.team) * 1.3, 0, z * 0.9);
    blocker.blockAt = this.clock + 0.95 - 0.12;
    cover.target.set(side(cover.team) * 9, 0, -z * 0.4);
  }

  posePlayer(p, pose, hold) { p.pose = pose; p.poseUntil = this.clock + hold; }

  get ballPos() { return this.ball.position; }

  pointWon(team) {
    this.points[team]++;
    this.cheer = this.mode === 'match' ? 1 : 0.35;
    this.onScore?.(team);
    if (this.mode === 'match') {
      const s = this.schedule.find(x => !x.done);
      if (s && s.team === team && this.ms >= s.at - 1800) { s.done = true; this.sets[team]++; this.points = [0, 0]; this.onSet?.(team); }
    }
    for (const p of this.players) this.posePlayer(p, p.team === team ? 'celebrate' : 'sad', 1.4);
    for (const p of this.players) if (p.team === team) p.jump = { t0: this.clock + 0.1 + p.idx * 0.15, dur: 0.5, h: 1.2 };
    this.drawBoard();
  }

  // ---------------------------------------------------------------- per frame
  update(t, dt, { storm = false, ms = 0 } = {}) {
    if (!this.group.visible) return;
    this.clock += dt; this.ms = ms;
    this.cheer = Math.max(0, this.cheer - dt * 0.6);
    if (this.flashText) this.drawBoardThrottled(t);
    const { animateFigure, poseArms } = this.h;

    if (storm) {
      // the match stops and everyone runs for cover
      this.players.forEach((p, i) => p.target.set((i % 2 ? 1 : -1) * 80, 0, 50));
      this.flight = null; this.state = 'storm';
      if (this.ballPos.y > 0.6) this.ballPos.y = Math.max(0.6, this.ballPos.y - dt * 12);
    } else if (this.state === 'storm') this.newRally(0, false);

    // late in the day, award any sets still owed so the board ends on the real score
    if (this.mode === 'match' && ms > 12700) for (const s of this.schedule) if (!s.done) { s.done = true; this.sets[s.team]++; this.drawBoard(); }

    // ---- the ball
    if (this.state === 'preserve' && !storm) {
      const srv = this.server;
      this.ballPos.set(srv.pos.x - side(srv.team) * 0.6, 3.2 + Math.abs(Math.sin(this.clock * 6)) * 0.3, srv.pos.z + 0.6);
      if (this.clock >= this.waitUntil && srv.pos.distanceTo(srv.target) < 0.6) {
        // toss, then serve
        this.state = 'toss'; this.tossAt = this.clock;
        this.posePlayer(srv, 'serveLoad', 0.6);
      }
    } else if (this.state === 'toss') {
      const srv = this.server, k = (this.clock - this.tossAt) / 0.55;
      this.ballPos.set(srv.pos.x - side(srv.team) * 0.5, 3.4 + Math.sin(Math.min(1, k) * Math.PI * 0.85) * 3.2, srv.pos.z + 0.3);
      if (k >= 1) {
        const r = this.rnd, foes = this.players.filter(q => q.team !== srv.team);
        const recv = foes[Math.floor(r() * 2)], s = side(recv.team);
        const forced = this.forcedWinner();
        this.posePlayer(srv, 'spikeHit', 0.35);
        this.state = 'rally';
        if (forced === null && r() < 0.06) {
          // an ace into the corner
          const to = new THREE.Vector3(s * (COURT.hx - 1.5), 0.6, (r() < 0.5 ? -1 : 1) * (COURT.hz - 1));
          this.launch(this.ballPos, to, 1.15, { floor: true, winner: srv.team });
          recv.target.set(to.x - s * 1.5, 0, to.z * 0.8);
        } else {
          const to = new THREE.Vector3(s * (9 + r() * 4), 2.0, (r() - 0.5) * 11);
          this.launch(this.ballPos, to, 1.3, { player: recv, action: 'pass' });
        }
        srv.target.set(side(srv.team) * 8, 0, srv.pos.z * 0.5);
      }
    } else if (this.state === 'rally' && this.flight) {
      const f = this.flight, tt = Math.min(f.T, this.clock - f.t0);
      this.ballPos.set(f.p0.x + f.v.x * tt, f.p0.y + f.v.y * tt - 0.5 * GRAV * tt * tt, f.p0.z + f.v.z * tt);
      this.ball.rotation.x += dt * 9; this.ball.rotation.z += dt * 5;
      if (this.clock - f.t0 >= f.T) {
        const end = f.end; this.flight = null;
        if (end.floor) {
          this.state = 'dead'; this.deadAt = this.clock;
          this.bounce = { v: new THREE.Vector3(f.v.x * 0.35, Math.abs(f.v.y - GRAV * f.T) * 0.35, f.v.z * 0.35) };
          this.pointWon(end.winner);
          this.nextServe = end.winner;
        } else {
          end.player.contactAt = null;
          this.touch(end.player, end.action);
        }
      }
    } else if (this.state === 'dead') {
      // the ball bounces and rolls to a stop, then the winners serve
      const b = this.bounce;
      b.v.y -= GRAV * dt; this.ballPos.addScaledVector(b.v, dt);
      if (this.ballPos.y < 0.6) { this.ballPos.y = 0.6; b.v.y = Math.abs(b.v.y) * 0.45; b.v.x *= 0.7; b.v.z *= 0.7; }
      if (this.clock - this.deadAt > 1.9) this.newRally(this.nextServe, false);
    }
    this.shadowBlob.position.set(this.ballPos.x, 0.12, this.ballPos.z);
    this.shadowBlob.scale.setScalar(Math.max(0.4, 1.2 - this.ballPos.y * 0.06));
    // a soft trail on hard-hit balls
    this.history.unshift(this.ballPos.clone()); if (this.history.length > 21) this.history.pop();
    const fast = this.flight && this.flight.T < 0.7;
    this.trail.forEach((m, i) => { const hp = this.history[(i + 1) * 3]; m.visible = !!hp && fast; if (hp) m.position.copy(hp); });

    // ---- the players: a critically damped spring toward their target, so starts and stops are smooth
    const K = 55, D = 2 * Math.sqrt(K), MAX = 15;
    for (const p of this.players) {
      // the hitter's approach: hold back, then run in so the jump lands on the set
      const acc = p.target.clone().sub(p.pos).multiplyScalar(K).addScaledVector(p.vel, -D);
      p.vel.addScaledVector(acc, dt);
      const sp = p.vel.length(); if (sp > MAX) p.vel.multiplyScalar(MAX / sp);
      p.pos.addScaledVector(p.vel, dt);
      if (!storm) { const s = side(p.team); p.pos.x = s < 0 ? Math.min(-0.9, p.pos.x) : Math.max(0.9, p.pos.x); }
      // jumps: spikers just before contact, blockers as the spike goes up
      if (p.approach && this.clock >= p.approach.jumpAt) { p.jump = { t0: this.clock, dur: 0.82, h: 2.3 }; p.approach = null; this.posePlayer(p, 'spikeLoad', 0.42); }
      if (p.blockAt && this.clock >= p.blockAt) { p.jump = { t0: this.clock, dur: 0.75, h: 1.9 }; p.blockAt = null; this.posePlayer(p, 'block', 0.7); }
      let y = 0;
      if (p.jump) { const k = (this.clock - p.jump.t0) / p.jump.dur; if (k >= 1) p.jump = null; else if (k > 0) y = p.jump.h * 4 * k * (1 - k); }
      p.f.position.set(p.pos.x, y, p.pos.z);
      // face where you're running when sprinting, otherwise watch the ball
      const moving = sp > 2.2 && y === 0;
      const want = moving ? Math.atan2(p.vel.x, p.vel.z) : Math.atan2(this.ballPos.x - p.pos.x, this.ballPos.z - p.pos.z);
      let d = want - p.yaw; d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      p.yaw += d * Math.min(1, dt * 10);
      p.f.rotation.y = p.yaw;
      // anticipate: raise the arms for the coming touch a moment before the ball arrives
      if (p.contactAt && p.contactAt - this.clock < 0.3 && this.flight?.end.player === p) {
        const a = this.flight.end.action;
        p.pose = a === 'set' ? 'set' : a === 'spike' ? 'spikeLoad' : this.flight.to.y < 1.8 ? 'dig' : 'bump'; p.poseUntil = this.clock + 0.4;
      }
      if (this.clock > p.poseUntil && p.pose !== 'ready') p.pose = 'ready';
      const pose = moving && p.pose === 'ready' ? null : POSES[p.pose];
      animateFigure(p.f, t, { walk: moving ? 1 : 0, bounce: p.pose === 'ready' ? 0.1 : 0.02, arms: !pose, dt });
      if (pose) poseArms(p.f, pose[0], pose[1], dt, p.pose === 'spikeHit' ? 30 : 16);
      // lean into digs, crouch when ready
      const lean = p.pose === 'dig' ? 0.45 : p.pose === 'bump' ? 0.25 : p.pose === 'ready' ? 0.12 : 0;
      p.lean += (lean - p.lean) * Math.min(1, dt * 10);
      p.f.userData.torso.rotation.x = p.lean;
    }
    // the umpire follows the ball
    this.umpire.rotation.y = Math.PI + Math.atan2(this.ballPos.x, 2) * 0.4;
  }

  drawBoardThrottled(t) { if (!this._bt || t - this._bt > 0.2) { this._bt = t; this.drawBoard(); } }
}
