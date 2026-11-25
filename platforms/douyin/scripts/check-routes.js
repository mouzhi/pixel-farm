const path = require('node:path')
const { validateRoutes } = require('@open-dy/vibecoding-cli/validators/routes')

try {
  validateRoutes({ target: 'taro', root: path.resolve(__dirname, '..') })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
