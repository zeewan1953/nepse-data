"use client";
import { useEffect, useRef } from "react";
import { useNotification } from "@/lib/NotificationContext";

type LiveData = { symbol: string; totalTradeQuantity: number; totalTradeValue: number; lastTradedPrice: number; percentageChange: number };
type LiveResp = { data: LiveData[]; count: number };
type NewsItem = { id: string; title: string; image: string; content: string; category: string; time: string };
type NewsResp = { news: NewsItem[]; updatedAt: number };

const TRADE_THRESHOLD = 1000;
const NEWS_POLL_MS = 600_000;
const TRADE_POLL_MS = 30_000;

export default function NotificationWatcher() {
  const { notify, settings } = useNotification();

  // ─── Trade monitor (30s intervals) ───────────────────────────
  const prevTradesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!settings.enabled || !settings.price) return;

    const checkTrades = async () => {
      try {
        const res = await fetch("/api/live");
        if (!res.ok) return;
        const json: LiveResp = await res.json();
        if (!json.data?.length) return;

        const prev = prevTradesRef.current;
        const now: Record<string, number> = {};

        for (const stock of json.data) {
          const qty = stock.totalTradeQuantity ?? 0;
          now[stock.symbol] = qty;

          if (prev[stock.symbol] !== undefined) {
            const diff = qty - prev[stock.symbol];
            if (diff >= TRADE_THRESHOLD) {
              notify(
                "💹 Large Trade",
                `${stock.symbol}: ${diff.toLocaleString()} shares traded at ${stock.lastTradedPrice.toFixed(2)} (${stock.percentageChange >= 0 ? "+" : ""}${stock.percentageChange.toFixed(2)}%)`,
                "price"
              );
            }
          }
        }
        prevTradesRef.current = now;
      } catch {}
    };

    checkTrades();
    const id = setInterval(checkTrades, TRADE_POLL_MS);
    return () => clearInterval(id);
  }, [notify, settings.enabled, settings.price]);

  // ─── News monitor (10min intervals) ──────────────────────────
  const prevNewsIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!settings.enabled || !settings.news) return;

    const checkNews = async () => {
      try {
        const res = await fetch("/api/news");
        if (!res.ok) return;
        const json: NewsResp = await res.json();
        if (!json.news?.length) return;

        const currentIds = new Set(json.news.map((n) => n.id));
        const prevIds = prevNewsIdsRef.current;
        const newItems = json.news.filter((n) => !prevIds.has(n.id));

        if (prevIds.size > 0 && newItems.length > 0) {
          newItems.forEach((item, idx) => {
            setTimeout(() => {
              notify("📰 New News", item.title.substring(0, 100), "news", item.image || undefined);
            }, idx * 500);
          });
        }
        prevNewsIdsRef.current = currentIds;
      } catch {}
    };

    checkNews();
    const id = setInterval(checkNews, NEWS_POLL_MS);
    return () => clearInterval(id);
  }, [notify, settings.enabled, settings.news]);

  // ─── Request notification permission on mount ────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  return null;
}
