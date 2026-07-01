/**
 * B4 — Claim Extraction Tests
 *
 * Tests the validateClaims() logic and parseGraderResponse() integration
 * with the new claims field. These are unit tests that do not require
 * an LLM — they test the parsing and validation layer only.
 *
 * Integration tests (T2.x) that require actual LLM calls are documented
 * in plans/ai-improvements-audit.md and should be run via the eval
 * infrastructure against a live skill.
 */

import { GradingService } from './grading.service';

// Access private methods via prototype for unit testing
const service = Object.create(GradingService.prototype);

describe('B4 — Claim Extraction', () => {
  // ── Category 1: validateClaims() unit tests ──────────────────────────

  describe('validateClaims()', () => {
    const validate = (input: unknown) =>
      (service as any).validateClaims(input);

    it('T1.1: accepts valid claims', () => {
      const input = [
        {
          claim: 'Has 5 items',
          type: 'factual',
          verified: true,
          evidence: 'Counted 5',
        },
        {
          claim: 'Used validation',
          type: 'process',
          verified: false,
          evidence: 'No validation found',
        },
        {
          claim: 'Covers all cases',
          type: 'quality',
          verified: true,
          evidence: 'All 7 cases present',
        },
      ];
      const result = validate(input);
      expect(result).toHaveLength(3);
      expect(result![0].type).toBe('factual');
      expect(result![0].verified).toBe(true);
      expect(result![1].type).toBe('process');
      expect(result![1].verified).toBe(false);
      expect(result![2].type).toBe('quality');
    });

    it('T1.2: rejects malformed claims', () => {
      const input = [
        { claim: 123, type: 'factual', verified: true, evidence: 'ok' }, // claim not string
        { claim: 'ok', type: 'invalid', verified: true, evidence: 'ok' }, // bad type
        { claim: 'ok', type: 'factual', verified: 'yes', evidence: 'ok' }, // verified not bool
        { claim: 'ok', type: 'factual', verified: true }, // missing evidence
      ];
      const result = validate(input);
      // All items should be filtered out
      expect(result).toBeUndefined();
    });

    it('T1.3: enforces hard cap of 10', () => {
      const input = Array(20).fill({
        claim: 'test',
        type: 'factual',
        verified: true,
        evidence: 'ok',
      });
      const result = validate(input);
      expect(result).toHaveLength(10);
    });

    it('T1.4: truncates long strings', () => {
      const input = [
        {
          claim: 'x'.repeat(1000),
          type: 'factual',
          verified: true,
          evidence: 'y'.repeat(2000),
        },
      ];
      const result = validate(input);
      expect(result).toHaveLength(1);
      expect(result![0].claim.length).toBeLessThanOrEqual(500);
      expect(result![0].evidence.length).toBeLessThanOrEqual(1000);
    });

    it('T1.5: handles null/undefined/empty array', () => {
      expect(validate(null)).toBeUndefined();
      expect(validate(undefined)).toBeUndefined();
      expect(validate([])).toBeUndefined();
      expect(validate('not an array')).toBeUndefined();
    });

    it('T1.5b: handles array with only invalid items', () => {
      const input = [
        { claim: 42, type: 'factual', verified: true, evidence: 'ok' },
      ];
      expect(validate(input)).toBeUndefined();
    });

    it('preserves confidence when present', () => {
      const input = [
        {
          claim: 'test',
          type: 'factual',
          verified: true,
          evidence: 'ok',
          confidence: 0.95,
        },
      ];
      const result = validate(input);
      expect(result![0].confidence).toBe(0.95);
    });

    it('omits confidence when not a number', () => {
      const input = [
        {
          claim: 'test',
          type: 'factual',
          verified: true,
          evidence: 'ok',
          confidence: 'high',
        },
      ];
      const result = validate(input);
      expect(result![0].confidence).toBeUndefined();
    });
  });

  // ── Category 1b: parseGraderResponse() with claims ───────────────────

  describe('parseGraderResponse() with claims', () => {
    const parse = (content: string, assertions: any[] = [{ type: 'semantic', value: 'test' }]) =>
      (service as any).parseGraderResponse(content, assertions);

    it('T1.6: extracts claims from valid JSON', () => {
      const content = JSON.stringify({
        assertionResults: [{ passed: true, evidence: 'ok' }],
        overallScore: 100,
        overallAssessment: 'pass',
        claims: [
          {
            claim: 'Has 5 items',
            type: 'factual',
            verified: true,
            evidence: 'Counted 5',
          },
        ],
      });
      const result = parse(content);
      expect(result.claims).toBeDefined();
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claim).toBe('Has 5 items');
    });

    it('T1.7: gracefully handles missing claims field', () => {
      const content = JSON.stringify({
        assertionResults: [{ passed: true, evidence: 'ok' }],
        overallScore: 100,
        overallAssessment: 'pass',
        // No claims field
      });
      const result = parse(content);
      expect(result.claims).toBeUndefined();
    });

    it('extracts claims from code-fenced JSON', () => {
      const content =
        '```json\n' +
        JSON.stringify({
          assertionResults: [{ passed: true, evidence: 'ok' }],
          overallScore: 100,
          overallAssessment: 'pass',
          claims: [
            {
              claim: 'test claim',
              type: 'quality',
              verified: false,
              evidence: 'incomplete',
            },
          ],
        }) +
        '\n```';
      const result = parse(content);
      expect(result.claims).toBeDefined();
      expect(result.claims).toHaveLength(1);
    });

    it('preserves existing assertion results alongside claims', () => {
      const content = JSON.stringify({
        assertionResults: [
          { passed: true, evidence: 'found text' },
          { passed: false, evidence: 'not found' },
        ],
        overallScore: 50,
        overallAssessment: 'partial',
        claims: [
          {
            claim: 'accurate count',
            type: 'factual',
            verified: true,
            evidence: 'verified',
          },
        ],
        evalFeedback: {
          suggestions: [{ assertion: null, reason: 'add more tests' }],
          overall: 'decent suite',
        },
      });
      const result = parse(content, [
        { type: 'semantic', value: 'a' },
        { type: 'semantic', value: 'b' },
      ]);
      expect(result.assertionResults).toHaveLength(2);
      expect(result.claims).toHaveLength(1);
      expect(result.evalFeedback).toBeDefined();
      expect(result.evalFeedback.suggestions).toHaveLength(1);
    });
  });
});
