/**
 * OpenCard 跳转视频所需的 Button 字段。官方 Button.d.ts 没有这些类型，不代表运行时不支持。
 *
 * 本文件必须是 module（有 import / export），`declare module` 才会合并进官方类型。
 * 禁止再写空壳 `declare module "@tarojs/components"` 或 `declare module "@tarojs/taro"`：
 * 无 import 的空壳声明会覆盖官方桶文件，tsc 会报 View / Text / request 不存在。
 */
import "@tarojs/components"

export {}

declare global {
  type DouyinOpenTypeDetailEvent = {
    detail?: { errMsg?: string; errNo?: number }
  }

  type DouyinOpenButtonExtras = {
    hideBorder?: boolean
    dataVideoId?: string
    dataVideoType?: string
    dataChannel?: string
    "data-video-id"?: string
    "data-video-type"?: string
    "data-channel"?: string
    onNavigateToVideoView?: (event: DouyinOpenTypeDetailEvent) => void
    onAddShortcut?: (event: DouyinOpenTypeDetailEvent) => void
  }
}

declare module "@tarojs/components/types/Button" {
  interface ButtonProps extends DouyinOpenButtonExtras {}
}
