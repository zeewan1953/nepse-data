"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData, MarketStatus } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, pct, changeClass, compact } from "@/lib/format";

type LiveResp = { data: LiveMarketData[]; count: number };

type Fundamental = {
  pe: number;
  pbv: number;
  eps: number;
  bvps: number;
  roe: number;
  dividend: number;
  marketCap: string;
  paidUp: string;
  bookValue: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  promoter: string;
  public: string;
  foreign: string;
  institution: string;
};

const DEMO_FUNDAMENTALS: Record<string, Fundamental> = {
  NABIL: { pe: 14.2, pbv: 1.8, eps: 32.5, bvps: 255, roe: 12.8, dividend: 18, marketCap: "52.4B", paidUp: "9.6B", bookValue: "255.4", q1: "8.2", q2: "9.1", q3: "8.8", q4: "9.5", promoter: "65%", public: "30%", foreign: "3%", institution: "2%" },
  NIFRA: { pe: 16.5, pbv: 1.2, eps: 8.4, bvps: 115, roe: 7.3, dividend: 6, marketCap: "28.1B", paidUp: "12.0B", bookValue: "115.2", q1: "2.1", q2: "2.4", q3: "2.2", q4: "2.6", promoter: "60%", public: "35%", foreign: "2%", institution: "3%" },
  HIDCL: { pe: 18.3, pbv: 1.5, eps: 5.2, bvps: 62, roe: 8.4, dividend: 4, marketCap: "35.7B", paidUp: "16.5B", bookValue: "62.5", q1: "1.4", q2: "1.5", q3: "1.3", q4: "1.6", promoter: "58%", public: "37%", foreign: "2%", institution: "3%" },
  SCB: { pe: 13.8, pbv: 1.7, eps: 38.1, bvps: 312, roe: 12.2, dividend: 20, marketCap: "48.9B", paidUp: "8.1B", bookValue: "312.6", q1: "9.5", q2: "10.2", q3: "9.8", q4: "10.5", promoter: "70%", public: "25%", foreign: "3%", institution: "2%" },
  NRIC: { pe: 21.4, pbv: 2.4, eps: 14.6, bvps: 132, roe: 11.1, dividend: 10, marketCap: "22.3B", paidUp: "4.5B", bookValue: "132.4", q1: "3.6", q2: "3.9", q3: "3.7", q4: "4.1", promoter: "55%", public: "38%", foreign: "4%", institution: "3%" },
  SHIVAM: { pe: 22.7, pbv: 2.1, eps: 11.2, bvps: 122, roe: 9.2, dividend: 8, marketCap: "18.6B", paidUp: "3.2B", bookValue: "122.1", q1: "2.8", q2: "3.0", q3: "2.9", q4: "3.2", promoter: "62%", public: "33%", foreign: "2%", institution: "3%" },
  NTC: { pe: 12.5, pbv: 1.3, eps: 45.2, bvps: 432, roe: 10.5, dividend: 25, marketCap: "78.5B", paidUp: "15.0B", bookValue: "432.8", q1: "11.3", q2: "12.1", q3: "11.8", q4: "12.5", promoter: "91%", public: "7%", foreign: "1%", institution: "1%" },
  NHPC: { pe: 15.2, pbv: 1.4, eps: 6.8, bvps: 74, roe: 9.2, dividend: 5, marketCap: "42.1B", paidUp: "10.8B", bookValue: "74.3", q1: "1.7", q2: "1.8", q3: "1.7", q4: "1.9", promoter: "51%", public: "45%", foreign: "1%", institution: "3%" },
  CBL: { pe: 11.9, pbv: 1.1, eps: 18.4, bvps: 198, roe: 9.3, dividend: 12, marketCap: "15.4B", paidUp: "3.6B", bookValue: "198.2", q1: "4.6", q2: "4.9", q3: "4.7", q4: "5.0", promoter: "60%", public: "34%", foreign: "3%", institution: "3%" },
  ALICL: { pe: 24.1, pbv: 2.8, eps: 22.5, bvps: 195, roe: 11.6, dividend: 14, marketCap: "31.2B", paidUp: "5.4B", bookValue: "195.5", q1: "5.6", q2: "6.1", q3: "5.9", q4: "6.4", promoter: "52%", public: "40%", foreign: "4%", institution: "4%" },
};

