import type {
  User,
  CreateUserData,
  UpdateUserData,
} from '@skillspell/shared';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Repository interface for User CRUD operations.
 */
export interface IUserRepository {
  /** Create a new user. */
  create(user: CreateUserData): Promise<User>;
  /** Find a user by their UUID. */
  findById(id: string): Promise<User | null>;
  /** Find a user by email. */
  findByEmail(email: string): Promise<User | null>;
  /** List all users. */
  findAll(): Promise<User[]>;
  /** Update a user's profile/role/status. */
  update(id: string, data: UpdateUserData): Promise<User>;
  /** Soft-deactivate a user (set isActive = false). */
  deactivate(id: string): Promise<void>;
}
