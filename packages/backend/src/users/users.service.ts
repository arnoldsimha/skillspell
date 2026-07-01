import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import {
  USER_REPOSITORY,
  type IUserRepository,
  CREDENTIAL_REPOSITORY,
  type ICredentialRepository,
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
  type User,
  type UserRole,
  type CreateUserData,
  type UpdateUserData,
  canModifyUser,
} from '@skillspell/shared';
import type { AppConfig } from '../config/configuration.js';
import { AuthService } from '../auth/auth.service.js';

/**
 * User management service (admin operations).
 *
 * Provides CRUD for users, including password hashing for local auth,
 * refresh token revocation on password changes, and owner-level
 * protection to prevent privilege escalation.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: ICredentialRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokenRepo: IAuthTokenRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly authService: AuthService,
  ) {}

  /**
   * List all users.
   */
  async findAll(): Promise<User[]> {
    return this.userRepo.findAll();
  }

  /**
   * Find a user by ID.
   * @throws NotFoundException if user does not exist.
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /**
   * Create a new user (admin action).
   *
   * If a password is provided, the user gets `local` auth provider and
   * a hashed credential record. Otherwise the user is SSO-only.
   *
   * Note: Users cannot be created with the 'owner' role via this endpoint.
   * Ownership is only assigned during initial setup or via explicit transfer.
   *
   * @throws ConflictException if email is already in use.
   */
  async create(data: {
    email: string;
    firstName: string;
    lastName: string;
    role?: 'user' | 'admin';
    password?: string;
  }): Promise<User> {
    const email = data.email.toLowerCase().trim();

    // Check for duplicate email
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new ConflictException(`Email ${email} is already in use`);
    }

    // Validate password if provided
    if (data.password) {
      this.authService.validatePassword(data.password);
    }

    // Get the singleton org for the orgId
    const org = await this.orgRepo.findSingleton();
    if (!org) {
      throw new Error('Organization not found. Complete initial setup first.');
    }

    const createData: CreateUserData = {
      orgId: org.id,
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role ?? 'user',
      password: data.password,
    };

    const user = await this.userRepo.create(createData);

    // If password was provided, create a credential record
    if (data.password) {
      const authConfig = this.configService.get('auth', { infer: true });
      const passwordHash = await bcrypt.hash(
        data.password,
        authConfig.bcryptRounds,
      );

      await this.credentialRepo.saveCredential({
        userId: user.id,
        passwordHash,
        mustChangePassword: false,
        failedAttempts: 0,
        updatedAt: new Date().toISOString(),
      });
    }

    this.logger.log(
      `Admin created user ${user.id} (${email}) with role=${user.role}`,
    );
    return user;
  }

  /**
   * Update a user's profile, role, or status (admin action).
   *
   * If a new password is provided, the credential is updated and all
   * existing refresh tokens for that user are revoked.
   *
   * Owner protection:
   * - Only owners can modify admin/owner users
   * - Only owners can assign the 'owner' role (requires confirmOwnerTransfer flag)
   * - Admins can only modify 'user'-role accounts
   *
   * @throws NotFoundException if user does not exist.
   * @throws ForbiddenException if actor lacks permission to modify the target.
   */
  async update(
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: UserRole;
      isActive?: boolean;
      password?: string;
      confirmOwnerTransfer?: boolean;
    },
    actor: User,
  ): Promise<User> {
    // Ensure user exists
    const existing = await this.userRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`User ${id} not found`);
    }

    // ─── Owner Protection ────────────────────────────────────────────
    // Check if actor has permission to modify the target user
    if (!canModifyUser(actor.role, existing.role)) {
      throw new ForbiddenException(
        `You do not have permission to modify a user with role '${existing.role}'`,
      );
    }

    // Only owners can assign the 'owner' role
    if (data.role === 'owner') {
      if (actor.role !== 'owner') {
        throw new ForbiddenException(
          'Only an owner can transfer ownership to another user',
        );
      }
      if (!data.confirmOwnerTransfer) {
        throw new ForbiddenException(
          'Owner transfer requires explicit confirmation (confirmOwnerTransfer: true)',
        );
      }
    }

    // Admins cannot assign the 'admin' role (only owners can promote to admin)
    if (data.role === 'admin' && actor.role !== 'owner') {
      throw new ForbiddenException(
        'Only an owner can promote a user to admin',
      );
    }

    // Handle password change separately
    if (data.password) {
      this.authService.validatePassword(data.password);

      const authConfig = this.configService.get('auth', { infer: true });
      const passwordHash = await bcrypt.hash(
        data.password,
        authConfig.bcryptRounds,
      );

      await this.credentialRepo.updateCredential(id, {
        passwordHash,
        failedAttempts: 0,
        lockedUntil: undefined,
      });

      // Revoke all refresh tokens — forces re-login
      await this.authTokenRepo.revokeAllRefreshTokens(id);

      this.logger.log(`Admin reset password for user ${id}`);
    }

    // Build user update data (excluding password and confirmOwnerTransfer)
    const updateData: UpdateUserData = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Only call update if there are profile/role/status changes
    if (Object.keys(updateData).length > 0) {
      return this.userRepo.update(id, updateData);
    }

    // If only password was changed, return the existing user
    return existing;
  }

  /**
   * Deactivate a user (soft-delete).
   * Also revokes all refresh tokens.
   *
   * Owner protection:
   * - Only owners can deactivate admin/owner users
   * - Owners cannot deactivate themselves
   *
   * @throws NotFoundException if user does not exist.
   * @throws ForbiddenException if actor lacks permission.
   */
  async deactivate(id: string, actor: User): Promise<void> {
    const existing = await this.userRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`User ${id} not found`);
    }

    // Prevent owners from deactivating themselves
    if (existing.role === 'owner' && existing.id === actor.id) {
      throw new ForbiddenException(
        'Owners cannot deactivate their own account. Transfer ownership first.',
      );
    }

    // Check if actor has permission to deactivate the target user
    if (!canModifyUser(actor.role, existing.role)) {
      throw new ForbiddenException(
        `You do not have permission to deactivate a user with role '${existing.role}'`,
      );
    }

    await this.userRepo.deactivate(id);
    await this.authTokenRepo.revokeAllRefreshTokens(id);

    this.logger.log(`Admin deactivated user ${id} (${existing.email})`);
  }

}
