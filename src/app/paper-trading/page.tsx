"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { npr, num, pct, compact } from "@/lib/format";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData } from "@/lib/types";

type LiveResp = { data: LiveMarketData[]; count: number };

type Order = {
  id: number;
  symbol: string;
  side: "BUY" | "SELL";
  limit_price: number;
  quantity: number;
  status: string;
  placed_at: number;
  expires_at: number;
  filled_at: number | null;
  filled_price: number | null;
};

type Holding = {
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  currentLtp: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
};

type PortfolioResp = {
  cashBalance: number;
  totalEquity: number;
  totalReturnPct: number;
  holdings: Holding[];
};

type Trade = {
  id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  realized_pnl: number | null;
  executed_at: number;
};

type PerfResp = {
  totalEquity: number;
  cashBalance: number;
  startingBalance: number;
  totalReturnPct: number;
  realizedPnl: number;
  winRate: number | null;
  avgPnl: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  holdingCount: number;
  tradeCount: number;
  resetCount: number;
  lastResetAt: number | null;
  snapshots: { date: string; total_equity: number }[];
};

const DISCLAIMER = "Simulated performance using virtual capital. Past paper-trading results do not indicate real trading outcomes.";

function computeSignalScore(stock: LiveMarketData | undefined, all: LiveMarketData[]) {
  if (!stock) return null;
  const pctChg = stock.percentageChange ?? 0;
  const volume = stock.totalTradeQuantity ?? 0;
  const momentumScore = Math.min(100, Math.max(-100, pctChg * 10));
  const avgVolume = all.reduce((s, x) => s + (x.totalTradeQuantity ?? 0), 0) / Math.max(all.length, 1);
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
  const smartMoneyScore = pctChg > 0 && volumeRatio > 1.5
    ? Math.min(100, pctChg * 5 + volumeRatio * 10)
    : pctChg < 0 && volumeRatio > 1.5
      ? Math.max(-100, pctChg * 5 - volumeRatio * 10)
      : 0;
  const orderFlow = pctChg > 2 ? "Buy Pressure" : pctChg < -2 ? "Sell Pressure" : "Neutral";
  return { momentumScore, smartMoneyScore, orderFlow };
}

