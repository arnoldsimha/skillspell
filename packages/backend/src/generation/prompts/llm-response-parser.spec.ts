import {
  extractJson,
  extractBalancedJson,
  extractBalancedArray,
  parseJsonObject,
  parseJsonArray,
} from './llm-response-parser';

describe('llm-response-parser — structured extraction', () => {
  describe('extractBalancedJson', () => {
    it('returns the balanced object from a string starting with {', () => {
      expect(extractBalancedJson('{"a":1}')).toBe('{"a":1}');
    });

    it('handles nested braces and braces inside strings', () => {
      const src = '{"a":{"b":2},"s":"} not the end {"}trailing';
      expect(extractBalancedJson(src)).toBe(
        '{"a":{"b":2},"s":"} not the end {"}',
      );
    });

    it('returns null when input does not start with {', () => {
      expect(extractBalancedJson('prefix {"a":1}')).toBeNull();
    });

    it('returns null on unbalanced braces', () => {
      expect(extractBalancedJson('{"a":1')).toBeNull();
    });
  });

  describe('extractBalancedArray', () => {
    it('extracts the first balanced array, ignoring trailing prose with brackets', () => {
      const src = 'Here you go: [1, 2, 3]. See item [4] in prose.';
      expect(extractBalancedArray(src)).toBe('[1, 2, 3]');
    });

    it('handles nested arrays and brackets inside strings', () => {
      const src = '[[1],[2],"a] b ["]';
      expect(extractBalancedArray(src)).toBe('[[1],[2],"a] b ["]');
    });

    it('returns null when there is no array', () => {
      expect(extractBalancedArray('no array here')).toBeNull();
    });

    it('returns null on an unbalanced array', () => {
      expect(extractBalancedArray('[1, 2, 3')).toBeNull();
    });
  });

  describe('parseJsonObject', () => {
    it('parses raw JSON', () => {
      expect(parseJsonObject('{"x":1}')).toEqual({ x: 1 });
    });

    it('parses JSON wrapped in a ```json code fence', () => {
      const src = '```json\n{"x":1,"y":"z"}\n```';
      expect(parseJsonObject(src)).toEqual({ x: 1, y: 'z' });
    });

    it('parses JSON wrapped in a bare ``` fence', () => {
      expect(parseJsonObject('```\n{"x":1}\n```')).toEqual({ x: 1 });
    });

    it('extracts an object that has a text preamble', () => {
      expect(parseJsonObject('Sure! Here:\n{"ok":true}')).toEqual({ ok: true });
    });

    it('returns null for an array (not an object)', () => {
      expect(parseJsonObject('[1,2,3]')).toBeNull();
    });

    it('returns null for unparseable content', () => {
      expect(parseJsonObject('not json at all')).toBeNull();
    });
  });

  describe('parseJsonArray', () => {
    it('parses a raw JSON array', () => {
      expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('parses an array wrapped in a code fence', () => {
      expect(parseJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
    });

    it('extracts an array from a preamble + trailing prose', () => {
      expect(parseJsonArray('Result: [{"q":"x"}] done.')).toEqual([{ q: 'x' }]);
    });

    it('returns null for an object (not an array)', () => {
      expect(parseJsonArray('{"a":1}')).toBeNull();
    });

    it('returns null for unparseable content', () => {
      expect(parseJsonArray('nope')).toBeNull();
    });
  });

  describe('extractJson (existing skill-biased extractor, regression guard)', () => {
    it('returns a skill-shaped object verbatim when given raw JSON', () => {
      const json = JSON.stringify({
        name: 'x',
        skillContent: 'long content '.repeat(20),
      });
      expect(extractJson(json)).toBe(json);
    });

    it('returns the input unchanged when no JSON object is present', () => {
      expect(extractJson('plain text')).toBe('plain text');
    });
  });
});