export default function FundamentalPage() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const { data } = usePoll<LiveResp>("/api/live", open ? 5_000 : 60_000);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const stocks = useMemo(() => {
    const list = data?.data ?? [];
    return list
      .filter((s) => s.totalTradeValue > 0)
      .sort((a, b) => b.totalTradeValue - a.totalTradeValue)
      .slice(0, 10);
  }, [data]);

  const topFiltered = useMemo(() => {
    if (!q) return stocks;
    return stocks.filter((s) => s.symbol.toLowerCase().includes(q.toLowerCase()) || s.securityName.toLowerCase().includes(q.toLowerCase()));
  }, [stocks, q]);

  const selectedStock = useMemo(() => stocks.find((s) => s.symbol === selected) ?? stocks[0], [stocks, selected]);
  const fundamental = selectedStock ? DEMO_FUNDAMENTALS[selectedStock.symbol.replace(/\d+/g, "")] : null;

  return (
    <div className="mx-auto max-w-[540px] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <span className="text-primary">📊</span> Top 10 Stocks
        </h1>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <i className="fa-regular fa-calendar" />
          {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 shadow-sm">
        <span className="text-muted">🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search stock…"
          className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none"
        />
        {q && (
          <button onClick={() => setQ("")} className="text-xs text-muted hover:text-foreground">
            ✕
          </button>
        )}
      </div>

      {/* Top 10 Panel */}
      <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <span className="text-amber-500">⭐</span> Top 10 by Turnover
          </h3>
          <span className="text-xs font-semibold text-primary">Deep Fundamental</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {topFiltered.map((s, idx) => {
            const rankClass = idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-amber-600" : "bg-primary";
            const isSelected = selectedStock?.symbol === s.symbol;
            return (
              <button
                key={s.symbol}
                onClick={() => setSelected(s.symbol)}
                className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition ${
                  isSelected ? "border-primary bg-surface-2" : "border-border bg-surface-2 hover:bg-surface-2/80"
                }`}
              >
                <span className={`grid h-5.5 w-5.5 place-items-center rounded-full text-[10px] font-bold text-white ${rankClass}`}>{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-foreground">{s.symbol.replace(/\d+/g, "")}</div>
                  <div className="truncate text-[10px] text-muted">{classifySymbol(s.symbol, s.securityName)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-foreground">{npr(s.lastTradedPrice)}</div>
                  <div className={`text-[11px] font-semibold ${changeClass(s.percentageChange)}`}>
                    {s.percentageChange > 0 ? "+" : ""}{pct(s.percentageChange)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail Card */}
      {selectedStock && (
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <span className="text-primary">📈</span>
              <Link href={`/stock/${selectedStock.symbol}`} className="hover:underline">
                {selectedStock.symbol.replace(/\d+/g, "")}
              </Link>
            </h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[classifySymbol(selectedStock.symbol, selectedStock.securityName)]}`}>
              {classifySymbol(selectedStock.symbol, selectedStock.securityName)}
            </span>
          </div>

          <div className="mb-3 flex items-baseline gap-3">
            <span className="text-[26px] font-bold text-foreground">{npr(selectedStock.lastTradedPrice)}</span>
            <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${changeClass(selectedStock.percentageChange)}`}>
              {selectedStock.percentageChange > 0 ? "+" : ""}{npr(selectedStock.percentageChange)} ({pct(selectedStock.percentageChange)})
            </span>
          </div>

          {fundamental && (
            <>
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                <QuickStat label="P/E" value={fundamental.pe.toFixed(1)} />
                <QuickStat label="P/BV" value={fundamental.pbv.toFixed(1)} />
                <QuickStat label="EPS" value={fundamental.eps.toFixed(1)} />
                <QuickStat label="BVPS" value={fundamental.bvps.toFixed(0)} />
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                <DeepItem label="ROE" value={`${fundamental.roe}%`} color="green" />
                <DeepItem label="Dividend" value={`${fundamental.dividend}%`} color="blue" />
                <DeepItem label="Market Cap" value={fundamental.marketCap} color="purple" />
                <DeepItem label="Paid-up Cap" value={fundamental.paidUp} color="orange" />
                <DeepItem label="Book Value" value={fundamental.bookValue} color="blue" />
                <DeepItem label="Turnover" value={compact(selectedStock.totalTradeValue)} color="green" />
              </div>

              <div className="mb-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <span>📅</span> Quarterly EPS
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <QuarterItem label="Q1" value={fundamental.q1} />
                  <QuarterItem label="Q2" value={fundamental.q2} />
                  <QuarterItem label="Q3" value={fundamental.q3} />
                  <QuarterItem label="Q4" value={fundamental.q4} />
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground">
                  Promoter <strong>{fundamental.promoter}</strong>
                </span>
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground">
                  Public <strong>{fundamental.public}</strong>
                </span>
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground">
                  Foreign <strong>{fundamental.foreign}</strong>
                </span>
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground">
                  Institution <strong>{fundamental.institution}</strong>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 py-2 text-center">
      <div className="text-[8px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}

function DeepItem({ label, value, color }: { label: string; value: string; color: "green" | "red" | "blue" | "purple" | "orange" }) {
  const colorClass = { green: "text-up", red: "text-down", blue: "text-primary", purple: "text-purple-600", orange: "text-amber-600" }[color];
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-surface-2 px-3 py-2">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <span className={`text-sm font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function QuarterItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 py-2 text-center">
      <div className="text-[9px] font-semibold text-muted">{label}</div>
      <div className="text-[13px] font-bold text-foreground">{value}</div>
    </div>
  );
}
