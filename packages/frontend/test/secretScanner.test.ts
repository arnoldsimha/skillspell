/**
 * Tests for secretScanner — client-side secret/credential detection utility.
 *
 * Tests cover SEC-01 through SEC-08 requirements:
 * SEC-01: AWS access key detection in skillContent
 * SEC-02: GitHub PAT detection in scripts[].content
 * SEC-03: Anthropic API key detection in references[].content
 * SEC-04: Private key PEM block detection in assets[].content
 * SEC-05: Additional vendor patterns (Stripe, SendGrid, Slack, JWT, Twilio)
 * SEC-06: AWS EXAMPLE-suffix keys are NOT flagged (allowlist)
 * SEC-07: Env var references ($MY_KEY, ${MY_KEY}) are NOT flagged (allowlist)
 * SEC-08: Clean skill returns empty array
 */

import { describe, it, expect } from 'vitest';
import { detectSecrets } from '../src/utils/secretScanner.js';
import type { SecretFinding } from '../src/utils/secretScanner.js';
import type { ZipParsedSkill } from '../src/utils/zipParser.js';

/* ─── Helpers ────────────────────────────────────────────────────────── */

const baseSkill: ZipParsedSkill = {
  name: 'test-skill',
  description: 'A test skill',
  skillContent: '',
  scripts: [],
  references: [],
  assets: [],
};

function makeSkill(overrides: Partial<ZipParsedSkill>): ZipParsedSkill {
  return { ...baseSkill, ...overrides };
}

/* ─── SEC-01: AWS Access Key in skillContent ─────────────────────────── */

describe('SEC-01: AWS Access Key detection', () => {
  it('detects AWS access key (AKIA prefix) in skillContent', () => {
    // Valid AWS key: AKIA prefix + 16 uppercase alphanumerics (not ending in EXAMPLE)
    const skill = makeSkill({ skillContent: 'key=AKIAI44QH8DHBEXK3ACG' });
    const findings = detectSecrets(skill);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f: SecretFinding) => f.patternName === 'AWS Access Key')).toBe(true);
  });

  it('returns finding with correct fileName for skillContent', () => {
    const skill = makeSkill({ skillContent: 'AWS_ACCESS_KEY_ID=AKIAI44QH8DHBEXK3ACG' });
    const findings = detectSecrets(skill);
    const awsFinding = findings.find((f: SecretFinding) => f.patternName === 'AWS Access Key');
    expect(awsFinding).toBeDefined();
    expect(awsFinding!.fileName).toBe('SKILL.md');
  });

  it('returns redacted value with correct format for long keys', () => {
    const skill = makeSkill({ skillContent: 'key=AKIAI44QH8DHBEXK3ACG' });
    const findings = detectSecrets(skill);
    const awsFinding = findings.find((f: SecretFinding) => f.patternName === 'AWS Access Key');
    expect(awsFinding).toBeDefined();
    // redacted: first 4 chars + **** + last 4 chars
    expect(awsFinding!.redactedValue).toMatch(/^.{4}\*{4}.{4}$/);
  });
});

/* ─── SEC-02: GitHub PAT in scripts[].content ────────────────────────── */

describe('SEC-02: GitHub PAT detection in scripts', () => {
  it('detects GitHub PAT (classic) in scripts[0].content', () => {
    const pat = 'ghp_' + 'abcdef0123456789ABCDEF0123456789abcd'; // 4 + 36 chars
    const skill = makeSkill({
      scripts: [{ name: 'deploy.sh', content: `TOKEN=${pat}` }],
    });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'GitHub PAT (classic)')).toBe(true);
  });

  it('returns correct fileName for findings in scripts', () => {
    const pat = 'ghp_' + 'abcdef0123456789ABCDEF0123456789abcd';
    const skill = makeSkill({
      scripts: [{ name: 'deploy.sh', content: `TOKEN=${pat}` }],
    });
    const findings = detectSecrets(skill);
    const ghFinding = findings.find((f: SecretFinding) => f.patternName === 'GitHub PAT (classic)');
    expect(ghFinding).toBeDefined();
    expect(ghFinding!.fileName).toBe('scripts/deploy.sh');
  });
});

/* ─── SEC-03: Anthropic API Key in references[].content ─────────────── */

