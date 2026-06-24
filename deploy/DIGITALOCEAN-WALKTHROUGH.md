# Reach on DigitalOcean — click-by-click walkthrough

Use this guide the first time you deploy Reach. Estimated time: **30–45 minutes**.

**Repo:** https://github.com/grantday/marketing-app

---

## Before you start

- [ ] DigitalOcean account: https://cloud.digitalocean.com/registrations/new
- [ ] Credit card on file (Droplet + DB are billed monthly)
- [ ] Domain you control (DNS at FastComet or elsewhere)
- [ ] SSH client (Windows: PowerShell, PuTTY, or Windows Terminal)

---

## Part A — Create Managed PostgreSQL (10 min)

### A1. Open Databases

1. Log in to https://cloud.digitalocean.com/
2. Left sidebar → **Databases** (under **MANAGE**)
3. Click the blue **Create Database Cluster** button

### A2. Choose engine

1. **PostgreSQL** (should be selected by default)
2. Version: **16** (or latest 16.x)

### A3. Choose cluster configuration

1. **Datacenter:** Pick a region close to you (e.g. **New York 3**, **London 1**, **Singapore 1**)
   - **Remember this region** — Droplet must be in the same region later
2. **Database configuration:** **Basic** → **Regular SSD** → **1 GB RAM / 1 vCPU** (~$15/mo) is fine to start
3. **Choose a unique name:** e.g. `reach-db`
4. **Select a project:** Default is fine

### A4. Create

1. Click **Create Database Cluster**
2. Wait 3–5 minutes until status shows **Online**

### A5. Save connection details

1. Click your cluster name (`reach-db`)
2. Tab **Overview**
3. Under **Connection Details**, dropdown **Connection parameters** → choose **URI**
4. Click **Copy** (or show password and copy full string)

It looks like:

```
postgresql://doadmin:AVNS_xxxxxxxx@reach-db-do-user-12345678-0.j.db.ondigitalocean.com:25060/defaultdb?sslmode=require
```

5. Save this in a password manager or local note — you'll paste it into `.env.production` as `DATABASE_URL`

### A6. Create a dedicated database (optional but tidy)

1. Tab **Users & Databases**
2. Section **Databases** → enter name `reach` → **Save**
3. Update your URI database name from `defaultdb` to `reach` if you created it

### A7. Trusted sources (do after Droplet exists)

*Skip for now — return after Part B when you have the Droplet IP.*

1. Tab **Settings**
2. **Trusted sources** → **Edit**
3. Add your **Droplet's public IP** (or select the Droplet by name if listed)
4. **Save**

Without this, the app cannot connect to Postgres.

---

## Part B — Create Droplet (10 min)

### B1. Open Droplets

1. Left sidebar → **Droplets**
2. Click **Create Droplet**

### B2. Choose image

1. **Ubuntu** tab
2. Select **Ubuntu 24.04 (LTS) x64**

### B3. Choose size

1. **Basic** (Shared CPU)
2. **Regular** → **$12/mo** — 2 GB RAM / 1 vCPU / 50 GB SSD
   - If build fails with out-of-memory, upgrade to 4 GB later

### B4. Choose datacenter

1. **Same region as your database** (e.g. NYC3 if DB is NYC3)

### B5. Authentication

**Recommended — SSH key:**

1. If you have no key: on your PC (PowerShell):
   ```powershell
   ssh-keygen -t ed25519 -C "your@email.com"
   ```
   Press Enter for defaults. Then:
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
   ```
2. In DO: **New SSH Key** → paste the public key → name it `my-laptop`
3. Select that key

**Alternative — Password:** DO emails a root password (less secure).

### B6. Final options

1. **Hostname:** `reach-app`
2. **Tags:** optional `reach`
3. **Project:** default

### B7. Create

1. Click **Create Droplet**
2. Wait ~60 seconds
3. Copy the **public IP** (e.g. `157.230.xxx.xxx`)

### B8. Add Droplet to Postgres trusted sources

Return to **Databases** → your cluster → **Settings** → **Trusted sources** → add this Droplet IP → **Save**.

---

## Part C — DNS (5 min)

At **FastComet** (or wherever your domain DNS lives):

1. Open DNS zone for `yourdomain.com`
2. Add record:

| Type | Name/Host | Value | TTL |
|------|-----------|-------|-----|
| **A** | `reach` | `YOUR_DROPLET_IP` | 300 |

Result: `reach.yourdomain.com` → your Droplet.

Propagation can take 5–60 minutes. You can still deploy using the IP first.

---

## Part D — Deploy Reach on the Droplet (15 min)

### D1. SSH into the server

From your PC:

```powershell
ssh root@YOUR_DROPLET_IP
```

Type `yes` if asked about fingerprint. Use password if you didn't set up SSH keys.

### D2. Bootstrap Docker

```bash
curl -fsSL https://raw.githubusercontent.com/grantday/marketing-app/main/deploy/scripts/do-bootstrap.sh | bash
```

### D3. Clone the app

```bash
cd /opt
git clone https://github.com/grantday/marketing-app.git reach
cd reach
```

### D4. Create production env file

```bash
cp deploy/env.production.example .env.production
nano .env.production
```

Edit these lines (use arrow keys; Ctrl+O save, Enter, Ctrl+X exit):

```env
NODE_ENV=production
DATABASE_URL="postgresql://doadmin:YOUR_PASSWORD@your-db-host:25060/reach?sslmode=require"
REDIS_URL="redis://redis:6379"
CLIENT_ORIGIN="https://reach.yourdomain.com"
LINK_BASE_URL="https://reach.yourdomain.com"
TRUST_PROXY=true
HTTP_PORT=8080
```

Generate secrets (paste into same file):

```bash
bash deploy/scripts/generate-secrets.sh
```

Add Meta vars when ready:

```env
META_APP_SECRET="from Meta Developer Console"
META_WEBHOOK_VERIFY_TOKEN="any-random-string-you-choose"
```

> **Note:** `HTTP_PORT=8080` leaves port 80 free for Caddy HTTPS (Part E). For HTTP-only testing first, use `HTTP_PORT=80`.

### D5. Deploy with Docker

```bash
bash deploy/scripts/deploy-docker.sh
```

Wait 5–10 minutes for first build.

### D6. Test (HTTP)

```bash
curl http://localhost:8080/api/health
```

Or if `HTTP_PORT=80`:

```bash
curl http://localhost/api/health
```

Expected:

```json
{"ok":true,"service":"reach-api","checks":{"database":true,"redis":true}}
```

If `database: false` → check `DATABASE_URL` and Postgres **Trusted sources**.

Open in browser: `http://YOUR_DROPLET_IP:8080` (or `:80`).

