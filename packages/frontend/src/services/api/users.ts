/**
 * Users API client.
 *
 * Admin endpoints for managing organization users and invite endpoints.
 */

import { request, API_BASE } from './client.js';
import type { User, UserRole, InviteResult, PendingInvite, LoginResponse } from '@skillspell/shared';

const BASE = `${API_BASE}/users`;

// ─── Types ─────────────────────────────────────────────────────────────

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
  /** Required when setting role to 'owner' (prevents accidental ownership transfer). */
  confirmOwnerTransfer?: boolean;
}

// ─── Users API ─────────────────────────────────────────────────────────

/** List all users in the organization. */
export function getUsers(): Promise<User[]> {
  return request<User[]>(BASE);
}

/** Update a user's profile, role, or status. */
export function updateUser(id: string, data: UpdateUserRequest): Promise<User> {
  return request<User>(`${BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Deactivate (soft-delete) a user. */
export function deleteUser(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE}/${id}`, {
    method: 'DELETE',
  });
}

// ─── Invite API ────────────────────────────────────────────────────────

/** Check whether SMTP is configured (admin only). */
export function getInviteSmtpStatus(): Promise<{ configured: boolean }> {
  return request<{ configured: boolean }>(`${BASE}/invite/smtp-status`);
}

/** Send invite emails to up to 5 addresses (admin only). */
export function inviteUsers(data: {
  emails: string[];
  role?: UserRole;
}): Promise<InviteResult[]> {
  return request<InviteResult[]>(`${BASE}/invite`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** List pending (unconsumed, unexpired) invites (admin only). */
export function getPendingInvites(): Promise<PendingInvite[]> {
  return request<PendingInvite[]>(`${BASE}/invites/pending`);
}

/** Revoke a pending invite (admin only). */
export function revokeInvite(inviteId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE}/invites/${inviteId}`, {
    method: 'DELETE',
  });
}

/** Resend an invite email (admin only). Renews token if < 5 min remaining. */
export function resendInvite(inviteId: string): Promise<{ message: string; renewed: boolean }> {
  return request<{ message: string; renewed: boolean }>(`${BASE}/invites/${inviteId}/resend`, {
    method: 'POST',
  });
}

/** Validate an invite token (public — no auth needed). */
export function validateInvite(token: string): Promise<{ valid: boolean; email: string }> {
  return request<{ valid: boolean; email: string }>(`${API_BASE}/invite/${token}`);
}

/** Complete registration from an invite (public — no auth needed). */
export function completeInvite(token: string, data: {
  firstName: string;
  lastName: string;
  password: string;
}): Promise<LoginResponse> {
  return request<LoginResponse>(`${API_BASE}/invite/${token}/complete`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
