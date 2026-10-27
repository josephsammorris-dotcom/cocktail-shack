// The TV's beach diorama (Handbook Section 13), in three.js. Read-only: it draws what the server says.
import * as THREE from 'three';
import { Volleyball, COURT } from '/volleyball.js';
import { mergeGeometries } from '/vendor/BufferGeometryUtils.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the prototype used (±48, 28) and (±48, −26); pulled in a little so every bar fits a 16:9 TV with the camera below
export const BAR_POS = [[-41, 21], [41, 21], [-45, -22], [45, -22]];
const PATTERNS = ['stripes', 'dots', 'zigzag', 'checks'];
const LETTERS = ['A', 'B', 'C', 'D'];
const SHORE = -31;                       // where sand meets sea

// weather looks (from the modern skin). `people` scales how busy the beach is; `crowd` is the match crowd factor.
const LOOKS = {
  sunny:    { top: '#5ec4ef', bot: '#cdeffb', sun: 1, sunCol: '#fff6c8', sunSize: 34, clouds: 0.25, cloudCol: '#ffffff', rain: 0, light: 1.25, hemi: 1.0, sea: ['#5fd0df', '#11a9c4', '#0a6f90'], warm: 0, people: 1, crowd: 1 },
  scorcher: { top: '#ff9f55', bot: '#ffe3b3', sun: 1, sunCol: '#ffb347', sunSize: 52, clouds: 0.05, cloudCol: '#fff3e0', rain: 0, light: 1.45, hemi: 1.05, sea: ['#58d8dd', '#0a9cbc', '#086389'], warm: 1, people: 1.2, crowd: 1 },
  cloud:    { top: '#93adbc', bot: '#dde9ef', sun: 0, sunCol: '#ffffff', sunSize: 24, clouds: 1, cloudCol: '#eef2f5', rain: 0, light: 0.7, hemi: 1.05, sea: ['#78bcc8', '#3c8fa4', '#245f74'], warm: 0, people: 0.45, crowd: 0.8 },
  cool:     { top: '#a9cde3', bot: '#ecf6fb', sun: 0, sunCol: '#ffffff', sunSize: 24, clouds: 0.85, cloudCol: '#f7fbfd', rain: 0, light: 0.8, hemi: 1.1, sea: ['#86c8d6', '#4198ad', '#2b6c80'], warm: 0, whitecaps: 1, people: 0.2, crowd: 0.7 },
  storm:    { top: '#2f3d55', bot: '#6e8098', sun: 0, sunCol: '#ffffff', sunSize: 24, clouds: 1, cloudCol: '#566175', rain: 1, light: 0.35, hemi: 0.55, sea: ['#44707f', '#22495a', '#14303d'], warm: 0, whitecaps: 1, people: 0, crowd: 0.25 },
};
// how full the stands are for each kind of fixture
const STAGE_CROWD = { league: 0.55, semi: 0.78, final: 1 };

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
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData.canvas = c;
  return t;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ------------------------------------------------------------------ draw-call savers
// Many small static parts become one mesh with the colours baked into its vertices, so a laptop's integrated
// graphics can keep 60 fps with a full beach.
const _c = new THREE.Color();
function bakeColour(geo, colour, matrix) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  if (matrix) g.applyMatrix4(matrix);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  _c.set(colour).convertSRGBToLinear();
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const vcMat = side => toon('#ffffff', { vertexColors: true, side });
/** Replace a group's plain-coloured child meshes with one vertex-coloured mesh per material side. */
/** A price sign: a wooden board on a stick, with the price painted on a canvas texture. */
function makePriceSign(colour) {
  const g = new THREE.Group();
  const wood = toon('#8b5a2b');
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5.2, 8), wood); post.position.y = 2.6; post.castShadow = true;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.8, 0.3), wood); frame.position.y = 5.6; frame.castShadow = true;
  const tex = canvasTex(256, 160, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 2.5), new THREE.MeshBasicMaterial({ map: tex })); face.position.set(0, 5.6, 0.16);
  g.add(post, frame, face);
  g.userData.tex = tex;
  paintPriceSign(g, 15, colour);
  return g;
}
function paintPriceSign(sign, price, colour) {
  const tex = sign.userData.tex, c = tex.userData.canvas, ctx = c.getContext('2d'), w = c.width, h = c.height;
  ctx.fillStyle = '#fff6e0'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = colour; ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = '#fff'; ctx.font = '900 30px Inter, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🍹 COCKTAILS', w / 2, 22);
  ctx.fillStyle = '#123c4a'; ctx.font = `900 ${String(price).length > 2 ? 90 : 100}px Inter, system-ui`;
  ctx.fillText(`${price}p`, w / 2, 104);
  tex.needsUpdate = true;
}

function mergeStatic(group) {
  const bySide = new Map();
  for (const m of [...group.children]) {
    const mat = m.material;
    if (!m.isMesh || !mat?.isMeshToonMaterial || mat.map || mat.transparent || mat.vertexColors || m.userData.keep) continue;
    m.updateMatrix();
    const list = bySide.get(mat.side) || []; list.push({ geo: bakeColour(m.geometry, '#' + mat.color.getHexString(), m.matrix), cast: m.castShadow });
    bySide.set(mat.side, list);
    group.remove(m);
  }
  for (const [sideV, list] of bySide) {
    const mesh = new THREE.Mesh(mergeGeometries(list.map(x => x.geo)), vcMat(sideV));
    mesh.castShadow = list.some(x => x.cast); mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
// a small seeded random for textures and layout, so the beach looks the same every time
function seeded(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function labelSprite(text, { bg = '#123c4a', fg = '#fff', font = 800, size = 64, pad = 28, letter = null, img = null, initials = null, scale = 0.05 } = {}) {
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `${font} ${size}px Inter, system-ui, sans-serif`;
  const ph = img || initials ? size * 2.2 : 0;          // a photo (or initials) makes the badge taller, so it reads on a TV
  const tw = meas.measureText(text).width + (ph ? ph + size * 0.35 : letter ? size * 1.2 : 0);
  const w = Math.ceil(tw + pad * 2), h = Math.ceil(Math.max(size * 1.6, ph + 12));
  const tex = canvasTex(w, h, (ctx) => {
    ctx.fillStyle = bg; roundRect(ctx, 0, 0, w, h, h / 2); ctx.fill();
    ctx.font = `${font} ${size}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'middle';
    let x = pad;
    if (img || initials) {
      const r = ph / 2, cx = x + r - 8, cy = h / 2;
      if (img) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip(); ctx.drawImage(img, cx - r, cy - r, ph, ph); ctx.restore(); }
      else {
        // no photo: the player's initials in the same circle
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
        ctx.fillStyle = fg; ctx.font = `900 ${Math.round(size * (initials.length > 1 ? 1.05 : 1.3))}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.fillText(initials, cx, cy + 3);
        ctx.font = `${font} ${size}px Inter, system-ui, sans-serif`; ctx.textAlign = 'left';
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, 7); ctx.stroke();
      x += ph + size * 0.2;
    } else if (letter) {
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

// Sand: fine grain, a few shell fragments and soft wind ripples. Tiles seamlessly.
function sandTexture() {
  const t = canvasTex(512, 512, (ctx, w, h) => {
    const r = seeded(11);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    // wind ripples: wavy bands, drawn three times across the seam so they tile
    for (let band = 0; band < 14; band++) {
      const y0 = (band / 14) * h, amp = 6 + r() * 6, ph = r() * 6;
      ctx.strokeStyle = `rgba(190,150,90,${0.07 + r() * 0.05})`; ctx.lineWidth = 5 + r() * 4;
      for (const dy of [-h, 0, h]) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + dy + Math.sin((x / w) * Math.PI * 4 + ph) * amp);
        ctx.stroke();
      }
    }
    // grain
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * 34 + (r() < 0.02 ? -40 : 0) + (r() < 0.015 ? 30 : 0);
      d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.95)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.8));
    }
    ctx.putImageData(img, 0, 0);
    // shell bits and pebbles
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h, s = 1.5 + r() * 3;
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,245,235,.9)' : 'rgba(170,135,95,.55)';
      ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); ctx.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Water: soft light patches and short glinting crests. Mostly white so it tints the sea's own colours.
