import Taro, { useReady } from "@tarojs/taro"
import { useCallback, useEffect, useRef, useState } from "react"

import type { PointerPoint } from "@/lib/pointer"

export const GAME_ONE_SCREEN_CLASS = "game-one-screen"
export const GAME_STAGE_CLASS = "game-stage"
export const GAME_CANVAS_FILL_CLASS = "game-canvas-fill"
export const GAME_OVERLAY_PASSTHROUGH_CLASS = "game-overlay-pass-through"
export const GAME_OVERLAY_INTERACTIVE_CLASS = "game-overlay-interactive"

export type CanvasRect = {
  left: number
  top: number
  width: number
  height: number
}

export type Canvas2DOptions = {
  canvasId: string
  logicalWidth: number
  logicalHeight: number
  retryLimit?: number
  retryDelayMs?: number
}

export function toCanvasPoint(
  point: PointerPoint,
  rect: CanvasRect,
  logicalWidth: number,
  logicalHeight: number,
) {
  return {
    x: ((point.clientX - rect.left) / rect.width) * logicalWidth,
    y: ((point.clientY - rect.top) / rect.height) * logicalHeight,
  }
}

/**
 * Canvas 2D 初始化通用 Hook。
 *
 * 约定：
 * - 统一使用 Taro.createSelectorQuery，不要使用浏览器 DOM API。
 * - 同时缓存 canvas node、ctx 与 bounding rect，供拖拽坐标换算使用。
 * - selectorQuery 允许有限重试，避免首次渲染时序导致黑屏。
 * - 对应 `#canvasId` 的 Canvas 必须已经挂在树上。本 Hook 在 useReady 自动 init，条件渲染的画布不要依赖这次自动调用；等节点入树后再调用返回的 initCanvas。
 */
export function useCanvas2D(options: Canvas2DOptions) {
  const {
    canvasId,
    logicalWidth,
    logicalHeight,
    retryLimit = 8,
    retryDelayMs = 150,
  } = options
  const canvasRef = useRef<any>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const canvasRectRef = useRef<CanvasRect>({
    left: 0,
    top: 0,
    width: logicalWidth,
    height: logicalHeight,
  })
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [canvasInitFailed, setCanvasInitFailed] = useState(false)

  const initCanvas = useCallback((attempt = 0) => {
    const query = Taro.createSelectorQuery()
    query.select(`#${canvasId}`).fields({ node: true, size: true })
    query.select(`#${canvasId}`).boundingClientRect()
    query.exec((res: any[]) => {
      const canvasInfo = res?.[0]
      const rect = res?.[1]
      const canvas = canvasInfo?.node

      const retry = () => {
        if (attempt >= retryLimit) {
          setCanvasInitFailed(true)
          return
        }
        retryTimerRef.current = setTimeout(() => initCanvas(attempt + 1), retryDelayMs)
      }

      if (!canvas) {
        retry()
        return
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        retry()
        return
      }

      canvasRef.current = canvas
      ctxRef.current = ctx
      canvas.width = logicalWidth
      canvas.height = logicalHeight
      canvasRectRef.current = {
        left: rect?.left || 0,
        top: rect?.top || 0,
        width: rect?.width || canvasInfo?.width || logicalWidth,
        height: rect?.height || canvasInfo?.height || logicalHeight,
      }
      setCanvasInitFailed(false)
      setCanvasReady(true)
    })
  }, [canvasId, logicalHeight, logicalWidth, retryDelayMs, retryLimit])

  useReady(() => {
    initCanvas()
  })

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [])

  return {
    canvasRef,
    ctxRef,
    canvasRectRef,
    canvasReady,
    canvasInitFailed,
    initCanvas,
  }
}

export function useFrameScheduler() {
  const rafRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleNextFrame = useCallback((callback: FrameRequestCallback) => {
    if (typeof requestAnimationFrame === "function") {
      rafRef.current = requestAnimationFrame(callback)
      return
    }
    timerRef.current = setTimeout(() => callback(Date.now()), 16)
  }, [])

  const cancelScheduledFrame = useCallback(() => {
    if (typeof cancelAnimationFrame === "function" && rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
    rafRef.current = 0
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => cancelScheduledFrame, [cancelScheduledFrame])

  return {
    scheduleNextFrame,
    cancelScheduledFrame,
  }
}
