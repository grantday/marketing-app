# FastComet / cPanel — first deployment checklist

## Why "Last Deployed: Not available"

Deployment has **never completed**. Pushing to GitHub does **not** auto-deploy to cPanel. You must deploy inside cPanel.

## Step-by-step (do in order)

### 1. Clone or refresh the repo

cPanel → **Files** → **Git Version Control**

- If no repo: **Create** → Clone URL: `https://github.com/grantday/marketing-app.git` → Branch: `main`
- If repo exists: **Manage** → **Update from Remote** → wait for success

### 2. Deploy

Still in **Manage** for the repository:

1. Click **Deploy HEAD Commit** (or **Deploy** tab → Deploy)
2. Wait 2–5 minutes (npm install + build is slow on shared hosting)
3. Open **Deployment Log** — must show tasks finishing without errors

If you see errors, copy the log and fix (often: Node/npm not in PATH — contact FastComet support to enable Node 20).

### 3. Setup Node.js application

cPanel → **Software** → **Setup Node.js App** (or **Application Manager**)

| Field | Value |
|-------|--------|
| Node.js version | 20.x |
| Application mode | Production |
| Application root | Your clone path, e.g. `repositories/marketing-app/apps/api` |
| Application URL | Your subdomain (create subdomain first if needed) |
| Application startup file | `dist/index.js` |

Click **Create** → **Run NPM Install** (if shown) → **Restart**.

### 4. Environment variables

In the Node.js app settings, add:

```
NODE_ENV=production
DATABASE_URL=postgresql://...   (from Neon or Supabase)
REDIS_URL=rediss://...          (from Upstash)
JWT_SECRET=<32+ random chars>
TOKEN_ENCRYPTION_KEY=<32 chars>
CLIENT_ORIGIN=https://your-subdomain.yourdomain.com
```

Generate secrets locally: `bash deploy/scripts/generate-secrets.sh`

### 5. Database schema

cPanel **Terminal**:

```bash
cd ~/repositories/marketing-app/apps/api
npx prisma db push
```

(Use your actual clone path.)

### 6. Verify

- `https://your-subdomain.yourdomain.com/api/health` → JSON with `"ok": true`
- App UI loads at the same URL (may need proxy rules — see below)

## Serving the React frontend

The Node app serves API only by default. Options:

1. **Subdomain for API** (`api.yourdomain.com`) + main domain static — advanced
2. Set `SERVE_WEB=true` in env and ensure `apps/web/dist` exists after `npm run build` (API serves UI)
3. Ask FastComet to confirm Node app can serve both (single subdomain)

## Still failing?

1. **Deployment Log** empty → `.cpanel.yml` missing on server → **Update from Remote** again
2. **Uncommitted changes** → **Update from Remote** or delete repo and re-clone
3. **npm not found** → Enable Node.js 20 in cPanel; open ticket with FastComet
4. **Build timeout** → Run manually in Terminal: `cd ~/repositories/marketing-app && npm install && npm run build`

## Repo link

https://github.com/grantday/marketing-app
