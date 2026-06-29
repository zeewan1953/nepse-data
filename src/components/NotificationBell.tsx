"use client";
import { useState, useEffect, useRef } from "react";

interface Notification {
  id: number;
  alert_id: number;
  triggered_at: number;
  observed_value: number | null;
  message: string;
  is_read: boolean;
  alert_type: string;
  symbol: string | null;
  signal_name: string | null;
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = async (unreadOnly = false) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/notifications?unread=${unreadOnly}`, {
        headers: { "x-user-id": "anonymous" }, // Replace with actual user ID from auth
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Mark notification as read
  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notifications?id=${id}`, {
        method: "PATCH",
        headers: { "x-user-id": "anonymous" },
      });
      // Refresh notifications
      fetchNotifications();
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    fetchNotifications(true);
    const interval = setInterval(() => fetchNotifications(true), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Open dropdown and mark all as viewed
  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      fetchNotifications();
    }
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Get icon based on alert type
  const getAlertIcon = (type: string) => {
    switch (type) {
      case "price": return "💰";
      case "signal": return "🎯";
      case "broker_flow": return "💵";
      default: return "🔔";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-surface-2 transition-colors"
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-surface shadow-2xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-muted">{unreadCount} unread</span>
            )}
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-blue-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="mb-2 text-3xl">🔔</div>
                <p className="text-sm text-muted">No alerts yet</p>
                <p className="mt-1 text-xs text-muted">Set one from any stock page</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 hover:bg-surface-2 transition-colors cursor-pointer ${
                      !notif.is_read ? "bg-blue-500/5" : ""
                    }`}
                    onClick={() => markAsRead(notif.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg">{getAlertIcon(notif.alert_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm text-foreground">{notif.message}</p>
                        <p className="mt-1 text-[10px] sm:text-xs text-muted">
                          {formatTime(notif.triggered_at)}
                        </p>
                      </div>
                      {!notif.is_read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 mt-1" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-3">
            <button className="w-full text-xs text-blue-500 hover:text-blue-600 font-medium">
              Manage Alerts →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
