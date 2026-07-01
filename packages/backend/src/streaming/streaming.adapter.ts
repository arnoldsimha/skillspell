import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger, type INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter wired to the **Redis pub/sub adapter** so rooms and
 * broadcasts span every backend pod. Required for multi-instance deployments
 * (k8s): `server.to(userId).emit(...)` and cluster-wide presence checks
 * (`server.in(userId).fetchSockets()`) only work across pods when a shared
 * Redis adapter is installed — without it, each pod is an island.
 *
 * `connectToRedis()` must be awaited during bootstrap before the adapter is
 * passed to `app.useWebSocketAdapter(...)`.
 */
export class StreamingAdapter extends IoAdapter {
  private readonly logger = new Logger(StreamingAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(private readonly appContext: INestApplicationContext) {
    super(appContext);
  }

  /** Connect the Redis pub/sub client pair and build the Socket.IO adapter. */
  async connectToRedis(): Promise<void> {
    const config = this.appContext.get(ConfigService);
    const host = config.get<string>('redis.host');
    const port = config.get<number>('redis.port');
    const password = config.get<string>('redis.password');

    // maxRetriesPerRequest: null is recommended for pub/sub clients so commands
    // queue (not fail) while Redis briefly reconnects.
    this.pubClient = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
    });
    this.subClient = this.pubClient.duplicate();

    for (const [name, client] of [
      ['pub', this.pubClient],
      ['sub', this.subClient],
    ] as const) {
      client.on('error', (err: Error) =>
        this.logger.error(`Redis ${name} client error: ${err.message}`),
      );
    }

    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log(
      `Socket.IO Redis adapter ready (${host}:${port}) — rooms/broadcasts span all pods`,
    );
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      path: '/stream',
      cors: {
        origin: process.env.NODE_ENV !== 'production',
        credentials: true,
      },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    } else {
      this.logger.warn(
        'Socket.IO Redis adapter not initialized — falling back to in-memory ' +
          '(single-pod) adapter. Call connectToRedis() during bootstrap.',
      );
    }
    return server;
  }
}
