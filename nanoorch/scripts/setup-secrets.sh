#!/bin/bash
set -e

SECRETS_DIR="./secrets"

echo ""
echo "NanoOrch — Docker Secrets Setup"
echo "================================"
echo ""

mkdir -p "$SECRETS_DIR"

generate_key() {
  openssl rand -base64 48 2>/dev/null | tr -d '\n' || \
    head -c 48 /dev/urandom | base64 | tr -d '\n'
}

if [ ! -f "$SECRETS_DIR/encryption_key.txt" ]; then
  echo "Generating encryption key (auto)..."
  generate_key > "$SECRETS_DIR/encryption_key.txt"
  echo "  Created: secrets/encryption_key.txt"
else
  echo "  Exists:  secrets/encryption_key.txt"
fi

for provider in openai anthropic gemini; do
  file="$SECRETS_DIR/${provider}_api_key.txt"
  if [ ! -f "$file" ]; then
    printf "  %s API key (leave blank to skip): " "$provider"
    read -r api_key
    printf "%s" "${api_key:-}" > "$file"
    if [ -n "$api_key" ]; then
      echo "  Created: secrets/${provider}_api_key.txt"
    else
      echo "  Skipped: secrets/${provider}_api_key.txt (fill in later)"
    fi
  else
    echo "  Exists:  secrets/${provider}_api_key.txt"
  fi
done

chmod 600 "$SECRETS_DIR"/*.txt 2>/dev/null || true

echo ""
echo "Secrets written to $SECRETS_DIR/"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env"
echo "  2. Set ADMIN_PASSWORD, SESSION_SECRET, and POSTGRES_PASSWORD in .env"
echo "  3. docker compose up -d"
echo "  4. Open http://localhost:3000 and log in with your admin credentials"
echo ""
