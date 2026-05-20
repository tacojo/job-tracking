#!/bin/sh
set -e
node /app/scripts/ensure-project-log-docs.mjs
exec npm run dev -- --host 0.0.0.0
