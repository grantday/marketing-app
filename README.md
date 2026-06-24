# Reach (marketing-app)

WhatsApp marketing platform — campaigns, shared inbox, automation, CRM sync, and SaaS billing.

**Stack:** Node.js 20 · Express · React · PostgreSQL · Redis · Prisma · BullMQ

## Development

```bash
docker compose up -d          # PostgreSQL :5433, Redis :6380
cp .env.example .env          # configure locally
npm install
npm run db:push
npm run db:seed
npm run dev                   # API :3002, web :5174
```

**Seed login:** `sales@arenarama.local` / `ChangeMe!2026`

## Production

See [DEPLOY.md](./DEPLOY.md) for Docker, nginx, HTTPS, and Meta webhooks.

## FastComet shared hosting (cPanel)

**First deploy:** see [deploy/CPANEL-FASTCOMET.md](./deploy/CPANEL-FASTCOMET.md) — GitHub push alone does not deploy; use **Update from Remote** then **Deploy HEAD Commit** in cPanel.

Requires `.cpanel.yml` in repo root (included).

## Server setup (VPS / Docker)

```bash
git clone https://github.com/grantday/marketing-app.git
cd marketing-app
cp deploy/env.production.example .env.production
# Edit .env.production — set DATABASE_URL, CLIENT_ORIGIN, secrets
bash deploy/scripts/deploy-docker.sh
```
