// Building solids derived from the 2023 LiDAR (outlines squared up, one solid per roof level),
// with roofs textured from the SCOOP 2023 photo. Data: data/solids.json (plan-frame metres).
import * as THREE from './vendor/three.module.js';

const P = (u, v, y) => new THREE.Vector3(u, y, -v);

function panelTexture() {
  // insulated metal / precast panel facade: soft vertical joints every 2.44 m, a darker plinth and coping
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#f2f0eb'); g.addColorStop(1, '#e6e3dc');
  x.fillStyle = g; x.fillRect(0, 0, 256, 512);
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(90,85,75,${rnd() * 0.035})`; x.fillRect(rnd() * 256, rnd() * 512, 2, 2 + rnd() * 6); }
  x.fillStyle = 'rgba(70,68,62,0.30)'; x.fillRect(0, 0, 3, 512); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(3, 0, 1, 512);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// offset a closed CCW polygon inward by d (line offset + intersections)
function inset(poly, d) {
  const n = poly.length, out = [];
  const L = poly.map((p, i) => { const q = poly[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l; return { p: [p[0] + nx * d, p[1] + ny * d], dir: [dx / l, dy / l] }; });
  for (let i = 0; i < n; i++) {
    const A = L[(i - 1 + n) % n], B = L[i];
    const det = A.dir[0] * -B.dir[1] - A.dir[1] * -B.dir[0];
    if (Math.abs(det) < 1e-6) { out.push(B.p); continue; }
    const rx = B.p[0] - A.p[0], ry = B.p[1] - A.p[1];
    const t = (rx * -B.dir[1] - ry * -B.dir[0]) / det;
    out.push([A.p[0] + A.dir[0] * t, A.p[1] + A.dir[1] * t]);
  }
  return out;
}

export function buildSolids(data, { roofMap, ortho, envIntensity = 1 }) {
  const group = new THREE.Group(); group.name = 'buildings';
  const panel = panelTexture();
  const M = {
    wall: new THREE.MeshStandardMaterial({ color: 0xe9e6df, map: panel, roughness: 0.82, metalness: 0.05 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.9 }),
    coping: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.6 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xffffff, map: roofMap || null, roughness: 0.95 }),
    parapetIn: new THREE.MeshStandardMaterial({ color: 0xcfcbc2, roughness: 0.9 }),
    unit: new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.5, metalness: 0.55 }),
    unitTop: new THREE.MeshStandardMaterial({ color: 0x7f868c, roughness: 0.6, metalness: 0.5 }),
    tent: new THREE.MeshStandardMaterial({ color: 0xf4f3ee, roughness: 0.75, side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ color: 0xb9bcbf, roughness: 0.5, metalness: 0.4 }),
    edge: new THREE.LineBasicMaterial({ color: 0x3b3f42, transparent: true, opacity: 0.45 }),
  };
  const uvOf = (u, v) => [(u - ortho.u0) / (ortho.u1 - ortho.u0), (v - ortho.v0) / (ortho.v1 - ortho.v0)];

  // wall band between heights y0..y1 along a polygon, outward normals, panel UVs
  function walls(poly, y0, y1, mat, flip = false) {
    const pos = [], uv = [], idx = []; let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = pos.length / 3;
      pos.push(a[0], y0, -a[1], b[0], y0, -b[1], b[0], y1, -b[1], a[0], y1, -a[1]);
      uv.push(s / 2.44, y0 / 6, (s + l) / 2.44, y0 / 6, (s + l) / 2.44, y1 / 6, s / 2.44, y1 / 6);
      if (flip) idx.push(k, k + 2, k + 1, k, k + 3, k + 2); else idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      s += l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; return m;
  }
  function cap(outer, holes, y, mat, photo) {
    const sh = new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(u, v)));
    (holes || []).forEach(h => sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v)))));
    const g = new THREE.ShapeGeometry(sh);
    const p = g.getAttribute('position'), uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i); if (photo) { const t = uvOf(u, v); uv[i * 2] = t[0]; uv[i * 2 + 1] = t[1]; } }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; return m;
  }
  function outline(poly, y, ys) {
    const pts = [];
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; pts.push(P(a[0], a[1], y), P(b[0], b[1], y)); }
    ys && poly.forEach(a => pts.push(P(a[0], a[1], ys[0]), P(a[0], a[1], ys[1])));
    return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), M.edge);
  }

  for (const b of data.buildings) {
    const poly = b.poly;
    if (b.kind === 'vault') { group.add(vault(b)); continue; }
    const PAR = 0.45, T = 0.22;                       // parapet height and thickness
    const top = b.top, base = b.base;
    group.add(walls(poly, base, base + 0.55, M.plinth));
    group.add(walls(poly, base + 0.55, top + PAR - 0.08, M.wall));
    group.add(walls(poly, top + PAR - 0.08, top + PAR, M.coping));
    const inner = inset(poly, T);
    group.add(walls(inner, top, top + PAR, M.parapetIn, true));
    group.add(cap(poly, [inner.slice().reverse()], top + PAR, M.coping, false));
    group.add(cap(inner, null, top, M.roof, true));
    group.add(outline(poly, top + PAR + 0.005, [base + 0.01, top + PAR]));
  }

  for (const t of data.units) {
    const h = Math.max(0.5, t.top - t.base), g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, h, t.d), M.unit); body.position.y = h / 2; body.castShadow = body.receiveShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.94, 0.06, t.d * 0.94), M.unitTop); lid.position.y = h + 0.03;
    g.add(body, lid); g.position.copy(P(t.c[0], t.c[1], t.base)); g.rotation.y = t.ang;
    group.add(g);
  }

  function vault(b) {
    // fabric storage tent: vertical side walls to the eave, elliptical arch to the crown, ribs every 3 m
    const [cu, cv, w0, l0, ang] = b.rect;
    const along = l0 >= w0, L = Math.max(w0, l0), Wd = Math.min(w0, l0);
    const dirA = along ? ang + Math.PI / 2 : ang;      // long-axis direction in plan
    const eaveH = Math.max(0.6, b.eave - b.base), rise = Math.max(0.6, b.crown - b.eave);
    const sh = new THREE.Shape(); sh.moveTo(-Wd / 2, 0); sh.lineTo(-Wd / 2, eaveH);
    for (let k = 1; k <= 24; k++) { const a = Math.PI - (k / 24) * Math.PI; sh.lineTo(Math.cos(a) * Wd / 2, eaveH + Math.sin(a) * rise); }
    sh.lineTo(Wd / 2, 0); sh.closePath();
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: L, bevelEnabled: false, curveSegments: 24 }), M.tent);
    body.position.z = -L / 2; body.castShadow = body.receiveShadow = true; g.add(body);
    const ribs = Math.max(2, Math.round(L / 3));
    for (let r = 0; r <= ribs; r++) {
      const z = -L / 2 + (r / ribs) * L, pts = [];
      pts.push(new THREE.Vector3(-Wd / 2 - 0.03, 0, z), new THREE.Vector3(-Wd / 2 - 0.03, eaveH, z));
      for (let k = 1; k <= 24; k++) { const a = Math.PI - (k / 24) * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * (Wd / 2 + 0.03), eaveH + Math.sin(a) * (rise + 0.03), z)); }
      pts.push(new THREE.Vector3(Wd / 2 + 0.03, 0, z));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), 60, 0.05, 6), M.rib);
      tube.castShadow = true; g.add(tube);
    }
    // local x = across, z = along; place so local z follows dirA in plan (u east, v north -> x, -z)
    g.position.copy(P(cu, cv, b.base));
    g.rotation.y = Math.PI / 2 + dirA;
    return g;
  }

  group.traverse(o => { if (o.isMesh && o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = envIntensity; });
  return { group, materials: M };
}
