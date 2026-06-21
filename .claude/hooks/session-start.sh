#!/bin/bash
set -euo pipefail

# Solo ejecutar en entornos remotos de Claude Code en la web
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 300000}'

cd "$CLAUDE_PROJECT_DIR"
npm install
