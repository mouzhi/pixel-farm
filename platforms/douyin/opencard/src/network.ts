import { createOpenCardClient } from '@open-dy/vibecoding-sdk-opencard/interest-card/runtime/opencard'

const MICROAPP_PLATFORM_CHANNEL = 'ext'

/**
 * 项目网络请求入口。业务代码统一从 `@/network` 导入 Network。
 * 平台请求适配与 openCardTaro 实例缓存由 SDK 提供。
 */
const client = createOpenCardClient({
  platformChannel: MICROAPP_PLATFORM_CHANNEL,
})


export const Network = client
