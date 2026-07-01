import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted ensures mockIo is initialized before vi.mock factory runs (factories
// are hoisted to the top of the file, ahead of module-level variable declarations).
const { mockIo } = vi.hoisted(() => ({ mockIo: vi.fn() }));

vi.mock('socket.io-client', () => ({ io: mockIo }));

vi.mock('../../services/auth-sdk.js', () => ({
  authSDK: {
    getAccessToken: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}));

import { connectStreamingSocket, closeStreamingSocket } from '../streamingSocket.js';
import { authSDK } from '../../services/auth-sdk.js';

// ── Minimal fake Socket.IO socket ─────────────────────────────────────────────

type Handler = (...args: unknown[]) => void;

class FakeEmitter {
  private _h = new Map<string, Set<Handler>>();

  on(event: string, fn: Handler) {
    if (!this._h.has(event)) this._h.set(event, new Set());
    this._h.get(event)!.add(fn);
    return this;
  }

  once(event: string, fn: Handler) {
    const w: Handler = (...a) => { this.off(event, w); fn(...a); };
    return this.on(event, w);
  }

  off(event: string, fn: Handler) { this._h.get(event)?.delete(fn); return this; }

  trigger(event: string, ...args: unknown[]) {
    for (const h of [...(this._h.get(event) ?? [])]) h(...args);
  }
}

function makeFakeSocket() {
  const manager = Object.assign(new FakeEmitter(), { opts: { reconnection: true } });
  const sock = Object.assign(new FakeEmitter(), {
    connected: false,
    io: manager,
    disconnect: vi.fn(function (this: typeof sock) { sock.connected = false; }),
    connect: vi.fn(),
  });
  return sock;
}

// ── Per-test state ────────────────────────────────────────────────────────────

let fakeSocket: ReturnType<typeof makeFakeSocket>;

beforeEach(() => {
  fakeSocket = makeFakeSocket();
  mockIo.mockReturnValue(fakeSocket);
  vi.mocked(authSDK.getAccessToken).mockResolvedValue('token');
  vi.mocked(authSDK.isAuthenticated).mockReturnValue(true);
});

afterEach(() => {
  closeStreamingSocket();
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerConnect() {
  fakeSocket.connected = true;
  fakeSocket.trigger('connect');
}

function triggerConnectError(message: string) {
  fakeSocket.trigger('connect_error', Object.assign(new Error(message), { message }));
}

// Flush one microtask tick then one macrotask tick
function flushAsync() {
  return new Promise((r) => setTimeout(r, 0));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('connectStreamingSocket – initial connection', () => {
  it('resolves when connect fires on first attempt', async () => {
    const promise = connectStreamingSocket();
    triggerConnect();
    await expect(promise).resolves.toBeUndefined();
  });

  it('does NOT reject on first Unauthorized connect_error — retry continues', async () => {
    let settled = false;
    const promise = connectStreamingSocket().then(
      () => { settled = true; },
      () => { settled = true; },
    );

    triggerConnectError('Unauthorized'); // first auth failure
    await flushAsync(); // let the token-refresh .then() microtask run

    expect(settled).toBe(false); // Promise still pending
    expect(fakeSocket.disconnect).not.toHaveBeenCalled(); // socket NOT killed

    // Clean up: resolve so afterEach can close cleanly
    triggerConnect();
    await promise;
  });

  it('resolves after a successful connect following one auth failure', async () => {
    const promise = connectStreamingSocket();

    triggerConnectError('Unauthorized');
    await flushAsync(); // token refresh microtask
    triggerConnect();

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects after three Unauthorized connect_errors', async () => {
    const promise = connectStreamingSocket();

    triggerConnectError('Unauthorized');
    await flushAsync();
    triggerConnectError('Unauthorized');
    await flushAsync();
    triggerConnectError('Unauthorized'); // 3rd error rejects immediately — don't flush before catch
    await expect(promise).rejects.toThrow('Unauthorized');
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  it('rejects immediately on a non-auth connect_error', async () => {
    const promise = connectStreamingSocket();
    triggerConnectError('xhr poll error');
    await expect(promise).rejects.toThrow('xhr poll error');
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });

  it('fires the failed status callback on a non-auth connect_error (F-11)', async () => {
    const onStatus = vi.fn();
    const { subscribeToConnectionStatus } = await import('../streamingSocket.js');
    const unsub = subscribeToConnectionStatus(onStatus);

    const promise = connectStreamingSocket();
    triggerConnectError('xhr poll error'); // rejects immediately — don't flush before catch
    await promise.catch(() => {});

    // Subscribers must hear 'failed' — a connect_error on a never-connected
    // socket does not emit 'disconnect', so this is their only signal.
    expect(onStatus).toHaveBeenCalledWith('failed');

    unsub();
  });
});

describe('connectStreamingSocket – reconnect_failed', () => {
  it('rejects on reconnect_failed and fires failed status callback', async () => {
    const onStatus = vi.fn();
    const { subscribeToConnectionStatus } = await import('../streamingSocket.js');
    const unsub = subscribeToConnectionStatus(onStatus);

    const promise = connectStreamingSocket();
    fakeSocket.io.trigger('reconnect_failed'); // rejects immediately — don't flush before catch
    await expect(promise).rejects.toThrow('Socket reconnection failed after maximum attempts');
    expect(onStatus).toHaveBeenCalledWith('failed');

    unsub();
  });

  it('does NOT double-fire failed callback when reconnect_failed follows auth exhaustion', async () => {
    const onStatus = vi.fn();
    const { subscribeToConnectionStatus } = await import('../streamingSocket.js');
    const unsub = subscribeToConnectionStatus(onStatus);

    const promise = connectStreamingSocket();

    // Exhaust auth retries
    triggerConnectError('Unauthorized');
    await flushAsync();
    triggerConnectError('Unauthorized');
    await flushAsync();
    triggerConnectError('Unauthorized'); // 3rd rejects immediately
    await promise.catch(() => {});

    const failedCallsBefore = onStatus.mock.calls.filter(([s]) => s === 'failed').length;

    // reconnect_failed fires after auth exhaustion — rejectInitial is null, should no-op
    fakeSocket.io.trigger('reconnect_failed');
    await flushAsync();

    const failedCallsAfter = onStatus.mock.calls.filter(([s]) => s === 'failed').length;
    expect(failedCallsAfter).toBe(failedCallsBefore); // no new 'failed' callback

    unsub();
  });
});

describe('connectStreamingSocket – concurrent calls', () => {
  it('both concurrent callers resolve when the socket connects', async () => {
    const p1 = connectStreamingSocket();
    const p2 = connectStreamingSocket();
    triggerConnect();
    await expect(Promise.all([p1, p2])).resolves.toBeDefined();
    expect(mockIo).toHaveBeenCalledTimes(1); // only one socket created
  });

  it('allows a new connection after closeStreamingSocket', async () => {
    const p1 = connectStreamingSocket();
    triggerConnect();
    await p1;

    closeStreamingSocket();

    fakeSocket = makeFakeSocket();
    mockIo.mockReturnValue(fakeSocket);

    const p2 = connectStreamingSocket();
    triggerConnect();
    await expect(p2).resolves.toBeUndefined();
  });
});
