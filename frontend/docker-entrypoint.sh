#!/bin/sh
set -e
node /app/scripts/ensure-project-log-docs.mjs
exec ./node_modules/.bin/vite --host 0.0.0.0
