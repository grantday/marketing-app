# Deploy Reach on DigitalOcean

Step-by-step guide for a **Droplet (VPS)** + **Managed PostgreSQL** — the recommended setup for Reach.

**Repo:** https://github.com/grantday/marketing-app

---

## What you'll create

| Resource | DigitalOcean product | Cost (approx.) |
|----------|---------------------|----------------|
| App server | Droplet 2 GB / Ubuntu 24.04 | ~$12/mo |
| Database | Managed PostgreSQL 16 | ~$15/mo |
| Redis | In Docker on Droplet (included in compose) | $0 |
| Domain | Your existing DNS (e.g. FastComet) | — |

**Total:** ~$27/mo + domain.

---

## Part 1 — Create Managed PostgreSQL

1. [DigitalOcean Console](https://cloud.digitalocean.com/) → **Databases** → **Create Database**
2. Choose **PostgreSQL 16**, region same as your Droplet (e.g. NYC)
3. Plan: **Basic** (1 GB) is enough to start
4. Database name: `reach` (or use default and create DB later)
5. After creation, open **Connection details** → **Connection string** (URI)
6. Copy the URI — looks like:
   ```
   postgresql://doadmin:XXXX@db-postgresql-nyc3-12345-do-user-xxx.db.ondigitalocean.com:25060/defaultdb?sslmode=require
   ```
7. **Settings** → **Trusted sources** → Add your Droplet IP (add after Part 2) or **Allow all** temporarily for first setup

---

## Part 2 — Create Droplet

1. **Droplets** → **Create Droplet**
2. **Image:** Ubuntu 24.04 LTS
3. **Size:** Basic → **2 GB RAM** / 1 vCPU ($12/mo)
4. **Region:** Same as database
5. **Authentication:** SSH key (recommended) or password
6. **Hostname:** `reach-app`
7. Create Droplet → note the **public IP**

### DNS (at FastComet or your registrar)

Add an **A record**:

| Host | Points to |
|------|-----------|
| `reach` (or `app`) | Your Droplet IP |

Example: `reach.yourdomain.com` → `157.xxx.xxx.xxx`

---

## Part 3 — Server setup (SSH)

```bash
ssh root@YOUR_DROPLET_IP
```

Run the bootstrap script (or follow manual steps below):

```bash
curl -fsSL https://raw.githubusercontent.com/grantday/marketing-app/main/deploy/scripts/do-bootstrap.sh | bash
```

**Manual alternative:**

```bash
apt update && apt upgrade -y
apt install -y git ca-certificates curl
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
```

---

## Part 4 — Deploy Reach

```bash
cd /opt
git clone https://github.com/grantday/marketing-app.git reach
cd reach
cp deploy/env.production.example .env.production
nano .env.production   # or vim
```

### Edit `.env.production`

```env
NODE_ENV=production
DATABASE_URL="postgresql://doadmin:...@db-postgresql-....ondigitalocean.com:25060/defaultdb?sslmode=require"
REDIS_URL="redis://redis:6379"
CLIENT_ORIGIN="https://reach.yourdomain.com"
LINK_BASE_URL="https://reach.yourdomain.com"
TRUST_PROXY=true
HTTP_PORT=80

# Generate on server:
JWT_SECRET="<run: openssl rand -base64 48>"
TOKEN_ENCRYPTION_KEY="<run: openssl rand -base64 32 | head -c 32>"

META_APP_SECRET=""
META_WEBHOOK_VERIFY_TOKEN=""
META_APP_ID=""
```

Generate secrets:

```bash
bash deploy/scripts/generate-secrets.sh
```

### Build and start

```bash
bash deploy/scripts/deploy-docker.sh
```

Or:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production run --rm api npx prisma db push
```

### Optional: seed admin user

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production run --rm api npm run db:seed
```

Login: `sales@arenarama.local` / `ChangeMe!2026` — or use `/signup`.

---

## Part 5 — HTTPS (Let's Encrypt)

After HTTP works (`http://YOUR_DROPLET_IP/api/health`):

```bash
apt install -y certbot
# Stop web container briefly if port 80 is in use
cd /opt/reach
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production stop web

certbot certonly --standalone -d reach.yourdomain.com --agree-tos -m your@email.com

# Install certs into nginx (see deploy/nginx/reach-ssl.conf.example)
# Or use Caddy as host reverse proxy — ask for help if needed
```

**Simpler option:** Use [DigitalOcean Load Balancer](https://docs.digitalocean.com/products/networking/load-balancers/) with managed SSL (~$12/mo extra) in front of the Droplet.

For quick SSL without load balancer, use host **Caddy**:

```bash
apt install -y caddy
# /etc/caddy/Caddyfile:
# reach.yourdomain.com {
#   reverse_proxy localhost:80
# }
systemctl reload caddy
```

(Update compose to bind web to `127.0.0.1:8080:80` if Caddy uses port 80.)

---

## Part 6 — Meta WhatsApp webhook

Meta Developer Console → WhatsApp → Configuration:

| Field | Value |
|-------|-------|
| Callback URL | `https://reach.yourdomain.com/api/webhooks/whatsapp` |
| Verify token | Same as `META_WEBHOOK_VERIFY_TOKEN` |

Subscribe to: `messages`, `message_template_status_update`.

---

## Part 7 — Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

In DO Cloud: **Networking** → **Firewalls** → allow 22, 80, 443 to Droplet.

**Managed Postgres:** Droplet IP must be in database **Trusted sources**.

---

## Updates (after you push to GitHub)

On the Droplet:

```bash
cd /opt/reach
git pull
bash deploy/scripts/deploy-docker.sh
```

---

## Verify

```bash
curl http://localhost/api/health
curl https://reach.yourdomain.com/api/health
```

Expected: `{"ok":true,"service":"reach-api","checks":{"database":true,"redis":true}}`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| DB connection refused | Add Droplet to Postgres **Trusted sources**; check `sslmode=require` |
| 503 on `/api/health` | `docker compose logs api` — usually `DATABASE_URL` or Redis |
| Cookie login fails | `CLIENT_ORIGIN` must exactly match `https://reach.yourdomain.com` |
| Build runs out of memory | Resize Droplet to 4 GB or add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |

---

## Alternative: DigitalOcean App Platform

App Platform can run Node apps but Reach also needs **in-process BullMQ workers** and **Redis**. A Droplet + Docker is simpler and matches our `DEPLOY.md`. Use App Platform only if you add **Managed Redis** as a separate component and configure build/run commands for the monorepo — contact support or use the Droplet guide above.

---

## FastComet + DigitalOcean together

- **FastComet shared:** keep email, WordPress, main website
- **DigitalOcean Droplet:** Reach only at `reach.yourdomain.com` (DNS A record → Droplet IP)

No conflict — they serve different subdomains.
