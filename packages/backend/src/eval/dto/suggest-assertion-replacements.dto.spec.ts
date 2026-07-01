import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SuggestAssertionReplacementsDto } from './suggest-assertion-replacements.dto';

const makeDto = (assertionValue: string) =>
  plainToInstance(SuggestAssertionReplacementsDto, {
    assertions: [
      {
        assertionValue,
        assertionType: 'semantic',
        withSkillPassRate: 0.5,
        baselinePassRate: 0.5,
      },
    ],
  });

describe('SuggestAssertionReplacementsDto — assertionValue length', () => {
  it('accepts an assertion value at the canonical 1000-char max', async () => {
    const errors = await validate(makeDto('x'.repeat(1000)), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects values over 1000 chars with a friendly, path-free message', async () => {
    const errors = await validate(makeDto('x'.repeat(1001)), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const messages = errors
      .flatMap((e) => e.children ?? [])
      .flatMap((c) => c.children ?? [])
      .flatMap((c) => Object.values(c.constraints ?? {}));
    expect(messages).toContain('Assertion value is too long (maximum 1000 characters).');
    // Friendly: no raw "assertions.0.assertionValue must be shorter than…".
    expect(messages.join(' ')).not.toMatch(/must be shorter than or equal to/);
  });
});
