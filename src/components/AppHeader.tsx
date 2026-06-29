"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus, NepseIndex, NepseSubIndex, LiveMarketData } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, num, pct } from "@/lib/format";
import { useTheme } from "@/lib/ThemeProvider";
import { useNotification } from "@/lib/NotificationContext";
import { getMarketSession, getMarketStatusLabel, getNPTNow } from "@/lib/market-hours";
import { Logo } from "@/components/Logo";
import StockSearchPopup from "@/components/StockSearchPopup";
import NotificationBell from "@/components/NotificationBell";

/* ─── SVG Icon helper ─── */
const Icon = ({ d, size = 16, cls = "" }: { d: string; size?: number; cls?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={cls}>
    <path d={d} />
  </svg>
);

const icons = {
  trending: "M3 17l6-6 4 4 8-8M17 7h4v4",
  dashboard: "M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z",
  chart: "M4 20V10M10 20V4M16 20v-6M22 20H2",
  spreadsheet: "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  exchange: "M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18",
  news: "M4 4h14a2 2 0 012 2v12a2 2 0 01-2 2H4V4zM8 8h8M8 12h8M8 16h4",
  clock: "M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0M12 7v5l3 3",
  search: "M11 11m-7 0a7 7 0 1014 0 7 7 0 10-14 0M21 21l-4.3-4.3",
  bell: "M12 20h.01M8.6 4.6a1 1 0 012.8 0A7 7 0 0119 11v2l2 3H3l2-3v-2a7 7 0 017.6-6.4z",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6z",
  moon: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
  sun: "M12 12m-4 0a4 4 0 108 0 4 4 0 10-8 0M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  x: "M18 6L6 18M6 6l12 12",
};

const NAV: Array<{ href: string; label: string; icon: string; badge?: boolean }> = [
  { href: "/", label: "Dashboard", icon: icons.dashboard },
  { href: "/market", label: "Live Market", icon: icons.trending },
  { href: "/broker-analysis", label: "Broker Analysis", icon: icons.exchange },
  { href: "/orderflow", label: "Order Flow", icon: "📊" },
  { href: "/paper-trading", label: "Paper Trading", icon: "📈", badge: true },
  { href: "/signals/performance", label: "Signal Perf", icon: icons.chart },
  { href: "/indicators", label: "Indicators", icon: icons.spreadsheet },
  { href: "/algo", label: "Strategy", icon: icons.chart },
  { href: "/ipo", label: "IPO/FPO", icon: icons.news },
  { href: "/portfolio", label: "Portfolio", icon: icons.chart },
  { href: "/fundamental", label: "Fundamental", icon: icons.spreadsheet },
  { href: "/news", label: "News", icon: icons.news },
];

type IndicesResp = { index: NepseIndex[]; subIndices: NepseSubIndex[] };
type LiveResp = { data: LiveMarketData[]; count: number; source?: string };

/* ─── Live Market Stats + Breadth ─── */
const LiveHeaderBar = ({ nepse, liveData }: { nepse?: NepseIndex; liveData: LiveMarketData[] | undefined }) => {
  const adv = liveData?.filter(s => s.percentageChange > 0).length ?? 0;
  const dec = liveData?.filter(s => s.percentageChange < 0).length ?? 0;
  const unc = liveData?.filter(s => s.percentageChange === 0).length ?? 0;
  const total = liveData?.length ?? 0;
  return (
    <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs tabular-nums overflow-x-auto whitespace-nowrap">
      <span className="font-bold text-foreground">{nepse?.index || "NEPSE Index"}</span>
      <span className="font-semibold text-foreground">{num(nepse?.currentValue ?? 0)}</span>
      <span className={nepse && nepse.perChange >= 0 ? "text-up" : "text-down"}>
        {nepse ? `${nepse.perChange >= 0 ? "+" : ""}${nepse.perChange.toFixed(2)}%` : "—"}
      </span>
      <span className="text-muted">|</span>
      <span className="text-muted">Adv</span>
      <span className="font-semibold text-up">{adv}</span>
      <span className="text-muted">Dec</span>
      <span className="font-semibold text-down">{dec}</span>
      <span className="text-muted">Unch</span>
      <span className="font-semibold text-foreground">{unc}</span>
      <span className="text-muted">|</span>
      <span className="text-muted">Trx</span>
      <span className="font-semibold text-foreground">{total}</span>
    </div>
  );
};

/* ─── Ticker items ─── */
const STATIC_TICKS = [
  { s: "NEPSE", v: "2,134.58", ch: 12.4 },
  { s: "Sensitive", v: "418.72", ch: 3.1 },
  { s: "Float", v: "184.39", ch: -0.8 },
  { s: "NABIL", v: "1,420", ch: 20 },
  { s: "NICA", v: "874", ch: -14 },
  { s: "NTC", v: "780", ch: 5 },
  { s: "HIDCL", v: "261", ch: -3 },
  { s: "SCB", v: "3,650", ch: 45 },
  { s: "PRVU", v: "312", ch: 8 },
  { s: "GBIME", v: "398", ch: -6 },
  { s: "SBI", v: "243", ch: 4 },
  { s: "EBL", v: "1,155", ch: -10 },
];

/* ─── Market session hook (updates every 30s) ─── */
function useMarketSession() {
  const [session, setSession] = useState<"pre-open" | "open" | "closed">(() => getMarketSession());
  const [statusLabel, setStatusLabel] = useState(() => getMarketStatusLabel());
  useEffect(() => {
    const check = () => {
      const npt = getNPTNow();
      setSession(getMarketSession(npt));
      setStatusLabel(getMarketStatusLabel(npt));
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);
  return { session, ...statusLabel };
}

/* ─── NPT Clock ─── */
function useNPTClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const npt = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
      setTime(npt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ─── Click-outside hook ─── */
function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, cb]);
}

/* ─── Icon Button ─── */
function IconBtn({ d, size = 17, onClick, active, badge, cls = "" }: { d: string; size?: number; onClick?: () => void; active?: boolean; badge?: boolean; cls?: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-lg transition ${cls}`}
      style={{ background: active ? "#0F6E56" : "transparent", color: active ? "#fff" : "#555" }}
    >
      <Icon d={d} size={size} />
      {badge && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full" style={{ background: "#c0392b" }} />}
    </button>
  );
}

export default function AppHeader() {
  const pathname = usePathname();
  const clock = useNPTClock();
  const theme = useTheme();
  const notif = useNotification();

  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const indices = usePoll<IndicesResp>("/api/indices", 5_000);
  const live = usePoll<LiveResp>("/api/live", 5_000);
  const mkt = useMarketSession();
  const open = mkt.session !== "closed";

  /* Calculate real market stats from live data */
  const marketStats = useMemo(() => {
    const liveData = live.data?.data ?? [];
    const totalVolume = liveData.reduce((sum, s) => sum + (s.lastTradedVolume ?? 0), 0);
    const totalValue = liveData.reduce((sum, s) => sum + (s.totalTradeValue ?? 0), 0);
    
    // Format turnover in Crores
    const turnoverCr = totalValue / 100000000;
    const turnoverFormatted = turnoverCr >= 1 ? `Rs. ${turnoverCr.toFixed(2)} Cr` : `Rs. ${(turnoverCr * 100).toFixed(2)} L`;
    
    // Format volume
    const volumeFormatted = totalVolume >= 10000000 
      ? `${(totalVolume / 10000000).toFixed(2)} Cr` 
      : totalVolume >= 100000 
        ? `${(totalVolume / 100000).toFixed(2)} L` 
        : totalVolume.toLocaleString();
    
    return {
      totalVolume: volumeFormatted,
      totalValue: turnoverFormatted,
      adv: liveData.filter(s => s.percentageChange > 0).length,
      dec: liveData.filter(s => s.percentageChange < 0).length,
      unc: liveData.filter(s => s.percentageChange === 0).length,
    };
  }, [live.data]);

  /* Build ticker */
  const ticks = useMemo(() => {
    const nepse = indices.data?.index?.find((i) => i.index === "NEPSE Index") ?? indices.data?.index?.[0];
    const sensitive = indices.data?.subIndices?.find((i) => i.index?.includes("Sensitive"));
    const floatIdx = indices.data?.subIndices?.find((i) => i.index?.includes("Float"));
    const liveData = live.data?.data ?? [];
    if (nepse && liveData.length > 0) {
      const topStocks = liveData
        .filter((s) => s.lastTradedPrice > 0)
        .slice(0, 9)
        .map((s) => ({ s: s.symbol, v: num(s.lastTradedPrice), ch: s.percentageChange }));
      const idx = [{ s: "NEPSE", v: npr(nepse.currentValue ?? nepse.close), ch: nepse.change ?? 0 }];
      if (sensitive) idx.push({ s: "Sensitive", v: npr(sensitive.currentValue), ch: sensitive.change ?? 0 });
      if (floatIdx) idx.push({ s: "Float", v: npr(floatIdx.currentValue), ch: floatIdx.change ?? 0 });
      return [...idx, ...topStocks];
    }
    return STATIC_TICKS;
  }, [indices.data, live.data]);

  const newsCount = 5;

  return (
    <header className="sticky top-0 z-50">
      {/* ── Main Header Bar: Logo + Market Stats + Search ──── */}
      <div className="border-b" style={{ borderColor: "rgba(0,0,0,0.12)", background: "#fff" }}>
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-1.5 sm:gap-4 px-2 sm:px-4 py-1.5 sm:py-2.5">
          {/* Left: Logo + Market Stats */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
            {/* Logo */}
            <Link href="/" className="flex shrink-0 items-center">
              <Logo variant="medium" size={28} />
            </Link>

            {/* Market Stats - Responsive Size */}
            <div className="flex items-center gap-2 sm:gap-5 text-xs sm:text-sm font-semibold overflow-x-auto whitespace-nowrap flex-1 min-w-0 scrollbar-hide">
              <div className="flex items-baseline gap-1 sm:gap-1.5">
                <span className="text-[9px] sm:text-xs text-muted font-medium">NEPSE</span>
                <span className="text-base sm:text-xl font-bold text-foreground">{num(indices.data?.index?.find(i => i.index === "NEPSE Index")?.currentValue ?? 0)}</span>
                <span className={`text-xs sm:text-base font-bold ${(() => {
                  const nepse = indices.data?.index?.find(i => i.index === "NEPSE Index");
                  return (nepse?.perChange ?? 0) >= 0 ? "text-up" : "text-down";
                })()}`}>
                  {(() => {
                    const nepse = indices.data?.index?.find(i => i.index === "NEPSE Index");
                    return nepse ? `${nepse.perChange >= 0 ? "+" : ""}${nepse.perChange.toFixed(2)}%` : "—";
                  })()}
                </span>
              </div>
              <div className="hidden lg:flex items-center gap-3 text-xs">
                <div className="flex items-baseline gap-1">
                  <span className="text-muted font-medium">Turnover</span>
                  <span className="font-bold text-foreground">{marketStats.totalValue}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-muted font-medium">Volume</span>
                  <span className="font-bold text-foreground">{marketStats.totalVolume}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Search + Notification Bell */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Search Button */}
            <StockSearchPopup />
            
            {/* Notification Bell */}
            <NotificationBell />
          </div>
        </div>
      </div>

      {/* ── Navigation (second line) ──────────────────── */}
      <nav className="border-b" style={{ borderColor: "rgba(0,0,0,0.12)", background: "#fff" }}>
        <div className="mx-auto max-w-[1400px] px-2 sm:px-4 py-1">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] sm:text-[12px] font-medium transition whitespace-nowrap"
                  style={active ? { background: "#0F6E56", color: "#fff" } : { background: "transparent", color: "#555" }}
                >
                  <Icon d={item.icon} size={13} />
                  <span>{item.label}</span>
                  {item.href === "/paper-trading" ? (
                    <span className="rounded border px-1 py-0.5 text-[7px] font-bold uppercase leading-none tracking-wider"
                      style={{ borderColor: "#d4af37", color: "#d4af37" }}>
                      DEMO
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── Live Ticker Bar ──────────────────────────────── */}
      <div className="flex items-center overflow-hidden border-b" style={{ height: 26, background: "#F5F5F0", borderColor: "rgba(0,0,0,0.12)" }}>
        <div className="flex shrink-0 items-center gap-3 border-r px-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
          <div className="flex items-center gap-2 text-[10px] sm:text-xs tabular-nums">
            <span className="text-muted">Adv</span>
            <span className="font-semibold text-up">{live.data?.data?.filter(s => s.percentageChange > 0).length ?? 0}</span>
            <span className="text-muted">Dec</span>
            <span className="font-semibold text-down">{live.data?.data?.filter(s => s.percentageChange < 0).length ?? 0}</span>
            <span className="text-muted">Unch</span>
            <span className="font-semibold text-foreground">{live.data?.data?.filter(s => s.percentageChange === 0).length ?? 0}</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="ticker-scroll flex whitespace-nowrap">
            {[...ticks, ...ticks].map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 sm:px-3 text-[9px] sm:text-[11px] font-medium">
                <span style={{ color: "#333" }}>{t.s}</span>
                <span className="font-semibold tabular-nums" style={{ color: "#333" }}>{t.v}</span>
                <span className="font-semibold tabular-nums" style={{ color: t.ch >= 0 ? "#1a8a3a" : "#c0392b" }}>
                  {t.ch >= 0 ? "▲" : "▼"}
                  {Math.abs(t.ch).toFixed(2)}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="hidden sm:flex shrink-0 items-center gap-1.5 border-l px-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
          <Icon d={icons.clock} size={13} cls="text-gray-500" />
          <span className="text-[11px] font-semibold tabular-nums text-gray-600">{clock} NPT</span>
        </div>
      </div>

      {/* ── Toast Overlay ── */}
      <div className="fixed right-2 sm:right-4 top-16 sm:top-20 z-[999] flex flex-col gap-2 pointer-events-none max-w-[260px] sm:max-w-xs">
        {notif.toasts.slice(0, 3).map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-lg animate-slide-in"
            style={{ animation: "slideIn 0.3s ease-out" }}
          >
            {/* Thumbnail for news */}
            {t.image ? (
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-surface-2">
                <img src={t.image} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
            ) : (
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: t.type === "news" ? "#0F6E56" : t.type === "broker" ? "#e67e22" : "#3498db" }} />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-foreground">{t.title}</div>
              <div className="text-[10px] text-muted line-clamp-1">{t.message}</div>
            </div>
            <button onClick={() => notif.dismiss(t.id)} className="text-muted hover:text-foreground shrink-0">
              <Icon d={icons.x} size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Ticker + toast animation styles */}
      <style jsx>{`
        .ticker-scroll {
          animation: tickerSlide 32s linear infinite;
        }
        @keyframes tickerSlide {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </header>
  );
}
