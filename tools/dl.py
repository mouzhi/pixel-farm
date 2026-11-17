import os as _os
ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))) + '/'
import sys,subprocess
from PIL import Image
# usage: dl.py prefix url1 url2 ...  -> saves prefix_i.png and /tmp/prefix.png preview x8
pre=sys.argv[1]; urls=sys.argv[2:]
d=ROOT + 'assets/src/'
ims=[]
for i,u in enumerate(urls):
    f=f'{d}{pre}_{i}.png'; subprocess.run(['curl','-sL','-o',f,u],check=True)
    ims.append(Image.open(f).convert('RGBA'))
s=8; W=sum(i.width*s+20 for i in ims); H=max(i.height*s for i in ims)
o=Image.new('RGBA',(W,H),(127,178,74,255)); x=0
for i in ims:
    o.alpha_composite(i.resize((i.width*s,i.height*s),Image.NEAREST),(x,0)); x+=i.width*s+20
o.save(f'/tmp/{pre}.png'); print([i.size for i in ims])
