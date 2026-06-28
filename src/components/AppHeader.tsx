"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus, NepseIndex, NepseSubIndex, LiveMarketData } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, num, pct } from "@/lib/format";
import { useTheme } from "@/lib/ThemeProvider";
import { useAuth } from "@/lib/useAuth";
import { useNotification } from "@/lib/NotificationContext";
import { getMarketSession, getMarketStatusLabel, getNPTNow } from "@/lib/market-hours";
import { Logo } from "@/components/Logo";
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
  { href: "/alerts", label: "Alerts", icon: icons.bell },
  { href: "/signals/performance", label: "Signal Perf", icon: icons.chart },
  { href: "/news", label: "News", icon: icons.news },
];

type IndicesResp = { index: NepseIndex[]; subIndices: NepseSubIndex[] };
type LiveResp = { data: LiveMarketData[]; count: number; source?: string };

/* ─── Live Market Stats Bar ─── */
function LiveHeaderBar({
  indices,
  live,
  mkt,
}: {
  indices: IndicesResp | null;
  live: { data: LiveMarketData[]; count: number };
  mkt: ReturnType<typeof useMarketSession>;
}) {
  /* Aggregate from live data */
  const stats = useMemo(() => {
    const d = live.data;
    const turnover = d.reduce((s, r) => s + (r.totalTradeValue ?? 0), 0);
    const volume = d.reduce((s, r) => s + (r.totalTradeQuantity ?? 0), 0);
    const trades = d.reduce((s, r) => s + (r.lastTradedVolume ?? 0), 0);
    const advancers = d.filter((r) => r.percentageChange > 0).length;
    const decliners = d.filter((r) => r.percentageChange < 0).length;
    const unchanged = d.filter((r) => r.percentageChange === 0).length;
    return { turnover, volume, trades, advancers, decliners, unchanged };
  }, [live.data]);

  /* NEPSE index OHLC */
  const nepse = (indices?.index?.find((i) => i.index === "NEPSE Index") ?? indices?.index?.[0]) as (NepseIndex & { open?: number }) | undefined;
  const idxOpen = nepse?.open ?? nepse?.previousClose;
  const idxHigh = nepse?.high;
  const idxLow = nepse?.low;
  const idxClose = nepse?.close;
  const idxChg = nepse?.change;
  const idxPct = nepse?.perChange;
  const idxVal = nepse?.currentValue ?? idxClose;

  const chgPos = (idxChg ?? 0) > 0;
  const chgNeg = (idxChg ?? 0) < 0;

  return (
    <div className="flex items-center gap-0 border-b overflow-x-auto" style={{ height: 28, background: "#fafaf7", borderColor: "rgba(0,0,0,0.10)" }}>
      {/* NEPSE Index OHLC */}
      <div className="flex items-center gap-1.5 border-r px-2 sm:px-3 shrink-0" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
        <span className="text-[9px] sm:text-[10px] font-bold" style={{ color: "#1a1a1a" }}>NEPSE</span>
        <span className={`text-[10px] sm:text-[11px] font-black tabular-nums ${chgPos ? "text-up" : chgNeg ? "text-down" : ""}`}>
          {(idxVal ?? 0)?.toFixed(2)}
        </span>
        <span className={`text-[8px] sm:text-[9px] font-semibold tabular-nums ${chgPos ? "text-up" : chgNeg ? "text-down" : "text-gray-400"}`}>
          {(idxChg ?? 0) >= 0 ? "+" : ""}{(idxChg ?? 0)?.toFixed(2)}
        </span>
      </div>

      {/* OHLC mini — desktop only */}
      <div className="hidden md:flex items-center gap-2 border-r px-3 text-[9px] shrink-0" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
        <span className="tabular-nums"><span className="text-gray-400">O:</span> {(idxOpen ?? 0)?.toFixed(2)}</span>
        <span className="tabular-nums text-up"><span className="text-gray-400">H:</span> {(idxHigh ?? 0)?.toFixed(2)}</span>
        <span className="tabular-nums text-down"><span className="text-gray-400">L:</span> {(idxLow ?? 0)?.toFixed(2)}</span>
      </div>

      {/* Turnover */}
      <div className="flex items-center gap-1 border-r px-2 sm:px-3 text-[8px] sm:text-[9px] shrink-0" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
        <span className="text-gray-400 hidden sm:inline">Turnover</span>
        <span className="font-bold tabular-nums" style={{ color: "#1a1a1a" }}>
          {(stats.turnover / 1e8).toFixed(2)}Cr
        </span>
      </div>

      {/* Volume — tablet+ */}
      <div className="hidden sm:flex items-center gap-1 border-r px-3 text-[9px] shrink-0" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
        <span className="text-gray-400">Volume</span>
        <span className="font-bold tabular-nums" style={{ color: "#1a1a1a" }}>
          {(stats.volume / 1e6).toFixed(2)}M
        </span>
      </div>

      {/* Trades — desktop only */}
      <div className="hidden md:flex items-center gap-1 border-r px-3 text-[9px] shrink-0" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
        <span className="text-gray-400">Trades</span>
        <span className="font-bold tabular-nums" style={{ color: "#1a1a1a" }}>{stats.trades.toLocaleString()}</span>
      </div>

      {/* Breadth */}
      <div className="flex items-center gap-1 px-2 sm:px-3 text-[8px] sm:text-[9px] shrink-0">
        <span className="text-up font-semibold">▲{stats.advancers}</span>
        <span className="text-gray-300 hidden sm:inline">|</span>
        <span className="text-down font-semibold">▼{stats.decliners}</span>
        <span className="text-gray-300 hidden sm:inline">|</span>
        <span className="text-gray-400 font-semibold hidden sm:inline">—{stats.unchanged}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-2" />

      {/* Session badge */}
      <div className="flex items-center gap-1 border-l px-2 sm:px-3 shrink-0" style={{ borderColor: "rgba(0,0,0,0.10)" }}>
        {mkt.session !== "closed" ? (
          <>
            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: mkt.color }} />
              <span className="relative inline-flex h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full" style={{ background: mkt.color }} />
            </span>
            <span className="text-[8px] sm:text-[9px] font-semibold" style={{ color: mkt.color }}>{mkt.label}</span>
          </>
        ) : (
          <span className="text-[8px] sm:text-[9px] font-semibold text-gray-400">Closed</span>
        )}
      </div>
    </div>
  );
}

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
  const auth = useAuth();
  const notif = useNotification();

  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const indices = usePoll<IndicesResp>("/api/indices", 5_000);
  const live = usePoll<LiveResp>("/api/live", 5_000);
  const mkt = useMarketSession();
  const open = mkt.session !== "closed";

  /* Dropdown states */
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "signup">("login");

  /* Refs for click-outside */
  const searchRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  useClickOutside(searchRef, () => setSearchOpen(false));
  useClickOutside(settingsRef, () => setSettingsOpen(false));
  useClickOutside(avatarRef, () => setAvatarOpen(false));

  /* Search state */
  const [sq, setSq] = useState("");
  const searchResults = useMemo(() => {
    if (!sq.trim() || !live.data?.data) return [];
    const q = sq.toLowerCase();
    return live.data.data
      .filter((r) => r.symbol.toLowerCase().includes(q) || (r.securityName ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [sq, live.data]);

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
  const userInitials = auth.user
    ? auth.user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  const toggleOnly = (which: "search" | "settings" | "avatar") => {
    setSearchOpen(which === "search" ? !searchOpen : false);
    setSettingsOpen(which === "settings" ? !settingsOpen : false);
    setAvatarOpen(which === "avatar" ? !avatarOpen : false);
  };

  return (
    <header className="sticky top-0 z-50">
      {/* ── Main Header Bar ──────────────────────────────── */}
      <div className="border-b" style={{ borderColor: "rgba(0,0,0,0.12)", background: "#fff" }}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1 sm:py-1.5">
          {/* Logo - NEPSE AXION */}
          <Link href="/" className="flex shrink-0 items-center">
            <Logo variant="medium" size={32} />
          </Link>

          {/* ── Right Side Icons - Mobile optimized ── */}
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {/* Search - hidden on very small screens */}
            <div ref={searchRef} className="relative hidden xs:block">
              <IconBtn d={icons.search} active={searchOpen} onClick={() => toggleOnly("search")} />
              {searchOpen && (
                <div className="absolute right-0 top-full mt-2 w-[280px] sm:w-72 overflow-hidden rounded-xl border border-border bg-surface shadow-xl z-50">
                  <div className="relative border-b border-border">
                    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    <input
                      autoFocus
                      type="text"
                      value={sq}
                      onChange={(e) => setSq(e.target.value)}
                      placeholder="Search stocks..."
                      className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {searchResults.length === 0 && sq.trim() && <div className="px-3 py-4 text-center text-xs text-muted">No results</div>}
                    {searchResults.map((r) => {
                      const sType = classifySymbol(r.symbol, r.securityName);
                      return (
                        <Link
                          key={r.symbol}
                          href={`/stock/${r.symbol}`}
                          onClick={() => {
                            setSearchOpen(false);
                            setSq("");
                          }}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-surface-2"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="font-bold text-primary">{r.symbol}</span>
                            <span className={`rounded px-1 text-[8px] font-bold uppercase ${TYPE_BADGE[sType]}`}>{sType}</span>
                          </span>
                          <span className="flex items-center gap-1.5 tabular-nums">
                            <span className="text-muted">{npr(r.lastTradedPrice)}</span>
                            <span className={`w-12 text-right font-bold ${r.percentageChange >= 0 ? "text-up" : "text-down"}`}>
                              {r.percentageChange >= 0 ? "+" : ""}
                              {pct(r.percentageChange)}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Alert Bell (in-app alerts) */}
            <NotificationBell />

            {/* Settings - hidden on mobile */}
            <div ref={settingsRef} className="relative hidden sm:block">
              <IconBtn d={icons.settings} active={settingsOpen} onClick={() => toggleOnly("settings")} />
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-2 w-[280px] sm:w-72 max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-xl z-50">
                  <div className="sticky top-0 border-b border-border bg-surface px-3 py-2">
                    <span className="text-sm font-bold text-foreground">Settings</span>
                  </div>
                  <div className="p-3 space-y-3">
                    {/* Theme toggle */}
                    <div className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-surface-2">
                      <div className="flex items-center gap-2 text-xs text-foreground">
                        <Icon d={theme.dark ? icons.moon : icons.sun} size={14} />
                        <span>{theme.dark ? "Dark Mode" : "Light Mode"}</span>
                      </div>
                      <button
                        onClick={theme.toggle}
                        className="relative h-5 w-9 rounded-full transition"
                        style={{ background: theme.dark ? "#0F6E56" : "#ccc" }}
                      >
                        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: theme.dark ? 18 : 2 }} />
                      </button>
                    </div>

                    <hr className="border-border" />

                    {/* Notifications Section */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 px-2">Notifications</div>
                      
                      {/* Master Toggle */}
                      <div className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-surface-2 mb-1">
                        <div className="flex items-center gap-2 text-xs text-foreground">
                          <Icon d={icons.bell} size={14} />
                          <span>All Notifications</span>
                        </div>
                        <button
                          onClick={() => notif.updateSettings({ enabled: !notif.settings.enabled })}
                          className="relative h-5 w-9 rounded-full transition"
                          style={{ background: notif.settings.enabled ? "#0F6E56" : "#ccc" }}
                        >
                          <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.enabled ? 18 : 2 }} />
                        </button>
                      </div>

                      {/* Notification Types */}
                      {notif.settings.enabled && (
                        <div className="space-y-1 ml-2 border-l-2 border-border pl-3">
                          {/* News */}
                          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: "#0F6E56" }} />
                              <span className="text-[11px] text-foreground">News</span>
                            </div>
                            <button
                              onClick={() => notif.toggleType("news")}
                              className="relative h-4 w-7 rounded-full transition"
                              style={{ background: notif.settings.news ? "#0F6E56" : "#ccc" }}
                            >
                              <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.news ? 14 : 2 }} />
                            </button>
                          </div>

                          {/* Broker */}
                          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: "#e67e22" }} />
                              <span className="text-[11px] text-foreground">Broker Flow</span>
                            </div>
                            <button
                              onClick={() => notif.toggleType("broker")}
                              className="relative h-4 w-7 rounded-full transition"
                              style={{ background: notif.settings.broker ? "#0F6E56" : "#ccc" }}
                            >
                              <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.broker ? 14 : 2 }} />
                            </button>
                          </div>

                          {/* Signals */}
                          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: "#9b59b6" }} />
                              <span className="text-[11px] text-foreground">Trading Signals</span>
                            </div>
                            <button
                              onClick={() => notif.toggleType("signal")}
                              className="relative h-4 w-7 rounded-full transition"
                              style={{ background: notif.settings.signal ? "#0F6E56" : "#ccc" }}
                            >
                              <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.signal ? 14 : 2 }} />
                            </button>
                          </div>

                          {/* Price Alerts */}
                          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: "#3498db" }} />
                              <span className="text-[11px] text-foreground">Price Alerts</span>
                            </div>
                            <button
                              onClick={() => notif.toggleType("price")}
                              className="relative h-4 w-7 rounded-full transition"
                              style={{ background: notif.settings.price ? "#0F6E56" : "#ccc" }}
                            >
                              <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.price ? 14 : 2 }} />
                            </button>
                          </div>

                          {/* Info */}
                          <div className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: "#95a5a6" }} />
                              <span className="text-[11px] text-foreground">System Info</span>
                            </div>
                            <button
                              onClick={() => notif.toggleType("info")}
                              className="relative h-4 w-7 rounded-full transition"
                              style={{ background: notif.settings.info ? "#0F6E56" : "#ccc" }}
                            >
                              <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.info ? 14 : 2 }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <hr className="border-border" />

                    {/* Sound & Desktop */}
                    <div>
                      <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 px-2">Preferences</div>
                      
                      {/* Sound */}
                      <div className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-surface-2">
                        <span className="text-xs text-foreground">🔔 Sound</span>
                        <button
                          onClick={() => notif.toggleType("sound")}
                          className="relative h-5 w-9 rounded-full transition"
                          style={{ background: notif.settings.sound ? "#0F6E56" : "#ccc" }}
                        >
                          <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.sound ? 18 : 2 }} />
                        </button>
                      </div>

                      {/* Desktop Notifications */}
                      <div className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-surface-2">
                        <span className="text-xs text-foreground">💻 Desktop</span>
                        <button
                          onClick={() => notif.toggleType("desktop")}
                          className="relative h-5 w-9 rounded-full transition"
                          style={{ background: notif.settings.desktop ? "#0F6E56" : "#ccc" }}
                        >
                          <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: notif.settings.desktop ? 18 : 2 }} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="sticky bottom-0 border-t border-border bg-surface px-3 py-2 text-[10px] text-muted text-center">
                    NEPSE AXION v2.0 — NEPSE Analytics
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="mx-1 h-6 w-px" style={{ background: "rgba(0,0,0,0.12)" }} />

            {/* Avatar */}
            <div ref={avatarRef} className="relative">
              <button
                onClick={() => {
                  if (auth.user) toggleOnly("avatar");
                  else {
                    setLoginOpen(true);
                    setAvatarOpen(false);
                  }
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white"
                style={{ background: auth.user ? "#0F6E56" : "#999", border: `2px solid ${auth.user ? "#0F6E56" : "#999"}` }}
              >
                {auth.user ? userInitials : "?"}
              </button>

              {/* Logged-in dropdown */}
              {avatarOpen && auth.user && (
                <AvatarDropdown user={auth.user} onLogout={auth.logout} onChangePassword={auth.changePassword} onClose={() => setAvatarOpen(false)} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Vertical Navigation List ──────────────────────────── */}
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

      {/* ── Live Market Stats Bar ─────────────────────────── */}
      {live.data && live.data.data.length > 0 && (
        <LiveHeaderBar indices={indices.data} live={live.data} mkt={mkt} />
      )}

      {/* ── Live Ticker Bar ──────────────────────────────── */}
      <div className="flex items-center overflow-hidden border-b" style={{ height: 26, background: "#F5F5F0", borderColor: "rgba(0,0,0,0.12)" }}>
        <div className="flex shrink-0 items-center gap-1 border-r px-2 sm:px-3" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
          {mkt.session !== "closed" ? (
            <>
              <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: mkt.color }} />
                <span className="relative inline-flex h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full" style={{ background: mkt.color }} />
              </span>
              <span className="text-[9px] sm:text-[11px] font-semibold" style={{ color: mkt.color }}>{mkt.label}</span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full" style={{ background: "#999" }} />
              <span className="text-[9px] sm:text-[11px] font-semibold" style={{ color: "#999" }}>Closed</span>
            </>
          )}
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

      {/* ── Login Modal ── */}
      {loginOpen && <LoginModal mode={loginMode} setMode={setLoginMode} onClose={() => setLoginOpen(false)} />}

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

/* ─── Avatar Dropdown ─── */
function AvatarDropdown({
  user,
  onLogout,
  onChangePassword,
  onClose,
}: {
  user: { name: string; email: string; loggedInAt: string };
  onLogout: () => void;
  onChangePassword: (oldPw: string, newPw: string) => { ok: boolean; error?: string };
  onClose: () => void;
}) {
  const [showPwForm, setShowPwForm] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handlePwChange = () => {
    const res = onChangePassword(oldPw, newPw);
    if (res.ok) {
      setPwMsg({ ok: true, text: "Password updated!" });
      setOldPw("");
      setNewPw("");
      setTimeout(() => setShowPwForm(false), 1500);
    } else {
      setPwMsg({ ok: false, text: res.error ?? "Error" });
    }
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-[260px] sm:w-64 rounded-xl border border-border bg-surface shadow-xl z-50">
      {/* User info */}
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-bold text-foreground">{user.name}</div>
        <div className="text-[11px] text-muted">{user.email}</div>
        <div className="mt-1 text-[9px] text-muted">Logged in: {new Date(user.loggedInAt).toLocaleString()}</div>
      </div>

      {/* Login Email */}
      <div className="border-b border-border px-4 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">Login Email</div>
        <div className="text-xs font-semibold text-foreground">{user.email}</div>
      </div>

      {/* Change Password */}
      <div className="border-b border-border px-4 py-2">
        <button onClick={() => setShowPwForm(!showPwForm)} className="text-xs font-semibold text-primary hover:underline">
          {showPwForm ? "Cancel" : "Change Password"}
        </button>
        {showPwForm && (
          <div className="mt-2 space-y-2">
            <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Current password" className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
            <button onClick={handlePwChange} className="w-full rounded bg-primary py-1.5 text-xs font-bold text-white hover:opacity-90">
              Update Password
            </button>
            {pwMsg && <div className={`text-[10px] ${pwMsg.ok ? "text-up" : "text-down"}`}>{pwMsg.text}</div>}
          </div>
        )}
      </div>

      {/* Logout */}
      <div className="px-4 py-2">
        <button
          onClick={() => {
            onLogout();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-down hover:bg-down-bg"
        >
          <Icon d={icons.logout} size={14} />
          Logout
        </button>
      </div>
    </div>
  );
}

/* ─── Login Modal ─── */
function LoginModal({ mode, setMode, onClose }: { mode: "login" | "signup"; setMode: (m: "login" | "signup") => void; onClose: () => void }) {
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = () => {
    setError("");
    const res = mode === "login" ? auth.login(name || email.split("@")[0], email, password) : auth.signup(name, email, password);
    if (res.ok) onClose();
    else setError(res.error ?? "Failed");
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-3 w-full max-w-[360px] sm:max-w-sm rounded-2xl border border-border bg-surface p-4 sm:p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 text-muted hover:text-foreground">
          <Icon d={icons.x} size={18} />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-white" style={{ background: "#0F6E56" }}>
            A
          </span>
          <span className="text-lg font-extrabold text-foreground">NEPSE AXION</span>
        </div>

        <h2 className="mb-1 text-base font-bold text-foreground">{mode === "login" ? "Welcome back" : "Create account"}</h2>
        <p className="mb-4 text-xs text-muted">{mode === "login" ? "Sign in to your account" : "Sign up for free"}</p>

        {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-xs text-down">{error}</div>}

        <div className="space-y-3">
          {mode === "signup" && (
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary placeholder:text-muted" />
          )}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary placeholder:text-muted" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary placeholder:text-muted" />
        </div>

        <button
          onClick={handleSubmit}
          className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          style={{ background: "#0F6E56" }}
        >
          {mode === "login" ? "Sign In" : "Create Account"}
        </button>

        <p className="mt-4 text-center text-xs text-muted">
          {mode === "login" ? (
            <>
              New here?{" "}
              <button onClick={() => setMode("signup")} className="font-semibold text-primary hover:underline">
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => setMode("login")} className="font-semibold text-primary hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
