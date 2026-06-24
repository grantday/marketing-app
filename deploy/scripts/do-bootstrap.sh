#!/usr/bin/env bash
# DigitalOcean Droplet bootstrap — Ubuntu 22.04/24.04
# Run as root: curl -fsSL .../do-bootstrap.sh | bash
set -euo pipefail

echo "==> Updating system..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Installing git, curl, ufw..."
apt-get install -y -qq git curl ca-certificates ufw

echo "==> Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
systemctl start docker

echo "==> Configuring firewall (SSH + HTTP + HTTPS)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable || true

echo "==> Creating /opt/reach..."
mkdir -p /opt/reach

echo ""
echo "Bootstrap complete."
echo ""
echo "Next steps:"
echo "  cd /opt && git clone https://github.com/grantday/marketing-app.git reach"
echo "  cd reach && cp deploy/env.production.example .env.production"
echo "  nano .env.production   # set DATABASE_URL from DO Managed Postgres"
echo "  bash deploy/scripts/deploy-docker.sh"
echo ""
echo "Full guide: https://github.com/grantday/marketing-app/blob/main/deploy/DIGITALOCEAN.md"