describe('SEC-03: Anthropic API Key detection in references', () => {
  it('detects Anthropic API key in references[0].content', () => {
    // sk-ant-api03- + 93 word chars + AA (total body = 95 chars)
    const key = 'sk-ant-api03-' + 'A'.repeat(93) + 'AA';
    const skill = makeSkill({
      references: [{ name: 'config.md', content: `ANTHROPIC_KEY=${key}` }],
    });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'Anthropic API Key')).toBe(true);
  });

  it('returns correct fileName for findings in references', () => {
    const key = 'sk-ant-api03-' + 'A'.repeat(93) + 'AA';
    const skill = makeSkill({
      references: [{ name: 'config.md', content: `ANTHROPIC_KEY=${key}` }],
    });
    const findings = detectSecrets(skill);
    const antFinding = findings.find((f: SecretFinding) => f.patternName === 'Anthropic API Key');
    expect(antFinding).toBeDefined();
    expect(antFinding!.fileName).toBe('references/config.md');
  });
});

/* ─── SEC-04: Private Key PEM Block in assets[].content ─────────────── */

describe('SEC-04: Private Key PEM block detection in assets', () => {
  it('detects RSA private key PEM block in assets[0].content', () => {
    const skill = makeSkill({
      assets: [{ name: 'key.pem', content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK...\n-----END RSA PRIVATE KEY-----' }],
    });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'Private Key')).toBe(true);
  });

  it('detects generic PRIVATE KEY PEM block', () => {
    const skill = makeSkill({
      assets: [{ name: 'key.pem', content: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkq...\n-----END PRIVATE KEY-----' }],
    });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'Private Key')).toBe(true);
  });

  it('returns correct fileName for findings in assets', () => {
    const skill = makeSkill({
      assets: [{ name: 'key.pem', content: '-----BEGIN RSA PRIVATE KEY-----\ndata\n-----END RSA PRIVATE KEY-----' }],
    });
    const findings = detectSecrets(skill);
    const pemFinding = findings.find((f: SecretFinding) => f.patternName === 'Private Key');
    expect(pemFinding).toBeDefined();
    expect(pemFinding!.fileName).toBe('assets/key.pem');
  });
});

/* ─── SEC-05: Additional Vendor Patterns ─────────────────────────────── */

describe('SEC-05: Additional vendor pattern detection', () => {
  it('detects Stripe secret key (sk_live_)', () => {
    // sk_live_ + 24 alphanumerics
    const key = 'sk_live_' + 'a1b2c3d4e5f6g7h8i9j0k1l2';
    const skill = makeSkill({ skillContent: `STRIPE_KEY=${key}` });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'Stripe Secret/Restricted Key')).toBe(true);
  });

  it('detects SendGrid API token (SG.)', () => {
    // SG. + 22 chars + . + 43 chars = SG. + 66 chars total
    const token = 'SG.' + 'a'.repeat(22) + '.' + 'b'.repeat(43);
    const skill = makeSkill({ skillContent: `SENDGRID_KEY=${token}` });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'SendGrid API Token')).toBe(true);
  });

  it('detects Slack bot token (xoxb-)', () => {
    // xoxb-{10-13 digits}-{10-13 digits}-{24 alphanumerics}
    const token = 'xoxb-12345678901-12345678901-' + 'a1b2c3d4e5f6g7h8i9j0k1l2';
    const skill = makeSkill({ skillContent: `SLACK_TOKEN=${token}` });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'Slack Bot Token')).toBe(true);
  });

  it('detects JWT token', () => {
    // eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.abc123def456ghi789
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.abc123def456ghi789';
    const skill = makeSkill({ skillContent: `Bearer ${token}` });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'JWT')).toBe(true);
  });

  it('detects Twilio API key (SK + 32 hex chars)', () => {
    // SK + 32 hex chars
    const key = 'SK' + 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const skill = makeSkill({ skillContent: `TWILIO_KEY=${key}` });
    const findings = detectSecrets(skill);
    expect(findings.some((f: SecretFinding) => f.patternName === 'Twilio API Key')).toBe(true);
  });
});

/* ─── SEC-06: AWS EXAMPLE-suffix Allowlist ───────────────────────────── */

describe('SEC-06: AWS EXAMPLE-suffix allowlist', () => {
  it('does NOT flag AWS EXAMPLE-suffixed key', () => {
    // The canonical AWS docs example key
    const skill = makeSkill({ skillContent: 'AKIAIOSFODNN7EXAMPLE' });
    expect(detectSecrets(skill)).toHaveLength(0);
  });

  it('does NOT flag key ending in EXAMPLE (case insensitive)', () => {
    const skill = makeSkill({ skillContent: 'AKIAI44QH8DHBEXAMPLE' });
    expect(detectSecrets(skill)).toHaveLength(0);
  });
});

/* ─── SEC-07: Env Var Reference Allowlist ────────────────────────────── */

