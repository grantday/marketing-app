#!/usr/bin/env bash
# Generate production secrets for Reach
set -euo pipefail

echo "JWT_SECRET=$(openssl rand -base64 48)"
echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)"
echo "META_WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 16)"
