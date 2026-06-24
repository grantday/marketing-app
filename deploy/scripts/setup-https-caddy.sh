#!/usr/bin/env bash
# Install Caddy and configure HTTPS for Reach on DigitalOcean
# Usage: sudo bash setup-https-caddy.sh reach.yourdomain.com
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash setup-https-caddy.sh reach.yourdomain.com"
  exit 1
fi

echo "==> Installing Caddy..."
apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy

echo "==> Writing Caddyfile for $DOMAIN..."
cat > /etc/caddy/Caddyfile << EOF
${DOMAIN} {
    reverse_proxy localhost:8080
}
EOF

echo "==> Ensuring firewall allows HTTP/HTTPS..."
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true

echo "==> Starting Caddy..."
systemctl enable caddy
systemctl reload caddy

echo ""
echo "HTTPS setup complete for https://${DOMAIN}"
echo "Ensure Reach Docker uses HTTP_PORT=8080 in .env.production"
echo "Test: curl https://${DOMAIN}/api/health"
