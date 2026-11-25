#!/bin/sh
set -e

if [ -f "$HOME/.bashrc" ]; then
  . "$HOME/.bashrc"
fi

export NJS_SERVER_PORT="${NJS_SERVER_PORT:-8000}"
exec node dist/main