---

## Part E — HTTPS with Caddy (automatic Let's Encrypt) (10 min)

Caddy obtains and renews free SSL certificates automatically.

### E1. Point DNS first

`reach.yourdomain.com` must already point to the Droplet IP before this step.

Verify:

```bash
ping reach.yourdomain.com
```

### E2. Install Caddy

On the Droplet:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

### E3. Configure Caddy

Replace domain in the command below:

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
reach.yourdomain.com {
    reverse_proxy localhost:8080
}
EOF
```

**Important:** Replace `reach.yourdomain.com` with your real subdomain.

Ensure Docker web container uses port **8080** (`HTTP_PORT=8080` in `.env.production`). If already running on 80:

```bash
cd /opt/reach
# set HTTP_PORT=8080 in .env.production
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build
```

### E4. Start Caddy

```bash
systemctl enable caddy
systemctl reload caddy
```

Caddy will request a certificate from Let's Encrypt (port 80 must be reachable).

### E5. Verify HTTPS

```bash
curl https://reach.yourdomain.com/api/health
```

Browser: https://reach.yourdomain.com → Reach login/signup page.

Update `.env.production` if needed:

```env
CLIENT_ORIGIN="https://reach.yourdomain.com"
LINK_BASE_URL="https://reach.yourdomain.com"
```

Restart API:

```bash
cd /opt/reach
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d api
```

---

## Part F — Meta WhatsApp webhook

1. https://developers.facebook.com/ → your app → **WhatsApp** → **Configuration**
2. **Webhook** → **Edit**
3. **Callback URL:** `https://reach.yourdomain.com/api/webhooks/whatsapp`
4. **Verify token:** same as `META_WEBHOOK_VERIFY_TOKEN` in `.env.production`
5. Click **Verify and save**
6. Subscribe to **messages** and **message_template_status_update**

---

## Part G — First login

**Option 1 — Sign up:** https://reach.yourdomain.com/signup

**Option 2 — Seed admin** (if you ran seed):

- Email: `sales@arenarama.local`
- Password: `ChangeMe!2026`

Then complete **WhatsApp Setup** in the app.

---

## Quick reference

| Item | Value |
|------|--------|
| App URL | `https://reach.yourdomain.com` |
| Health check | `https://reach.yourdomain.com/api/health` |
| Status | `https://reach.yourdomain.com/api/status` |
| Code on server | `/opt/reach` |
| Env file | `/opt/reach/.env.production` |
| Update app | `cd /opt/reach && git pull && bash deploy/scripts/deploy-docker.sh` |
| View logs | `docker compose -f deploy/docker-compose.prod.yml --env-file .env.production logs -f api` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| SSH "Permission denied" | Add SSH key in DO → Droplet → **Access** → **Reset root password** or add key |
| `database: false` in health | Postgres **Trusted sources** must include Droplet IP |
| Caddy won't get certificate | DNS must point to Droplet; port 80 open (`ufw allow 80`) |
| Login cookie doesn't stick | `CLIENT_ORIGIN` must match exact URL including `https://` |
| Build killed / out of memory | `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Port 80 in use | Use `HTTP_PORT=8080` for Docker; Caddy uses 80/443 |

---

## Costs checklist

| Resource | ~Monthly |
|----------|----------|
| Droplet 2 GB | $12 |
| Managed Postgres 1 GB | $15 |
| **Total** | **~$27** |

No charge for Redis (runs in Docker on the Droplet).
