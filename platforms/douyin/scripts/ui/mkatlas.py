# builds atlas_hud_dy.png (4x3 cells of 96px): xhs row 1-2 (author / note blanked) + row 3: tools, close
from PIL import Image, ImageDraw, ImageFilter
import math
src = Image.open('/workspace/dy-xhs-src/platforms/xhs/atlas_hud_128_q90.webp').convert('RGBA')
S = 4  # supersample for drawn icons
def cell(cx, cy): return src.crop((cx*128, cy*128, cx*128+128, cy*128+128))
def blank_disc():
    c = cell(0, 0).copy(); px = c.load()
    # wood colour: sample ring interior just inside the lit rim, away from the icon (left-middle)
    samp = [px[x, y] for (x, y) in [(18, 64), (20, 50), (20, 78), (64, 17), (64, 111)]]
    col = tuple(sum(s[i] for s in samp)//len(samp) for i in range(3)) + (255,)
    d = ImageDraw.Draw(c); R = 44
    big = Image.new('RGBA', (128*S, 128*S), (0, 0, 0, 0)); bd = ImageDraw.Draw(big)
    bd.ellipse((64*S-R*S, 64*S-R*S, 64*S+R*S, 64*S+R*S), fill=col)
    big = big.resize((128, 128), Image.LANCZOS)
    c.alpha_composite(big)
    return c, col
def draw_tools():
    base, col = blank_disc()
    L = Image.new('RGBA', (128*S, 128*S), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    def line(p, q, w, fill): d.line([(p[0]*S, p[1]*S), (q[0]*S, q[1]*S)], fill=fill, width=int(w*S))
    ink = (58, 34, 18, 255)
    # hammer: handle from lower-left to upper-right, head at upper right
    def rot(pt, ang, c0):
        x, y = pt[0]-c0[0], pt[1]-c0[1]; a = math.radians(ang)
        return (c0[0] + x*math.cos(a) - y*math.sin(a), c0[1] + x*math.sin(a) + y*math.cos(a))
    c0 = (64, 64)
    def poly(pts, ang, fill, outline=ink, ow=2.5):
        pp = [rot(p, ang, c0) for p in pts]; pp = [(x*S, y*S) for x, y in pp]
        d.polygon(pp, fill=fill)
        d.line(pp + [pp[0]], fill=outline, width=int(ow*S), joint='curve')
    # two crossed tools: hammer (head upper right) and pick (head upper left); handles cross at the centre
    poly([(60, 40), (68, 40), (68, 100), (60, 100)], 45, (200, 142, 76, 255))
    poly([(46, 28), (82, 28), (82, 46), (46, 46)], 45, (190, 196, 208, 255))
    poly([(46, 28), (82, 28), (82, 34), (46, 34)], 45, (236, 240, 246, 255), outline=(0, 0, 0, 0), ow=0)
    poly([(60, 40), (68, 40), (68, 100), (60, 100)], -45, (176, 120, 62, 255))
    poly([(40, 30), (88, 30), (80, 40), (48, 40)], -45, (160, 168, 180, 255))
    poly([(40, 30), (88, 30), (86, 33), (42, 33)], -45, (214, 220, 230, 255), outline=(0, 0, 0, 0), ow=0)
    L = L.resize((128, 128), Image.LANCZOS)
    base.alpha_composite(L); return base
def draw_close():
    base, col = blank_disc()
    L = Image.new('RGBA', (128*S, 128*S), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    for w, fill in ((17, (58, 34, 18, 255)), (11, (255, 246, 220, 255))):
        for p, q in (((46, 46), (82, 82)), ((82, 46), (46, 82))):
            d.line([(p[0]*S, p[1]*S), (q[0]*S, q[1]*S)], fill=fill, width=w*S)
        for pt in ((46, 46), (82, 82), (82, 46), (46, 82)):
            r = w/2; d.ellipse(((pt[0]-r)*S, (pt[1]-r)*S, (pt[0]+r)*S, (pt[1]+r)*S), fill=fill)
    base.alpha_composite(L.resize((128, 128), Image.LANCZOS)); return base
im = src.copy()
for cx, cy in [(0, 1), (2, 1)]: im.paste((0, 0, 0, 0), (cx*128, cy*128, cx*128+128, cy*128+128))
out = Image.new('RGBA', (512, 384), (0, 0, 0, 0)); out.paste(im, (0, 0))
out.paste(draw_tools(), (0, 256)); out.paste(draw_close(), (128, 256))
out = out.resize((384, 288), Image.LANCZOS)
out.quantize(colors=220, method=Image.Quantize.FASTOCTREE).save('atlas_hud_dy.png', optimize=True)
bg = Image.new('RGBA', out.size, (60, 120, 60, 255)); bg.alpha_composite(out); bg.save('/tmp/atlas_dy_view.png')
import os; print(os.path.getsize('atlas_hud_dy.png'))
