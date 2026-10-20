// Revised stair from the "Carlingview Stair Treads" study, shop drawings SD-01/02 (job 110-26).
// OBC 2024 Part 3: 12 risers at 6-7/8", 11 treads at 11-1/8" between MC12 stringers. Each tread is a welded
// steel frame TF-1 with a 3/16" riser plate, carrying two Trex Select 2x6 boards; Trex fascia riser boards.
// Built in inches in the study's own frame: x across the stair (centred), y up from the walk,
// z along the run from the bottom riser (0) to the top riser line (TOPZ). app.js places it on the porch.
import * as THREE from './vendor/three.module.js';

export const R = 6.875, RUN = 11.125, NT = 11, TC = 1.3, NOSE = 0.25, RT = 0.75;
const SLOPE = R / RUN, TH = Math.atan(SLOPE);
export const TOPZ = NT * RUN, DECK = (NT + 1) * R;
const ST_UP = 2, ST_DV = 12 / Math.cos(TH);
const Tln = (z) => SLOPE * z + R + ST_UP, Bln = (z) => Tln(z) - ST_DV, Nos = (z) => SLOPE * z + R;
const BD = 5.5, GAP = 0.375, TD = 2 * BD + GAP, LT = 0.25, LL = 2, BW = 1.5, BT = 0.1875;
const CLAD = 0.5625, PL = 0.1875, PLH = 5.3125;

export const BOARD = {
  brown: { name: 'Wood brown', c: [0x8a5a3c, 0x80533a, 0x93613f] },
  pebble: { name: 'Pebble Grey', c: [0xa39d94, 0x9a948b, 0xaca69d] },
  saddle: { name: 'Saddle', c: [0x8b6a4e, 0x83634a, 0x937255] },
};
export const RISER = { charcoal: { name: 'Charcoal', c: 0x45403c }, match: { name: 'Match treads', c: null }, pebble: { name: 'Pebble Grey', c: 0xa39d94 } };

function woodTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 64, a = 0.04 + rnd() * 0.08; x.strokeStyle = `rgba(40,25,10,${a})`; x.lineWidth = 0.5 + rnd() * 1.5;
    x.beginPath(); x.moveTo(0, y); for (let px = 0; px <= 256; px += 16) x.lineTo(px, y + Math.sin(px / 40 + i) * 1.5); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.02, 0.15); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const grain = woodTexture(17);

const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0x8d969c, metalness: 0.55, roughness: 0.45 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3f454a, metalness: 0.6, roughness: 0.4 }),
  sup: new THREE.MeshStandardMaterial({ color: 0x4a5057, metalness: 0.7, roughness: 0.35 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe2dc, transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
  board: [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.85, map: grain })),
  riser: new THREE.MeshStandardMaterial({ color: 0x45403c, roughness: 0.85, map: grain }),
};

export function layout(W, tgt) {
  const h = W / 2 - 0.125, xa = -h + LL / 2, xb = h - LL / 2, span = xb - xa, n = Math.ceil(span / tgt - 1e-9), sp = span / n;
  return { xs: Array.from({ length: n - 1 }, (_, k) => xa + (k + 1) * sp), sp, n, fw: 2 * h };
}

