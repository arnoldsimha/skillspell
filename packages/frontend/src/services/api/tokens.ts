import { API_BASE, request } from './client.js';

// Inline types — mirror PatListItemDto from packages/backend/src/auth/dto/pat-response.dto.ts
// NOT imported from backend to avoid cross-package coupling.
export interface PatListItem {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatePatResponse extends PatListItem {
  /** Raw token — returned exactly once at creation. Store it; it cannot be retrieved again. */
  rawToken: string;
}

/** Fetch the authenticated user's active personal access tokens. */
export async function listPats(): Promise<PatListItem[]> {
  return request<PatListItem[]>(`${API_BASE}/auth/tokens`);
}

/** Create a new personal access token. Returns rawToken (once only). */
export async function createPat(body: {
  name: string;
  expiresAt: string;
}): Promise<CreatePatResponse> {
  return request<CreatePatResponse>(`${API_BASE}/auth/tokens`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Revoke (permanently delete) a personal access token by id. */
export async function revokePat(id: string): Promise<void> {
  await request<void>(`${API_BASE}/auth/tokens/${id}`, { method: 'DELETE' });
}
