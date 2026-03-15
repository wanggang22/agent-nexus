#!/bin/sh
# Install onchainos if not present
if ! command -v onchainos >/dev/null 2>&1; then
  echo "[start.sh] Installing onchainos CLI..."
  curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "[start.sh] onchainos version: $(onchainos --version 2>/dev/null || echo 'not found')"
exec node dist/server.js
