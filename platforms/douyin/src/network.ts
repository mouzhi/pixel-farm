import { createMicroappClient } from '@open-dy/vibecoding-sdk-taro/runtime'

const MICROAPP_PLATFORM_CHANNEL = 'ext'

/**
 * 兴趣卡落地页网络入口。业务代码统一从 `@/network` 导入 Network。
 * 平台请求适配由 SDK Runtime 提供；此处仅保留兴趣卡的通道配置。
 */
const client = createMicroappClient({
  platformChannel: MICROAPP_PLATFORM_CHANNEL,
})


export const Network = client