describe('SEC-07: Env var reference allowlist', () => {
  it('does NOT flag $ANTHROPIC_API_KEY env var reference', () => {
    const skill = makeSkill({ skillContent: 'Set ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY in your environment' });
    const findings = detectSecrets(skill);
    // Should not have findings from the env var reference itself
    expect(findings.length).toBe(0);
  });

  it('does NOT flag ${OPENAI_KEY} template syntax', () => {
    const skill = makeSkill({ skillContent: 'export OPENAI_KEY=${OPENAI_KEY}' });
    expect(detectSecrets(skill)).toHaveLength(0);
  });

  it('does NOT flag $MY_KEY simple env var syntax', () => {
    const skill = makeSkill({ skillContent: 'Use $MY_KEY as the secret' });
    expect(detectSecrets(skill)).toHaveLength(0);
  });
});

/* ─── SEC-08: Clean Skill Returns Empty Array ────────────────────────── */

describe('SEC-08: Clean skill returns empty array', () => {
  it('returns empty array for skill with no secrets', () => {
    const skill = makeSkill({
      skillContent: '# My Skill\n\nThis skill helps you write better code.\n\nUse it to format files.',
      scripts: [{ name: 'helper.sh', content: '#!/bin/bash\necho "Hello, World!"' }],
      references: [{ name: 'docs.md', content: '# Documentation\n\nSee the README for details.' }],
      assets: [{ name: 'icon.png', content: 'PNG binary data placeholder' }],
    });
    expect(detectSecrets(skill)).toEqual([]);
  });

  it('returns empty array for completely empty skill', () => {
    expect(detectSecrets(baseSkill)).toEqual([]);
  });

  it('returns empty array for skill with only whitespace content', () => {
    const skill = makeSkill({ skillContent: '   \n\n\t\n   ' });
    expect(detectSecrets(skill)).toEqual([]);
  });
});

/* ─── Severity field ──────────────────────────────────────────────────── */

describe('SecretFinding severity field', () => {
  it('AWS key findings have severity: high', () => {
    const skill = makeSkill({ skillContent: 'AKIAI44QH8DHBEXK3ACG' });
    const findings = detectSecrets(skill);
    const awsFinding = findings.find((f: SecretFinding) => f.patternName === 'AWS Access Key');
    expect(awsFinding?.severity).toBe('high');
  });

  it('Twilio key findings have severity: medium', () => {
    const key = 'SK' + 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
    const skill = makeSkill({ skillContent: key });
    const findings = detectSecrets(skill);
    const twilioFinding = findings.find((f: SecretFinding) => f.patternName === 'Twilio API Key');
    expect(twilioFinding?.severity).toBe('medium');
  });
});

/* ─── Generic Secret Assignment (key=value) ─────────────────────────── */

