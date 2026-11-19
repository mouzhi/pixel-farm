#!/usr/bin/env python3
"""Turn tools/econ-curve.js output (econ_<policy>.json in $PF_SHOTS) into the tables and the chart in docs/economy-rebalance.md.
   python3 tools/econ-report.py [real-save-and-log.txt]   (the real save is read only for its play log; never commit it)"""
import json, os, sys, math
D = os.environ.get('PF_SHOTS', '/workspace/pf-shots')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load = lambda n: json.load(open(os.path.join(D, n)))
runs = {k: load(f'econ_{k}.json') for k in ('casual', 'growth', 'idle')}
SRC = ['crops', 'fruit', 'animals', 'fish', 'works', 'town', 'home', 'wood', 'seeds', 'chop', 'yard', 'other']
DECO = ('bench', 'flowerpot', 'scarecrow', 'birdbath', 'lamppost', 'stonelamp', 'stringlights', 'party')
NAMES = {'field': '扩田', 'can': '水壶', 'shoe': '鞋', 'hoe': '锄头', 'basket': '篮子', 'speed': '倍速', 'strawberry': '草莓', 'watermelon': '西瓜', 'axe': '斧头',
  'forest': '林场', 'east': '东田', 'orchard': '果园坡', 'south': '南坡', 'pasture': '北牧场', 'coop': '鸡舍', 'chicken': '鸡', 'sty': '猪圈', 'pig': '猪', 'fold': '羊圈',
  'graze': '草地', 'sheep': '羊', 'shed': '牛棚', 'cow': '牛', 'cat': '猫', 'dog': '狗', 'house': '房子', 'fence': '篱笆', 'rod': '钓竿', 'coast': '海边', 'searod': '海竿',
  'lumber': '伐木小屋', 'sprinkler': '浇水器', 'mill': '磨坊', 'jam': '果酱铺', 'cheese': '奶酪坊', 'wheel': '水车', 'hive': '蜂箱', 'coop2': '二鸡舍', 'sty2': '二猪圈',
  'fold2': '二羊圈', 'shed2': '二牛棚', 'town': '镇门', 'cottage': '新房子', 'bench': '长椅', 'flowerpot': '花盆', 'scarecrow': '稻草人', 'birdbath': '石盆', 'lamppost': '路灯',
  'stonelamp': '石灯', 'stringlights': '串灯', 'party': '派对区'}
PLOTN = {'play': '屋西空地', 'glade': '林间空地', 'swbank': '西南河湾', 'wbank': '西河湾', 'sbank': '南河湾', 'bridge': '石桥', 'swacross': '河对岸西', 'seacross': '河对岸东',
  'eslope': '东坡', 'eroad': '东大道', 'eshore': '东南滩', 'nwslope': '北坡西', 'neslope': '北坡东', 'trail': '山道', 'summit': '山顶', 'alp': '高山牧场'}
def label(u):
    w = u['what']
    if w.startswith('plot:'): return PLOTN.get(w[5:], w[5:])
    if w == '阿禾 moved in': return '阿禾搬来'
    if w == '阿禾 love 100': return '好感满'
    m = w.split(' ')
    if m[0] in NAMES: return NAMES[m[0]] + (m[1][1:] if len(m) > 1 and m[0] in ('field', 'can', 'shoe', 'hoe', 'basket', 'speed', 'axe', 'house', 'rod') else '')
    if w.startswith('kid') and 'born' in w: return '孩子' + str(int(w[3]) + 1) + '出生'
    if w.startswith('school'): return '上学'
    return None
def unlocks_by_day(run, skip_repeat=True):
    out = {}
    for u in run['unlocks']:
        l = label(u)
        if not l: continue
        if skip_repeat and u['what'].split(' ')[0] in ('chicken', 'pig', 'sheep', 'cow', 'sprinkler', 'hive', 'cat', 'dog') + DECO:
            l = NAMES[u['what'].split(' ')[0]] + '+'
        out.setdefault(u['day'], [])
        if l not in out[u['day']]: out[u['day']].append(l)
    return out
