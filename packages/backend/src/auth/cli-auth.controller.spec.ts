import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CliRefreshDto } from './dto/cli-refresh.dto.js';

describe('CliRefreshDto', () => {
  it('rejects non-UUID userId', async () => {
    const dto = plainToInstance(CliRefreshDto, { userId: 'not-a-uuid' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('userId');
  });

  it('rejects missing userId', async () => {
    const dto = plainToInstance(CliRefreshDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('userId');
  });

  it('accepts valid UUID v4', async () => {
    const dto = plainToInstance(CliRefreshDto, {
      userId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
