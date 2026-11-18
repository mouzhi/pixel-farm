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
}
HAT_ROWS = 5  # children keep the straw hat; its band (template rows 0-4) takes the shirt colour like before

def build(look):
    out = SHEET.copy(); px = out.load(); m = LOOKS[look]
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
                if look == 'partner' and head: continue  # her own head goes in below
                if head and look != 'partner' and (y - dy) >= HAT_ROWS: put(x, y, v); continue  # face and hair: untouched
                put(x, y, rgba(m[h]) if h in m else v)
            if look == 'partner':
                for ty, r in enumerate(AHE[d]):
                    for tx, ch in enumerate(r):
                        if ch == '.': continue
                        x, y = tx + dx, ty + dy
                        if (x, y) in occ: continue  # the hoe / an arm stays in front of her hair
                        put(x, y, rgba(C[ch]))
    return out

def main():
    sheets = {k: build(k) for k in LOOKS}
    js = ['// v5.3 family sheets (阿禾 with her own head, children recoloured body-only), built by tools/build_family.py from assets/sprites.js. Do not edit by hand.',
          'window.PF_FAMILY_SPRITES = {']
    for k, im in sheets.items():
        b = io.BytesIO(); im.save(b, 'PNG', optimize=True)
        js.append(f'  {k}: "data:image/png;base64,{base64.b64encode(b.getvalue()).decode()}",')
    js.append('};\n')
    open(os.path.join(ROOT, 'assets', 'family_sprites.js'), 'w', encoding='utf8').write('\n'.join(js))
    if '--preview' in sys.argv:
        o = sys.argv[sys.argv.index('--preview') + 1]; n = len(LOOKS) + 1
        bg = Image.new('RGBA', ((SHEET.width + 4) * n, SHEET.height), (120, 170, 90, 255))
        for i, im in enumerate([SHEET] + list(sheets.values())): bg.alpha_composite(im, ((SHEET.width + 4) * i, 0))
        bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save(o)
    print('wrote assets/family_sprites.js', {k: len(v.tobytes()) for k, v in sheets.items()})

main()
