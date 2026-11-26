# builds atlas_hud_dy.png (4x4 cells of 96px): xhs row 1-2 (author / note blanked) + row 3: tools, close, music, sound
# + row 4 (v14): music off, sound off, camera
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

INK = (58, 34, 18, 255); CREAM = (255, 246, 220, 255)
def layer(): L = Image.new('RGBA', (128*S, 128*S), (0, 0, 0, 0)); return L, ImageDraw.Draw(L)
def sc(pts): return [(x*S, y*S) for x, y in pts]
def stroke_fill(d, kind, box_or_pts, w=3):
    # draw ink outline then cream fill (outline = fill shape grown by w)
    if kind == 'ellipse':
        x0, y0, x1, y1 = box_or_pts
        d.ellipse(((x0-w)*S, (y0-w)*S, (x1+w)*S, (y1+w)*S), fill=INK)
        d.ellipse((x0*S, y0*S, x1*S, y1*S), fill=CREAM)
    else:
        x0, y0, x1, y1 = box_or_pts
        d.rounded_rectangle(((x0-w)*S, (y0-w)*S, (x1+w)*S, (y1+w)*S), radius=int((w+2)*S), fill=INK)
        d.rounded_rectangle((x0*S, y0*S, x1*S, y1*S), radius=int(2*S), fill=CREAM)
def music_layer():
    L, d = layer()
    # two beamed eighth notes
    for x0, y0 in ((40, 76), (70, 70)): stroke_fill(d, 'ellipse', (x0, y0, x0+16, y0+12))
    for x in (53, 83): stroke_fill(d, 'rect', (x, 40 if x == 53 else 34, x+4, 80 if x == 53 else 74))
    pts = [(53, 36), (87, 30), (87, 40), (53, 46)]
    d.polygon(sc([(53-3, 33), (87+3, 27), (87+3, 43), (53-3, 49)]), fill=INK); d.polygon(sc(pts), fill=CREAM)
    for x0, y0 in ((40, 76), (70, 70)): d.ellipse((x0*S, y0*S, (x0+16)*S, (y0+12)*S), fill=CREAM)
    return L
def sound_layer():
    L, d = layer()
    body = [(34, 54), (48, 54), (64, 40), (64, 88), (48, 74), (34, 74)]
    grow = [(30, 50), (47, 50), (68, 32), (68, 96), (47, 78), (30, 78)]
    d.polygon(sc(grow), fill=INK); d.polygon(sc(body), fill=CREAM)
    for r in (12, 24):
        bb = ((64-r)*S, (64-r)*S, (64+r+8)*S, (64+r)*S)
        d.arc(((72-r)*S, (64-r)*S, (72+r)*S, (64+r)*S), -50, 50, fill=INK, width=int(10*S))
        d.arc(((72-r)*S, (64-r)*S, (72+r)*S, (64+r)*S), -46, 46, fill=CREAM, width=int(5*S))
    return L
def camera_layer():
    L, d = layer()
    d.rounded_rectangle((50*S-3*S, 34*S-3*S, 74*S+3*S, 46*S), radius=int(4*S), fill=INK)
    d.rounded_rectangle((52*S, 36*S, 72*S, 46*S), radius=int(2*S), fill=CREAM)
    d.rounded_rectangle((30*S, 42*S, 98*S, 90*S), radius=int(9*S), fill=INK)
    d.rounded_rectangle((34*S, 46*S, 94*S, 86*S), radius=int(6*S), fill=CREAM)
    d.ellipse((47*S, 49*S, 81*S, 83*S), fill=INK)
    d.ellipse((53*S, 55*S, 75*S, 77*S), fill=(120, 170, 210, 255))
    d.ellipse((57*S, 58*S, 64*S, 65*S), fill=(230, 245, 255, 255))
    d.ellipse((84*S, 50*S, 90*S, 56*S), fill=(230, 80, 60, 255))
    return L
def slash(L):
    d = ImageDraw.Draw(L)
    d.line([(36*S, 92*S), (92*S, 36*S)], fill=INK, width=int(14*S))
    d.line([(36*S, 92*S), (92*S, 36*S)], fill=(226, 72, 56, 255), width=int(8*S))
    return L
def disc_with(L):
    base, col = blank_disc(); base.alpha_composite(L.resize((128, 128), Image.LANCZOS)); return base
def dim(im):
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = px[x, y]; m = (r + g + b) // 3
            px[x, y] = ((r*3 + m*2)//5, (g*3 + m*2)//5, (b*3 + m*2)//5, a)
    return im
im = src.copy()
for cx, cy in [(0, 1), (2, 1)]: im.paste((0, 0, 0, 0), (cx*128, cy*128, cx*128+128, cy*128+128))
out = Image.new('RGBA', (512, 512), (0, 0, 0, 0)); out.paste(im, (0, 0))
out.paste(draw_tools(), (0, 256)); out.paste(draw_close(), (128, 256))
out.paste(disc_with(music_layer()), (256, 256)); out.paste(disc_with(sound_layer()), (384, 256))
out.paste(dim(disc_with(slash(music_layer()))), (0, 384)); out.paste(dim(disc_with(slash(sound_layer()))), (128, 384)); out.paste(disc_with(camera_layer()), (256, 384))
out = out.resize((384, 384), Image.LANCZOS)
out.quantize(colors=220, method=Image.Quantize.FASTOCTREE).save('atlas_hud_dy.png', optimize=True)
bg = Image.new('RGBA', out.size, (60, 120, 60, 255)); bg.alpha_composite(out); bg.save('/tmp/atlas_dy_view.png')
import os; print(os.path.getsize('atlas_hud_dy.png'))
