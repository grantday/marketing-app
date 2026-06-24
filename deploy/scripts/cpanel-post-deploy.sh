#!/bin/sh
# Post-deploy helper — run from cPanel Terminal if deploy tasks fail
set -e
cd ~/marketing-app
npm ci
npm run build
cd apps/api
npx prisma generate
npx prisma db push
mkdir -p tmp && touch tmp/restart.txt
echo "Done. Configure Node.js app to use ~/marketing-app/apps/api/dist/index.js"
