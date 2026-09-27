// The secret check every save runs on what is about to be committed (spec 036, persistence-and-registries.md). Pure: the caller passes file texts.
// It errs on the side of stopping a save: a false alarm costs a moment, a leaked key costs an incident. Patterns are for credentials that grant access,
// not for anything that merely looks random.

export interface SecretFinding {
  readonly path: string
  readonly line: number
  readonly kind: string
}

const PATTERNS: ReadonlyArray<{ readonly kind: string, readonly pattern: RegExp }> = [
  { kind: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/u },
  { kind: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u },
  { kind: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/u },
  { kind: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/u },
  { kind: 'OpenAI-style API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/u },
  { kind: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/u },
  { kind: 'Slack token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/u },
  { kind: 'Stripe secret key', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/u },
  { kind: 'assigned secret', pattern: /\b(?:api[_-]?key|secret|token|password|passwd)\b["']?\s*[:=]\s*["'][^"'\s]{16,}["']/iu },
]

/** Files never committed whatever their content: environment files and key material. */
const SECRET_FILES = /(?:^|\/)(?:\.env(?:\.[^/]*)?|[^/]*\.pem|[^/]*\.key|id_(?:rsa|ed25519|ecdsa)|credentials\.json)$/u

export function findSecrets(files: ReadonlyArray<{ readonly path: string, readonly text: string }>): SecretFinding[] {
  const findings: SecretFinding[] = []
  for (const file of files) {
    if (SECRET_FILES.test(file.path) && !file.path.endsWith('.env.example')) { findings.push({ path: file.path, line: 0, kind: 'a secrets file' }); continue }
    file.text.split('\n').forEach((line, index) => {
      for (const { kind, pattern } of PATTERNS) if (pattern.test(line)) findings.push({ path: file.path, line: index + 1, kind })
    })
  }
  return findings
}
