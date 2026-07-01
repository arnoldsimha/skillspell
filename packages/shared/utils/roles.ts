import type { UserRole } from '../types/user.js';

/**
 * Role hierarchy levels — higher number = more privilege.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 3,
  admin: 2,
  user: 1,
};

/**
 * Check if a user's role is at least as privileged as the required role.
 *
 * Example: isAtLeast('owner', 'admin') → true
 *          isAtLeast('user', 'admin')  → false
 */
export function isAtLeast(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check whether an actor with `actorRole` can modify a target user with `targetRole`.
 *
 * Rules:
 * - Owner can modify anyone
 * - Admin can only modify users with role 'user'
 * - User cannot modify anyone
 */
export function canModifyUser(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return targetRole === 'user';
  return false;
}
