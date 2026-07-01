import { envSchema } from './configuration';

describe('envSchema JWT_SECRET validation', () => {
  const jwt = envSchema.shape.JWT_SECRET;

  it('rejects the backend .env.example "change-me" placeholder (fail closed)', () => {
    expect(
      jwt.safeParse('change-me-to-a-random-string-at-least-32-chars').success,
    ).toBe(false);
  });

  it('rejects the root .env.example "your-jwt-secret" placeholder (fail closed)', () => {
    expect(
      jwt.safeParse('your-jwt-secret-at-least-32-characters-long').success,
    ).toBe(false);
  });

  it('rejects the current root placeholder shipped in .env.example', () => {
    expect(
      jwt.safeParse('change-me-generate-a-64-char-hex-secret-before-running')
        .success,
    ).toBe(false);
  });

  it('rejects secrets shorter than 32 characters', () => {
    expect(jwt.safeParse('short-secret').success).toBe(false);
  });

  it('accepts a real random 64-char hex secret', () => {
    expect(jwt.safeParse('a1b2c3d4'.repeat(8)).success).toBe(true);
  });
});