def table(run, days):
    rows = {r['day']: r for r in run['days']}; ul = unlocks_by_day(run); lines = []
    lines.append('| 天 | 累计收入 | 当天收入 | 近 5 天日均 | 手里金币 | 木材 | 这段时间解锁 / 买下 |'); lines.append('|---:|---:|---:|---:|---:|---:|---|')
    for d in days:
        r = rows.get(d)
        if not r: continue
        since = [x for k in range(prev(days, d) + 1, d + 1) for x in ul.get(k, [])]
        av = [rows[k]['dayEarn'] for k in range(max(1, d - 4), d + 1) if k in rows]
        lines.append(f"| {d} | {r['earned']:,} | {r['dayEarn']:,} | {round(sum(av) / len(av)):,} | {r['coins']:,} | {r['wood']}/{r['woodCap']} | {'、'.join(dict.fromkeys(since)) or '—'} |")
    return '\n'.join(lines)
def prev(days, d):
    i = days.index(d); return days[i - 1] if i else 0
DAYS = list(range(1, 11)) + list(range(15, 91, 5))
def shares(run, a, b):
    tot = {k: 0 for k in SRC}
    for r in run['days']:
        if a <= r['day'] <= b:
            for k in SRC: tot[k] += r.get(k, 0)
    s = sum(tot.values()) or 1
    return {k: (tot[k], round(100 * tot[k] / s)) for k in SRC if tot[k]}
def spend(run, a, b):
    t = {}
    for r in run['days']:
        if a <= r['day'] <= b:
            for k, v in r['spend'].items(): t[k] = t.get(k, 0) + v
    return t
out = []
for k in ('casual', 'growth', 'idle'):
    out.append(f'\n### {k}\n'); out.append(table(runs[k], DAYS))
    for a, b in ((1, 10), (11, 30), (31, 60), (61, 90)):
        out.append(f'\n{k} 第 {a}–{b} 天 收入构成: ' + ', '.join(f'{s} {v[0]:,}（{v[1]}%）' for s, v in shares(runs[k], a, b).items()) + ' | 支出: ' + ', '.join(f'{s} {v:,}' for s, v in spend(runs[k], a, b).items()))
# real seconds per game day (1x) measured by the harness loop
rs = [r['realSec'] for r in runs['idle']['days'] if r.get('realSec')]
if rs: out.append(f'\n1× 每个游戏日的实时秒数（测得，20 秒一步）：平均 {sum(rs) / len(rs):.0f} 秒，最少 {min(rs)}，最多 {max(rs)}')
# 30-minute AFK: the casual player stops clicking on day X; gold over the next 30 real minutes at 1x / 2x / 4x
DAY_SEC = 313
out.append('\n### 30 分钟挂机（第 X 天起不再点任何东西）\n| 起始天 | 手里 | 当天日入 | 1×（5.75 天） | 2×（11.5 天） | 4×（23 天） | 切走 / 关掉 30 分钟（离线结算） |\n|---:|---:|---:|---:|---:|---:|---:|')
for x in (3, 10, 30, 60):
    try: a = load(f'econ_casual_afk{x}.json')
    except Exception: continue
    rows = {r['day']: r for r in a['days']}
    def gold(n):
        g, d, left = 0, x + 1, n
        while left > 0 and d in rows: g += rows[d]['dayEarn'] * min(1, left); left -= 1; d += 1
        return round(g)
    n1 = 1800 / DAY_SEC
    avg3 = sum(rows[k]['dayEarn'] for k in range(x - 2, x + 1) if k in rows) / 3
    out.append(f"| {x} | {rows[x]['coins']:,} | {rows[x]['dayEarn']:,} | {gold(n1):,} | {gold(2 * n1):,} | {gold(4 * n1):,} | {math.floor(avg3 * min(3, n1 * 0.5)):,} |")
