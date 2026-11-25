import { fileURLToPath } from 'node:url'
import { defineConfig } from '@open-dy/vibecoding-sdk-opencard/cli'
import { createOpenCardTaroConfig } from '@open-dy/vibecoding-sdk-opencard/build/opencard'

let MICROAPP_PLATFORM_CHANNEL: '' | 'ext' = ''
MICROAPP_PLATFORM_CHANNEL = 'ext'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(createOpenCardTaroConfig({
  projectRoot,
  platformChannel: MICROAPP_PLATFORM_CHANNEL,
  viteErrorTargets: [
    'https://code.aihub.douyin.com',
    'https://code.aihub.douyin.com',
  ],
}))
