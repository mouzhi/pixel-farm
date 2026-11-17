import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))) + '/'
from PIL import Image, ImageDraw
import json
S=ROOT + 'shots/'
pos=json.load(open('/tmp/raw/pos.json'))
def crop(name, cx, cy, w, h, s=3):
    i=Image.open(f'/tmp/raw/{name}.png').convert('RGB'); x0=int(round(cx-w/2)); y0=int(round(cy-h/2)); c=i.crop((x0,y0,x0+w,y0+h))
    return c, c.resize((w*s,h*s),Image.NEAREST)
names=['01_clearing','02_weeding','04_till_plant','05_watering','07_harvest','08_selling']
tiles=[crop(n,pos[n]['farmer'][0],pos[n]['farmer'][1]-12,48,40) for n in names if not pos[n]['home']]
W=sum(b.width+12 for a,b in tiles)+12; o=Image.new('RGB',(W,40+12+120+24),(23,61,42)); x=12
for a,b in tiles: o.paste(a,(x+(b.width-a.width)//2,8)); o.paste(b,(x,68)); x+=b.width+12
o.save(S+'closeup_farmer.png')
h=pos['00_morning']['house']; crop('00_morning',h[0],h[1]-34,110,110)[1].save(S+'closeup_house.png')
st=pos['00_morning']['stall']; crop('00_morning',st[0]+64,st[1]-26,100,100)[1].save(S+'closeup_tree.png')
crop('08_selling',pos['08_selling']['stall'][0],pos['08_selling']['stall'][1]-18,90,80)[1].save(S+'closeup_market.png')
sh=Image.open(ROOT + 'assets/chars.png').convert('RGBA'); bg=Image.new('RGBA',sh.size,(127,178,74,255)); bg.alpha_composite(sh); bg.resize((sh.width*4,sh.height*4),Image.NEAREST).save(S+'closeup_sprite_sheet_x4.png')