export default function PaperTradingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioResp | null>(null);
  const [history, setHistory] = useState<Trade[]>([]);
  const [perf, setPerf] = useState<PerfResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plSym, setPlSym] = useState("");
  const [plSide, setPlSide] = useState<"BUY" | "SELL">("BUY");
  const [plPrice, setPlPrice] = useState("");
  const [plQty, setPlQty] = useState("");
  const [plErr, setPlErr] = useState("");

  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  const [activeSubTab, setActiveSubTab] = useState<"history" | "performance">("history");

  const live = usePoll<LiveResp>("/api/live", 5_000);
  const liveData = live.data?.data ?? [];

  const fetchAll = useCallback(async () => {
    try {
      const [oRes, pRes, hRes, perfRes] = await Promise.all([
        fetch("/api/paper-trading/orders?status=PENDING"),
        fetch("/api/paper-trading/portfolio"),
        fetch("/api/paper-trading/history"),
        fetch("/api/paper-trading/performance"),
      ]);
      if (oRes.ok) setOrders((await oRes.json()).orders ?? []);
      if (pRes.ok) setPortfolio(await pRes.json());
      if (hRes.ok) setHistory((await hRes.json()).trades ?? []);
      if (perfRes.ok) setPerf(await perfRes.json());
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); const id = setInterval(fetchAll, 5_000); return () => clearInterval(id); }, [fetchAll]);

  const liveMap = useMemo(() => {
    const m: Record<string, LiveMarketData> = {};
    for (const s of liveData) m[s.symbol] = s;
    return m;
  }, [liveData]);

  const handlePlaceOrder = async () => {
    setPlErr("");
    if (!plSym.trim()) { setPlErr("Enter a symbol"); return; }
    const price = Number(plPrice);
    const qty = Number(plQty);
    if (!price || price <= 0) { setPlErr("Invalid price"); return; }
    if (!qty || qty <= 0 || !Number.isInteger(qty)) { setPlErr("Quantity must be a positive integer"); return; }
    const res = await fetch("/api/paper-trading/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: plSym.toUpperCase(), side: plSide, limitPrice: price, quantity: qty }),
    });
    if (!res.ok) {
      const err = await res.json();
      setPlErr(err.error ?? "Failed to place order");
      return;
    }
    setPlSym(""); setPlPrice(""); setPlQty("");
    fetchAll();
  };

  const handleCancel = async (id: number) => {
    await fetch(`/api/paper-trading/orders/${id}`, { method: "DELETE" });
    fetchAll();
  };

  const handleReset = async () => {
    setResetMsg("");
    const res = await fetch("/api/paper-trading/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: true }),
    });
    if (!res.ok) {
      const err = await res.json();
      setResetMsg(err.error ?? "Reset failed");
    } else {
      setResetMsg("Account reset successfully!");
      setResetConfirm(false);
      fetchAll();
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-2 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-surface-2 animate-pulse" />)}
        </div>
        <div className="h-96 rounded-xl bg-surface-2 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-down font-semibold">{error}</p>
          <button onClick={fetchAll} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">Retry</button>
        </div>
      </div>
    );
  }

  const p = portfolio;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      {/* ── Account Summary ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-extrabold text-foreground">Paper Trading</h1>
          <span className="rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ borderColor: "#d4af37", color: "#d4af37", background: "#fef9e7" }}>
            DEMO
          </span>
          <span className="text-[10px] text-muted">Virtual ₨1,000,000</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted">Total Equity</div>
          <div className={`text-lg font-black tabular-nums ${p && p.totalReturnPct >= 0 ? "text-up" : "text-down"}`}>
            {p ? npr(p.totalEquity) : "—"}
          </div>
          <div className={`text-[10px] font-semibold ${p && p.totalReturnPct >= 0 ? "text-up" : "text-down"}`}>
            {p != null ? `${p.totalReturnPct >= 0 ? "+" : ""}${p.totalReturnPct.toFixed(2)}%` : "—"} all time
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-[10px] text-muted">Cash Balance</div>
          <div className="text-sm font-bold tabular-nums text-foreground">{p ? npr(p.cashBalance) : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-[10px] text-muted">Holdings Value</div>
          <div className="text-sm font-bold tabular-nums text-foreground">
            {p ? npr((p.holdings || []).reduce((s, h) => s + (h.currentLtp ?? h.avgBuyPrice) * h.quantity, 0)) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-[10px] text-muted">Open Positions</div>
          <div className="text-sm font-bold tabular-nums text-foreground">{p ? (p.holdings || []).length : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="text-[10px] text-muted">Pending Orders</div>
          <div className="text-sm font-bold tabular-nums text-foreground">{orders.length}</div>
        </div>
      </div>

      {/* ── Place Order + Order Panel ── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-[320px_1fr]">
        {/* Place Order form */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">Place Order</h2>
          <div className="space-y-2.5">
            <input
              type="text" value={plSym} onChange={(e) => setPlSym(e.target.value.toUpperCase())}
              placeholder="Symbol (e.g. NABIL)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary placeholder:text-muted"
            />
            <div className="flex gap-2">
              <button onClick={() => setPlSide("BUY")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${plSide === "BUY" ? "bg-up text-white" : "border border-border text-muted hover:bg-surface-2"}`}>
                BUY
              </button>
              <button onClick={() => setPlSide("SELL")}
                className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${plSide === "SELL" ? "bg-down text-white" : "border border-border text-muted hover:bg-surface-2"}`}>
                SELL
              </button>
            </div>
            <input
              type="number" value={plPrice} onChange={(e) => setPlPrice(e.target.value)}
              placeholder="Limit price (Rs)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary placeholder:text-muted"
            />
            <input
              type="number" value={plQty} onChange={(e) => setPlQty(e.target.value)}
              placeholder="Quantity"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary placeholder:text-muted"
            />
            {plErr && <div className="text-[10px] text-down font-semibold">{plErr}</div>}
            <button onClick={handlePlaceOrder}
              className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-white hover:opacity-90">
              Place {plSide} Order
            </button>
          </div>
        </div>

        {/* Pending Orders */}
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-bold text-foreground">Pending Orders ({orders.length})</h2>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {orders.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted">No pending orders</div>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-surface text-left text-[9px] font-semibold uppercase text-muted">
                  <tr><th className="px-4 py-2">Symbol</th><th>Side</th><th>Price</th><th>Qty</th><th>Expires</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const remain = Math.max(0, o.expires_at - Date.now());
                    const hours = Math.floor(remain / 3600000);
                    const mins = Math.floor((remain % 3600000) / 60000);
                    return (
                      <tr key={o.id} className="border-t border-border hover:bg-surface-2">
                        <td className="px-4 py-2 font-bold text-foreground">{o.symbol}</td>
                        <td className={`font-semibold ${o.side === "BUY" ? "text-up" : "text-down"}`}>{o.side}</td>
                        <td className="tabular-nums text-foreground">{npr(o.limit_price)}</td>
                        <td className="tabular-nums text-foreground">{num(o.quantity)}</td>
                        <td className="tabular-nums text-muted">{hours}h {mins}m</td>
                        <td>
                          <button onClick={() => handleCancel(o.id)}
                            className="rounded bg-down-bg px-2 py-0.5 text-[9px] font-semibold text-down hover:opacity-80">
                            Cancel
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Portfolio ── */}
      <div className="mb-6 rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-bold text-foreground">Portfolio ({p ? (p.holdings || []).length : 0} holdings)</h2>
        </div>
        <div className="overflow-x-auto">
          {!p || !p.holdings || p.holdings.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted">No open positions</div>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="bg-surface text-left text-[9px] font-semibold uppercase text-muted">
                <tr>
                  <th className="px-4 py-2">Symbol</th>
                  <th>Qty</th>
                  <th>Avg Cost</th>
                  <th>LTP</th>
                  <th>Unrealized P&L</th>
                  <th>Momentum</th>
                  <th>Smart $</th>
                  <th>Flow</th>
                </tr>
              </thead>
              <tbody>
                {p.holdings.map((h) => {
                  const liveStock = liveMap[h.symbol];
                  const sig = computeSignalScore(liveStock, liveData);
                  return (
                    <tr key={h.symbol} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-2 font-bold text-foreground">{h.symbol}</td>
                      <td className="tabular-nums text-foreground">{num(h.quantity)}</td>
                      <td className="tabular-nums text-foreground">{npr(h.avgBuyPrice)}</td>
                      <td className="tabular-nums">{h.currentLtp != null ? npr(h.currentLtp) : <span className="text-muted">—</span>}</td>
                      <td className={`tabular-nums font-semibold ${h.unrealizedPnl != null ? (h.unrealizedPnl >= 0 ? "text-up" : "text-down") : ""}`}>
                        {h.unrealizedPnl != null ? `${h.unrealizedPnl >= 0 ? "+" : ""}${npr(h.unrealizedPnl)}` : <span className="text-muted">—</span>}
                      </td>
                      <td>{sig ? <span className={`font-semibold ${sig.momentumScore >= 0 ? "text-up" : "text-down"}`}>{sig.momentumScore.toFixed(0)}</span> : <span className="text-muted">—</span>}</td>
                      <td>{sig ? <span className={`font-semibold ${sig.smartMoneyScore >= 0 ? "text-up" : "text-down"}`}>{sig.smartMoneyScore.toFixed(0)}</span> : <span className="text-muted">—</span>}</td>
                      <td>{sig ? <span className={`font-semibold ${sig.orderFlow === "Buy Pressure" ? "text-up" : sig.orderFlow === "Sell Pressure" ? "text-down" : "text-muted"}`}>{sig.orderFlow}</span> : <span className="text-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── History & Performance ── */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex border-b border-border">
          <button onClick={() => setActiveSubTab("history")}
            className={`px-4 py-2.5 text-xs font-bold transition ${activeSubTab === "history" ? "border-b-2 border-primary text-primary" : "text-muted hover:text-foreground"}`}>
            Trade History
          </button>
          <button onClick={() => setActiveSubTab("performance")}
            className={`px-4 py-2.5 text-xs font-bold transition ${activeSubTab === "performance" ? "border-b-2 border-primary text-primary" : "text-muted hover:text-foreground"}`}>
            Performance
          </button>
        </div>

        {activeSubTab === "history" ? (
          <div className="overflow-x-auto">
            {history.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted">No trades yet</div>
            ) : (
              <table className="w-full text-[10px]">
                <thead className="bg-surface text-left text-[9px] font-semibold uppercase text-muted">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Realized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-2 tabular-nums text-muted">{new Date(t.executed_at).toLocaleDateString("en-IN")}</td>
                      <td className="font-bold text-foreground">{t.symbol}</td>
                      <td className={`font-semibold ${t.side === "BUY" ? "text-up" : "text-down"}`}>{t.side}</td>
                      <td className="tabular-nums text-foreground">{num(t.quantity)}</td>
                      <td className="tabular-nums text-foreground">{npr(t.price)}</td>
                      <td className={`tabular-nums font-semibold ${t.realized_pnl != null ? (t.realized_pnl >= 0 ? "text-up" : "text-down") : "text-muted"}`}>
                        {t.realized_pnl != null ? `${t.realized_pnl >= 0 ? "+" : ""}${npr(t.realized_pnl)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="p-4">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[9px] text-muted">Total Return</div>
                <div className={`text-base font-black tabular-nums ${perf && perf.totalReturnPct >= 0 ? "text-up" : "text-down"}`}>
                  {perf ? `${perf.totalReturnPct >= 0 ? "+" : ""}${perf.totalReturnPct.toFixed(2)}%` : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[9px] text-muted">Realized P&L</div>
                <div className={`text-base font-black tabular-nums ${perf && perf.realizedPnl >= 0 ? "text-up" : "text-down"}`}>
                  {perf ? `${perf.realizedPnl >= 0 ? "+" : ""}${npr(perf.realizedPnl)}` : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[9px] text-muted">Win Rate</div>
                <div className="text-base font-black tabular-nums text-foreground">{perf && perf.winRate != null ? `${(perf.winRate * 100).toFixed(1)}%` : "—"}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[9px] text-muted">Total Trades</div>
                <div className="text-base font-black tabular-nums text-foreground">{perf ? perf.tradeCount : "—"}</div>
              </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[9px] text-muted">Avg P&L / Trade</div>
                <div className={`text-sm font-bold tabular-nums ${perf && perf.avgPnl != null ? (perf.avgPnl >= 0 ? "text-up" : "text-down") : ""}`}>
                  {perf && perf.avgPnl != null ? `${perf.avgPnl >= 0 ? "+" : ""}${npr(perf.avgPnl)}` : "—"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[9px] text-muted">Best Trade</div>
                <div className="text-sm font-bold tabular-nums text-up">{perf && perf.bestTrade != null ? npr(perf.bestTrade) : "—"}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[9px] text-muted">Worst Trade</div>
                <div className="text-sm font-bold tabular-nums text-down">{perf && perf.worstTrade != null ? npr(perf.worstTrade) : "—"}</div>
              </div>
            </div>

            {/* Equity curve */}
            {perf && perf.snapshots && perf.snapshots.length > 1 && (
              <div className="mb-3 rounded-lg border border-border bg-surface-2 p-3">
                <div className="mb-2 text-[10px] font-bold text-muted">Equity Curve</div>
                <div className="flex items-end gap-[2px]" style={{ height: 80 }}>
                  {perf.snapshots.map((s, i) => {
                    const values = perf.snapshots!.map(x => x.total_equity);
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const range = max - min || 1;
                    const h = ((s.total_equity - min) / range) * 100;
                    const isPos = s.total_equity >= perf.startingBalance;
                    return (
                      <div key={s.date} className="flex-1 rounded-t transition hover:opacity-80"
                        style={{ height: `${Math.max(h, 2)}%`, background: isPos ? "#00cc44" : "#e60000" }}
                        title={`${s.date}: ${npr(s.total_equity)}`} />
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-[9px] text-muted italic">{DISCLAIMER}</p>
          </div>
        )}
      </div>

      {/* ── Reset ── */}
      <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-surface p-4">
        <div>
          <div className="text-xs font-bold text-foreground">Reset Account</div>
          <div className="text-[10px] text-muted">Clears holdings & cancels orders. Trade history is preserved.</div>
        </div>
        {resetConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-down">Are you sure?</span>
            <button onClick={handleReset} className="rounded-lg bg-down px-3 py-1.5 text-[10px] font-bold text-white hover:opacity-90">Confirm</button>
            <button onClick={() => setResetConfirm(false)} className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-semibold text-muted hover:bg-surface-2">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setResetConfirm(true)} className="rounded-lg border border-down px-3 py-1.5 text-[10px] font-semibold text-down hover:bg-down-bg">Reset</button>
        )}
      </div>
      {resetMsg && <div className="mt-2 text-center text-[10px] font-semibold text-up">{resetMsg}</div>}
    </div>
  );
}
