// Porch and stair geometry built from the Nassar Engineering drawings (A1.1, A2.0, S1.0, S2.0, Aug 02 2026).
// Model frame: X = feet east (plan), Y = feet north (plan), Z = feet above project datum 0'-0".
// Origin: west edge of the existing porch (A1.1) at the north edge of the existing stair.
// Placement on the LiDAR was fitted to the existing stair landing visible in the 2023 survey.
import * as THREE from './vendor/three.module.js';

export const FT = 0.3048;
const U0 = 6.6, V0 = -8.5; // metres, plan frame (u east, v north) of the model origin

export function W(X, Y, Z) { return new THREE.Vector3(U0 + X * FT, Z * FT, -(V0 + Y * FT)); }

function box(X0, X1, Y0, Y1, Z0, Z1, mat) {
  const [xa, xb] = [Math.min(X0, X1), Math.max(X0, X1)];
  const [ya, yb] = [Math.min(Y0, Y1), Math.max(Y0, Y1)];
  const [za, zb] = [Math.min(Z0, Z1), Math.max(Z0, Z1)];
  const g = new THREE.BoxGeometry((xb - xa) * FT, (zb - za) * FT, (yb - ya) * FT);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(W((xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function bar(p1, p2, size, mat, round = false) {
  const d = new THREE.Vector3().subVectors(p2, p1); const len = d.length();
  const g = round ? new THREE.CylinderGeometry(size / 2, size / 2, len, 8) : new THREE.BoxGeometry(size, len, size);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(p1).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

// Wide-flange beam (feet), axis 'X' or 'Y', top of steel at zTop
function wBeam(axis, a0, a1, c, zTop, depthIn, flangeIn, mat) {
  const d = depthIn / 12, bf = flangeIn / 12, tf = 0.05, tw = 0.03;
  const g = new THREE.Group();
  const mk = (w, z0, z1) => axis === 'Y'
    ? box(c - w / 2, c + w / 2, a0, a1, z0, z1, mat)
    : box(a0, a1, c - w / 2, c + w / 2, z0, z1, mat);
  g.add(mk(bf, zTop - tf, zTop), mk(tw, zTop - d + tf, zTop - tf), mk(bf, zTop - d, zTop - d + tf));
  return g;
}

function grainTexture(base, amp, seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), img = x.createImageData(256, 256);
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 256 * 256; i++) {
    const n = (rnd() + rnd() + rnd()) / 3 - 0.5, v = Math.max(0, Math.min(255, base + n * amp));
    img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.985; img.data[i * 4 + 2] = v * 0.96; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function diamondTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#9aa1a7'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = '#c9ced2'; x.lineWidth = 3; x.lineCap = 'round';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = i * 16 + (j % 2 ? 8 : 0), cy = j * 16;
    x.beginPath(); x.moveTo(cx - 4, cy + 4); x.lineTo(cx + 4, cy - 4); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 1.5);
  t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildModel() {
  const M = {
    concOld: new THREE.MeshStandardMaterial({ color: 0xc4beb3, roughness: 0.95, map: grainTexture(232, 46, 7) }),
    concNew: new THREE.MeshStandardMaterial({ color: 0xe6e2d9, roughness: 0.9, map: grainTexture(238, 30, 11) }),
    wall: new THREE.MeshStandardMaterial({ color: 0xd6d1c7, roughness: 0.92, map: grainTexture(236, 24, 3) }),
    glass: new THREE.MeshStandardMaterial({ color: 0x5f7a8c, roughness: 0.08, metalness: 0.35, emissive: 0x101a20 }),
    mullion: new THREE.MeshStandardMaterial({ color: 0x5b6166, roughness: 0.5, metalness: 0.5 }),
    steelOld: new THREE.MeshStandardMaterial({ color: 0x7f878d, roughness: 0.55, metalness: 0.5 }),
    steelNew: new THREE.MeshStandardMaterial({ color: 0xa3abb2, roughness: 0.45, metalness: 0.55 }),
    tread: new THREE.MeshStandardMaterial({ color: 0xb4bbc1, roughness: 0.5, metalness: 0.6, map: diamondTexture() }),
    rail: new THREE.MeshStandardMaterial({ color: 0x8e979e, roughness: 0.45, metalness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xb5b2aa, roughness: 0.95, map: grainTexture(230, 30, 5) }),
    demo: new THREE.MeshBasicMaterial({ color: 0xc8412b, transparent: true, opacity: 0.22, depthWrite: false }),
    demoEdge: new THREE.LineBasicMaterial({ color: 0xc8412b, transparent: true, opacity: 0.85 }),
  };
  // Materials that switch to the "new work" highlight colour
  const newWork = [M.concNew, M.steelNew, M.tread, M.rail];
  newWork.forEach(m => { m.userData.base = m.color.getHex(); });

  const common = new THREE.Group(), existing = new THREE.Group(), proposed = new THREE.Group();
  const structure = new THREE.Group(), belowGrade = new THREE.Group(), demolition = new THREE.Group(), overhang = new THREE.Group();
  proposed.add(structure);

  const DECK = 8.75;           // T.O. 1st floor / porch, 8'-9"
  const WALK = 1.875;          // walk, 1'-10 1/2"
  const ROOF_U = 19.3;         // underside of roof overhang (ft above datum); roof top from LiDAR is +21'-0"
  const PORCH_S = -25.3, LAND_S = 20.53, LAND_N = 29.03, VEST_N = 37.27;

  // ---------- Common: building face behind the porch, vestibule, walks, roof overhang ----------
  common.add(box(6.2, 6.7, PORCH_S, LAND_N, 0, ROOF_U, M.wall));
  for (const [z0, z1] of [[2.6, 7.6], [9.6, 19.0]]) {
    common.add(box(6.15, 6.2, PORCH_S + 1, LAND_N - 1, z0, z1, M.glass));
    for (let y = PORCH_S + 1; y <= LAND_N - 1 + 0.01; y += (LAND_N - PORCH_S - 2) / 13)
      common.add(box(6.1, 6.2, y - 0.1, y + 0.1, z0, z1, M.mullion));
  }
  common.add(box(0, 6.2, LAND_N, VEST_N, 0, ROOF_U, M.wall));
  common.add(box(0.4, 3.4, LAND_N - 0.05, LAND_N + 0.02, DECK, DECK + 7, M.glass)); // door, A1.1
  overhang.add(box(-0.98, 6.6, PORCH_S, LAND_N + 0.3, ROOF_U, 21.0, M.roof));
  overhang.add(box(-1.1, -0.85, PORCH_S, LAND_N + 0.3, 21.0, 22.45, M.wall)); // parapet at the roof edge
  common.add(overhang);

  // existing walk 5'-0" at 1'-10 1/2", steps down to 0'-0", south walk
  common.add(box(-8.92, -3.92, -53.9, -20.07, WALK - 0.5, WALK, M.concOld));
  [[-53.9, -54.82, 1.25], [-54.82, -55.74, 0.625]].forEach(([a, b, t]) => common.add(box(-8.92, -3.92, b, a, t - 0.5, t, M.concOld)));
  common.add(box(-8.92, -3.92, -60.66, -55.74, -0.5, 0, M.concOld));
  common.add(box(-8.92, 28, -66, -60.66, -0.5, 0, M.concOld));

  // ---------- Existing (A1.1 existing porch plan) ----------
  const exPorch = box(0, 6.2, PORCH_S, LAND_N, 0, DECK, M.concOld); existing.add(exPorch);
  // upper flight: 5 risers from 8'-9" to 5'-7 1/2", running west
  const exStair = new THREE.Group();
  for (let k = 1; k <= 4; k++) exStair.add(box(-k * 0.9375, -(k - 1) * 0.9375, -10.07, 0, 0, DECK - k * 0.625, M.concOld));
  exStair.add(box(-8.885, -3.75, -11.15, 0, 0, 5.625, M.concOld));                // landing 5'-7 1/2"
  for (let k = 1; k <= 5; k++) exStair.add(box(-8.885, -3.75, -11.15 - k * 0.81, -11.15 - (k - 1) * 0.81, 0, 5.625 - k * 0.625, M.concOld));
  exStair.add(box(-8.885, -3.75, -20.07, -15.2, WALK - 0.5, WALK, M.concOld));   // 4'-10 1/4" pad
  // simple pipe rails on the open sides of the existing stair
  const rp = (X, Y, Z) => W(X, Y, Z);
  exStair.add(bar(rp(-0.1, -10.0, DECK + 3), rp(-3.75, -10.0, 5.625 + 3), 0.04, M.steelOld, true));
  exStair.add(bar(rp(-8.8, -11.2, 5.625 + 3), rp(-8.8, -15.2, WALK + 3), 0.04, M.steelOld, true));
  exStair.add(bar(rp(-8.8, 0, 5.625 + 3.5), rp(-8.8, -11.2, 5.625 + 3.5), 0.04, M.steelOld, true));
  existing.add(exStair);

  // ---------- Proposed (A1.1 proposed, S1.0, S2.0) ----------
  // remaining porch: composite deck 8'-6" long
  proposed.add(box(0, 6.2, LAND_S, LAND_N, DECK - 0.42, DECK, M.concOld));
  proposed.add(box(0, 6.2, LAND_S, LAND_N, DECK - 0.5, DECK - 0.42, M.steelOld)); // steel deck
  const TOS = DECK - 0.5;
  structure.add(wBeam('Y', LAND_S, LAND_N, 0.42, TOS, 14.6, 10.0, M.steelOld));   // existing edge beam W14x61
  structure.add(wBeam('X', 0, 6.2, LAND_S + 0.3, TOS, 16.4, 7.1, M.steelOld));    // existing beam W16x57
  structure.add(wBeam('Y', LAND_S, LAND_N, 5.95, TOS, 8.3, 5.3, M.steelOld));     // existing beam W8x21 (wall above)
  const colTop = TOS - 16.4 / 12;
  structure.add(box(0.17, 0.67, LAND_S + 0.05, LAND_S + 0.55, WALK + 0.06, colTop, M.steelNew)); // new HSS 6x6x1/4
  structure.add(box(-0.08, 0.92, LAND_S - 0.2, LAND_S + 0.8, WALK, WALK + 0.06, M.steelNew));    // base plate 12x12x3/4
  structure.add(box(5.45, 5.95, LAND_S + 0.05, LAND_S + 0.55, WALK, colTop, M.steelOld));        // existing col below
  const pier = new THREE.Mesh(new THREE.CylinderGeometry(FT, FT, 4 * FT, 24), M.concNew);       // 24" dia x 4'-0"
  pier.position.copy(W(0.42, LAND_S + 0.3, WALK - 2)); belowGrade.add(pier);

  // stair: 11R @ 7 1/2", 10T @ 10", top nosing at Y = LAND_S, running south
  const R = 0.625, T = 10 / 12, Xw = 0.2, Xe = 5.95;
  const stair = new THREE.Group();
  for (let k = 1; k <= 10; k++) {
    const yN = LAND_S - k * T, z = DECK - k * R;
    stair.add(box(Xw, Xe, yN - 0.06, yN + T, z - 0.03, z, M.tread));
  }
  for (let k = 1; k <= 11; k++) {
    const y = LAND_S - (k - 1) * T, z = DECK - (k - 1) * R;
    stair.add(box(Xw, Xe, y - 0.03, y, z - R, z - 0.03, M.tread));
  }
  // MC channel stringers, both sides
  const slope = R / T, zt = (Y) => DECK + 0.1 - (LAND_S - Y) * slope, depth = 10 / 12 / Math.cos(Math.atan(slope));
  const yFootB = LAND_S - (DECK + 0.1 - depth - WALK) / slope, yFootT = LAND_S - (DECK + 0.1 - WALK) / slope;
  const sh = new THREE.Shape();
  const P2 = (Y, Z) => [-(V0 + Y * FT), Z * FT];
  sh.moveTo(...P2(LAND_S, zt(LAND_S))); sh.lineTo(...P2(LAND_S, zt(LAND_S) - depth));
  sh.lineTo(...P2(yFootB, WALK)); sh.lineTo(...P2(yFootT, WALK)); sh.closePath();
  for (const xe of [Xw, Xe + 0.15]) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.15 * FT, bevelEnabled: false }); g.rotateY(-Math.PI / 2);
    const m = new THREE.Mesh(g, M.steelNew); m.position.x = U0 + xe * FT; m.castShadow = true; stair.add(m);
  }
  // embedded plates and 12" pier footing at stair base
  for (const xc of [Xw - 0.07, Xe + 0.07]) stair.add(box(xc - 0.33, xc + 0.33, yFootT - 0.1, yFootT + 0.56, WALK, WALK + 0.06, M.steelNew));
  const footing = box(-0.3, 6.5, yFootT - 0.2, yFootT + 0.8, WALK - 4, WALK - 0.4, M.concNew); belowGrade.add(footing);

  // guard: HSS 2x2 posts <= 5'-0", HSS 2x2 top rail at 42", HSS 1 1/2 bottom rail, 1/2" balusters
  const gX = 0.12, H42 = 3.5;
  const nose = (Y) => (Y >= LAND_S ? DECK : DECK - (LAND_S - Y) * slope);
  const guardRun = (y0, y1, posts) => {
    posts.forEach(Y => stair.add(bar(W(gX, Y, nose(Y)), W(gX, Y, nose(Y) + H42), 2 / 12 * FT, M.rail)));
    stair.add(bar(W(gX, y0, nose(y0) + H42), W(gX, y1, nose(y1) + H42), 2 / 12 * FT, M.rail));
    stair.add(bar(W(gX, y0, nose(y0) + 0.35), W(gX, y1, nose(y1) + 0.35), 1.5 / 12 * FT, M.rail));
    const n = Math.floor(Math.abs(y1 - y0) / (4 / 12));
    for (let i = 1; i < n; i++) { const Y = y0 + (y1 - y0) * i / n;
      stair.add(bar(W(gX, Y, nose(Y) + 0.35), W(gX, Y, nose(Y) + H42), 0.5 / 12 * FT, M.rail, true)); }
  };
  guardRun(LAND_S, 12.3, [LAND_S, (LAND_S + 12.3) / 2, 12.3]);
  guardRun(LAND_N - 0.2, LAND_S, [LAND_N - 0.2, (LAND_N + LAND_S) / 2]);
  proposed.add(stair);

  // new concrete walk 6'-2 1/4" at 1'-10 1/2" and jog to the existing walk
  proposed.add(box(0, 6.19, PORCH_S - 0.6, 12.2, WALK - 0.33, WALK, M.concNew));
  proposed.add(box(-8.92, 0, PORCH_S - 0.6, -20.07, WALK - 0.33, WALK, M.concNew));

  // demolition ghost: porch south of the landing, existing stair and pad
  const ghost = (X0, X1, Y0, Y1, Z0, Z1) => {
    const b = box(X0, X1, Y0, Y1, Z0, Z1, M.demo); b.castShadow = false; b.receiveShadow = false;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(b.geometry), M.demoEdge); e.position.copy(b.position);
    demolition.add(b, e);
  };
  ghost(0, 6.2, PORCH_S, LAND_S, WALK, DECK);
  ghost(-3.75, 0, -10.07, 0, WALK, DECK);
  ghost(-8.885, -3.75, -11.15, 0, WALK, 5.625);
  ghost(-8.885, -3.75, -15.2, -11.15, WALK, 5.0);
  ghost(-8.885, -3.75, -20.07, -15.2, WALK - 0.5, WALK);

  const labels = {
    existing: [
      { p: W(3.1, 25, DECK + 0.4), t: "Existing porch · T.O. 1st floor +8'-9\"" },
      { p: W(-6.3, -5.5, 5.625 + 0.4), t: "Existing stair · landing +5'-7½\"" },
      { p: W(3.1, -10, DECK + 0.4), t: "Porch to be demolished", cls: 'demo' },
    ],
    proposed: [
      { p: W(3.1, 25, DECK + 0.4), t: "Landing to remain · +8'-9\"" },
      { p: W(3.1, 16.3, 6.0), t: "New steel stair · 11R @ 7½\" · 10T @ 10\"", cls: 'new' },
      { p: W(3.1, -5, WALK + 0.3), t: "New 6'-2¼\" walk · +1'-10½\"", cls: 'new' },
      { p: W(0.4, LAND_S + 0.3, 4.5), t: "New HSS 6×6 col · Ø24\" pier", cls: 'new' },
    ],
    common: [
      { p: W(-6.4, -58.2, 0.4), t: "Existing walk · 0'-0\"" },
    ],
  };

  return { M, newWork, stair, common, existing, proposed, structure, belowGrade, demolition, overhang, labels,
    focus: W(2, 8, 5), DECK };
}
