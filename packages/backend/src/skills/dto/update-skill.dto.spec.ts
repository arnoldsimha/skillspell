import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateSkillDto, SkillStatus } from './update-skill.dto';

async function validateDto(plain: object) {
  const dto = plainToInstance(UpdateSkillDto, plain);
  return validate(dto);
}

describe('UpdateSkillDto', () => {
  describe('status', () => {
    it.each(['draft', 'ready', 'in_review', 'published'])(
      'accepts valid status "%s"',
      async (status) => {
        const errors = await validateDto({ status });
        expect(errors).toHaveLength(0);
      },
    );

    it.each(['asdasdasd', 'READY', 'Ready', 'exported', '', ' ', '1'])(
      'rejects invalid status "%s"',
      async (status) => {
        const errors = await validateDto({ status });
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('status');
        expect(errors[0].constraints).toMatchObject({
          isEnum: expect.stringContaining('draft, ready, in_review, published'),
        });
      },
    );

    it('passes when status is omitted', async () => {
      const errors = await validateDto({});
      expect(errors).toHaveLength(0);
    });
  });

  describe('name', () => {
    it('rejects name that normalizes to empty (symbols only)', async () => {
      const errors = await validateDto({ name: '!@#$%' });
      expect(errors[0].property).toBe('name');
    });

    it('rejects name that normalizes to empty (digits only)', async () => {
      const errors = await validateDto({ name: '12345' });
      expect(errors[0].property).toBe('name');
    });

    it('accepts valid name', async () => {
      const errors = await validateDto({ name: 'my-skill' });
      expect(errors).toHaveLength(0);
    });
  });
});
