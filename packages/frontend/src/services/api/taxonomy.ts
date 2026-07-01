/**
 * Taxonomy API client.
 *
 * Category CRUD endpoints (admin-only writes, all-auth reads)
 * and skill taxonomy assignment endpoints.
 */

import { request, API_BASE } from './client.js';

const CATEGORIES_BASE = `${API_BASE}/admin/categories`;
const SKILLS_BASE = `${API_BASE}/skills`;

// ─── Types ─────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillMetadataAssignment {
  categoryIds: string[];
}

export interface SkillTaxonomy {
  categories: { id: string; name: string }[];
}

// ─── Category CRUD ─────────────────────────────────────────────────────

export function listCategories(): Promise<Category[]> {
  return request<Category[]>(CATEGORIES_BASE);
}

export function createCategory(name: string): Promise<Category> {
  return request<Category>(CATEGORIES_BASE, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function updateCategory(id: string, name: string): Promise<Category> {
  return request<Category>(`${CATEGORIES_BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteCategory(id: string): Promise<void> {
  return request<void>(`${CATEGORIES_BASE}/${id}`, { method: 'DELETE' });
}

// ─── Skill taxonomy assignment ─────────────────────────────────────────
// Note: uses /taxonomy path (not /metadata) — Wave 0 found that /metadata
// was already taken by the existing SkillSummaryDto endpoint.

export function getSkillTaxonomy(skillId: string): Promise<SkillTaxonomy> {
  return request<SkillTaxonomy>(`${SKILLS_BASE}/${skillId}/taxonomy`);
}

/** @deprecated Use getSkillTaxonomy */
export function getSkillMetadata(skillId: string): Promise<SkillMetadataAssignment> {
  return getSkillTaxonomy(skillId) as unknown as Promise<SkillMetadataAssignment>;
}

export function setSkillMetadata(
  skillId: string,
  data: SkillMetadataAssignment,
): Promise<SkillMetadataAssignment> {
  return request<SkillMetadataAssignment>(`${SKILLS_BASE}/${skillId}/taxonomy`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
