import { createOpenCardEslintConfig, createOpenCardPatchPlugin } from '@open-dy/vibecoding-sdk-opencard/eslint/opencard'

const openCardPlugin = createOpenCardPatchPlugin()

export default createOpenCardEslintConfig({
  plugins: {
    'open-card': openCardPlugin,
  },
  rules: {
    ...openCardPlugin.configs.recommended.rules,
  },
})
