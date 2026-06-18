"use client";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { npr, num, compact } from "@/lib/format";
import {
  type DemoState, type DemoOrder, type DemoPosition,
  loadState, saveState, initAccount, resetAccount, orderId, STARTING_BALANCE,
} from "@/lib/demo/store";
import { calcFees, validateOrder } from "@/lib/demo/fees";

/* ─── Types ─── */
type PriceMap = Record<string, { ltp: number; updatedAt: number }>;
type PrevCloseMap = Record<string, { prevClose: number; date: string }>;

/* ─── Main Page ─── */
export default function DemoPage() {
  const [state, setState] = useState<DemoState | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [prevClose, setPrevClose] = useState<PrevCloseMap>({});
  const [tab, setTab] = useState<"dashboard" | "orders" | "performance">("dashboard");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSymbol, setTicketSymbol] = useState("");
  const [ticketPrice, setTicketPrice] = useState(0);
  const [ticketSignal, setTicketSignal] = useState<DemoOrder["signalSnapshot"]>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  const userId = "guest";

  // Load state from localStorage
  useEffect(() => {
    const s = loadState(userId);
    if (s) setState(s);
    else {
      const fresh = initAccount(userId);
      saveState(userId, fresh);
      setState(fresh);
    }
  }, [userId]);

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/prices", { cache: "no-store" });
      const j = await r.json();
      setPrices(j.prices ?? {});
      setPrevClose(j.prevClose ?? {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPrices();
    const t = setInterval(fetchPrices, 60_000);
    return () => clearInterval(t);
  }, [fetchPrices]);

  // Mark-to-market helpers
  const getPositionValue = useCallback((pos: DemoPosition) => {
    const p = prices[pos.symbol];
    return p ? p.ltp * pos.qty : pos.avgCost * pos.qty;
  }, [prices]);

  const getPositionPnL = useCallback((pos: DemoPosition) => {
    const val = getPositionValue(pos);
    const cost = pos.avgCost * pos.qty;
    return val - cost;
  }, [getPositionValue]);

  const totalPositionValue = useMemo(() =>
    state?.positions.reduce((sum, p) => sum + getPositionValue(p), 0) ?? 0,
    [state, getPositionValue]);

  const totalUnrealizedPnL = useMemo(() =>
    state?.positions.reduce((sum, p) => sum + getPositionPnL(p), 0) ?? 0,
    [state, getPositionPnL]);

  const totalPortfolioValue = (state?.account.balance ?? 0) + totalPositionValue;
  const totalReturn = totalPortfolioValue - STARTING_BALANCE;
  const totalReturnPct = (totalReturn / STARTING_BALANCE) * 100;

  // Place order
  const placeOrder = useCallback((symbol: string, side: "buy" | "sell", qty: number, signalSnapshot?: DemoOrder["signalSnapshot"]) => {
    if (!state) return { success: false, error: "No account" };

    const priceData = prices[symbol];
    const price = priceData?.ltp ?? 0;
    const prevC = prevClose[symbol]?.prevClose ?? 0;
    const pos = state.positions.find(p => p.symbol === symbol);
    const posQty = pos?.qty ?? 0;

    const validation = validateOrder(side, qty, price, prevC, state.account.balance, posQty);
    if (!validation.valid) return { success: false, error: validation.error };

    const fees = calcFees(side, qty, price);
    const tradeValue = fees.tradeValue;
    let newBalance = state.account.balance;
    const newPositions = [...state.positions];

    if (side === "buy") {
      newBalance -= (tradeValue + fees.total);
      const existing = newPositions.find(p => p.symbol === symbol);
      if (existing) {
        const newQty = existing.qty + qty;
        existing.avgCost = ((existing.avgCost * existing.qty) + (price * qty)) / newQty;
        existing.qty = newQty;
      } else {
        newPositions.push({ symbol, qty, avgCost: price, openedAt: Date.now() });
      }
    } else {
      newBalance += (tradeValue - fees.total);
      const existing = newPositions.find(p => p.symbol === symbol);
      if (existing) {
        existing.qty -= qty;
        if (existing.qty <= 0) {
          const idx = newPositions.indexOf(existing);
          newPositions.splice(idx, 1);
        }
      }
    }

    const order: DemoOrder = {
      id: orderId(), ts: Date.now(), symbol, side, qty, price,
      fees: fees.total, total: tradeValue, balanceAfter: newBalance,
      signalSnapshot: signalSnapshot ?? null,
    };

    const newState: DemoState = {
      account: { ...state.account, balance: newBalance },
      positions: newPositions,
      orders: [order, ...state.orders],
    };
    saveState(userId, newState);
    setState(newState);
    return { success: true, order };
  }, [state, prices, prevClose, userId]);

  const handleReset = () => {
    const fresh = resetAccount(userId);
    setState(fresh);
    setResetConfirm(false);
  };

  const openTicket = (symbol?: string, price?: number) => {
    setTicketSymbol(symbol ?? "");
    setTicketPrice(price ?? 0);
    setTicketSignal(null);
    setTicketOpen(true);
  };

  const openTicketFromParams = (sym: string, price: number, signal: DemoOrder["signalSnapshot"]) => {
    setTicketSymbol(sym);
    setTicketPrice(price);
    setTicketSignal(signal);
    setTicketOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Auto-open ticket from stock page URL params */}
      <Suspense fallback={null}>
        <SearchParamsHandler onOpen={openTicketFromParams} />
      </Suspense>

      {/* DEMO Banner */}
      <div className="rounded-xl border-2 border-amber-500 bg-amber-500/10 px-4 py-3 text-center">
        <div className="text-base font-extrabold text-amber-700 dark:text-amber-400">
          DEMO ACCOUNT — फेक पैसा, वास्तविक ट्रेड होइन
        </div>
        <div className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
          Virtual NPR {num(STARTING_BALANCE)} balance · No real money · No real brokerage · For learning only
        </div>
      </div>

      {/* Account Summary */}
      {state && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Cash Balance" value={`Rs ${npr(state.account.balance)}`} />
          <StatCard label="Portfolio Value" value={`Rs ${npr(totalPortfolioValue)}`} sub={totalReturn >= 0 ? "text-up" : "text-down"} />
          <StatCard label="Total Return" value={`${totalReturn >= 0 ? "+" : ""}${npr(totalReturn)}`} sub={totalReturnPct >= 0 ? "text-up" : "text-down"} />
          <StatCard label="Return %" value={`${totalReturnPct >= 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%`} sub={totalReturnPct >= 0 ? "text-up" : "text-down"} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {([
          { key: "dashboard", label: "📊 Dashboard" },
          { key: "orders", label: "📋 Orders" },
          { key: "performance", label: "📈 Performance" },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-amber-500 text-white shadow-sm" : "text-muted hover:bg-surface-2"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "dashboard" && state && (
        <DashboardTab
          state={state} prices={prices}
          getPositionValue={getPositionValue} getPositionPnL={getPositionPnL}
          totalPositionValue={totalPositionValue} totalUnrealizedPnL={totalUnrealizedPnL}
          openTicket={openTicket}
          resetConfirm={resetConfirm} setResetConfirm={setResetConfirm}
          handleReset={handleReset}
        />
      )}

      {tab === "orders" && state && (
        <OrdersTab state={state} prices={prices} />
      )}

      {tab === "performance" && state && (
        <PerformanceTab state={state} prices={prices}
          getPositionValue={getPositionValue}
          totalPortfolioValue={totalPortfolioValue} totalReturn={totalReturn}
        />
      )}

      {/* Order Ticket Modal */}
      {ticketOpen && state && (
        <OrderTicketModal
          state={state} prices={prices} prevClose={prevClose}
          symbol={ticketSymbol} initPrice={ticketPrice}
          signalSnapshot={ticketSignal}
          onClose={() => setTicketOpen(false)}
          onPlace={placeOrder}
        />
      )}

      {/* Trade Now Button */}
      <div className="flex justify-center pb-6">
        <button onClick={() => openTicket()}
          className="rounded-xl bg-amber-500 px-8 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-amber-600 active:scale-95">
          🎯 Place Demo Trade
        </button>
      </div>
    </div>
  );
}

