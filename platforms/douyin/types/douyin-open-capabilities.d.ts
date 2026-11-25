/**
 * 抖音 Button openType / 拍抖音 channel 不在上游 Taro 类型里。
 * 业务按文档写这些字段即可，不要为了过 tsc 删掉。
 *
 * 本文件必须是 module（有 import / export），`declare module` 才会合并进官方类型。
 * 禁止再写 `declare module "@tarojs/components"` 或 `declare module "@tarojs/taro"`：
 * 无 import 的空壳声明会覆盖官方桶文件，tsc 会报 View / getEnv / request 不存在。
 */
import "@tarojs/components"
import "@tarojs/taro"

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

  namespace Taro {
    interface ShareAppMessageReturnObject {
      channel?: string
      success?: () => void
      fail?: (error?: unknown) => void
    }

    interface ShareAppMessageObject {
      channel?: string
      success?: () => void
      fail?: (error?: unknown) => void
    }
  }
}

declare module "@tarojs/components/types/Button" {
  interface ButtonProps extends DouyinOpenButtonExtras {}
}
