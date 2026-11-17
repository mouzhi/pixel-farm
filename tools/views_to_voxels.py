"""Carve a voxel model from a 2x2 orthographic pixel-art sheet (top / side-facing-left / front / back).
A voxel exists where every view is opaque; colours come from the view facing that surface.
Writes a JS file (window.PF_ASSETS[name] = {w,d,h,pal,vox}) so the game still works from file://.
usage: python3 views_to_voxels.py sheet.png name out.js [scale=0.5] [layout=std|rside]
  layout rside: the bottom-right view is a RIGHT side view (not a back view); the back is then
  carved from the mirrored front silhouette and coloured with each row's main front colour."""
import sys, json
from collections import deque, Counter
import numpy as np
from PIL import Image

def components(mask):
    H, W = mask.shape; seen = np.zeros_like(mask, bool); comps = []
    for y in range(H):
        for x in range(W):
            if mask[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True; pts = []
                while q:
                    cy, cx = q.popleft(); pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; q.append((ny, nx))
                comps.append(pts)
    return comps

def lum(c): return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]

def clean_view(rgb, mask):
    """Drop the dark outline colour (the game outlines the finished stack itself) by
    giving outline pixels the colour of the nearest interior pixel."""
    H, W = mask.shape; out = rgb.copy().astype(int)
    dark = np.array([[mask[y, x] and lum(rgb[y, x]) < 55 for x in range(W)] for y in range(H)])
    interior = mask & ~dark
    for _ in range(4):
        changed = False
        for y in range(H):
            for x in range(W):
                if dark[y, x]:
                    nb = [out[y2, x2] for y2, x2 in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)) if 0 <= y2 < H and 0 <= x2 < W and interior[y2, x2]]
                    if nb:
                        out[y, x] = nb[0]; dark[y, x] = False; interior[y, x] = True; changed = True
        if not changed: break
    return out, mask

def downscale(rgb, mask, s):
    """Shrink by any factor: each output pixel takes the most common colour of the source block it covers."""
    if s >= 1: return rgb, mask
    H, W = mask.shape; h, w = max(1, round(H * s)), max(1, round(W * s))
    yb = [round(i * H / h) for i in range(h + 1)]; xb = [round(j * W / w) for j in range(w + 1)]
    o = np.zeros((h, w, 3), int); m = np.zeros((h, w), bool)
    for y in range(h):
        for x in range(w):
            blk = [(yy, xx) for yy in range(yb[y], yb[y+1]) for xx in range(xb[x], xb[x+1]) if mask[yy, xx]]
            area = (yb[y+1] - yb[y]) * (xb[x+1] - xb[x])
            if area and len(blk) * 2 >= area:
                m[y, x] = True; o[y, x] = Counter(tuple(rgb[p]) for p in blk).most_common(1)[0][0]
    return o, m

def resize(rgb, mask, w, h):
    H, W = mask.shape
    ys = [min(H-1, int(i * H / h)) for i in range(h)]; xs = [min(W-1, int(j * W / w)) for j in range(w)]
    return rgb[np.ix_(ys, xs)], mask[np.ix_(ys, xs)]

def main():
    src, name, out = sys.argv[1:4]; scale = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
    layout = sys.argv[5] if len(sys.argv) > 5 else 'std'
    img = Image.open(src).convert('RGBA'); al = img.getchannel('A')
    q = img.convert('RGB').quantize(colors=int(__import__("os").environ.get("PF_COLORS", "24")), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB'); q.putalpha(al)
    im = np.array(q); rgb, mask = im[..., :3], im[..., 3] > 128
    comps = sorted(components(mask), key=len, reverse=True)[:4]
    H, W = mask.shape; views = {}
    for pts in comps:
        ys = [p[0] for p in pts]; xs = [p[1] for p in pts]; cy, cx = np.mean(ys), np.mean(xs)
        key = ('top' if cx < W/2 else 'side') if cy < H/2 else ('front' if cx < W/2 else 'back')
        y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
        m = np.zeros((y1-y0+1, x1-x0+1), bool)
        for y, x in pts: m[y-y0, x-x0] = True
        c, m = clean_view(rgb[y0:y1+1, x0:x1+1], m)
        views[key] = downscale(c, m, scale)
    (fr, fm), (sd, sm), (tp, tm) = views['front'], views['side'], views['top']
    Wx = fm.shape[1]; D = sm.shape[1]
    if layout == 'rside':
        r2, r2m = views['back']; r2, r2m = resize(r2, r2m, D, r2m.shape[0])
        bk, bm = fr[:, ::-1].copy(), fm[:, ::-1].copy()
        for rr in range(bk.shape[0]):           # plain back wall: the main colour of each front row
            cols = [tuple(fr[rr, x]) for x in range(Wx) if fm[rr, x]]
            if cols: bk[rr, :] = Counter(cols).most_common(1)[0][0]
    else:
        bk, bm = views['back']; r2, r2m = sd[:, ::-1].copy(), sm[:, ::-1].copy()   # right side = mirrored left side
    Hz = max(fm.shape[0], sm.shape[0], r2m.shape[0])
    bk, bm = resize(bk, bm, Wx, bm.shape[0]); tp, tm = resize(tp, tm, Wx, D)
    def pad(c, m):  # align on the ground line (bottom row)
        h = m.shape[0]; pc = np.zeros((Hz, m.shape[1], 3), int); pm = np.zeros((Hz, m.shape[1]), bool)
        pc[Hz-h:] = c; pm[Hz-h:] = m; return pc, pm
    fr, fm = pad(fr, fm); bk, bm = pad(bk, bm); sd, sm = pad(sd, sm); r2, r2m = pad(r2, r2m)
    vox = np.zeros((Hz, D, Wx), bool)   # [z][y][x], z = 0 at the ground
    for z in range(Hz):
        r = Hz - 1 - z
        for y in range(D):
            for x in range(Wx):
                vox[z, y, x] = tm[y, x] and fm[r, x] and bm[r, Wx-1-x] and (sm[r, D-1-y] or r2m[r, y])
    pal = []; pidx = {}; flat = []
    def col(c):
        c = '#%02x%02x%02x' % tuple(int(v) for v in c)
        if c not in pidx: pidx[c] = len(pal) + 1; pal.append(c)
        return pidx[c]
    for z in range(Hz):
        r = Hz - 1 - z
        for y in range(D):
            for x in range(Wx):
                if not vox[z, y, x]: flat.append(0); continue
                V = lambda zz, yy, xx: 0 <= zz < Hz and 0 <= yy < D and 0 <= xx < Wx and vox[zz, yy, xx]
                if not V(z+1, y, x): c = tp[y, x]                      # seen from above
                elif not V(z, y+1, x): c = fr[r, x]                    # front face
                elif not V(z, y, x-1): c = sd[r, D-1-y] if sm[r, D-1-y] else r2[r, y]   # left face
                elif not V(z, y, x+1): c = r2[r, y] if r2m[r, y] else sd[r, D-1-y]     # right face
                elif not V(z, y-1, x): c = bk[r, Wx-1-x]               # back face
                else: c = fr[r, x]
                flat.append(col(c))
    data = {'w': Wx, 'd': D, 'h': Hz, 'pal': pal, 'vox': flat}
    with open(out, 'a') as f:
        f.write('(window.PF_ASSETS = window.PF_ASSETS || {})[%s] = %s;\n' % (json.dumps(name), json.dumps(data, separators=(',', ':'))))
    print(name, 'w', Wx, 'd', D, 'h', Hz, 'voxels', int(vox.sum()), 'colors', len(pal))

main()
