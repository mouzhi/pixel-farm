/* eslint-disable @typescript-eslint/no-this-alias -- tree walkers step a cursor from `this` */
/**
 * v12：给网页版界面（ui.js 等）用的极简 DOM。游戏照常建节点、改 innerHTML、挂事件；
 * 落地页把这棵树节流后画成 Taro 组件（farm-ui.tsx）。只实现游戏界面真正用到的部分。
 * 不用 Set/Map 的展开、for-of（Taro 的宽松转译会把它们编坏）。
 */
type Listener = { fn: any; capture: boolean; once: boolean }

let UID = 0
const VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 } as Record<string, number>
const BOOL_ATTRS = ['hidden', 'disabled', 'checked', 'selected', 'readonly', 'open']
const REFLECT = ['id', 'title', 'type', 'name', 'alt', 'src', 'href', 'placeholder', 'role', 'lang', 'dir', 'rel', 'target', 'htmlFor']
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', times: '×', middot: '·', hellip: '…', mdash: '—', ndash: '–', copy: '©', laquo: '«', raquo: '»', larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥', bull: '•', deg: '°', yen: '¥' }

function decode(s: string) {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENT[e] !== undefined ? ENT[e] : m
  })
}
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;')
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const kebab = (k: string) => (k.indexOf('--') === 0 ? k : k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))
/** 按 ; 拆声明，括号和引号里的不拆（data: URL 里有 ;） */
function splitDecls(t: string): string[] {
  const out: string[] = []
  let depth = 0
  let q = ''
  let start = 0
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === q) q = ''; continue }
    if (c === '"' || c === "'") q = c
    else if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ';' && depth === 0) { out.push(t.slice(start, i)); start = i + 1 }
  }
  out.push(t.slice(start))
  return out
}
const camel = (k: string) => (k.indexOf('--') === 0 ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()))

export class MNode {
  nodeType = 1
  parentNode: MElement | null = null
  ownerDocument: MDocument
  _id = ++UID
  _v = 0
  constructor(doc: MDocument) {
    this.ownerDocument = doc
  }
  get parentElement() {
    const p = this.parentNode
    return p && p.nodeType === 1 ? p : null
  }
  get nextSibling(): MNode | null {
    const p = this.parentNode
    if (!p) return null
    const i = p.childNodes.indexOf(this)
    return p.childNodes[i + 1] || null
  }
  get previousSibling(): MNode | null {
    const p = this.parentNode
    if (!p) return null
    const i = p.childNodes.indexOf(this)
    return i > 0 ? p.childNodes[i - 1] : null
  }
  get nextElementSibling(): MElement | null {
    let n = this.nextSibling
    while (n && n.nodeType !== 1) n = n.nextSibling
    return n as MElement | null
  }
  get previousElementSibling(): MElement | null {
    let n = this.previousSibling
    while (n && n.nodeType !== 1) n = n.previousSibling
    return n as MElement | null
  }
  get isConnected() {
    let n: MNode | null = this
    while (n.parentNode) n = n.parentNode
    return n === this.ownerDocument.documentElement
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this)
  }
  get textContent(): string {
    return ''
  }
  set textContent(_v: string) {}
}

export class MText extends MNode {
  _data: string
  constructor(doc: MDocument, data: string) {
    super(doc)
    this.nodeType = 3
    this._data = data
  }
  get nodeName() {
    return '#text'
  }
  get data() {
    return this._data
  }
  set data(v: string) {
    v = String(v)
    if (v === this._data) return
    this._data = v
    this._v++
    if (this.parentNode) this.ownerDocument._mark(this.parentNode)
  }
  get nodeValue() {
    return this._data
  }
  set nodeValue(v: string) {
    this.data = v
  }
  get textContent() {
    return this._data
  }
  set textContent(v: string) {
    this.data = v
  }
  cloneNode() {
    return new MText(this.ownerDocument, this._data)
  }
}

class ClassList {
  el: MElement
  constructor(el: MElement) {
    this.el = el
  }
  _list(): string[] {
    const c = this.el._attrs['class']
    return c ? c.split(/\s+/).filter(Boolean) : []
  }
  get length() {
    return this._list().length
  }
  get value() {
    return this.el._attrs['class'] || ''
  }
  item(i: number) {
    return this._list()[i] || null
  }
  contains(c: string) {
    return this._list().indexOf(c) >= 0
  }
  add(...cs: string[]) {
    const l = this._list()
    let ch = false
    for (let i = 0; i < cs.length; i++) if (cs[i] && l.indexOf(cs[i]) < 0) { l.push(cs[i]); ch = true }
    if (ch) this.el.setAttribute('class', l.join(' '))
  }
  remove(...cs: string[]) {
    const l = this._list()
    const out = l.filter((c) => cs.indexOf(c) < 0)
    if (out.length !== l.length) this.el.setAttribute('class', out.join(' '))
  }
  toggle(c: string, force?: boolean) {
    const has = this.contains(c)
    const want = force === undefined ? !has : !!force
    if (want && !has) this.add(c)
    else if (!want && has) this.remove(c)
    return want
  }
  replace(a: string, b: string) {
    if (!this.contains(a)) return false
    this.remove(a)
    this.add(b)
    return true
  }
  forEach(fn: (c: string, i: number) => void) {
    this._list().forEach(fn)
  }
  toString() {
    return this.value
  }
}

