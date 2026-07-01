import { useEffect, useRef } from 'react';
import { useToast } from './ToastContext.js';
import { useAuth } from '../../hooks/useAuth.js';
import { subscribeToConnectionStatus } from '../../utils/streamingSocket.js';

/**
 * Null-rendering component that shows toast notifications when the WebSocket
 * disconnects, reconnects, or permanently fails. Must be mounted inside both
 * AuthProvider and ToastProvider.
 */
export function SocketStatusMonitor() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const suppressReconnect = useRef(false);

  useEffect(() => {
    if (!user) return;

    suppressReconnect.current = false;

    const unsubscribe = subscribeToConnectionStatus((status) => {
      if (status === 'disconnected') {
        suppressReconnect.current = false;
        addToast('error', 'Connection lost. Reconnecting…');
      } else if (status === 'reconnected') {
        if (!suppressReconnect.current) {
          addToast('success', 'Reconnected');
        }
      } else if (status === 'failed') {
        suppressReconnect.current = true;
        addToast('error', 'Connection failed. Please refresh the page.');
      }
    });

    return unsubscribe;
  }, [user, addToast]);

  return null;
}
