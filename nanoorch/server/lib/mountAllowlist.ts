const BLOCKED_PATTERNS = [
  ".aws", ".azure", ".gcloud", ".gcp", ".kube", ".docker",
  ".ssh", ".gnupg", ".gpg", "credentials", ".env", ".netrc",
  ".npmrc", ".pypirc", "private_key", ".secret", "id_rsa",
  "id_ed25519", "id_ecdsa", ".htpasswd", "token", "secret",
];

export function validateMount(path: string): boolean {
  const lower = path.toLowerCase();
  return !BLOCKED_PATTERNS.some((pattern) => lower.includes(pattern));
}

const SENSITIVE_FIELD_PATTERNS = [
  /key/i, /secret/i, /password/i, /token/i, /credential/i,
  /auth/i, /private/i, /cert/i, /passphrase/i,
];

export function sanitizeToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pat) => pat.test(k));
    if (isSensitive && typeof v === "string") {
      sanitized[k] = v.length > 4 ? `***${v.slice(-4)}` : "***";
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}
