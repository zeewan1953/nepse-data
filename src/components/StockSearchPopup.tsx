"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, num, pct } from "@/lib/format";

/* ─── Stock Detail Popup (Glassmorphism) ─── */
interface StockDetail {
  symbol: string;
  securityName: string;
  lastTradedPrice: number;
  change: number;
  percentageChange: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  type: string;
}

type LiveResp = { data: LiveMarketData[]; count: number; source?: string };

export default function StockSearchPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const live = usePoll<LiveResp>("/api/live", 5_000);
  const liveData = live.data?.data ?? [];

  /* Search results */
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return liveData
      .filter((r) => r.symbol.toLowerCase().includes(q) || (r.securityName ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, liveData]);

  /* Auto-open when selecting from search */
  useEffect(() => {
    if (selectedStock) {
      setIsOpen(true);
      setIsLoading(false);
      setError("");
    }
  }, [selectedStock]);

  /* Focus input on open */
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  /* Click outside to close */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedStock(null);
        setQuery("");
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [isOpen]);

  /* ESC to close */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSelectedStock(null);
        setQuery("");
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [isOpen]);

  /* Handle stock selection */
  const handleSelect = (stock: LiveMarketData) => {
    setIsLoading(true);
    setError("");
    setSelectedStock({
      symbol: stock.symbol,
      securityName: stock.securityName ?? "",
      lastTradedPrice: stock.lastTradedPrice,
      change: stock.lastTradedPrice - stock.previousClose,
      percentageChange: stock.percentageChange,
      open: stock.openPrice ?? 0,
      high: stock.highPrice ?? 0,
      low: stock.lowPrice ?? 0,
      volume: stock.lastTradedVolume ?? 0,
      previousClose: stock.previousClose ?? 0,
      type: classifySymbol(stock.symbol, stock.securityName),
    });
  };

  /* Handle search submit */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleSelect(searchResults[0]);
    } else if (query.trim()) {
      setError(`Stock "${query}" not found`);
    }
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => {
          setIsOpen(true);
          setQuery("");
          setSelectedStock(null);
          setError("");
        }}
        className="relative grid h-8 w-8 place-items-center rounded-lg transition hover:bg-surface-2"
        style={{ color: "#555" }}
        title="Search Stocks"
      >
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      {/* Glassmorphism Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-20 sm:pt-24 p-4"
          onClick={() => { setIsOpen(false); setSelectedStock(null); setQuery(""); }}
        >
          {/* Backdrop blur */}
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(0, 0, 0, 0.3)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />

          {/* Modal Content - Compact with Flex Layout */}
          <div
            ref={modalRef}
            className="relative w-full max-w-md rounded-xl border border-white/20 shadow-2xl flex flex-col max-h-[80vh]"
            style={{
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              animation: "slideUp 0.2s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Compact */}
            <div className="flex items-center justify-between border-b border-white/30 px-4 py-3">
              <h2 className="text-sm font-bold text-foreground">🔍 Search Stocks</h2>
              <button
                onClick={() => { setIsOpen(false); setSelectedStock(null); setQuery(""); }}
                className="grid h-6 w-6 place-items-center rounded-lg hover:bg-surface-2 transition"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Input - Compact */}
            <form onSubmit={handleSubmit} className="border-b border-white/30 px-4 py-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type symbol... (NABIL, NTC, HDL)"
                  className="w-full rounded-lg border border-white/40 bg-white/50 py-2.5 pl-9 pr-4 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsOpen(false);
                      setSelectedStock(null);
                      setQuery("");
                    }
                  }}
                />
              </div>
            </form>

            {/* Search Results - Scrollable with Flex */}
            {!selectedStock && (
              <div className="flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: "320px", scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.2) transparent" }}>
                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
                {query.trim() && searchResults.length === 0 && !error && !isLoading && (
                  <div className="px-4 py-6 text-center text-xs text-muted">
                    ❌ No stocks found for "{query}"
                  </div>
                )}
                {error && (
                  <div className="px-4 py-6 text-center text-xs text-down font-medium">⚠️ {error}</div>
                )}
                {searchResults.map((r) => {
                  const sType = classifySymbol(r.symbol, r.securityName);
                  return (
                    <button
                      key={r.symbol}
                      onClick={() => handleSelect(r)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-white/60 transition border-b border-white/20 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-bold text-primary text-xs">{r.symbol}</span>
                        <span className={`rounded px-1 py-0.5 text-[8px] font-bold uppercase shrink-0 ${TYPE_BADGE[sType]}`}>{sType}</span>
                        {r.securityName && <span className="text-muted text-[10px] truncate">{r.securityName}</span>}
                      </div>
                      <div className="flex items-center gap-2 tabular-nums shrink-0">
                        <span className="text-muted text-[10px]">{npr(r.lastTradedPrice)}</span>
                        <span className={`w-12 text-right font-bold text-[10px] ${r.percentageChange >= 0 ? "text-up" : "text-down"}`}>
                          {r.percentageChange >= 0 ? "+" : ""}{pct(r.percentageChange)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Stock Detail View */}
            {selectedStock && (
              <div className="p-6">
                {isLoading ? (
                  /* Loading Animation */
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    <p className="mt-4 text-sm text-muted">Loading stock data...</p>
                  </div>
                ) : (
                  <>
                    {/* Stock Header */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-2xl font-bold text-primary">{selectedStock.symbol}</h3>
                        <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${TYPE_BADGE[selectedStock.type as keyof typeof TYPE_BADGE]}`}>
                          {selectedStock.type}
                        </span>
                      </div>
                      {selectedStock.securityName && (
                        <p className="text-sm text-muted">{selectedStock.securityName}</p>
                      )}
                    </div>

                    {/* Price Display */}
                    <div className="mb-6 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 p-4 border border-primary/20">
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-4xl font-bold text-foreground">
                            {npr(selectedStock.lastTradedPrice)}
                          </div>
                          <div className={`flex items-center gap-2 mt-1 text-sm font-semibold ${selectedStock.change >= 0 ? "text-up" : "text-down"}`}>
                            <span>{selectedStock.change >= 0 ? "▲" : "▼"} {npr(Math.abs(selectedStock.change))}</span>
                            <span>({selectedStock.percentageChange >= 0 ? "+" : ""}{pct(selectedStock.percentageChange)})</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stock Metrics Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <MetricCard label="Open" value={npr(selectedStock.open)} />
                      <MetricCard label="Previous Close" value={npr(selectedStock.previousClose)} />
                      <MetricCard label="High" value={npr(selectedStock.high)} highlight="up" />
                      <MetricCard label="Low" value={npr(selectedStock.low)} highlight="down" />
                      <MetricCard label="Volume" value={num(selectedStock.volume)} />
                      <MetricCard label="Type" value={selectedStock.type} />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          setSelectedStock(null);
                          setQuery("");
                        }}
                        className="flex-1 rounded-lg bg-primary text-white py-2.5 text-sm font-semibold hover:bg-primary/90 transition"
                      >
                        View Full Details
                      </button>
                      <button
                        onClick={() => {
                          setSelectedStock(null);
                          setQuery("");
                          setTimeout(() => inputRef.current?.focus(), 100);
                        }}
                        className="px-4 rounded-lg border border-white/40 py-2.5 text-sm font-medium hover:bg-white/50 transition"
                      >
                        Search Again
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-slide-up {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

/* ─── Metric Card Component ─── */
function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: "up" | "down" }) {
  return (
    <div className="rounded-lg bg-white/40 border border-white/30 p-3">
      <div className="text-[10px] text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-bold ${highlight === "up" ? "text-up" : highlight === "down" ? "text-down" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
