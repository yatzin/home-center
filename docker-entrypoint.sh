#!/bin/sh
set -e

# /data is a bind mount on most NAS setups, so its ownership comes from the
# host, not the image — fix it up on every start before dropping to nextjs.
# Only files with the wrong owner are touched; a blanket chown -R rewrote every
# upload's metadata on each boot. -h changes a symlink itself, never its target.
mkdir -p /data/uploads /data/models /data/backups
find /data \( ! -user nextjs -o ! -group nodejs \) -exec chown -h nextjs:nodejs {} +

# A staged restore is swapped in before anything opens the database. If it fails and
# cannot be undone this exits non-zero, and set -e stops the container here instead of
# letting migrate deploy create an empty database over the household's data.
# The binaries are called directly; npx adds its own package lookup to each step.
gosu nextjs ./node_modules/.bin/tsx scripts/restore-apply.ts
gosu nextjs ./node_modules/.bin/prisma migrate deploy
gosu nextjs ./node_modules/.bin/tsx prisma/seed.ts

exec gosu nextjs node server.js
