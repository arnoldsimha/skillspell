import { io, Socket } from 'socket.io-client';
import { authSDK } from '../services/auth-sdk.js';

export interface StreamEvent {
  requestId: string;
  type: string;
  [key: string]: unknown;
}

export type ConnectionStatus = 'disconnected' | 'reconnected' | 'failed';
type StatusCallback = (status: ConnectionStatus) => void;

const statusCallbacks = new Set<StatusCallback>();

/** Subscribe to socket connection status changes. Returns an unsubscribe function. */
export function subscribeToConnectionStatus(cb: StatusCallback): () => void {
  statusCallbacks.add(cb);
  return () => statusCallbacks.delete(cb);
}

let socket: Socket | null = null;
let connectingPromise: Promise<void> | null = null;
let socketWasConnected = false;
let authFailCount = 0;
let closeRequested = false;

/**
 * Open the persistent streaming connection. Call once after login/session restore.
 * Waits for the socket to connect before resolving. Concurrent calls share the
 * same in-flight promise so only one connection is ever opened.
 */
export async function connectStreamingSocket(): Promise<void> {
  if (socket?.connected) return;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    socket?.disconnect();
    authFailCount = 0;

    // Shared signal: lets the persistent connect_error handler reject the
    // initial-connection Promise when retry is exhausted, without the Promise
    // itself needing to disconnect the socket prematurely.
    let rejectInitial: ((err: Error) => void) | null = null;

    socket = io({
      path: '/stream',
      auth: async (cb: (data: { token: string | null }) => void) => {
        let token = await authSDK.getAccessToken();
        if (!token && authSDK.isAuthenticated()) {
          token = await authSDK.getAccessToken(true);
        }
        cb({ token });
      },
      transports: ['websocket'],
    });

    if (closeRequested) {
      socket.disconnect();
      socket = null;
      closeRequested = false;
      return;
    }
    closeRequested = false;

    socket.on('connect', () => {
      authFailCount = 0;
      rejectInitial = null;
      if (socketWasConnected) {
        statusCallbacks.forEach((cb) => cb('reconnected'));
      }
      socketWasConnected = true;
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'Unauthorized') {
        authFailCount++;
        if (authFailCount >= 3) {
          socket!.disconnect();
          statusCallbacks.forEach((cb) => cb('failed'));
          rejectInitial?.(err);
          rejectInitial = null;
        } else {
          // Pause auto-reconnect, refresh token, then manually reconnect
          socket!.io.opts.reconnection = false;
          authSDK.getAccessToken(true).then(() => {
            if (socket && !socket.connected) {
              socket.io.opts.reconnection = true;
              socket.connect();
            }
          }).catch((refreshErr) => {
            socket?.disconnect();
            statusCallbacks.forEach((cb) => cb('failed'));
            rejectInitial?.(refreshErr instanceof Error ? refreshErr : new Error('Token refresh failed'));
            rejectInitial = null;
          });
        }
      } else {
        // Non-auth error (e.g. network failure before connect): fail immediately.
        // Notify subscribers with 'failed' so the UI leaves the 'connecting'
        // state — a connect_error on a socket that never connected does NOT emit
        // 'disconnect', so without this they would never hear about the failure
        // (matching the 'Unauthorized' and token-refresh failure branches above).
        socket!.disconnect();
        statusCallbacks.forEach((cb) => cb('failed'));
        rejectInitial?.(err);
        rejectInitial = null;
      }
    });

    socket.on('disconnect', () => {
      statusCallbacks.forEach((cb) => cb('disconnected'));
    });

    socket.io.on('reconnect_failed', () => {
      if (rejectInitial) {
        statusCallbacks.forEach((cb) => cb('failed'));
        rejectInitial(new Error('Socket reconnection failed after maximum attempts'));
        rejectInitial = null;
      }
    });

    await new Promise<void>((resolve, reject) => {
      rejectInitial = reject;
      socket!.once('connect', resolve);
    });
  })().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
}

export function closeStreamingSocket(): void {
  closeRequested = true;
  socket?.disconnect();
  socket = null;
  connectingPromise = null;
  socketWasConnected = false;
  authFailCount = 0;
  // Reset so subsequent connectStreamingSocket() calls work normally.
  // Any in-flight IIFE already passed the closeRequested check; disconnecting
  // the socket above is what stops it from completing.
  closeRequested = false;
}

export function getStreamingSocket(): Socket {
  if (!socket?.connected) throw new Error('Streaming socket not connected');
  return socket;
}

export async function emitStream<T>(
  event: string,
  payload: object,
  signal?: AbortSignal,
): Promise<T> {
  // Reconnects if the socket dropped transiently; no-op when already connected.
  await connectStreamingSocket();
  const sock = getStreamingSocket();

  return new Promise((resolve, reject) => {
    const requestId =
      (payload as Record<string, unknown>).requestId as string | undefined ??
      crypto.randomUUID();

    const payloadWithId = { ...payload, requestId };

    let abortHandler: (() => void) | undefined;

    // onDisconnect must be declared before cleanup since cleanup references it
    const onDisconnect = () => {
      cleanup();
      reject(new Error('Socket disconnected'));
    };

    const cleanup = () => {
      sock.off('stream-event', listener);
      sock.off('disconnect', onDisconnect);
      if (abortHandler) {
        signal?.removeEventListener('abort', abortHandler);
      }
    };

    const listener = (ev: StreamEvent) => {
      if (ev.requestId !== requestId) return;
      if (ev.type.endsWith('-complete')) {
        cleanup();
        resolve(ev as unknown as T);
      } else if (ev.type.endsWith('-error')) {
        cleanup();
        reject(ev);
      } else if (ev.type === 'interrupted') {
        // Server is shutting down (k8s pod recycle). Terminal + retryable —
        // reject so the caller stops waiting instead of hanging forever.
        cleanup();
        reject(ev);
      }
    };

    if (signal) {
      abortHandler = () => {
        sock.emit('cancel', { requestId });
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    sock.once('disconnect', onDisconnect);
    sock.on('stream-event', listener);
    sock.emit(event, payloadWithId);
  });
}

export function onStreamEvent(
  requestId: string,
  handler: (event: StreamEvent) => void,
  sock: Socket,
): () => void {
  const listener = (ev: StreamEvent) => {
    if (ev.requestId === requestId) {
      handler(ev);
    }
  };
  sock.on('stream-event', listener);
  return () => sock.off('stream-event', listener);
}
