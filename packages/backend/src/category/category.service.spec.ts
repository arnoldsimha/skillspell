import { Test, TestingModule } from '@nestjs/testing';
import {
  CATEGORY_REPOSITORY,
  SKILL_CATEGORY_REPOSITORY,
  type ICategoryRepository,
  type ISkillCategoryRepository,
  type Category,
} from '@skillspell/shared';
import { CategoryService } from './category.service.js';

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  orgId: 'org-1',
  name: 'Dev Tools',
  slug: 'dev-tools',
  description: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('CategoryService (SC-9)', () => {
  let service: CategoryService;

  const mockCategoryRepo: jest.Mocked<ICategoryRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByOrgId: jest.fn(),
    findBySlug: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockSkillCategoryRepo: jest.Mocked<ISkillCategoryRepository> = {
    add: jest.fn(),
    remove: jest.fn(),
    findBySkillId: jest.fn(),
    findByCategoryId: jest.fn(),
    setForSkill: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: CATEGORY_REPOSITORY, useValue: mockCategoryRepo },
        { provide: SKILL_CATEGORY_REPOSITORY, useValue: mockSkillCategoryRepo },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  describe('create', () => {
    it('should auto-generate slug from name when slug not provided', async () => {
      const expected = makeCategory({ name: 'Dev Tools', slug: 'dev-tools' });
      mockCategoryRepo.create.mockResolvedValue(expected);

      await service.create({ name: 'Dev Tools' }, 'org-1');

      expect(mockCategoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'dev-tools' }),
      );
    });

    it('should auto-generate slug by lowercasing and replacing non-alphanumeric with hyphens', async () => {
      const expected = makeCategory({ name: 'My Cool  Feature!', slug: 'my-cool-feature' });
      mockCategoryRepo.create.mockResolvedValue(expected);

      await service.create({ name: 'My Cool  Feature!' }, 'org-1');

      expect(mockCategoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-cool-feature' }),
      );
    });

    it('should use provided slug when supplied', async () => {
      const expected = makeCategory({ slug: 'custom-slug' });
      mockCategoryRepo.create.mockResolvedValue(expected);

      await service.create({ name: 'Dev Tools', slug: 'custom-slug' }, 'org-1');

      expect(mockCategoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'custom-slug' }),
      );
    });

    it('should call categoryRepo.create with orgId, name, slug, description', async () => {
      const expected = makeCategory({ description: 'Tooling category' });
      mockCategoryRepo.create.mockResolvedValue(expected);

      await service.create({ name: 'Dev Tools', description: 'Tooling category' }, 'org-1');

      expect(mockCategoryRepo.create).toHaveBeenCalledWith({
        orgId: 'org-1',
        name: 'Dev Tools',
        slug: 'dev-tools',
        description: 'Tooling category',
      });
    });

    it('should pass null description when description not provided', async () => {
      mockCategoryRepo.create.mockResolvedValue(makeCategory());

      await service.create({ name: 'Dev Tools' }, 'org-1');

      expect(mockCategoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ description: null }),
      );
    });
  });

  describe('findAll', () => {
    it('should call findByOrgId with the caller orgId', async () => {
      const categories = [makeCategory()];
      mockCategoryRepo.findByOrgId.mockResolvedValue(categories);

      const result = await service.findAll('org-1');

      expect(mockCategoryRepo.findByOrgId).toHaveBeenCalledWith('org-1');
      expect(result).toBe(categories);
    });
  });

  describe('update', () => {
    it('should call categoryRepo.update with the patched fields', async () => {
      const existing = makeCategory({ id: 'cat-1', orgId: 'org-1' });
      const updated = makeCategory({ name: 'New Name', slug: 'new-name' });
      mockCategoryRepo.findById.mockResolvedValue(existing);
      mockCategoryRepo.update.mockResolvedValue(updated);

      const result = await service.update('cat-1', { name: 'New Name', slug: 'new-name' }, 'org-1');

      expect(mockCategoryRepo.update).toHaveBeenCalledWith('cat-1', {
        name: 'New Name',
        slug: 'new-name',
        description: undefined,
      });
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException if category does not exist', async () => {
      mockCategoryRepo.findById.mockResolvedValue(null);

      await expect(service.update('cat-missing', { name: 'X' }, 'org-1')).rejects.toThrow();
    });

    it('should throw NotFoundException if category belongs to a different org', async () => {
      mockCategoryRepo.findById.mockResolvedValue(makeCategory({ id: 'cat-1', orgId: 'other-org' }));

      await expect(service.update('cat-1', { name: 'X' }, 'org-1')).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should call categoryRepo.delete with the id when no dependents', async () => {
      mockCategoryRepo.findById.mockResolvedValue(makeCategory({ id: 'cat-1', orgId: 'org-1' }));
      mockSkillCategoryRepo.findByCategoryId.mockResolvedValue([]);
      mockCategoryRepo.delete.mockResolvedValue(undefined);

      await service.delete('cat-1', 'org-1');

      expect(mockCategoryRepo.delete).toHaveBeenCalledWith('cat-1');
    });

    it('should delete the category (DB cascade removes skill assignments automatically)', async () => {
      mockCategoryRepo.findById.mockResolvedValue(makeCategory({ id: 'cat-1', orgId: 'org-1' }));
      mockCategoryRepo.delete.mockResolvedValue(undefined);

      await service.delete('cat-1', 'org-1');

      // The service relies on DB cascade (onDelete: CASCADE on skill_categories FK)
      // so it calls categoryRepo.delete directly without manual skill-category cleanup.
      expect(mockCategoryRepo.delete).toHaveBeenCalledWith('cat-1');
      expect(mockSkillCategoryRepo.setForSkill).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if category belongs to a different org', async () => {
      mockCategoryRepo.findById.mockResolvedValue(makeCategory({ id: 'cat-1', orgId: 'other-org' }));

      await expect(service.delete('cat-1', 'org-1')).rejects.toThrow();
    });
  });
});
