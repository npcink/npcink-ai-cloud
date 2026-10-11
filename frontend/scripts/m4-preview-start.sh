#!/bin/sh
set -eu

mode="${1:-production}"
case "${mode}" in
    development)
        export NODE_ENV=development
        exec node node_modules/next/dist/bin/next dev --webpack -H 0.0.0.0
        ;;
    production)
        export NODE_ENV=production
        export HOSTNAME=0.0.0.0
        export PORT=3000
        echo '[m4-frontend] compiling production assets for the preview environment'
        node node_modules/next/dist/bin/next build --webpack
        # Standalone output excludes static/public assets; use the release layout.
        test -f .next/standalone/frontend/server.js
        mkdir -p .next/standalone/frontend/.next
        cp -R .next/static .next/standalone/frontend/.next/
        if [ -d public ]; then
            cp -R public .next/standalone/frontend/
        fi
        echo '[m4-frontend] starting compiled preview'
        exec node .next/standalone/frontend/server.js
        ;;
    *)
        echo '[m4-frontend] mode must be production or development' >&2
        exit 64
        ;;
esac
