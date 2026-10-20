"""Derive clean building solids, rooftop units and vehicles from the TRCA 2023 LiDAR + SCOOP 2023 photo.
Output: data/solids.json in the plan frame (metres; u east, v north in drawing-north frame; z above datum 159.0 m)."""
import numpy as np, cv2, json, sys
from scipy import ndimage as ndi
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/site-viewer/data/solids.json'
a = np.load('pts.npy'); th = np.radians(18); DATUM = 159.0
u = a['x'] * np.cos(th) + a['y'] * np.sin(th); v = -a['x'] * np.sin(th) + a['y'] * np.cos(th); z = a['z'] - DATUM; c = a['c']
UA, UB, VA, VB, res = -14.0, 152.0, -64.0, 46.0, 0.25
Nu = int(round((UB - UA) / res)) + 1; Nv = int(round((VB - VA) / res)) + 1
m = (u >= UA - 2) & (u <= UB + 2) & (v >= VA - 2) & (v <= VB + 2); u, v, z, c = u[m], v[m], z[m], c[m]
ix = np.clip(np.round((u - UA) / res).astype(int), 0, Nu - 1); iy = np.clip(np.round((v - VA) / res).astype(int), 0, Nv - 1); lin = iy * Nu + ix
def cellmean(sel):
    cnt = np.bincount(lin[sel], minlength=Nu * Nv); s = np.bincount(lin[sel], weights=z[sel], minlength=Nu * Nv)
    return np.where(cnt > 0, s / np.maximum(cnt, 1), np.nan).reshape(Nv, Nu), cnt.reshape(Nv, Nu)
def fill(A):
    idx = ndi.distance_transform_edt(np.isnan(A), return_distances=False, return_indices=True); return A[tuple(idx)]
G, _ = cellmean(c == 2); G = ndi.median_filter(fill(G), 5)
B, bc = cellmean(c == 6)
bm = bc > 0
bm = ndi.binary_closing(bm, iterations=2); bm = ndi.binary_fill_holes(bm); bm = ndi.binary_opening(bm, iterations=2)
H = ndi.median_filter(fill(B), 3)
Hb = ndi.median_filter(H, 11)                       # roof base surface without rooftop units
toU = lambda col: UA + col * res; toV = lambda row: VA + row * res

# ---- roof levels from histogram peaks
hv = Hb[bm]; bins = np.arange(np.floor(hv.min()), np.ceil(hv.max()) + 0.1, 0.1)
hist, edges = np.histogram(hv, bins); hs = ndi.gaussian_filter1d(hist.astype(float), 1.5)
peaks = [i for i in range(1, len(hs) - 1) if hs[i] >= hs[i - 1] and hs[i] >= hs[i + 1] and hist[max(0, i - 3):i + 4].sum() * res * res > 25]
levels = np.array([(edges[i] + edges[i + 1]) / 2 for i in peaks])
merged = []
for L in levels:
    if merged and L - merged[-1] < 0.5: continue
    merged.append(L)
levels = np.array(merged); print('levels', levels.round(2))
comp, ncomp = ndi.label(bm); vaults = []
for j in range(1, ncomp + 1):
    mk = comp == j; hh = H[mk]
    if mk.sum() * res * res < 600 and np.percentile(hh, 95) - np.percentile(hh, 10) > 0.6: vaults.append(mk)
vmask = np.zeros_like(bm)
for mk in vaults: vmask |= mk
asg = np.argmin(np.abs(Hb[..., None] - levels[None, None, :]), -1) + 1; asg[~bm | vmask] = 0
lab = np.zeros_like(asg); nl = 0
for k in range(1, len(levels) + 1):
    l, n = ndi.label(asg == k)
    for j in range(1, n + 1):
        mk = l == j
        if mk.sum() * res * res >= 12: nl += 1; lab[mk] = nl
idx = ndi.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
lab = np.where(bm & ~vmask, lab[tuple(idx)], 0)

# ---- porch recess (model.js draws the wall, glazing and overhang there)
U = UA + np.arange(Nu) * res; V = VA + np.arange(Nv) * res
recess = (U[None, :] < 8.5) & (V[:, None] > -16.2) & (V[:, None] < 0.35)

