// Trees and street lights placed from the 2023 LiDAR canopy (data/trees.json, built by tools/trees.py).
// Each tree keeps its measured position, height, crown spread and crown base; foliage colour comes
// from the SCOOP 2023 photo over that crown. Shapes are procedural.
import * as THREE from './vendor/three.module.js';

function rng(seed) { let s = Math.floor(seed * 2654435761) % 2147483647; if (s <= 0) s += 2147483646; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// cheap 3D value noise for lumpy crowns
function hash(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

// concatenate non-indexed geometries with position/normal/color
function merge(list) {
  let n = 0; list.forEach(g => (n += g.getAttribute('position').count));
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), q = g.getAttribute('normal'), c = g.getAttribute('color');
    pos.set(p.array, o * 3); nor.set(q.array, o * 3); col.set(c.array, o * 3); o += p.count; g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}
function paint(g, fn) {
  const p = g.getAttribute('position'), c = new Float32Array(p.count * 3), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), t); c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

function foliageColour(hex) {
  // the photo shows crowns from above in spring light; keep its hue but lift it into a believable foliage range
  const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);
  const h = THREE.MathUtils.clamp(hsl.h * 0.5 + 0.13, 0.2, 0.32), s = THREE.MathUtils.clamp(hsl.s * 1.1 + 0.12, 0.28, 0.5), l = THREE.MathUtils.clamp(hsl.l * 0.9 + 0.04, 0.16, 0.3);
  return new THREE.Color().setHSL(h, s, l);
}

function deciduous(t, R) {
  const parts = [];
  const H = t.h, B = t.b, cr = (H - B) / 2, cy = B + cr;              // crown spans base..top
  const rx = t.r, rz = t.r * t.e;
  // trunk and two main limbs
  const trunkTop = B + cr * 0.55;
  const trunk = new THREE.CylinderGeometry(Math.max(0.09, t.r * 0.05), Math.max(0.14, t.r * 0.085), trunkTop, 7, 1).toNonIndexed();
  trunk.translate(0, trunkTop / 2, 0);
  parts.push(paint(trunk, (x, y, z, c) => c.setRGB(0.29, 0.25, 0.21).multiplyScalar(0.85 + 0.15 * (y / trunkTop))));
  for (let k = 0; k < 3; k++) {
    const a = R() * Math.PI * 2, len = cr * (0.7 + R() * 0.4);
    const limb = new THREE.CylinderGeometry(0.04, Math.max(0.07, t.r * 0.04), len, 5, 1).toNonIndexed();
    limb.translate(0, len / 2, 0); limb.rotateZ(0.55 + R() * 0.35); limb.rotateY(a); limb.translate(0, B + cr * 0.25, 0);
    parts.push(paint(limb, (x, y, z, c) => c.setRGB(0.27, 0.23, 0.2)));
  }
  // crown: clustered lumpy blobs inside the measured envelope
  const base = foliageColour(t.col), dark = base.clone().multiplyScalar(0.55), lite = base.clone().lerp(new THREE.Color(0xc9d67a), 0.22);
  const nBlobs = Math.round(THREE.MathUtils.clamp(t.r * 3.4, 6, 18));
  for (let k = 0; k < nBlobs; k++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 0.62, yy = (R() * 2 - 1) * 0.55;
    const br = THREE.MathUtils.clamp(t.r * (0.32 + R() * 0.2), 0.5, 3.2);
    const g = new THREE.IcosahedronGeometry(br, 2);
    const ox = Math.cos(a) * d * rx, oz = Math.sin(a) * d * rz, oy = cy + yy * cr * 0.7;
    const p = g.getAttribute('position'), sd = R() * 100;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), q = 2.2 / br, f = 0.72 + 0.38 * noise3(x * q + sd, y * q, z * q) + 0.16 * noise3(x * q * 3 + sd, y * q * 3, z * q * 3);
      p.setXYZ(i, x * f + ox, y * f + oy, z * f + oz);
    }
    g.computeVertexNormals();
    // keep blobs inside the crown envelope (the LiDAR top and spread)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ex = x / rx, ez = z / rz, ey = (y - cy) / cr, rr = Math.hypot(ex, ey, ez);
      if (rr > 1.0) { const s = 1.0 / Math.pow(rr, 0.75); p.setXYZ(i, x * s, cy + (y - cy) * s, z * s); }
    }
    g.computeVertexNormals();
    parts.push(paint(g, (x, y, z, c) => {
      const up = THREE.MathUtils.clamp((y - B) / (H - B), 0, 1), j = noise3(x * 2.1, y * 2.1, z * 2.1);
      c.copy(dark).lerp(base, 0.3 + up * 0.5).lerp(lite, Math.max(0, up - 0.6) * 0.7 + j * 0.1).multiplyScalar(0.82 + j * 0.2);
    }));
  }
  return merge(parts);
}