/* ─── Dashboard Tab ─── */
function DashboardTab({ state, prices, getPositionValue, getPositionPnL, totalPositionValue, totalUnrealizedPnL, openTicket, resetConfirm, setResetConfirm, handleReset }: {
  state: DemoState; prices: PriceMap;
  getPositionValue: (p: DemoPosition) => number; getPositionPnL: (p: DemoPosition) => number;
  totalPositionValue: number; totalUnrealizedPnL: number;
  openTicket: (s?: string, p?: number) => void;
  resetConfirm: boolean; setResetConfirm: (v: boolean) => void; handleReset: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Positions */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">Open Positions ({state.positions.length})</h3>
          <span className="text-xs text-muted">
            Invested: Rs {npr(state.positions.reduce((s, p) => s + p.avgCost * p.qty, 0))} ·
            Current: Rs {npr(totalPositionValue)} ·
            Unrealized P&L: <span className={totalUnrealizedPnL >= 0 ? "text-up" : "text-down"}>{totalUnrealizedPnL >= 0 ? "+" : ""}Rs {npr(totalUnrealizedPnL)}</span>
          </span>
        </div>

        {state.positions.length === 0 ? (
          <div className="py-8 text-center text-muted">No open positions. Click &quot;Place Demo Trade&quot; to start trading.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 text-left">Symbol</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Avg Cost</th>
                  <th className="py-2 text-right">Current Price</th>
                  <th className="py-2 text-right">Value</th>
                  <th className="py-2 text-right">P&L</th>
                  <th className="py-2 text-right">P&L %</th>
                  <th className="py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {state.positions.map((pos) => {
                  const curPrice = prices[pos.symbol]?.ltp ?? 0;
                  const val = getPositionValue(pos);
                  const pnl = getPositionPnL(pos);
                  const pnlPct = pos.avgCost > 0 ? ((curPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
                  return (
                    <tr key={pos.symbol} className="border-b border-border/50 hover:bg-surface-2/50">
                      <td className="py-2 font-bold">
                        <Link href={`/stock/${pos.symbol}`} className="text-primary hover:underline">{pos.symbol}</Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{num(pos.qty)}</td>
                      <td className="py-2 text-right tabular-nums">{npr(pos.avgCost)}</td>
                      <td className="py-2 text-right tabular-nums">{curPrice > 0 ? npr(curPrice) : "-"}</td>
                      <td className="py-2 text-right tabular-nums">{npr(val)}</td>
                      <td className={`py-2 text-right tabular-nums font-bold ${pnl >= 0 ? "text-up" : "text-down"}`}>
                        {pnl >= 0 ? "+" : ""}{npr(pnl)}
                      </td>
                      <td className={`py-2 text-right tabular-nums font-bold ${pnlPct >= 0 ? "text-up" : "text-down"}`}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                      </td>
                      <td className="py-2 text-center">
                        <button onClick={() => openTicket(pos.symbol, curPrice)}
                          className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 hover:bg-amber-500/20 dark:text-amber-400">
                          Trade
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="mb-2 text-sm font-bold">⚙️ Account Management</h3>
        {!resetConfirm ? (
          <button onClick={() => setResetConfirm(true)}
            className="rounded-lg border border-down/30 bg-down-bg px-4 py-2 text-xs font-bold text-down hover:bg-down-bg/80">
            Reset Demo Account
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-down">Are you sure? This will wipe all positions and trades.</span>
            <button onClick={handleReset}
              className="rounded-lg bg-down px-4 py-2 text-xs font-bold text-white">Yes, Reset</button>
            <button onClick={() => setResetConfirm(false)}
              className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted hover:bg-surface-2">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Orders Tab ─── */
function OrdersTab({ state, prices }: { state: DemoState; prices: PriceMap }) {
  const [filter, setFilter] = useState("");
  const filtered = filter
    ? state.orders.filter(o => o.symbol.includes(filter.toUpperCase()))
    : state.orders;

  // Realized P&L calculation
  const realizedPnL = useMemo(() => {
    let pnl = 0;
    const buys: Record<string, { qty: number; totalCost: number }> = {};
    for (const o of [...state.orders].reverse()) {
      if (!buys[o.symbol]) buys[o.symbol] = { qty: 0, totalCost: 0 };
      if (o.side === "buy") {
        buys[o.symbol].qty += o.qty;
        buys[o.symbol].totalCost += o.price * o.qty;
      } else {
        const avgCost = buys[o.symbol].qty > 0 ? buys[o.symbol].totalCost / buys[o.symbol].qty : 0;
        pnl += (o.price - avgCost) * o.qty - o.fees;
        buys[o.symbol].qty -= o.qty;
        buys[o.symbol].totalCost = buys[o.symbol].qty > 0 ? avgCost * buys[o.symbol].qty : 0;
      }
    }
    return pnl;
  }, [state.orders]);

  // Signal-followed stats
  const signalStats = useMemo(() => {
    const withSignal = state.orders.filter(o => o.signalSnapshot);
    const followed = withSignal.filter(o => {
      const rec = o.signalSnapshot?.recommendation ?? "";
      return (o.side === "buy" && (rec.includes("Buy"))) || (o.side === "sell" && (rec.includes("Sell")));
    });
    return { total: withSignal.length, followed: followed.length };
  }, [state.orders]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Orders" value={num(state.orders.length)} />
        <StatCard label="Realized P&L" value={`${realizedPnL >= 0 ? "+" : ""}Rs ${npr(realizedPnL)}`} sub={realizedPnL >= 0 ? "text-up" : "text-down"} />
        <StatCard label="Signal-Followed" value={`${signalStats.followed}/${signalStats.total}`} />
        <StatCard label="Open Positions" value={num(state.positions.length)} />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value.toUpperCase())}
          placeholder="Filter by symbol..."
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold outline-none focus:border-amber-500 uppercase" />
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="mb-3 text-base font-bold">Trade Ledger</h3>
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-muted">No trades yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 text-left">Time</th>
                  <th className="py-2 text-left">Symbol</th>
                  <th className="py-2 text-center">Side</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Price</th>
                  <th className="py-2 text-right">Fees</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Balance</th>
                  <th className="py-2 text-center">Signal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="py-2 text-xs text-muted">{new Date(o.ts).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="py-2 font-bold">
                      <Link href={`/stock/${o.symbol}`} className="text-primary hover:underline">{o.symbol}</Link>
                    </td>
                    <td className="py-2 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${o.side === "buy" ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
                        {o.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{num(o.qty)}</td>
                    <td className="py-2 text-right tabular-nums">{npr(o.price)}</td>
                    <td className="py-2 text-right tabular-nums text-muted">{npr(o.fees)}</td>
                    <td className="py-2 text-right tabular-nums">{npr(o.total)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{npr(o.balanceAfter)}</td>
                    <td className="py-2 text-center text-xs">
                      {o.signalSnapshot ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {o.signalSnapshot.recommendation}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Performance Tab ─── */
function PerformanceTab({ state, prices, getPositionValue, totalPortfolioValue, totalReturn }: {
  state: DemoState; prices: PriceMap;
  getPositionValue: (p: DemoPosition) => number;
  totalPortfolioValue: number; totalReturn: number;
}) {
  const totalReturnPct = (totalReturn / STARTING_BALANCE) * 100;

  // Win/loss stats from closed trades
  const { wins, losses, avgWin, avgLoss, winRate } = useMemo(() => {
    const buys: Record<string, { qty: number; totalCost: number }> = {};
    const trades: { pnl: number }[] = [];
    for (const o of [...state.orders].reverse()) {
      if (!buys[o.symbol]) buys[o.symbol] = { qty: 0, totalCost: 0 };
      if (o.side === "buy") {
        buys[o.symbol].qty += o.qty;
        buys[o.symbol].totalCost += o.price * o.qty;
      } else {
        const avgCost = buys[o.symbol].qty > 0 ? buys[o.symbol].totalCost / buys[o.symbol].qty : 0;
        const pnl = (o.price - avgCost) * o.qty - o.fees;
        trades.push({ pnl });
        buys[o.symbol].qty -= o.qty;
        buys[o.symbol].totalCost = buys[o.symbol].qty > 0 ? avgCost * buys[o.symbol].qty : 0;
      }
    }
    const w = trades.filter(t => t.pnl > 0);
    const l = trades.filter(t => t.pnl <= 0);
    return {
      wins: w.length, losses: l.length,
      avgWin: w.length > 0 ? w.reduce((s, t) => s + t.pnl, 0) / w.length : 0,
      avgLoss: l.length > 0 ? l.reduce((s, t) => s + t.pnl, 0) / l.length : 0,
      winRate: trades.length > 0 ? (w.length / trades.length) * 100 : 0,
    };
  }, [state.orders]);

  // Equity curve data points
  const equityCurve = useMemo(() => {
    const points: { ts: number; value: number }[] = [{ ts: state.account.createdAt, value: STARTING_BALANCE }];
    let bal = STARTING_BALANCE;
    const posMap: Record<string, { qty: number; avgCost: number }> = {};
    for (const o of [...state.orders].reverse()) {
      if (o.side === "buy") {
        bal -= o.total + o.fees;
        if (!posMap[o.symbol]) posMap[o.symbol] = { qty: 0, avgCost: 0 };
        const prev = posMap[o.symbol];
        const newQty = prev.qty + o.qty;
        prev.avgCost = prev.qty > 0 ? ((prev.avgCost * prev.qty) + (o.price * o.qty)) / newQty : o.price;
        prev.qty = newQty;
      } else {
        bal += o.total - o.fees;
        if (posMap[o.symbol]) posMap[o.symbol].qty -= o.qty;
      }
      // Calculate portfolio value at this point
      let posVal = 0;
      for (const [sym, p] of Object.entries(posMap)) {
        if (p.qty > 0) posVal += (prices[sym]?.ltp ?? p.avgCost) * p.qty;
      }
      points.push({ ts: o.ts, value: bal + posVal });
    }
    return points;
  }, [state.orders, state.account.createdAt, prices]);

  // Signal outcome
  const signalOutcome = useMemo(() => {
    const signalTrades = state.orders.filter(o => o.signalSnapshot);
    const buySignals = signalTrades.filter(o => o.side === "buy" && o.signalSnapshot?.recommendation?.includes("Buy"));
    const sellSignals = signalTrades.filter(o => o.side === "sell" && o.signalSnapshot?.recommendation?.includes("Sell"));
    return { total: signalTrades.length, buySignals: buySignals.length, sellSignals: sellSignals.length };
  }, [state.orders]);

  const maxEquity = Math.max(...equityCurve.map(p => p.value), STARTING_BALANCE);
  const minEquity = Math.min(...equityCurve.map(p => p.value), STARTING_BALANCE);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Return" value={`${totalReturnPct >= 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%`} sub={totalReturnPct >= 0 ? "text-up" : "text-down"} />
        <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} sub={`${wins}W / ${losses}L`} />
        <StatCard label="Avg Win" value={`+Rs ${npr(avgWin)}`} sub="text-up" />
        <StatCard label="Avg Loss" value={`Rs ${npr(avgLoss)}`} sub="text-down" />
      </div>

      {/* Equity Curve */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="mb-3 text-base font-bold">📈 Equity Curve</h3>
        {equityCurve.length <= 1 ? (
          <div className="py-8 text-center text-muted">Place some trades to see the equity curve.</div>
        ) : (
          <div className="relative h-48">
            {/* Simple bar chart */}
            <div className="flex h-full items-end gap-0.5">
              {equityCurve.map((p, i) => {
                const range = maxEquity - minEquity || 1;
                const height = ((p.value - minEquity) / range) * 100;
                const color = p.value >= STARTING_BALANCE ? "bg-up" : "bg-down";
                return (
                  <div key={i} className={`flex-1 ${color} rounded-t opacity-80 transition-all`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`Rs ${npr(p.value)} — ${new Date(p.ts).toLocaleDateString()}`} />
                );
              })}
            </div>
            {/* Reference line at starting balance */}
            <div className="absolute left-0 right-0 border-t border-dashed border-muted"
              style={{ bottom: `${((STARTING_BALANCE - minEquity) / (maxEquity - minEquity || 1)) * 100}%` }} />
          </div>
        )}
        <div className="mt-2 flex justify-between text-xs text-muted">
          <span>Start: Rs {npr(STARTING_BALANCE)}</span>
          <span>Current: Rs {npr(totalPortfolioValue)}</span>
        </div>
      </div>

      {/* Signal Outcome */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="mb-3 text-base font-bold">🎯 Signal Outcome Report</h3>
        {signalOutcome.total === 0 ? (
          <div className="py-4 text-center text-muted">No signal-followed trades yet. Use the &quot;Demo Trade&quot; button from stock signal cards.</div>
        ) : (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xs text-muted">Signal Trades</div>
              <div className="text-lg font-bold">{signalOutcome.total}</div>
            </div>
            <div className="rounded-lg bg-up-bg/50 p-3">
              <div className="text-xs text-muted">Buy Signals Followed</div>
              <div className="text-lg font-bold text-up">{signalOutcome.buySignals}</div>
            </div>
            <div className="rounded-lg bg-down-bg/50 p-3">
              <div className="text-xs text-muted">Sell Signals Followed</div>
              <div className="text-lg font-bold text-down">{signalOutcome.sellSignals}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Order Ticket Modal ─── */
function OrderTicketModal({ state, prices, prevClose, symbol, initPrice, signalSnapshot, onClose, onPlace }: {
  state: DemoState; prices: PriceMap; prevClose: PrevCloseMap;
  symbol: string; initPrice: number;
  signalSnapshot?: DemoOrder["signalSnapshot"];
  onClose: () => void;
  onPlace: (symbol: string, side: "buy" | "sell", qty: number, signalSnapshot?: DemoOrder["signalSnapshot"]) => { success: boolean; error?: string; order?: DemoOrder };
}) {
  const [sym, setSym] = useState(symbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(10);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const price = prices[sym]?.ltp ?? initPrice;
  const prevC = prevClose[sym]?.prevClose ?? 0;
  const fees = price > 0 && qty > 0 ? calcFees(side, qty, price) : null;
  const totalCost = fees ? fees.tradeValue + fees.total : 0;
  const pos = state.positions.find(p => p.symbol === sym);
  const posQty = pos?.qty ?? 0;

  const handleSubmit = () => {
    if (!sym.trim()) { setError("Enter a symbol"); return; }
    if (price <= 0) { setError("No live price available for this symbol"); return; }

    const validation = validateOrder(side, qty, price, prevC, state.account.balance, posQty);
    if (!validation.valid) { setError(validation.error ?? "Invalid order"); return; }

    const result = onPlace(sym.toUpperCase(), side, qty, signalSnapshot ?? undefined);
    if (result.success) {
      setSuccess(true);
      setTimeout(onClose, 1500);
    } else {
      setError(result.error ?? "Order failed");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border-2 border-amber-500 bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold">🎯 Demo Trade</h2>
            <div className="text-xs text-amber-600 dark:text-amber-400 font-bold">DEMO — फेक पैसा, वास्तविक ट्रेड होइन</div>
          </div>
          <button onClick={onClose} className="text-2xl text-muted hover:text-foreground">&times;</button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-lg font-bold text-up">Order Executed!</div>
          </div>
        ) : (
          <>
            {/* Signal snapshot */}
            {signalSnapshot && (
              <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                <span className="font-bold text-primary">Signal: </span>
                <span className="font-semibold">{signalSnapshot.recommendation}</span>
                <span className="ml-2 text-muted">Confidence: {signalSnapshot.confidence}%</span>
                {signalSnapshot.trend && <span className="ml-2 text-muted">Trend: {signalSnapshot.trend}</span>}
              </div>
            )}

            {/* Symbol */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-bold text-muted">Symbol</label>
              <input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())}
                placeholder="e.g. NABIL"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold uppercase outline-none focus:border-amber-500" />
            </div>

            {/* Price */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-bold text-muted">Current Price (Live)</label>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold tabular-nums">
                {price > 0 ? `Rs ${npr(price)}` : <span className="text-muted">No price available</span>}
              </div>
            </div>

            {/* Side toggle */}
            <div className="mb-3 flex gap-2">
              <button onClick={() => setSide("buy")}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${side === "buy" ? "bg-up text-white" : "bg-surface-2 text-muted hover:bg-up-bg"}`}>
                BUY
              </button>
              <button onClick={() => setSide("sell")}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${side === "sell" ? "bg-down text-white" : "bg-surface-2 text-muted hover:bg-down-bg"}`}>
                SELL
              </button>
            </div>

            {/* Quantity */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-bold text-muted">Quantity (min 10)</label>
              <input type="number" min={10} value={qty}
                onChange={(e) => setQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold tabular-nums outline-none focus:border-amber-500" />
            </div>

            {/* Fee breakdown */}
            {fees && price > 0 && (
              <div className="mb-3 rounded-lg bg-surface-2 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted">Trade Value</span><span className="tabular-nums">Rs {npr(fees.tradeValue)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Broker Commission</span><span className="tabular-nums">Rs {npr(fees.brokerComm)}</span></div>
                <div className="flex justify-between"><span className="text-muted">SEBON Fee</span><span className="tabular-nums">Rs {npr(fees.sebonFee)}</span></div>
                <div className="flex justify-between"><span className="text-muted">DP Fee</span><span className="tabular-nums">Rs {npr(fees.dpFee)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total {side === "buy" ? "Cost" : "Proceeds"}</span><span className="tabular-nums">Rs {npr(totalCost)}</span></div>
              </div>
            )}

            {/* Validation info */}
            {side === "sell" && posQty > 0 && (
              <div className="mb-2 text-xs text-muted">Available to sell: <b>{posQty}</b> shares</div>
            )}
            <div className="mb-3 text-xs text-muted">Cash balance: <b>Rs {npr(state.account.balance)}</b></div>

            {/* Error */}
            {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-xs font-bold text-down">{error}</div>}

            {/* Submit */}
            <button onClick={handleSubmit}
              className={`w-full rounded-lg py-3 text-sm font-extrabold text-white transition active:scale-95 ${side === "buy" ? "bg-up hover:bg-up/90" : "bg-down hover:bg-down/90"}`}>
              Confirm {side === "buy" ? "BUY" : "SELL"} — {num(qty)} shares
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Search Params Handler (wrapped in Suspense) ─── */
function SearchParamsHandler({ onOpen }: { onOpen: (sym: string, price: number, signal: DemoOrder["signalSnapshot"]) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const sym = searchParams.get("symbol");
    const price = searchParams.get("price");
    const rec = searchParams.get("rec");
    const conf = searchParams.get("conf");
    const trend = searchParams.get("trend");
    if (sym) {
      const signal = rec ? { recommendation: rec, confidence: conf ? parseInt(conf) : 0, trend: trend || null } : null;
      onOpen(sym, price ? parseFloat(price) : 0, signal);
    }
  }, [searchParams, onOpen]);
  return null;
}

/* ─── Shared Components ─── */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${sub?.includes("up") ? "text-up" : sub?.includes("down") ? "text-down" : ""}`}>{value}</div>
    </div>
  );
}
