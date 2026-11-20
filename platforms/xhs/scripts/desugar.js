// Make staged JS plain ES2017 for Chrome / WebView 61 (the 小工具 baseline): rewrite object spread
// `{ ...a, b: 1 }` into `Object.assign({}, a, { b: 1 })`, then parse every file as an ES2017 script
// and fail the build on anything newer. Run by pack.py on the staged tree: node desugar.js <dir>
'use strict';
const fs = require('fs'), path = require('path');
const NM = path.resolve(__dirname, '../../../tools/node_modules');
const acorn = require(path.join(NM, 'acorn'));
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js') && !/^audio-/.test(e.name)) files.push(p); } })(process.argv[2]);
function objSpreads(src) { const found = [];
  (function visit(n) { if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ObjectExpression' && n.properties.some(p => p.type === 'SpreadElement')) found.push(n);
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); } })(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' }));
  return found; }
let bad = 0, total = 0;
for (const f of files) { let src = fs.readFileSync(f, 'utf8'), n = 0;
  for (let guard = 0; guard < 500; guard++) { const list = objSpreads(src); if (!list.length) break;
    const o = list.reduce((a, b) => (b.start > a.start ? b : a)); // innermost first, then re-parse
    const parts = []; let group = [];
    const flush = () => { if (group.length) parts.push('{ ' + src.slice(group[0].start, group[group.length - 1].end) + ' }'); group = []; };
    for (const p of o.properties) { if (p.type === 'SpreadElement') { flush(); parts.push(src.slice(p.argument.start, p.argument.end)); } else group.push(p); }
    flush();
    src = src.slice(0, o.start) + 'Object.assign({}, ' + parts.join(', ') + ')' + src.slice(o.end); n++; }
  if (n) { fs.writeFileSync(f, src); total += n; console.log('desugar', path.relative(process.argv[2], f), n, 'object spread'); }
  try { acorn.parse(src, { ecmaVersion: 2017, sourceType: 'script' }); }
  catch (e) { bad++; console.error('NOT ES2017', path.relative(process.argv[2], f), e.message); } }
console.log('desugar: ' + total + ' rewrites, ' + files.length + ' files checked as ES2017');
process.exitCode = bad ? 1 : 0;
