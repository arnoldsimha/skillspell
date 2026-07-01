import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import {
  SESSION_REPOSITORY,
  type ISessionRepository,
} from '@skillspell/shared';

/**
 * Manages skill session conversation history stored in the database.
 *
 * Provides a rolling-window buffer of user/assistant messages that can be
 * replayed into agent prompts for refinement. Messages are capped at
 * a configurable maximum via atomic eviction on append.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly maxMessages: number;

  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: ISessionRepository,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    const sessionConfig = this.configService.get('session', { infer: true });
    this.maxMessages = sessionConfig.maxMessages || 20;

    this.logger.log(
      `SessionService initialized — maxMessages: ${this.maxMessages}`,
    );
  }

  /**
   * Save the user prompt after generation/refinement.
   *
   * Only the user prompt is stored — the assistant response (skill JSON) is
   * already persisted on the Skill / version-snapshot rows, so duplicating
   * it here would be redundant.
   */
  async saveUserPrompt(
    skillId: string,
    userContent: string,
  ): Promise<void> {
    await this.sessionRepo.appendWithEviction(
      skillId,
      { role: 'user', content: userContent },
      this.maxMessages,
    );

    this.logger.log(
      `Saved session prompt for skill ${skillId} (max ${this.maxMessages} messages)`,
    );
  }

  /**
   * Load conversation history for a skill session.
   * Returns messages in chronological order (oldest first),
   * formatted for prompt injection.
   */
  async loadHistory(
    skillId: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const messages = await this.sessionRepo.getMessages(skillId);
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * Delete all session messages for a skill.
   * Called when a skill is deleted.
   */
  async deleteSession(skillId: string): Promise<void> {
    await this.sessionRepo.deleteSession(skillId);
  }
}
