# NanoOrch — Docker Secrets

This directory holds **plain-text secret files** consumed by `docker-compose.secrets.yml`.
Each file contains exactly one value (no newlines, no extra whitespace).

Docker mounts them read-only at `/run/secrets/<name>` inside the container.
The app reads them via `<NAME>_FILE` environment variables — the real values
**never appear** in `docker inspect Env` output.

## Quick setup

Run the interactive helper script (it generates cryptographically random values
for `session_secret` and `encryption_key` automatically):

```bash
./secrets/create-secrets.sh
```

Then start with Docker secrets:

```bash
docker compose -f docker-compose.secrets.yml up -d
```

## Files required

| File | Purpose |
|---|---|
| `session_secret.txt` | Express session signing key (min 32 random chars) |
| `admin_password.txt` | Initial admin account password (first-boot only) |
| `encryption_key.txt` | AES-256-GCM key for cloud credentials (32-byte hex) |
| `database_url.txt` | Full PostgreSQL connection URL |
| `openai_api_key.txt` | OpenAI API key (leave blank if not using OpenAI) |
| `anthropic_api_key.txt` | Anthropic API key (leave blank if not using Anthropic) |
| `gemini_api_key.txt` | Google Gemini API key (leave blank if not using Gemini) |

## Security recommendations

- Set file permissions to `0400` (owner read-only):  
  `chmod 400 secrets/*.txt`
- Add the entire `secrets/` directory to `.gitignore` — it already is.
- On a production host, consider using a secrets manager  
  (AWS Secrets Manager, HashiCorp Vault, etc.) to write these files  
  at deploy time rather than storing them on disk.
- Rotate `session_secret` and `encryption_key` on a schedule.  
  Rotating `session_secret` invalidates all existing browser sessions.

## Manual creation example

```bash
# Generate a session secret
openssl rand -hex 32 > secrets/session_secret.txt

# Generate an encryption key
openssl rand -hex 32 > secrets/encryption_key.txt

# Set your admin password
echo -n "YourStrongPassword123!" > secrets/admin_password.txt

# Set the database URL
echo -n "postgres://nanoorch:dbpassword@postgres:5432/nanoorch" > secrets/database_url.txt

# API keys (leave file empty/blank if provider not used)
echo -n "sk-..." > secrets/openai_api_key.txt
echo -n "" > secrets/anthropic_api_key.txt
echo -n "" > secrets/gemini_api_key.txt

# Lock down permissions
chmod 400 secrets/*.txt
```
