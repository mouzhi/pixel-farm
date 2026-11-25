import { createMicroappServerEslintConfig } from '@open-dy/vibecoding-sdk-taro/eslint/server'

export default createMicroappServerEslintConfig({
  tsconfigRootDir: import.meta.dirname,
})
