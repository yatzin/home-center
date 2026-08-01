#!/bin/sh
set -e

# /data is a bind mount on most NAS setups, so its ownership comes from the
# host, not the image — fix it up on every start before dropping to nextjs.
mkdir -p /data/uploads
chown -R nextjs:nodejs /data

su-exec nextjs npx prisma migrate deploy
su-exec nextjs npx tsx prisma/seed.ts

exec su-exec nextjs node server.js
