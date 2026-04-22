#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  NanoOrch — Docker Secrets Setup Helper
#
#  Creates all required secret files in the secrets/ directory.
#  Run this script once before starting with docker-compose.secrets.yml.
#
#  Usage:
#    chmod +x secrets/create-secrets.sh
#    ./secrets/create-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
SECRETS_DIR="$(cd "$(dirname "$0")" && pwd)"

# Postgres connection config — must match the postgres service in docker-compose.secrets.yml
POSTGRES_USER="nanoorch"
POSTGRES_DB="nanoorch"
POSTGRES_HOST="postgres"
POSTGRES_PORT="5432"

info()  { echo "  [+] $*"; }
warn()  { echo "  [!] $*"; }
prompt(){ read -rp "  > $1: " "$2"; }

echo ""
echo "NanoOrch Docker Secrets Setup"
echo "==============================="
echo "Secret files will be created in: $SECRETS_DIR/"
echo ""

# ── session_secret ────────────────────────────────────────────────────────────
if [[ -f "$SECRETS_DIR/session_secret.txt" ]]; then
  warn "session_secret.txt already exists — skipping (delete it to regenerate)"
else
  printf '%s' "$(openssl rand -hex 32)" > "$SECRETS_DIR/session_secret.txt"
  info "Generated session_secret.txt"
fi

# ── encryption_key ────────────────────────────────────────────────────────────
if [[ -f "$SECRETS_DIR/encryption_key.txt" ]]; then
  warn "encryption_key.txt already exists — skipping"
else
  printf '%s' "$(openssl rand -hex 32)" > "$SECRETS_DIR/encryption_key.txt"
  info "Generated encryption_key.txt"
fi

# ── postgres_password ─────────────────────────────────────────────────────────
# This is the PostgreSQL database password — separate from the NanoOrch admin
# UI password.  It is auto-generated and never needs to be typed by the user.
if [[ -f "$SECRETS_DIR/postgres_password.txt" ]]; then
  warn "postgres_password.txt already exists — skipping"
  POSTGRES_PASS=$(cat "$SECRETS_DIR/postgres_password.txt")
else
  POSTGRES_PASS=$(openssl rand -hex 24)
  printf '%s' "$POSTGRES_PASS" > "$SECRETS_DIR/postgres_password.txt"
  info "Generated postgres_password.txt (random — you never need to type this)"
fi

# ── database_url ──────────────────────────────────────────────────────────────
# Constructed automatically from the postgres credentials above.
# Never entered manually — eliminates the risk of typos or trailing spaces.
if [[ -f "$SECRETS_DIR/database_url.txt" ]]; then
  warn "database_url.txt already exists — skipping"
else
  DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASS}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
  printf '%s' "$DATABASE_URL" > "$SECRETS_DIR/database_url.txt"
  info "Generated database_url.txt (constructed from postgres credentials)"
fi

# ── admin_password ────────────────────────────────────────────────────────────
# This is the NanoOrch web UI admin password — separate from the postgres password.
if [[ -f "$SECRETS_DIR/admin_password.txt" ]]; then
  warn "admin_password.txt already exists — skipping"
else
  echo ""
  prompt "Enter NanoOrch admin UI password (or press Enter to auto-generate)" ADMIN_PASS
  if [[ -z "$ADMIN_PASS" ]]; then
    ADMIN_PASS=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9!@#$%' | head -c 20)
    echo ""
    echo "  → Auto-generated admin password: $ADMIN_PASS"
    echo "  → SAVE THIS — it will only be shown once."
    echo ""
  fi
  printf '%s' "$ADMIN_PASS" > "$SECRETS_DIR/admin_password.txt"
  info "Created admin_password.txt"
fi

# ── k3s_token ─────────────────────────────────────────────────────────────────
# Used by the K3s server to authenticate cluster nodes.
# Only needed when running with docker-compose.k3s.yml.
# Never exposed as an environment variable — read from the secret file at runtime.
if [[ -f "$SECRETS_DIR/k3s_token.txt" ]]; then
  warn "k3s_token.txt already exists — skipping"
else
  printf '%s' "$(openssl rand -hex 32)" > "$SECRETS_DIR/k3s_token.txt"
  info "Generated k3s_token.txt"
fi

# ── AI provider keys ──────────────────────────────────────────────────────────
echo ""
echo "  AI provider API keys (press Enter to skip a provider)"

for PROVIDER in openai anthropic gemini; do
  FILE="$SECRETS_DIR/${PROVIDER}_api_key.txt"
  if [[ -f "$FILE" ]]; then
    warn "${PROVIDER}_api_key.txt already exists — skipping"
  else
    prompt "${PROVIDER} API key (blank to skip)" API_KEY
    printf '%s' "${API_KEY:-}" > "$FILE"
    if [[ -z "${API_KEY:-}" ]]; then
      info "Created ${PROVIDER}_api_key.txt (empty — provider disabled)"
    else
      info "Created ${PROVIDER}_api_key.txt"
    fi
  fi
done

# ── Permissions ───────────────────────────────────────────────────────────────
chmod 400 "$SECRETS_DIR"/*.txt 2>/dev/null || true
info "Set permissions to 0400 on all *.txt files"

echo ""
echo "Done! Start NanoOrch with Docker secrets:"
echo ""
echo "  docker compose -f docker-compose.secrets.yml up -d"
echo ""
echo "Files created:"
ls -la "$SECRETS_DIR"/*.txt 2>/dev/null | awk '{print "  " $NF " (" $5 " bytes)"}'
echo ""
