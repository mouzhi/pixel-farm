import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))) + '/'
# Build the style-A billboard sheets from SpriteCook downloads, quantized to assets/palette.js
import re, json, base64, io
from PIL import Image
A = ROOT + 'assets/'; S = A + 'src/'
pal_js = open(A + 'palette.js').read()
pal = [tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) for h in re.findall(r"'#([0-9a-f]{6})'", pal_js.split('};')[0])]
pal = list(dict.fromkeys(pal)); assert len(pal) == 32, len(pal)
def quant(im):
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a < 128: px[x, y] = (0, 0, 0, 0); continue
            c = min(pal, key=lambda p: (p[0]-r)**2*0.3 + (p[1]-g)**2*0.59 + (p[2]-b)**2*0.11)
            px[x, y] = c + (255,)
    return im
FW = FH = 28
rows = []  # (name, list of frames)
def sheet(f): im = Image.open(S + f).convert('RGBA'); return [im.crop((i*FW, 0, (i+1)*FW, FH)) for i in range(im.width // FW)]
for name in ['walk_front', 'walk_side', 'walk_back', 'hoe', 'pull', 'water']: rows.append((name, sheet('Aanim_' + name + '.png')))
f0 = rows[0][1][0]; bb = f0.getbbox(); ax = (bb[0] + bb[2]) // 2; ay = bb[3] - 1  # feet: bottom row of the front walk frame
def still(f):  # 16x24 still placed in a 28x28 frame with the same feet anchor
    im = Image.open(S + f).convert('RGBA'); b = im.getbbox(); fr = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    fr.alpha_composite(im, (ax - (b[0] + b[2]) // 2, ay - (b[3] - 1))); return fr
rows.append(('idle_front', [still('A16_1.png')])); rows.append(('idle_side', [still('Aside_3.png')])); rows.append(('idle_back', [still('Aback_0.png')]))
rows.append(('keeper', [still('Akeep_2.png')]))
try: rows.append(('keeper_wave', sheet('Aanim_keeper_wave.png')))
except FileNotFoundError: pass
n = max(len(f) for _, f in rows)
out = Image.new('RGBA', (FW * n, FH * len(rows)), (0, 0, 0, 0))
for r, (name, fr) in enumerate(rows):
    for i, f in enumerate(fr): out.alpha_composite(quant(f), (i * FW, r * FH))
out.save(A + 'chars.png')
crops = Image.new('RGBA', (48, 16), (0, 0, 0, 0))
for i, f in enumerate(['Acrop_0.png', 'Acrop_2.png', 'Acrop_4.png']): crops.alpha_composite(quant(Image.open(S + f)), (i * 16, 0))
crops.save(A + 'crops.png')
uri = lambda p: 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
js = ('// SpriteCook billboard art (style A), quantized to assets/palette.js by pf-tools/build_sprites_A.py\n'
      'window.PF_SPRITES = ' + json.dumps({'rows': [n for n, _ in rows], 'frames': {n: len(f) for n, f in rows}, 'fw': FW, 'fh': FH, 'ax': ax, 'ay': ay, 'src': uri(A + 'chars.png')}) + ';\n'
      'window.PF_CROPS = ' + json.dumps({'order': ['carrot', 'cabbage', 'pumpkin'], 'size': 16, 'src': uri(A + 'crops.png')}) + ';\n')
open(A + 'sprites.js', 'w').write(js)
print('rows', [(n, len(f)) for n, f in rows], 'anchor', ax, ay)
big = Image.new('RGBA', out.size, (82, 175, 58, 255)); big.alpha_composite(out); big.resize((out.width * 5, out.height * 5), Image.NEAREST).save('/tmp/chars_x5.png')
