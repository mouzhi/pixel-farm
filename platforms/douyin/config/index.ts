import { fileURLToPath } from 'node:url'
import { defineConfig } from '@tarojs/cli'
import { createMicroappTaroConfig } from '@open-dy/vibecoding-sdk-taro/build/taro'

let MICROAPP_PLATFORM_CHANNEL: '' | 'ext' = ''
MICROAPP_PLATFORM_CHANNEL = 'ext'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(createMicroappTaroConfig({
  projectRoot,
  platformChannel: MICROAPP_PLATFORM_CHANNEL,
  viteErrorTargets: [
    'https://code.aihub.douyin.com',
    'https://code.aihub.douyin.com',
  ],
}))