function conifer(t, R) {
  const parts = [], base = foliageColour(t.col).offsetHSL(0.03, -0.05, -0.06);
  const trunk = new THREE.CylinderGeometry(0.08, 0.16, t.h * 0.35, 6).toNonIndexed(); trunk.translate(0, t.h * 0.175, 0);
  parts.push(paint(trunk, (x, y, z, c) => c.setRGB(0.27, 0.22, 0.18)));
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const y0 = t.b + (t.h - t.b) * (k / tiers) * 0.8, ht = (t.h - y0) * 0.75, rr = t.r * (1 - k * 0.2);
    const g = new THREE.ConeGeometry(rr, ht, 9, 1).toNonIndexed(); g.translate(0, y0 + ht / 2, 0);
    parts.push(paint(g, (x, y, z, c) => c.copy(base).multiplyScalar(0.75 + 0.35 * ((y - y0) / ht))));
  }
  return merge(parts);
}

function pole(t) {
  // street / site light: tapered steel pole, davit arm toward the road (west), luminaire head
  const parts = [], H = t.h, armLen = Math.min(2.4, Math.max(1.2, t.r * 1.6));
  const shaft = new THREE.CylinderGeometry(0.07, 0.13, H, 10).toNonIndexed(); shaft.translate(0, H / 2, 0);
  parts.push(paint(shaft, (x, y, z, c) => c.setRGB(0.55, 0.57, 0.58)));
  const arm = new THREE.CylinderGeometry(0.045, 0.05, armLen, 6).toNonIndexed(); arm.rotateZ(Math.PI / 2 - 0.12); arm.translate(-armLen / 2, H - 0.25, 0);
  parts.push(paint(arm, (x, y, z, c) => c.setRGB(0.55, 0.57, 0.58)));
  const head = new THREE.BoxGeometry(0.75, 0.16, 0.34).toNonIndexed(); head.translate(-armLen - 0.2, H - 0.12, 0);
  parts.push(paint(head, (x, y, z, c) => (y < H - 0.15 ? c.setRGB(0.95, 0.93, 0.82) : c.setRGB(0.36, 0.38, 0.4))));
  const footing = new THREE.CylinderGeometry(0.3, 0.32, 0.35, 12).toNonIndexed(); footing.translate(0, 0.1, 0);
  parts.push(paint(footing, (x, y, z, c) => c.setRGB(0.66, 0.64, 0.6)));
  return merge(parts);
}

export function buildTrees(data) {
  const group = new THREE.Group(); group.name = 'trees';
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 });
  for (const t of data.trees) {
    const R = rng(t.u * 13.7 + t.v * 7.3 + 101);
    const geo = t.k === 'p' ? pole(t) : t.k === 'c' ? conifer(t, R) : deciduous(t, R);
    const m = new THREE.Mesh(geo, t.k === 'p' ? metal : foliage);
    m.position.set(t.u, t.g, -t.v);
    if (t.k !== 'p') m.rotation.y = -t.a;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}
