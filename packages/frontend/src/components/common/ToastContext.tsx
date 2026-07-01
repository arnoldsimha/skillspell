import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastMessage['type'], message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, type, message }]);
      // Auto-dismiss after 5 seconds
      setTimeout(() => removeToast(id), 5000);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}
