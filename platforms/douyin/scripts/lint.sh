#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/node_modules/.bin/vibecoding" lint --target taro --cwd "$ROOT" "$@"
