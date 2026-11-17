// 像素农场 · 风格 A 调色板（32 色）。每条 ramp 从暗到亮排列；体素着色只在 ramp 里往暗处走：
// 顶面 = 基色，侧面 = 暗一级，背光侧（屏幕右侧）= 暗两级，斜面（屋顶/树冠上半）背光侧 = 暗一级。
// 描边 = 相邻颜色所在 ramp 的最暗一级（选择性描边），最暗一级本身再用 ink。
window.PF_PALETTE = {
  ramps: {
    ink:   ['#1c1626', '#3a2b38'],                                  // 全局最暗 / 角色描边
    green: ['#173d2a', '#24603a', '#358a3c', '#52af3a', '#86cc4a', '#c2e86a'], // 草地基色 = #52af3a
    wood:  ['#3b2219', '#5e3524', '#8a5530', '#b47a3e', '#d3984c', '#ecc27c'], // 小路 = #d3984c
    roof:  ['#4a1c1e', '#7a2c24', '#a8432e', '#cf6a3c'],
    stone: ['#3e3f4c', '#666a73', '#9a9ea0', '#cfd0c6'],
    water: ['#1f3d68', '#2f6ea0', '#4fa3cf', '#9fdcec'],
    skin:  ['#c47a52', '#f2c29a'],
    accent:['#f6ecd0', '#f2cf55', '#e06a2c', '#e57fa0'],   // 奶白 / 麦黄 / 橙 / 粉（不是明暗序列，见 darkOf）
  },
};
(() => { const P = window.PF_PALETTE; P.colors = []; P.rampOf = {}; P.darkOf = {}; P.outlineOf = {};
  for (const [name, r] of Object.entries(P.ramps)) r.forEach((c, i) => { P.colors.push(c); P.rampOf[c] = [name, i]; });
  for (const [name, r] of Object.entries(P.ramps)) r.forEach((c, i) => { P.darkOf[c] = r[Math.max(0, i - 1)]; P.outlineOf[c] = i === 0 ? '#1c1626' : r[0]; });
  // accent / skin colours step into the ramp they belong to
  Object.assign(P.darkOf, { '#f6ecd0': '#ecc27c', '#f2cf55': '#d3984c', '#e06a2c': '#a8432e', '#e57fa0': '#a8432e', '#f2c29a': '#c47a52', '#c47a52': '#8a5530', '#c2e86a': '#86cc4a' });
  Object.assign(P.outlineOf, { '#f6ecd0': '#3b2219', '#f2cf55': '#3b2219', '#e06a2c': '#4a1c1e', '#e57fa0': '#4a1c1e', '#f2c29a': '#3b2219', '#c47a52': '#3b2219', '#3a2b38': '#1c1626' });
  P.dark = (c, n = 1) => { for (let i = 0; i < n; i++) c = P.darkOf[c] || c; return c; };
})();
