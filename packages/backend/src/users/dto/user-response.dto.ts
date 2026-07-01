import type { User, UserRole, AuthProvider } from '@skillspell/shared';

/**
 * Response DTO for user data returned by admin endpoints.
 *
 * Maps the internal User entity to a clean API response.
 * Sensitive fields like password hashes are never included.
 */
export class UserResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  role!: UserRole;
  isActive!: boolean;
  authProviders!: AuthProvider[];
  profileComplete!: boolean;
  twoFactorEnabled!: boolean;
  createdAt!: string;
  updatedAt!: string;
  lastLoginAt?: string;

  static fromUser(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.role = user.role;
    dto.isActive = user.isActive;
    dto.authProviders = user.authProviders;
    dto.profileComplete = user.profileComplete;
    dto.twoFactorEnabled = user.twoFactorEnabled;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    dto.lastLoginAt = user.lastLoginAt;
    return dto;
  }
}
