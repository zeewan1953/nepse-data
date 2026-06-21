"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";

export type Toast = {
  id: string;
  title: string;
  message: string;
  type: "news" | "broker" | "info" | "signal" | "price";
  time: number;
};

export type NotificationSettings = {
  enabled: boolean;
  news: boolean;
  broker: boolean;
  info: boolean;
  signal: boolean;
  price: boolean;
  sound: boolean;
  desktop: boolean;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  news: true,
  broker: true,
  info: true,
  signal: true,
  price: true,
  sound: true,
  desktop: false,
};

type NotifCtx = {
  toasts: Toast[];
  unread: number;
  settings: NotificationSettings;
  notify: (title: string, message: string, type?: Toast["type"]) => void;
  clear: () => void;
  dismiss: (id: string) => void;
  updateSettings: (settings: Partial<NotificationSettings>) => void;
  toggleType: (type: keyof Omit<NotificationSettings, "enabled">) => void;
};

const Ctx = createContext<NotifCtx>({
  toasts: [],
  unread: 0,
  settings: DEFAULT_SETTINGS,
  notify: () => {},
  clear: () => {},
  dismiss: () => {},
  updateSettings: () => {},
  toggleType: () => {},
});

let counter = 0;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unread, setUnread] = useState(0);
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("notif-settings");
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    }
    return DEFAULT_SETTINGS;
  });

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem("notif-settings", JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const toggleType = useCallback((type: keyof Omit<NotificationSettings, "enabled">) => {
    setSettings((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const notify = useCallback((title: string, message: string, type: Toast["type"] = "info") => {
    // Check if notifications are globally enabled
    if (!settings.enabled) return;

    // Check if specific type is enabled
    if (!settings[type]) return;

    const id = `n${++counter}`;
    const t: Toast = { id, title, message, type, time: Date.now() };
    setToasts((prev) => [t, ...prev].slice(0, 50));
    setUnread((prev) => prev + 1);

    // Play sound if enabled
    if (settings.sound) {
      try {
        const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgipGJdl5NZH2zto14ZzplYmiRt72Vf4J1bGJcj6+0kIN9c2lheJm4u5aEhHJpX1yVtbOTg351bGNhkrG1k4R+dG1kZZSvtZOEfHRtZGaRr7SThHx0bWRmkq+0k4R8dG1kZpKvtJOEfHRtZGaSr7SThHx0bWRmkq+0k4R8dG1kZpKvtJOEfHRtZGaSr7SThHx0bWRmk6+0k4R8dG1kZpOvtJOEfHRtZGaUr7SThHx0bWRmlK+0k4R8dG1kZpSvtJOEfHRtZGaUr7SThHx0bWRmlK+0k4R8dG1kZpSvtJOEfHRtZGaUr7SThHx0bWRmlK+0k4R8dG1kZpSvtJOEfHRtZGaUr7SThHx0bWRmlK+0k4R8dA==");
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {}
    }

    // Browser notification if enabled
    if (settings.desktop && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body: message, icon: "/favicon.ico" });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            new Notification(title, { body: message, icon: "/favicon.ico" });
          }
        });
      }
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 8000);
  }, [settings]);

  const clear = useCallback(() => {
    setToasts([]);
    setUnread(0);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return <Ctx.Provider value={{ toasts, unread, settings, notify, clear, dismiss, updateSettings, toggleType }}>{children}</Ctx.Provider>;
}

export function useNotification() {
  return useContext(Ctx);
}
