# Reach — production deployment

Deploy Reach on your server with managed PostgreSQL, Redis, HTTPS, and Meta webhooks.

## Architecture

```
                    ┌─────────────┐
   HTTPS :443 ─────►│   nginx     │──► static React (apps/web/dist)
                    │  (web svc)  │
                    └──────┬──────┘
                           │ /api/*  /l/*
                    ┌──────▼──────┐
                    │  Reach API  │──► BullMQ workers (in-process)
                    │  :3002      │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        PostgreSQL      Redis        Meta Cloud API
        (managed)    (container)
```

## Quick start (Docker — recommended)

### 1. Provision infrastructure

| Component | Requirement |
|-----------|-------------|
| **PostgreSQL 16+** | Managed (RDS, Supabase, DigitalOcean, etc.) or self-hosted |
| **Redis 7+** | Included in `docker-compose.prod.yml` or managed |
| **Server** | Linux, 2 GB+ RAM, Node 20+ if not using Docker |
| **Domain** | e.g. `reach.yourdomain.com` with DNS A record |

### 2. Configure environment

```bash
cd reach
cp deploy/env.production.example .env.production
bash deploy/scripts/generate-secrets.sh   # paste into .env.production
```

Edit `.env.production`:

- `DATABASE_URL` — your managed PostgreSQL URL (`?sslmode=require` recommended)
- `CLIENT_ORIGIN` — `https://reach.yourdomain.com`
- `LINK_BASE_URL` — same as CLIENT_ORIGIN
- `META_APP_SECRET` — from Meta Developer Console
- `META_WEBHOOK_VERIFY_TOKEN` — random string (match Meta webhook config)

### 3. Deploy

```bash
bash deploy/scripts/deploy-docker.sh
```

Or manually:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production run --rm api npx prisma db push
```

### 4. Seed admin (optional — skip if using /signup)

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production run --rm api npm run db:seed
```

### 5. HTTPS with Let's Encrypt

Point DNS to your server, then on the host:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d reach.yourdomain.com
```

Update nginx to listen on 443 (certbot does this automatically). Ensure `CLIENT_ORIGIN` uses `https://`.

### 6. Meta webhook

In [Meta Developer Console](https://developers.facebook.com/) → WhatsApp → Configuration:

| Field | Value |
|-------|-------|
| Callback URL | `https://reach.yourdomain.com/api/webhooks/whatsapp` |
| Verify token | Same as `META_WEBHOOK_VERIFY_TOKEN` |
| App secret | Set as `META_APP_SECRET` in `.env.production` |

Subscribe to: `messages`, `message_template_status_update`.

### 7. Verify

```bash
curl https://reach.yourdomain.com/api/health
curl https://reach.yourdomain.com/api/status
```

Open `https://reach.yourdomain.com` → sign up or log in.

---

## Bare-metal deploy (PM2 / systemd)

For servers without Docker:

```bash
npm ci
npm run build
cp deploy/env.production.example .env.production   # configure
cd apps/api && npx prisma db push && npx prisma generate
cd ../..
```

**Option A — PM2:**

```bash
mkdir -p logs
pm2 start deploy/pm2/ecosystem.config.cjs
pm2 save && pm2 startup
```

**Option B — systemd:**

```bash
sudo cp deploy/systemd/reach-api.service /etc/systemd/system/
sudo mkdir -p /var/log/reach
sudo systemctl enable --now reach-api
```

**Serve web UI** — build `apps/web` and configure nginx using `deploy/nginx/reach.conf`, or set `SERVE_WEB=true` after `npm run build` to serve static files from the API.

---

## Environment reference

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | BullMQ queues |
| `JWT_SECRET` | Yes | 32+ random chars |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32+ chars for WhatsApp tokens |
| `CLIENT_ORIGIN` | Yes | Full public URL with `https://` |
| `META_APP_SECRET` | Yes (prod) | Webhook signature verification |
| `META_WEBHOOK_VERIFY_TOKEN` | Yes | Meta webhook handshake |
| `TRUST_PROXY` | Yes behind nginx | Set `true` |
| `LINK_BASE_URL` | Recommended | Public URL for tracked links |

---

## Operations

### Health checks

- **Load balancer:** `GET /api/health` → 200 when DB + Redis OK
- **Status page:** `GET /api/status`

### Database backups

```bash
export DATABASE_URL="postgresql://..."
bash deploy/scripts/backup-postgres.sh ./backups
```

### Updates

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production run --rm api npx prisma db push
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 503 on `/api/health` | Check `DATABASE_URL` and `REDIS_URL` |
| Login cookie not set | `CLIENT_ORIGIN` must match browser URL exactly |
| Webhook verify fails | `META_WEBHOOK_VERIFY_TOKEN` must match Meta console |
| Campaigns stuck queued | Redis unreachable |
