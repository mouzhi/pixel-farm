#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
CLI_ROOT="$(node -p 'require("node:path").dirname(require.resolve("@open-dy/vibecoding-cli/package.json"))')"
exec node "$CLI_ROOT/src/scripts/pack.mjs" "$ROOT"