# dominant orientation from the largest section
big = np.argmax(np.bincount(lab.ravel())[1:]) + 1
cnts, _ = cv2.findContours((lab == big).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
ang0 = cv2.minAreaRect(max(cnts, key=cv2.contourArea))[2] % 90
if ang0 > 45: ang0 -= 90
th0 = np.radians(ang0); print('dominant angle (deg, plan frame)', round(ang0, 2))

def regularize(P, tol=0.7, snap=18):
    P = np.asarray(P, float); n = len(P); lines = []
    for i in range(n):
        p, q = P[i], P[(i + 1) % n]; d = q - p; L = np.hypot(*d)
        if L < 1e-6: continue
        a = np.arctan2(d[1], d[0]); k = np.round((a - th0) / (np.pi / 2)); da = a - th0 - k * np.pi / 2
        if abs(np.degrees(da)) < snap: a = th0 + k * np.pi / 2
        snapped = abs(np.degrees(da)) < snap
        if not snapped and L < 2.2: continue
        lines.append([(p + q) / 2, np.array([np.cos(a), np.sin(a)]), L])
    changed = True
    while changed and len(lines) > 3:
        changed = False
        for i in range(len(lines)):
            A, Bn = lines[i], lines[(i + 1) % len(lines)]
            if abs(A[1] @ Bn[1]) > 0.999:
                nrm = np.array([-A[1][1], A[1][0]]); off = (Bn[0] - A[0]) @ nrm
                if abs(off) < tol or A[1] @ Bn[1] < 0:
                    w = A[2] + Bn[2]; mid = (A[0] * A[2] + Bn[0] * Bn[2]) / w
                    lines[i] = [mid, A[1], w]; del lines[(i + 1) % len(lines)]; changed = True; break
    out = []; n = len(lines)
    for i in range(n):
        A, Bn = lines[i - 1], lines[i]
        M = np.array([A[1], -Bn[1]]).T
        if abs(np.linalg.det(M)) < 1e-6:          # parallel with an offset: add a perpendicular jog
            nrm = np.array([-A[1][1], A[1][0]]); off = (Bn[0] - A[0]) @ nrm
            e = A[0] + A[1] * (A[2] / 2); out.append(e); out.append(e + nrm * off); continue
        t = np.linalg.solve(M, Bn[0] - A[0]); out.append(A[0] + A[1] * t[0])
    return np.array(out)

def polys_of(mask, eps=0.45, min_area=6):
    mk = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    mk = cv2.morphologyEx(mk, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(mk, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); res_ = []
    for cn in cs:
        if cv2.contourArea(cn) * res * res < min_area: continue
        ap = cv2.approxPolyDP(cn, eps / res, True)[:, 0, :].astype(float)
        P = np.c_[toU(ap[:, 0] + 0.5) - res / 2, toV(ap[:, 1] + 0.5) - res / 2]
        Q = regularize(P)
        if len(Q) >= 3: res_.append(Q)
    return res_

def area(P): x, y = P[:, 0], P[:, 1]; return 0.5 * (x @ np.roll(y, -1) - y @ np.roll(x, -1))
buildings = []
for k in range(1, lab.max() + 1):
    mk = lab == k
    if mk.sum() == 0: continue
    if mk[recess].any(): mk = mk & ~recess
    h = Hb[mk]; top = float(np.median(h)); spread = float(np.percentile(h, 95) - np.percentile(h, 10))
    base = float(np.percentile(G[ndi.binary_dilation(mk, iterations=6)], 5)) - 0.15
    for P in polys_of(ndi.binary_dilation(mk, iterations=1) & bm & ~recess):
        if area(P) < 0: P = P[::-1]
        near = (P[:, 0] > 8.0) & (P[:, 0] < 9.2) & (P[:, 1] > -16.9) & (P[:, 1] < 1.0)
        P[near, 0] = 8.64                              # recess back face sits on the porch wall drawn in model.js
        b = dict(poly=np.round(P, 3).tolist(), base=round(base, 2), top=round(top, 2))
        buildings.append(b)
for mk in vaults:
    h = H[mk]; base = float(np.percentile(G[ndi.binary_dilation(mk, iterations=6)], 5)) - 0.15
    for P in polys_of(mk):
        if area(P) < 0: P = P[::-1]
        (cx, cy), (w, l), angr = cv2.minAreaRect(P.astype(np.float32))
        buildings.append(dict(poly=np.round(P, 3).tolist(), base=round(base, 2), top=round(float(np.percentile(h, 97)), 2), kind='vault',
                              eave=round(float(np.percentile(h, 6)), 2), crown=round(float(np.percentile(h, 97)), 2),
                              rect=[round(float(cx), 3), round(float(cy), 3), round(float(w), 3), round(float(l), 3), round(float(np.radians(angr)), 4)]))
print(len(buildings), 'building solids', [(b['top'], len(b['poly']), b.get('kind', 'flat')) for b in buildings])

# ---- rooftop units: blobs standing above the roof base
resid = np.where(bm, H - Hb, 0)
edge = np.zeros_like(bm)
for dx, dy in ((1, 0), (0, 1)):
    d = (lab != np.roll(lab, dx, 1)) if dx else (lab != np.roll(lab, dy, 0)); edge |= d
edge = ndi.binary_dilation(edge | ~ndi.binary_erosion(bm, iterations=2), iterations=6)
ul, un = ndi.label(ndi.binary_opening(resid > 0.45, iterations=1) & ~edge); units = []
for j in range(1, un + 1):
    mk = ul == j; A = mk.sum() * res * res
    if A < 0.8 or A > 80 or np.median(resid[mk]) > 3.0: continue
    cs, _ = cv2.findContours(mk.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    (cx, cy), (w, l), ang = cv2.minAreaRect(max(cs, key=cv2.contourArea))
    units.append(dict(c=[round(toU(cx), 2), round(toV(cy), 2)], w=round(max(w * res, 0.6), 2), d=round(max(l * res, 0.6), 2), ang=round(np.radians(ang), 3),
                      base=round(float(np.median(Hb[mk])), 2), top=round(float(np.median(H[mk]) + 0.25), 2)))
print(len(units), 'rooftop units')

vehicles = []
json.dump(dict(frame='plan metres, u east / v north in drawing-north frame, z above datum 159.0 m', angle_deg=round(ang0, 2),
               buildings=buildings, units=units, vehicles=vehicles), open(OUT, 'w'), separators=(',', ':'))

# preview
vis = np.zeros((Nv, Nu, 3), np.uint8); vis[bm] = (70, 70, 70)
S = 4
big_ = cv2.resize(vis[::-1], (Nu * S // 4 * 4 // 4 * 1, Nv * 1), interpolation=cv2.INTER_NEAREST)
canvas = cv2.resize(vis, (Nu * 2, Nv * 2), interpolation=cv2.INTER_NEAREST)
P2 = lambda p: (int((p[0] - UA) / res * 2), int((p[1] - VA) / res * 2))
for b in buildings: cv2.polylines(canvas, [np.array([P2(p) for p in b['poly']], np.int32)], True, (0, 255, 255), 2)
for t in units: cv2.circle(canvas, P2(t['c']), 4, (255, 0, 255), -1)
cv2.imwrite('solids.png', canvas[::-1])
