import { BadRequestException } from '@nestjs/common';
import {
  assertLoopbackCliRedirect,
  assertValidCliState,
  buildCliCallbackUrl,
} from './cli-redirect.util.js';

describe('assertValidCliState', () => {
  it('accepts an 8-128 char URL-safe nonce', () => {
    expect(() => assertValidCliState('a1b2c3d4e5f60718293a4b5c6d7e8f90')).not.toThrow();
    expect(() => assertValidCliState('abcd-EFGH_1234')).not.toThrow();
  });

  it('rejects too-short values', () => {
    expect(() => assertValidCliState('short')).toThrow(BadRequestException);
  });

  it('rejects too-long values', () => {
    expect(() => assertValidCliState('a'.repeat(129))).toThrow(BadRequestException);
  });

  it('rejects non-URL-safe characters', () => {
    expect(() => assertValidCliState('bad state<script>')).toThrow(BadRequestException);
  });

  it('rejects a trailing newline (JS $ anchor would otherwise admit it)', () => {
    expect(() => assertValidCliState('aaaaaaaa\n')).toThrow(BadRequestException);
  });
});

describe('buildCliCallbackUrl', () => {
  it('appends code and state as query params', () => {
    const url = buildCliCallbackUrl(
      'http://localhost:9876/callback',
      'a'.repeat(64),
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    );
    expect(url).toBe(
      `http://localhost:9876/callback?code=${'a'.repeat(64)}&state=a1b2c3d4e5f60718293a4b5c6d7e8f90`,
    );
  });

  it('omits state when not provided', () => {
    const url = buildCliCallbackUrl('http://localhost:9876/callback', 'abc');
    expect(url).toBe('http://localhost:9876/callback?code=abc');
  });

  it('preserves an existing query string on the redirect instead of corrupting it', () => {
    // String concatenation would produce "...callback?x=1?code=..." and the CLI
    // would never see a `state` key. The URL builder must merge correctly.
    const url = buildCliCallbackUrl(
      'http://localhost:9876/callback?x=1',
      'deadbeef',
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('x')).toBe('1');
    expect(parsed.searchParams.get('code')).toBe('deadbeef');
    expect(parsed.searchParams.get('state')).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90');
  });
});

describe('assertLoopbackCliRedirect (regression guard after refactor)', () => {
  it('rejects the userinfo bypass', () => {
    expect(() => assertLoopbackCliRedirect('http://localhost:1@evil.com/callback')).toThrow(
      BadRequestException,
    );
  });

  it('accepts a plain localhost redirect', () => {
    expect(() => assertLoopbackCliRedirect('http://localhost:9876/callback')).not.toThrow();
  });
});
