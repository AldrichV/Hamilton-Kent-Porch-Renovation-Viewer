import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { buildModel, W as modelPt, FT } from './model.js';
import { buildSolids } from './solids.js';
import { buildTreadDesign, BOARD, RISER, TOPZ } from './treads.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.screenSpacePanning = true;

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() } };
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top, horizon, ground; varying vec3 vDir;
    void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, h), 0.8)) : mix(horizon, ground, smoothstep(0.0, 0.25, -h));
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
skyDome.renderOrder = -1; skyDome.frustumCulled = false; scene.add(skyDome);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function buildEnvironment() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat.clone()));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  disc.material.color.setScalar(6); disc.position.set(-25, 35, 20); disc.lookAt(0, 0, 0); env.add(disc);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(env, 0.04); scene.environment = envRT.texture; scene.environmentIntensity = 0.55;
}
function applyTheme() {
  const horizon = new THREE.Color(cssVar('--sky') || '#dfe4e7');
  skyUniforms.horizon.value.copy(horizon);
  skyUniforms.top.value.set(cssVar('--sky-top') || '#9fb8cc');
  skyUniforms.ground.value.set(cssVar('--sky-ground') || '#c9ccc6');
  scene.background = horizon; scene.fog = new THREE.Fog(horizon, 380, 1100);
  buildEnvironment();
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const hemi = new THREE.HemisphereLight(0xeef3f8, 0x8d877a, 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1de, 1.25);
const model = buildModel();
const SITE_C = new THREE.Vector3(66, 0, 8);
sun.position.copy(SITE_C).add(new THREE.Vector3(-95, 150, 70));
sun.target.position.copy(SITE_C);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -105, right: 105, top: 105, bottom: -105, near: 20, far: 420 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
scene.add(sun, sun.target);

// ---------- model ----------
scene.add(model.common, model.existing, model.proposed, model.belowGrade, model.demolition);

// ---------- revised stair (Carlingview Stair Treads study, shop dwgs SD-01/02) ----------
const tread = { mode: 'revised', W: 44, tgt: 12, col: 'brown', rcol: 'charcoal', lift: 0, glass: true, rail: true, hl: true, treads: true, risers: true };
const LAND_S = 20.53;                              // south edge of the landing that stays (ft, model frame)
const FOOT_Y = LAND_S - TOPZ / 12;                 // bottom riser line of the revised stair, ~1'-10⅜" south of the drawn one
const treadHolder = new THREE.Group();
treadHolder.position.copy(modelPt(3.095, FOOT_Y, 1.875)); // centred on the 6'-2¼" walk, walk level
treadHolder.rotation.y = Math.PI; treadHolder.scale.setScalar(0.0254); // study frame is inches, running up toward drawing north
model.proposed.add(treadHolder);
// the drawn walk stops at the drawn stair foot; the longer stair needs the walk carried to its own foot
const walkExt = new THREE.Mesh(new THREE.BoxGeometry(6.19 * FT, 0.33 * FT, (12.2 - FOOT_Y + 0.05) * FT), model.M.concNew);
walkExt.position.copy(modelPt(3.095, (12.2 + FOOT_Y) / 2, 1.875 - 0.165)); walkExt.receiveShadow = true;
model.proposed.add(walkExt);
let treadBuilt = null;
const frac = (x) => { const w = Math.floor(x + 1e-6), q = Math.round((x - w) * 16); const f = { 0: '', 2: '⅛', 4: '¼', 6: '⅜', 8: '½', 10: '⅝', 12: '¾', 14: '⅞' }[q]; return f === undefined ? x.toFixed(2) + '"' : (w || '') + f + '"'; };
function rebuildTreads() {
  if (treadBuilt) { treadBuilt.root.traverse(o => o.geometry && o.geometry.dispose()); treadHolder.remove(treadBuilt.root); }
  treadBuilt = buildTreadDesign(tread); treadHolder.add(treadBuilt.root);
  const c = treadBuilt.check;
  $('#tread-desc').textContent = `Welded L2×2×¼ frame ${frac(c.fw)} wide with L1½×1½×3/16 bearers and a 3/16" riser plate. Two Trex Select 2×6 boards (${BOARD[tread.col].name.toLowerCase()}) per tread, 9/16" Trex fascia risers (${RISER[tread.rcol].name.toLowerCase()}), ¼" nosing overhang.`;
  $('#tread-chips').innerHTML = `<span class="chip pass">Rise 6⅞" ≤ 180 mm</span><span class="chip pass">Run 11⅛" ≥ 280 mm</span><span class="chip ${c.ok ? 'pass' : 'fail'}">Supports ${frac(c.sp)} o.c.</span><span class="chip info">${c.n + 1} supports per tread</span>`;
}

// ---------- LiDAR ----------
const lidar = { terrain: null, trees: null, points: null, pointMat: null, colorSets: {} };
async function getBin(path, onBytes) {
  let r = await fetch(path);
  if (!r.ok && path.endsWith('.bin')) r = await fetch(path.replace(/\.bin$/, '.bin.wasm')); // preview host serves binaries under .wasm
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const buf = await r.arrayBuffer(); onBytes && onBytes(buf.byteLength); return buf;
}

function buildTerrain(meta, hBuf, cBuf) {
  const { Nu, Nv, u0, v0, res, base } = meta;
  const h = new Uint16Array(hBuf), c = new Uint8Array(cBuf);
  // grid vertices, then a ring of base vertices for the site-model skirt
  const ring = [];
  for (let i = 0; i < Nu; i++) ring.push(i);                       // south edge, west to east
  for (let j = 1; j < Nv; j++) ring.push(j * Nu + Nu - 1);          // east edge
  for (let i = Nu - 2; i >= 0; i--) ring.push((Nv - 1) * Nu + i);   // north edge
  for (let j = Nv - 2; j >= 1; j--) ring.push(j * Nu);              // west edge
  const NV = Nu * Nv + ring.length;
  const pos = new Float32Array(NV * 3), col = new Float32Array(NV * 3);
  const asphalt = new THREE.Color(0x4b4e51), light = new THREE.Color(0x9fa58a), roof = new THREE.Color(0xd2cfc8), bridge = new THREE.Color(0x98a2ab);
  const tmp = new THREE.Color();
  for (let j = 0; j < Nv; j++) for (let i = 0; i < Nu; i++) {
    const k = j * Nu + i;
    pos[k * 3] = u0 + i * res; pos[k * 3 + 1] = h[k] / 100 + base + DZ; pos[k * 3 + 2] = -(v0 + j * res);
    const cls = c[k * 2 + 1];
    if (cls === 1) tmp.copy(roof); else if (cls === 2) tmp.copy(bridge);
    else tmp.copy(asphalt).lerp(light, Math.pow(c[k * 2] / 250, 1.3));
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  const BASE_Y = -2.5;
  ring.forEach((k, r) => { const q = Nu * Nv + r; pos[q * 3] = pos[k * 3]; pos[q * 3 + 1] = BASE_Y; pos[q * 3 + 2] = pos[k * 3 + 2]; col[q * 3] = 0.31; col[q * 3 + 1] = 0.29; col[q * 3 + 2] = 0.27; });
  const idx = new Uint32Array((Nu - 1) * (Nv - 1) * 6 + ring.length * 6); let n = 0;
  for (let j = 0; j < Nv - 1; j++) for (let i = 0; i < Nu - 1; i++) {
    const a = j * Nu + i, b = a + 1, d = a + Nu, e = d + 1;
    idx.set([a, b, d, b, e, d], n); n += 6;
  }
  for (let r = 0; r < ring.length; r++) {
    const t0 = ring[r], t1 = ring[(r + 1) % ring.length], b0 = Nu * Nv + r, b1 = Nu * Nv + (r + 1) % ring.length;
    idx.set([t0, b0, t1, t1, b0, b1], n); n += 6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  // UVs into the plan-aligned aerial texture, and a wall weight (0 ground/roof, 1 wall, 2 site base)
  const uv = new Float32Array(NV * 2), wall = new Float32Array(NV), nrm = g.getAttribute('normal').array;
  for (let k = 0; k < NV; k++) {
    const u = pos[k * 3], v = -pos[k * 3 + 2];
    uv[k * 2] = (u - ORTHO.u0) / (ORTHO.u1 - ORTHO.u0); uv[k * 2 + 1] = (v - ORTHO.v0) / (ORTHO.v1 - ORTHO.v0);
    const ny = nrm[k * 3 + 1]; wall[k] = k >= Nu * Nv ? 2 : 1 - THREE.MathUtils.smoothstep(ny, 0.45, 0.8);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aWall', new THREE.BufferAttribute(wall, 1));
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  m.userData.uPhoto = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPhoto = m.userData.uPhoto;
    sh.vertexShader = 'attribute float aWall;\nvarying float vWall;\nvarying vec3 vWorld;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = aWall;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uPhoto;\nvarying float vWall;\nvarying vec3 vWorld;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  vec3 fN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  normal = normalize(mix(normal, fN, smoothstep(0.35, 0.6, vWall)));`)
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor.rgb *= mix(vec3(1.0), texture2D(map, vMapUv).rgb, uPhoto);\n#endif')
      .replace('#include <color_fragment>', '#ifdef USE_COLOR\n  diffuseColor.rgb *= mix(vColor.rgb, vec3(1.0), uPhoto);\n#endif\n' + `
  // close-range detail: two octaves of value noise over the photo, faded out with distance
  vec2 gp = vWorld.xz * 7.0;
  vec2 gi = floor(gp), gf = fract(gp); gf = gf * gf * (3.0 - 2.0 * gf);
  #define H2(p) fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453)
  float vn = mix(mix(H2(gi), H2(gi + vec2(1, 0)), gf.x), mix(H2(gi + vec2(0, 1)), H2(gi + vec2(1, 1)), gf.x), gf.y);
  vec2 gp2 = gp * 3.1; vec2 gi2 = floor(gp2), gf2 = fract(gp2);
  float vn2 = mix(mix(H2(gi2), H2(gi2 + vec2(1, 0)), gf2.x), mix(H2(gi2 + vec2(0, 1)), H2(gi2 + vec2(1, 1)), gf2.x), gf2.y);
  float detail = (vn * 0.6 + vn2 * 0.4 - 0.5) * (1.0 - smoothstep(12.0, 45.0, length(vViewPosition))) * (1.0 - clamp(vWall, 0.0, 1.0));
  diffuseColor.rgb *= 1.0 + detail * 0.16 * uPhoto;
  float wallW = clamp(vWall, 0.0, 1.0);
  float d = abs(fract((vWorld.x - vWorld.z) / 2.44) - 0.5);
  float joint = smoothstep(0.475, 0.492, d);
  vec3 wallC = vec3(0.71, 0.69, 0.65) * (1.0 - 0.13 * joint) * mix(0.78, 1.0, smoothstep(0.4, 2.6, vWorld.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, wallC, wallW * mix(0.35, 1.0, uPhoto));
  float baseW = smoothstep(1.25, 1.6, vWall);
  float band = smoothstep(-0.25, -0.05, vWorld.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.27, 0.255, 0.24), vec3(0.42, 0.40, 0.37), band), baseW);`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

const DZ = 0.0; // vertical adjustment of LiDAR to project datum (m)
const ROT = THREE.MathUtils.degToRad(18); // plan frame is UTM rotated 18 degrees
const ORTHO = { url: 'data/ortho.jpg', u0: -14, u1: 152, v0: -64, v1: 46 }; // SCOOP 2023, resampled to the plan frame at 6.25 cm, graded and sharpened
let orthoPixels = null; // { data, size } for colouring points by photo
async function loadOrtho() {
  const img = new Image(); img.src = ORTHO.url; await img.decode();
  const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  orthoPixels = { data: cx.getImageData(0, 0, cv.width, cv.height).data, size: cv.width, h: cv.height };
  return tex;
}
function photoAt(u, v, out) {
  const Wd = orthoPixels.size, Hd = orthoPixels.h;
  const c = Math.floor((u - ORTHO.u0) / (ORTHO.u1 - ORTHO.u0) * Wd), r = Math.floor((ORTHO.v1 - v) / (ORTHO.v1 - ORTHO.v0) * Hd);
  if (c < 0 || r < 0 || c >= Wd || r >= Hd) return false;
  const o = (r * Wd + c) * 4; out.setRGB(orthoPixels.data[o] / 255, orthoPixels.data[o + 1] / 255, orthoPixels.data[o + 2] / 255, THREE.SRGBColorSpace);
  return true;
}
const pointVS = `
  uniform float uSize, uScale, uMax; uniform int uHideDemo, uHideRoof;
  attribute vec3 color; varying vec3 vC;
  void main() {
    vec3 p = position; float u = p.x, v = -p.z, h = p.y;
    bool hide = (uHideDemo == 1 && u > 3.0 && u < 8.6 && v > -16.6 && v < 0.4 && h > 0.85 && h < 4.4)
             || (uHideRoof == 1 && u > 5.6 && u < 12.0 && v > -17.0 && v < 2.8 && h > 5.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = hide ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
    gl_PointSize = hide ? 0.0 : clamp(uSize * uScale / -mv.z, 1.5, uMax);
    vC = color;
  }`;
const pointFS = `
  varying vec3 vC;
  void main() { vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vC, 1.0);
  #include <colorspace_fragment>
  }`;

function makePointMat(size, max = 7.0) {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uMax: { value: max }, uScale: { value: 500 }, uHideDemo: { value: 0 }, uHideRoof: { value: 0 } },
    vertexShader: pointVS, fragmentShader: pointFS,
  });
}

function decodePoints(buf) {
  const n = buf.byteLength / 8, dv = new DataView(buf);
  const pos = new Float32Array(n * 3), inten = new Uint8Array(n), cls = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 8;
    pos[i * 3] = dv.getInt16(o, true) / 100;
    pos[i * 3 + 2] = -dv.getInt16(o + 2, true) / 100;
    pos[i * 3 + 1] = dv.getInt16(o + 4, true) / 100 + DZ;
    inten[i] = dv.getUint8(o + 6); cls[i] = dv.getUint8(o + 7);
  }
  return { n, pos, inten, cls };
}

const CLASS_COL = { 1: 0x5f8f4e, 2: 0xa39c8a, 6: 0xc98a7a, 17: 0x6e8fb3 };
function colorize(P, mode) {
  const col = new Float32Array(P.n * 3), c = new THREE.Color(), lo = new THREE.Color(0x2b4a6f), hi = new THREE.Color(0xf1c27d);
  for (let i = 0; i < P.n; i++) {
    if (mode === 'class') { c.setHex(CLASS_COL[P.cls[i]] ?? 0x999999); const s = 0.75 + 0.5 * P.inten[i] / 255; c.multiplyScalar(Math.min(s, 1.15)); }
    else if (mode === 'photo' && orthoPixels) { if (!photoAt(P.pos[i * 3], -P.pos[i * 3 + 2], c)) c.setHex(0x999999); }
    else if (mode === 'intensity') { const t = P.inten[i] / 255; c.setRGB(t, t, t * 0.95 + 0.04); }
    else { const t = Math.min(1, Math.max(0, (P.pos[i * 3 + 1] + 1) / 14)); c.copy(lo).lerp(hi, t); }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  return col;
}

function makeTrees(P) {
  const col = new Float32Array(P.n * 3), c = new THREE.Color();
  for (let i = 0; i < P.n; i++) {
    const t = P.inten[i] / 255, hh = P.pos[i * 3 + 1];
    if (!(orthoPixels && photoAt(P.pos[i * 3], -P.pos[i * 3 + 2], c))) c.setHSL(0.27 + 0.05 * t, 0.38, 0.22 + 0.22 * t + Math.min(hh, 12) * 0.006);
    else c.multiplyScalar(0.8 + 0.35 * t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = makePointMat(0.34, 16.0);
  return new THREE.Points(g, mat);
}

// ---------- state ----------
const state = { phase: 'proposed', lidar: 'surface', colour: 'photo', layers: {} };
try { const s = JSON.parse(localStorage.getItem('carlingview-view') || '{}'); Object.assign(state, s, { layers: { ...state.layers, ...(s.layers || {}) } }); } catch {}
state.lidar = 'surface'; // LiDAR display controls removed; the site shows as surface, solids and trees
const save = () => { try { localStorage.setItem('carlingview-view', JSON.stringify(state)); } catch {} };

function setNewWorkHighlight(on) {
  const accent = new THREE.Color(cssVar('--new-3d') || '#d9822b');
  model.newWork.forEach(m => { m.color.setHex(m.userData.base); if (on) m.color.lerp(accent, m === model.M.concNew ? 0.45 : 0.7); });
}

function apply() {
  const L = (id) => $('#' + id).checked;
  const prop = state.phase === 'proposed';
  model.existing.visible = !prop;
  model.proposed.visible = prop;
  model.structure.visible = L('lay-structure');
  model.demolition.visible = prop && L('lay-demo');
  model.belowGrade.visible = prop && L('lay-xray');
  model.overhang.visible = true;
  if (lidar.terrain) {
    lidar.terrain.visible = state.lidar !== 'points';
    const m = lidar.terrain.material; const x = L('lay-xray');
    m.transparent = x; m.opacity = x ? 0.45 : 1; m.depthWrite = !x; m.needsUpdate = true;
  }
  if (lidar.terrain) lidar.terrain.material.userData.uPhoto.value = lidar.terrain.material.map ? 1 : 0;
  if (lidar.solids) {
    lidar.solids.group.visible = true;
    lidar.solids.materials.roof.map = lidar.terrain.material.map; lidar.solids.materials.roof.needsUpdate = true;
  }
  if (lidar.trees) lidar.trees.visible = true;
  if (lidar.points) {
    lidar.points.visible = state.lidar !== 'surface';
    lidar.pointMat.uniforms.uHideDemo.value = prop ? 1 : 0;
  }
  const comp = tread.mode === 'revised';
  model.stair.visible = !comp; treadHolder.visible = comp; walkExt.visible = comp;
  $('#tread-opts').hidden = !comp || !prop; $('#tread-field').hidden = !prop;
  document.querySelectorAll('[data-tread]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tread === tread.mode)));
  setNewWorkHighlight(prop && L('lay-new'));
  document.querySelectorAll('[data-phase]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.phase === state.phase)));
  $('#phase-note').textContent = prop
    ? (tread.mode === 'revised'
      ? 'Revised stair from shop drawings SD-01/02 (OBC 2024 Part 3) on the porch from A1.1 and S1.0.'
      : 'Drawings A1.1, S1.0 and S2.0: straight steel stair inside the porch footprint, new walk at grade.')
    : 'Existing porch and two-flight concrete stair as drawn on A1.1, over the May 2023 LiDAR survey.';
  document.body.dataset.phase = state.phase;
  buildLabels(); save();
}

// ---------- labels ----------
const labelHost = $('#labels'); let labelEls = [];
function buildLabels() {
  labelHost.replaceChildren(); labelEls = [];
  if (!$('#lay-labels').checked) return;
  let list = [...model.labels.common, ...model.labels[state.phase]];
  if (state.phase === 'proposed' && tread.mode === 'revised') list = list.map(l => l.t.startsWith('New steel stair')
    ? { ...l, p: modelPt(3.1, FOOT_Y + 4.6, 6.4), t: 'Revised stair SD-01 · 12R @ 6⅞" · 11T @ 11⅛"' } : l);
  for (const l of list) {
    if (l.cls === 'demo' && !$('#lay-demo').checked && state.phase === 'proposed') continue;
    const el = document.createElement('div'); el.className = 'tag ' + (l.cls || ''); el.textContent = l.t;
    labelHost.appendChild(el); labelEls.push({ el, p: l.p });
  }
}
const v3 = new THREE.Vector3();
function placeLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  for (const { el, p } of labelEls) {
    v3.copy(p).project(camera);
    const off = v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1;
    const d = camera.position.distanceTo(p);
    el.hidden = off || d > 90;
    if (!el.hidden) el.style.transform = `translate(${(v3.x + 1) / 2 * w}px, ${(1 - v3.y) / 2 * h}px) translate(-50%, -100%)`;
  }
}

// ---------- views ----------
const F = model.focus;
const views = {
  porch: { pos: [-9, 5.5, 15], tgt: [7.2, 2.2, 3.2] },
  elevation: { pos: [-16, 3.2, 6], tgt: [8, 3.0, 6] },
  plan: { pos: [6, 48, 6.01], tgt: [6, 0, 6] },
  site: { pos: [-80, 95, 115], tgt: [45, 0, 6] },
};
let tween = null;
function goView(name, instant = false) {
  const v = views[name]; if (!v) return;
  const to = { p: new THREE.Vector3(...v.pos), t: new THREE.Vector3(...v.tgt) };
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { camera.position.copy(to.p); controls.target.copy(to.t); controls.update(); return; }
  tween = { from: { p: camera.position.clone(), t: controls.target.clone() }, to, t0: performance.now(), dur: 900 };
}

// ---------- UI wiring ----------
const layerIds = ['lay-structure', 'lay-new', 'lay-demo', 'lay-xray', 'lay-labels'];
layerIds.forEach(id => { const el = $('#' + id); if (id in state.layers) el.checked = state.layers[id];
  el.addEventListener('change', () => { state.layers[id] = el.checked; apply(); }); });
document.querySelectorAll('[data-phase]').forEach(b => b.addEventListener('click', () => { state.phase = b.dataset.phase; apply(); }));
document.querySelectorAll('[data-tread]').forEach(b => b.addEventListener('click', () => { tread.mode = b.dataset.tread; apply(); }));
$('#tr-col').addEventListener('change', (e) => { tread.col = e.target.value; rebuildTreads(); });
$('#tr-rcol').addEventListener('change', (e) => { tread.rcol = e.target.value; rebuildTreads(); });
$('#tr-w').addEventListener('input', (e) => { tread.W = +e.target.value; $('#tr-w-out').textContent = tread.W + '"'; rebuildTreads(); });
$('#tr-tgt').addEventListener('change', (e) => { tread.tgt = +e.target.value; rebuildTreads(); });
$('#tr-lift').addEventListener('input', (e) => { tread.lift = +e.target.value; $('#tr-lift-out').textContent = tread.lift + '"'; rebuildTreads(); });
[['tr-glass', 'glass'], ['tr-rail', 'rail'], ['tr-treads', 'treads'], ['tr-risers', 'risers'], ['tr-hl', 'hl']].forEach(([id, k]) => $('#' + id).addEventListener('change', (e) => { tread[k] = e.target.checked; rebuildTreads(); }));
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => goView(b.dataset.view)));
$('#panel-toggle').addEventListener('click', () => { const p = $('#panel'); const c = p.classList.toggle('collapsed'); $('#panel-toggle').setAttribute('aria-expanded', String(!c)); $('#panel-toggle').textContent = c ? 'Show' : 'Hide'; });
addEventListener('keydown', (e) => { if (e.target.closest('input,button')) return;
  if (e.key === 'e') { state.phase = 'existing'; apply(); } if (e.key === 'p') { state.phase = 'proposed'; apply(); } });

// ---------- loading ----------
const status = $('#status');
let pointsData = null, pointsLoading = null;
async function ensurePoints() {
  if (state.lidar === 'surface' || lidar.points) return;
  if (!pointsLoading) pointsLoading = (async () => {
    status.hidden = false; status.textContent = 'Loading LiDAR points…';
    pointsData = decodePoints(await getBin('data/points.bin'));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pointsData.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colorize(pointsData, state.colour), 3));
    lidar.pointMat = makePointMat(0.09, 6.0);
    lidar.points = new THREE.Points(g, lidar.pointMat); lidar.points.frustumCulled = false;
    scene.add(lidar.points); resize(); status.hidden = true;
  })();
  return pointsLoading;
}
function recolour() {
  if (!lidar.points) return;
  lidar.points.geometry.getAttribute('color').array.set(colorize(pointsData, state.colour));
  lidar.points.geometry.getAttribute('color').needsUpdate = true;
}

async function load() {
  try {
    status.textContent = 'Loading terrain from LiDAR…';
    const meta = await (await fetch('data/meta.json')).json();
    const [h, c, veg] = await Promise.all([getBin('data/terrain_h.bin'), getBin('data/terrain_c.bin'), getBin('data/veg.bin')]);
    lidar.terrain = buildTerrain(meta, h, c); scene.add(lidar.terrain);
    let photoTex = null;
    try { photoTex = await loadOrtho(); lidar.terrain.material.map = photoTex; lidar.terrain.material.needsUpdate = true; recolour(); }
    catch {}
    try {
      const sd = await (await fetch('data/solids.json')).json();
      lidar.solids = buildSolids(sd, { roofMap: photoTex, ortho: ORTHO, envIntensity: 0.8 });
      scene.add(lidar.solids.group);
    } catch (e) { console.warn('solids', e); }
    lidar.trees = makeTrees(decodePoints(veg)); scene.add(lidar.trees);
    status.hidden = true;
    await ensurePoints(); resize(); apply();
  } catch (err) {
    status.hidden = false;
    status.textContent = 'The LiDAR files did not load (' + err.message + '). The drawing model is still shown.';
  }
}

// ---------- compass ----------
const compass = $('#compass-needle');
function updateCompass() {
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  const az = Math.atan2(d.x, -d.z); // camera heading in plan frame, 0 = plan north
  compass.style.transform = `rotate(${-az * 180 / Math.PI}deg)`;
}

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const scale = h * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  [lidar.pointMat, lidar.trees?.material].forEach(m => m && (m.uniforms.uScale.value = scale));
}
new ResizeObserver(resize).observe(canvas);

function frame(now) {
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(tween.from.p, tween.to.p, e); controls.target.lerpVectors(tween.from.t, tween.to.t, e);
    if (k === 1) tween = null;
  }
  controls.update(); renderer.render(scene, camera); placeLabels(); updateCompass();
  requestAnimationFrame(frame);
}

rebuildTreads();
if (innerWidth < 700) { $('#panel').classList.add('collapsed'); $('#panel-toggle').setAttribute('aria-expanded', 'false'); $('#panel-toggle').textContent = 'Show'; }
goView('porch', true); resize(); apply(); requestAnimationFrame(frame); load();
window.__viewer = { scene, camera, controls, goView, state, apply };