describe('Generic Secret Assignment (key=value patterns)', () => {
  it('detects api_key=<value> (equals separator)', () => {
    const skill = makeSkill({ skillContent: 'api_key=abcdef1234567890abcd' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(true);
  });

  it('detects API_SECRET=<value> (uppercase key)', () => {
    const skill = makeSkill({ skillContent: 'API_SECRET=abcdef1234567890abcd' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(true);
  });

  it('detects access_token: <value> (colon separator)', () => {
    const skill = makeSkill({ skillContent: 'access_token: abcdef1234567890abcd' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(true);
  });

  it('detects client_secret="<quoted value>"', () => {
    const skill = makeSkill({ skillContent: 'client_secret="abcdef1234567890abcd"' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(true);
  });

  it('detects secret_key in scripts', () => {
    const skill = makeSkill({ scripts: [{ name: 'config.sh', content: 'export secret_key=abcdef1234567890abcd' }] });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(true);
  });

  it('does NOT flag values shorter than 16 chars', () => {
    const skill = makeSkill({ skillContent: 'api_key=abcdefghijklmno' }); // 15 chars
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(false);
  });

  it('does NOT flag ${ENV_VAR} references', () => {
    const skill = makeSkill({ skillContent: 'api_key=${MY_LONG_API_KEY_VAR}' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(false);
  });

  it('does NOT flag <placeholder> style values', () => {
    const skill = makeSkill({ skillContent: 'api_key=<your_api_key_here>' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(false);
  });

  it('does NOT flag values ending with placeholder words', () => {
    const skill = makeSkill({ skillContent: 'api_key=INSERT_YOUR_API_KEY' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(false);
  });

  it('does NOT flag EXAMPLE-suffixed values', () => {
    const skill = makeSkill({ skillContent: 'api_key=abcdef1234567890EXAMPLE' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Generic Secret Assignment')).toBe(false);
  });
});

/* ─── Untested original patterns ─────────────────────────────────────── */

describe('GitHub token variants', () => {
  it('detects GitHub OAuth Token (gho_)', () => {
    const skill = makeSkill({ skillContent: 'gho_abcdefghijklmnopqrstuvwxyz0123456789' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'GitHub OAuth Token')).toBe(true);
  });

  it('detects GitHub App/Server Token (ghu_)', () => {
    const skill = makeSkill({ skillContent: 'ghu_abcdefghijklmnopqrstuvwxyz0123456789' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'GitHub App/Server Token')).toBe(true);
  });

  it('detects GitHub App/Server Token (ghs_ variant)', () => {
    const skill = makeSkill({ skillContent: 'ghs_abcdefghijklmnopqrstuvwxyz0123456789' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'GitHub App/Server Token')).toBe(true);
  });

  it('detects GitHub Fine-Grained PAT (github_pat_)', () => {
    const token = 'github_pat_' + 'a'.repeat(82);
    const skill = makeSkill({ skillContent: token });
    expect(detectSecrets(skill).some((f) => f.patternName === 'GitHub Fine-Grained PAT')).toBe(true);
  });

  it('detects GitHub Refresh Token (ghr_)', () => {
    const skill = makeSkill({ skillContent: 'ghr_abcdefghijklmnopqrstuvwxyz0123456789' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'GitHub Refresh Token')).toBe(true);
  });
});

describe('OpenAI API Key', () => {
  it('detects OpenAI API key (sk-...T3BlbkFJ... format)', () => {
    const key = 'sk-' + 'a'.repeat(20) + 'T3BlbkFJ' + 'b'.repeat(20);
    const skill = makeSkill({ skillContent: key });
    expect(detectSecrets(skill).some((f) => f.patternName === 'OpenAI API Key')).toBe(true);
  });
});

describe('Anthropic API Key (loose)', () => {
  it('detects non-api03 Anthropic key variants (sk-ant-v1-...)', () => {
    const skill = makeSkill({ skillContent: 'sk-ant-v1-abcdefghijklmnopqrstuvwxyz' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Anthropic API Key (loose)')).toBe(true);
  });

  it('does NOT double-fire on strict api03 keys', () => {
    const key = 'sk-ant-api03-' + 'a'.repeat(93) + 'AA';
    const skill = makeSkill({ skillContent: key });
    const findings = detectSecrets(skill).filter((f) =>
      f.patternName === 'Anthropic API Key' || f.patternName === 'Anthropic API Key (loose)'
    );
    expect(findings).toHaveLength(1);
  });
});

describe('Slack token variants', () => {
  it('detects Slack User Token (xoxp-)', () => {
    const skill = makeSkill({ skillContent: 'xoxp-12345678901-12345678901-12345678901-abcdefghijklmnopqrstuvwxyz12' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Slack User Token')).toBe(true);
  });

  it('detects Slack Webhook URL', () => {
    const skill = makeSkill({ skillContent: 'hooks.slack.com/services/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Slack Webhook')).toBe(true);
  });
});

describe('Other original patterns', () => {
  it('detects Databricks token (dapi)', () => {
    const skill = makeSkill({ skillContent: 'dapi' + 'a1b2c3d4'.repeat(4) });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Databricks Token')).toBe(true);
  });

  it('detects DigitalOcean PAT (dop_v1_)', () => {
    const skill = makeSkill({ skillContent: 'dop_v1_' + 'a1b2c3d4'.repeat(8) });
    expect(detectSecrets(skill).some((f) => f.patternName === 'DigitalOcean PAT')).toBe(true);
  });

  it('detects Doppler token (dp.pt.)', () => {
    const skill = makeSkill({ skillContent: 'dp.pt.' + 'a'.repeat(43) });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Doppler Token')).toBe(true);
  });
});

/* ─── Batch 2 patterns (gitleaks gap analysis) ───────────────────────── */

describe('Batch 2: additional vendor patterns', () => {
  it('detects GitLab PAT (glpat-)', () => {
    const skill = makeSkill({ skillContent: 'glpat-abcdefghijklmnopqrst' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'GitLab PAT')).toBe(true);
  });

  it('detects npm access token (npm_)', () => {
    const skill = makeSkill({ skillContent: 'npm_abcdefghijklmnopqrstuvwxyz0123456789' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'npm Access Token')).toBe(true);
  });

  it('detects Shopify access token (shpat_)', () => {
    const skill = makeSkill({ skillContent: 'shpat_abcdef1234567890abcdef1234567890' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Shopify Access Token')).toBe(true);
  });

  it('detects Shopify custom access token (shpca_)', () => {
    const skill = makeSkill({ skillContent: 'shpca_abcdef1234567890abcdef1234567890' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Shopify Custom Access Token')).toBe(true);
  });

  it('detects Shopify private app token (shppa_)', () => {
    const skill = makeSkill({ skillContent: 'shppa_abcdef1234567890abcdef1234567890' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Shopify Private App Token')).toBe(true);
  });

  it('detects PyPI upload token (pypi-AgEI...)', () => {
    const skill = makeSkill({ skillContent: 'pypi-AgEIcHlwaS5vcmcABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwx' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'PyPI Upload Token')).toBe(true);
  });

  it('detects Pulumi API token (pul-)', () => {
    const skill = makeSkill({ skillContent: 'pul-abcdef1234567890abcdef1234567890abcdef12' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Pulumi API Token')).toBe(true);
  });

  it('detects Linear API key (lin_api_)', () => {
    const skill = makeSkill({ skillContent: 'lin_api_abcdefghijklmnopqrstuvwxyz0123456789abcd' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Linear API Key')).toBe(true);
  });

  it('detects Postman API token (PMAK-)', () => {
    const token = 'PMAK-abcdef1234567890abcdef12-abcdef1234567890abcdef1234567890ab';
    const skill = makeSkill({ skillContent: token });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Postman API Token')).toBe(true);
  });

  it('detects Sendinblue API token (xkeysib-)', () => {
    const token = 'xkeysib-' + 'a'.repeat(64) + '-' + 'b'.repeat(16);
    const skill = makeSkill({ skillContent: token });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Sendinblue API Token')).toBe(true);
  });

  it('detects Age secret key (AGE-SECRET-KEY-1)', () => {
    const token = 'AGE-SECRET-KEY-1QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7LQPZRY9X8GF2TVDW0S3JN54KHCE';
    const skill = makeSkill({ skillContent: token });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Age Secret Key')).toBe(true);
  });

  it('detects PlanetScale token (pscale_tkn_)', () => {
    const skill = makeSkill({ skillContent: 'pscale_tkn_abcdefghijklmnopqrstuvwxyz0123456789abcdefg' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'PlanetScale Token')).toBe(true);
  });

  it('detects PlanetScale password (pscale_pw_)', () => {
    const skill = makeSkill({ skillContent: 'pscale_pw_abcdefghijklmnopqrstuvwxyz0123456789abcdefg' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'PlanetScale Password')).toBe(true);
  });

  it('detects Dynatrace API token (dt0c01.)', () => {
    const token = 'dt0c01.abcdefghijklmnopqrstuvwx.' + 'abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01';
    const skill = makeSkill({ skillContent: token });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Dynatrace API Token')).toBe(true);
  });

  it('detects Frame.io API token (fio-u-)', () => {
    const skill = makeSkill({ skillContent: 'fio-u-abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Frame.io API Token')).toBe(true);
  });

  it('detects Duffel API token (duffel_test_)', () => {
    const skill = makeSkill({ skillContent: 'duffel_test_abcdefghijklmnopqrstuvwxyz0123456789abcdefg' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Duffel API Token')).toBe(true);
  });

  it('detects EasyPost API token (EZAK)', () => {
    const skill = makeSkill({ skillContent: 'EZAKabcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqr' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'EasyPost API Token')).toBe(true);
  });

  it('detects Shippo API token (shippo_live_)', () => {
    const skill = makeSkill({ skillContent: 'shippo_live_abcdef1234567890abcdef1234567890abcdef12' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Shippo API Token')).toBe(true);
  });

  it('detects RubyGems API token (rubygems_)', () => {
    const skill = makeSkill({ skillContent: 'rubygems_abcdef1234567890abcdef1234567890abcdef1234567890' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'RubyGems API Token')).toBe(true);
  });

  it('detects Clojars API token (CLOJARS_)', () => {
    const skill = makeSkill({ skillContent: 'CLOJARS_abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwx' });
    expect(detectSecrets(skill).some((f) => f.patternName === 'Clojars API Token')).toBe(true);
  });
});

/* ─── Redaction format ───────────────────────────────────────────────── */

describe('Redaction format', () => {
  it('redactedValue matches pattern /^.{4}\\*{4}.{4}$/ for long secrets', () => {
    const skill = makeSkill({ skillContent: 'AKIAI44QH8DHBEXK3ACG' });
    const findings = detectSecrets(skill);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.redactedValue).toMatch(/^.{4}\*{4}.{4}$|^\*{4}$/);
    }
  });
});
