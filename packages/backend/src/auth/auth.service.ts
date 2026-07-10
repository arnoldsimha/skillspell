import { formatError } from '../common/utils/format-error.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
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
  PAT_REPOSITORY,
  type IPersonalAccessTokenRepository,
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
  type User,
  type LoginResponse,
  type SetupRequest,
  type CreateUserData,
  type UpdateProfileRequest,
} from '@skillspell/shared';
import type { AppConfig } from '../config/configuration.js';
import { TokenService } from './token.service.js';

/**
 * Core authentication service.
 *
 * Handles login validation, user registration, password hashing,
 * account lockout, and first-run setup.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds: number;
  private readonly passwordMinLength: number;
  private readonly lockoutThreshold: number;
  private readonly lockoutDurationMinutes: number;
  /**
   * A throwaway bcrypt hash used to equalize timing on the user-not-found login
   * path. Comparing against it costs ~the same as a real password check, so an
   * attacker cannot distinguish "no such user" from "wrong password" by response
   * time (user enumeration). Computed once with the configured cost factor.
   */
  private readonly dummyPasswordHash: string;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(CREDENTIAL_REPOSITORY)
    private readonly credentialRepo: ICredentialRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokenRepo: IAuthTokenRepository,
    @Inject(PAT_REPOSITORY)
    private readonly patRepo: IPersonalAccessTokenRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
  ) {
    const authConfig = this.configService.get('auth', { infer: true });
    this.bcryptRounds = authConfig.bcryptRounds;
    this.passwordMinLength = authConfig.passwordMinLength;
    this.lockoutThreshold = authConfig.lockoutThreshold;
    this.lockoutDurationMinutes = authConfig.lockoutDurationMinutes;
    this.dummyPasswordHash = bcrypt.hashSync('timing-equalizer-not-a-secret', this.bcryptRounds);
  }

  /**
   * Validate a user's email and password for local login.
   *
   * Returns the user if valid, throws UnauthorizedException otherwise.
   */
  async validateLocalUser(email: string, password: string): Promise<User> {
    // Check if password login is enabled at the organization level
    const org = await this.orgRepo.findSingleton();
    if (org && org.passwordLoginEnabled === false) {
      throw new UnauthorizedException(
        'Email/password login is disabled for this organization. Please use SSO to sign in.',
      );
    }

    const user = await this.userRepo.findByEmail(email.toLowerCase().trim());

    if (!user) {
      // Equalize timing with the wrong-password path (which runs bcrypt.compare)
      // so response time does not reveal whether the email exists.
      await bcrypt.compare(password, this.dummyPasswordHash);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }

    if (!user.authProviders.includes('local')) {
      throw new UnauthorizedException(
        'This account uses SSO login. Please sign in with your identity provider.',
      );
    }

    // Check lockout
    const credential = await this.credentialRepo.getCredential(user.id);
    if (!credential) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (credential.lockedUntil) {
      const lockExpiry = new Date(credential.lockedUntil);
      if (lockExpiry > new Date()) {
        const minutesLeft = Math.ceil(
          (lockExpiry.getTime() - Date.now()) / 60000,
        );
        throw new ForbiddenException(
          `Account is locked due to too many failed login attempts. Try again in ${minutesLeft} minute(s).`,
        );
      }
      // Lock has expired — allow the attempt through WITHOUT resetting failedAttempts.
      // Resetting before password verify lets attackers recycle their attempt budget on
      // every lock-expiry cycle. The success path clears the counter; the failure path
      // re-locks immediately because failedAttempts is still at or above the threshold.
    }

    // Verify password
    const isValid = await bcrypt.compare(password, credential.passwordHash);

    if (!isValid) {
      // Increment failed attempts
      const newAttempts = (credential.failedAttempts || 0) + 1;
      const updateData: { failedAttempts: number; lockedUntil?: string } = {
        failedAttempts: newAttempts,
      };

      if (newAttempts >= this.lockoutThreshold) {
        const lockUntil = new Date(
          Date.now() + this.lockoutDurationMinutes * 60 * 1000,
        );
        updateData.lockedUntil = lockUntil.toISOString();
        this.logger.warn(
          `Account locked for user ${user.id} (${user.email}) after ${newAttempts} failed attempts`,
        );
      }

      await this.credentialRepo.updateCredential(user.id, updateData);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset failed attempts on successful login
    if (credential.failedAttempts > 0) {
      await this.credentialRepo.updateCredential(user.id, {
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    }

    // Update last login time
    await this.userRepo.update(user.id, {
      lastLoginAt: new Date().toISOString(),
    });

    return user;
  }

  /**
   * Login with email and password, returning JWT tokens.
   */
  async login(
    email: string,
    password: string,
    deviceInfo?: string,
  ): Promise<LoginResponse> {
    const user = await this.validateLocalUser(email, password);
    const { accessToken, refreshToken } =
      await this.tokenService.generateTokenPair(user, deviceInfo);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Refresh an access token using a valid refresh token.
   */
  async refreshTokens(
    rawRefreshToken: string,
    expiredAccessToken?: string,
    deviceInfo?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Determine userId — prefer extracting from the expired access token (signature-verified),
    // but fall back to the DB record when the access token is unavailable (e.g., new tab,
    // memory cleared). The old code threw UnauthorizedException when the access token
    // was absent, defeating the purpose of httpOnly refresh token cookies.
    //
    // Security: the compound (tokenId, userId) lookup in rotateRefreshTokenForUser still
    // enforces cross-user isolation. Reading userId from the DB record is safe because we
    // then pass it into the compound lookup — an attacker cannot forge a userId mismatch
    // since the DB record is authoritative.
    // Every failure path below throws the SAME generic error. Distinct
    // messages ('Invalid refresh request' vs 'Invalid or expired refresh token'
    // vs 'User not found') would let a caller probe — by submitting a crafted
    // `tokenId.anything` — whether a given tokenId or user exists, i.e. a refresh
    // token enumeration oracle. tokenIds are random UUIDv4 (infeasible to guess),
    // but with the memory-only access token this no-access-token path is
    // now the normal cold-boot path, so we close the signal unconditionally.
    const invalidRefresh = () => new UnauthorizedException('Invalid or expired refresh token');

    let userId: string | null = null;

    if (expiredAccessToken) {
      const decoded = this.tokenService.decodeTokenIgnoringExpiry(expiredAccessToken);
      userId = decoded?.sub ?? null;
    }

    if (!userId) {
      // Access token unavailable (e.g. cold boot with a memory-only access
      // token) — resolve userId from the refresh token record itself.
      const tokenId = rawRefreshToken.split('.')[0];
      if (tokenId) {
        const record = await this.authTokenRepo.findRefreshTokenByTokenId(tokenId);
        userId = record?.userId ?? null;
      }
    }

    if (!userId) {
      // Mirror the hashing work the record-found path performs in
      // rotateRefreshTokenForUser, so the no-record path does not return
      // measurably faster (blunts the timing side of the oracle).
      this.tokenService.hashToken(rawRefreshToken);
      throw invalidRefresh();
    }

    const newRefreshToken = await this.tokenService.rotateRefreshTokenForUser(
      rawRefreshToken,
      userId,
      deviceInfo,
    );

    if (!newRefreshToken) {
      throw invalidRefresh();
    }

    // Look up user to generate new access token
    const user = await this.userRepo.findById(userId);
    if (!user || !user.isActive) {
      throw invalidRefresh();
    }

    const accessToken = this.tokenService.generateAccessToken(user);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout — revoke the user's refresh token.
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      await this.tokenService.revokeAllRefreshTokens(userId);
      return;
    }
    const tokenId = refreshToken.split('.')[0];
    if (tokenId) {
      await this.tokenService.revokeRefreshToken(tokenId, userId);
    }
  }

  /**
   * First-run setup: create the initial admin user.
   *
   * Can only be called once — uses a database constraint
   * to prevent concurrent/duplicate calls.
   */
  async setup(
    data: SetupRequest,
    deviceInfo?: string,
  ): Promise<LoginResponse> {
    // Validate before any writes
    this.validatePassword(data.password);

    // Authoritative gate: setupComplete flag is the only reliable signal.
    // findAll() is not used here because it returns deactivated users too,
    // which would block retries after a partial failure.
    const setupState = await this.authTokenRepo.getSetupState();
    if (setupState?.setupComplete) {
      throw new ConflictException('Setup has already been completed');
    }

    // Pre-hash password before any DB writes. bcrypt is the most expensive
    // operation — front-loading it eliminates the most likely mid-sequence
    // failure point.
    const passwordHash = await bcrypt.hash(data.password, this.bcryptRounds);

    // Steps 1–4 are idempotent: each step finds existing state from a prior
    // partial attempt and resumes rather than failing. No compensating cleanup
    // is needed — if setup fails mid-sequence, a retry picks up where it left
    // off. Org is a singleton and is never deleted.

    // 1. Find existing org (from a prior partial attempt) or create
    let org = await this.orgRepo.findSingleton();
    if (!org) {
      org = await this.orgRepo.create({ name: data.orgName.trim() });
    }

    // 2. Find existing user (from a prior partial attempt) or create
    const email = data.email.toLowerCase().trim();
    let user = await this.userRepo.findByEmail(email);
    if (!user) {
      const createData: CreateUserData = {
        orgId: org.id,
        email,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        role: 'owner',
        password: data.password,
      };
      user = await this.userRepo.create(createData);
    }
    // Apply timezone on every setup attempt (covers first run and retries)
    if (data.timezone && !user.timezone) {
      await this.userRepo.update(user.id, { timezone: data.timezone });
      user = { ...user, timezone: data.timezone };
    }

    // 3. Save credentials — saveCredential is an upsert in both storage
    // backends, so this is safe to re-run on retry
    await this.credentialRepo.saveCredential({
      userId: user.id,
      passwordHash,
      mustChangePassword: false,
      failedAttempts: 0,
      updatedAt: new Date().toISOString(),
    });

    // 4. Mark setup complete — terminal state, gates all future setup calls
    await this.authTokenRepo.saveSetupState({
      setupComplete: true,
      adminUserId: user.id,
      orgId: org.id,
      completedAt: new Date().toISOString(),
    });

    // 5. Generate tokens — failure here doesn't affect setup state
    const { accessToken, refreshToken } =
      await this.tokenService.generateTokenPair(user, deviceInfo);

    this.logger.log(
      `Initial setup completed. Organization "${org.name}" (${org.id}) created. Admin user: ${user.email}`,
    );

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Check if initial setup has been completed.
   */
  async getSetupStatus(): Promise<{ setupComplete: boolean }> {
    try {
      const state = await this.authTokenRepo.getSetupState();
      return { setupComplete: state?.setupComplete ?? false };
    } catch (error) {
      // If the table doesn't exist yet, setup is not complete
      this.logger.warn(
        `getSetupStatus failed: ${formatError(error)}`,
      );
      return { setupComplete: false };
    }
  }

  /**
   * Update the current user's profile (firstName, lastName).
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileRequest,
  ): Promise<User> {
    const updateData: Record<string, string> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.dateFormat !== undefined) updateData.dateFormat = data.dateFormat;

    return this.userRepo.update(userId, updateData);
  }

  /**
   * Change the current user's password.
   * Verifies the current password before setting the new one.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    // Validate new password against configurable min length
    this.validatePassword(newPassword);

    // Fetch the user's credential
    const credential = await this.credentialRepo.getCredential(userId);
    if (!credential?.passwordHash) {
      throw new BadRequestException(
        'Password change is not available for SSO-only accounts',
      );
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, credential.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash and save the new password
    const newHash = await this.hashPassword(newPassword);
    await this.credentialRepo.updateCredential(userId, {
      passwordHash: newHash,
    });

    // Revoke all refresh tokens — forces re-login on all devices.
    // This prevents a stolen refresh token from being used after a password change.
    await this.authTokenRepo.revokeAllRefreshTokens(userId);

    // Also revoke all personal access tokens. A password change is the user's
    // lever to cut off a suspected compromise; leaving long-lived PATs valid
    // would let an attacker retain read access for up to a year.
    await this.patRepo.revokeAllByUserId(userId);
  }

  /**
   * Hash a password using bcrypt.
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.bcryptRounds);
  }

  /**
   * Validate password against the configurable minimum length.
   *
   * Static password rules (uppercase, lowercase, digit, special char)
   * are enforced by class-validator decorators on the DTOs. This method
   * only checks the runtime-configurable PASSWORD_MIN_LENGTH from env.
   */
  validatePassword(password: string): void {
    if (password.length < this.passwordMinLength) {
      throw new BadRequestException(
        `Password must be at least ${this.passwordMinLength} characters`,
      );
    }
  }
}
