#!/bin/sh
set -e

echo "[backend] Waiting for database..."
# Simple retry loop for Postgres readiness
i=0
until node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.\$connect().then(()=>p.\$disconnect()).then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "[backend] Database not ready after 60s"
    exit 1
  fi
  sleep 1
done

echo "[backend] Syncing schema (prisma db push)..."
npx prisma db push --skip-generate --accept-data-loss

echo "[backend] Activating enrollments stuck on old payment-unlock flow..."
node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.enrollment.updateMany({where:{status:'pending', student:{passwordHash:{not:null}}}, data:{status:'active'}}).then(r=>{console.log('[backend] Activated', r.count, 'enrollments'); return p.\$disconnect();}).catch(e=>{console.error(e); process.exit(1);})"

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[backend] Seeding demo data (SEED_ON_START=true)..."
  node dist/seed.js || echo "[backend] Seed finished with warnings (continuing)"
fi

echo "[backend] Starting API..."
exec node dist/index.js