function makeStyle(el: MElement): any {
  const props: Record<string, string> = {}
  const api: any = {
    setProperty: (k: string, v: any) => set(camel(k), v),
    getPropertyValue: (k: string) => props[camel(k)] || '',
    removeProperty: (k: string) => {
      const c = camel(k)
      const old = props[c] || ''
      if (c in props) { delete props[c]; el._styleChanged() }
      return old
    },
    item: (i: number) => kebab(Object.keys(props)[i] || ''),
  }
  function set(k: string, v: any) {
    const s = v == null ? '' : String(v)
    if (s === '') {
      if (k in props) { delete props[k]; el._styleChanged() }
      return
    }
    if (props[k] === s) return
    props[k] = s
    el._styleChanged()
  }
  function cssText() {
    const ks = Object.keys(props)
    let out = ''
    for (let i = 0; i < ks.length; i++) out += kebab(ks[i]) + ':' + props[ks[i]] + ';'
    return out
  }
  function setCss(t: string) {
    const ks = Object.keys(props)
    for (let i = 0; i < ks.length; i++) delete props[ks[i]]
    splitDecls(String(t || '')).forEach((d) => {
      const i = d.indexOf(':')
      if (i > 0) {
        const k = d.slice(0, i).trim()
        const v = d.slice(i + 1).trim()
        if (k && v) props[camel(k)] = v
      }
    })
    el._styleChanged()
  }
  el._styleProps = props
  el._styleText = cssText
  el._setStyleText = setCss
  return new Proxy(props, {
    get(_t, k: any) {
      if (k === 'cssText') return cssText()
      if (k === 'length') return Object.keys(props).length
      if (k in api) return api[k]
      if (typeof k !== 'string') return undefined
      return props[k] || ''
    },
    set(_t, k: any, v: any) {
      if (k === 'cssText') setCss(v)
      else if (typeof k === 'string') set(k, v)
      return true
    },
  })
}

function makeDataset(el: MElement): any {
  return new Proxy({}, {
    get(_t, k: any) {
      if (typeof k !== 'string') return undefined
      const v = el._attrs['data-' + kebab(k)]
      return v === undefined ? undefined : v
    },
    set(_t, k: any, v: any) {
      if (typeof k === 'string') el.setAttribute('data-' + kebab(k), v)
      return true
    },
    deleteProperty(_t, k: any) {
      if (typeof k === 'string') el.removeAttribute('data-' + kebab(k))
      return true
    },
    has(_t, k: any) {
      return typeof k === 'string' && el._attrs['data-' + kebab(k)] !== undefined
    },
    ownKeys() {
      return Object.keys(el._attrs).filter((a) => a.indexOf('data-') === 0).map((a) => camel(a.slice(5)))
    },
    getOwnPropertyDescriptor(_t, k: any) {
      const v = typeof k === 'string' ? el._attrs['data-' + kebab(k)] : undefined
      return v === undefined ? undefined : { value: v, writable: true, enumerable: true, configurable: true }
    },
  })
}

