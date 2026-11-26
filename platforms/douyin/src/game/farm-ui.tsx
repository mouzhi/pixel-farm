// v12：网页版的界面（HUD、底栏、商店/仓库/图鉴/日记面板、提示）画成 Taro 组件。
// 界面脚本改的是 farm-env 里的迷你 DOM；这里最多每 500ms 把变了的那部分画一次（点按后 40ms 内补一次），
// 每个节点按版本号 memo，没变的子树不重画；hidden 的、手机上不显示的节点不画。
import { Image, Text, View } from "@tarojs/components"
import { memo, useEffect, useState } from "react"
import { nodeClass, nodeKey, shouldDraw, styleOf } from "./farm-ui-model"
import "./farm-ui.css"

type Env = { dom: any }
const FLUSH_MS = 500

function fire(env: Env, n: any, type: string, e: any) {
  const t = e && ((e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e.detail)
  const x = t ? Number(t.clientX ?? t.x ?? 0) : 0
  const y = t ? Number(t.clientY ?? t.y ?? 0) : 0
  try {
    env.dom._dispatch(n, env.dom.makeEvent(type, { clientX: x, clientY: y, pointerType: "touch", button: 0 }))
  } catch (err) {
    console.warn("[farm-ui]", type, err)
  }
}

let kickFlush: (ms: number) => void = () => undefined

function kids(env: Env, n: any) {
  const out: any[] = []
  const cs = n.childNodes
  for (let i = 0; i < cs.length; i++) {
    const k = cs[i]
    if (!shouldDraw(k)) continue
    out.push(<UINode key={nodeKey(k)} env={env} n={k} v={k.nodeType === 3 ? k.data : k._v} />)
  }
  return out
}

const UINode = memo(
  function UINode({ env, n }: { env: Env; n: any; v: unknown }) {
    if (n.nodeType === 3) return <Text>{n.data}</Text>
    const id = n._attrs.id || undefined
    const cls = nodeClass(n)
    const st = styleOf(n)
    const onTouchStart = (e: any) => {
      if (e && e.stopPropagation) e.stopPropagation()
      fire(env, n, "pointerdown", e)
      kickFlush(40)
    }
    const onClick = (e: any) => {
      if (e && e.stopPropagation) e.stopPropagation()
      if (n.localName === "button" && n.hasAttribute("disabled")) return
      fire(env, n, "click", e)
      kickFlush(30)
    }
    if (n.localName === "img") return <Image id={id} className={cls} style={st} src={n.getAttribute("src") || ""} mode="scaleToFill" onClick={onClick} />
    return (
      <View id={id} className={cls} style={st} onTouchStart={onTouchStart} onClick={onClick}>
        {kids(env, n)}
      </View>
    )
  },
  (a, b) => a.n === b.n && a.v === b.v,
)

/** 整个界面层：html → body → 顶层块（HUD、底栏、各面板）。不用 CustomWrapper：小程序自定义组件有样式隔离，页面样式进不去 */
function FarmUIRoot({ env }: { env: Env }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const dom = env.dom
    let timer: any = 0
    let last = 0
    const flush = () => {
      timer = 0
      dom.dirty = false
      last = Date.now()
      setTick((x) => x + 1)
    }
    const soon = (ms: number) => {
      if (timer) {
        if (ms > 60) return
        clearTimeout(timer)
      }
      timer = setTimeout(flush, Math.max(0, ms))
    }
    kickFlush = soon
    dom.onDirty = () => soon(last + FLUSH_MS - Date.now())
    flush()
    return () => {
      clearTimeout(timer)
      dom.onDirty = () => undefined
      kickFlush = () => undefined
    }
  }, [env])
  const html = env.dom.documentElement
  const body = env.dom.body
  const blocks: any[] = []
  const cs = body.childNodes
  for (let i = 0; i < cs.length; i++) {
    const k = cs[i]
    if (k.nodeType !== 1 || !shouldDraw(k)) continue
    blocks.push(<UINode key={nodeKey(k)} env={env} n={k} v={k._v} />)
  }
  return (
    <View className={nodeClass(html)} style={styleOf(html)}>
      <View className={nodeClass(body)} style={styleOf(body)}>
        {blocks}
      </View>
    </View>
  )
}

export const FarmUI = memo(FarmUIRoot, (a, b) => a.env === b.env)
