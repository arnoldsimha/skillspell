import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  INVITE_TOKEN_REPOSITORY,
  type IInviteTokenRepository,
  USER_REPOSITORY,
  type IUserRepository,
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
  type InviteToken,
  type InviteResult,
  type UserRole,
  type User,
} from '@skillspell/shared';
import { EmailService } from '../email/email.service.js';
import { EmailTemplateLoaderService } from '../email/email-template-loader.service.js';
import { UsersService } from './users.service.js';
import { TokenService } from '../auth/token.service.js';
import type { AppConfig } from '../config/configuration.js';

/** Invite link validity in milliseconds (1 hour). */
const INVITE_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Service for managing user invitations.
 *
 * Handles invite token generation, email dispatch, validation, and
 * registration completion.
 */
@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    @Inject(INVITE_TOKEN_REPOSITORY)
    private readonly inviteRepo: IInviteTokenRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    private readonly emailService: EmailService,
    private readonly emailTemplateLoader: EmailTemplateLoaderService,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Check whether SMTP is configured and enabled.
   * Used by the frontend to decide whether to show the invite button.
   */
  async isSmtpConfigured(): Promise<boolean> {
    return this.emailService.isConfigured();
  }

  /**
   * List unconsumed invites for the organization (both active and expired).
   * Returns a sanitized list without sensitive token data.
   * Includes an `expired` flag so the frontend can show status badges.
   */
  async listPendingInvites(orgId: string): Promise<
    Array<{
      id: string;
      email: string;
      role: UserRole;
      invitedBy: string;
      inviterName: string;
      expiresAt: string;
      createdAt: string;
      expired: boolean;
    }>
  > {
    const allInvites = await this.inviteRepo.findByOrg(orgId);
    const now = new Date();

    // Filter to unconsumed invites (both active and expired)
    const unconsumed = allInvites.filter((inv) => !inv.consumed);

    // Resolve inviter names (batch-unique to avoid duplicate lookups)
    const inviterIds = [...new Set(unconsumed.map((inv) => inv.invitedBy))];
    const inviterMap = new Map<string, string>();
    for (const id of inviterIds) {
      const inviter = await this.userRepo.findById(id);
      inviterMap.set(
        id,
        inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : 'Unknown',
      );
    }

    return unconsumed.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      invitedBy: inv.invitedBy,
      inviterName: inviterMap.get(inv.invitedBy) || 'Unknown',
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      expired: new Date(inv.expiresAt) <= now,
    }));
  }

  /**
   * Revoke (delete/consume) a pending invite so it can no longer be used.
   */
  async revokeInvite(inviteId: string, orgId: string): Promise<void> {
    const allInvites = await this.inviteRepo.findByOrg(orgId);
    const invite = allInvites.find((inv) => inv.id === inviteId);

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.consumed) {
      throw new BadRequestException('Invite has already been used');
    }

    // Mark as consumed (effectively revokes it)
    await this.inviteRepo.consume(inviteId, null);
    this.logger.log(`Invite ${inviteId} revoked for ${invite.email}`);
  }

  /**
   * Resend an invite email.
   *
   * Always generates a fresh token and resets the expiry window to 1 hour.
   * The original raw token is never stored (only its SHA-256 hash is persisted),
   * so it cannot be re-derived or re-sent. The old invite is atomically consumed
   * and replaced with a new one to prevent concurrent resend races.
   */
  async resendInvite(
    inviteId: string,
    orgId: string,
    resendByUserId: string,
  ): Promise<{ renewed: boolean }> {
    const allInvites = await this.inviteRepo.findByOrg(orgId);
    const invite = allInvites.find((inv) => inv.id === inviteId);

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.consumed) {
      throw new BadRequestException('Invite has already been used');
    }

    const now = new Date();

    // Always generate a fresh token and fresh expiry on resend.
    // We only store hashes so the original token cannot be re-derived; a new one is
    // always required. Always refreshing the expiry avoids sending an invite that
    // would expire moments after delivery.
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const replacement: InviteToken = {
      id: uuidv4(),
      orgId: invite.orgId,
      email: invite.email,
      tokenHash,
      invitedBy: resendByUserId,
      role: invite.role,
      expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS).toISOString(),
      consumed: false,
      createdAt: now.toISOString(),
    };

    // Send email FIRST — if delivery fails, nothing is committed to the DB.
    // Unlike sendInvites() (batch, failures recorded silently), resend is 1:1 so
    // the caller is notified immediately and can retry without orphaned tokens.
    await this.sendInviteEmail(rawToken, invite.email, resendByUserId);

    // Only commit after successful email delivery
    await this.inviteRepo.consumeAndReplace(inviteId, replacement);
    this.logger.log(
      `Invite resent (renewed) for ${invite.email} (old=${inviteId}, new=${replacement.id})`,
    );

    return { renewed: true };
  }

  /**
   * Send the invite email for a given raw token.
   * Extracted helper shared by sendInvites() and resendInvite().
   */
  private async sendInviteEmail(
    rawToken: string,
    email: string,
    invitedByUserId: string,
  ): Promise<void> {
    const appUrl = this.configService.get('app.publicUrl', { infer: true });
    const baseUrl = appUrl || 'http://localhost:5173';
    const inviteLink = `${baseUrl}/invite/${rawToken}`;

    const inviter = await this.userRepo.findById(invitedByUserId);
    const org = await this.orgRepo.findSingleton();
    const inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`.trim()
      : 'An administrator';
    const orgName = org?.name || 'SkillSpell';

    const vars = { inviterName, orgName, inviteLink };
    const htmlVars = {
      inviterName: this.escapeHtml(inviterName),
      orgName: this.escapeHtml(orgName),
      inviteLink: this.escapeHtml(inviteLink),
    };

    const [html, text] = await Promise.all([
      this.emailTemplateLoader.render('invite', htmlVars),
      this.emailTemplateLoader.renderText('invite', vars),
    ]);

    await this.emailService.sendEmail({
      to: email,
      subject: `You have been invited to join ${orgName} on SkillSpell`,
      html,
      text,
    });
  }

  /**
   * Send invites to multiple emails.
   * Returns per-email results (success/failure).
   */
  async sendInvites(params: {
    emails: string[];
    role: UserRole;
    invitedBy: string;
    orgId: string;
  }): Promise<InviteResult[]> {
    // Verify SMTP is configured
    const smtpConfigured = await this.emailService.isConfigured();
    if (!smtpConfigured) {
      throw new BadRequestException(
        'Email (SMTP) is not configured. Please configure SMTP in Organization Settings before sending invites.',
      );
    }

    const results: InviteResult[] = [];
    const uniqueEmails = [...new Set(params.emails.map(e => e.toLowerCase().trim()))];

    for (const email of uniqueEmails) {
      try {
        // Check if email is already registered
        const existingUser = await this.userRepo.findByEmail(email);
        if (existingUser) {
          results.push({
            email,
            success: false,
            error: 'Email is already registered',
          });
          continue;
        }

        // Generate secure token
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const now = new Date();

        const invite: InviteToken = {
          id: uuidv4(),
          orgId: params.orgId,
          email,
          tokenHash,
          invitedBy: params.invitedBy,
          role: params.role,
          expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS).toISOString(),
          consumed: false,
          createdAt: now.toISOString(),
        };

        // Send email first — if it fails, no token is persisted and the
        // failure is recorded without leaving a live-but-undelivered token.
        await this.sendInviteEmail(rawToken, email, params.invitedBy);

        await this.inviteRepo.create(invite);

        results.push({ email, success: true });
        this.logger.log(
          `Invite sent to ${email} by user ${params.invitedBy}`,
        );
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : String(err);
        const message = err instanceof HttpException ? (err as HttpException).message : 'Failed to send invite';
        this.logger.warn(`Failed to invite ${email}: ${rawMessage}`);
        results.push({ email, success: false, error: message });
      }
    }

    return results;
  }

  /**
   * Validate an invite token.
   * Returns the invite if valid.
   *
   * @throws NotFoundException if token not found
   * @throws GoneException if token expired or already consumed
   */
  async validateToken(rawToken: string): Promise<InviteToken> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invite = await this.inviteRepo.findByTokenHash(tokenHash);

    if (!invite) {
      throw new NotFoundException('Invitation not found or invalid');
    }

    if (invite.consumed) {
      throw new GoneException(
        'This invitation has already been used',
      );
    }

    if (new Date(invite.expiresAt) < new Date()) {
      throw new GoneException(
        'This invitation has expired. Please ask your administrator for a new invite.',
      );
    }

    return invite;
  }

  /**
   * Complete registration from an invite.
   * Creates the user, consumes the token, returns login credentials.
   *
   * TOCTOU mitigation — the token is consumed (marked used) BEFORE user creation.
   * Two concurrent requests both pass validateToken since it is a read-only check, but
   * only the first one to reach the consume call wins the "first write". The second
   * concurrent request, if it races past validateToken, will attempt to create a user
   * for an already-consumed token. The email uniqueness check (ConflictException) or
   * the consumed flag on a subsequent re-read will block it. Consuming early means
   * that if user creation fails, the token is permanently consumed (no replay) — this
   * is the safe failure direction: the admin can issue a new invite.
   *
   * @throws GoneException if token expired or consumed
   * @throws ConflictException if email was registered since invite was sent
   */
  async completeInvite(
    rawToken: string,
    data: { firstName: string; lastName: string; password: string },
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    // Validate the token (read-only — not yet consumed)
    const invite = await this.validateToken(rawToken);

    // Double-check email isn't already registered (race condition guard)
    const existingUser = await this.userRepo.findByEmail(invite.email);
    if (existingUser) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    // Consume the token FIRST before creating the user. This means a second
    // concurrent request that also passed validateToken will find consumed=true on
    // the next validateToken call (or hit the email ConflictException), preventing
    // the token from being replayed. Consuming null for userId here; it will be
    // updated after successful user creation below.
    await this.inviteRepo.consume(invite.id, null);

    // Safety: invites should never carry the 'owner' role (owner is only assigned
    // during initial setup or via explicit transfer). Downgrade to 'user' if found.
    const safeRole: 'user' | 'admin' =
      invite.role === 'owner' ? 'user' : invite.role;

    // Create the user via UsersService (handles password hashing, credential creation)
    let user = await this.usersService.create({
      email: invite.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: safeRole,
      password: data.password,
    });

    // Update the consumed record with the actual userId now that we have it
    await this.inviteRepo.consume(invite.id, user.id);

    // Apply org default timezone to the new user if configured
    const org = await this.orgRepo.findSingleton();
    if (org?.defaultTimezone) {
      await this.userRepo.update(user.id, { timezone: org.defaultTimezone });
      user = { ...user, timezone: org.defaultTimezone };
    }

    this.logger.log(
      `Invite ${invite.id} consumed — user ${user.id} (${invite.email}) created`,
    );

    // Generate login tokens so the user is auto-logged in
    const tokens = await this.tokenService.generateTokenPair(user);

    // Record the first login timestamp (same as regular login flow)
    await this.userRepo.update(user.id, {
      lastLoginAt: new Date().toISOString(),
    });

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────────

  /** Escape HTML special characters for safe interpolation into HTML templates. */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