export class MElement extends MNode {
  tagName: string
  localName: string
  _attrs: Record<string, string> = {}
  childNodes: MNode[] = []
  _ls: Record<string, Listener[]> | null = null
  _html: string | null = null
  /** 上次 innerHTML 赋的字符串：同样的字符串再赋一次就不重建（ui.js 每 250ms 重画一次面板） */
  _set: string | null = null
  _skip = false
  _styleProps: Record<string, string> = {}
  _styleText: () => string = () => ''
  _setStyleText: (t: string) => void = () => undefined
  _style: any = null
  _dataset: any = null
  _classList: ClassList | null = null
  scrollTop = 0
  scrollLeft = 0
  constructor(doc: MDocument, tag: string) {
    super(doc)
    this.localName = tag.toLowerCase()
    this.tagName = tag.toUpperCase()
  }
  get nodeName() {
    return this.tagName
  }
  get style() {
    if (!this._style) this._style = makeStyle(this)
    return this._style
  }
  set style(v: any) {
    this.style.cssText = String(v)
  }
  get dataset() {
    if (!this._dataset) this._dataset = makeDataset(this)
    return this._dataset
  }
  get classList() {
    if (!this._classList) this._classList = new ClassList(this)
    return this._classList
  }
  get className() {
    return this._attrs['class'] || ''
  }
  set className(v: string) {
    this.setAttribute('class', v)
  }
  get value() {
    return this._attrs.value || ''
  }
  set value(v: string) {
    this.setAttribute('value', v)
  }
  _styleChanged() {
    this._v++
    this.ownerDocument._mark(this)
  }
  // ---- attributes ----
  getAttribute(k: string) {
    if (k === 'style') return this._style ? this._styleText() : this._attrs.style !== undefined ? this._attrs.style : null
    const v = this._attrs[k.toLowerCase()]
    return v === undefined ? null : v
  }
  hasAttribute(k: string) {
    return this.getAttribute(k) !== null
  }
  setAttribute(k: string, v: any) {
    k = String(k).toLowerCase()
    const s = v == null ? '' : String(v)
    if (k === 'style') {
      this.style.cssText = s
      return
    }
    if (this._attrs[k] === s) return
    const wasHidden = k === 'hidden'
    this._attrs[k] = s
    if (k === 'id') this.ownerDocument._idChanged(this)
    this._v++
    if (wasHidden) this.ownerDocument._markShown(this)
    else this.ownerDocument._mark(this)
  }
  removeAttribute(k: string) {
    k = String(k).toLowerCase()
    if (k === 'style') {
      if (this._style) this.style.cssText = ''
      return
    }
    if (this._attrs[k] === undefined) return
    delete this._attrs[k]
    if (k === 'id') this.ownerDocument._idChanged(this)
    this._v++
    if (k === 'hidden') this.ownerDocument._markShown(this)
    else this.ownerDocument._mark(this)
  }
  toggleAttribute(k: string, force?: boolean) {
    const want = force === undefined ? !this.hasAttribute(k) : !!force
    if (want) this.setAttribute(k, '')
    else this.removeAttribute(k)
    return want
  }
  get attributes() {
    const ks = Object.keys(this._attrs)
    return ks.map((k) => ({ name: k, value: this._attrs[k] }))
  }
  // ---- tree ----
  get children(): MElement[] {
    const out: MElement[] = []
    for (let i = 0; i < this.childNodes.length; i++) if (this.childNodes[i].nodeType === 1) out.push(this.childNodes[i] as MElement)
    return out
  }
  get childElementCount() {
    return this.children.length
  }
  get firstChild() {
    return this.childNodes[0] || null
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null
  }
  get firstElementChild() {
    for (let i = 0; i < this.childNodes.length; i++) if (this.childNodes[i].nodeType === 1) return this.childNodes[i] as MElement
    return null
  }
  get lastElementChild() {
    for (let i = this.childNodes.length - 1; i >= 0; i--) if (this.childNodes[i].nodeType === 1) return this.childNodes[i] as MElement
    return null
  }
  hasChildNodes() {
    return this.childNodes.length > 0
  }
  _adopt(n: MNode) {
    if (n.parentNode) n.parentNode.removeChild(n)
    n.parentNode = this
  }
  _fragKids(n: MNode): MNode[] | null {
    return n.nodeType === 11 ? (n as MElement).childNodes.slice() : null
  }
  appendChild(n: MNode) {
    return this.insertBefore(n, null)
  }
  insertBefore(n: MNode, ref: MNode | null) {
    const kids = this._fragKids(n)
    if (kids) {
      for (let i = 0; i < kids.length; i++) this.insertBefore(kids[i], ref)
      return n
    }
    if (n === ref) return n
    this._adopt(n)
    const i = ref ? this.childNodes.indexOf(ref) : -1
    if (i < 0) this.childNodes.push(n)
    else this.childNodes.splice(i, 0, n)
    this.ownerDocument._structure(this)
    return n
  }
  removeChild(n: MNode) {
    const i = this.childNodes.indexOf(n)
    if (i < 0) return n
    this.childNodes.splice(i, 1)
    n.parentNode = null
    this.ownerDocument._structure(this)
    return n
  }
  replaceChild(n: MNode, old: MNode) {
    this.insertBefore(n, old)
    this.removeChild(old)
    return old
  }
  append(...ns: any[]) {
    for (let i = 0; i < ns.length; i++) this.appendChild(typeof ns[i] === 'string' ? this.ownerDocument.createTextNode(ns[i]) : ns[i])
  }
  prepend(...ns: any[]) {
    const first = this.firstChild
    for (let i = 0; i < ns.length; i++) this.insertBefore(typeof ns[i] === 'string' ? this.ownerDocument.createTextNode(ns[i]) : ns[i], first)
  }
  before(...ns: any[]) {
    const p = this.parentNode
    if (!p) return
    for (let i = 0; i < ns.length; i++) p.insertBefore(typeof ns[i] === 'string' ? this.ownerDocument.createTextNode(ns[i]) : ns[i], this)
  }
  after(...ns: any[]) {
    const p = this.parentNode
    if (!p) return
    const nx = this.nextSibling
    for (let i = 0; i < ns.length; i++) p.insertBefore(typeof ns[i] === 'string' ? this.ownerDocument.createTextNode(ns[i]) : ns[i], nx)
  }
  replaceWith(...ns: any[]) {
    const p = this.parentNode
    if (!p) return
    this.before(...ns)
    p.removeChild(this)
  }
  replaceChildren(...ns: any[]) {
    this._clear()
    this.append(...ns)
    this.ownerDocument._structure(this)
  }
  _clear() {
    for (let i = 0; i < this.childNodes.length; i++) this.childNodes[i].parentNode = null
    this.childNodes = []
  }
  contains(n: any): boolean {
    while (n) {
      if (n === this) return true
      n = n.parentNode
    }
    return false
  }
  cloneNode(deep?: boolean): MElement {
    const c = this.ownerDocument.createElement(this.localName)
    const ks = Object.keys(this._attrs)
    for (let i = 0; i < ks.length; i++) c._attrs[ks[i]] = this._attrs[ks[i]]
    if (this._style) c.style.cssText = this._styleText()
    if (deep) for (let i = 0; i < this.childNodes.length; i++) c.appendChild((this.childNodes[i] as any).cloneNode(true))
    return c
  }
  // ---- text / html ----
  get textContent(): string {
    let s = ''
    for (let i = 0; i < this.childNodes.length; i++) s += this.childNodes[i].textContent
    return s
  }
  set textContent(v: string) {
    v = v == null ? '' : String(v)
    const k = this.childNodes
    if (k.length === 1 && k[0].nodeType === 3) {
      ;(k[0] as MText).data = v
      return
    }
    if (!k.length && v === '') return
    this._clear()
    if (v !== '') {
      const t = new MText(this.ownerDocument, v)
      t.parentNode = this
      this.childNodes.push(t)
    }
    this.ownerDocument._structure(this)
  }
  get innerText() {
    return this.textContent
  }
  set innerText(v: string) {
    this.textContent = v
  }
  get innerHTML(): string {
    if (this._html !== null) return this._html
    let s = ''
    for (let i = 0; i < this.childNodes.length; i++) s += serialize(this.childNodes[i])
    this._html = s
    return s
  }
  set innerHTML(v: string) {
    v = v == null ? '' : String(v)
    if (this._set === v) return
    this._clear()
    parseInto(this.ownerDocument, this, v)
    this.ownerDocument._structure(this)
    this._set = v
    this._html = v
  }
  get outerHTML() {
    return serialize(this)
  }
  insertAdjacentHTML(pos: string, html: string) {
    const tmp = this.ownerDocument.createElement('div')
    parseInto(this.ownerDocument, tmp, html)
    const kids = tmp.childNodes.slice()
    const p = pos.toLowerCase()
    for (let i = 0; i < kids.length; i++) {
      if (p === 'beforeend') this.appendChild(kids[i])
      else if (p === 'afterbegin') this.insertBefore(kids[i], this.childNodes[i] || null)
      else if (p === 'beforebegin') this.before(kids[i])
      else if (p === 'afterend') {
        const nx = this.nextSibling
        if (this.parentNode) this.parentNode.insertBefore(kids[i], i ? kids[i - 1].nextSibling : nx)
      }
    }
  }
  insertAdjacentElement(pos: string, el: MElement) {
    const p = pos.toLowerCase()
    if (p === 'beforeend') this.appendChild(el)
    else if (p === 'afterbegin') this.insertBefore(el, this.firstChild)
    else if (p === 'beforebegin') this.before(el)
    else if (p === 'afterend') this.after(el)
    return el
  }
  // ---- selectors ----
  matches(sel: string) {
    return matchSel(compile(sel), this)
  }
  closest(sel: string): MElement | null {
    const c = compile(sel)
    let n: any = this
    while (n && n.nodeType === 1) {
      if (matchSel(c, n)) return n
      n = n.parentNode
    }
    return null
  }
  querySelectorAll(sel: string): MElement[] {
    const c = compile(sel)
    const out: MElement[] = []
    walk(this, (e) => {
      if (matchSel(c, e)) out.push(e)
    })
    return out
  }
  querySelector(sel: string): MElement | null {
    const c = compile(sel)
    let hit: MElement | null = null
    walk(this, (e) => {
      if (!hit && matchSel(c, e)) hit = e
      return !!hit
    })
    return hit
  }
  getElementsByTagName(t: string) {
    return this.querySelectorAll(t)
  }
  getElementsByClassName(c: string) {
    return this.querySelectorAll('.' + c.trim().split(/\s+/).join('.'))
  }
  // ---- events ----
  addEventListener(type: string, fn: any, opts?: any) {
    if (!fn) return
    const ls = this._ls || (this._ls = {})
    const list = ls[type] || (ls[type] = [])
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture)
    for (let i = 0; i < list.length; i++) if (list[i].fn === fn && list[i].capture === capture) return
    list.push({ fn, capture, once: !!(opts && opts.once) })
  }
  removeEventListener(type: string, fn: any, opts?: any) {
    const list = this._ls && this._ls[type]
    if (!list) return
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture)
    this._ls![type] = list.filter((l) => !(l.fn === fn && l.capture === capture))
  }
  dispatchEvent(ev: any) {
    return this.ownerDocument._dispatch(this, ev)
  }
  click() {
    if (this.hasAttribute('disabled') && this.localName === 'button') return
    this.ownerDocument._dispatch(this, this.ownerDocument.makeEvent('click', { bubbles: true }))
  }
  focus() {}
  blur() {}
  select() {}
  scrollIntoView() {}
  scrollTo() {}
  scrollBy() {}
  // ---- layout (estimated: the real layout lives in the view layer) ----
  get _shown(): boolean {
    let n: any = this
    while (n) {
      if (n._attrs && (n._attrs.hidden !== undefined || n._skip)) return false
      if (n === this.ownerDocument.documentElement) return true
      n = n.parentNode
    }
    return false
  }
  getBoundingClientRect() {
    const r = this._shown ? this.ownerDocument.rectOf(this) : null
    const x = r ? r.left : 0
    const y = r ? r.top : 0
    const w = r ? r.width : 0
    const h = r ? r.height : 0
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y }
  }
  getClientRects() {
    return this._shown ? [this.getBoundingClientRect()] : []
  }
  get offsetParent() {
    return this._shown ? this.parentNode : null
  }
  get offsetWidth() {
    return this.getBoundingClientRect().width
  }
  get offsetHeight() {
    return this.getBoundingClientRect().height
  }
  get clientWidth() {
    return this.offsetWidth
  }
  get clientHeight() {
    return this.offsetHeight
  }
  get scrollWidth() {
    return this.offsetWidth
  }
  get scrollHeight() {
    return this.offsetHeight
  }
  get offsetLeft() {
    return this.getBoundingClientRect().left
  }
  get offsetTop() {
    return this.getBoundingClientRect().top
  }
}

