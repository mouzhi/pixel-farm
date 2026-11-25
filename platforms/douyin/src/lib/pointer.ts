export type PointerPoint = {
  clientX: number
  clientY: number
}

export function getPointerPoint(e: any): PointerPoint | null {
  const touch = e?.touches?.[0] || e?.changedTouches?.[0]
  const x =
    typeof touch?.x === "number"
      ? touch.x
      : typeof touch?.clientX === "number"
        ? touch.clientX
        : typeof touch?.pageX === "number"
          ? touch.pageX
          : typeof e?.clientX === "number"
            ? e.clientX
            : typeof e?.pageX === "number"
              ? e.pageX
              : null

  const y =
    typeof touch?.y === "number"
      ? touch.y
      : typeof touch?.clientY === "number"
        ? touch.clientY
        : typeof touch?.pageY === "number"
          ? touch.pageY
          : typeof e?.clientY === "number"
            ? e.clientY
            : typeof e?.pageY === "number"
              ? e.pageY
              : null

  if (typeof x !== "number" || typeof y !== "number") return null
  return { clientX: x, clientY: y }
}

/**
 * 鼠标拖拽兼容层已移除；兴趣卡落地页仅使用触摸事件。
 * 保留空实现，避免历史引用直接炸编译。
 */
export function getMouseDragBindProps(_params: {
  enabled?: boolean
  onStart?: (e: any) => void
  onMove: (e: any) => void
  onEnd?: () => void
}) {
  return {}
}
