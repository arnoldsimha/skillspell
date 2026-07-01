import { StreamGateway } from './streaming.gateway';

/**
 * Unit tests for the disconnect grace / cluster-presence abort logic
 * (StreamGateway.abortIfUserGone). This is the core of the multi-pod
 * reconnection fix: in-flight work is aborted only when the user has no live
 * socket anywhere in the cluster after the grace window.
 */
describe('StreamGateway — abortIfUserGone (grace/presence abort)', () => {
  const makeGateway = (liveSockets: number | Error) => {
    // abortIfUserGone only touches this.server and this.logger; the rest of the
    // constructor deps are irrelevant here.
    const gateway = new StreamGateway(
      {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never,
    );
    const fetchSockets = jest.fn(() =>
      liveSockets instanceof Error
        ? Promise.reject(liveSockets)
        : Promise.resolve(new Array(liveSockets).fill({})),
    );
    (gateway as unknown as { server: unknown }).server = {
      in: jest.fn().mockReturnValue({ fetchSockets }),
    };
    const logger = (gateway as unknown as { logger: Record<string, jest.Mock> }).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    return { gateway, fetchSockets };
  };

  const callAbortIfUserGone = (
    gateway: StreamGateway,
    requests: Map<string, AbortController>,
  ): Promise<void> =>
    (gateway as unknown as {
      abortIfUserGone: (u: string, m: Map<string, AbortController>, s: string) => Promise<void>;
    }).abortIfUserGone('user-1', requests, 'sock-1');

  it('does NOT abort when the user has a live socket anywhere in the cluster', async () => {
    const { gateway } = makeGateway(2);
    const ac = new AbortController();
    await callAbortIfUserGone(gateway, new Map([['r1', ac]]));
    expect(ac.signal.aborted).toBe(false);
  });

  it('aborts all requests when the user has no live socket', async () => {
    const { gateway } = makeGateway(0);
    const a = new AbortController();
    const b = new AbortController();
    await callAbortIfUserGone(gateway, new Map([['r1', a], ['r2', b]]));
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
  });

  it('skips the presence check entirely when no requests remain (completed in grace window)', async () => {
    const { gateway, fetchSockets } = makeGateway(0);
    await callAbortIfUserGone(gateway, new Map());
    expect(fetchSockets).not.toHaveBeenCalled();
  });

  it('aborts (fail-safe) when the presence check throws', async () => {
    const { gateway } = makeGateway(new Error('redis down'));
    const ac = new AbortController();
    await callAbortIfUserGone(gateway, new Map([['r1', ac]]));
    expect(ac.signal.aborted).toBe(true);
  });
});

describe('StreamGateway — graceful shutdown (Step 2)', () => {
  const makeGateway = () => {
    const gateway = new StreamGateway(
      {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never,
    );
    const emit = jest.fn();
    const toMock = jest.fn().mockReturnValue({ emit });
    const localSockets = new Map<string, unknown>();
    (gateway as unknown as { server: unknown }).server = {
      to: toMock,
      sockets: { sockets: localSockets },
    };
    const logger = (gateway as unknown as { logger: Record<string, jest.Mock> }).logger;
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    return { gateway, emit, toMock, localSockets };
  };

  const addSocket = (localSockets: Map<string, unknown>, userId: string, requestIds: string[]) => {
    const activeRequests = new Map(requestIds.map((id) => [id, new AbortController()]));
    localSockets.set(`sock-${userId}`, { data: { user: { id: userId }, activeRequests } });
    return activeRequests;
  };

  it('notifies in-flight requests as interrupted+retryable and aborts them on shutdown', () => {
    const { gateway, emit, toMock, localSockets } = makeGateway();
    const reqs = addSocket(localSockets, 'user-1', ['r1', 'r2']);

    (gateway as unknown as { onApplicationShutdown: (s?: string) => void }).onApplicationShutdown('SIGTERM');

    expect(toMock).toHaveBeenCalledWith('user-1');
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('stream-event', expect.objectContaining({
      requestId: 'r1', type: 'interrupted', retryable: true,
    }));
    expect([...reqs.values()].every((ac) => ac.signal.aborted)).toBe(true);
  });

  it('rejects new ops after shutdown has begun (rejectIfDraining returns true + emits)', () => {
    const { gateway, emit } = makeGateway();
    // Before shutdown: accepts work.
    expect(
      (gateway as unknown as { rejectIfDraining: (u: string, r: string) => boolean }).rejectIfDraining('user-1', 'r1'),
    ).toBe(false);
    expect(emit).not.toHaveBeenCalled();

    (gateway as unknown as { onApplicationShutdown: (s?: string) => void }).onApplicationShutdown('SIGTERM');

    // After shutdown: rejects + notifies.
    expect(
      (gateway as unknown as { rejectIfDraining: (u: string, r: string) => boolean }).rejectIfDraining('user-1', 'r2'),
    ).toBe(true);
    expect(emit).toHaveBeenCalledWith('stream-event', expect.objectContaining({
      requestId: 'r2', type: 'interrupted', retryable: true,
    }));
  });
});