// reflected attributes
for (let i = 0; i < REFLECT.length; i++) {
  const a = REFLECT[i]
  const attr = a === 'htmlFor' ? 'for' : a
  Object.defineProperty(MElement.prototype, a, {
    get(this: MElement) {
      return this._attrs[attr] || ''
    },
    set(this: MElement, v: any) {
      this.setAttribute(attr, v)
    },
    configurable: true,
  })
}
for (let i = 0; i < BOOL_ATTRS.length; i++) {
  const a = BOOL_ATTRS[i]
  Object.defineProperty(MElement.prototype, a, {
    get(this: MElement) {
      return this._attrs[a] !== undefined
    },
    set(this: MElement, v: any) {
      if (v) this.setAttribute(a, '')
      else this.removeAttribute(a)
    },
    configurable: true,
  })
}

function walk(root: MElement, fn: (e: MElement) => boolean | void) {
  const stack: MNode[] = root.childNodes.slice().reverse()
  while (stack.length) {
    const n = stack.pop() as MElement
    if (n.nodeType !== 1) continue
    if (fn(n)) return
    for (let i = n.childNodes.length - 1; i >= 0; i--) stack.push(n.childNodes[i])
  }
}

// ---------- HTML ----------
function serialize(n: MNode): string {
  if (n.nodeType === 3) return escText((n as MText)._data)
  const e = n as MElement
  let s = '<' + e.localName
  const ks = Object.keys(e._attrs)
  for (let i = 0; i < ks.length; i++) s += ' ' + ks[i] + '="' + escAttr(e._attrs[ks[i]]) + '"'
  if (e._style) {
    const st = e._styleText()
    if (st) s += ' style="' + escAttr(st) + '"'
  }
  s += '>'
  if (VOID[e.localName]) return s
  for (let i = 0; i < e.childNodes.length; i++) s += serialize(e.childNodes[i])
  return s + '</' + e.localName + '>'
}

