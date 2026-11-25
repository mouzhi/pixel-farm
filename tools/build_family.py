#!/usr/bin/env python3
"""v5.3 family sprite sheets: builds assets/family_sprites.js from the farmer sheet in assets/sprites.js.

The family used to be pure palette swaps of the whole farmer sheet. The farmer's shirt red (#a8432e) is also the colour of his
mouth in every side-facing frame, so swapping the shirt to 阿禾's cream blouse painted a 2-pixel cream bar across her chin
(the "white beard"), and the children got a yellow / green one. Now:
  * every frame's head is located by template matching (heads are exact translations of the idle head in each direction),
  * the body is recoloured with the look's map, the head is not (so the face keeps its own colours),
  * 阿禾 gets her own hand-drawn head in three directions: a cream headscarf with a pink flower and long auburn hair that falls
    past her shoulders (front), down her back (side) and over her back (back). Arms and tools that pass in front of the head
    (the raised hoe) are kept on top.
Run: python3 tools/build_family.py [--preview out.png]
"""
import base64, io, json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = open(os.path.join(ROOT, 'assets', 'sprites.js'), encoding='utf8').read()
SHEET = Image.open(io.BytesIO(base64.b64decode(re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', SRC).group(1)))).convert('RGBA')
ROWS = json.loads(re.search(r'"rows":\s*(\[[^\]]*\])', SRC).group(1))
FW = int(re.search(r'"fw":\s*(\d+)', SRC).group(1)); FH = int(re.search(r'"fh":\s*(\d+)', SRC).group(1))
FRAMES = json.loads(re.search(r'"frames":\s*(\{[^}]*\})', SRC).group(1))
DIR = {'walk_front': 'front', 'idle_front': 'front', 'walk_back': 'back', 'idle_back': 'back'}  # every other farmer row faces sideways
FARMER_ROWS = [r for r in ROWS if not r.startswith('keeper')]
hexc = lambda p: '#%02x%02x%02x' % p[:3]
rgba = lambda h: (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), 255)

def frame(img, row, fr):
    px = img.load(); ri = ROWS.index(row)
    return {(x, y): px[fr * FW + x, ri * FH + y] for y in range(FH) for x in range(FW) if px[fr * FW + x, ri * FH + y][3]}

# the farmer's head in each direction, from the first idle / walk frame (rows 4.. of the frame)
HEAD = {k: {(x, y - 4): v for (x, y), v in frame(SHEET, r, 0).items() if 4 <= y < 4 + h}
        for k, r, h in [('front', 'walk_front', 12), ('side', 'walk_side', 12), ('back', 'walk_back', 11)]}

def locate(f, d):
    t = HEAD[d]; best = (-1, 0, 0)
    for dy in range(0, 12):
        for dx in range(-4, 5):
            s = sum(1 for (x, y), v in t.items() if f.get((x + dx, y + dy)) == v)
            if s > best[0]: best = (s, dx, dy)
    return best[1], best[2]

def occluders(f, d, dx, dy):
    """pixels inside the head's footprint that are not head: a tool or arm in front, reached from outside the head above the chin"""
    mask = {(x + dx, y + dy) for (x, y) in HEAD[d]}
    diff = {p for p in mask if p in f and f[p] != HEAD[d].get((p[0] - dx, p[1] - dy))}
    seen, stack = set(), [p for p in f if p not in mask and p[1] < dy + 10]
    seen.update(stack)
    while stack:
        x, y = stack.pop()
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if q in seen or q not in f: continue
            if q in mask and q not in diff: continue
            seen.add(q); stack.append(q)
    return diff & seen, mask

# 阿禾's head. Rows 0-11 replace the farmer's head (same anchor); rows 12+ are long hair drawn over the body.
# # ink  a scarf  p scarf shade  h flower / cheek  c hair  d hair light  i hair shadow  f p e skin (front / side / side shade)  g mouth
C = {'#': '#1c1626', 'a': '#f6ecd0', 'p': '#ecc27c', 'h': '#e57fa0', 'c': '#a8432e', 'd': '#cf6a3c', 'i': '#7a2c24', 'f': '#f2c29a', 'e': '#d3984c', 'g': '#c47a52', 'k': '#ecc27c'}
AHE = {
 'front': [
  '............................',
  '...........######...........',
  '..........#aaaaaa#..........',
  '.........#aaaaaaap#.........',
  '........#paaaaaaahh#........',
  '.......#cpppppppphc#........',
  '......#cccdccfccfcccc#......',
  '......#cicciffcfffcic#......',
  '......#cifcf#fff#fic#.......',
  '......#cihff#fff#hic#.......',
  '......#cciffffgfffic#.......',
  '......#cci##fffff#ic#.......',
  '......#cci........ic#.......',
  '......#cci........ic#.......',
  '.......#ci........i#........',
  '........#i........#.........',
 ],
 'side': [
  '............................',
  '...........#####............',
  '..........#aaaaa#...........',
  '.........#aaaaaaa#..........',
  '........#haaaaaaap#.........',
  '........#hpppppppp#.........',
  '.......#ccdcccdcccc#........',
  '......#ccicciipppep#........',
  '......#ccicipp#pp#..........',
  '......#ccicpppphpp#.........',
  '......#cciiepppgpp#.........',
  '......#cci##epppp#..........',
  '......#cci..................',
  '......#cdi..................',
  '......#cci..................',
  '.......#ci..................',
  '.......#ii..................',
  '........#...................',
 ],
 'back': [
  '............................',
  '...........######...........',
  '..........#aaaaaa#..........',
  '.........#aaaaaaaa#.........',
  '.........#haaaaaap#.........',
  '.........#hpppappp#.........',
  '.........#ccccaccc#.........',
  '.........#cdcccdcc#.........',
  '.........#ccdcccdc#.........',
  '.........#icccccci#.........',
  '.........#icdccdci#.........',
  '.........#iccccdci#.........',
  '..........#icdcci#..........',
  '..........#icccci#..........',
  '..........#iccdci#..........',
  '...........#icci#...........',
  '............#ii#............',
 ],
}
for d, rows in AHE.items():
    for r in rows: assert len(r) == 28, (d, r, len(r))

LOOKS = {  # body colours (same as the old runtime swap); the head keeps its colours
    'partner': {'#4fa3cf': '#52af3a', '#2f6ea0': '#358a3c', '#1f3d68': '#24603a', '#a8432e': '#f6ecd0', '#7a2c24': '#ecc27c', '#8a5530': '#cf6a3c', '#5e3524': '#a8432e'},
    'kid0': {'#a8432e': '#f2cf55', '#7a2c24': '#d3984c'},
    'kid1': {'#4fa3cf': '#e06a2c', '#2f6ea0': '#a8432e', '#1f3d68': '#7a2c24', '#a8432e': '#52af3a', '#7a2c24': '#358a3c', '#8a5530': '#5e3524'},
    # v5.12.5 第三代: the granddaughters. A cream blouse under a pink pinafore dress; no straw hat, the school mop of hair with two
    # pigtails tied with pink bows (girl() below). 小芽 and the girl classmates are runtime recolours of this sheet (game.js FAM_DERIVE).
    'g3girl': {'#4fa3cf': '#e57fa0', '#2f6ea0': '#c45a7a', '#1f3d68': '#8a3a54', '#a8432e': '#f6ecd0', '#7a2c24': '#ecc27c'},
}
HAT_ROWS = 5  # children keep the straw hat; its band (template rows 0-4) takes the shirt colour like before

# v5.8.1: the school walk. The same children without the straw hat (a short brown mop of hair instead) and with a red school
# backpack. Hair rows are in the frame's own coordinates for the template head position (dx 0, dy 4), cleared from row 4 down
# to the last listed row and redrawn; the face below is the farmer's, untouched.
# E hair  G hair shade  A ink
KHAIR = {
 'front': {7: '..........AAAAAAAA..........', 8: '........AAEEEEEEEEAA........', 9: '.......AEEEGEEEEGEEEA.......',
           10: '.......AEEEEEEEEEEEEA.......', 11: '.......AEEFFEEFFEFEEA.......'},
 'side':  {7: '..........AAAAAA............', 8: '.........AEEEEEEAA..........', 9: '........AEEEGEEEEEA.........',
           10: '........AEEEEEEEEEEA........', 11: '........AEGEEECCCBCA........'},
 'back':  {7: '..........AAAAAAAA..........', 8: '........AAEEEEEEEEAA........', 9: '.......AEEEEGEEEEGEEA.......',
           10: '.......AEEGEEEEEEEEEA.......', 11: '.......AEEEEEGEEEEEEA.......', 12: '........AEEEEEEEEEEA........',
           13: '........AGEEEEEEEEGA........', 14: '.........AGGEEEEGGA.........'},
}
# the backpack in the child's FINAL rows (after the game drops body rows 18-23 and moves the top down by 6): final row f is sheet
# row f - 6 above 24 and row f from 24 on. R red  S red shade  T flap  Y buckle
CUT = 6
KPACK = {
 'front': {21: '........AR........RA........', 22: '........AR........RA........', 23: '...........S....S...........'},
 'side':  {20: '.....AAAA...................', 21: '....ATTTRA..................', 22: '....ASTTRA..................', 23: '....ARRYRA..................',
           24: '....ARRRSA..................', 25: '....ASSSSA..................', 26: '.....AAAA...................'},
 'back':  {20: '..........AAAAAAAA..........', 21: '.........ATTTTTTTTA.........', 22: '.........ASTTYYTTSA.........', 23: '.........ARRRRRRRSA.........',
           24: '.........ARRRRRRRSA.........', 25: '.........ASSSSSSSSA.........', 26: '..........AAAAAAAA..........'},
}
KC = {'A': '#1c1626', 'E': '#8a5530', 'G': '#5e3524', 'C': '#ecc27c', 'B': '#d3984c', 'F': '#f2c29a', 'R': '#a8432e', 'S': '#7a2c24', 'T': '#cf6a3c', 'Y': '#f2cf55'}
for d in KHAIR:
    for r in list(KHAIR[d].values()) + list(KPACK[d].values()): assert len(r) == 28, (d, r, len(r))

def school(put, f, d, dx, dy, occ, pack=True):
    """hat off, hair on, backpack on (children only; the face and body keep the colours already put)"""
    ox, oy = dx - 0, dy - 4
    last = max(KHAIR[d])
    for y in range(4, last + 1):                      # the hat goes: clear the head's top rows across the frame
        for x in range(FW):
            p = (x + ox, y + oy)
            if p in occ: continue
            put(p[0], p[1], (0, 0, 0, 0))
    for y, r in KHAIR[d].items():
        for x, ch in enumerate(r):
            if ch != '.' and (x + ox, y + oy) not in occ: put(x + ox, y + oy, rgba(KC[ch]))
    for fy, r in (KPACK[d].items() if pack else ()):
        y = fy - CUT if fy < 24 else fy
        for x, ch in enumerate(r):
            if ch != '.': put(x + ox, y + oy, rgba(KC[ch]))


# v5.12.5 the granddaughters' pigtails: frame coordinates for the template head (like KHAIR), drawn only on empty pixels so the face,
# the body and a tool in front stay. E hair  G hair shade  A ink  P bow
GTAIL = {
 'front': {9: [(5, 'A'), (6, 'P'), (21, 'P'), (22, 'A')], 10: [(5, 'A'), (6, 'P'), (21, 'P'), (22, 'A')],
           11: [(5, 'A'), (6, 'E'), (21, 'E'), (22, 'A')], 12: [(5, 'A'), (6, 'E'), (21, 'E'), (22, 'A')],
           13: [(5, 'A'), (6, 'G'), (21, 'G'), (22, 'A')], 14: [(6, 'A'), (21, 'A')]},
 'side':  {8: [(7, 'A'), (6, 'A')], 9: [(6, 'A'), (7, 'P')], 10: [(5, 'A'), (6, 'P'), (7, 'E')], 11: [(5, 'A'), (6, 'E'), (7, 'E')],
           12: [(5, 'A'), (6, 'E'), (7, 'G')], 13: [(5, 'A'), (6, 'G')], 14: [(5, 'A'), (6, 'A')]},
 'back':  {9: [(5, 'A'), (6, 'P'), (21, 'P'), (22, 'A')], 10: [(5, 'A'), (6, 'P'), (21, 'P'), (22, 'A')],
           11: [(5, 'A'), (6, 'E'), (21, 'E'), (22, 'A')], 12: [(5, 'A'), (6, 'E'), (21, 'E'), (22, 'A')],
           13: [(5, 'A'), (6, 'G'), (21, 'G'), (22, 'A')], 14: [(6, 'A'), (21, 'A')]},
}
GC = {'A': '#1c1626', 'E': '#8a5530', 'G': '#5e3524', 'P': '#e57fa0'}

def girl(put, get, d, dx, dy, occ):
    ox, oy = dx, dy - 4
    for y, cells in GTAIL[d].items():
        for x, ch in cells:
            p = (x + ox, y + oy)
            if p in occ or get(*p)[3]: continue
            put(p[0], p[1], rgba(GC[ch]))


# v5.11.0.18 婚礼: the couple's wedding clothes (only on the wedding evening; game.js picks the sheet). Both start from the
# school head (no straw hat, a brown mop of hair) on a grown-up body.
#   bride: a cream-white gown (bodice, a pink sash, an A-line skirt to the ground that sways when she walks), a veil that falls
#          behind her head and shoulders with a little flower crown, and a small bouquet held in front (front / side views)
#   groom: a white shirt, a grey waistcoat and trousers, black shoes, a dark bow tie and a pink boutonniere
# Palette colours only (cream #f6ecd0 / pale stone #cfd0c6 read as white next to the grass).
WED_LOOKS = {
    'bride': {'#a8432e': '#f6ecd0', '#7a2c24': '#cfd0c6', '#4fa3cf': '#f6ecd0', '#2f6ea0': '#f6ecd0', '#1f3d68': '#cfd0c6', '#3e3f4c': '#9a9ea0',
              '#c47a52': '#f2c29a', '#ecc27c': '#f6ecd0', '#d3984c': '#cfd0c6', '#b47a3e': '#cfd0c6', '#5e3524': '#9a9ea0', '#8a5530': '#cfd0c6'},
    'groom': {'#a8432e': '#3e3f4c', '#7a2c24': '#3a2b38', '#4fa3cf': '#f6ecd0', '#2f6ea0': '#f6ecd0', '#1f3d68': '#cfd0c6', '#3e3f4c': '#3e3f4c',
              '#5e3524': '#1c1626', '#8a5530': '#3a2b38', '#c47a52': '#f2c29a'},
}
WC = {'A': '#1c1626', 'W': '#f6ecd0', 'S': '#cfd0c6', 'D': '#9a9ea0', 'P': '#e57fa0', 'R': '#a8432e', 'G': '#358a3c', 'Y': '#f2cf55', 'V': '#cfd0c6'}

def wedding(put, get, f, d, dx, dy, occ, look, fr, row):
    """after school(): the gown / the suit on the frame (put: write a pixel, get: read the frame being written)"""
    body = [(x, y) for (x, y) in f if dy + 13 <= y <= dy + 16]
    cx = round(sum(x for x, _ in body) / max(1, len(body))) if body else 14 + dx
    face = 1 if d == 'side' else 0
    walk = row.startswith('walk')
    if look == 'groom':
        white, shade = rgba('#f6ecd0'), rgba('#cfd0c6')
        for (x, y) in list(f):
            if (x, y) in occ or y < dy + 13: continue
            v = get(x, y)
            if (y >= dy + 19 or (d == 'back' and y > dy + 13)) and v[:3] in (white[:3], shade[:3]): put(x, y, rgba('#3e3f4c' if v[:3] == white[:3] else '#3a2b38'))  # trousers
            elif y < dy + 18 and v[:3] in (rgba('#f2c29a')[:3], rgba('#ecc27c')[:3], rgba('#d3984c')[:3]) and abs(x - cx) >= 4: put(x, y, rgba('#3e3f4c'))  # jacket sleeves (hands stay)
        if d == 'front':  # bow tie at the collar, a boutonniere on his left (screen right) chest
            for x in (cx - 1, cx, cx + 1): put(x, dy + 13, rgba(WC['A']))
            put(cx + 3, dy + 14, rgba(WC['P'])); put(cx + 3, dy + 15, rgba(WC['G']))
        elif d == 'side':
            put(cx + 2, dy + 13, rgba(WC['A'])); put(cx + 1, dy + 14, rgba(WC['P']))
        return
    # ---- bride ----
    ys = dy + 17 if d != 'side' else dy + 17          # the waist: the skirt starts here and reaches the ground (row 27)
    sway = (1 if fr % 2 else -1) if walk else 0
    back = -1 if d == 'side' else 0                     # in profile the train trails behind (to the left: side frames face right)
    for y in range(ys, FH):
        t = (y - ys) / max(1, FH - 1 - ys)
        hw = 4 + t * 4.2
        c0 = cx + back * round(t * 2) + (round(sway * t) if y >= FH - 3 else 0)
        x0, x1 = int(round(c0 - hw)), int(round(c0 + hw))
        for x in range(x0, x1 + 1):
            if (x, y) in occ: continue
            if x in (x0, x1) or y == FH - 1: col = WC['A']
            elif y == FH - 2: col = WC['S'] if (x + fr) % 2 else WC['W']     # the lace hem
            elif x >= x1 - 1: col = WC['S']                                  # the shaded side
            elif y > ys + 1 and (x - x0) % 4 == 2: col = WC['S']             # soft folds
            else: col = WC['W']
            put(x, y, rgba(col))
    if d != 'back':                                     # the pink sash round the waist
        for x in range(cx - 3, cx + 4):
            if get(x, ys) and get(x, ys)[3] and (x, ys) not in occ and get(x, ys)[:3] != rgba(WC['A'])[:3]: put(x, ys, rgba(WC['P']))
    # the veil: behind her (only on empty pixels) in front / profile, over her back in the back view; a flower crown on top
    top = dy + 3
    vl = lambda x, y, edge: rgba(WC['S'] if edge else WC['W'])
    for y in range(top, dy + 18):
        t = (y - top) / 14
        if d == 'front':      # behind her head, falling past her shoulders a little wider at the bottom
            a, b = cx - 7 - round(t * 1.6), cx + 7 + round(t * 1.6)
            if y == top: a, b = cx - 4, cx + 4
            for x in range(a, b + 1):
                if not get(x, y)[3]: put(x, y, vl(x, y, x in (a, b)))
        elif d == 'side':     # streaming back from the crown
            a, b = cx - 6 - round(t * 3), cx + 1
            if y == top: a = cx - 3
            for x in range(a, b + 1):
                if not get(x, y)[3]: put(x, y, vl(x, y, x == a))
        elif y >= dy + 6:     # over the back of her head and down her back, the hair showing above it
            a, b = cx - 4 - round(t * 1.5), cx + 4 + round(t * 1.5)
            for x in range(a, b + 1):
                if (x, y) not in occ: put(x, y, vl(x, y, x in (a, b) or (x - cx) % 3 == 0 and y > dy + 9))
    # soft outline round the veil where it meets the grass
    snap = {}
    for y in range(top - 1, dy + 19):
        for x in range(FW):
            snap[(x, y)] = get(x, y)
    for (x, y), v in snap.items():
        if v[3]: continue
        for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            w = snap.get(q)
            if w and w[3] and w[:3] in (rgba(WC['W'])[:3], rgba(WC['V'])[:3]) and q[1] < dy + 18: put(x, y, rgba(WC['D'])); break
    crown = {'front': [(-3, 'P'), (-2, 'Y'), (-1, 'P'), (0, 'W'), (1, 'P'), (2, 'Y'), (3, 'P')], 'side': [(-3, 'P'), (-2, 'Y'), (-1, 'P'), (0, 'W'), (1, 'P')],
             'back': [(-3, 'P'), (-1, 'P'), (1, 'P'), (3, 'P')]}[d]
    for ox, ch in crown: put(cx + ox, dy + 3, rgba(WC[ch]))
    # the bouquet, held at the waist
    if d != 'back':
        bx = cx + (3 if d == 'side' else 0); by = ys - 2
        for oy, r in enumerate(['.APA.', 'APWPA', 'AYPYA', '.AGA.']):
            for ox, ch in enumerate(r):
                if ch != '.': put(bx + ox - 2, by + oy, rgba(WC[ch]))

def build(look):
    wed = look in WED_LOOKS
    base = look.replace('_school', '')
    out = SHEET.copy(); px = out.load(); m = WED_LOOKS[look] if wed else LOOKS[base]
    if wed:  # the keeper rows are never drawn with these sheets
        for row in ROWS:
            if row in FARMER_ROWS: continue
            ri = ROWS.index(row)
            for y in range(FH):
                for x in range(SHEET.width): px[x, ri * FH + y] = (0, 0, 0, 0)
    for row in FARMER_ROWS:
        ri = ROWS.index(row); d = DIR.get(row, 'side')
        for fr in range(FRAMES.get(row, 4)):
            f = frame(SHEET, row, fr)
            if not f: continue
            dx, dy = locate(f, d); occ, mask = occluders(f, d, dx, dy)
            body = lambda p: (p not in mask) or (p in occ)
            for y in range(FH):
                for x in range(FW): px[fr * FW + x, ri * FH + y] = (0, 0, 0, 0)
            put = lambda x, y, c: (0 <= x < FW and 0 <= y < FH) and px.__setitem__((fr * FW + x, ri * FH + y), c)
            for (x, y), v in f.items():
                h = hexc(v); head = not body((x, y))
                if look == 'partner' and head: continue
                if (look.endswith('_school') or wed or base.startswith('g3girl')) and head and (y - dy) < 3: continue  # the hat's crown (its band rows go below)  # her own head goes in below
                if head and look != 'partner' and (y - dy) >= HAT_ROWS: put(x, y, v); continue  # face and hair: untouched
                put(x, y, rgba(m[h]) if h in m else v)
            if look.endswith('_school'): school(put, f, d, dx, dy, occ)
            elif base.startswith('g3girl'): school(put, f, d, dx, dy, occ, pack=False)
            if base.startswith('g3girl'):
                get = lambda x, y: px[fr * FW + x, ri * FH + y] if 0 <= x < FW and 0 <= y < FH else (0, 0, 0, 0)
                girl(put, get, d, dx, dy, occ)
            if wed:
                school(put, f, d, dx, dy, occ, pack=False)
                get = lambda x, y: px[fr * FW + x, ri * FH + y] if 0 <= x < FW and 0 <= y < FH else (0, 0, 0, 0)
                wedding(put, get, f, d, dx, dy, occ, look, fr, row)
            if look == 'partner':
                for ty, r in enumerate(AHE[d]):
                    for tx, ch in enumerate(r):
                        if ch == '.': continue
                        x, y = tx + dx, ty + dy
                        if (x, y) in occ: continue  # the hoe / an arm stays in front of her hair
                        put(x, y, rgba(C[ch]))
    return out

def main():
    sheets = {k: build(k) for k in list(LOOKS) + ['kid0_school', 'kid1_school', 'g3girl_school'] + list(WED_LOOKS)}
    js = ['// v5.3 family sheets (阿禾 with her own head, children recoloured body-only), built by tools/build_family.py from assets/sprites.js. Do not edit by hand.',
          'window.PF_FAMILY_SPRITES = {']
    for k, im in sheets.items():
        b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
        js.append(f'  {k}: "data:image/png;base64,{base64.b64encode(b.getvalue()).decode()}",')
    js.append('};\n')
    open(os.path.join(ROOT, 'assets', 'family_sprites.js'), 'w', encoding='utf8').write('\n'.join(js))
    if '--preview' in sys.argv:
        o = sys.argv[sys.argv.index('--preview') + 1]; n = len(sheets) + 1
        bg = Image.new('RGBA', ((SHEET.width + 4) * n, SHEET.height), (120, 170, 90, 255))
        for i, im in enumerate([SHEET] + list(sheets.values())): bg.alpha_composite(im, ((SHEET.width + 4) * i, 0))
        bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save(o)
    print('wrote assets/family_sprites.js', {k: len(v.tobytes()) for k, v in sheets.items()})

main()
