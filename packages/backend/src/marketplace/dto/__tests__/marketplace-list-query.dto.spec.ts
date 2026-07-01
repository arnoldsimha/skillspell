import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MarketplaceListQueryDto } from '../marketplace-list-query.dto';

describe('MarketplaceListQueryDto', () => {
  it('rejects limit=0', async () => {
    const dto = plainToInstance(MarketplaceListQueryDto, { limit: 0 });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'limit')).toBe(true);
  });

  it('rejects invalid sort value', async () => {
    const dto = plainToInstance(MarketplaceListQueryDto, { sort: 'invalid' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'sort')).toBe(true);
  });

  it('rejects page=0', async () => {
    const dto = plainToInstance(MarketplaceListQueryDto, { page: 0 });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'page')).toBe(true);
  });

  it('rejects page=1001', async () => {
    const dto = plainToInstance(MarketplaceListQueryDto, { page: 1001 });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'page')).toBe(true);
  });

  it('rejects search longer than 200 chars', async () => {
    const dto = plainToInstance(MarketplaceListQueryDto, { search: 'a'.repeat(201) });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'search')).toBe(true);
  });

  it('rejects limit > 100', async () => {
    const dto = plainToInstance(MarketplaceListQueryDto, { limit: 101 });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'limit')).toBe(true);
  });

  it('accepts all valid sort options', async () => {
    for (const sort of ['popular', 'newest', 'downloads', 'upvotes', 'name']) {
      const dto = plainToInstance(MarketplaceListQueryDto, { sort });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('transforms comma-separated categories string into array', async () => {
    const dto = plainToInstance(MarketplaceListQueryDto, { categories: 'testing,ci,review' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.categories).toEqual(['testing', 'ci', 'review']);
  });
});
