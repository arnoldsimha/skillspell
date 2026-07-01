import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type {
  SmtpConfig,
  ISmtpConfigRepository,
  IOrganizationRepository,
} from '@skillspell/shared';
import {
  SMTP_CONFIG_REPOSITORY,
  ORGANIZATION_REPOSITORY,
} from '@skillspell/shared';
import { EncryptionService } from '../common/services/encryption.service.js';

/**
 * Email service that sends emails via the organization's SMTP configuration.
 *
 * Loads the SMTP config directly from the repository (no dependency on
 * OrganizationModule), decrypts the password, and creates a one-shot
 * nodemailer transport per operation so config changes take effect immediately.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(SMTP_CONFIG_REPOSITORY)
    private readonly smtpConfigRepo: ISmtpConfigRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Send an email using the organization's SMTP configuration.
   *
   * @throws Error if SMTP is not configured or not enabled.
   */
  async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<void> {
    const config = await this.loadSmtpConfig();

    const transport = this.createTransport(config);

    try {
      await transport.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        replyTo: config.replyToEmail
          ? `"${config.replyToName || config.fromName}" <${config.replyToEmail}>`
          : undefined,
        to: options.to,
        cc: config.defaultCc || undefined,
        bcc: config.defaultBcc || undefined,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(`Email sent to ${options.to}: "${options.subject}"`);
    } finally {
      transport.close();
    }
  }

  /**
   * Test SMTP connectivity only — calls transport.verify().
   * Does NOT send any email. Validates host, port, security, and credentials.
   *
   * Uses the saved SMTP configuration from the database.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = await this.loadSmtpConfig();
    return this.verifyTransport(config);
  }

  /**
   * Test SMTP connectivity with ad-hoc config (not yet saved).
   *
   * Accepts raw config fields from the request body so the admin can
   * test the connection *before* persisting the configuration.
   */
  async testConnectionWithConfig(params: {
    host: string;
    port: number;
    security: 'none' | 'starttls' | 'tls';
    authMethod: 'none' | 'plain' | 'oauth2';
    username?: string;
    password?: string;
    rejectUnauthorized?: boolean;
    connectionTimeoutMs?: number;
    socketTimeoutMs?: number;
  }): Promise<{ success: boolean; message: string }> {
    const config = {
      host: params.host,
      port: params.port,
      security: params.security,
      authMethod: params.authMethod,
      username: params.username ?? '',
      encryptedPassword: '',
      fromEmail: '',
      fromName: '',
      enabled: true,
      rejectUnauthorized: params.rejectUnauthorized ?? true,
      connectionTimeoutMs: params.connectionTimeoutMs ?? 10000,
      socketTimeoutMs: params.socketTimeoutMs ?? 30000,
      createdAt: '',
      updatedAt: '',
      decryptedPassword: params.password,
    };
    return this.verifyTransport(config);
  }

  /**
   * Verify transport connectivity — shared between testConnection() and
   * testConnectionWithConfig().
   */
  private async verifyTransport(
    config: SmtpConfig & { decryptedPassword?: string },
  ): Promise<{ success: boolean; message: string }> {
    const transport = this.createTransport(config);
    try {
      await transport.verify();
      this.logger.log(
        `SMTP connection test successful (host=${config.host}:${config.port})`,
      );
      return {
        success: true,
        message: `Successfully connected to ${config.host}:${config.port}`,
      };
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`SMTP connection test failed: ${rawMessage}`);
      return {
        success: false,
        message: this.humanizeSmtpError(error, config.host, config.port),
      };
    } finally {
      transport.close();
    }
  }

  /**
   * Send a test email to verify the full SMTP pipeline works end-to-end.
   */
  async sendTestEmail(
    recipientEmail: string,
  ): Promise<{ success: boolean; message: string }> {
    let host = '';
    let port = 0;
    try {
      const config = await this.loadSmtpConfig();
      host = config.host;
      port = config.port;
      await this.sendEmail({
        to: recipientEmail,
        subject: 'SkillSpell SMTP Test Email',
        html: [
          '<h2>SMTP Configuration Test</h2>',
          '<p>This is a test email from your SkillSpell instance.</p>',
          '<p>If you received this email, your SMTP configuration is working correctly.</p>',
          `<p><small>Sent at ${new Date().toISOString()}</small></p>`,
        ].join('\n'),
        text: [
          'SMTP Configuration Test',
          '',
          'This is a test email from your SkillSpell instance.',
          'If you received this email, your SMTP configuration is working correctly.',
          '',
          `Sent at ${new Date().toISOString()}`,
        ].join('\n'),
      });

      return {
        success: true,
        message: `Test email sent successfully to ${recipientEmail}`,
      };
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Test email failed: ${rawMessage}`);
      return {
        success: false,
        message: this.humanizeSmtpError(error, host, port),
      };
    }
  }

  /**
   * Check if SMTP is configured and enabled for the organization.
   */
  async isConfigured(): Promise<boolean> {
    try {
      const org = await this.orgRepo.findSingleton();
      if (!org) return false;
      const config = await this.smtpConfigRepo.getSmtpConfig(org.id);
      return config !== null && config.enabled;
    } catch {
      return false;
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /**
   * Load and validate the SMTP config from the organization.
   * Decrypts the password if authMethod is 'plain'.
   */
  private async loadSmtpConfig(): Promise<
    SmtpConfig & { decryptedPassword?: string }
  > {
    const org = await this.orgRepo.findSingleton();
    if (!org) {
      throw new Error('No organization found');
    }

    const config = await this.smtpConfigRepo.getSmtpConfig(org.id);

    if (!config) {
      throw new Error('SMTP is not configured for this organization');
    }
    if (!config.enabled) {
      throw new Error('SMTP is configured but not enabled');
    }

    // Decrypt password if auth requires it
    let decryptedPassword: string | undefined;
    if (config.authMethod === 'plain' && config.encryptedPassword) {
      decryptedPassword = this.encryptionService.decrypt(
        config.encryptedPassword,
      );
    }

    return { ...config, decryptedPassword };
  }

  /**
   * Create a nodemailer transport from the SMTP config.
   * Transport is not cached — created per operation so config changes
   * take effect immediately.
   */
  private createTransport(
    config: SmtpConfig & { decryptedPassword?: string },
  ): Transporter {
    const secure = config.security === 'tls';
    const requireTls = config.security === 'starttls';

    const auth =
      config.authMethod === 'plain' && config.username
        ? {
            user: config.username,
            pass: config.decryptedPassword || '',
          }
        : undefined;

    return createTransport({
      host: config.host,
      port: config.port,
      secure, // true for port 465 (TLS), false for STARTTLS or none
      requireTLS: requireTls,
      auth,
      connectionTimeout: config.connectionTimeoutMs,
      socketTimeout: config.socketTimeoutMs,
      tls: {
        rejectUnauthorized: config.rejectUnauthorized,
      },
    });
  }

  /**
   * Map raw nodemailer / Node.js network error codes to human-friendly
   * messages.
   *
   * Error codes reference:
   *   - Nodemailer: https://nodemailer.com/errors/
   *   - Node.js: standard socket/DNS error codes (ENOTFOUND, ECONNREFUSED, etc.)
   */
  private humanizeSmtpError(
    error: unknown,
    host: string,
    port: number,
  ): string {
    if (!(error instanceof Error)) return 'An unknown error occurred';

    const code = (error as NodeJS.ErrnoException).code ?? '';
    const errMsg = error.message ?? '';

    // Nodemailer + Node.js error codes → user-friendly messages
    const friendlyMap: Record<string, string> = {
      // ── Connection ──────────────────────────────────────────────────
      ECONNECTION: `Connection to ${host}:${port} closed unexpectedly. Check the host, port, and security settings.`,
      ETIMEDOUT: `Connection to ${host}:${port} timed out. Check the host, port, and firewall settings.`,
      EDNS: `DNS resolution failed for "${host}". Please verify the SMTP host address.`,
      ESOCKET: `Socket error connecting to ${host}:${port}. The port or security setting may be incorrect.`,
      ENOTFOUND: `Could not resolve hostname "${host}". Please check the SMTP host address.`,
      ECONNREFUSED: `Connection refused by ${host}:${port}. The server may be down or the port may be wrong.`,
      ECONNRESET: `Connection was reset by ${host}:${port}. The server closed the connection unexpectedly.`,
      ENETUNREACH: `Network unreachable — cannot reach ${host}. Check your network connection.`,
      EHOSTUNREACH: `Host unreachable — cannot reach ${host}. Check the host address.`,
      EPIPE: `Broken connection to ${host}:${port}. The server closed the connection.`,

      // ── TLS / Security ──────────────────────────────────────────────
      ETLS: `TLS handshake failed with ${host}:${port}. Check the security setting and port. Try a different Security mode (e.g., STARTTLS vs TLS).`,
      EREQUIRETLS: `The server ${host}:${port} does not support the required TLS extension (RFC 8689). Try a different Security mode.`,
      CERT_HAS_EXPIRED: `The TLS certificate for ${host} has expired. Disable "Verify TLS certificates" for testing, or update the server certificate.`,
      DEPTH_ZERO_SELF_SIGNED_CERT: `${host} uses a self-signed certificate. Disable "Verify TLS certificates" if this is expected.`,
      UNABLE_TO_VERIFY_LEAF_SIGNATURE: `Unable to verify the TLS certificate for ${host}. The certificate chain may be incomplete.`,
      SELF_SIGNED_CERT_IN_CHAIN: `${host} has a self-signed certificate in the chain. Disable "Verify TLS certificates" if this is expected.`,
      ERR_TLS_CERT_ALTNAME_INVALID: `The TLS certificate for ${host} does not match the hostname. Check the SMTP host address.`,

      // ── Authentication ──────────────────────────────────────────────
      EAUTH: 'Authentication failed. Please check the username and password.',
      ENOAUTH: 'Authentication credentials were not provided but the server requires them. Set the Auth Method to "Password" and enter credentials.',
      EOAUTH2: 'OAuth2 token error. The access token may be invalid or expired.',

      // ── Envelope / Message ──────────────────────────────────────────
      EENVELOPE: 'Invalid mail envelope. Check the From Email and recipient addresses.',
      EMESSAGE: 'Failed to compose the email message.',
      ESTREAM: 'Error processing the email stream.',

      // ── Protocol / Server ───────────────────────────────────────────
      EPROTOCOL: `The SMTP server at ${host}:${port} returned an invalid response. Verify the port and security settings.`,
      EMAXLIMIT: 'Connection pool limit reached. Try again in a moment.',
      ECONFIG: 'Invalid SMTP configuration. Please review all settings.',

      // ── Proxy / Network ─────────────────────────────────────────────
      EPROXY: `Proxy connection error to ${host}:${port}.`,

      // ── Content ─────────────────────────────────────────────────────
      EFILEACCESS: 'Attachment file access was rejected.',
      EURLACCESS: 'URL access for attachment was rejected.',
      EFETCH: 'Failed to fetch remote content for the email.',

      // ── Transport ───────────────────────────────────────────────────
      ESENDMAIL: 'Sendmail command failed.',
      ESES: 'AWS SES error occurred.',
    };

    // Try exact code match first
    if (code && friendlyMap[code]) {
      return friendlyMap[code];
    }

    // Try matching against the error message for TLS/cert errors that embed codes
    for (const [key, msg] of Object.entries(friendlyMap)) {
      if (errMsg.includes(key)) {
        return msg;
      }
    }

    // SSL/TLS version mismatch — most common when security mode doesn't match port
    if (errMsg.includes('wrong version number')) {
      return `TLS/port mismatch on ${host}:${port}. The Security mode does not match what the server expects on this port. ` +
        `Port 465 requires "TLS", port 587 requires "STARTTLS", and port 25 typically uses "None" or "STARTTLS".`;
    }

    // STARTTLS-specific errors
    if (errMsg.includes('STARTTLS') || errMsg.includes('upgrading connection')) {
      return `STARTTLS negotiation failed with ${host}:${port}. The server may not support STARTTLS on this port. Try a different security mode or port.`;
    }

    // Greeting errors (server rejected the connection)
    if (errMsg.includes('greeting') || errMsg.includes('421') || errMsg.includes('450')) {
      return `The SMTP server at ${host}:${port} rejected the connection. It may be temporarily unavailable or rate-limiting.`;
    }

    // Generic auth errors
    if (errMsg.toLowerCase().includes('invalid login') || errMsg.toLowerCase().includes('authentication')) {
      return 'Authentication failed. Please check the username and password.';
    }

    // Fallback — return a generic message to avoid leaking infrastructure details
    return 'SMTP connection failed. Check host, port, and security settings.';
  }
}
