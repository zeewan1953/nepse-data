"use client";
import { createContext, useContext, useState, useCallback } from "react";

export type Toast = {
  id: string;
  title: string;
  message: string;
  type: "news" | "broker" | "info";
  time: number;
};

type NotifCtx = {
  toasts: Toast[];
  unread: number;
  notify: (title: string, message: string, type?: Toast["type"]) => void;
  clear: () => void;
  dismiss: (id: string) => void;
};

const Ctx = createContext<NotifCtx>({
  toasts: [],
  unread: 0,
  notify: () => {},
  clear: () => {},
  dismiss: () => {},
});

let counter = 0;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unread, setUnread] = useState(0);

  const notify = useCallback((title: string, message: string, type: Toast["type"] = "info") => {
    const id = `n${++counter}`;
    const t: Toast = { id, title, message, type, time: Date.now() };
    setToasts((prev) => [t, ...prev].slice(0, 10));
    setUnread((prev) => prev + 1);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
    setUnread(0);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return <Ctx.Provider value={{ toasts, unread, notify, clear, dismiss }}>{children}</Ctx.Provider>;
}

export function useNotification() {
  return useContext(Ctx);
}
