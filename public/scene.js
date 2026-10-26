// The TV's beach diorama (Handbook Section 13), in three.js. Read-only: it draws what the server says.
import * as THREE from 'three';
import { Sport } from '/sports.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the prototype used (±48, 28) and (±48, −26); pulled in a little so every bar fits a 16:9 TV with the camera below
export const BAR_POS = [[-41, 21], [41, 21], [-45, -22], [45, -22]];
const PATTERNS = ['stripes', 'dots', 'zigzag', 'checks'];
const LETTERS = ['A', 'B', 'C', 'D'];

// weather looks (from the modern skin)
const LOOKS = {
  sunny:    { top: '#7dd8f7', bot: '#cdeffb', sun: 1, sunCol: '#fff6c8', sunSize: 26, clouds: 0.15, cloudCol: '#ffffff', rain: 0, light: 1.25, hemi: 1.0, sea: ['#59c8dd', '#0aa7c2', '#0b6e8e'], sand: '#ffffff', warm: 0 },
  scorcher: { top: '#ffb26b', bot: '#ffe3b3', sun: 1, sunCol: '#ffb347', sunSize: 40, clouds: 0, cloudCol: '#fff3e0', rain: 0, light: 1.45, hemi: 1.05, sea: ['#4fd1d9', '#0796b8', '#075f86'], sand: '#fff1dc', warm: 1 },
  cloud:    { top: '#a8bfcc', bot: '#dde9ef', sun: 0, sunCol: '#ffffff', sunSize: 20, clouds: 1, cloudCol: '#eef2f5', rain: 0, light: 0.7, hemi: 1.05, sea: ['#6fb6c4', '#2f8aa0', '#215f73'], sand: '#e9eef0', warm: 0 },
  cool:     { top: '#bcd9ea', bot: '#ecf6fb', sun: 0, sunCol: '#ffffff', sunSize: 20, clouds: 0.8, cloudCol: '#f7fbfd', rain: 0, light: 0.8, hemi: 1.1, sea: ['#7cc3d3', '#3a95ab', '#286c80'], sand: '#eef6fa', warm: 0, whitecaps: 1 },
  storm:    { top: '#3a4a63', bot: '#6e8098', sun: 0, sunCol: '#ffffff', sunSize: 20, clouds: 1, cloudCol: '#5b6678', rain: 1, light: 0.35, hemi: 0.55, sea: ['#3d6475', '#1f4556', '#132f3d'], sand: '#9aa6b5', warm: 0, whitecaps: 1 },
};

