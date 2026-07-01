import type { UserRole } from '@skillspell/shared';
import { useAuth } from './useAuth.js';

// Mirrors ROLE_HIERARCHY from @skillspell/shared/utils/roles — inlined to avoid
// importing a runtime value from the shared CJS dist (Vite requires ESM).
const ROLE_HIERARCHY: Record<UserRole, number> = { owner: 3, admin: 2, user: 1 };

/**
 * Returns true if the current user's role meets or exceeds the minimum required role.
 * Respects the hierarchy: owner > admin > user.
 *
 * Use this instead of comparing user.role directly — direct string comparison
 * silently breaks when a higher role is added.
 */
export function useHasRole(minimumRole: UserRole): boolean {
  const { user } = useAuth();
  return !!user && ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[minimumRole];
}
