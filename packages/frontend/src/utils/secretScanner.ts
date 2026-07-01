/**
 * secretScanner — client-side secret/credential detection utility.
 *
 * Scans all content fields of a ZipParsedSkill for known secret patterns
 * (API keys, tokens, private keys) derived from gitleaks v8.24.3.
 *
 * This is a pure, synchronous function — no network requests, no side effects.
 * Skills are max 100 KB so scanning completes in < 5 ms.
 */

import type { ZipParsedSkill } from './zipParser.js';

/* ─── Public Types ───────────────────────────────────────────────────── */

export interface SecretFinding {
  patternName: string;
  fileName: string;
  redactedValue: string;
  severity: 'high' | 'medium';
}

/* ─── Internal Types ─────────────────────────────────────────────────── */

interface SecretPattern {
  name: string;
  regex: RegExp; // MUST have 'g' flag
  severity: 'high' | 'medium';
}

/* ─── Pattern Library (derived from gitleaks v8.24.3) ───────────────── */

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key',
    regex: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16})\b/g,
    severity: 'high',
  },
  {
    name: 'GitHub PAT (classic)',
    regex: /ghp_[0-9a-zA-Z]{36}/g,
    severity: 'high',
  },
  {
    name: 'GitHub OAuth Token',
    regex: /gho_[0-9a-zA-Z]{36}/g,
    severity: 'high',
  },
  {
    name: 'GitHub App/Server Token',
    regex: /(?:ghu|ghs)_[0-9a-zA-Z]{36}/g,
    severity: 'high',
  },
  {
    name: 'GitHub Fine-Grained PAT',
    regex: /github_pat_\w{82}/g,
    severity: 'high',
  },
  {
    name: 'GitHub Refresh Token',
    regex: /ghr_[0-9a-zA-Z]{36}/g,
    severity: 'high',
  },
  {
    name: 'OpenAI API Key',
    regex: /\b(sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{74}T3BlbkFJ[A-Za-z0-9_-]{74}|sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20})\b/g,
    severity: 'high',
  },
  {
    name: 'Anthropic API Key',
    regex: /\bsk-ant-api03-[\w-]{93}AA\b/g,
    severity: 'high',
  },
  {
    name: 'Anthropic API Key (loose)',
    regex: /\bsk-ant-(?!api03-)[\w-]{20,}\b/g, // negative lookahead excludes matches already caught by strict pattern above
    severity: 'medium',
  },
  {
    name: 'Stripe Secret/Restricted Key',
    regex: /\b(?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99}\b/g,
    severity: 'high',
  },
  {
    name: 'SendGrid API Token',
    regex: /\bSG\.[a-zA-Z0-9=_\-.]{66}\b/g,
    severity: 'high',
  },
  {
    name: 'Slack Bot Token',
    regex: /xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    severity: 'high',
  },
  {
    name: 'Slack User Token',
    regex: /xox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}/g,
    severity: 'high',
  },
  {
    name: 'Slack Webhook',
    regex: /hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g,
    severity: 'high',
  },
  {
    name: 'Twilio API Key',
    regex: /\bSK[0-9a-fA-F]{32}\b/g,
    severity: 'medium',
  },
  {
    name: 'Private Key',
    regex: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/g,
    severity: 'high',
  },
  {
    name: 'JWT',
    regex: /\bey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9/\\_-]{17,}\./g,
    severity: 'medium',
  },
  {
    name: 'Databricks Token',
    regex: /\bdapi[a-f0-9]{32}\b/g,
    severity: 'high',
  },
  {
    name: 'DigitalOcean PAT',
    regex: /\bdop_v1_[a-f0-9]{64}\b/g,
    severity: 'high',
  },
  {
    name: 'Doppler Token',
    regex: /dp\.pt\.[a-zA-Z0-9]{43}/g,
    severity: 'high',
  },
  // ── Batch 2 additions from gitleaks v8 gap analysis ─────────────────
  { name: 'GitLab PAT',                   regex: /\bglpat-[0-9a-zA-Z\-_]{20}\b/g,                                       severity: 'high' },
  { name: 'npm Access Token',             regex: /\bnpm_[a-z0-9]{36}\b/g,                                                severity: 'high' },
  { name: 'Shopify Access Token',         regex: /\bshpat_[a-fA-F0-9]{32}\b/g,                                          severity: 'high' },
  { name: 'Shopify Custom Access Token',  regex: /\bshpca_[a-fA-F0-9]{32}\b/g,                                          severity: 'high' },
  { name: 'Shopify Private App Token',    regex: /\bshppa_[a-fA-F0-9]{32}\b/g,                                          severity: 'high' },
  { name: 'PyPI Upload Token',            regex: /pypi-AgEIcHlwaS5vcmc[A-Za-z0-9\-_]{50,1000}/g,                        severity: 'high' },
  { name: 'Pulumi API Token',             regex: /\bpul-[a-f0-9]{40}\b/g,                                               severity: 'high' },
  { name: 'Linear API Key',              regex: /\blin_api_[a-z0-9]{40}\b/g,                                            severity: 'high' },
  { name: 'Postman API Token',            regex: /\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b/g,                                 severity: 'high' },
  { name: 'Sendinblue API Token',         regex: /\bxkeysib-[a-f0-9]{64}-[a-z0-9]{16}\b/g,                              severity: 'high' },
  { name: 'Age Secret Key',              regex: /AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}/g,             severity: 'high' },
  { name: 'PlanetScale Token',            regex: /\bpscale_tkn_[a-z0-9=\-_.]{43}\b/g,                                   severity: 'high' },
  { name: 'PlanetScale Password',         regex: /\bpscale_pw_[a-z0-9=\-_.]{43}\b/g,                                    severity: 'high' },
  { name: 'Dynatrace API Token',          regex: /\bdt0c01\.[a-z0-9]{24}\.[a-z0-9]{64}\b/g,                             severity: 'high' },
  { name: 'Frame.io API Token',           regex: /\bfio-u-[a-z0-9\-_=]{64}\b/g,                                         severity: 'medium' },
  { name: 'Duffel API Token',             regex: /\bduffel_(?:test|live)_[a-z0-9_\-=]{43}\b/g,                          severity: 'medium' },
  { name: 'EasyPost API Token',           regex: /\bEZAK[a-z0-9]{54}\b/g,                                               severity: 'high' },
  { name: 'Shippo API Token',             regex: /\bshippo_(?:live|test)_[a-f0-9]{40}\b/g,                              severity: 'medium' },
  { name: 'RubyGems API Token',           regex: /\brubygems_[a-f0-9]{48}\b/g,                                          severity: 'high' },
  { name: 'Clojars API Token',            regex: /\bCLOJARS_[a-z0-9]{60}\b/g,                                           severity: 'medium' },
  // ── Key=value assignment patterns ───────────────────────────────────
  // Catches `api_key=<value>`, `secret_key: <value>`, etc. where the value
  // has no recognizable prefix. Minimum 16 chars filters noise; allowlist
  // suppresses env var refs, template placeholders, and common fake values.
  {
    name: 'Generic Secret Assignment',
    regex: /\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?token|client[_-]?secret)\s*[:=]\s*["']?([^\s"',;#]{16,})["']?/gi,
    severity: 'medium',
  },
];

