export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface Category {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryData {
  orgId: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface ICategoryRepository {
  create(data: CreateCategoryData): Promise<Category>;
  findById(id: string): Promise<Category | null>;
  /** Fetch multiple categories by their IDs in a single IN query. */
  findByIds(ids: string[]): Promise<Category[]>;
  findByOrgId(orgId: string): Promise<Category[]>;
  findBySlug(orgId: string, slug: string): Promise<Category | null>;
  update(id: string, data: Partial<Pick<Category, 'name' | 'slug' | 'description'>>): Promise<Category>;
  delete(id: string): Promise<void>;
}
