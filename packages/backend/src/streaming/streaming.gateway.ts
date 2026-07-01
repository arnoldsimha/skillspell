import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Logger, UsePipes, ValidationPipe, type OnApplicationShutdown } from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Server, Socket } from 'socket.io';
import { Subject } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard.js';
import { OwnershipService } from '../ownership/ownership.service.js';
import { GenerationService } from '../generation/generation.service.js';
import { EvalExecutionService } from '../eval/eval-execution.service.js';
import { EvalFeedbackService } from '../eval/eval-feedback.service.js';
import { SkillOptimizationService } from '../eval/optimization/skill-optimization.service.js';
import type { RunEvalsDto } from '../eval/dto/index.js';
import type { User } from '@skillspell/shared';
import { normalizeSkillName } from '../common/utils/normalize-skill-name.js';

class GeneratePayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  skillName?: string;
}

class RefinePayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;

  @IsUUID()
  skillId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  refinement!: string;
}

class OptimizeDraftPayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;

  @IsUUID()
  skillId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  refinement!: string;

  @IsOptional()
  @IsObject()
  draftContext?: {
    name: string;
    description: string;
    skillContent: string;
    scripts: Array<{ name: string; content: string }>;
    references: Array<{ name: string; content: string }>;
    assets: Array<{ name: string; content: string }>;
  };
}

class RunEvalsPayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;

  @IsUUID()
  skillId!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  evalIds?: string[];

  @IsObject()
  config!: { maxTokens?: number; temperature?: number; compareBaseline?: boolean };

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  runsPerCase?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetVersion?: number;
}

class GenerateEvalsPayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;

  @IsUUID()
  skillId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  coverageHint?: string;
}

class OptimizeSkillPayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;

  @IsUUID()
  skillId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxIterations?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  targetPassRate?: number;

  @IsOptional()
  @IsBoolean()
  includeFeedback?: boolean;

  @IsOptional()
  @IsIn(['main', 'light'])
  evalModel?: 'main' | 'light';
}

class CancelPayload {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  requestId!: string;
}

