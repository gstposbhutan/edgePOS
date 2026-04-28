#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Clean ==="
rm -rf "/home/$USER/.config/pos-terminal/pb_data"
rm -rf out/ .next/ release/

echo "=== Build ==="
npm run build
npm run electron:build

echo "=== Launch ==="
APPDIR="$(ls -t release/NEXUS*.AppImage 2>/dev/null | head -1)"
if [ -z "$APPDIR" ]; then
  echo "Error: No AppImage found in release/"
  exit 1
fi
chmod +x "$APPDIR"
echo "Launching: $APPDIR"
exec "$APPDIR"
