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

Requires `.cpanel.yml` in repo root (included). In cPanel:

1. **Git Version Control** → clone `https://github.com/grantday/marketing-app.git`
2. Click **Update from Remote** (fixes “uncommitted changes” error)
3. Click **Deploy HEAD Commit**
4. **Setup Node.js App** → root `marketing-app/apps/api`, startup `dist/index.js`, Node 20
5. Set `DATABASE_URL` (Neon/Supabase) and `REDIS_URL` (Upstash) in app environment variables

See comments in `.cpanel.yml` for details.

## Server setup (VPS / Docker)

```bash
git clone https://github.com/grantday/marketing-app.git
cd marketing-app
cp deploy/env.production.example .env.production
# Edit .env.production — set DATABASE_URL, CLIENT_ORIGIN, secrets
bash deploy/scripts/deploy-docker.sh
```