const ATTR_RE = /\s*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
function parseInto(doc: MDocument, root: MElement, html: string) {
  const stack: MElement[] = [root]
  let i = 0
  const n = html.length
  const top = () => stack[stack.length - 1]
  const text = (s: string) => {
    if (!s) return
    const t = new MText(doc, decode(s))
    t.parentNode = top()
    top().childNodes.push(t)
  }
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      text(html.slice(i))
      break
    }
    if (lt > i) text(html.slice(i, lt))
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end < 0 ? n : end + 3
      continue
    }
    if (html[lt + 1] === '/') {
      const gt = html.indexOf('>', lt)
      const name = html.slice(lt + 2, gt < 0 ? n : gt).trim().toLowerCase()
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].localName === name) {
          stack.length = k
          break
        }
      }
      i = gt < 0 ? n : gt + 1
      continue
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40))
    if (!m) {
      text('<')
      i = lt + 1
      continue
    }
    // find the end of the tag, skipping quoted values
    let j = lt + m[0].length
    let q = ''
    while (j < n) {
      const c = html[j]
      if (q) {
        if (c === q) q = ''
      } else if (c === '"' || c === "'") q = c
      else if (c === '>') break
      j++
    }
    let inner = html.slice(lt + m[0].length, j)
    let selfClose = false
    if (inner.endsWith('/')) {
      selfClose = true
      inner = inner.slice(0, -1)
    }
    const el = new MElement(doc, m[1])
    ATTR_RE.lastIndex = 0
    let a: RegExpExecArray | null
    while ((a = ATTR_RE.exec(inner)) && a[0]) {
      const k = a[1].toLowerCase()
      const v = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : ''
      if (k === 'style') el.style.cssText = decode(v)
      else el._attrs[k] = decode(v)
    }
    el.parentNode = top()
    top().childNodes.push(el)
    if (el._attrs.id !== undefined) doc._idChanged(el)
    i = j + 1
    const tag = el.localName
    if (selfClose || VOID[tag]) continue
    if (tag === 'style' || tag === 'script' || tag === 'textarea') {
      const end = html.toLowerCase().indexOf('</' + tag, i)
      const body = html.slice(i, end < 0 ? n : end)
      if (body) {
        const t = new MText(doc, tag === 'textarea' ? decode(body) : body)
        t.parentNode = el
        el.childNodes.push(t)
      }
      const gt = end < 0 ? n : html.indexOf('>', end)
      i = gt < 0 ? n : gt + 1
      continue
    }
    stack.push(el)
  }
}