function waterTexture() {
  const t = canvasTex(512, 512, (ctx, w, h) => {
    const r = seeded(23);
    ctx.fillStyle = '#e4eef2'; ctx.fillRect(0, 0, w, h);
    const blob = (x, y, rx, ry, a) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rx); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, rx, ry, 0, 0, 7); ctx.fill(); } };
    ctx.fillStyle = '#cfdfe6'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) blob(r() * w, r() * h, 30 + r() * 60, 10 + r() * 20, 0.35 + r() * 0.25);
    // long darker swell troughs
    for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h; for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.fillStyle = 'rgba(120,155,175,.45)'; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 50 + r() * 50, 5 + r() * 4, 0, 0, 7); ctx.fill(); } }
    // glints: short curved white strokes
    ctx.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const x = r() * w, y = r() * h, len = 8 + r() * 22;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + r() * 0.45})`; ctx.lineWidth = 1.5 + r() * 2.5;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.beginPath(); ctx.moveTo(x + dx - len / 2, y + dy); ctx.quadraticCurveTo(x + dx, y + dy - 4, x + dx + len / 2, y + dy); ctx.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------ characters
const G = {
  body: new THREE.CapsuleGeometry(0.85, 1.2, 4, 10),
  head: new THREE.SphereGeometry(1.0, 16, 12),
  eye: new THREE.SphereGeometry(0.13, 6, 6),
  leg: new THREE.CapsuleGeometry(0.32, 0.7, 3, 6),
  arm: new THREE.CapsuleGeometry(0.24, 1.15, 3, 6).translate(0, -0.78, 0),
  hair: new THREE.SphereGeometry(1.03, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
};
const SKINS = ['#f2c7a5', '#e0a982', '#c68a5e', '#8d5a3b', '#f7d8c0', '#b07a52'];
const HAIRS = ['#3b2a20', '#6b4423', '#d9a441', '#1f1f1f', '#a0522d', '#e8d39b'];
export const SHIRTS = ['#fef3c7', '#bae6fd', '#fecaca', '#d9f99d', '#e9d5ff', '#fde68a', '#a7f3d0', '#fbcfe8', '#ffffff', '#fdba74', '#93c5fd'];
// jumpers for chilly days: bright knits, not near-black (toon shading darkens colours a lot)
const JUMPERS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#0ea5e9', '#84cc16'];
const eyeMat = new THREE.MeshBasicMaterial({ color: '#1b2430' });

const simpleGeoCache = new Map();
function simpleBodyGeo(shirt, shorts, skin, hair, eyes) {
  const key = [shirt, shorts, skin, hair, eyes].join('|');
  if (simpleGeoCache.has(key)) return simpleGeoCache.get(key);
  const M = (x, y, z, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1));
  const parts = [bakeColour(G.leg, shorts, M(-0.42, 0.75, 0)), bakeColour(G.leg, shorts, M(0.42, 0.75, 0)),
    bakeColour(G.body, shirt, M(0, 2.25, 0)), bakeColour(G.head, skin, M(0, 4.15, 0)), bakeColour(G.hair, hair, M(0, 4.2, 0, -0.25))];
  if (eyes) parts.push(bakeColour(G.eye, '#1b2430', M(-0.36, 4.25, 0.9)), bakeColour(G.eye, '#1b2430', M(0.36, 4.25, 0.9)));
  const geo = mergeGeometries(parts);
  simpleGeoCache.set(key, geo);
  return geo;
}

/** A chunky cartoon person. Arms hang from shoulder pivots: rotation.x < 0 swings a hand forward and up.
 *  `detail: 'simple'` (the default) bakes legs, body and head into one mesh: three draw calls a person.
 *  `detail: 'full'` keeps separate legs that swing, for the volleyball players. */
export function figure({ shirt = '#ffffff', shorts = '#123c4a', skin, hair, eyes = true, arms = true, scale = 1, shadow = true, detail = 'simple', rnd = Math.random } = {}) {
  const g = new THREE.Group();
  skin ||= SKINS[Math.floor(rnd() * SKINS.length)];
  hair ||= HAIRS[Math.floor(rnd() * HAIRS.length)];
  if (detail === 'simple') {
    const torso = new THREE.Group();
    const body = new THREE.Mesh(simpleBodyGeo(shirt, shorts, skin, hair, eyes), vcMat(THREE.FrontSide)); body.castShadow = shadow;
    torso.add(body);
    const armPivots = [];
    if (arms) for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(1.0 * s, 3.05, 0); pivot.rotation.z = 0.12 * s;
      pivot.add(new THREE.Mesh(G.arm, toon(skin))); torso.add(pivot); armPivots.push(pivot);
    }
    g.add(torso);
    g.scale.setScalar(scale);
    g.userData = { simple: true, body, legs: new THREE.Group(), torso, arms: armPivots, phase: rnd() * 10, baseScale: scale, armX: [0, 0], armZ: [0, 0],
      setShirt: c => { body.geometry = simpleBodyGeo(c, shorts, skin, hair, eyes); } };
    return g;
  }
  const legs = new THREE.Group();
  for (const s of [-1, 1]) { const l = new THREE.Mesh(G.leg, toon(shorts)); l.position.set(0.42 * s, 0.75, 0); legs.add(l); }
  const torso = new THREE.Group();                 // everything above the hips, so it can bob and lean together
  const body = new THREE.Mesh(G.body, toon(shirt)); body.position.y = 2.25; body.castShadow = shadow;
  const head = new THREE.Mesh(G.head, toon(skin)); head.position.y = 4.15; head.castShadow = shadow;
  const hairM = new THREE.Mesh(G.hair, toon(hair)); hairM.position.y = 4.2; hairM.rotation.x = -0.25;
  torso.add(body, head, hairM);
  const armPivots = [];
  if (arms) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(1.0 * s, 3.05, 0); pivot.rotation.z = 0.12 * s;
    pivot.add(new THREE.Mesh(G.arm, toon(skin))); torso.add(pivot); armPivots.push(pivot);
  }
  if (eyes) for (const s of [-1, 1]) { const e = new THREE.Mesh(G.eye, eyeMat); e.position.set(0.36 * s, 4.25, 0.9); torso.add(e); }
  g.add(legs, torso);
  g.scale.setScalar(scale);
  g.userData = { body, head, legs, torso, arms: armPivots, phase: rnd() * 10, baseScale: scale, armX: [0, 0], armZ: [0, 0], setShirt: c => { body.material = toon(c); } };
  return g;
}
/** Walk, bounce and cheer. Arms follow unless `arms: false` (the volleyball module poses its own). */
export function animateFigure(f, t, { walk = 0, bounce = 0.06, cheer = 0, arms = true, dt = 0.016 } = {}) {
  const u = f.userData, p = t * (walk ? 9 : 2.2) + u.phase;
  const b = Math.abs(Math.sin(p)) * (walk ? 0.35 : bounce) + cheer * Math.abs(Math.sin(t * 8 + u.phase)) * 1.0;
  u.torso.position.y = b;
  const sq = 1 + Math.sin(p * 2) * (walk ? 0.05 : 0.02) * (u.simple ? 0.5 : 1);
  u.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  if (u.legs.children.length === 2) {
    u.legs.children[0].rotation.x = walk ? Math.sin(p) * 0.6 : 0;
    u.legs.children[1].rotation.x = walk ? -Math.sin(p) * 0.6 : 0;
  } else if (walk) u.torso.rotation.z = Math.sin(p) * 0.06;     // a waddle for the simple figures
  if (arms && u.arms.length) {
    let ax, az;
    if (cheer > 0.2) { ax = [-2.7 + Math.sin(t * 9 + u.phase) * 0.25, -2.7 - Math.sin(t * 9 + u.phase) * 0.25]; az = [-0.35, 0.35]; }
    else if (walk) { ax = [-Math.sin(p) * 0.55, Math.sin(p) * 0.55]; az = [-0.12, 0.12]; }
    else { ax = [Math.sin(t * 1.3 + u.phase) * 0.06, -Math.sin(t * 1.3 + u.phase) * 0.06]; az = [-0.12, 0.12]; }
    poseArms(f, ax, az, dt, 12);
  }
}
export function poseArms(f, ax, az, dt, rate = 14) {
  const u = f.userData, k = 1 - Math.exp(-dt * rate);
  for (let i = 0; i < u.arms.length; i++) {
    u.armX[i] += (ax[i] - u.armX[i]) * k; u.armZ[i] += (az[i] - u.armZ[i]) * k;
    u.arms[i].rotation.x = u.armX[i]; u.arms[i].rotation.z = u.armZ[i];
  }
}
const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// ------------------------------------------------------------------ the scene
export class Beach {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, devicePixelRatio));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#cdeffb', 260, 1500);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 2600);
    // handbook reference (0, 44, 68) looking at (0, 2, −8); raised and tilted up so all four bars fit and the
    // horizon, sky and passing ships show across the top of the TV
    this.camBase = new THREE.Vector3(0, 46, 86);
    this.lookBase = new THREE.Vector3(0, 0, -25);
    this.camNudge = new THREE.Vector3(); this.camNudgeTarget = new THREE.Vector3(); this.pull = 0; this.pullTarget = 0;
    this.orbit = 0; this.mode = 'lobby';
    this.clock = new THREE.Clock(); this.t = 0;
    this.bars = [null, null, null, null];
    this.tierLevel = 0; this.frames = []; this.lowSince = 0;
    this.look = { ...LOOKS.sunny }; this.lookTarget = LOOKS.sunny; this.weatherType = 'sunny';
    this.fixture = null; this.day = null; this.defectors = [];
    this.build();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole beach in frame on narrow screens
    this.camera.fov = w / h < 1.7 ? 50 * (1.78 / (w / h)) ** 0.6 : 50;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- build
  build() {
    const S = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#f3d8a4', 1.0); S.add(this.hemi);
    const sun = this.sunLight = new THREE.DirectionalLight('#fff4dd', 1.25);
    sun.position.set(-40, 90, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 60, bottom: -70, near: 10, far: 260 });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.4;
    S.add(sun);

    this.buildSand(); this.buildSea(); this.buildSky(); this.buildProps();
    this.buildLife(); this.buildStands(); this.buildRain(); this.buildEvents(); this.buildParty();
    this.vb = new Volleyball(S, { toon, figure, animateFigure, poseArms, labelSprite, canvasTex });
  }

  buildSand() {
    // wide enough that the sand never runs out at the sides, even as the lobby camera swings round
    const geo = new THREE.PlaneGeometry(1200, 120, 320, 50); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 22);
    const pos = geo.attributes.position, uv = geo.attributes.uv, col = [];
    const a = new THREE.Color('#ffe9c4'), b = new THREE.Color('#f3d8a4'), wet = new THREE.Color('#c9a56c');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const flat = Math.abs(x) < COURT.hx + 3 && Math.abs(z) < COURT.hz + 3;
      const bump = flat ? 0 : (Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.07 + z * 0.11)) * 0.25;
      const slope = z < SHORE + 4 ? (z - SHORE - 4) * 0.13 : 0;   // dips into the sea
      pos.setY(i, bump + slope);
      uv.setXY(i, x / 18, z / 18);                                 // texture in world units
      const c = a.clone().lerp(b, 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.29) * Math.cos(z * 0.07));
      if (z < SHORE + 3) c.lerp(wet, Math.min(1, (SHORE + 3 - z) / 3));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.sandMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, map: sandTexture() });
    const sand = new THREE.Mesh(geo, this.sandMat); sand.receiveShadow = true; this.scene.add(sand);
  }

  buildSea() {
    this.waterTex = waterTexture();
    // near sea: animated waves, from the shore out to z = −330
    const geo = new THREE.PlaneGeometry(2400, 300, 200, 48); geo.rotateX(-Math.PI / 2); geo.translate(0, -0.6, SHORE - 150);
    const uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 40, p.getZ(i) / 40);
    this.seaGeo = geo; this.seaBase = Float32Array.from(geo.attributes.position.array);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 4), 4));   // RGBA: it fades out at the far edge
    this.seaMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, map: this.waterTex, transparent: true, opacity: 0.97 });
    this.sea = new THREE.Mesh(geo, this.seaMat); this.sea.receiveShadow = true; this.scene.add(this.sea);
    // far sea: flat, wide enough to fill every corner of the screen out to the horizon. It starts well inside the
    // near sea and sits a little lower, so the two overlap and no sky can ever show through a seam between them.
    const far = new THREE.PlaneGeometry(8000, 2800, 1, 1); far.rotateX(-Math.PI / 2); far.translate(0, -1.8, SHORE - 120 - 1400);
    const fuv = far.attributes.uv, fp = far.attributes.position;
    for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) / 120, fp.getZ(i) / 60);
    this.farTex = this.waterTex.clone(); this.farTex.needsUpdate = true;
    this.farSeaMat = new THREE.MeshToonMaterial({ color: LOOKS.sunny.sea[2], gradientMap, map: this.farTex });
    this.farSea = new THREE.Mesh(far, this.farSeaMat); this.scene.add(this.farSea);
    this.paintSea(LOOKS.sunny.sea);
    // foam line that laps in and out
    const foamTex = canvasTex(256, 32, (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); });
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(1200, 2.6), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false }));
    this.foam.rotation.x = -Math.PI / 2; this.foam.position.set(0, -0.15, SHORE - 1); this.scene.add(this.foam);
    // three layers of rolling wave crests
    this.crests = [0, 1, 2].map(i => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1.2), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0.6, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.userData.phase = i / 3; this.scene.add(m); return m;
    });
  }
  paintSea(cols) {
    const [light, mid, deep] = cols.map(c => new THREE.Color(c));
    const pos = this.seaGeo.attributes.position, col = this.seaGeo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const z = this.seaBase[i * 3 + 2], f = Math.min(1, (SHORE - z) / 260);
      const c = f < 0.12 ? light.clone().lerp(mid, f / 0.12) : mid.clone().lerp(deep, Math.min(1, (f - 0.12) / 0.6));
      const edge = Math.min(1, (z - (SHORE - 300)) / 80);       // the last 80 units melt into the far sea
      col.setXYZW(i, c.r, c.g, c.b, Math.max(0, edge));
    }
    col.needsUpdate = true;
    this.farSeaMat.color.copy(deep);
  }

  buildSky() {
    // the sun, low over the sea in the band of sky above the horizon
    const halo = canvasTex(256, 256, (ctx, w) => { const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,250,220,.95)'); g.addColorStop(0.45, 'rgba(255,230,160,.3)'); g.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); });
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: '#fff6c8', fog: false, depthWrite: false, transparent: true }));
    this.sun.position.set(520, 150, -1500); this.sun.renderOrder = -2; this.scene.add(this.sun);
    // a sun glitter path on the far water
    const glitTex = canvasTex(64, 512, (ctx, w, h) => { const r = seeded(5); for (let i = 0; i < 260; i++) { const y = r() * h, s = 1 + (y / h) * 3; ctx.fillStyle = `rgba(255,250,220,${0.3 + r() * 0.6})`; ctx.fillRect(w / 2 + (r() - 0.5) * w * (0.3 + y / h * 0.7), y, s * 3, s); } });
    this.glitter = new THREE.Mesh(new THREE.PlaneGeometry(220, 1200), new THREE.MeshBasicMaterial({ map: glitTex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
    this.glitter.rotation.x = -Math.PI / 2; this.glitter.position.set(330, -0.3, -1000); this.glitter.rotation.z = -0.32; this.scene.add(this.glitter);
    // clouds: puffs of flattened spheres, far over the horizon
    this.clouds = [];
    const puff = new THREE.SphereGeometry(1, 14, 10);
    this.cloudMat = new THREE.MeshToonMaterial({ color: '#ffffff', emissive: '#7a8590', gradientMap, transparent: true, opacity: 0.9, fog: false });
    const r = seeded(77);
    for (let i = 0; i < 16; i++) {
      const n = 4 + Math.floor(r() * 4), geos = [];
      for (let j = 0; j < n; j++) geos.push(puff.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(j * 4 - n * 2, Math.sin(j * 1.7) * 1.4 + (j % 2), Math.cos(j) * 2), new THREE.Quaternion(), new THREE.Vector3(5 + (j % 2) * 2.5, 3 + (j % 3), 4))));
      const c = new THREE.Mesh(mergeGeometries(geos), this.cloudMat);
      c.position.set(-1400 + i * 180 + r() * 90, 70 + r() * 110, -1500 - r() * 400);
      c.scale.setScalar(9 + r() * 7);
      c.userData = { speed: 4 + r() * 6, order: r() };
      this.scene.add(c); this.clouds.push(c);
    }
    // a ship on the horizon and a plane trailing a banner
    this.ship = this.makeShip(); this.ship.scale.setScalar(2.2); this.ship.position.set(-700, 0, -950); this.scene.add(this.ship);
    this.sail = this.makeSailboat(); this.sail.position.set(300, 0, -520); this.scene.add(this.sail);
    this.plane = this.makePlane(); this.plane.visible = false; this.scene.add(this.plane);
    this.nextPlane = 8;
  }
  makeShip() {
    const g = new THREE.Group(), white = toon('#f8fafc'), red = toon('#dc2626'), navy = toon('#1e3a5f');
    const hull = new THREE.Mesh(new THREE.BoxGeometry(70, 8, 12), navy); hull.position.y = 4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(70.5, 1.6, 12.4), red); band.position.y = 1;
    const deck1 = new THREE.Mesh(new THREE.BoxGeometry(46, 6, 10), white); deck1.position.set(-4, 11, 0);
    const deck2 = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 9), white); deck2.position.set(-6, 16.5, 0);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 8, 10), red); funnel.position.set(-8, 23, 0);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(6, 14, 4), navy); bow.rotation.z = -Math.PI / 2; bow.position.set(41, 4, 0); bow.scale.set(1, 1, 1);
    g.add(hull, band, deck1, deck2, funnel, bow);
    // portholes
    for (let i = 0; i < 12; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 0.3), toon('#fde68a')); w.position.set(-24 + i * 3.6, 11, 5.1); g.add(w); }
    mergeStatic(g);
    g.userData.speed = 9;
    return g;
  }
  makeSailboat() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 4.5), toon('#ffffff')); hull.position.y = 1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 16, 6), toon('#94a3b8')); mast.position.y = 9;
    const sailGeo = new THREE.BufferGeometry(); sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.5, 0, 0, 16.5, 0, 7, 2.5, 0, 0, 2.5, 0, -5, 2.5, 0, 0, 13, 0], 3)); sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, toon('#fefce8', { side: THREE.DoubleSide }));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.6, 4.6), toon('#0ea5e9')); stripe.position.y = 1.4;
    g.add(hull, stripe, mast, sail); mergeStatic(g); g.scale.setScalar(1.6);
    g.userData.speed = -3;
    return g;
  }
  makePlane() {
    const g = new THREE.Group(), white = toon('#ffffff'), red = toon('#ef4444');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 9, 4, 8), white); body.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 16), red);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3, 0.3), red); tail.position.set(-5.2, 1.6, 0);
    const tailW = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 6), red); tailW.position.set(-5.2, 0.4, 0);
    g.add(body, wing, tail, tailW); mergeStatic(g);
    const bannerTex = canvasTex(1024, 160, (ctx, w, h) => { ctx.fillStyle = '#fff7ea'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ff6b5e'; ctx.font = '900 108px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('COCKTAIL SHACK 🍹', w / 2, h / 2 + 6); });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(44, 7, 16, 1), new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide, fog: false }));
    banner.position.set(-32, 0, 0); banner.userData.base = Float32Array.from(banner.geometry.attributes.position.array);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 4), toon('#334155')); rope.rotation.z = Math.PI / 2; rope.position.set(-7.5, 0, 0);
    g.add(banner, rope); g.userData.banner = banner;
    g.scale.setScalar(2.2);
    return g;
  }

  buildProps() {
    const S = this.scene;
    // palm trees
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
    mergeStatic(top); mergeStatic(palm);
    palm.add(top); palm.userData.top = top;
    palm.position.set(-62, 0, -12); S.add(palm);
    this.palms = [palm];
    for (const [x, z, s, ry] of [[66, 0, -6, 0.85, 2], [-80, 0, 6, 1.1, 1], [84, 0, 10, 1, 4]].map(a => [a[0], a[2], a[3], a[4]])) {
      const p = palm.clone(); p.userData = { top: p.children[p.children.length - 1] };
      p.position.set(x, 0, z); p.scale.setScalar(s); p.rotation.y = ry; S.add(p); this.palms.push(p);
    }

    // trophy and bunting for the Beach Cup Final
    this.finalProps = new THREE.Group(); this.finalProps.visible = false; S.add(this.finalProps);
    const gold = toon('#f5c542', { emissive: '#5a4300' });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 3.6), toon('#ffffff')); plinth.position.y = 1.2; plinth.castShadow = true;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.6, 2.6, 16, 1, true), gold); cup.position.y = 4.9;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 1.2, 10), gold); stem.position.y = 3.0;
    const trophy = new THREE.Group(); trophy.add(plinth, cup, stem); trophy.position.set(-24, 0, -17); this.finalProps.add(trophy);
    const flagCols = ['#ff6b5e', '#14b8a6', '#f59e0b', '#8b5cf6', '#ffffff'];
    for (const z of [-COURT.hz - 1.5, COURT.hz + 1.5]) {
      for (let i = 0; i < 20; i++) {
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 3), toon(flagCols[i % 5])); tri.rotation.x = Math.PI;
        const x = -COURT.hx - 1 + i * ((COURT.hx * 2 + 2) / 19); tri.position.set(x, 7.4 - Math.sin((i / 19) * Math.PI) * 1.2, z); this.finalProps.add(tri);
      }
      for (const x of [-COURT.hx - 1.5, COURT.hx + 1.5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 8.5, 6), toon('#e5e7eb')); p.position.set(x, 4.25, z); this.finalProps.add(p); }
    }
    mergeStatic(this.finalProps); mergeStatic(trophy);
  }

  // ---------------------------------------------------------------- people on the beach
  // Every item has a kind, an order (which ones appear first as the beach fills) and whether it sits where the
  // court goes. How many of each kind show depends on the weather and whether there's a match.
  buildLife() {
    const r = seeded(31), S = this.scene;
    this.life = [];
    const add = (kind, group, { central = false, order = r() } = {}) => {
      group.userData.kind = kind; group.userData.central = central; group.userData.order = order; group.userData.vis = 0;
      group.userData.base = group.scale.x; group.visible = false; group.scale.setScalar(0.001);
      S.add(group); this.life.push(group); return group;
    };
    const towelCols = ['#ff6b5e', '#14b8a6', '#f59e0b', '#8b5cf6', '#38bdf8', '#f472b6', '#facc15', '#22c55e'];
    const parasolCols = ['#ef4444', '#0ea5e9', '#f59e0b', '#a855f7', '#ec4899', '#10b981'];
    // sunbathers on towels: along the shoreline strip and, on quiet days, all over the middle of the beach
    const spots = [];
    for (let i = 0; i < 12; i++) spots.push([-78 + i * 14 + (r() - 0.5) * 5, -26 - r() * 3, false]);
    const central = [[-24, -12], [-14, -16], [-4, -12], [8, -15], [19, -11], [27, -16], [-27, -2], [-17, 2], [-6, -3], [6, 1], [16, -2], [26, 3], [-22, 11], [-9, 9], [3, 12], [14, 9], [24, 12]];
    for (const [x, z] of central) spots.push([x + (r() - 0.5) * 3, z + (r() - 0.5) * 2, true]);
    spots.forEach(([x, z, cen], i) => {
      const g = new THREE.Group();
      const towel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 6.4), toon(towelCols[i % towelCols.length])); towel.receiveShadow = true; g.add(towel);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.13, 0.7), toon('#ffffff')); stripe.position.z = 1.6; g.add(stripe);
      const f = figure({ shirt: SHIRTS[i % SHIRTS.length], eyes: false, arms: true, scale: 0.8, shadow: false, rnd: r });
      f.rotation.x = -Math.PI / 2; f.position.set(0, 0.85, 2.4);
      f.userData.arms.forEach((a, k) => { a.rotation.z = k ? 0.4 : -0.4; });
      g.add(f); g.userData.figure = f;
      if (i % 3 !== 1) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), toon('#e5e7eb')); pole.position.set(2.2, 3.5, 0); g.add(pole);
        const shade = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 12), toon(parasolCols[i % parasolCols.length])); shade.position.set(2.2, 7, 0); shade.castShadow = true; g.add(shade);
      }
      if (i % 4 === 0) { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), toon(['#f43f5e', '#facc15', '#38bdf8'][i % 3])); ball.position.set(-2.2, 0.7, -1); g.add(ball); }
      g.remove(f); mergeStatic(g); g.add(f);
      g.position.set(x, 0.06, z); g.rotation.y = (r() - 0.5) * 0.9;
      add('towel', g, { central: cen, order: (cen ? 0.3 : 0) + r() * 0.7 });
    });
    // pairs knocking a ball about with bats, and a frisbee pair
    const pairs = [[-20, -6, 'bat'], [12, 5, 'bat'], [22, -8, 'bat'], [-6, 6, 'frisbee'], [56, -14, 'bat'], [-58, -16, 'frisbee']];
    pairs.forEach(([x, z, type], i) => {
      const g = new THREE.Group();
      const a = figure({ shirt: SHIRTS[(i * 3) % SHIRTS.length], shorts: '#0f172a', scale: 0.85, eyes: false, rnd: r });
      const b = figure({ shirt: SHIRTS[(i * 3 + 5) % SHIRTS.length], shorts: '#7c2d12', scale: 0.85, eyes: false, rnd: r });
      a.position.set(-4.5, 0, 0); b.position.set(4.5, 0, 0); a.rotation.y = Math.PI / 2; b.rotation.y = -Math.PI / 2;
      const ball = type === 'bat' ? new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), toon('#facc15')) : new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.65, 0.14, 14), toon('#f97316'));
      g.add(a, b, ball);
      g.userData.pair = { a, b, ball, type, phase: r() * 4 };
      g.position.set(x, 0, z); g.rotation.y = r() * 1.2 - 0.6;
      add(type === 'bat' ? 'pair' : 'frisbee', g, { central: Math.abs(x) < 34 && Math.abs(z) < 18 });
    });
    // children building sandcastles
    const castles = [[-12, -21], [18, -20], [-30, 7], [30, -3]];
    castles.forEach(([x, z], i) => {
      const g = new THREE.Group(), sandM = toon('#e9c98f');
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 1.4, 12), sandM); base.position.y = 0.7;
      g.add(base);
      for (let k = 0; k < 4; k++) {
        const tx = Math.cos(k * Math.PI / 2) * 1.6, tz = Math.sin(k * Math.PI / 2) * 1.6;
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.2, 8), sandM); tw.position.set(tx, 1.8, tz); g.add(tw);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 8), sandM); cap.position.set(tx, 3.3, tz); g.add(cap);
      }
      const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 3, 8), sandM); keep.position.y = 2.6; g.add(keep);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 3), toon('#ef4444')); flag.rotation.z = -Math.PI / 2; flag.position.set(0.4, 4.8, 0); g.add(flag);
      const kid = figure({ shirt: ['#f472b6', '#38bdf8', '#facc15', '#4ade80'][i], shorts: '#1e3a8a', scale: 0.55, eyes: true, rnd: r });
      kid.position.set(3.2, 0, 1); kid.rotation.y = -2.2; g.add(kid);
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.9, 10), toon('#ef4444')); bucket.position.set(4.4, 0.45, -0.6); g.add(bucket);
      g.remove(kid); mergeStatic(g); g.add(kid);
      g.userData.kid = kid;
      g.position.set(x, 0, z);
      add('castle', g, { central: Math.abs(x) < 34 && Math.abs(z) < 18 });
    });
    // swimmers bobbing in the shallows, some in rubber rings
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const f = figure({ shirt: ['#0ea5e9', '#ef4444', '#f59e0b', '#ec4899', '#22c55e'][i % 5], scale: 0.85, eyes: false, rnd: r, shadow: false });
      f.position.y = -2.3; g.add(f);
      if (i % 3 === 0) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.5, 8, 16), toon(['#f43f5e', '#facc15', '#a855f7'][i % 3])); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring); }
      g.userData.swim = { f, phase: r() * 6 };
      g.position.set(-90 + r() * 180, -0.5, SHORE - 7 - r() * 16); g.rotation.y = r() * 6;
      add('swimmer', g);
    }
    // walkers strolling along the water's edge
    for (let i = 0; i < 8; i++) {
      const f = figure({ shirt: SHIRTS[(i * 5) % SHIRTS.length], shorts: ['#334155', '#1e3a8a', '#78350f'][i % 3], scale: 0.85, eyes: false, rnd: r });
      const g = new THREE.Group(); g.add(f);
      g.userData.walk = { f, x0: -110 + r() * 220, speed: (r() < 0.5 ? -1 : 1) * (3 + r() * 2), z: SHORE + 1.5 + r() * 3, shirt: SHIRTS[(i * 5) % SHIRTS.length], jumper: JUMPERS[i % JUMPERS.length] };
      g.position.set(g.userData.walk.x0, 0, g.userData.walk.z);
      add('walker', g);
    }
  }

  // spectators in stands around the court: four rows behind and two at each end (none in front, so the TV sees the play)
  buildStands() {
    const r = seeded(41);
    this.spectators = [];
    const spots = [];
    const hx = COURT.hx, hz = COURT.hz;
    for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) spots.push([-hx + 1.5 + i * ((hx * 2 - 3) / 11) + (row % 2) * 1.2, -hz - 3 - row * 2.3, row]);
    for (const s of [-1, 1]) for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) spots.push([s * (hx + 4 + row * 2.4), -hz + 1.5 + i * ((hz * 2 - 3) / 5), row + 0.2]);
    spots.forEach(([x, z, row], i) => {
      const shirt = SHIRTS[i % SHIRTS.length];
      const f = figure({ shirt, shorts: ['#123c4a', '#1e3a8a', '#7c2d12', '#334155'][i % 4], eyes: i % 4 === 0, scale: 0.85, rnd: r });
      f.position.set(x, 0, z); f.lookAt(0, 0, 0);
      f.userData.home = new THREE.Vector3(x, 0, z); f.userData.shirt = shirt; f.userData.jumper = JUMPERS[i % JUMPERS.length];
      // nearest rows fill first, with a little randomness so the stands fill unevenly
      f.userData.order = row * 0.25 + r() * 0.3; f.userData.vis = 0; f.userData.base = f.userData.baseScale; f.visible = false;
      this.scene.add(f); this.spectators.push(f);
    });
    this.spectators.sort((a, b) => a.userData.order - b.userData.order);
  }

  buildRain() {
    const n = 2400, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 260, y = Math.random() * 80, z = -80 + Math.random() * 150;
      pos.set([x, y, z, x - 0.5, y - 2.4, z + 0.3], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c7d6e6', transparent: true, opacity: 0.55, fog: false }));
    this.rain.visible = false; this.scene.add(this.rain);
    this.flash = 0; this.nextFlash = 3;
  }

  buildEvents() {
    // rival juice van with a giant smoothie on its roof; it drives in along the front of the beach
    const van = this.van = new THREE.Group();
    const bodyM = toon('#f472b6'), white = toon('#ffffff'), dark = toon('#1f2937');
    const box = new THREE.Mesh(new THREE.BoxGeometry(12, 5.5, 5.6), bodyM); box.position.y = 4; box.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3.8, 5.4), white); cab.position.set(7.4, 3.2, 0); cab.castShadow = true;
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 5.5), toon('#93c5fd')); win.position.set(8.4, 4, 0);
    van.add(box, cab, win);
    this.vanWheels = [];
    for (const [x, z] of [[-4, 2.9], [4.5, 2.9], [-4, -2.9], [4.5, -2.9]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.8, 14), dark); w.rotation.x = Math.PI / 2; w.position.set(x, 1.2, z); van.add(w); this.vanWheels.push(w); }
    // serving hatch with an awning on the beach side
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 0.3), toon('#1f2937')); hatch.position.set(-1, 4.6, -2.85);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 2.2), toon('#fde047')); awn.position.set(-1, 6.1, -3.8); awn.rotation.x = -0.35;
    const vendor = figure({ shirt: '#fde047', shorts: '#9d174d', scale: 0.7 }); vendor.position.set(-1, 1.8, -1.4); vendor.rotation.y = Math.PI;
    van.add(hatch, awn, vendor); this.vendor = vendor;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.5, 4.2, 14), toon('#fb7185')); cup.position.set(-1, 9, 0);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(2.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#fde68a')); lid.position.set(-1, 11.1, 0);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), toon('#22c55e')); straw.position.set(-0.2, 13.2, 0); straw.rotation.z = -0.3;
    van.add(cup, lid, straw);
    const sign = labelSprite('JUICE!', { bg: '#fde047', fg: '#9d174d', scale: 0.03 }); sign.position.set(-1.5, 4.4, 3.4); van.add(sign);
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

  // ---------------------------------------------------------------- the beach party
  // On a no-match day the "extra" event is a beach party: a DJ booth goes up in the middle of the beach and a crowd
  // streams in to dance.
  buildParty() {
    const g = this.party = new THREE.Group(); g.visible = false; g.position.set(0, 0, -11); this.scene.add(g);
    const black = toon('#1f2937'), grey = toon('#6b7280'), wood = toon('#c98b4f');
    const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 8), wood); deck.position.y = 0.5; deck.castShadow = deck.receiveShadow = true; g.add(deck);
    // the DJ's table with its neon front
    const neon = canvasTex(512, 128, (ctx, w, h) => {
      const gr = ctx.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ec4899'); gr.addColorStop(0.5, '#8b5cf6'); gr.addColorStop(1, '#06b6d4');
      ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = gr; ctx.font = '900 70px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#f0abfc'; ctx.shadowBlur = 18; ctx.fillText('BEACH PARTY', w / 2, h / 2 + 4);
    });
    const table = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 2.4), black); table.position.set(0, 2.3, 1); table.castShadow = true; g.add(table);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.9), new THREE.MeshBasicMaterial({ map: neon })); front.position.set(0, 2.3, 2.22); g.add(front);
    this.decks = [-2, 2].map(x => { const d = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 20), toon('#111827')); d.position.set(x, 3.75, 1); const lbl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.27, 12), toon(x < 0 ? '#f472b6' : '#22d3ee')); d.add(lbl); g.add(d); return d; });
    // the DJ, with headphones
    const dj = this.dj = figure({ shirt: '#f472b6', shorts: '#111827', scale: 1.05 });
    dj.position.set(0, 1, -0.6);
    const phones = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 6, 16, Math.PI), black); phones.position.y = 4.3; dj.userData.torso.add(phones);
    for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), black); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 1.05, 4.2, 0); dj.userData.torso.add(cup); }
    g.add(dj);
    // speaker stacks that thump on the beat
    this.speakers = [-7, 7].map(x => {
      const st = new THREE.Group(); st.position.set(x, 1, 0.5);
      for (const [y, sz] of [[1.6, 3.2], [4.4, 2.4]]) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(sz, sz * 0.9, 2.2), black); box.position.y = y; box.castShadow = true; st.add(box);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(sz * 0.32, sz * 0.32, 0.15, 16), grey); cone.rotation.x = Math.PI / 2; cone.position.set(0, y, 1.15); st.add(cone); cone.userData.cone = true;
      }
      g.add(st); return st;
    });
    // posts with a string of coloured bulbs, and light beams sweeping the sky
    for (const x of [-9, 9]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 11, 6), toon('#e5e7eb')); pole.position.set(x, 5.5, -2.5); g.add(pole); }
    this.bulbs = [];
    const bulbCols = ['#f472b6', '#facc15', '#22d3ee', '#a3e635', '#fb923c', '#a78bfa'];
    for (let i = 0; i < 22; i++) {
      const x = -9 + i * (18 / 21), y = 10.6 - Math.sin((i / 21) * Math.PI) * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: bulbCols[i % bulbCols.length] }));
      b.position.set(x, y, -2.5); b.userData.col = new THREE.Color(bulbCols[i % bulbCols.length]); g.add(b); this.bulbs.push(b);
    }
    this.beams = ['#f472b6', '#22d3ee', '#a3e635', '#facc15'].map((c, i) => {
      const geo = new THREE.ConeGeometry(2.6, 30, 16, 1, true); geo.translate(0, -15, 0); geo.rotateX(Math.PI);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(-6 + i * 4, 4, -1.5); g.add(m); return m;
    });
    // beach balls batted about over the crowd
    this.partyBalls = [0, 1, 2].map(i => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), toon(['#f43f5e', '#facc15', '#38bdf8'][i])); b.visible = false; this.scene.add(b); return b; });
    // the dancers: bright party clothes, waiting off stage
    const shirts = ['#f472b6', '#22d3ee', '#a3e635', '#facc15', '#fb923c', '#a78bfa', '#ffffff', '#f87171'];
    this.dancers = [];
    for (let i = 0; i < 44; i++) {
      const row = Math.floor(i / 11), col = i % 11;
      const spot = new THREE.Vector3(-16 + col * 3.2 + (row % 2) * 1.6 + (Math.random() - 0.5), 0, -5 + row * 3.3 + (Math.random() - 0.5));
      const f = figure({ shirt: shirts[i % shirts.length], shorts: ['#1e3a8a', '#111827', '#7c2d12'][i % 3], scale: 0.85, eyes: false });
      const a = Math.random() * Math.PI * 2;
      f.userData.spot = spot; f.userData.from = spot.clone().add(new THREE.Vector3(Math.cos(a) * 30, 0, Math.abs(Math.sin(a)) * 25));
      f.userData.style = i % 4; f.userData.arrive = Math.random() * 2.5;
      f.visible = false; this.scene.add(f); this.dancers.push(f);
    }
    this.partyOn = false;
  }
  startParty() {
    if (this.partyOn) return;
    this.partyOn = true; this.partyT = 0; this.party.visible = true; this.party.scale.setScalar(0.01);
    for (const f of this.dancers) { f.position.copy(f.userData.from); f.visible = true; f.userData.there = false; f.userData.tWalk = 0; }
    this.partyBalls.forEach(b => (b.visible = true));
  }
  stopParty() {
    this.partyOn = false; this.party.visible = false;
    for (const f of this.dancers) f.visible = false;
    this.partyBalls.forEach(b => (b.visible = false));
  }
  updateParty(t, dt) {
    if (!this.partyOn) return;
    const T = this.partyT += dt, beat = T * (124 / 60), ph = beat % 1, kick = Math.pow(1 - ph, 3);
    this.party.scale.setScalar(Math.min(1.35, 0.01 + T * 3));          // a bit bigger than life, so it reads on the TV
    this.decks.forEach((d, i) => (d.rotation.y += dt * (i ? 5 : 4)));
    this.speakers.forEach(sp => sp.scale.set(1 + kick * 0.06, 1 + kick * 0.06, 1 + kick * 0.06));
    this.bulbs.forEach((b, i) => { const on = (Math.floor(beat * 2) + i) % 3 !== 0; b.material.color.copy(b.userData.col).multiplyScalar(on ? 1.2 : 0.25); });
    this.beams.forEach((m, i) => { m.rotation.z = Math.sin(T * 1.3 + i * 1.7) * 0.7; m.rotation.x = Math.cos(T * 1.1 + i) * 0.35; m.material.opacity = 0.1 + kick * 0.12; });
    // the DJ: nodding along, one hand on the headphones, the other in the air on the drop
    animateFigure(this.dj, t, { bounce: 0.18 + kick * 0.25, arms: false, dt });
    poseArms(this.dj, [-2.6 + Math.sin(T * 2) * 0.3, Math.floor(beat / 8) % 2 ? -2.9 : -1.4], [-0.9, 0.3], dt, 10);
    this.partyBalls.forEach((b, i) => {
      const k = (T * 0.45 + i / 3) % 1, x0 = -14 + i * 9;
      b.position.set(x0 + Math.sin(k * Math.PI * 2) * 6, 7 + Math.abs(Math.sin(k * Math.PI * 4)) * 5, -1 + i * 2.5); b.rotation.x += dt * 3;
    });
    // dancers stream in, then dance: four styles, all on the beat
    for (const f of this.dancers) {
      const u = f.userData;
      if (T < u.arrive) continue;
      const d = u.spot.clone().sub(f.position), dist = d.length();
      if (!u.there && dist > 0.4 && (u.tWalk = (u.tWalk || 0) + dt) < 6) { this.walkTo(f, u.spot, 11, dt); animateFigure(f, t, { walk: 1, dt }); continue; }
      u.there = true;
      const b = (beat + u.phase * 0.1) % 1, jump = u.style === 0 ? Math.abs(Math.sin(b * Math.PI)) * 1.2 : u.style === 2 ? Math.pow(1 - b, 2) * 0.6 : 0.15 * Math.abs(Math.sin(b * Math.PI * 2));
      f.position.y = jump;
      f.rotation.y = Math.PI + Math.sin(beat * Math.PI / 2 + u.phase) * (u.style === 1 ? 0.9 : 0.35);   // face the DJ, swaying
      animateFigure(f, t, { bounce: 0.05, arms: false, dt });
      const wave = Math.sin(beat * Math.PI + u.phase);
      const arms = u.style === 0 ? [[-2.9, -2.9], [-0.3, 0.3]]                      // jumping, hands up
        : u.style === 1 ? [[-1.5 + wave * 0.9, -1.5 - wave * 0.9], [-0.4, 0.4]]       // the swim
        : u.style === 2 ? [[-2.8, -0.4], [-0.2 + wave * 0.3, 0.2]]                  // one fist pumping
        : [[-2.5 - wave * 0.4, -2.5 + wave * 0.4], [-0.8 - wave * 0.3, 0.8 - wave * 0.3]];   // arms waving side to side
      poseArms(f, arms[0], arms[1], dt, 12);
    }
  }

  // ---------------------------------------------------------------- bars
  setBars(bars) {
    const seen = new Set();
    for (const b of bars) {
      seen.add(b.slot);
      let bar = this.bars[b.slot];
      if (!bar) bar = this.bars[b.slot] = this.makeBar(b);
      if (bar.name !== b.bar || bar.initials !== b.initials) { bar.initials = b.initials; this.renameBar(bar, b.bar); }
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
    add(new THREE.BoxGeometry(10.6, 0.4, 2), woodL, 0, 3.4, 2.6);                  // counter top
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
    const scGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.3, 14, 1, false, 0, Math.PI);
    scGeo.rotateZ(-Math.PI / 2); scGeo.rotateY(Math.PI / 2);      // a half disc hanging down, facing the front
    for (let i = 0; i < 8; i++) add(scGeo, i % 2 ? white : colour, -5.05 + i * 1.44, 7.05, 4.62);
    // flag
    add(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), white, 4.6, 10.8, -2.6);
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
    const badge = labelSprite(b.bar, { bg: b.colour, letter: LETTERS[b.slot], img: this.photoImgs?.[b.slot] || null, initials: b.initials || LETTERS[b.slot], scale: 0.04 }); badge.position.set(0, 16.5, 0); g.add(badge);
    // price sign: a painted board on a stick in front of the bar (appears at the start of the day, turned to the camera)
    const price = makePriceSign(b.colour); price.scale.setScalar(1.35); price.userData.base = price.scale.clone();
    // out to the side and towards the camera, whichever way the bar faces
    price.position.set(Math.sign(x) * 8, 0, 4.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y); price.visible = false; g.add(price);

    mergeStatic(g);
    this.scene.add(g);
    const bar = { slot: b.slot, colour: b.colour, name: b.bar, initials: b.initials, group: g, badge, price, flag, boards, roofMat, glass,
      staff: [], queue: [], leavers: [], staffCount: 0, pop: 0, boarded: false, front: new THREE.Vector3(0, 0, 1).applyEuler(g.rotation) };
    g.scale.setScalar(0.01);
    return bar;
  }

  renameBar(bar, name) {
    bar.group.remove(bar.badge);
    bar.badge = labelSprite(name, { bg: bar.colour, letter: LETTERS[bar.slot], img: this.photoImgs?.[bar.slot] || null, initials: bar.initials || LETTERS[bar.slot], scale: 0.04 }); bar.badge.position.set(0, 16.5, 0);
    bar.group.add(bar.badge); bar.name = name; bar.photoKey = this.photos?.[bar.slot] || '';
  }
  /** Players' selfies, shown on their bar's floating badge. */
  setPhotos(photos) {
    this.photos = photos || {}; this.photoImgs ||= {};
    for (let slot = 0; slot < 4; slot++) {
      const url = this.photos[slot];
      if (!url) { delete this.photoImgs[slot]; const bar = this.bars[slot]; if (bar && bar.photoKey) this.renameBar(bar, bar.name); continue; }
      const bar = this.bars[slot];
      if (bar && bar.photoKey === url) continue;
      const im = new Image();
      im.onload = () => { if (this.photos[slot] !== url) return; this.photoImgs[slot] = im; const b = this.bars[slot]; if (b) this.renameBar(b, b.name); };
      im.src = url;
    }
  }

  setStaff(bar, n) {
    n = bar.boarded ? 0 : n;
    while (bar.staff.length < n) {
      const i = bar.staff.length;
      const f = figure({ shirt: '#ffffff', shorts: '#334155', scale: 0.92 });
      const apron = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.2), toon(bar.colour)); apron.position.set(0, 2.0, 0.85); f.userData.torso.add(apron);
      f.position.set(-3.4 + (i % 4) * 2.3, 0.3, i < 4 ? 0.8 : -1.2);
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

  /** Queue length follows the sales script. People leaving the front walk off with a drink; with `toVan`,
   *  people leave from the back and head for the juice van instead. */
  setQueue(bar, n, toVan = false) {
    while (bar.queue.length < n) {
      const i = bar.queue.length;
      const f = figure({ shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)], shorts: ['#123c4a', '#1f2937', '#ffffff', '#7c2d12', '#0e7490'][Math.floor(Math.random() * 5)], scale: 0.9, eyes: false });
      f.userData.pop = 0; f.userData.origin = this.customerOrigin(bar);
      this.scene.add(f); bar.queue.push(f);
    }
    while (bar.queue.length > n) {
      if (toVan) {
        const f = bar.queue.pop();
        const k = this.defectors.length;
        // two huddles, one each side of the van, so the TV can see them
        const sideK = k % 2 ? 1 : -1, j = Math.floor(k / 2);
        f.userData.van = { spot: new THREE.Vector3(this.vanPark.x + sideK * (9.5 + (j % 3) * 2.2 + (Math.random() - 0.5) * 0.6), 0, this.vanPark.z - 3 + Math.floor(j / 3) * 2.3 + (Math.random() - 0.5) * 0.6) };
        this.defectors.push(f);
        continue;
      }
      const f = bar.queue.shift();
      this.giveDrink(f, bar.colour);
      f.userData.leave = { t: 0 };
      bar.leavers.push(f);
    }
  }
  // ---------------------------------------------------------------- not walking through things
  /** Everything people should walk round: circles {x, z, r} and turned rectangles {x, z, rot, hx, hz}. */
  obstacles() {
    if (this._obsAt === this.t) return this._obs;
    const o = [];
    for (const g of this.life) {
      if (!g.visible || g.userData.vis < 0.3) continue;
      const k = g.userData.kind;
      if (k === 'towel') o.push({ x: g.position.x, z: g.position.z, r: 3.1 });
      else if (k === 'castle') o.push({ x: g.position.x, z: g.position.z, r: 3.2 });
    }
    for (const p of this.palms) o.push({ x: p.position.x, z: p.position.z, r: 1.4 });
    for (const bar of this.bars) if (bar) o.push({ x: bar.group.position.x, z: bar.group.position.z, rot: bar.group.rotation.y, hx: 5.6, hz: 3.6 });
    for (const bar of this.bars) if (bar?.price.visible) {
      const r = bar.group.rotation.y, lx = bar.price.position.x, lz = bar.price.position.z;
      o.push({ x: bar.group.position.x + lx * Math.cos(r) + lz * Math.sin(r), z: bar.group.position.z - lx * Math.sin(r) + lz * Math.cos(r), r: 0.7 });
    }
    if (this.vb.group.visible) o.push({ x: 0, z: 0, rot: 0, hx: COURT.hx + 1, hz: COURT.hz + 1 });
    if (this.partyOn) o.push({ x: 0, z: this.party.position.z, rot: 0, hx: 12.5, hz: 5.8 });
    if (this.van.visible) o.push({ x: this.van.position.x + 1.5, z: this.van.position.z, rot: 0, hx: 8.5, hz: 3.4 });
    this._obsAt = this.t; this._obs = o;
    return o;
  }
  /** Push a point out of any obstacle; returns the outward normal of the last one it hit, or null. */
  pushOut(p, pad = 0.8) {
    let hit = null;
    for (const ob of this.obstacles()) {
      if (ob.r != null) {
        const dx = p.x - ob.x, dz = p.z - ob.z, d = Math.hypot(dx, dz), R = ob.r + pad;
        if (d < R) { const nx = d ? dx / d : 1, nz = d ? dz / d : 0; p.x = ob.x + nx * R; p.z = ob.z + nz * R; hit = { x: nx, z: nz }; }
      } else {
        const c = Math.cos(-ob.rot), s = Math.sin(-ob.rot), dx = p.x - ob.x, dz = p.z - ob.z;
        let lx = dx * c + dz * s, lz = -dx * s + dz * c;
        const ex = ob.hx + pad - Math.abs(lx), ez = ob.hz + pad - Math.abs(lz);
        if (ex > 0 && ez > 0) {
          let nlx = 0, nlz = 0;
          if (ex < ez) { lx = Math.sign(lx || 1) * (ob.hx + pad); nlx = Math.sign(lx); } else { lz = Math.sign(lz || 1) * (ob.hz + pad); nlz = Math.sign(lz); }
          const c2 = Math.cos(ob.rot), s2 = Math.sin(ob.rot);
          p.x = ob.x + lx * c2 + lz * s2; p.z = ob.z - lx * s2 + lz * c2;
          hit = { x: nlx * c2 + nlz * s2, z: -nlx * s2 + nlz * c2 };
        }
      }
    }
    return hit;
  }
  blocked(p, pad = 0.8) { const q = p.clone(); return !!this.pushOut(q, pad); }
  /** Walk toward a target, sliding round anything in the way. Returns the distance still to go. */
  walkTo(f, target, speed, dt) {
    const p = f.position, d = new THREE.Vector3(target.x - p.x, 0, target.z - p.z), dist = d.length();
    if (dist < 0.05) return 0;
    d.multiplyScalar(1 / dist);
    const step = Math.min(dist, speed * dt);
    p.x += d.x * step; p.z += d.z * step;
    const n = this.pushOut(p);
    if (n) {
      // slide along the obstacle, whichever way round is shorter
      let tx = -n.z, tz = n.x; if (tx * d.x + tz * d.z < 0) { tx = -tx; tz = -tz; }
      p.x += tx * step * 0.8; p.z += tz * step * 0.8; this.pushOut(p);
      f.rotation.y = Math.atan2(tx * 0.6 + d.x * 0.4, tz * 0.6 + d.z * 0.4);
    } else f.rotation.y = Math.atan2(d.x, d.z);
    return Math.hypot(target.x - p.x, target.z - p.z);
  }

  /** Where a customer was on the beach before they joined a queue: somewhere between the bar and the middle of the
   *  beach, never on the court or in the stands, never in the sea. */
  customerOrigin(bar) {
    const p = bar.group.position, a = (Math.random() - 0.5) * 1.8, d = 14 + Math.random() * 14;
    const dir = bar.front.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    const o = new THREE.Vector3(p.x + dir.x * d, 0, p.z + dir.z * d);
    const keepX = COURT.hx + 9, keepZ = COURT.hz + 12;
    if (Math.abs(o.x) < keepX && Math.abs(o.z) < keepZ) o.x = Math.sign(o.x || p.x) * (keepX + Math.random() * 4);
    o.z = Math.max(SHORE + 4, Math.min(38, o.z));
    if (this.blocked(o, 1.2) && (this._tries = (this._tries || 0) + 1) < 12) return this.customerOrigin(bar);
    this._tries = 0; this.pushOut(o, 1.2);
    return o;
  }
  /** A cocktail in the bar's colour, held in the right hand. */
  giveDrink(f, colour) {
    const glass = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 10), toon(colour)); bowl.rotation.x = Math.PI; bowl.position.y = 0.55;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 0.4, 6), toon('#e0f7ff')); stem.position.y = 0.05;
    const brolly = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.22, 8), toon('#facc15')); brolly.position.set(0.18, 1.05, 0); brolly.rotation.z = -0.4;
    glass.add(bowl, stem, brolly);
    const hand = f.userData.arms[1];
    glass.position.set(0, -1.75, 0.1);
    if (hand) hand.add(glass); else f.userData.torso.add(glass);
    f.userData.drink = glass; f.userData.sipAt = 2 + Math.random() * 3;
  }
  /** A customer with somewhere to be: walk there, then stand and sip. Returns false once they've left the beach. */
  stroll(f, target, t, dt, speed = 7) {
    const u = f.userData;
    if (this.fleeing()) {
      // gulls or a storm: off the beach, fast
      u.fleeTo ||= new THREE.Vector3(Math.sign(f.position.x || 1) * 160, 0, 70);
      if (this.walkTo(f, u.fleeTo, 14, dt) < 4) { this.scene.remove(f); return false; }
      animateFigure(f, t, { walk: 1, arms: !u.drink, dt });
      if (u.drink) poseArms(f, [0.4, -1.0], [-0.1, 0.1], dt);
    } else {
      const dist = u.home ? 0 : Math.hypot(target.x - f.position.x, target.z - f.position.z);
      if (dist > 0.3) {
        const left = this.walkTo(f, target, speed, dt);
        u.stuckFor = left > (u.lastLeft ?? 1e9) - 0.02 ? (u.stuckFor || 0) + dt : 0; u.lastLeft = left;
        if (u.stuckFor > 1.2 && left < 5) u.home = true;          // close enough: someone's towel is in the way
        animateFigure(f, t, { walk: 1, arms: !u.drink, dt });
        if (u.drink) poseArms(f, [Math.sin(t * 9 + u.phase) * 0.4, -0.9], [-0.12, 0.2], dt);
      } else {
        // arrived: face the sea and enjoy it, with a sip now and then
        f.rotation.y += ((Math.PI + Math.sin(u.phase) * 0.8) - f.rotation.y) * Math.min(1, dt * 2);
        animateFigure(f, t, { bounce: 0.05, arms: !u.drink, dt });
        if (u.drink) {
          u.sipAt -= dt;
          const sipping = u.sipAt < 0.7;
          if (u.sipAt < 0) u.sipAt = 3 + Math.random() * 3;
          poseArms(f, [0, sipping ? -2.35 : -0.75], [-0.12, sipping ? 0.35 : 0.15], dt, 8);
        }
      }
    }
    if (u.drink) u.drink.rotation.x = -u.armX[1];     // keep the glass upright whatever the arm does
    return true;
  }

  queueSpot(bar, i) {
    const p = bar.group.position, f = bar.front;
    const side = new THREE.Vector3(-f.z, 0, f.x);
    const d = 5.2 + i * 2.1;
    return new THREE.Vector3(p.x + f.x * d + side.x * Math.sin(i * 1.7) * 0.7, 0, p.z + f.z * d + side.z * Math.sin(i * 1.7) * 0.7);
  }

  // ---------------------------------------------------------------- weather and fixture
  setWeather(type, instant = false) {
    this.weatherType = type;
    this.lookTarget = LOOKS[type];
    this.paintSea(LOOKS[type].sea);
    this.rain.visible = !!LOOKS[type].rain;
    this.cloudMat.color.set(LOOKS[type].cloudCol);
    this.sun.material.color.set(LOOKS[type].sunCol);
    const cold = type === 'cool' || type === 'storm';
    this.spectators.forEach(f => f.userData.setShirt(cold ? f.userData.jumper : f.userData.shirt));
    this.life.filter(g => g.userData.kind === 'walker').forEach(g => g.userData.walk.f.userData.setShirt(cold ? g.userData.walk.jumper : g.userData.walk.shirt));
    if (instant || REDUCED) this.look = { ...LOOKS[type] };
    document.documentElement.style.setProperty('--sky-top', LOOKS[type].top);
    document.documentElement.style.setProperty('--sky-bot', LOOKS[type].bot);
  }
  /** The week's fixture: the court and the stands only appear on match days. */
  setFixture(fixture) {
    this.fixture = fixture || null;
    const match = !!fixture?.match;
    this.vb.setMatch(match ? fixture : null);
    this.finalProps.visible = match && fixture.stage === 'final';
  }

  /** How many of each kind of beachgoer, and how full the stands are, for this weather and fixture. */
  /** A storm or a seagull raid empties the beach for the rest of the day. */
  fleeing() {
    const d = this.day; if (!d) return false;
    if (this.weatherType === 'storm') return true;
    const ev = d.script.event;
    return ev?.type === 'gulls' && d.now() - d.startAt >= ev.atMs;
  }
  crowdTargets() {
    const L = LOOKS[this.weatherType], match = !!this.fixture?.match || this.partyOn;
    const storming = this.fleeing();
    const p = storming ? 0 : L.people;
    const counts = {
      towel: Math.round(29 * Math.min(1, p * (match ? 0.75 : 0.85))),
      pair: Math.round(4 * Math.min(1, p * 1.1)),
      frisbee: Math.round(2 * Math.min(1, p * 1.5)),
      castle: Math.round(4 * Math.min(1, p)),
      swimmer: Math.round(16 * Math.min(1, p * 0.85)),
      walker: storming ? 0 : Math.round(8 * (this.weatherType === 'storm' ? 0.15 : this.weatherType === 'cool' ? 1 : this.weatherType === 'cloud' ? 0.8 : 0.4)),
    };
    const stands = this.fixture?.match ? Math.min(1, L.crowd * STAGE_CROWD[this.fixture.stage || 'league']) : 0;
    return { counts, stands: storming ? 0 : stands };
  }

  // ---------------------------------------------------------------- the day
  /** Start playing the day script. now() returns server time; startAt is when the script's t = 0. */
  playDay(script, startAt, now, hooks = {}) {
    this.day = { script, startAt, now, hooks, served: {}, chimes: [], chimeIdx: 0, eventFired: false, spawned: new Set() };
    this.fleeStart = null;
    const total = script.bars.reduce((s, b) => s + b.saleTimesMs.length, 0);
    const n = total ? Math.min(12, Math.max(1, Math.round(total / 8))) : 0;
    for (let i = 0; i < n; i++) this.day.chimes.push(1000 + (12000 * (i + 0.5)) / n);
    for (const b of script.bars) {
      const bar = this.bars[b.slot]; if (!bar) continue;
      this.day.served[b.slot] = 0;
      paintPriceSign(bar.price, b.price, bar.colour);
      bar.price.visible = false; bar.price.userData.pop = 0;
    }
    this.setFixture(script.fixture);
    this.vb.startMatch(script.fixture);
  }
  stopDay() {
    this.stopParty();
    if (this.scattered) this.restoreLife();
    for (const w of this.walkAways || []) this.scene.remove(w.f);
    this.walkAways = [];
    for (const bar of this.bars) if (bar) { for (const f of bar.leavers) this.scene.remove(f); bar.leavers = []; }
    this.day = null; this.vb.endMatch(); this.van.visible = false; this.gulls.forEach(g => g.visible = false);
    for (const f of this.defectors) this.scene.remove(f);
    this.defectors = [];
  }
  hidePrices() { this.bars.forEach(b => b && (b.price.visible = false)); }

  /** What the TV overlays need each frame: per-bar served counts. */
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
    this.sun.material.opacity = L.sun; this.sun.scale.setScalar(L.sunSize * 7);
    this.glitter.material.opacity = L.sun * 0.75;
    this.cloudMat.opacity = 0.35 + 0.6 * L.clouds;
    this.scene.fog.color.set(T.bot);
    const slow = REDUCED ? 0.3 : 1;
    this.clouds.forEach(c => { c.visible = c.userData.order < 0.35 + L.clouds * 0.65; c.position.x += dt * c.userData.speed * slow; if (c.position.x > 1600) c.position.x = -1600; });

    // sea: three layers of rolling waves, the water texture drifting slowly
    const calm = REDUCED ? 0.35 : 1, rough = (T.whitecaps ? 1.6 : 1) * calm;
    const pos = this.seaGeo.attributes.position, base = this.seaBase;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      const near = Math.max(0, 1 - (SHORE - z) / 220), edge = Math.min(1, (z - (SHORE - 300)) / 60);
      pos.setY(i, base[i * 3 + 1] + (Math.sin(x * 0.05 + t * 0.9 + z * 0.12) * 0.35 + Math.sin(x * 0.11 - t * 1.3) * 0.18 + Math.sin(z * 0.2 + t * 1.7) * 0.22) * rough * (0.3 + near * 0.7) * edge);
    }
    pos.needsUpdate = true;
    this.waterTex.offset.set(t * 0.004 * slow, t * 0.012 * slow);
    this.farTex.offset.set(t * 0.002 * slow, t * 0.004 * slow);
    this.foam.position.z = SHORE - 1 + Math.sin(t * 0.8) * 1.4 * calm;
    this.foam.material.opacity = 0.7 + Math.sin(t * 0.8) * 0.25;
    this.crests.forEach(c => { const f = (t / 7 + c.userData.phase) % 1; c.position.set(0, -0.1, SHORE - 42 + f * 40); c.material.opacity = Math.sin(f * Math.PI) * 0.6 * (T.whitecaps ? 1 : 0.7); });

    // ship, sailboat and the banner plane
    this.ship.position.x += dt * this.ship.userData.speed * slow; if (this.ship.position.x > 900) this.ship.position.x = -900;
    this.ship.position.y = Math.sin(t * 0.6) * 0.4;
    this.sail.position.x += dt * this.sail.userData.speed * slow; if (this.sail.position.x < -450) this.sail.position.x = 450;
    this.sail.rotation.z = Math.sin(t * 0.9) * 0.05 * rough; this.sail.position.y = Math.sin(t * 1.1) * 0.6 * rough;
    this.ship.visible = this.weatherType !== 'storm'; this.sail.visible = this.weatherType !== 'storm';
    if (!this.plane.visible && (this.nextPlane -= dt) < 0 && this.weatherType !== 'storm' && !REDUCED) {
      this.plane.visible = true; this.plane.position.set(-1100, 150 + Math.random() * 40, -1100 - Math.random() * 200);
    }
    if (this.plane.visible) {
      this.plane.position.x += dt * 70;
      const bn = this.plane.userData.banner, bp = bn.geometry.attributes.position, bb = bn.userData.base;
      for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin(bb[i * 3] * 0.35 - t * 9) * 0.9 * (1 - (bb[i * 3] + 22) / 44));
      bp.needsUpdate = true;
      if (this.plane.position.x > 1100) { this.plane.visible = false; this.nextPlane = 35 + Math.random() * 30; }
    }

    // palms sway, flags ripple, bars pop in
    for (const p of this.palms) p.userData.top && (p.userData.top.rotation.z = Math.sin(t * 0.9 + p.position.x) * 0.05 * rough);
    for (const bar of this.bars) {
      if (!bar) continue;
      bar.pop = Math.min(1, bar.pop + dt * 1.8);
      const e = bar.pop, s = e >= 1 ? 1 : 1 + Math.sin(e * Math.PI * 2.5) * (1 - e) * 0.35 - (1 - e) * 0.6;
      bar.group.scale.setScalar(Math.max(0.01, s));
      const fg = bar.flag.geometry.attributes.position, fb = bar.flag.userData.base;
      for (let i = 0; i < fg.count; i++) { const x = fb[i * 3]; fg.setZ(i, Math.sin(x * 1.4 - t * 5) * 0.25 * x / 3.4 * rough); }
      fg.needsUpdate = true;
      bar.staff.forEach((f, i) => {
        // busy behind the counter: shaking cocktails while planning or serving
        const busy = this.mode === 'planning' || this.day;
        animateFigure(f, t, { bounce: busy ? 0.18 : 0.08, arms: false, dt });
        const shake = busy ? Math.sin(t * 14 + i) * 0.35 : 0;
        poseArms(f, [busy ? -1.9 + shake : 0, busy ? -1.9 - shake : 0], [-0.2, 0.2], dt, 18);
        f.rotation.y = Math.sin(t * 1.3 + i) * (busy ? 0.35 : 0.2);
      });
    }

    // rain and lightning
    if (this.rain.visible) {
      const rp = this.rain.geometry.attributes.position;
      for (let i = 0; i < rp.count; i += 2) {
        let y = rp.getY(i) - dt * 70; if (y < 0) y += 80;
        rp.setY(i, y); rp.setY(i + 1, y - 2.4);
      }
      rp.needsUpdate = true;
      if (!REDUCED && (this.nextFlash -= dt) < 0) { this.flash = 1; this.nextFlash = 2.5 + Math.random() * 3; this.onThunder?.(); }
    }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 4); this.hemi.intensity = L.hemi + this.flash * 2.2; }

    this.updateDay(t, dt);
    this.updatePeople(t, dt);
    this.updateParty(t, dt);
    this.vb.update(t, dt, { storm: this.fleeing(), ms: this.day ? this.day.now() - this.day.startAt : 0 });

    // camera: gentle drift, slow orbit in the lobby, pull back for results, nudge toward events
    this.camNudge.lerp(this.camNudgeTarget, 1 - Math.exp(-dt * 1.5));
    this.pull += (this.pullTarget - this.pull) * (1 - Math.exp(-dt * 1.5));
    if (this.mode === 'lobby' && !REDUCED) this.orbit += dt * 0.08; else this.orbit *= Math.exp(-dt * 1.2);
    const drift = REDUCED ? 0 : 1.4;
    const ang = Math.sin(this.orbit) * 0.22;
    const pivot = new THREE.Vector3(0, 0, 0);
    const cb = this.camBase.clone().sub(pivot).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(pivot);
    const lb = this.lookBase.clone().sub(pivot).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(pivot);
    cb.y += this.pull * 4; cb.z += this.pull * 6;
    this.camera.position.set(cb.x + Math.sin(t * 0.21) * drift + this.camNudge.x * 0.4, cb.y + Math.sin(t * 0.17) * drift * 0.5, cb.z + Math.cos(t * 0.13) * drift + this.camNudge.z * 0.3);
    this.camera.lookAt(lb.x + this.camNudge.x, lb.y, lb.z + this.camNudge.z);

    this.renderer.render(this.scene, this.camera);
  }

  /** Beachgoers and spectators come and go with the weather and the fixture; each pops in or out. */
  /** Gulls or a storm: everyone on the beach gets up and runs for it. Towels, parasols and sandcastles stay put. */
  scatterLife() {
    this.scattered = true; this.runners = [];
    for (const g of this.life) {
      if (!g.visible || g.userData.vis < 0.5) continue;
      const u = g.userData;
      const people = u.kind === 'towel' ? [u.figure] : u.kind === 'castle' ? [u.kid] : u.kind === 'pair' || u.kind === 'frisbee' ? [u.pair.a, u.pair.b] : u.kind === 'walker' ? [u.walk.f] : [];
      for (const f of people) {
        const keep = { parent: f.parent, pos: f.position.clone(), rot: f.rotation.clone(), scale: f.scale.clone() };
        this.scene.attach(f);                                   // keep where they are in the world
        f.rotation.set(0, f.rotation.y, 0); f.position.y = 0;   // sunbathers sit up and stand
        f.scale.setScalar(f.userData.baseScale * Math.max(0.6, g.scale.x));
        const side = Math.sign(f.position.x || (Math.random() - 0.5));
        this.runners.push({ f, keep, delay: Math.random() * 0.8, to: new THREE.Vector3(side * (150 + Math.random() * 30), 0, 50 + Math.random() * 30) });
      }
      if (u.kind === 'pair' || u.kind === 'frisbee') u.pair.ball.position.y = 0.3;   // the ball drops where it was
    }
  }
  restoreLife() {
    for (const r of this.runners || []) {
      r.keep.parent.add(r.f); r.f.position.copy(r.keep.pos); r.f.rotation.copy(r.keep.rot); r.f.scale.copy(r.keep.scale); r.f.visible = true;
    }
    this.runners = []; this.scattered = false;
  }
  updateRunners(t, dt) {
    for (const r of this.runners || []) {
      if (!r.f.visible) continue;
      if ((r.delay -= dt) > 0) { animateFigure(r.f, t, { cheer: 0.6, dt }); continue; }   // a startled jump first
      if (this.walkTo(r.f, r.to, 15, dt) < 6) r.f.visible = false;
      animateFigure(r.f, t, { walk: 1, dt });
    }
  }

  updatePeople(t, dt) {
    const { counts, stands } = this.crowdTargets();
    const partyClears = this.partyOn;
    const fleeing = this.fleeing();
    if (fleeing && !this.scattered) this.scatterLife();
    if (this.scattered) this.updateRunners(t, dt);
    const match = !!this.fixture?.match || partyClears;
    // pick the first N of each kind by order, skipping spots the court (or the party) takes up
    const want = new Set();
    const byKind = {};
    for (const g of this.life) (byKind[g.userData.kind] ||= []).push(g);
    for (const [kind, list] of Object.entries(byKind)) {
      const eligible = list.filter(g => !(match && g.userData.central)).sort((a, b) => a.userData.order - b.userData.order);
      eligible.slice(0, counts[kind] || 0).forEach(g => want.add(g));
    }
    const pop = (g, on) => {
      const u = g.userData;
      u.vis = Math.max(0, Math.min(1, u.vis + (on ? dt * 1.6 : -dt * 2.2)));
      g.visible = u.vis > 0.001;
      if (g.visible) g.scale.setScalar(u.base * (on ? easeOutBack(u.vis) : u.vis));
      return g.visible;
    };
    for (const g of this.life) {
      const u = g.userData;
      if (this.scattered) {
        // everyone has run off: towels, parasols and castles stay just as they were; swimmers carry on swimming
        if (!g.visible || u.kind !== 'swimmer') continue;
      } else if (!pop(g, want.has(g))) continue;
      if (u.kind === 'towel') { const f = u.figure; f.position.y = 0.85 + Math.sin(t * 1.5 + u.order * 9) * 0.03; }
      else if (u.kind === 'pair' || u.kind === 'frisbee') {
        const P = u.pair, period = P.type === 'bat' ? 1.1 : 1.7, ph = (t + P.phase) / period, leg = Math.floor(ph), f = ph - leg;
        const from = leg % 2 ? P.b : P.a, to = leg % 2 ? P.a : P.b;
        P.ball.position.set(from.position.x + (to.position.x - from.position.x) * f, (P.type === 'bat' ? 3.2 : 2.6) + Math.sin(f * Math.PI) * (P.type === 'bat' ? 4 : 1.2), Math.sin(f * Math.PI) * 0.5);
        if (P.type === 'frisbee') P.ball.rotation.y += dt * 12;
        for (const [fig, hitting] of [[P.a, leg % 2 === 0 && f < 0.25], [P.b, leg % 2 === 1 && f < 0.25]]) {
          animateFigure(fig, t, { arms: false, bounce: 0.12, dt });
          const catching = (fig === to && f > 0.75);
          poseArms(fig, [0, hitting ? -2.4 + f * 6 : catching ? -1.4 : -0.5], [-0.15, 0.15], dt, 16);
        }
      } else if (u.kind === 'castle') {
        const kid = u.kid; animateFigure(kid, t, { arms: false, bounce: 0.04, dt });
        poseArms(kid, [-1.2 + Math.sin(t * 5) * 0.4, -0.9 - Math.sin(t * 5) * 0.4], [-0.1, 0.1], dt);
      } else if (u.kind === 'swimmer') {
        const s = u.swim; s.f.position.y = -2.3 + Math.sin(t * 1.4 + s.phase) * 0.25;
        poseArms(s.f, [-2.4 + Math.sin(t * 2 + s.phase) * 0.6, -2.4 - Math.sin(t * 2 + s.phase) * 0.6], [-0.4, 0.4], dt, 6);
        g.position.x += Math.sin(t * 0.2 + s.phase) * dt * 0.4;
      } else if (u.kind === 'walker') {
        const w = u.walk;
        g.position.x += w.speed * dt;
        if (g.position.x > 120) w.speed = -Math.abs(w.speed); if (g.position.x < -120) w.speed = Math.abs(w.speed);
        g.rotation.y = w.speed > 0 ? Math.PI / 2 : -Math.PI / 2;
        animateFigure(w.f, t, { walk: 1, dt });
      }
    }
    // the stands: the first N spectators by order, N set by the weather and the stage of the competition
    const n = Math.round(this.spectators.length * stands);
    const storm = this.fleeing();
    const cheer = this.vb.cheer;
    this.spectators.forEach((f, i) => {
      const u = f.userData, on = i < n || (storm && u.vis > 0);
      if (!pop(f, on && !(storm && u.fled))) return;
      if (storm) {
        u.fleeTo ||= new THREE.Vector3(Math.sign(u.home.x || 1) * 130, 0, 70);
        const run = this.walkTo(f, u.fleeTo, 14, dt) > 1;
        if (!run) u.fled = true;
        animateFigure(f, t, { walk: run ? 1 : 0, dt });
      } else {
        u.fled = false; u.fleeTo = null;
        const d = u.home.clone().sub(f.position);
        if (d.length() > 0.3) { f.position.addScaledVector(d.normalize(), dt * 14); animateFigure(f, t, { walk: 1, dt }); f.rotation.y = Math.atan2(d.x, d.z); }
        else { f.lookAt(this.vb.ball.position.x, 0, this.vb.ball.position.z); animateFigure(f, t, { cheer: cheer * ((i % 3) ? 1 : 0.5), dt }); }
      }
    });
  }

  updateDay(t, dt) {
    const day = this.day;
    const st = day ? day.now() - day.startAt : 0;
    const ev = day?.script.event;
    const vanOn = ev?.type === 'van' && st >= ev.atMs;
    // bars' queues follow the script; while the juice van is out, the back of each queue drifts over to it
    for (const bar of this.bars) {
      if (!bar) continue;
      let qn = 0;
      if (day && !bar.boarded) {
        const b = day.script.bars.find(x => x.slot === bar.slot);
        if (b) {
          const sold = b.saleTimesMs.length, served = b.saleTimesMs.filter(x => x <= st).length, rem = sold - served;
          qn = sold === 0 ? 0 : rem > 0 ? Math.max(1, Math.ceil(rem / Math.max(1, sold / 6))) : 0;
          if (vanOn && this.vanParked && qn > 1) qn = Math.max(1, Math.ceil(qn * 0.45));
          if (served > (day.served[bar.slot] || 0)) day.hooks.onSale?.(bar.slot, served);
          day.served[bar.slot] = served;
          if (st > 300 && !bar.price.visible) { bar.price.visible = true; bar.price.userData.pop = 0; }
        }
      }
      if (bar.queue.length !== qn) this.setQueue(bar, qn, vanOn && this.vanParked);
      bar.queue.forEach((f, i) => {
        const target = this.queueSpot(bar, i);
        const d = target.sub(f.position); const dist = d.length();
        if (f.userData.pop === 0) f.position.copy(f.userData.origin);
        f.userData.pop = Math.min(1, f.userData.pop + dt * 2);
        if (dist > 0.2) { this.walkTo(f, target.add(f.position), 12, dt); animateFigure(f, t, { walk: 1, dt }); }
        else { f.lookAt(bar.group.position.x, 0, bar.group.position.z); animateFigure(f, t, { bounce: 0.1, dt }); }
      });
      bar.leavers = bar.leavers.filter(f => this.stroll(f, f.userData.origin, t, dt));
      if (bar.price.visible) { bar.price.rotation.y = Math.atan2(this.camera.position.x - bar.group.position.x, this.camera.position.z - bar.group.position.z) - bar.group.rotation.y; }
      if (bar.price.visible) { bar.price.userData.pop = Math.min(1, (bar.price.userData.pop || 0) + dt * 3); const p = bar.price.userData.pop; const base = bar.price.userData.base ||= bar.price.scale.clone(); bar.price.scale.copy(base).multiplyScalar(p < 1 ? 1 + Math.sin(p * Math.PI) * 0.3 : 1); }
    }
    // customers who defected walk over and crowd round the van
    for (const f of this.defectors) {
      const dist = f.position.distanceTo(f.userData.van.spot);
      if (dist > 0.3) { this.walkTo(f, f.userData.van.spot, 13, dt); animateFigure(f, t, { walk: 1, dt }); }
      else { f.lookAt(this.van.position.x, 0, this.van.position.z); animateFigure(f, t, { cheer: 0.3, dt }); }
    }
    // customers who reach the front and walk away: too dear, off to a cheaper bar, or sold out
    if (day) for (const b of day.script.bars) {
      const bar = this.bars[b.slot]; if (!bar || bar.boarded || !b.walkaways) continue;
      b.walkaways.forEach((w, k) => { const key = b.slot + ':' + k; if (st >= w.atMs && !day.spawned.has(key)) { day.spawned.add(key); this.spawnWalkAway(bar, w, k); } });
    }
    this.walkAways = (this.walkAways || []).filter(w => this.stepWalkAway(w, t, dt));
    this.van.visible = false; this.gulls.forEach(g => g.visible = false); this.vanParked = false;
    this.camNudgeTarget.set(0, 0, 0);
    if (!day) return;
    while (day.chimeIdx < day.chimes.length && st >= day.chimes[day.chimeIdx]) { day.chimeIdx++; day.hooks.onChime?.(); }
    if (ev && st >= ev.atMs) {
      if (!day.eventFired) {
        day.eventFired = true; day.hooks.onEvent?.(ev); this.vb.onEvent(ev.type);
        if (ev.type === 'extra' && !day.script.fixture.match) this.startParty();
      }
      const et = (st - ev.atMs) / 1000;
      if (ev.type === 'van') {
        // drives in along the front of the beach and parks between the two front bars, hatch to the beach
        this.van.visible = true;
        this.vanPark = { x: 0, z: 34 };
        const x = Math.min(this.vanPark.x, -130 + et * 55);
        this.van.position.set(x, 0, this.vanPark.z); this.van.rotation.y = 0;
        this.vanWheels.forEach(w => w.rotation.y = x < this.vanPark.x ? -et * 8 : 0);
        this.vanParked = x >= this.vanPark.x;
        animateFigure(this.vendor, t, { cheer: this.vanParked ? 0.5 : 0, dt });
        this.camNudgeTarget.set(x * 0.15, 0, 6);
      }
      if (ev.type === 'gulls' && et < 7) {
        this.gulls.forEach((g, i) => {
          g.visible = true;
          const a = et * 1.4 + (i / 7) * Math.PI * 2, swoop = Math.max(0, Math.sin(et * 1.8 + i));
          const r = 22 + Math.sin(i * 3) * 8;
          g.position.set(Math.cos(a) * r * 1.6, 22 - swoop * 15 + Math.sin(et * 3 + i) * 1.5, Math.sin(a) * r * 0.7);
          g.rotation.y = -a - Math.PI / 2; g.rotation.z = -swoop * 0.5;
          const flap = Math.sin(et * 14 + g.userData.phase) * 0.7; g.userData.wl.rotation.y = flap; g.userData.wr.rotation.y = -flap;
        });
        this.camNudgeTarget.set(0, 0, 2);
      }
    }
  }

  spawnWalkAway(bar, w, k = 0) {
    const f = figure({ shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)], shorts: '#1f2937', scale: 0.9, eyes: false });
    const at = this.queueSpot(bar, k % 2); const side = new THREE.Vector3(-bar.front.z, 0, bar.front.x).multiplyScalar(k % 2 ? 2.2 : -2.2);
    f.position.set(at.x + side.x, 0, at.z + side.z);
    f.lookAt(bar.group.position.x, 0, bar.group.position.z);
    const rival = w.reason === 'cheaper' ? this.bars[w.to] : null;
    const text = w.reason === 'price' ? '💸 Too dear!' : w.reason === 'soldout' ? '🚫 Sold out!' : `👉 Cheaper at ${LETTERS[w.to]}`;
    const bubble = labelSprite(text, { bg: rival ? rival.colour : '#ffffff', fg: rival ? '#ffffff' : '#123c4a', size: 56, pad: 22, scale: 0.04 });
    bubble.material.depthTest = false; bubble.renderOrder = 30;          // always readable, even behind a roof
    bubble.position.set(0, 7.6 + (k % 2) * 2.6, 0);          // staggered, so two at once don't overlap
    bubble.userData.base = bubble.scale.clone(); bubble.scale.setScalar(0.001);
    f.add(bubble);
    this.scene.add(f);
    const away = bar.front.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.8));
    this.walkAways ||= [];
    this.walkAways.push({ f, w, bubble, t: 0, away, rival, origin: this.customerOrigin(bar), target: rival ? this.queueSpot(rival, 5 + Math.floor(Math.random() * 2)) : null });
  }
  /** Stand at the front and shake the head with the reason overhead, then go back to where they were.
   *  Anyone off to a cheaper bar queues there, buys, and takes that bar's cocktail back with them. */
  stepWalkAway(o, t, dt) {
    o.t += dt;
    const f = o.f, b = o.bubble;
    const pop = Math.min(1, o.t / 0.3), fade = Math.max(0, 1 - Math.max(0, o.t - 2.4) / 0.4);
    b.scale.copy(b.userData.base).multiplyScalar(easeOutBack(pop) * fade + 0.001);
    if (o.t < 0.8 && !this.fleeing()) {
      f.rotation.y += Math.sin(o.t * 18) * 0.06;                  // a shake of the head
      animateFigure(f, t, { bounce: 0.05, dt });
      return true;
    }
    if (o.target && !o.bought) {
      if (f.position.distanceTo(o.target) > 0.6 && !this.fleeing() && (o.tWalk = (o.tWalk || 0) + dt) < 6) {
        this.walkTo(f, o.target, 10, dt);
        animateFigure(f, t, { walk: 1, dt });
        return true;
      }
      o.waited = (o.waited || 0) + dt;
      if (o.waited < 1.4 && !this.fleeing()) { f.lookAt(o.rival.group.position.x, 0, o.rival.group.position.z); animateFigure(f, t, { bounce: 0.08, dt }); return true; }
      o.bought = true; if (!this.fleeing()) this.giveDrink(f, o.rival.colour);
    }
    return this.stroll(f, o.origin, t, dt);
  }

  qualityCheck(dt) {
    // quality tiers: drop resolution, then shadows, if the frame rate sags (measured over the last two seconds)
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
