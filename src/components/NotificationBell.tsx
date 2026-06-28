"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { getUserId } from "@/lib/user-id";

type NotifItem = {
  id: number;
  alert_id: number;
  triggered_at: number;
  observed_value: number | null;
  message: string;
  is_read: number;
  alert_type: string;
  symbol: string | null;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const uid = getUserId();
      const res = await fetch(`/api/notifications?unread=true&limit=20`, {
        headers: { "x-user-id": uid },
      });
      if (res.ok) {
        const json = await res.json();
        setNotifs(json.notifications || []);
        setUnread(json.notifications?.length || 0);
      }
      // Also fetch all for dropdown display
      const resAll = await fetch(`/api/notifications?limit=20`, {
        headers: { "x-user-id": uid },
      });
      if (resAll.ok) {
        const json = await resAll.json();
        setNotifs(json.notifications || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifs();
    const id = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "POST",
        headers: { "x-user-id": getUserId() },
      });
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    } catch {}
  };

  const toggle = () => {
    setOpen(!open);
    if (!open) fetchNotifs();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg transition"
        style={{ background: open ? "#0F6E56" : "transparent", color: open ? "#fff" : "#555" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h.01M8.6 4.6a1 1 0 012.8 0A7 7 0 0119 11v2l2 3H3l2-3v-2a7 7 0 017.6-6.4z" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full" style={{ background: "#c0392b" }} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[300px] sm:w-80 rounded-xl border border-border bg-surface shadow-xl z-50 max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 shrink-0">
            <span className="text-sm font-bold text-foreground">Alerts</span>
            <Link href="/alerts" onClick={() => setOpen(false)} className="text-[10px] font-semibold text-primary hover:underline">
              Manage Alerts
            </Link>
          </div>
          <div className="overflow-y-auto flex-1">
            {notifs.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted">
                No alerts yet — set one from any stock page
              </div>
            )}
            {notifs.map((n) => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-0 hover:bg-surface-2 transition cursor-pointer"
                style={{ opacity: n.is_read ? 0.6 : 1 }}
              >
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-gray-300" : ""}`}
                  style={{ background: n.is_read ? undefined : n.alert_type === "price" ? "#3498db" : n.alert_type === "signal" ? "#9b59b6" : "#e67e22" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground leading-tight">{n.message}</div>
                  <div className="text-[9px] text-muted mt-0.5">
                    {n.symbol && <span className="font-bold">{n.symbol} · </span>}
                    {new Date(n.triggered_at).toLocaleString()}
                  </div>
                </div>
                {!n.is_read && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#0F6E56" }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
