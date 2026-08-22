#!/bin/bash
cd /home/ubuntu/edgePOS/desktop || exit 3
pkill -9 -f "electron/dist/electron" 2>/dev/null; pkill -9 -f "pocketbase" 2>/dev/null
sleep 1
: > app.log
exec env NEXUS_SERVE_BUILT=1 NEXUS_E2E=1 xvfb-run -a node_modules/.bin/electron . --no-sandbox >> app.log 2>&1
