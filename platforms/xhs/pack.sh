#!/usr/bin/env bash
# Pack the farm into an offline zip for 小红书小工具.
# Does not log in, upload, preview, or submit.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$HERE/scripts/pack.py"