/* ─── Allowlist ──────────────────────────────────────────────────────── */

// Patterns matched against a candidate value to suppress false positives.
// Derived from gitleaks global allowlist — these are common in documentation
// and skill instruction files.
const ALLOWLIST_PATTERNS: RegExp[] = [
  /^\$[A-Za-z_][A-Za-z0-9_]*$/, // $MY_KEY
  /^\${[A-Za-z_][A-Za-z0-9_]*}$/, // ${MY_KEY}
  /^\{\{[\s\w.|()]+\}\}$/, // {{.template}}
  /^\$\{\{[\s\w."&./=|]*\}\}$/, // ${{ secrets.KEY }}
  /^%[A-Za-z_][A-Za-z0-9_]*%$/, // %MY_KEY%
  /EXAMPLE$/i, // AWS docs (AKIAIOSFODNN7EXAMPLE)
  /PLACEHOLDER$/i, // explicit placeholders
  /REDACTED$/i, // redacted values
  /^<[^>]{2,}>$/, // <placeholder_value> template style
  /[_-](?:key|token|secret|here|value|placeholder)$/i, // ends with placeholder word (e.g. YOUR_API_KEY_HERE)
  /^(.)\1{7,}$/, // repeated-char placeholder (aaaaaaaa, XXXXXXXX)
  /YOUR[_-]?KEY[_-]?HERE$/i, // literal placeholder text
];

/* ─── Helpers ────────────────────────────────────────────────────────── */

function redact(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

function isAllowlisted(value: string): boolean {
  return ALLOWLIST_PATTERNS.some((p) => p.test(value));
}

function scanText(
  content: string,
  fileName: string,
  patterns: SecretPattern[],
  findings: SecretFinding[],
): void {
  for (const pattern of patterns) {
    // Reset before each source so the 'g' flag's stateful lastIndex doesn't skip matches.
    pattern.regex.lastIndex = 0;
    for (const match of content.matchAll(pattern.regex)) {
      const value = match[1] ?? match[0];
      if (!isAllowlisted(value)) {
        findings.push({
          patternName: pattern.name,
          fileName,
          redactedValue: redact(value),
          severity: pattern.severity,
        });
      }
    }
  }
}

/* ─── Public API ─────────────────────────────────────────────────────── */

/**
 * Scan all content fields of a ZipParsedSkill for known secret patterns.
 *
 * Returns an array of SecretFinding objects — one per detected match that
 * is not suppressed by the allowlist. Returns [] if no secrets are found.
 *
 * This function is synchronous and pure. It does not mutate the input.
 */
export function detectSecrets(skill: ZipParsedSkill): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const sources: Array<{ name: string; content: string }> = [
    { name: 'SKILL.md', content: skill.skillContent },
    ...skill.scripts.map((f) => ({ name: `scripts/${f.name}`, content: f.content })),
    ...skill.references.map((f) => ({ name: `references/${f.name}`, content: f.content })),
    ...skill.assets.map((f) => ({ name: `assets/${f.name}`, content: f.content })),
  ];
  for (const { name, content } of sources) {
    scanText(content, name, SECRET_PATTERNS, findings);
  }
  return findings;
}
