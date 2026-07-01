import type { User } from '@skillspell/shared';
import { API_BASE, request } from './client.js';

/** Fetch the current user's full profile. */
export async function getProfile(): Promise<User> {
  return request<User>(`${API_BASE}/auth/me`);
}

/** Update the current user's profile. */
export async function updateProfile(data: {
  firstName?: string;
  lastName?: string;
  timezone?: string;
  dateFormat?: string;
}): Promise<User> {
  return request<User>(`${API_BASE}/auth/me`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** Change the current user's password. */
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await request<{ message: string }>(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