// ---------- selectors ----------
type Attr = { k: string; op: string; v: string }
type Compound = { tag: string; id: string; cls: string[]; attrs: Attr[]; nots: Sel[]; pseudo: string[] }
type Complex = { parts: Compound[]; combs: string[] } // parts right-to-left
type Sel = Complex[]
const SEL_CACHE: Record<string, Sel> = {}

function compile(sel: string): Sel {
  const hit = SEL_CACHE[sel]
  if (hit) return hit
  const out: Sel = splitTop(sel, ',').map((s) => parseComplex(s.trim()))
  SEL_CACHE[sel] = out
  return out
}
function splitTop(s: string, ch: string) {
  const out: string[] = []
  let depth = 0
  let q = ''
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = ''
      continue
    }
    if (c === '"' || c === "'") q = c
    else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ch && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out
}
function parseComplex(s: string): Complex {
  const parts: Compound[] = []
  const combs: string[] = []
  let i = 0
  let comb = ''
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) {
      i++
      if (!comb) comb = ' '
    }
    if (s[i] === '>' || s[i] === '+' || s[i] === '~') {
      comb = s[i]
      i++
      continue
    }
    if (i >= s.length) break
    // read a compound
    let j = i
    let depth = 0
    let q = ''
    while (j < s.length) {
      const c = s[j]
      if (q) {
        if (c === q) q = ''
      } else if (c === '"' || c === "'") q = c
      else if (c === '(' || c === '[') depth++
      else if (c === ')' || c === ']') depth--
      else if (depth === 0 && (/\s/.test(c) || c === '>' || c === '+' || c === '~')) break
      j++
    }
    if (parts.length) combs.push(comb || ' ')
    parts.push(parseCompound(s.slice(i, j)))
    comb = ''
    i = j
  }
  return { parts: parts.reverse(), combs: combs.reverse() }
}
function parseCompound(s: string): Compound {
  const c: Compound = { tag: '', id: '', cls: [], attrs: [], nots: [], pseudo: [] }
  let i = 0
  const name = () => {
    const m = /^[\w-]+/.exec(s.slice(i))
    const v = m ? m[0] : ''
    i += v.length
    return v
  }
  if (s[0] === '*') i = 1
  else if (/[a-zA-Z]/.test(s[0] || '')) c.tag = name().toLowerCase()
  while (i < s.length) {
    const ch = s[i]
    if (ch === '#') {
      i++
      c.id = name()
    } else if (ch === '.') {
      i++
      c.cls.push(name())
    } else if (ch === '[') {
      const end = s.indexOf(']', i)
      const body = s.slice(i + 1, end)
      i = end + 1
      const m = /^\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*$/.exec(body)
      if (m) c.attrs.push({ k: m[1].toLowerCase(), op: m[2] || '', v: m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] || '' })
    } else if (ch === ':') {
      i++
      if (s[i] === ':') i++
      const p = name()
      if (s[i] === '(') {
        let depth = 0
        let j = i
        for (; j < s.length; j++) {
          if (s[j] === '(') depth++
          else if (s[j] === ')' && --depth === 0) break
        }
        const arg = s.slice(i + 1, j)
        i = j + 1
        if (p === 'not') c.nots.push(compile(arg))
        else c.pseudo.push(p + '(' + arg + ')')
      } else c.pseudo.push(p)
    } else i++
  }
  return c
}
function matchCompound(c: Compound, e: MElement): boolean {
  if (c.tag && e.localName !== c.tag) return false
  if (c.id && e._attrs.id !== c.id) return false
  if (c.cls.length) {
    const cl = ' ' + (e._attrs['class'] || '').replace(/\s+/g, ' ') + ' '
    for (let i = 0; i < c.cls.length; i++) if (cl.indexOf(' ' + c.cls[i] + ' ') < 0) return false
  }
  for (let i = 0; i < c.attrs.length; i++) {
    const a = c.attrs[i]
    const v = a.k === 'style' ? e.getAttribute('style') : e._attrs[a.k]
    if (v === undefined || v === null) return false
    if (a.op === '=' && v !== a.v) return false
    if (a.op === '^=' && !v.startsWith(a.v)) return false
    if (a.op === '$=' && !v.endsWith(a.v)) return false
    if (a.op === '*=' && v.indexOf(a.v) < 0) return false
    if (a.op === '~=' && (' ' + v + ' ').indexOf(' ' + a.v + ' ') < 0) return false
  }
  for (let i = 0; i < c.nots.length; i++) if (matchSel(c.nots[i], e)) return false
  for (let i = 0; i < c.pseudo.length; i++) {
    const p = c.pseudo[i]
    const par = e.parentNode
    if (p === 'first-child') { if (!par || par.firstElementChild !== e) return false }
    else if (p === 'last-child') { if (!par || par.lastElementChild !== e) return false }
    else if (p === 'disabled') { if (e._attrs.disabled === undefined) return false }
    else if (p === 'checked') { if (e._attrs.checked === undefined) return false }
    else if (p === 'empty') { if (e.childNodes.length) return false }
    else if (p === 'scope') { /* treat as the element itself */ }
    else return false // :hover / :focus and friends never match here
  }
  return true
}
function matchComplex(cx: Complex, e: MElement): boolean {
  if (!matchCompound(cx.parts[0], e)) return false
  return matchFrom(cx, 1, e)
}
function matchFrom(cx: Complex, k: number, e: MElement): boolean {
  if (k >= cx.parts.length) return true
  const comb = cx.combs[k - 1]
  if (comb === '>') {
    const p = e.parentNode
    return !!(p && p.nodeType === 1 && matchCompound(cx.parts[k], p) && matchFrom(cx, k + 1, p))
  }
  if (comb === '+') {
    const p = e.previousElementSibling
    return !!(p && matchCompound(cx.parts[k], p) && matchFrom(cx, k + 1, p))
  }
  if (comb === '~') {
    let p = e.previousElementSibling
    while (p) {
      if (matchCompound(cx.parts[k], p) && matchFrom(cx, k + 1, p)) return true
      p = p.previousElementSibling
    }
    return false
  }
  let p = e.parentNode
  while (p && p.nodeType === 1) {
    if (matchCompound(cx.parts[k], p) && matchFrom(cx, k + 1, p)) return true
    p = p.parentNode
  }
  return false
}
function matchSel(sel: Sel, e: MElement) {
  for (let i = 0; i < sel.length; i++) if (matchComplex(sel[i], e)) return true
  return false
}

