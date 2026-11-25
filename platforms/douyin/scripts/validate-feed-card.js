const path = require('node:path')
const { validateFeedCard } = require('@open-dy/vibecoding-cli/validators/feed-card')

try {
  validateFeedCard({ target: 'taro', root: path.resolve(__dirname, '..') })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