export function buildTreadDesign(S) {
  const root = new THREE.Group();
  const G = {};
  ['str', 'sup', 'treads', 'risers', 'guardL', 'guardR', 'glassL', 'glassR', 'railL', 'railR', 'plates', 'guardLand', 'glassLand'].forEach((k) => { G[k] = new THREE.Group(); root.add(G[k]); });
  const add = (mesh, grp) => { mesh.castShadow = mesh.receiveShadow = true; grp.add(mesh); return mesh; };
  const box = (x0, x1, y0, y1, z0, z1, mat, grp) => {
    [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)];
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return add(m, grp);
  };
  const prism = (pts, x0, t, mat, grp) => {
    const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(x0 + t, 0, 0);
    return add(new THREE.Mesh(g, mat), grp);
  };
  const strip = (z0, z1, f, lo, hi, x0, t, mat, grp) => prism([[z0, f(z0) + lo], [z1, f(z1) + lo], [z1, f(z1) + hi], [z0, f(z0) + hi]], x0, t, mat, grp);

  const W = S.W, h = W / 2, sup = S.hl ? M.sup : M.steel, { xs, sp, n, fw } = layout(W, S.tgt);
  BOARD[S.col].c.forEach((c, k) => M.board[k].color.setHex(c));
  const rm = RISER[S.rcol].c === null ? M.board[0] : M.riser;
  if (RISER[S.rcol].c !== null) M.riser.color.setHex(RISER[S.rcol].c);

  // 8x8 embedded plates at the stringer feet
  for (const s of [-1, 1]) { const c = s * (h + 1.1); box(c - 4, c + 4, -0.5, 0, -1, 7, M.dark, G.plates); }

  // MC12 stringers, toes out
  const zf = -4, web = [[zf, 0], [-Bln(0) / SLOPE, 0], [TOPZ, Bln(TOPZ)], [TOPZ, Tln(TOPZ)], [zf, Tln(zf)]];
  for (const s of [-1, 1]) {
    prism(web, s < 0 ? -h - 0.25 : h, 0.25, M.steel, G.str);
    const fx = s < 0 ? -h - 2.25 : h;
    strip(zf, TOPZ, Tln, -0.4, 0, fx, 2.25, M.steel, G.str);
    const zb = -(Bln(0) + 0.4) / SLOPE; strip(zb, TOPZ, Bln, 0, 0.4, fx, 2.25, M.steel, G.str);
  }

  // TF-1 frames: riser plate, front/back/side angles, bearers
  const frame = (i) => {
    const hh = h - 0.125, yt = R * i - TC, zf1 = (i - 1) * RUN + CLAD, zb = i * RUN, a0 = zf1 + PL;
    box(-hh, hh, yt - PLH, yt, zf1, zf1 + PL, sup, G.sup);
    box(-hh, hh, yt - LT, yt, a0, a0 + LL, sup, G.sup); box(-hh, hh, yt - LL, yt - LT, a0, a0 + LT, sup, G.sup);
    box(-hh, hh, yt - LT, yt, zb - LL, zb, sup, G.sup); box(-hh, hh, yt - LL, yt - LT, zb - LT, zb, sup, G.sup);
    for (const s of [-1, 1]) { box(s * hh, s * (hh - LL), yt - LT, yt, a0 + LL, zb - LL, sup, G.sup); box(s * hh, s * (hh - LT), yt - LL, yt - LT, a0 + LL, zb - LL, sup, G.sup); }
    xs.forEach((x) => { box(x - BW / 2, x + BW / 2, yt - BT, yt, a0 + LL, zb - LL, sup, G.sup); box(x - BW / 2, x - BW / 2 + BT, yt - BW, yt - BT, a0 + LL, zb - LL, sup, G.sup); });
  };
  for (let i = 1; i <= NT; i++) {
    frame(i);
    const yt = R * i, zb = i * RUN, zf0 = zb - TD, RO = 0.25;
    const arc = Array.from({ length: 9 }, (_, k) => { const a = Math.PI / 2 + k * Math.PI / 16; return [zf0 + RO + RO * Math.cos(a), yt - RO + RO * Math.sin(a)]; });
    prism([[zf0, yt - TC], [zf0 + BD, yt - TC], [zf0 + BD, yt], ...arc], -h + 0.1875, W - 0.375, M.board[i % 3], G.treads);
    box(-h + 0.1875, h - 0.1875, yt - TC, yt, zb - BD, zb, M.board[(i + 1) % 3], G.treads);
  }
  box(-h + 0.125, h - 0.125, R * NT + 0.25, DECK - 6, TOPZ + CLAD, TOPZ + CLAD + PL, sup, G.sup); // top riser backing plate
  for (let j = 1; j <= NT + 1; j++) { const z = (j - 1) * RUN, yb = R * (j - 1) + 0.125, yt = j <= NT ? R * j - TC : DECK;
    box(-h + 0.1875, h - 0.1875, yb, yt, z, z + CLAD, rm, G.risers); }

  // 42-1/2" guard with glass infill, handrails at 36" both sides with 12" level extensions
  const posts = [2, 41, 80, 119], G42 = (z) => Nos(z) + 42.5;
  for (const s of [-1, 1]) {
    const gg = s < 0 ? G.guardL : G.guardR, gl = s < 0 ? G.glassL : G.glassR, rl = s < 0 ? G.railL : G.railR, xc = s * (h + 1.125);
    posts.forEach((z) => box(xc - 1, xc + 1, Tln(z), G42(z) - 2.5, z - 1, z + 1, M.dark, gg));
    strip(posts[0] - 1, posts[3] + 1, G42, -2.5, 0, xc - 1, 2, M.dark, gg);
    strip(posts[0] + 1, posts[3] - 1, Tln, 0, 1.875, xc - 0.75, 1.5, M.dark, gg);
    for (let k = 0; k < 3; k++) { const a = posts[k] + 1.6, b = posts[k + 1] - 1.6, lo = (z) => Tln(z) + 2.5, hi = (z) => G42(z) - 3.1;
      prism([[a, lo(a)], [b, lo(b)], [b, hi(b)], [a, hi(a)]], xc - 0.25, 0.5, M.glass, gl).castShadow = false;
      [[a, 0.3], [b, -0.8]].forEach(([z, o]) => { box(xc - 0.5, xc + 0.5, lo(z) + 1, lo(z) + 3, z + o - 0.25, z + o + 0.75, M.dark, gl); box(xc - 0.5, xc + 0.5, hi(z) - 3, hi(z) - 1, z + o - 0.25, z + o + 0.75, M.dark, gl); });
    }
    const hx = s * (h + 0.125 - 2.25 - 0.83), H36 = (z) => Nos(z) + 36;
    const pts = [[-RUN - 12, H36(-RUN)], [-RUN, H36(-RUN)], [TOPZ, H36(TOPZ)], [TOPZ + 12, H36(TOPZ)]];
    for (let q = 0; q < 3; q++) { const [za, ya] = pts[q], [zb2, yb2] = pts[q + 1], L = Math.hypot(zb2 - za, yb2 - ya);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.83, L + 0.01, 20), M.dark);
      cyl.rotation.x = Math.PI / 2 - Math.atan2(yb2 - ya, zb2 - za); cyl.position.set(hx, (ya + yb2) / 2, (za + zb2) / 2); add(cyl, rl); }
    posts.forEach((z) => box(Math.min(hx, s * (h + 0.125)), Math.max(hx, s * (h + 0.125)), H36(z) - 1.6, H36(z) - 1.2, z - 0.3, z + 0.3, M.dark, rl));
  }

  // landing guard: the same 42½" glass guard carried around the open edges of the landing that stays.
  // S.land gives the landing in this frame (inches): west edge x, east wall x, south edge z, north wall z.
  if (S.land) {
    const L = S.land, top = DECK + 42.5, zS = L.zS + 1, MAXSP = 48;
    const seg = (a, b) => {                          // a, b = [x, z]; axis-aligned
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 4) return;
      const n = Math.max(1, Math.ceil(len / MAXSP)), along = a[0] !== b[0] ? 'x' : 'z';
      const P = Array.from({ length: n + 1 }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      const run = (p, q, y0, y1, t, mat, grp) => along === 'x'
        ? box(p[0], q[0], y0, y1, p[1] - t / 2, p[1] + t / 2, mat, grp) : box(p[0] - t / 2, p[0] + t / 2, y0, y1, p[1], q[1], mat, grp);
      P.forEach(p => box(p[0] - 1, p[0] + 1, DECK, top - 2.5, p[1] - 1, p[1] + 1, M.dark, G.guardLand));
      run(a, b, top - 2.5, top, 2, M.dark, G.guardLand);                           // HSS 2x2 top rail
      run(a, b, DECK + 1.5, DECK + 3, 1.5, M.dark, G.guardLand);                   // HSS 1½ bottom rail
      for (let k = 0; k < n; k++) {
        const p = P[k], q = P[k + 1], d = along === 'x' ? Math.sign(q[0] - p[0]) : Math.sign(q[1] - p[1]);
        const p2 = along === 'x' ? [p[0] + 1.6 * d, p[1]] : [p[0], p[1] + 1.6 * d], q2 = along === 'x' ? [q[0] - 1.6 * d, q[1]] : [q[0], q[1] - 1.6 * d];
        const gl = run(p2, q2, DECK + 4.5, top - 3.1, 0.5, M.glass, G.glassLand); gl.castShadow = false;
        for (const c of [p2, q2]) for (const y of [DECK + 5.5, top - 5]) {
          const cl = along === 'x' ? [c[0] - 0.5 * d, c[1]] : [c[0], c[1] - 0.5 * d];
          box(cl[0] - (along === 'x' ? 0.5 : 0.5), cl[0] + 0.5, y, y + 2, cl[1] - 0.5, cl[1] + 0.5, M.dark, G.glassLand);
        }
      }
    };
    const xc = h + 1.125;
    seg([xc, zS], [L.xW, zS]);                       // south edge, west of the stair
    seg([L.xW, zS], [L.xW, L.zN - 1]);                // west edge, to the vestibule wall
    seg([-xc, zS], [L.xE, zS]);                      // south edge, east of the stair, to the building face
  }
  G.glassLand.visible = S.glass;

  G.treads.visible = S.treads; G.risers.visible = S.risers;
  G.treads.position.y = G.risers.position.y = S.lift;
  G.glassL.visible = G.glassR.visible = S.glass;
  G.railL.visible = G.railR.visible = S.rail;

  return { root, groups: G, check: { sp, n, fw, ok: sp <= S.tgt + 1e-6 } };
}
