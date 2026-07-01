/**
 * @deprecated This script targeted the old boxyhq/mock-saml container and is no longer used.
 * SAML SSO is now configured via the Keycloak Admin UI + SkillSpell Admin UI.
 * See docs/dev-saml.md for the current setup guide.
 *
 * Dev seed script — provisions a MockSAML SAML config into the local database.
 *
 * Idempotent: if SAML config is already seeded (GET /api/auth/sso-status returns
 * samlConfigured: true), exits cleanly with a message.
 *
 * Prerequisites:
 *   1. Backend is running: npm run backend:dev (or docker compose --profile app up)
 *   2. First-run setup has been completed (an admin account must exist)
 *   3. Key pair generated: bash scripts/generate-mock-saml-keys.sh
 *   4. Mock IdP running: npm run saml:up
 *
 * Environment variables:
 *   ADMIN_TOKEN          — Required. Personal Access Token for an admin/owner account.
 *                          Create one at: http://localhost:3000/settings/tokens
 *   MOCK_SAML_TEST_USERS — Optional. Comma-separated list of test user emails to log
 *                          after seeding (informational only — mock-saml accepts any
 *                          @example.com email without pre-registration).
 *                          Default: "user@example.com"
 *                          Example: "user@example.com,admin@myco.com"
 *   BACKEND_URL          — Optional. Default: http://localhost:3000
 *   MOCK_SAML_PORT       — Optional. Default: 4000
 *   APP_PUBLIC_URL       — Optional. Default: http://localhost:3000
 *
 * Usage:
 *   ADMIN_TOKEN=<your-pat> npm run saml:seed
 *   ADMIN_TOKEN=<your-pat> MOCK_SAML_TEST_USERS="user@example.com,admin@myco.com" npm run saml:seed
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../packages/backend/.env') });

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Configuration ────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const MOCK_SAML_PORT = process.env.MOCK_SAML_PORT ?? '4000';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';

// Comma-separated list of test users. Used only for informational logging after seed.
// mock-saml accepts any @example.com or @example.org email — users do not need
// pre-registration. autoProvision: true in the SAML config creates them on first login.
const TEST_USERS: string[] = (process.env.MOCK_SAML_TEST_USERS ?? 'user@example.com')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);

// ─── Certificate Loading ──────────────────────────────────────────────────────

function loadIdpCertificate(): string {
  const certPath = resolve(__dirname, '../docker/saml/mock-saml.crt');

  if (!existsSync(certPath)) {
    console.error(
      'Error: docker/saml/mock-saml.crt not found.\n' +
      'Generate the key pair first: bash scripts/generate-mock-saml-keys.sh',
    );
    process.exit(1);
  }

  const pem = readFileSync(certPath, 'utf-8');
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s/g, '');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!ADMIN_TOKEN) {
    console.error(
      'Error: ADMIN_TOKEN environment variable is required.\n' +
      'Usage: ADMIN_TOKEN=<your-pat> npm run saml:seed\n' +
      'Create a PAT at: http://localhost:3000/settings/tokens',
    );
    process.exit(1);
  }

  // ── Idempotency check ───────────────────────────────────────────────────────
  const statusRes = await fetch(`${BACKEND_URL}/api/auth/sso-status`);
  if (statusRes.ok) {
    const status = await statusRes.json() as { samlConfigured?: boolean };
    if (status.samlConfigured) {
      console.log('SAML config already seeded — skipping.');
      console.log(`  Backend: ${BACKEND_URL}`);
      console.log('  To re-seed, first remove the config via the admin UI or API.');
      return;
    }
  }

  // ── Build SAML config payload ───────────────────────────────────────────────
  const idpCertificate = loadIdpCertificate();

  const samlConfig = {
    id: 'mock-saml-dev',
    displayName: 'MockSAML (Local Dev)',
    idpEntityId: 'https://saml.example.com/entityid',
    idpSsoUrl: `http://localhost:${MOCK_SAML_PORT}/api/saml/sso`,
    idpCertificate,
    spEntityId: APP_PUBLIC_URL,
    attributeMapping: {
      email: 'email',
      firstName: 'firstName',
      lastName: 'lastName',
    },
    autoProvision: true,
    defaultRole: 'user' as const,
  };

  // ── PUT SAML config via admin API ───────────────────────────────────────────
  const response = await fetch(`${BACKEND_URL}/api/admin/organization/sso`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify(samlConfig),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Seed failed: HTTP ${response.status} — ${body}`);
  }

  const result = await response.json() as { acsUrl?: string };
  console.log('SAML config seeded successfully!');
  console.log(`  IdP Entity ID: ${samlConfig.idpEntityId}`);
  console.log(`  IdP SSO URL:   ${samlConfig.idpSsoUrl}`);
  console.log(`  SP Entity ID:  ${samlConfig.spEntityId}`);
  console.log(`  ACS URL:       ${result.acsUrl ?? '(check backend logs)'}`);
  console.log(`  Auto-provision: ${samlConfig.autoProvision} (users created on first login)`);
  console.log('');
  console.log('Test users (mock-saml accepts any @example.com email — no pre-registration needed):');
  for (const email of TEST_USERS) {
    console.log(`  • ${email}  (any password)`);
  }
  console.log('');
  console.log('Next: skillspell login --sso   (or sign in via browser)');
  console.log('To test other users, set MOCK_SAML_TEST_USERS=user@example.com,admin@myco.com');
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
