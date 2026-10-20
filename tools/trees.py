"""Individual trees from the TRCA 2023 LiDAR: canopy height model -> treetops -> watershed crowns.
Output data/trees.json (plan-frame metres, heights above datum 159.0 m)."""
import numpy as np, json, sys, cv2
from scipy import ndimage as ndi
from skimage.segmentation import watershed
from skimage.feature import peak_local_max
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/site-viewer/data/trees.json'
a = np.load('pts.npy'); th = np.radians(18); DATUM = 159.0
u = a['x'] * np.cos(th) + a['y'] * np.sin(th); v = -a['x'] * np.sin(th) + a['y'] * np.cos(th); z = a['z'] - DATUM; c = a['c']; I = a['i']
UA, UB, VA, VB, res = -14.0, 152.0, -64.0, 46.0, 0.5
pad = 6
m = (u >= UA - pad) & (u <= UB + pad) & (v >= VA - pad) & (v <= VB + pad); u, v, z, c, I = u[m], v[m], z[m], c[m], I[m]
Nu = int(round((UB - UA + 2 * pad) / res)) + 1; Nv = int(round((VB - VA + 2 * pad) / res)) + 1
ix = np.clip(np.round((u - UA + pad) / res).astype(int), 0, Nu - 1); iy = np.clip(np.round((v - VA + pad) / res).astype(int), 0, Nv - 1); lin = iy * Nu + ix
g = c == 2; cnt = np.bincount(lin[g], minlength=Nu * Nv); s = np.bincount(lin[g], weights=z[g], minlength=Nu * Nv)
G = np.where(cnt > 0, s / np.maximum(cnt, 1), np.nan).reshape(Nv, Nu)
idx = ndi.distance_transform_edt(np.isnan(G), return_distances=False, return_indices=True); G = ndi.median_filter(G[tuple(idx)], 5)
hag = z - G[iy, ix]
bmask = np.zeros(Nu * Nv, bool); bmask[lin[c == 6]] = True; bmask = ndi.binary_dilation(bmask.reshape(Nv, Nu), iterations=3)
veg = (c == 1) & (hag > 1.2) & (hag < 30) & ~bmask[iy, ix]
chm = np.zeros(Nu * Nv); np.maximum.at(chm, lin[veg], hag[veg]); chm = chm.reshape(Nv, Nu)
# fill pits, smooth lightly
chm = ndi.grey_closing(chm, size=3); chm_s = ndi.gaussian_filter(chm, 1.0)
mask = chm_s > 2.0
# objects that are not trees: compact low blobs with a flat top (yard stock, trucks, signs)
lab0, n0 = ndi.label(mask)
for j in range(1, n0 + 1):
    mk = lab0 == j; hh = chm[mk]
    if mk.sum() * res * res < 2.0 or hh.max() < 3.0: mask[mk] = False
peaks = peak_local_max(chm_s, min_distance=4, threshold_abs=3.0, labels=ndi.label(mask)[0], exclude_border=False)
markers = np.zeros(chm.shape, int)
for k, (r, cc) in enumerate(peaks, 1): markers[r, cc] = k
seg = watershed(-chm_s, markers, mask=mask)
img = np.asarray(Image.open('/home/claude/site-viewer/data/ortho.jpg')).astype(float); Ih, Iw = img.shape[:2]
toU = lambda col: UA - pad + col * res; toV = lambda row: VA - pad + row * res
pid = seg[iy, ix]
trees = []
for k, (r, cc) in enumerate(peaks, 1):
    mk = seg == k; A = mk.sum() * res * res
    if A < 0.5: continue
    sel = veg & (pid == k)
    if sel.sum() < 15: continue
    hz = hag[sel]; H = float(np.percentile(hz, 99)); topz = float(np.percentile(z[sel], 99))
    if H < 3.0: continue
    rows, cols = np.nonzero(mk); cu = float(toU(cols.mean())); cv_ = float(toV(rows.mean()))
    if not (UA - 1 <= cu <= UB + 1 and VA - 1 <= cv_ <= VB + 1): continue
    R = float(np.sqrt(A / np.pi))
    base = float(np.clip(np.percentile(hz, 4), 0.8, H * 0.65))
    # crown elongation for a slightly oval crown
    du, dv = u[sel] - cu, v[sel] - cv_
    cov = np.cov(np.vstack([du, dv])); ev, evec = np.linalg.eigh(cov); ratio = float(np.sqrt(ev[0] / max(ev[1], 1e-6)))
    ang = float(np.arctan2(evec[1, 1], evec[0, 1]))
    kind = 'pole' if ((R < 1.25 and sel.sum() < 120) or (R < 1.7 and H > 8)) else ('conifer' if (R / H < 0.26 and H > 5) else 'deciduous')
    # colour: median of photo pixels inside the crown, nudged to a plausible foliage range
    pc = ((u[sel] - UA) / (UB - UA) * Iw).astype(int); pr = ((VB - v[sel]) / (VB - VA) * Ih).astype(int)
    ok = (pc >= 0) & (pc < Iw) & (pr >= 0) & (pr < Ih)
    col = np.median(img[pr[ok], pc[ok]], 0) if ok.sum() > 5 else np.array([70, 90, 55])
    trees.append(dict(u=round(cu, 2), v=round(cv_, 2), g=round(float(G[r, cc]), 2), h=round(H, 2), r=round(max(R, 0.9), 2), b=round(base, 2),
                      e=round(min(1.0, max(0.6, ratio)), 2), a=round(ang, 3), k=kind[0], col='#%02x%02x%02x' % tuple(int(x) for x in col)))
print(sum(t['k'] == 'p' for t in trees), 'poles;', len(trees), 'total;', sum(t['k'] == 'c' for t in trees), 'conifers; heights', np.percentile([t['h'] for t in trees], [10, 50, 90]).round(1),
      'radii', np.percentile([t['r'] for t in trees], [10, 50, 90]).round(1))
json.dump(dict(frame='plan metres (u east, v north in drawing-north frame); g = ground, h = height above ground, r = crown radius, b = crown base, e = crown aspect, k = d/c',
               trees=trees), open(OUT, 'w'), separators=(',', ':'))
# preview
vis = (np.clip(chm / 15, 0, 1) * 200).astype(np.uint8); vis = cv2.cvtColor(vis, cv2.COLOR_GRAY2BGR)
vis = cv2.resize(vis, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
for t in trees:
    p = (int((t['u'] - UA + pad) / res * 2), int((t['v'] - VA + pad) / res * 2))
    cv2.circle(vis, p, int(t['r'] / res * 2), {'d': (0, 255, 0), 'c': (255, 160, 0), 'p': (0, 0, 255)}[t['k']], 1)
cv2.imwrite('trees.png', vis[::-1])
