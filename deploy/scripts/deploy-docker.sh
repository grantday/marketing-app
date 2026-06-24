#!/usr/bin/env bash
# Build and deploy Reach with Docker Compose (production)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Create $ENV_FILE from deploy/env.production.example first." >&2
  exit 1
fi

echo "==> Building images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

echo "==> Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo "==> Running database schema push..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm \
  -e NODE_ENV=production \
  api npx prisma db push --skip-generate

echo ""
echo "Deploy complete."
echo "  Health:  curl http://localhost/api/health"
echo "  Status:  curl http://localhost/api/status"
echo ""
echo "Optional seed (first install only):"
echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE run --rm api npm run db:seed"
