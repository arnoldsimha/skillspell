/**
 * Performance and ReDoS safety tests for secretScanner.
 *
 * Each test asserts that scanning completes within a time budget.
 * Adversarial inputs are crafted to trigger worst-case backtracking
 * for patterns that use unbounded quantifiers or alternations.
 *
 * Budget: 100ms per 100KB scan (conservative — real scans are < 5ms).
 * If any test exceeds its budget the pattern is likely ReDoS-vulnerable.
 */

import { describe, it, expect } from 'vitest';
import { detectSecrets } from '../src/utils/secretScanner.js';
import type { ZipParsedSkill } from '../src/utils/zipParser.js';

const BUDGET_MS = 100;

const makeSkill = (overrides: Partial<ZipParsedSkill>): ZipParsedSkill => ({
  name: 'perf-test',
  description: '',
  skillContent: '',
  scripts: [],
  references: [],
  assets: [],
  ...overrides,
});

/* ─── Throughput ──────────────────────────────────────────────────────── */

describe('Throughput — clean content', () => {
  it('scans 100KB of prose text with no secrets in < 100ms', () => {
    const content = 'The quick brown fox jumps over the lazy dog. '.repeat(2500);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('scans 100KB spread across all content areas in < 100ms', () => {
    const chunk = 'x'.repeat(25_000);
    const skill = makeSkill({
      skillContent: chunk,
      scripts:    [{ name: 'a.sh', content: chunk }],
      references: [{ name: 'b.md', content: chunk }],
      assets:     [{ name: 'c.txt', content: chunk }],
    });
    const start = performance.now();
    detectSecrets(skill);
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('returns findings and finishes in < 200ms for a 100KB skill with real secrets', () => {
    const filler = 'word '.repeat(5_000);
    const skill = makeSkill({
      skillContent: filler + 'AKIAI44QH8DHBEXK3ACG' + filler,
      scripts:      [{ name: 's.sh', content: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }],
      references:   [{ name: 'r.md', content: 'api_key=abcdef1234567890abcd' }],
    });
    const start = performance.now();
    const findings = detectSecrets(skill);
    expect(performance.now() - start).toBeLessThan(200);
    expect(findings.length).toBeGreaterThan(0);
  });
});

/* ─── ReDoS — adversarial near-matches ───────────────────────────────── */

describe('ReDoS safety — adversarial inputs', () => {
  it('AWS prefix flood (AKIA + non-matching suffix) in < 100ms', () => {
    // AKIA requires exactly 16 uppercase alphanum chars — these are 10 chars, no match
    const content = ('AKIA' + 'a'.repeat(10) + ' ').repeat(5_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('JWT prefix flood (ey... without second segment) in < 100ms', () => {
    // JWT needs ey...\.ey...\ — strings with ey prefix but no dot never complete
    const content = ('ey' + 'a'.repeat(80) + ' ').repeat(1_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('OpenAI sk- prefix flood (no T3BlbkFJ anchor) in < 100ms', () => {
    // sk- without the required T3BlbkFJ literal — engine must reject at fixed anchor
    const content = ('sk-' + 'a'.repeat(100) + ' ').repeat(1_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('Anthropic sk-ant- flood (no api03- and short) in < 100ms', () => {
    const content = ('sk-ant-' + 'a'.repeat(15) + ' ').repeat(2_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('Generic secret assignment flood (value just under 16-char minimum) in < 100ms', () => {
    // api_key= followed by 15 chars — just below the {16,} threshold, must reject cleanly
    const content = ('api_key=' + 'a'.repeat(15) + '\n').repeat(5_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('Generic secret assignment with long non-secret values in < 100ms', () => {
    // api_key= followed by 10K chars — engine greedily captures, no backtrack
    const content = 'api_key=' + 'a'.repeat(10_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('Slack xoxb- flood (incomplete token) in < 100ms', () => {
    const content = ('xoxb-12345678901-12345678901-' + 'a'.repeat(5) + ' ').repeat(2_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('PEM-like header flood (no matching PRIVATE KEY header) in < 100ms', () => {
    const content = ('-----BEGIN ' + 'a'.repeat(20) + '-----\n').repeat(2_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('GitHub PAT flood (ghp_ + wrong length) in < 100ms', () => {
    // ghp_ requires exactly 36 alphanum — these are 10 chars, no match
    const content = ('ghp_' + 'a'.repeat(10) + ' ').repeat(5_000);
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });

  it('Mixed adversarial — 10 different near-miss patterns in 100KB in < 100ms', () => {
    const lines = [
      'AKIA' + 'x'.repeat(8),           // AWS too short
      'ghp_' + 'x'.repeat(10),           // GitHub PAT too short
      'sk-ant-' + 'x'.repeat(10),        // Anthropic too short
      'sk-' + 'x'.repeat(20),            // OpenAI no anchor
      'ey' + 'x'.repeat(30),             // JWT no dot
      'xoxb-123-456-' + 'x'.repeat(3),   // Slack too short
      'api_key=' + 'x'.repeat(15),       // Assignment too short
      'glpat-' + 'x'.repeat(5),          // GitLab too short
      'npm_' + 'x'.repeat(10),           // npm too short
      'shpat_' + 'x'.repeat(10),         // Shopify too short
    ].join(' ');
    const content = (lines + '\n').repeat(500); // ~100KB
    const start = performance.now();
    detectSecrets(makeSkill({ skillContent: content }));
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });
});
