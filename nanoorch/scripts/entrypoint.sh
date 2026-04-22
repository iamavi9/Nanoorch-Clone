#!/bin/sh
set -e

# Load Docker secrets into environment variables if *_FILE vars are set
load_secret() {
  var_name="$1"
  file_var="${var_name}_FILE"
  eval file_path=\$$file_var
  if [ -n "$file_path" ] && [ -f "$file_path" ]; then
    val=$(cat "$file_path")
    export "$var_name=$val"
  fi
}

load_secret ENCRYPTION_KEY
load_secret AI_INTEGRATIONS_OPENAI_API_KEY
load_secret AI_INTEGRATIONS_ANTHROPIC_API_KEY
load_secret AI_INTEGRATIONS_GEMINI_API_KEY

echo "[NanoOrch] Running database migrations..."
node /app/dist/migrate.cjs

echo "[NanoOrch] Starting server..."
exec node /app/dist/index.cjs