open(os.path.join(D, 'econ_report.md'), 'w').write('\n'.join(out)); print('\n'.join(out))

# ---- chart ----
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
for f in ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',):
    if os.path.exists(f): font_manager.fontManager.addfont(f); plt.rcParams['font.family'] = font_manager.FontProperties(fname=f).get_name()
real = None
if len(sys.argv) > 1:
    t = open(sys.argv[1], encoding='utf8').read(); L = json.loads(t.split('===LOG===')[1])
    real = [(d['day'], sum(v for k, v in d['income'].items() if k != 'offline'), d['income'].get('offline', 0), d['goldEnd']) for d in L['days'] if d['day'] < 82 and (d['busyMin'] or 0) > 60]
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 9), sharex=True, gridspec_kw={'height_ratios': [1, 1]})
col = {'casual': '#2f6ea0', 'growth': '#2a9d55', 'idle': '#999999'}
nm = {'casual': '随手买（最便宜的先买）', 'growth': '只买生产类', 'idle': '完全不点'}
for k, r in runs.items():
    ds = [x['day'] for x in r['days']]
    de = [x['dayEarn'] for x in r['days']]; ma = [sum(de[max(0, i - 4):i + 1]) / len(de[max(0, i - 4):i + 1]) for i in range(len(de))]
    ax1.plot(ds, de, color=col[k], lw=0.6, alpha=0.35)
    ax1.plot(ds, ma, color=col[k], lw=2, label=nm[k] + ' · 日入（5 天平均）')
    ax2.plot(ds, [max(10, x['coins']) for x in r['days']], color=col[k], lw=1.6, label=nm[k] + ' · 手里金币')
if real:
    ax1.plot([x[0] for x in real], [x[1] for x in real], color='#e06a2c', lw=1.4, ls='--', label='真实存档 · 在线日入')
    ax1.bar([x[0] for x in real], [x[2] for x in real], bottom=[x[1] for x in real], color='#e06a2c', alpha=0.25, width=0.8, label='真实存档 · 当天离线结算')
    ax2.plot([x[0] for x in real], [x[3] for x in real], color='#e06a2c', lw=1.4, ls='--', label='真实存档 · 手里金币')
mark = {'阿禾搬来', '房子1', '房子2', '房子3', '孩子1出生', '孩子2出生', '林场', '东田', '果园坡', '北牧场', '南坡', '海边', '镇门', '倍速1', '倍速2', '鸡舍', '斧头1', '伐木小屋', '磨坊', '果酱铺', '奶酪坊'}
ymax = max(x['dayEarn'] for x in runs['growth']['days'])
for d, ls in sorted(unlocks_by_day(runs['casual']).items()):
    for i, l in enumerate([l for l in ls if l in mark]):
        ax1.axvline(d, color='#2f6ea0', alpha=0.12, lw=1)
        ax1.text(d, ymax * (0.98 - 0.06 * (i % 3)), l, fontsize=7.5, color='#2f6ea0', rotation=90, va='top', ha='right')
ax1.set_ylabel('当天收入（金）'); ax2.set_ylabel('手里金币'); ax2.set_xlabel('游戏日'); ax2.set_yscale('log'); ax2.set_ylim(10, 4e5)
ax1.set_title('v5.9 经济曲线：真实游戏无头跑 90 天（seed 7，不含离线）+ 真实存档第 28–81 天'); ax1.legend(fontsize=8, loc='upper left'); ax2.legend(fontsize=8, loc='upper left')
for a in (ax1, ax2): a.grid(alpha=0.25)
plt.tight_layout()
for p in (os.path.join(D, 'econ_curve.png'), os.path.join(ROOT, 'docs', 'img', 'econ_curve.png')): plt.savefig(p, dpi=110)
print('chart written')