// ------------------------------------------------------------------ shared materials and textures
const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const matCache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap, ...opts });
  matCache.set(key, m);
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.canvas = c;
  return t;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function labelSprite(text, { bg = '#123c4a', fg = '#fff', font = 800, size = 64, pad = 28, letter = null, scale = 0.05 } = {}) {
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `${font} ${size}px Inter, system-ui, sans-serif`;
  const tw = meas.measureText(text).width + (letter ? size * 1.2 : 0);
  const w = Math.ceil(tw + pad * 2), h = Math.ceil(size * 1.6);
  const tex = canvasTex(w, h, (ctx) => {
    ctx.fillStyle = bg; roundRect(ctx, 0, 0, w, h, h / 2); ctx.fill();
    ctx.font = `${font} ${size}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'middle';
    let x = pad;
    if (letter) {
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(x + size * 0.45, h / 2, size * 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.fillText(letter, x + size * 0.45, h / 2 + 2); x += size * 1.2;
    }
    ctx.textAlign = 'left'; ctx.fillStyle = fg; ctx.fillText(text, x, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.scale.set(w * scale, h * scale, 1);
  return s;
}

function patternTexture(pattern, colour) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = colour; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.strokeStyle = 'rgba(255,255,255,.85)';
    if (pattern === 'stripes') for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 16, h);
    if (pattern === 'dots') for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) { ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); }
    if (pattern === 'zigzag') { ctx.lineWidth = 10; for (let y = 16; y < h; y += 40) { ctx.beginPath(); for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + ((x / 16) % 2 ? 12 : 0)); ctx.stroke(); } }
    if (pattern === 'checks') for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? 32 : 0; x < w; x += 64) ctx.fillRect(x, y, 32, 32);
  });
}

// ------------------------------------------------------------------ characters
const G = {
  body: new THREE.CapsuleGeometry(0.85, 1.2, 4, 10),
  head: new THREE.SphereGeometry(1.0, 16, 12),
  eye: new THREE.SphereGeometry(0.13, 6, 6),
  leg: new THREE.CapsuleGeometry(0.32, 0.7, 3, 6),
  hair: new THREE.SphereGeometry(1.03, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
};
const SKINS = ['#f2c7a5', '#e0a982', '#c68a5e', '#8d5a3b', '#f7d8c0', '#b07a52'];
const HAIRS = ['#3b2a20', '#6b4423', '#d9a441', '#1f1f1f', '#a0522d', '#e8d39b'];
const SHIRTS = ['#fef3c7', '#bae6fd', '#fecaca', '#d9f99d', '#e9d5ff', '#fde68a', '#a7f3d0', '#fbcfe8', '#ffffff'];
const JUMPERS = ['#64748b', '#475569', '#7c2d12', '#1e3a8a', '#365314', '#581c87'];
const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b2430' });

export function figure({ shirt = '#ffffff', shorts = '#123c4a', skin, hair, eyes = true, scale = 1, rnd = Math.random } = {}) {
  const g = new THREE.Group();
  skin ||= SKINS[Math.floor(rnd() * SKINS.length)];
  hair ||= HAIRS[Math.floor(rnd() * HAIRS.length)];
  const legs = new THREE.Group();
  for (const s of [-1, 1]) { const l = new THREE.Mesh(G.leg, toon(shorts)); l.position.set(0.42 * s, 0.75, 0); l.castShadow = true; legs.add(l); }
  const body = new THREE.Mesh(G.body, toon(shirt)); body.position.y = 2.25; body.castShadow = true;
  const head = new THREE.Mesh(G.head, toon(skin)); head.position.y = 4.15; head.castShadow = true;
  const hairM = new THREE.Mesh(G.hair, toon(hair)); hairM.position.y = 4.2; hairM.rotation.x = -0.25;
  g.add(legs, body, head, hairM);
  const eyeMeshes = [];
  if (eyes) for (const s of [-1, 1]) { const e = new THREE.Mesh(G.eye, eyeMat); e.position.set(0.36 * s, 4.25, 0.9); g.add(e); eyeMeshes.push(e); }
  g.scale.setScalar(scale);
  g.userData = { body, head, legs, hair: hairM, eyes: eyeMeshes, phase: rnd() * 10, baseScale: scale, shirtMesh: body };
  return g;
}
export function animateFigure(f, t, { walk = 0, bounce = 0.06, cheer = 0 } = {}) {
  const u = f.userData, p = t * (walk ? 9 : 2.2) + u.phase;
  const b = Math.abs(Math.sin(p)) * (walk ? 0.35 : bounce) + cheer * Math.abs(Math.sin(t * 8 + u.phase)) * 1.2;
  u.body.position.y = 2.25 + b; u.head.position.y = 4.15 + b * 1.05;
  u.hair.position.y = 4.2 + b * 1.05;
  for (const e of u.eyes) e.position.y = 4.25 + b * 1.05;
  // squash and stretch
  const sq = 1 + Math.sin(p * 2) * (walk ? 0.05 : 0.02);
  u.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  if (walk) { u.legs.children[0].rotation.x = Math.sin(p) * 0.6; u.legs.children[1].rotation.x = -Math.sin(p) * 0.6; }
  else { u.legs.children[0].rotation.x = 0; u.legs.children[1].rotation.x = 0; }
}

// ------------------------------------------------------------------ the scene
export class Beach {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, devicePixelRatio));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#cdeffb', 160, 330);
    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 1, 600);
    this.camBase = new THREE.Vector3(0, 50, 76);     // handbook reference (0, 44, 68); raised to fit all four bars
    this.lookBase = new THREE.Vector3(0, 0, -4);
    this.camNudge = new THREE.Vector3(); this.camNudgeTarget = new THREE.Vector3(); this.pull = 0; this.pullTarget = 0;
    this.orbit = 0; this.mode = 'lobby';
    this.clock = new THREE.Clock(); this.t = 0;
    this.bars = [null, null, null, null];
    this.tierLevel = 0; this.frames = []; this.lowSince = 0;
    this.look = { ...LOOKS.sunny }; this.lookTarget = LOOKS.sunny; this.weatherType = 'sunny';
    this.day = null;
    this.build();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole beach in frame on narrow screens
    this.camera.fov = w / h < 1.7 ? 52 * (1.78 / (w / h)) ** 0.6 : 52;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- build
  build() {
    const S = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#f3d8a4', 1.0); S.add(this.hemi);
    const sun = this.sunLight = new THREE.DirectionalLight('#fff4dd', 1.25);
    sun.position.set(-40, 90, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -110, right: 110, top: 70, bottom: -70, near: 10, far: 260 });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.4;
    S.add(sun);

    this.buildSand(); this.buildSea(); this.buildSky(); this.buildProps();
    this.buildCrowd(); this.buildRain(); this.buildEvents();
    this.sport = new Sport(S, { toon, figure, animateFigure, labelSprite, canvasTex });
  }

  buildSand() {
    const geo = new THREE.PlaneGeometry(320, 110, 128, 50); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 19);
    const pos = geo.attributes.position, col = [], a = new THREE.Color('#ffe9c4'), b = new THREE.Color('#f3d8a4'), wet = new THREE.Color('#d9b97c');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const onPitch = Math.abs(x) < 22 && Math.abs(z) < 12;
      const bump = onPitch ? 0 : (Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.07 + z * 0.11)) * 0.22;
      const slope = z < -26 ? (z + 26) * 0.12 : 0;   // dips into the sea
      pos.setY(i, bump + slope);
      const c = a.clone().lerp(b, 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.29) * Math.cos(z * 0.07));
      if (z < -30) c.lerp(wet, Math.min(1, (-30 - z) / 4));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.sandMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, color: '#ffffff' });
    const sand = new THREE.Mesh(geo, this.sandMat); sand.receiveShadow = true; this.scene.add(sand);
  }

  buildSea() {
    const geo = new THREE.PlaneGeometry(420, 200, 84, 40); geo.rotateX(-Math.PI / 2); geo.translate(0, -0.6, -134);
    this.seaGeo = geo; this.seaBase = Float32Array.from(geo.attributes.position.array);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.seaMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, transparent: true, opacity: 0.96 });
    this.sea = new THREE.Mesh(geo, this.seaMat); this.sea.receiveShadow = true; this.scene.add(this.sea);
    this.paintSea(LOOKS.sunny.sea);
    // foam line that laps in and out
    const foamTex = canvasTex(256, 32, (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); });
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(220, 2.4), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false }));
    this.foam.rotation.x = -Math.PI / 2; this.foam.position.set(0, -0.15, -33); this.scene.add(this.foam);
    // three layers of rolling wave crests
    this.crests = [0, 1, 2].map(i => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(230, 1.1), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0.6, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.userData.phase = i / 3; this.scene.add(m); return m;
    });
  }
  paintSea(cols) {
    const [light, mid, deep] = cols.map(c => new THREE.Color(c));
    const pos = this.seaGeo.attributes.position, col = this.seaGeo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const z = this.seaBase[i * 3 + 2], f = Math.min(1, (-34 - z) / 120);
      const c = f < 0.25 ? light.clone().lerp(mid, f / 0.25) : mid.clone().lerp(deep, (f - 0.25) / 0.75);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  buildSky() {
    // sun with a halo, low in the sky band above the horizon
    const halo = canvasTex(256, 256, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,250,220,.9)'); g.addColorStop(0.5, 'rgba(255,230,160,.25)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: '#fff6c8', fog: false, depthWrite: false, transparent: true }));
    this.sun.position.set(110, 34, -300); this.sun.scale.set(70, 70, 1); this.sun.renderOrder = -1; this.scene.add(this.sun);
    // clouds: puffs of flattened spheres
    this.clouds = [];
    const puff = new THREE.SphereGeometry(1, 14, 10);
    this.cloudMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap, transparent: true, opacity: 0.9, fog: false });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 4 + (i % 3);
      for (let j = 0; j < n; j++) { const m = new THREE.Mesh(puff, this.cloudMat); m.position.set(j * 4 - n * 2, Math.sin(j * 1.7) * 1.4, Math.cos(j) * 2); m.scale.set(5 + (j % 2) * 2, 3 + (j % 3), 4); c.add(m); }
      const far = i < 9;
      c.position.set(-200 + i * 32 + (i % 2) * 11, far ? 26 + (i % 4) * 5 : 58 + (i % 3) * 4, far ? -250 - (i % 3) * 20 : -60 - (i % 4) * 25);
      c.scale.setScalar(far ? 1.6 : 1.1);
      c.userData = { speed: 1.2 + (i % 5) * 0.4, far };
      this.scene.add(c); this.clouds.push(c);
    }
  }

  buildProps() {
    const S = this.scene;
    // palm tree
    const palm = this.palm = new THREE.Group();
    const trunkM = toon('#a0703f');
    for (let i = 0; i < 9; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.75 - i * 0.04, 0.85 - i * 0.04, 2.2, 8), trunkM); seg.position.set(Math.sin(i * 0.2) * i * 0.45, 1.1 + i * 2.05, 0); seg.rotation.z = -0.06 * i; seg.castShadow = true; palm.add(seg); }
    const leafM = toon('#2f9e44', { side: THREE.DoubleSide });
    const top = new THREE.Group(); top.position.set(3.6, 19, 0);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.6, 11, 4, 1, true), leafM);
      leaf.geometry.translate(0, 5.5, 0); leaf.scale.set(1, 1, 0.25);
      leaf.rotation.set(0, (i / 7) * Math.PI * 2, 1.9); leaf.castShadow = true; top.add(leaf);
    }
    for (let i = 0; i < 3; i++) { const nut = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), toon('#5b3a1e')); nut.position.set(Math.cos(i * 2) * 0.8, -0.6, Math.sin(i * 2) * 0.8); top.add(nut); }
    palm.add(top); palm.userData.top = top;
    palm.position.set(-62, 0, -12); S.add(palm);
    const palm2 = palm.clone(); palm2.userData = { top: palm2.children[palm2.children.length - 1] };
    palm2.position.set(66, 0, -6); palm2.scale.setScalar(0.85); palm2.rotation.y = 2; S.add(palm2);
    this.palm2 = palm2;

    // sunbathers on towels with parasols along the shoreline strip
    this.sunbathers = new THREE.Group(); S.add(this.sunbathers);
    const towelCols = ['#ff6b5e', '#14b8a6', '#f59e0b', '#8b5cf6', '#38bdf8', '#f472b6', '#facc15'];
    const xs = [-30, -20, -8, 6, 17, 28, -62, 62, -74, 76];
    xs.forEach((x, i) => {
      const g = new THREE.Group();
      const towel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 6.4), toon(towelCols[i % towelCols.length])); towel.receiveShadow = true; g.add(towel);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.13, 0.7), toon('#ffffff')); stripe.position.z = 1.6; g.add(stripe);
      const f = figure({ shirt: SHIRTS[i % SHIRTS.length], eyes: false, scale: 0.8 }); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.85, 2.4); g.add(f);
      if (i % 2 === 0) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), toon('#e5e7eb')); pole.position.set(2.2, 3.5, 0); g.add(pole);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 10), toon(towelCols[(i + 3) % towelCols.length])); shade.position.set(2.2, 7, 0); shade.castShadow = true; g.add(shade);
      }
      g.position.set(x, 0.05, -27.5 - (i % 3) * 1.2); g.rotation.y = (i % 2 ? 0.3 : -0.25);
      g.userData.figure = f;
      this.sunbathers.add(g);
    });

    // trophy and bunting for the Beach Cup Final
    this.finalProps = new THREE.Group(); this.finalProps.visible = false; S.add(this.finalProps);
    const gold = toon('#f5c542', { emissive: '#5a4300' });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 3.6), toon('#ffffff')); plinth.position.y = 1.2; plinth.castShadow = true;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.6, 2.6, 16, 1, true), gold); cup.position.y = 4.9;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 1.2, 10), gold); stem.position.y = 3.0;
    const trophy = new THREE.Group(); trophy.add(plinth, cup, stem); trophy.position.set(-27, 0, -9); this.finalProps.add(trophy);
    this.trophy = trophy;
    const flagCols = ['#ff6b5e', '#14b8a6', '#f59e0b', '#8b5cf6', '#ffffff'];
    for (const z of [-12, 12]) {
      for (let i = 0; i < 22; i++) {
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 3), toon(flagCols[i % 5])); tri.rotation.x = Math.PI;
        const x = -21 + i * 2; tri.position.set(x, 6.4 - Math.sin((i / 21) * Math.PI) * 1.2, z); this.finalProps.add(tri);
      }
      for (const x of [-22, 22]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7.5, 6), toon('#e5e7eb')); p.position.set(x, 3.75, z); this.finalProps.add(p); }
    }
  }

  buildCrowd() {
    // spectators around the pitch (outside the keep-out zone)
    this.spectators = [];
    const spots = [];
    for (let i = 0; i < 14; i++) spots.push([-20 + i * 3.1, 15 + (i % 2) * 2.6]);
    for (let i = 0; i < 8; i++) spots.push([-24 - (i % 2) * 2.6, -8 + i * 2.4]);
    for (let i = 0; i < 8; i++) spots.push([24 + (i % 2) * 2.6, -8 + i * 2.4]);
    spots.forEach(([x, z], i) => {
      const f = figure({ shirt: SHIRTS[i % SHIRTS.length], shorts: ['#123c4a', '#1e3a8a', '#7c2d12', '#334155'][i % 4], eyes: i % 3 === 0, scale: 0.85 });
      f.position.set(x, 0, z); f.lookAt(0, 0, 0);
      f.userData.home = new THREE.Vector3(x, 0, z); f.userData.shirt = SHIRTS[i % SHIRTS.length]; f.userData.jumper = JUMPERS[i % JUMPERS.length];
      this.scene.add(f); this.spectators.push(f);
    });
  }

  buildRain() {
    const n = 2200, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 220, y = Math.random() * 70, z = -60 + Math.random() * 130;
      pos.set([x, y, z, x - 0.5, y - 2.4, z + 0.3], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c7d6e6', transparent: true, opacity: 0.55, fog: false }));
    this.rain.visible = false; this.scene.add(this.rain);
    this.flash = 0; this.nextFlash = 3;
  }

  buildEvents() {
    // rival juice van with a giant smoothie on its roof
    const van = this.van = new THREE.Group();
    const bodyM = toon('#f472b6'), white = toon('#ffffff'), dark = toon('#1f2937');
    const box = new THREE.Mesh(new THREE.BoxGeometry(12, 5.5, 5.6), bodyM); box.position.y = 4; box.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3.8, 5.4), white); cab.position.set(7.4, 3.2, 0); cab.castShadow = true;
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 5.5), toon('#93c5fd')); win.position.set(8.4, 4, 0);
    van.add(box, cab, win);
    for (const [x, z] of [[-4, 2.9], [4.5, 2.9], [-4, -2.9], [4.5, -2.9]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 14), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 1.2, z); van.add(w); }
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.5, 4.2, 14), toon('#fb7185')); cup.position.set(-1, 9, 0);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(2.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#fde68a')); lid.position.set(-1, 11.1, 0);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), toon('#22c55e')); straw.position.set(-0.2, 13.2, 0); straw.rotation.z = -0.3;
    van.add(cup, lid, straw);
    const sign = labelSprite('JUICE!', { bg: '#fde047', fg: '#9d174d', scale: 0.045 }); sign.position.set(0, 6, 3.2); van.add(sign);
    van.visible = false; this.scene.add(van);

    // seven gulls
    this.gulls = [];
    const gm = toon('#ffffff'), gw = toon('#e5e7eb', { side: THREE.DoubleSide }), beak = toon('#f59e0b');
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), gm); b.scale.set(1.8, 0.8, 0.8);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), gm); h.position.set(1.4, 0.4, 0);
      const k = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 5), beak); k.rotation.z = -Math.PI / 2; k.position.set(2.1, 0.35, 0);
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), gw); wl.geometry.translate(0, 1.6, 0); wl.rotation.x = -Math.PI / 2;
      const wr = wl.clone(); wr.rotation.x = Math.PI / 2;
      g.add(b, h, k, wl, wr); g.userData = { wl, wr, phase: i * 0.9 }; g.visible = false; g.castShadow = true;
      this.scene.add(g); this.gulls.push(g);
    }
  }

  // ---------------------------------------------------------------- bars
  setBars(bars) {
    const seen = new Set();
    for (const b of bars) {
      seen.add(b.slot);
      let bar = this.bars[b.slot];
      if (!bar) bar = this.bars[b.slot] = this.makeBar(b);
      if (bar.name !== b.bar) this.renameBar(bar, b.bar);
      bar.staffCount = b.staff;
      this.setStaff(bar, b.staff);
      this.setBoarded(bar, b.status === 'out');
    }
    this.bars.forEach((bar, i) => { if (bar && !seen.has(i)) { this.scene.remove(bar.group); this.bars[i] = null; } });
  }

  makeBar(b) {
    const g = new THREE.Group();
    const [x, z] = BAR_POS[b.slot];
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, -z);
    const wood = toon('#c98b4f'), woodL = toon('#e7b57a'), white = toon('#ffffff'), colour = toon(b.colour);
    const add = (geo, m, px, py, pz) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(px, py, pz); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
    add(new THREE.BoxGeometry(10, 0.3, 6), woodL, 0, 0.15, 0);                    // floor
    add(new THREE.BoxGeometry(10, 3.2, 0.5), wood, 0, 1.6, 2.75);                  // counter front
    const front = add(new THREE.BoxGeometry(10.6, 0.4, 2), woodL, 0, 3.4, 2.6);     // counter top
    add(new THREE.BoxGeometry(0.5, 3.2, 6), wood, -4.75, 1.6, 0);                   // sides
    add(new THREE.BoxGeometry(0.5, 3.2, 6), wood, 4.75, 1.6, 0);
    add(new THREE.BoxGeometry(10, 7.5, 0.5), wood, 0, 3.75, -2.75);                 // back wall
    for (const px of [-4.8, 4.8]) add(new THREE.CylinderGeometry(0.28, 0.28, 7.5, 8), white, px, 3.75, 2.9);
    // stripe panel in the bar's colour on the counter front (pattern = second cue)
    const pat = patternTexture(PATTERNS[b.slot], b.colour);
    const panel = add(new THREE.PlaneGeometry(9, 2.4), new THREE.MeshToonMaterial({ map: pat, gradientMap }), 0, 1.7, 3.01);
    panel.castShadow = false;
    // roof with patterned awning and scalloped edge
    const roofTex = patternTexture(PATTERNS[b.slot], b.colour); roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping; roofTex.repeat.set(3, 2);
    const roofMat = new THREE.MeshToonMaterial({ map: roofTex, gradientMap });
    const roof = add(new THREE.BoxGeometry(11.6, 0.5, 8), roofMat, 0, 7.75, 0.6); roof.rotation.x = 0.12;
    const scallops = [];
    const scGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.3, 14, 1, false, 0, Math.PI);
    scGeo.rotateZ(-Math.PI / 2); scGeo.rotateY(Math.PI / 2);      // a half disc hanging down, facing the front
    for (let i = 0; i < 8; i++) scallops.push(add(scGeo, i % 2 ? white : colour, -5.05 + i * 1.44, 7.05, 4.62));
    // flag
    const pole = add(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), white, 4.6, 10.8, -2.6);
    const flagGeo = new THREE.PlaneGeometry(3.4, 2.1, 10, 2); flagGeo.translate(1.7, 0, 0);
    const flagTex = canvasTex(128, 80, (ctx, w, h) => { ctx.fillStyle = b.colour; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = '900 60px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(LETTERS[b.slot], w / 2, h / 2 + 4); });
    const flag = add(flagGeo, new THREE.MeshToonMaterial({ map: flagTex, gradientMap, side: THREE.DoubleSide }), 4.7, 12.7, -2.6);
    flag.userData.base = Float32Array.from(flagGeo.attributes.position.array);
    // a cocktail on the counter
    const glass = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.1, 14, 1, true), new THREE.MeshToonMaterial({ color: '#e0f7ff', gradientMap, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); bowl.rotation.x = Math.PI; bowl.position.y = 1.15;
    const drink = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.85, 14), toon(b.colour)); drink.rotation.x = Math.PI; drink.position.y = 1.05;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 0.6, 8), toon('#e0f7ff')); stem.position.y = 0.3;
    const brolly = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.35, 8), toon('#facc15')); brolly.position.set(0.35, 1.95, 0); brolly.rotation.z = -0.4;
    const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), toon('#dc2626')); cherry.position.set(-0.3, 1.7, 0);
    glass.add(bowl, drink, stem, brolly, cherry); glass.position.set(-3, 3.6, 2.6); glass.scale.setScalar(1.3); g.add(glass);
    // boards for bankruptcy
    const boards = new THREE.Group(); boards.visible = false; g.add(boards);
    const plankM = toon('#8b5a2b');
    for (const [rz, y] of [[0.35, 4], [-0.35, 4], [0, 1.5], [0, 6]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.9, 0.3), plankM); p.position.set(0, y, 3.4); p.rotation.z = rz; p.castShadow = true; boards.add(p); }
    const closed = labelSprite('CLOSED', { bg: '#7f1d1d', scale: 0.04 }); closed.position.set(0, 5.4, 3.8); boards.add(closed);

    // name badge floating above, in the player's colour, with the seat letter
    const badge = labelSprite(b.bar, { bg: b.colour, letter: LETTERS[b.slot], scale: 0.04 }); badge.position.set(0, 16.5, 0); g.add(badge);
    // price board (appears at match start)
    const price = labelSprite('15p', { bg: '#1f2937', fg: '#fde68a', size: 72, scale: 0.042 }); price.position.set(-6.2, 2.6, 5.4); price.visible = false; g.add(price);
    const easel = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 4), toon('#8b5a2b')); easel.position.set(-6.2, 1.3, 5.4); easel.rotation.y = Math.PI / 4; easel.castShadow = true; g.add(easel);

    this.scene.add(g);
    const bar = { slot: b.slot, colour: b.colour, name: b.bar, group: g, badge, price, flag, boards, roofMat, scallops, glass,
      staff: [], queue: [], leavers: [], staffCount: 0, pop: 0, boarded: false, front: new THREE.Vector3(0, 0, 1).applyEuler(g.rotation) };
    g.scale.setScalar(0.01);
    return bar;
  }

  renameBar(bar, name) {
    bar.group.remove(bar.badge);
    bar.badge = labelSprite(name, { bg: bar.colour, letter: LETTERS[bar.slot], scale: 0.04 }); bar.badge.position.set(0, 16.5, 0);
    bar.group.add(bar.badge); bar.name = name;
  }

  setStaff(bar, n) {
    n = bar.boarded ? 0 : n;
    while (bar.staff.length < n) {
      const i = bar.staff.length;
      const f = figure({ shirt: '#ffffff', shorts: '#334155', scale: 0.92 });
      // apron in the bar's colour
      const apron = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.2), toon(bar.colour)); apron.position.set(0, 2.0, 0.85); f.add(apron);
      f.position.set(-3.4 + (i % 4) * 2.3, 0.3, i < 4 ? 0.8 : -1.2);
      f.userData.pop = 0;
      bar.group.add(f); bar.staff.push(f);
    }
    while (bar.staff.length > n) bar.group.remove(bar.staff.pop());
  }

  setBoarded(bar, out) {
    if (bar.boarded === out) return;
    bar.boarded = out;
    bar.boards.visible = out;
    bar.roofMat.color.set(out ? '#9ca3af' : '#ffffff');
    bar.glass.visible = !out;
    if (out) { this.setStaff(bar, 0); this.setQueue(bar, 0); bar.price.visible = false; }
  }

  setQueue(bar, n) {
    while (bar.queue.length < n) {
      const i = bar.queue.length;
      const f = figure({ shirt: bar.colour, shorts: ['#123c4a', '#1f2937', '#ffffff'][i % 3], scale: 0.9 });
      f.userData.pop = 0; f.userData.slotIdx = i;
      this.scene.add(f); bar.queue.push(f);
    }
    while (bar.queue.length > n) {
      const f = bar.queue.shift();
      // the front customer walks off with a drink
      const drink = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 10), toon(bar.colour)); drink.rotation.x = Math.PI; drink.position.set(0.9, 3, 0.7); f.add(drink);
      const dir = bar.front.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 2.2);
      f.userData.leave = { dir, t: 0 };
      bar.leavers.push(f);
    }
  }
  queueSpot(bar, i) {
    const p = bar.group.position, f = bar.front;
    const side = new THREE.Vector3(-f.z, 0, f.x);
    const d = 5.2 + i * 2.1;
    return new THREE.Vector3(p.x + f.x * d + side.x * Math.sin(i * 1.7) * 0.7, 0, p.z + f.z * d + side.z * Math.sin(i * 1.7) * 0.7);
  }

  // ---------------------------------------------------------------- weather
  setWeather(type, instant = false) {
    this.weatherType = type;
    this.lookTarget = LOOKS[type];
    this.paintSea(LOOKS[type].sea);
    this.rain.visible = !!LOOKS[type].rain;
    this.cloudMat.color.set(LOOKS[type].cloudCol);
    this.sun.material.color.set(LOOKS[type].sunCol);
    this.spectators.forEach(f => f.userData.shirtMesh.material = toon(type === 'cool' || type === 'storm' ? f.userData.jumper : f.userData.shirt));
    if (instant || REDUCED) this.look = { ...LOOKS[type] };
    document.documentElement.style.setProperty('--sky-top', LOOKS[type].top);
    document.documentElement.style.setProperty('--sky-bot', LOOKS[type].bot);
  }

  // ---------------------------------------------------------------- the day
  /** Start playing the day script. now() returns server time; startAt is when the script's t = 0. */
  playDay(script, startAt, now, hooks = {}) {
    this.day = { script, startAt, now, hooks, served: {}, chimes: [], chimeIdx: 0, eventFired: false, scoreIdx: 0 };
    const total = script.bars.reduce((s, b) => s + b.saleTimesMs.length, 0);
    const n = total ? Math.min(12, Math.max(1, Math.round(total / 8))) : 0;
    for (let i = 0; i < n; i++) this.day.chimes.push(1000 + (12000 * (i + 0.5)) / n);
    for (const b of script.bars) {
      const bar = this.bars[b.slot]; if (!bar) continue;
      this.day.served[b.slot] = 0;
      bar.group.remove(bar.price);
      bar.price = labelSprite(`${b.price}p`, { bg: '#1f2937', fg: '#fde68a', size: 72, scale: 0.042 }); bar.price.position.set(-6.2, 2.6, 5.4);
      bar.price.visible = false; bar.price.userData.pop = 0; bar.group.add(bar.price);
    }
    this.sport.startMatch(script.fixture, script);
    this.finalProps.visible = script.fixture.big === 'Beach Cup Final';
  }
  stopDay() { this.day = null; this.sport.idle(); this.van.visible = false; this.gulls.forEach(g => g.visible = false); }
  hidePrices() { this.bars.forEach(b => b && (b.price.visible = false)); }
  setFixture(fixture) { if (fixture) { this.sport.setSport(fixture.sport, fixture); this.finalProps.visible = fixture.big === 'Beach Cup Final'; } }

  /** What the TV overlays need each frame: per-bar served counts and screen positions. */
  dayState() {
    if (!this.day) return null;
    const t = this.day.now() - this.day.startAt;
    const out = {};
    for (const b of this.day.script.bars) out[b.slot] = { served: b.saleTimesMs.filter(x => x <= t).length, mixed: b.mixed, colour: b.colour, bar: b.bar };
    return { t, bars: out };
  }

  screenPos(slot, y = 19) {
    const bar = this.bars[slot]; if (!bar) return null;
    const v = bar.group.position.clone(); v.y = y;
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }

  // ---------------------------------------------------------------- per frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.t += dt;
    this.qualityCheck(dt);

    // weather blend
    const L = this.look, T = this.lookTarget, k = 1 - Math.exp(-dt * 2.5);
    for (const key of ['sun', 'sunSize', 'clouds', 'light', 'hemi', 'warm']) L[key] += (T[key] - L[key]) * k;
    this.sunLight.intensity = L.light; this.hemi.intensity = L.hemi;
    this.sunLight.color.set(L.warm > 0.5 ? '#ffd9a8' : '#fff4dd');
    this.sun.material.opacity = L.sun; this.sun.scale.setScalar(L.sunSize * 2.6);
    this.cloudMat.opacity = 0.15 + 0.8 * L.clouds;
    this.scene.fog.color.set(T.bot);
    this.clouds.forEach((c, i) => { c.visible = L.clouds > 0.05 || i % 4 === 0; c.position.x += dt * c.userData.speed * (REDUCED ? 0.3 : 1); if (c.position.x > 230) c.position.x = -230; });

    // sea: three layers of rolling waves
    const calm = REDUCED ? 0.35 : 1, rough = (T.whitecaps ? 1.6 : 1) * calm;
    const pos = this.seaGeo.attributes.position, base = this.seaBase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      pos.setY(i, base[i * 3 + 1] + (Math.sin(x * 0.05 + t * 0.9 + z * 0.12) * 0.35 + Math.sin(x * 0.11 - t * 1.3) * 0.18 + Math.sin(z * 0.2 + t * 1.7) * 0.22) * rough);
    }
    pos.needsUpdate = true;
    this.foam.position.z = -33 + Math.sin(t * 0.8) * 1.4 * calm;
    this.foam.material.opacity = 0.7 + Math.sin(t * 0.8) * 0.25;
    this.crests.forEach(c => { const f = (t / 7 + c.userData.phase) % 1; c.position.set(0, -0.1, -75 + f * 40); c.material.opacity = Math.sin(f * Math.PI) * 0.6 * (T.whitecaps ? 1 : 0.7); });

    // palms sway, flags ripple
    for (const p of [this.palm, this.palm2]) p.userData.top && (p.userData.top.rotation.z = Math.sin(t * 0.9) * 0.05 * rough);
    for (const bar of this.bars) {
      if (!bar) continue;
      bar.pop = Math.min(1, bar.pop + dt * 1.8);
      const e = bar.pop, s = e >= 1 ? 1 : 1 + Math.sin(e * Math.PI * 2.5) * (1 - e) * 0.35 - (1 - e) * 0.6;
      bar.group.scale.setScalar(Math.max(0.01, s));
      const fg = bar.flag.geometry.attributes.position, fb = bar.flag.userData.base;
      for (let i = 0; i < fg.count; i++) { const x = fb[i * 3]; fg.setZ(i, Math.sin(x * 1.4 - t * 5) * 0.25 * x / 3.4 * rough); }
      fg.needsUpdate = true;
      bar.staff.forEach((f, i) => { animateFigure(f, t, { bounce: this.mode === 'planning' ? 0.18 : 0.08 }); f.rotation.y = Math.sin(t * 1.3 + i) * (this.mode === 'planning' ? 0.6 : 0.2); });
    }

    // rain and lightning
    if (this.rain.visible) {
      const rp = this.rain.geometry.attributes.position;
      for (let i = 0; i < rp.count; i += 2) {
        let y = rp.getY(i) - dt * 70; if (y < 0) y += 70;
        rp.setY(i, y); rp.setY(i + 1, y - 2.4);
      }
      rp.needsUpdate = true;
      if (!REDUCED && (this.nextFlash -= dt) < 0) { this.flash = 1; this.nextFlash = 2.5 + Math.random() * 3; this.onThunder?.(); }
    }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 4); this.hemi.intensity = L.hemi + this.flash * 2.2; }

    this.updateDay(t, dt);

    // spectators
    const storm = this.day && this.weatherType === 'storm';
    const cheer = this.sport.cheer;
    this.spectators.forEach((f, i) => {
      const u = f.userData;
      if (storm) {
        const away = new THREE.Vector3(Math.sign(u.home.x || 1) * 120, 0, 60);
        const d = away.sub(f.position); const run = d.length() > 1;
        if (run) { d.normalize(); f.position.addScaledVector(d, dt * 14); f.rotation.y = Math.atan2(d.x, d.z); }
        animateFigure(f, t, { walk: run ? 1 : 0 });
      } else {
        const d = u.home.clone().sub(f.position);
        if (d.length() > 0.3) { f.position.addScaledVector(d.normalize(), dt * 14); animateFigure(f, t, { walk: 1 }); f.rotation.y = Math.atan2(d.x, d.z); }
        else { f.lookAt(this.sport.ballPos.x, 0, this.sport.ballPos.z); animateFigure(f, t, { cheer: cheer * ((i % 3) ? 1 : 0.5) }); }
      }
    });
    this.sunbathers.children.forEach((g, i) => { g.visible = !storm; const f = g.userData.figure; f.position.y = 0.85 + Math.sin(t * 1.5 + i) * 0.03; });

    this.sport.update(t, dt, storm ? 'storm' : this.day ? 'play' : 'idle', this.day ? this.day.now() - this.day.startAt : 0);

    // camera: gentle drift, slow orbit in the lobby, pull back for results, nudge toward events
    this.camNudge.lerp(this.camNudgeTarget, 1 - Math.exp(-dt * 1.5));
    this.pull += (this.pullTarget - this.pull) * (1 - Math.exp(-dt * 1.5));
    if (this.mode === 'lobby' && !REDUCED) this.orbit += dt * 0.08; else this.orbit *= Math.exp(-dt * 1.2);
    const drift = REDUCED ? 0 : 1.6;
    const ang = Math.sin(this.orbit) * 0.32;
    const cb = this.camBase.clone().sub(this.lookBase).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(this.lookBase);
    cb.y += this.pull * 5; cb.z += this.pull * 7;
    this.camera.position.set(cb.x + Math.sin(t * 0.21) * drift + this.camNudge.x * 0.4, cb.y + Math.sin(t * 0.17) * drift * 0.5, cb.z + Math.cos(t * 0.13) * drift);
    this.camera.lookAt(this.lookBase.x + this.camNudge.x, this.lookBase.y, this.lookBase.z + this.camNudge.z);

    this.renderer.render(this.scene, this.camera);
  }

  updateDay(t, dt) {
    const day = this.day;
    // bars' queues follow the script; with no day running, the beach is calm
    for (const bar of this.bars) {
      if (!bar) continue;
      let qn = 0;
      if (day && !bar.boarded) {
        const b = day.script.bars.find(x => x.slot === bar.slot);
        const st = day.now() - day.startAt;
        if (b) {
          const sold = b.saleTimesMs.length, served = b.saleTimesMs.filter(x => x <= st).length, rem = sold - served;
          qn = sold === 0 ? 0 : rem > 0 ? Math.max(1, Math.ceil(rem / Math.max(1, sold / 6))) : 0;
          if (served > (day.served[bar.slot] || 0)) day.hooks.onSale?.(bar.slot, served);
          day.served[bar.slot] = served;
          if (st > 300 && !bar.price.visible) { bar.price.visible = true; bar.price.userData.pop = 0; }
        }
      }
      if (bar.queue.length !== qn) this.setQueue(bar, qn);
      bar.queue.forEach((f, i) => {
        const target = this.queueSpot(bar, i);
        const d = target.sub(f.position); const dist = d.length();
        if (f.userData.pop === 0) { f.position.copy(this.queueSpot(bar, i).add(bar.front.clone().multiplyScalar(22)).add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, 0))); }
        f.userData.pop = Math.min(1, f.userData.pop + dt * 2);
        if (dist > 0.2) { f.position.addScaledVector(d.normalize(), Math.min(dist, dt * 12)); f.rotation.y = Math.atan2(d.x, d.z); animateFigure(f, t, { walk: 1 }); }
        else { f.lookAt(bar.group.position.x, 0, bar.group.position.z); animateFigure(f, t, { bounce: 0.1 }); }
      });
      bar.leavers = bar.leavers.filter(f => {
        const L = f.userData.leave; L.t += dt;
        f.position.addScaledVector(L.dir, dt * 10); f.rotation.y = Math.atan2(L.dir.x, L.dir.z);
        animateFigure(f, t, { walk: 1 });
        const s = f.userData.baseScale * Math.max(0, 1 - Math.max(0, L.t - 1.2) / 0.6);
        f.scale.setScalar(s);
        if (L.t > 1.8) { this.scene.remove(f); return false; }
        return true;
      });
      if (bar.price.visible) { bar.price.userData.pop = Math.min(1, (bar.price.userData.pop || 0) + dt * 3); const p = bar.price.userData.pop; const base = bar.price.userData.base ||= bar.price.scale.clone(); bar.price.scale.copy(base).multiplyScalar(p < 1 ? 1 + Math.sin(p * Math.PI) * 0.3 : 1); }
    }
    if (!day) { this.camNudgeTarget.set(0, 0, 0); return; }
    const st = day.now() - day.startAt;
    while (day.chimeIdx < day.chimes.length && st >= day.chimes[day.chimeIdx]) { day.chimeIdx++; day.hooks.onChime?.(); }
    const ev = day.script.event;
    // events
    this.van.visible = false; this.gulls.forEach(g => g.visible = false);
    this.camNudgeTarget.set(0, 0, 0);
    if (ev && st >= ev.atMs) {
      if (!day.eventFired) { day.eventFired = true; day.hooks.onEvent?.(ev); this.sport.onEvent(ev.type); }
      const et = (st - ev.atMs) / 1000;
      if (ev.type === 'van') {
        this.van.visible = true;
        const x = Math.min(29, -120 + et * 45);      // parks between the scoreboard and the back-right bar
        this.van.position.set(x, 0, -23); this.van.rotation.y = 0;
        this.van.children.slice(3, 7).forEach(w => w.rotation.y = 0);
        this.camNudgeTarget.set(x * 0.25, 0, -4);
      }
      if (ev.type === 'gulls' && et < 7) {
        this.gulls.forEach((g, i) => {
          g.visible = true;
          const a = et * 1.4 + (i / 7) * Math.PI * 2, swoop = Math.max(0, Math.sin(et * 1.8 + i)) ;
          const r = 22 + Math.sin(i * 3) * 8;
          g.position.set(Math.cos(a) * r * 1.6, 22 - swoop * 15 + Math.sin(et * 3 + i) * 1.5, Math.sin(a) * r * 0.7);
          g.rotation.y = -a - Math.PI / 2; g.rotation.z = -swoop * 0.5;
          const flap = Math.sin(et * 14 + g.userData.phase) * 0.7; g.userData.wl.rotation.y = flap; g.userData.wr.rotation.y = -flap;
        });
        this.camNudgeTarget.set(0, 0, 2);
      }
    }
  }

  qualityCheck(dt) {
    // quality tiers: drop shadows, then resolution, if the frame rate sags
    // measured over the last two seconds, whatever the frame rate
    this.frames.push(dt);
    let sum = this.frames.reduce((a, b) => a + b, 0);
    while (sum > 2 && this.frames.length > 1) sum -= this.frames.shift();
    if (sum < 1.5) return;
    const fps = this.frames.length / sum;
    this.fps = fps;
    if (fps < 45) { this.lowSince += dt; if (this.lowSince > 3) { this.lowSince = 0; this.frames = []; this.lowerQuality(); } }
    else this.lowSince = 0;
  }
  lowerQuality() {
    if (this.tierLevel >= 3) return;
    this.tierLevel++;
    if (this.tierLevel === 1) { this.renderer.setPixelRatio(1); this.resize(); }
    if (this.tierLevel === 2) { this.renderer.shadowMap.enabled = false; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    if (this.tierLevel === 3) { this.renderer.setPixelRatio(0.75); this.resize(); this.rain.geometry.setDrawRange(0, 1200); }
  }
}