@Injectable()
@WebSocketGateway()
export class StreamGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(StreamGateway.name);

  /** Grace window after a socket drops before its in-flight work is aborted,
   *  giving the client time to reconnect (network blip, k8s LB rebalance, refresh). */
  private static readonly DISCONNECT_GRACE_MS = 30_000;

  /** Set on SIGTERM (k8s pod recycle). While true, new ops are rejected and
   *  in-flight ops have been notified as interrupted+retryable. */
  private shuttingDown = false;

  constructor(
    private readonly wsJwtGuard: WsJwtGuard,
    private readonly ownershipService: OwnershipService,
    private readonly generationService: GenerationService,
    private readonly evalExecutionService: EvalExecutionService,
    private readonly evalFeedbackService: EvalFeedbackService,
    private readonly skillOptimizationService: SkillOptimizationService,
    private readonly cls: ClsService,
  ) {}

  private runWithUser(client: Socket, fn: () => Promise<void>): Promise<void> {
    const user = client.data.user as User;
    return this.cls.run(async () => {
      this.cls.set('userId', user.id);
      this.cls.set('user', user);
      this.cls.set('userRole', user.role);
      await fn();
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth['token'] as string | undefined;
    try {
      const user = await this.wsJwtGuard.authenticate(token);
      client.data.user = user;
      client.data.activeRequests = new Map<string, AbortController>();
      // Join a per-user room so stream events reach the user on whichever pod
      // their (possibly reconnected) socket lives on — see StreamingAdapter.
      await client.join(user.id);
      this.logger.log(`WS connected userId=${user.id} socketId=${client.id}`);
    } catch (err) {
      this.logger.warn(`WS connection rejected socketId=${client.id} — ${(err as Error).message}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  /**
   * On disconnect, do NOT abort in-flight work immediately. A transient drop
   * (k8s LB rebalance, network blip, tab refresh) shouldn't kill multi-minute
   * LLM operations. Wait a grace period, then abort only if the user has no
   * live socket anywhere in the cluster. During the window the work keeps
   * running and streams to the per-user room, so a reconnect (even to another
   * pod) keeps receiving events.
   */
  handleDisconnect(client: Socket): void {
    const activeRequests = client.data.activeRequests as Map<string, AbortController> | undefined;
    const userId = (client.data.user as User | undefined)?.id;
    const pending = activeRequests?.size ?? 0;

    if (!activeRequests || pending === 0 || !userId) {
      this.logger.log(
        `WS disconnected userId=${userId ?? 'unauthenticated'} socketId=${client.id} abortedRequests=0`,
      );
      return;
    }

    this.logger.log(
      `WS disconnected userId=${userId} socketId=${client.id} — ${pending} request(s) ` +
        `held for ${StreamGateway.DISCONNECT_GRACE_MS}ms grace`,
    );
    setTimeout(() => {
      void this.abortIfUserGone(userId, activeRequests, client.id);
    }, StreamGateway.DISCONNECT_GRACE_MS);
  }

  /**
   * After the grace window, abort the socket's still-running requests only if
   * the user has reconnected nowhere in the cluster. Requests that completed
   * during the window have already removed themselves from the map.
   */
  private async abortIfUserGone(
    userId: string,
    activeRequests: Map<string, AbortController>,
    lastSocketId: string,
  ): Promise<void> {
    if (activeRequests.size === 0) return;

    let liveSockets = 0;
    try {
      // With the Redis adapter, fetchSockets() spans all pods.
      const sockets = await this.server.in(userId).fetchSockets();
      liveSockets = sockets.length;
    } catch (err) {
      this.logger.warn(
        `presence check failed for userId=${userId}: ${(err as Error).message} — aborting to be safe`,
      );
    }

    if (liveSockets > 0) {
      this.logger.log(
        `grace: userId=${userId} reconnected (${liveSockets} live socket(s)) — ` +
          `keeping ${activeRequests.size} request(s) running`,
      );
      return;
    }

    const count = activeRequests.size;
    for (const ac of activeRequests.values()) {
      ac.abort();
    }
    this.logger.log(
      `grace expired: userId=${userId} gone — aborted ${count} request(s) (last socketId=${lastSocketId})`,
    );
  }

  /**
   * Reject a new op while the pod is draining (SIGTERM received). Emits a
   * retryable `interrupted` terminal event so the client retries against a
   * healthy pod instead of starting work that's about to be SIGKILLed.
   */
  private rejectIfDraining(userId: string, requestId: string): boolean {
    if (!this.shuttingDown) return false;
    this.server.to(userId).emit('stream-event', {
      requestId,
      type: 'interrupted',
      reason: 'server-restart',
      retryable: true,
    });
    return true;
  }

  /**
   * k8s graceful shutdown (SIGTERM). The work runs in THIS pod's memory and
   * cannot survive the pod being killed (that's Step 2's limit — true survival
   * is the job-queue work). So instead of dying silently, notify every in-flight
   * request as interrupted+retryable (delivered via the per-user room, which the
   * Redis adapter still flushes during the grace period) so the UI never hangs,
   * then abort. The client retries against a healthy pod; an optimize run resumes
   * from its last DraftStore checkpoint.
   */
  onApplicationShutdown(signal?: string): void {
    this.shuttingDown = true;
    const localSockets = this.server.sockets?.sockets as
      | Map<string, Socket>
      | undefined;
    if (!localSockets || localSockets.size === 0) return;

    let interrupted = 0;
    for (const socket of localSockets.values()) {
      const activeRequests = socket.data.activeRequests as
        | Map<string, AbortController>
        | undefined;
      const userId = (socket.data.user as User | undefined)?.id;
      if (!activeRequests || activeRequests.size === 0 || !userId) continue;

      for (const [requestId, ac] of activeRequests.entries()) {
        this.server.to(userId).emit('stream-event', {
          requestId,
          type: 'interrupted',
          reason: 'server-restart',
          retryable: true,
        });
        ac.abort();
        interrupted++;
      }
    }
    if (interrupted > 0) {
      this.logger.warn(
        `Shutdown (${signal ?? 'signal'}): notified + aborted ${interrupted} in-flight request(s) as retryable`,
      );
    }
  }

  @SubscribeMessage('generate')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleGenerate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GeneratePayload,
  ): Promise<void> {
    const { requestId, prompt, skillName } = payload;
    if (!client.data.activeRequests) return;
    const userId = (client.data.user as User).id;
    if (this.rejectIfDraining(userId, requestId)) return;
    const ac = new AbortController();
    (client.data.activeRequests as Map<string, AbortController>).set(requestId, ac);

    this.logger.log(`generate started userId=${userId} requestId=${requestId}`);
    try {
      await this.runWithUser(client, async () => {
        this.server.to(userId).emit('stream-event', { requestId, type: 'generate-started' });
        const result = await this.generationService.generateSkill({ prompt, skillName: normalizeSkillName(skillName ?? prompt.slice(0, 60)) as string, signal: ac.signal });
        this.server.to(userId).emit('stream-event', { requestId, type: 'generate-complete', data: result });
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        this.logger.error(`generate failed userId=${userId} requestId=${requestId} error=${message}`);
        this.server.to(userId).emit('stream-event', { requestId, type: 'generate-error', message });
      }
    } finally {
      (client.data.activeRequests as Map<string, AbortController>)?.delete(requestId);
    }
  }

  @SubscribeMessage('refine')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleRefine(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RefinePayload,
  ): Promise<void> {
    const { requestId, skillId, refinement } = payload;
    if (!client.data.activeRequests) return;
    const userId = (client.data.user as User).id;
    if (this.rejectIfDraining(userId, requestId)) return;
    const ac = new AbortController();
    (client.data.activeRequests as Map<string, AbortController>).set(requestId, ac);

    this.logger.log(`refine started userId=${userId} skillId=${skillId} requestId=${requestId}`);
    try {
      await this.runWithUser(client, async () => {
        await this.ownershipService.assertOwnership(skillId);

        this.server.to(userId).emit('stream-event', { requestId, type: 'refine-started' });
        const result = await this.generationService.refineSkill(skillId, refinement, ac.signal);
        this.server.to(userId).emit('stream-event', { requestId, type: 'refine-complete', data: result });
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        this.logger.error(`refine failed userId=${userId} skillId=${skillId} requestId=${requestId} error=${message}`);
        this.server.to(userId).emit('stream-event', { requestId, type: 'refine-error', message });
      }
    } finally {
      (client.data.activeRequests as Map<string, AbortController>)?.delete(requestId);
    }
  }

  @SubscribeMessage('optimize-draft')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleOptimizeDraft(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: OptimizeDraftPayload,
  ): Promise<void> {
    const { requestId, skillId, refinement, draftContext } = payload;
    if (!client.data.activeRequests) return;
    const userId = (client.data.user as User).id;
    if (this.rejectIfDraining(userId, requestId)) return;
    const ac = new AbortController();
    (client.data.activeRequests as Map<string, AbortController>).set(requestId, ac);

    this.logger.log(`optimize-draft started userId=${userId} skillId=${skillId} requestId=${requestId}`);
    try {
      await this.runWithUser(client, async () => {
        await this.ownershipService.assertOwnership(skillId);

        this.server.to(userId).emit('stream-event', { requestId, type: 'optimize-draft-started' });
        const result = await this.generationService.optimizeDraft(
          skillId,
          refinement,
          draftContext,
          ac.signal,
        );
        this.server.to(userId).emit('stream-event', { requestId, type: 'optimize-draft-complete', data: result });
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        this.logger.error(`optimize-draft failed userId=${userId} skillId=${skillId} requestId=${requestId} error=${message}`);
        this.server.to(userId).emit('stream-event', { requestId, type: 'optimize-draft-error', message });
      }
    } finally {
      (client.data.activeRequests as Map<string, AbortController>)?.delete(requestId);
    }
  }

  @SubscribeMessage('run-evals')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleRunEvals(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RunEvalsPayload,
  ): Promise<void> {
    const { requestId, skillId, ...dtoFields } = payload;
    if (!client.data.activeRequests) return;
    const userId = (client.data.user as User).id;
    if (this.rejectIfDraining(userId, requestId)) return;
    const ac = new AbortController();
    (client.data.activeRequests as Map<string, AbortController>).set(requestId, ac);

    const subject = new Subject<MessageEvent>();
    const subscription = subject.subscribe({
      next: (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as { type: string; data?: unknown };
          this.server.to(userId).emit('stream-event', { requestId, type: parsed.type, ...(parsed.data as object ?? {}) });
        } catch { /* ignore malformed */ }
      },
    });

    this.logger.log(`run-evals started userId=${userId} skillId=${skillId} requestId=${requestId}`);
    try {
      await this.runWithUser(client, async () => {
        await this.ownershipService.assertOwnership(skillId);

        const dto: RunEvalsDto = dtoFields;
        await this.evalExecutionService.runEvalsStreamed(skillId, dto, subject, ac);
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        this.logger.error(`run-evals failed userId=${userId} skillId=${skillId} requestId=${requestId} error=${message}`);
        this.server.to(userId).emit('stream-event', { requestId, type: 'eval-run-error', message });
      }
    } finally {
      subscription.unsubscribe();
      (client.data.activeRequests as Map<string, AbortController>)?.delete(requestId);
    }
  }

  @SubscribeMessage('generate-evals')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleGenerateEvals(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GenerateEvalsPayload,
  ): Promise<void> {
    const { requestId, skillId, count, coverageHint } = payload;
    if (!client.data.activeRequests) return;
    const userId = (client.data.user as User).id;
    if (this.rejectIfDraining(userId, requestId)) return;
    const ac = new AbortController();
    (client.data.activeRequests as Map<string, AbortController>).set(requestId, ac);

    this.logger.log(`generate-evals started userId=${userId} skillId=${skillId} count=${count} requestId=${requestId}`);
    try {
      await this.runWithUser(client, async () => {
        await this.ownershipService.assertOwnership(skillId);

        const progressCb = (
          phase: 'analyzing' | 'generating',
          current: number,
          total: number,
        ) => {
          this.server.to(userId).emit('stream-event', { requestId, type: 'generate-progress', phase, current, total });
        };

        const cases = await this.evalFeedbackService.generateTestEvals(
          skillId,
          count,
          ac.signal,
          progressCb,
          coverageHint,
        );

        this.server.to(userId).emit('stream-event', { requestId, type: 'generate-complete', cases });
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        this.logger.error(`generate-evals failed userId=${userId} skillId=${skillId} requestId=${requestId} error=${message}`);
        this.server.to(userId).emit('stream-event', { requestId, type: 'generate-evals-error', message });
      }
    } finally {
      (client.data.activeRequests as Map<string, AbortController>)?.delete(requestId);
    }
  }

  @SubscribeMessage('optimize-skill')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleOptimizeSkill(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: OptimizeSkillPayload,
  ): Promise<void> {
    const { requestId, skillId, maxIterations, targetPassRate, includeFeedback, evalModel } = payload;
    if (!client.data.activeRequests) return;
    const userId = (client.data.user as User).id;
    if (this.rejectIfDraining(userId, requestId)) return;
    const ac = new AbortController();
    (client.data.activeRequests as Map<string, AbortController>).set(requestId, ac);

    const subject = new Subject<MessageEvent>();
    const subscription = subject.subscribe({
      next: (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as { type: string; data?: unknown };
          this.server.to(userId).emit('stream-event', { requestId, type: parsed.type, ...(parsed.data as object ?? {}) });
        } catch { /* ignore malformed */ }
      },
    });

    this.logger.log(`optimize-skill started userId=${userId} skillId=${skillId} requestId=${requestId}`);
    try {
      await this.runWithUser(client, async () => {
        await this.ownershipService.assertOwnership(skillId);

        await this.skillOptimizationService.runLoop(
          skillId,
          { maxIterations: maxIterations ?? 3, targetPassRate, includeFeedback, evalModel },
          subject,
          ac,
        );
      });
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        this.logger.error(`optimize-skill failed userId=${userId} skillId=${skillId} requestId=${requestId} error=${message}`);
        this.server.to(userId).emit('stream-event', { requestId, type: 'optimization-error', message });
      }
    } finally {
      subscription.unsubscribe();
      (client.data.activeRequests as Map<string, AbortController>)?.delete(requestId);
    }
  }

  @SubscribeMessage('cancel')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  handleCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: CancelPayload,
  ): void {
    if (!client.data.activeRequests) return;
    const { requestId } = payload;
    (client.data.activeRequests as Map<string, AbortController>).get(requestId)?.abort();
    (client.data.activeRequests as Map<string, AbortController>).delete(requestId);
  }
}