// ---------- document ----------
export type Rect = { left: number; top: number; width: number; height: number }

export class MDocument {
  documentElement: MElement
  head: MElement
  body: MElement
  nodeType = 9
  readyState = 'complete'
  hidden = false
  visibilityState = 'visible'
  _ls: Record<string, Listener[]> | null = null
  /** window 上的监听（落地页把 G.addEventListener 指到这里） */
  win: { _ls: Record<string, Listener[]> | null; target: any } = { _ls: null, target: null }
  _ids: Record<string, MElement> = {}
  _structVer = 0
  _missVer: Record<string, number> = {}
  /** 有可见的变化（节流后重画） */
  onDirty: () => void = () => undefined
  /** 估算的布局（真实布局在视图层，拿不到同步结果） */
  rectOf: (el: MElement) => Rect | null = () => null
  /** 建元素时的钩子（画布交给环境） */
  makeCanvas: ((el: MElement) => void) | null = null
  skipIds: Record<string, number> = {}
  dirty = false
  constructor() {
    const html = new MElement(this, 'html')
    this.documentElement = html
    this.head = new MElement(this, 'head')
    this.body = new MElement(this, 'body')
    html.childNodes.push(this.head, this.body)
    this.head.parentNode = html
    this.body.parentNode = html
  }
  get activeElement() {
    return this.body
  }
  createElement(tag: string): MElement {
    const el = new MElement(this, String(tag))
    if (el.localName === 'canvas' && this.makeCanvas) this.makeCanvas(el)
    return el
  }
  createElementNS(_ns: string, tag: string) {
    return this.createElement(tag)
  }
  createTextNode(s: string) {
    return new MText(this, String(s))
  }
  createDocumentFragment() {
    const f = new MElement(this, '#fragment')
    f.nodeType = 11
    return f
  }
  createComment() {
    return new MText(this, '')
  }
  getElementById(id: string): MElement | null {
    const hit = this._ids[id]
    if (hit && hit._attrs.id === id && hit.isConnected) return hit
    if (this._missVer[id] === this._structVer) return null
    let found: MElement | null = null
    walk(this.documentElement, (e) => {
      if (e._attrs.id === id) found = e
      return !!found
    })
    if (found) this._ids[id] = found
    else this._missVer[id] = this._structVer
    return found
  }
  querySelector(sel: string) {
    return this.documentElement.matches(sel) ? this.documentElement : this.documentElement.querySelector(sel)
  }
  querySelectorAll(sel: string) {
    return this.documentElement.querySelectorAll(sel)
  }
  getElementsByTagName(t: string) {
    return this.querySelectorAll(t)
  }
  getElementsByClassName(c: string) {
    return this.documentElement.getElementsByClassName(c)
  }
  addEventListener(type: string, fn: any, opts?: any) {
    MElement.prototype.addEventListener.call(this as any, type, fn, opts)
  }
  removeEventListener(type: string, fn: any, opts?: any) {
    MElement.prototype.removeEventListener.call(this as any, type, fn, opts)
  }
  dispatchEvent(ev: any) {
    return this._dispatch(null, ev)
  }
  contains(n: any) {
    return this.documentElement.contains(n)
  }
  elementFromPoint() {
    return null
  }
  makeEvent(type: string, extra?: any) {
    const ev: any = {
      type,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      target: null,
      currentTarget: null,
      timeStamp: Date.now(),
      _stop: false,
      _stopNow: false,
      preventDefault() { ev.defaultPrevented = true },
      stopPropagation() { ev._stop = true },
      stopImmediatePropagation() { ev._stop = true; ev._stopNow = true },
    }
    if (extra) {
      const ks = Object.keys(extra)
      for (let i = 0; i < ks.length; i++) ev[ks[i]] = extra[ks[i]]
    }
    return ev
  }
  _callList(holder: any, ev: any, capturePhase: boolean | null) {
    const ls = holder && holder._ls && holder._ls[ev.type]
    const on = holder && holder !== this.win && capturePhase !== true ? holder['on' + ev.type] : null
    if (ls && ls.length) {
      const list = ls.slice()
      for (let i = 0; i < list.length; i++) {
        const l = list[i]
        if (capturePhase === true && !l.capture) continue
        if (capturePhase === false && l.capture) continue
        if (l.once) holder.removeEventListener(ev.type, l.fn, l.capture)
        ev.currentTarget = holder === this.win ? this.win.target : holder
        try {
          if (typeof l.fn === 'function') l.fn.call(ev.currentTarget, ev)
          else if (l.fn && typeof l.fn.handleEvent === 'function') l.fn.handleEvent(ev)
        } catch (err) {
          try { console.error('[mini-dom]', ev.type, err) } catch (x) { /* ignore */ }
        }
        if (ev._stopNow) return
      }
    }
    if (typeof on === 'function') {
      ev.currentTarget = holder
      try {
        on.call(holder, ev)
      } catch (err) {
        try { console.error('[mini-dom] on' + ev.type, err) } catch (x) { /* ignore */ }
      }
    }
  }
  /** 捕获 → 目标 → 冒泡；路径：元素 … html → document → window */
  _dispatch(target: MElement | null, ev: any) {
    if (!ev.preventDefault) ev = this.makeEvent(ev.type, ev)
    if (ev._stop === undefined) {
      ev._stop = false
      ev._stopNow = false
      const pd = ev.preventDefault
      ev.stopPropagation = () => { ev._stop = true }
      ev.stopImmediatePropagation = () => { ev._stop = true; ev._stopNow = true }
      ev.preventDefault = () => { ev.defaultPrevented = true; if (pd) try { pd.call(ev) } catch (x) { /* ignore */ } }
    }
    const path: any[] = []
    let n: any = target
    while (n) {
      path.push(n)
      n = n.parentNode
    }
    path.push(this, this.win)
    try { Object.defineProperty(ev, 'target', { value: target || this, configurable: true, writable: true }) } catch (x) { ev.target = target || this }
    ev.composedPath = () => path.slice()
    for (let i = path.length - 1; i > 0; i--) {
      this._callList(path[i], ev, true)
      if (ev._stop) return !ev.defaultPrevented
    }
    this._callList(path[0], ev, null)
    if (ev._stop || ev.bubbles === false) return !ev.defaultPrevented
    for (let i = 1; i < path.length; i++) {
      this._callList(path[i], ev, false)
      if (ev._stop) break
    }
    return !ev.defaultPrevented
  }
  // ---- change tracking ----
  _idChanged(el: MElement) {
    const id = el._attrs.id
    el._skip = !!(id && this.skipIds[id])
    if (id) this._ids[id] = el
    this._structVer++
  }
  _structure(el: MElement) {
    el._set = null
    this._structVer++
    el._v++
    this._mark(el)
  }
  /** 元素自身或里面变了：一路往上清 innerHTML 缓存；在隐藏的子树里就不用重画 */
  _mark(el: MElement) {
    let n: any = el
    let visible = true
    while (n) {
      n._html = null
      n._v++
      if (n._attrs && (n._attrs.hidden !== undefined || n._skip)) visible = false
      if (n === this.documentElement) break
      n = n.parentNode
    }
    if (!visible || !n) return
    if (!this.dirty) {
      this.dirty = true
      this.onDirty()
    }
  }
  /** hidden 变了：从父节点开始算（自己显隐会改父节点的画法） */
  _markShown(el: MElement) {
    if (el.parentNode) {
      el._html = null
      this._mark(el.parentNode)
    }
  }
}

export function createDocument() {
  return new MDocument()
}
