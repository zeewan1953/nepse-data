"use client";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { npr, num, pct } from "@/lib/format";
import { usePoll } from "@/lib/useLive";
import type { LiveMarketData } from "@/lib/types";
import {
  type DemoState, type DemoOrder, type DemoPosition, type DemoPendingOrder,
  loadState, saveState, initAccount, resetAccount, orderId, STARTING_BALANCE,
} from "@/lib/demo/store";
import { calcFees, validateOrder } from "@/lib/demo/fees";

type LiveResp = { data: LiveMarketData[]; count: number };

type PriceMap = Record<string, { ltp: number; updatedAt: number; totalQty: number }>;
type PrevCloseMap = Record<string, { prevClose: number; date: string }>;

type Tab = "trade" | "signals" | "health" | "logs" | "robot" | "verify";

type SignalRow = {
  symbol: string; name?: string; sector?: string;
  signal: "BUY" | "SELL" | "NEUTRAL" | null;
  confidence: number;
  reason: string;
  dataSource: string;
  tactical?: {
    momentumScore: number;
    rangePosition: number;
    volatility: number;
    volumeRatio: number;
    intradayStrength: number;
  } | null;
  newsSentiment?: number;
};

type SectorOverview = {
  sector: string; total: number; buys: number; sells: number; neutrals: number; nulls: number;
  topSignals?: SignalRow[];
};

type SignalsResp = {
  generatedAt: number; source: string; totalSignals: number;
  sectors: SectorOverview[]; signals: SignalRow[];
};

type HealthRun = { id: number; timestamp: string; payload: { anyFailures: boolean; summary: string; heal?: { summary: string; actions: Array<{ type: string; endpoint: string; detail: string; applied: boolean }> } | null; results: Array<{ endpoint: string; status: number; latencyMs: number; shapeValid: boolean; valueSanity: Array<{ rule: string; passed: boolean; detail: string }> }> } };

export default function DemoPage() {
  const [state, setState] = useState<DemoState | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [prevClose, setPrevClose] = useState<PrevCloseMap>({});
  const live = usePoll<LiveResp>("/api/live", 10_000);
  const liveMap = useMemo(() => {
    const m = new Map<string, { ltp: number; name: string; change: number }>();
    for (const s of live.data?.data ?? []) {
      if (s.lastTradedPrice > 0) m.set(s.symbol, { ltp: s.lastTradedPrice, name: s.securityName ?? s.symbol, change: s.percentageChange ?? 0 });
    }
    return m;
  }, [live.data]);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSymbol, setTicketSymbol] = useState("");
  const [ticketPrice, setTicketPrice] = useState(0);
  const [ticketSignal, setTicketSignal] = useState<DemoOrder["signalSnapshot"]>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [buySymbol, setBuySymbol] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buySearch, setBuySearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [buyMsg, setBuyMsg] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("trade");
  const userId = "guest";

  useEffect(() => {
    const s = loadState(userId);
    if (s) {
      if (!s.pendingOrders) s.pendingOrders = [];
      setState(s);
    } else { const f = initAccount(userId); saveState(userId, f); setState(f); }
  }, [userId]);

  const processPendingOrders = useCallback((currentState: DemoState, currentPrices: PriceMap): DemoState => {
    if (!currentState.pendingOrders?.length) return currentState;
    let newBalance = currentState.account.balance;
    const newPositions = [...currentState.positions];
    const newOrders = [...currentState.orders];
    const remainingPending: DemoPendingOrder[] = [];
    for (const pending of currentState.pendingOrders) {
      const priceData = currentPrices[pending.symbol];
      if (!priceData || priceData.totalQty <= 0) {
        remainingPending.push(pending); continue;
      }
      const remainingQty = pending.qty - pending.filled;
      const maxFill = Math.floor(priceData.totalQty * 0.3);
      const fillQty = Math.min(remainingQty, maxFill);
      if (fillQty <= 0) { remainingPending.push(pending); continue; }
      const price = priceData.ltp;
      const fees = calcFees(pending.side, fillQty, price);
      if (pending.side === "buy") {
        const totalCost = fees.tradeValue + fees.total;
        if (totalCost > newBalance) { remainingPending.push(pending); continue; }
        newBalance -= totalCost;
        const existing = newPositions.find(p => p.symbol === pending.symbol);
        if (existing) {
          const nq = existing.qty + fillQty;
          existing.avgCost = ((existing.avgCost * existing.qty) + (price * fillQty)) / nq;
          existing.qty = nq;
        } else {
          newPositions.push({ symbol: pending.symbol, qty: fillQty, avgCost: price, openedAt: Date.now() });
        }
      } else {
        newBalance += (fees.tradeValue - fees.total);
        const existing = newPositions.find(p => p.symbol === pending.symbol);
        if (existing) {
          existing.qty -= fillQty;
          if (existing.qty <= 0) newPositions.splice(newPositions.indexOf(existing), 1);
        }
      }
      const filledOrder: DemoOrder = {
        id: `${pending.id}_fill_${Date.now()}`,
        ts: Date.now(), symbol: pending.symbol, side: pending.side,
        qty: fillQty, price, fees: fees.total, total: fees.tradeValue,
        balanceAfter: newBalance, signalSnapshot: pending.signalSnapshot ?? null,
      };
      newOrders.unshift(filledOrder);
      const newFilled = pending.filled + fillQty;
      if (newFilled < pending.qty) remainingPending.push({ ...pending, filled: newFilled });
    }
    return {
      account: { ...currentState.account, balance: newBalance },
      positions: newPositions, orders: newOrders, pendingOrders: remainingPending,
    };
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/prices", { cache: "no-store" });
      const j = await r.json();
      const newPrices = j.prices ?? {};
      const newPrevClose = j.prevClose ?? {};
      setPrices(newPrices); setPrevClose(newPrevClose);
      setState(prev => {
        if (!prev || !prev.pendingOrders?.length) return prev;
        const processed = processPendingOrders(prev, newPrices);
        if (processed !== prev) saveState(userId, processed);
        return processed;
      });
    } catch {}
  }, [userId, processPendingOrders]);

  useEffect(() => { fetchPrices(); const t = setInterval(fetchPrices, 30_000); return () => clearInterval(t); }, [fetchPrices]);

  const getPositionValue = useCallback((pos: DemoPosition) => { const p = prices[pos.symbol]?.ltp ?? liveMap.get(pos.symbol)?.ltp ?? 0; return p > 0 ? p * pos.qty : pos.avgCost * pos.qty; }, [prices, liveMap]);
  const getPositionPnL = useCallback((pos: DemoPosition) => getPositionValue(pos) - pos.avgCost * pos.qty, [getPositionValue]);
  const getLTP = useCallback((symbol: string) => prices[symbol]?.ltp ?? liveMap.get(symbol)?.ltp ?? 0, [prices, liveMap]);

  const totalPositionValue = useMemo(() => state?.positions.reduce((s, p) => s + getPositionValue(p), 0) ?? 0, [state, getPositionValue]);
  const totalInvested = useMemo(() => state?.positions.reduce((s, p) => s + p.avgCost * p.qty, 0) ?? 0, [state]);
  const totalPortfolioValue = (state?.account.balance ?? 0) + totalPositionValue;
  const totalReturn = totalPortfolioValue - STARTING_BALANCE;
  const totalReturnPct = (totalReturn / STARTING_BALANCE) * 100;

  const placeOrder = useCallback((symbol: string, side: "buy" | "sell", qty: number, customPrice?: number, signalSnapshot?: DemoOrder["signalSnapshot"]) => {
    if (!state) return { success: false, error: "No account" };
    const ltp = prices[symbol]?.ltp ?? liveMap.get(symbol)?.ltp ?? 0;
    const price = customPrice && customPrice > 0 ? customPrice : ltp;
    const prevC = prevClose[symbol]?.prevClose ?? 0;
    const posQty = state.positions.find(p => p.symbol === symbol)?.qty ?? 0;
    if (ltp > 0 && customPrice) {
      const lower = ltp * 0.98; const upper = ltp * 1.02;
      if (customPrice < lower || customPrice > upper) {
        return { success: false, error: `Price must be within LTP ±2%: Rs ${npr(lower)} – Rs ${npr(upper)}` };
      }
    }
    if (side === "sell" && posQty <= 0) return { success: false, error: `You don't own ${symbol}.` };
    if (side === "sell" && qty > posQty) return { success: false, error: `Only ${posQty} shares of ${symbol} owned.` };
    const validation = validateOrder(side, qty, price, prevC, state.account.balance, posQty);
    if (!validation.valid) return { success: false, error: validation.error };
    const pending: DemoPendingOrder = {
      id: orderId(), ts: Date.now(), symbol, side, qty, filled: 0, price,
      signalSnapshot: signalSnapshot ?? null,
    };
    const newState: DemoState = { ...state, pendingOrders: [pending, ...(state.pendingOrders ?? [])] };
    saveState(userId, newState); setState(newState);
    return { success: true, pending };
  }, [state, prices, liveMap, prevClose, userId]);

  const handleReset = () => { setState(resetAccount(userId)); setResetConfirm(false); };
  const openTicket = (symbol?: string, price?: number) => { setTicketSymbol(symbol ?? ""); setTicketPrice(price ?? 0); setTicketSignal(null); setTicketOpen(true); };
  const openTicketFromParams = (sym: string, price: number, signal: DemoOrder["signalSnapshot"]) => { setTicketSymbol(sym); setTicketPrice(price); setTicketSignal(signal); setTicketOpen(true); };

  const handleQuickBuy = () => {
    const sym = buySymbol.toUpperCase().trim();
    if (!sym) { setBuyMsg("Enter a stock symbol!"); return; }
    const ltp = prices[sym]?.ltp ?? liveMap.get(sym)?.ltp ?? 0;
    if (ltp <= 0) { setBuyMsg(`No live price for ${sym}!`); return; }
    const qty = parseInt(buyQty);
    if (!qty || qty < 1) { setBuyMsg("Enter valid quantity!"); return; }
    const customPrice = buyPrice ? parseFloat(buyPrice) : 0;
    const orderPrice = customPrice > 0 ? customPrice : ltp;
    const fees = calcFees("buy", qty, orderPrice);
    const totalCost = fees.tradeValue + fees.total;
    if (totalCost > (state?.account.balance ?? 0)) {
      setBuyMsg(`Insufficient balance! Need Rs ${npr(totalCost)}, have Rs ${npr(state?.account.balance ?? 0)}`); return;
    }
    const result = placeOrder(sym, "buy", qty, customPrice > 0 ? customPrice : undefined);
    if (result.success) {
      setBuyMsg(`ORDER: ${sym} x ${qty} @ Rs ${npr(orderPrice)} (fills from floorsheet)`);
      setBuyQty(""); setBuyPrice(""); setBuySearch(""); setBuySymbol("");
    } else setBuyMsg(result.error ?? "Order failed");
    setTimeout(() => setBuyMsg(""), 5000);
  };

  const allLiveStocks = useMemo(() => {
    const list = live.data?.data ?? [];
    return list.filter(s => s.lastTradedPrice > 0).sort((a, b) => b.lastTradedPrice - a.lastTradedPrice);
  }, [live.data]);
  const stockSuggestions = useMemo(() => {
    if (!buySearch.trim()) return allLiveStocks.slice(0, 12);
    const q = buySearch.toUpperCase().trim();
    return allLiveStocks.filter(s => s.symbol.toUpperCase().includes(q) || (s.securityName ?? "").toUpperCase().includes(q)).slice(0, 12);
  }, [allLiveStocks, buySearch]);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "trade", label: "Trade", icon: "🛒" },
    { key: "signals", label: "Signals", icon: "📊" },
    { key: "robot", label: "Auto Robot", icon: "🤖" },
    { key: "verify", label: "Verify", icon: "🔎" },
    { key: "logs", label: "Logs", icon: "📋" },
    { key: "health", label: "Health", icon: "🔍" },
  ];

  return (
    <div className="space-y-4">
      <Suspense fallback={null}><SearchParamsHandler onOpen={openTicketFromParams} /></Suspense>
      <div className="rounded-xl border-2 border-amber-500 bg-amber-500/10 px-4 py-3 text-center">
        <div className="text-base font-extrabold text-amber-700 dark:text-amber-400">🏦 NEPSE Demo — Paper Trading + Signal Engine</div>
        <div className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Virtual NPR {num(STARTING_BALANCE)} · No real money · For learning only</div>
        <Link href="/" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">← Back to Dashboard</Link>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${activeTab === t.key ? "bg-amber-500 text-white shadow" : "text-muted hover:bg-surface-2"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {activeTab === "trade" && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            {/* BUY PANEL */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h3 className="mb-3 text-base font-bold">🛒 Buy Stock</h3>
              <div className="relative mb-2">
                <input value={buySearch} onChange={(e) => { setBuySearch(e.target.value.toUpperCase()); setBuySymbol(""); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Type stock symbol (e.g. NABIL, NTC...)"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold uppercase outline-none focus:border-amber-500" />
                {buySymbol && <div className="absolute right-3 top-2 text-xs font-bold text-up">✓ {buySymbol}</div>}
                {showSuggestions && stockSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-[260px] w-full overflow-y-auto rounded-lg border border-border bg-surface-2 shadow-lg">
                    {stockSuggestions.map((s) => {
                      const ltp = s.lastTradedPrice; const ch = s.percentageChange ?? 0;
                      return (
                        <button key={s.symbol} onClick={() => { setBuySymbol(s.symbol); setBuySearch(s.symbol); setShowSuggestions(false); }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-amber-500/10">
                          <span className="flex items-center gap-1.5">
                            <span className="font-bold text-primary">{s.symbol}</span>
                            <span className="text-[10px] text-muted hidden sm:inline">{s.securityName?.slice(0, 18)}</span>
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            <span className="text-xs font-semibold text-foreground">Rs {npr(ltp)}</span>
                            <span className={`text-[10px] font-bold w-12 text-right ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "+" : ""}{pct(ch)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <input value={buyQty} onChange={(e) => setBuyQty(e.target.value)} type="number" min={1} placeholder="Quantity (shares)" className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold outline-none focus:border-amber-500" />
              <div className="mb-2">
                <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} type="number" step="0.01" placeholder={`Price (LTP: ${npr(prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0)}) — optional`} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold outline-none focus:border-amber-500" />
                {buySymbol && (prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0) > 0 && (
                  <div className="mt-1 text-[10px] text-muted">Allowed range: <b className="text-foreground">Rs {npr((prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0) * 0.98)}</b> – <b className="text-foreground">Rs {npr((prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0) * 1.02)}</b> (LTP ±2%)</div>
                )}
              </div>
              <div className="mb-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
                {(() => {
                  const ltp = prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0;
                  const orderPrice = buyPrice ? parseFloat(buyPrice) : ltp;
                  const qty = buyQty ? parseInt(buyQty) || 0 : 0;
                  const amt = qty * orderPrice;
                  return (<><div>LTP: <span className="font-bold text-foreground">{buySymbol ? npr(ltp) : "—"}</span>{buyPrice && orderPrice > 0 && <span className="ml-2">Your Price: <span className="font-bold text-amber-500">Rs {npr(orderPrice)}</span></span>}</div>{buySymbol && qty > 0 && (<div className="mt-1"><span>Qty: <b className="text-foreground">{num(qty)}</b> shares</span><span className="mx-2">·</span><span>Amount: <b className="text-amber-500">Rs {npr(amt)}</b></span></div>)}<div className="mt-1">Cash: <b className="text-foreground">Rs {npr(state?.account.balance ?? 0)}</b></div></>);
                })()}
              </div>
              <button onClick={handleQuickBuy} className="w-full rounded-lg bg-up py-2.5 text-sm font-extrabold text-white transition hover:bg-up/90 active:scale-95">BUY</button>
              {buyMsg && <div className={`mt-2 rounded-lg px-3 py-1.5 text-xs font-bold ${buyMsg.includes("ORDER PLACED") ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>{buyMsg}</div>}
              <button onClick={() => openTicket()} className="mt-2 w-full rounded-lg border border-border bg-surface-2 py-2 text-xs font-bold text-muted transition hover:bg-surface hover:text-foreground">🎯 Advanced Trade (Buy/Sell)</button>
            </div>

            {/* LIVE MARKET */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h3 className="mb-3 text-base font-bold">📡 Live Market (LTP + Volume)</h3>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted"><th className="py-1.5 text-left">Stock</th><th className="py-1.5 text-right">LTP</th><th className="py-1.5 text-right">Chg</th><th className="py-1.5 text-right">Vol</th></tr></thead>
                  <tbody>
                    {allLiveStocks.slice(0, 15).map((s) => {
                      const chg = s.percentageChange ?? 0;
                      return (<tr key={s.symbol} className="border-b border-border/30 hover:bg-surface-2/50"><td className="py-1.5 font-bold text-primary">{s.symbol}</td><td className="py-1.5 text-right font-bold tabular-nums text-cyan-400">{npr(s.lastTradedPrice)}</td><td className={`py-1.5 text-right text-xs font-bold tabular-nums ${chg >= 0 ? "text-up" : "text-down"}`}>{chg >= 0 ? "+" : ""}{pct(chg)}</td><td className="py-1.5 text-right text-xs tabular-nums text-muted">{(s.totalTradeQuantity ?? 0) > 0 ? num(s.totalTradeQuantity) : "—"}</td></tr>);
                    })}
                    {allLiveStocks.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">Loading live data...</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PORTFOLIO */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h3 className="mb-3 text-base font-bold">💼 Portfolio</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-xs text-muted"><th className="py-1.5 text-left">Stock</th><th className="py-1.5 text-right">Qty</th><th className="py-1.5 text-right">Avg</th><th className="py-1.5 text-right">P/L</th></tr></thead>
                <tbody>
                  {state?.positions.map((pos) => { const ltp = getLTP(pos.symbol); const pl = (ltp - pos.avgCost) * pos.qty; return (<tr key={pos.symbol} className="border-b border-border/30 hover:bg-surface-2/50"><td className="py-1.5 font-bold text-primary">{pos.symbol}</td><td className="py-1.5 text-right tabular-nums">{num(pos.qty)}</td><td className="py-1.5 text-right tabular-nums">{npr(pos.avgCost)}</td><td className={`py-1.5 text-right font-bold tabular-nums ${pl >= 0 ? "text-up" : "text-down"}`}>{pl >= 0 ? "+" : ""}{npr(pl)}</td></tr>); })}
                  {(!state || state.positions.length === 0) && <tr><td colSpan={4} className="py-6 text-center text-muted">No positions yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {state && (state.pendingOrders?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
              <h3 className="mb-3 text-base font-bold text-amber-600 dark:text-amber-400">⏳ Pending Orders (Waiting for Floorsheet Volume)</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-xs text-muted"><th className="py-1.5 text-left">Symbol</th><th className="py-1.5 text-left">Side</th><th className="py-1.5 text-right">Ordered</th><th className="py-1.5 text-right">Filled</th><th className="py-1.5 text-right">Remaining</th><th className="py-1.5 text-right">Price</th><th className="py-1.5 text-right">Progress</th></tr></thead>
                <tbody>
                  {(state.pendingOrders ?? []).map((po) => {
                    const remaining = po.qty - po.filled;
                    const pct = po.qty > 0 ? (po.filled / po.qty) * 100 : 0;
                    const available = prices[po.symbol]?.totalQty ?? 0;
                    return (<tr key={po.id} className="border-b border-border/30"><td className="py-2 font-bold text-primary">{po.symbol}</td><td className={`py-2 font-bold uppercase ${po.side === "buy" ? "text-up" : "text-down"}`}>{po.side}</td><td className="py-2 text-right tabular-nums">{num(po.qty)}</td><td className="py-2 text-right tabular-nums text-up">{num(po.filled)}</td><td className="py-2 text-right tabular-nums text-amber-500">{num(remaining)}</td><td className="py-2 text-right tabular-nums">{npr(po.price)}</td><td className="py-2 text-right"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} /></div><span className="text-xs tabular-nums">{pct.toFixed(0)}%</span></div>{available > 0 && <div className="text-[10px] text-muted">Market: {num(available)} shares</div>}</td></tr>);
                  })}
                </tbody>
              </table>
              <div className="mt-2 text-[10px] text-muted">Orders fill gradually as market volume increases (up to 30% of floorsheet volume per check)</div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SCard label="Initial Capital" value={`Rs ${num(STARTING_BALANCE)}`} />
            <SCard label="Cash Remaining" value={`Rs ${npr(state?.account.balance ?? STARTING_BALANCE)}`} highlight />
            <SCard label="Total Invested" value={`Rs ${npr(totalInvested)}`} />
            <SCard label="Total Equity" value={`Rs ${npr(totalPortfolioValue)}`} highlight />
            <SCard label="Net Profit/Loss" value={`${totalReturn >= 0 ? "+" : ""}Rs ${npr(totalReturn)}`} valueClass={totalReturn >= 0 ? "text-up" : "text-down"} highlight />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-muted">Total Return</span>
              <span className={`text-lg font-extrabold tabular-nums ${totalReturnPct >= 0 ? "text-up" : "text-down"}`}>{totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(2)}%</span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full transition-all ${totalReturnPct >= 0 ? "bg-up" : "bg-down"}`} style={{ width: `${Math.min(Math.max((totalReturnPct + 10) / 20 * 100, 0), 100)}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold">⚙️ Account Management</h3>
            {!resetConfirm ? (
              <button onClick={() => setResetConfirm(true)} className="rounded-lg border border-down/30 bg-down-bg px-4 py-2 text-xs font-bold text-down hover:bg-down-bg/80">Reset Demo Account</button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-down">Are you sure?</span>
                <button onClick={handleReset} className="rounded-lg bg-down px-4 py-2 text-xs font-bold text-white">Yes, Reset</button>
                <button onClick={() => setResetConfirm(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted hover:bg-surface-2">Cancel</button>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "signals" && <SignalDashboard />}
      {activeTab === "health" && <HealthDashboard />}
      {activeTab === "robot" && <AutoRobotDashboard />}
      {activeTab === "verify" && <VerifyDashboard />}
      {activeTab === "logs" && <LogDashboard />}

      {ticketOpen && state && <OrderTicketModal state={state} prices={prices} prevClose={prevClose} symbol={ticketSymbol} initPrice={ticketPrice} signalSnapshot={ticketSignal} onClose={() => setTicketOpen(false)} onPlace={placeOrder} />}
    </div>
  );
}

function SCard({ label, value, valueClass, highlight }: { label: string; value: string; valueClass?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${highlight ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-surface"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

function SignalDashboard() {
  const sig = usePoll<SignalsResp>("/api/signals", 15_000);
  const [sectorFilter, setSectorFilter] = useState("");
  const [sortBy, setSortBy] = useState<"confidence" | "buy" | "sell">("confidence");

  const sectors = sig.data?.sectors ?? [];
  const allSignals = sig.data?.signals ?? [];
  const filtered = useMemo(() => {
    if (!sectorFilter) return allSignals;
    return allSignals.filter((s) => (s.sector ?? "").toUpperCase() === sectorFilter.toUpperCase());
  }, [allSignals, sectorFilter]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">
            📊 Signal Engine Dashboard
            {sig.data && <span className="ml-2 text-xs text-muted font-normal">({sig.data.totalSignals} stocks · source: {sig.data.source})</span>}
          </h3>
          {sig.loading && <span className="text-xs text-muted"><i className="fas fa-spinner fa-spin" /> updating...</span>}
        </div>

        {/* Sector Overview */}
        {sectors.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-4">
            {sectors.filter((s) => s.total > 0).map((sec) => (
              <button key={sec.sector} onClick={() => setSectorFilter(sectorFilter === sec.sector ? "" : sec.sector)}
                className={`rounded-lg border p-3 text-left transition ${sectorFilter === sec.sector ? "border-amber-500 bg-amber-500/10" : "border-border bg-surface-2 hover:border-amber-500/50"}`}>
                <div className="text-xs font-bold text-muted uppercase">{sec.sector}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{sec.total} stocks</div>
                <div className="mt-1 flex gap-2 text-[10px]">
                  <span className="text-up font-bold">▲ {sec.buys}</span>
                  <span className="text-down font-bold">▼ {sec.sells}</span>
                  <span className="text-muted">− {sec.neutrals}</span>
                  <span className="text-muted">— {sec.nulls} null</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-muted">
            {sig.loading ? "Loading signals..." : "No signal data available yet. Market may be closed."}
          </div>
        )}

        {/* Signal Table */}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-xs text-muted">
                <th className="py-2 text-left">Symbol</th>
                <th className="py-2 text-left">Sector</th>
                <th className="py-2 text-center">Signal</th>
                <th className="py-2 text-right">Conf</th>
                <th className="py-2 text-right">Mom</th>
                <th className="py-2 text-right">Range</th>
                <th className="py-2 text-right">Vol</th>
                <th className="py-2 text-right">Str</th>
                <th className="py-2 text-left">Reason</th>
              </tr></thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.symbol} className="border-b border-border/30 hover:bg-surface-2/50">
                    <td className="py-2 font-bold text-primary">{s.symbol}</td>
                    <td className="py-2 text-xs text-muted">{s.sector ?? "—"}</td>
                    <td className="py-2 text-center">
                      {s.signal === "BUY" ? <span className="rounded bg-up-bg px-2 py-0.5 text-xs font-bold text-up">BUY</span>
                      : s.signal === "SELL" ? <span className="rounded bg-down-bg px-2 py-0.5 text-xs font-bold text-down">SELL</span>
                      : s.signal === "NEUTRAL" ? <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">NEUTRAL</span>
                      : <span className="text-xs text-muted">—</span>}
                    </td>
                    <td className={`py-2 text-right font-bold tabular-nums ${s.confidence >= 60 ? "text-up" : s.confidence >= 30 ? "text-amber-500" : "text-muted"}`}>
                      {s.confidence > 0 ? `${s.confidence}%` : "—"}
                    </td>
                    <td className={`py-2 text-right tabular-nums text-xs ${(s.tactical?.momentumScore ?? 0) > 2 ? "text-up" : (s.tactical?.momentumScore ?? 0) < -2 ? "text-down" : "text-muted"}`}>
                      {s.tactical ? `${s.tactical.momentumScore > 0 ? "+" : ""}${s.tactical.momentumScore}%` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs text-muted">
                      {s.tactical ? `${Math.round((s.tactical.rangePosition ?? 0) * 100)}%` : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-xs text-muted">
                      {s.tactical ? `${(s.tactical.volumeRatio ?? 0).toFixed(1)}x` : "—"}
                    </td>
                    <td className={`py-2 text-right tabular-nums text-xs ${(s.tactical?.intradayStrength ?? 0) > 15 ? "text-up" : (s.tactical?.intradayStrength ?? 0) < -15 ? "text-down" : "text-muted"}`}>
                      {s.tactical ? `${s.tactical.intradayStrength > 0 ? "+" : ""}${s.tactical.intradayStrength}` : "—"}
                    </td>
                    <td className="py-2 text-xs text-muted max-w-[200px] truncate" title={s.reason}>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sectorFilter && (
          <button onClick={() => setSectorFilter("")} className="mt-3 text-xs text-amber-500 hover:underline">Clear sector filter</button>
        )}
      </div>
    </div>
  );
}

function HealthDashboard() {
  const [runs, setRuns] = useState<HealthRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);

  useEffect(() => {
    fetch("/api/health-check").then(r => r.json()).then(d => { setRuns(d.runs ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const triggerCheck = async () => {
    setRunning(true);
    try {
      const r = await fetch("/api/cron/health-check");
      const d = await r.json();
      setRunResult(d);
      const refreshed = await fetch("/api/health-check");
      const rd = await refreshed.json();
      setRuns(rd.runs ?? []);
    } catch {}
    setRunning(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold">🔍 Health Check & Self-Healing</h3>
          <button onClick={triggerCheck} disabled={running}
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50">
            {running ? <><i className="fas fa-spinner fa-spin" /> Running...</> : "Run Health Check"}
          </button>
        </div>

        {runResult && (
          <>
            <div className={`mb-2 rounded-lg p-3 text-sm font-bold ${runResult.anyFailures ? "bg-down-bg text-down" : "bg-up-bg text-up"}`}>
              {runResult.anyFailures ? "⚠ FAILED" : "✅ PASSED"} — {runResult.summary}
            </div>
            {runResult.heal && (
              <div className="mb-4 space-y-1">
                <div className="text-sm font-bold text-amber-500">🛠 Self-Healing Actions</div>
                {runResult.heal.summary && <div className="text-xs text-muted mb-2">{runResult.heal.summary}</div>}
                {runResult.heal.actions?.filter((a: any) => a.applied).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-up-bg/10 px-3 py-2">
                    <span className="text-up">✓</span>
                    <span className="text-xs"><b className="text-foreground">{a.endpoint}</b>: {a.detail}</span>
                  </div>
                ))}
                {runResult.heal.actions?.filter((a: any) => !a.applied).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
                    <span className="text-muted">○</span>
                    <span className="text-xs"><b className="text-foreground">{a.endpoint}</b>: {a.detail} <span className="text-muted">(no auto-fix available)</span></span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {loading ? (
          <div className="py-8 text-center text-muted">Loading health check history...</div>
        ) : runs.length === 0 ? (
          <div className="py-8 text-center text-muted">No health checks run yet. Click "Run Health Check" to start.</div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {runs.map((run) => {
              const p = run.payload;
              const failed = p.results.filter((r: any) => r.status !== 200 || !r.shapeValid || r.valueSanity.some((s: any) => !s.passed));
              return (
                <details key={run.id} className="rounded-lg border border-border bg-surface-2">
                  <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-bold">
                    <span>{p.anyFailures ? "⚠" : "✅"} {new Date(run.timestamp).toLocaleString()}</span>
                    <span className={`text-xs ${p.anyFailures ? "text-down" : "text-up"}`}>
                      {failed.length}/{p.results.length} endpoints failed
                    </span>
                  </summary>
                  <div className="px-4 pb-4 space-y-2">
                    {((p as any).heal?.actions as any[])?.filter((a: any) => a.applied).length > 0 && (
                      <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                        <div className="text-xs font-bold text-amber-500 mb-1">🛠 Auto-fixed</div>
                        {((p as any).heal?.actions as any[])?.filter((a: any) => a.applied).map((a: any, i: number) => (
                          <div key={i} className="text-xs text-muted">✓ {a.endpoint}: {a.detail}</div>
                        ))}
                      </div>
                    )}
                    {p.results.map((ep: any) => {
                      const epFailed = ep.status !== 200 || !ep.shapeValid || ep.valueSanity.some((s: any) => !s.passed);
                      return (
                        <div key={ep.endpoint} className={`rounded-lg border p-3 ${epFailed ? "border-down/30 bg-down-bg/5" : "border-border"}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">{ep.endpoint}</span>
                            <span className={`text-xs font-bold ${ep.status === 200 ? "text-up" : "text-down"}`}>
                              HTTP {ep.status} · {ep.latencyMs}ms
                            </span>
                          </div>
                          <div className="mt-1 space-y-1">
                            {ep.valueSanity.filter((s: any) => !s.passed).map((s: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-down"><span>✗</span><span>{s.rule}: {s.detail}</span></div>
                            ))}
                            {epFailed && ep.valueSanity.filter((s: any) => s.passed).length > 0 && (
                              <details className="text-xs text-muted"><summary className="cursor-pointer hover:text-foreground">✓ {ep.valueSanity.filter((s: any) => s.passed).length} passing rules</summary>
                                {ep.valueSanity.filter((s: any) => s.passed).map((s: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 text-xs text-up mt-1"><span>✓</span><span>{s.rule}</span></div>
                                ))}
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type AutoTraderState = {
  balance: number;
  positions: Array<{ symbol: string; qty: number; avgCost: number }>;
  trades: Array<{
    timestamp: string; type: string; symbol?: string | null;
    qty?: number | null; price?: number | null; confidence?: number | null;
    reason: string; balanceAfter?: number | null; exitType?: string | null;
  }>;
  totalInvested: number;
  totalReturn: number;
  monthlyPnL: Array<{
    month: string; trades: number; buys: number; sells: number;
    realizedPnL: number; balanceStart: number; balanceEnd: number;
  }>;
};

function AutoRobotDashboard() {
  const [state, setState] = useState<AutoTraderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { const r = await fetch("/api/auto-trader"); const d = await r.json(); if (!d.error) setState(d); } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const triggerRun = async () => {
    setRunning(true); setRunResult(null);
    try { const r = await fetch("/api/cron/auto-trader"); const d = await r.json(); setRunResult(d.summary ?? JSON.stringify(d)); await refresh(); } catch (e) { setRunResult("Error: " + ((e as Error)?.message ?? "unknown")); }
    setRunning(false);
  };

  const cycleCount = state?.trades?.filter(t => t.timestamp && new Date(t.timestamp) > new Date(Date.now() - 3600000)).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold">🤖 Auto Robot Trader</h3>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">PAPER TRADING ONLY — No real money</div>
          </div>
          <div className="flex gap-2">
            {cycleCount > 0 && <span className="text-xs text-muted self-center">{cycleCount} trades last hr</span>}
            <button onClick={triggerRun} disabled={running}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600 disabled:opacity-50">
              {running ? "Running..." : "Run Cycle Now"}
            </button>
          </div>
        </div>

        {runResult && (
          <div className="mb-3 rounded-lg bg-up-bg/10 px-3 py-2 text-xs font-bold text-up">{runResult}</div>
        )}

        {loading ? (
          <div className="py-8 text-center text-muted">Loading robot state...</div>
        ) : !state ? (
          <div className="py-8 text-center text-muted">No robot state found. Click "Run Cycle Now" during market hours (Sun-Thu 11:00-15:00 NPT) to start.</div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Balance</div>
                <div className="text-lg font-bold tabular-nums text-primary">Rs {npr(state.balance)}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Invested</div>
                <div className="text-lg font-bold tabular-nums text-primary">Rs {npr(state.totalInvested)}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Return</div>
                <div className={`text-lg font-bold tabular-nums ${state.totalReturn >= 0 ? "text-up" : "text-down"}`}>
                  {state.totalReturn >= 0 ? "+" : ""}Rs {npr(state.totalReturn)}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="text-[10px] font-semibold uppercase text-muted">Positions</div>
                <div className="text-lg font-bold tabular-nums text-primary">{state.positions.length}</div>
              </div>
            </div>

            {/* Positions */}
            {state.positions.length > 0 ? (
              <div className="mb-4">
                <div className="text-xs font-bold text-muted mb-2">Current Positions</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted">
                      <th className="py-2 text-left">Symbol</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">Avg Cost</th>
                      <th className="py-2 text-right">Invested</th>
                    </tr></thead>
                    <tbody>
                      {state.positions.map((p) => (
                        <tr key={p.symbol} className="border-b border-border/30">
                          <td className="py-2 font-bold text-primary">{p.symbol}</td>
                          <td className="py-2 text-right tabular-nums">{p.qty}</td>
                          <td className="py-2 text-right tabular-nums">Rs {npr(p.avgCost)}</td>
                          <td className="py-2 text-right tabular-nums">Rs {npr(p.avgCost * p.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mb-4 py-4 text-center text-xs text-muted border border-dashed border-border rounded-lg">No active positions. Robot will buy when signal confidence is high.</div>
            )}

            {/* Monthly P&L */}
            {state.monthlyPnL.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold text-muted mb-2">📅 Monthly P&L</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted">
                      <th className="py-2 text-left">Month</th>
                      <th className="py-2 text-right">Trades</th>
                      <th className="py-2 text-right">Buys</th>
                      <th className="py-2 text-right">Sells</th>
                      <th className="py-2 text-right">Realized P&L</th>
                      <th className="py-2 text-right">Start</th>
                      <th className="py-2 text-right">End</th>
                      <th className="py-2 text-right">Return %</th>
                    </tr></thead>
                    <tbody>
                      {state.monthlyPnL.map((m) => {
                        const retPct = m.balanceStart > 0 ? ((m.balanceEnd - m.balanceStart) / m.balanceStart * 100) : 0;
                        return (
                          <tr key={m.month} className="border-b border-border/30 hover:bg-surface-2/30">
                            <td className="py-2 font-bold">{m.month}</td>
                            <td className="py-2 text-right tabular-nums">{m.trades}</td>
                            <td className="py-2 text-right tabular-nums text-up">{m.buys}</td>
                            <td className="py-2 text-right tabular-nums text-down">{m.sells}</td>
                            <td className={`py-2 text-right font-bold tabular-nums ${m.realizedPnL >= 0 ? "text-up" : "text-down"}`}>
                              {m.realizedPnL >= 0 ? "+" : ""}Rs {npr(Math.abs(m.realizedPnL))}
                            </td>
                            <td className="py-2 text-right tabular-nums text-muted">Rs {npr(m.balanceStart)}</td>
                            <td className="py-2 text-right tabular-nums">Rs {npr(m.balanceEnd)}</td>
                            <td className={`py-2 text-right font-bold tabular-nums ${retPct >= 0 ? "text-up" : "text-down"}`}>
                              {retPct >= 0 ? "+" : ""}{retPct.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Trades */}
            {state.trades.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted mb-2">Recent Trades (last 50)</div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted sticky top-0 bg-surface">
                      <th className="py-2 text-left">Time</th>
                      <th className="py-2 text-left">Type</th>
                      <th className="py-2 text-left">Symbol</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">Price</th>
                      <th className="py-2 text-right">Conf</th>
                      <th className="py-2 text-right">Exit</th>
                      <th className="py-2 text-left">Reason</th>
                      <th className="py-2 text-right">Balance</th>
                    </tr></thead>
                    <tbody>
                      {state.trades.map((t, i) => (
                        <tr key={i} className="border-b border-border/30">
                          <td className="py-2 text-xs text-muted tabular-nums">{new Date(t.timestamp).toLocaleTimeString()}</td>
                          <td className="py-2">
                            {t.type === "BUY" ? <span className="rounded bg-up-bg px-2 py-0.5 text-xs font-bold text-up">BUY</span>
                            : t.type === "SELL" ? <span className="rounded bg-down-bg px-2 py-0.5 text-xs font-bold text-down">SELL</span>
                            : t.type === "SL_HIT" ? <span className="rounded bg-down-bg px-2 py-0.5 text-xs font-bold text-down">SL</span>
                            : t.type === "TP_HIT" ? <span className="rounded bg-up-bg px-2 py-0.5 text-xs font-bold text-up">TP</span>
                            : <span className="text-xs text-muted">{t.type}</span>}
                          </td>
                          <td className="py-2 font-bold text-primary">{t.symbol ?? "—"}</td>
                          <td className="py-2 text-right tabular-nums">{t.qty ?? "—"}</td>
                          <td className="py-2 text-right tabular-nums">{t.price ? `Rs ${npr(t.price)}` : "—"}</td>
                          <td className="py-2 text-right tabular-nums">{t.confidence != null ? `${t.confidence}%` : "—"}</td>
                          <td className="py-2 text-right tabular-nums text-xs">
                            {t.exitType === "SL_HIT" ? <span className="text-down font-bold">SL</span>
                            : t.exitType === "TP_HIT" ? <span className="text-up font-bold">TP</span>
                            : t.exitType === "SIGNAL_SELL" ? <span className="text-muted">Sig</span>
                            : t.exitType === "SIGNAL_WEAK" ? <span className="text-muted">Weak</span>
                            : t.type === "BUY" ? <span className="text-muted">—</span>
                            : <span className="text-muted">{t.exitType ?? "—"}</span>}
                          </td>
                          <td className="py-2 text-xs text-muted max-w-[250px] truncate" title={t.reason}>{t.reason}</td>
                          <td className="py-2 text-right tabular-nums text-xs">{t.balanceAfter != null ? `Rs ${npr(t.balanceAfter)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VerifyDashboard() {
  const [symbol, setSymbol] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runVerify = async () => {
    setLoading(true); setError(""); setVerifyResult(null);
    try {
      const params = new URLSearchParams();
      if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase());
      params.set("limit", "10");
      const r = await fetch(`/api/verify-data?${params}`);
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setVerifyResult(d);
    } catch (e) {
      setError((e as Error)?.message || "Verify failed");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="mb-4 text-base font-bold">🔎 Data Verification</h3>
        <div className="text-xs text-muted mb-4 leading-relaxed">
          Cross-references app data with live sources. Run the local data proxy on your machine to fetch from nepalstock/nepsealpha.
          <pre className="mt-1 rounded bg-surface-2 p-2 text-[10px]">node scripts/data-proxy.mjs --stock NABIL</pre>
        </div>

        <div className="flex gap-2 mb-4">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (leave blank for all)" maxLength={20}
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold uppercase outline-none focus:border-amber-500"
          />
          <button onClick={runVerify} disabled={loading}
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
            {loading ? "Verifying..." : "Verify"}
          </button>
        </div>

        {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-xs font-bold text-down">{error}</div>}

        {verifyResult && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="rounded-lg border border-border bg-surface-2 p-2">
                <div className="text-[10px] font-semibold text-muted">OHLCV Rows</div>
                <div className="text-base font-bold tabular-nums">{verifyResult.ohlcvRows}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-2">
                <div className="text-[10px] font-semibold text-muted">Live (MeroLagani)</div>
                <div className="text-base font-bold tabular-nums">{verifyResult.liveStocks}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface-2 p-2">
                <div className="text-[10px] font-semibold text-muted">Collected Sources</div>
                <div className="text-base font-bold tabular-nums">{verifyResult.collectedSources}</div>
              </div>
              <div className={`rounded-lg border p-2 ${verifyResult.mismatches?.length > 0 ? "border-down/30 bg-down-bg/5" : "border-up/30 bg-up-bg/5"}`}>
                <div className="text-[10px] font-semibold text-muted">Mismatches</div>
                <div className={`text-base font-bold tabular-nums ${verifyResult.mismatches?.length > 0 ? "text-down" : "text-up"}`}>
                  {verifyResult.mismatches?.length ?? 0}
                </div>
              </div>
            </div>

            {/* Mismatches */}
            {verifyResult.mismatches?.length > 0 && (
              <div className="rounded-lg border border-down/30 bg-down-bg/5 p-3">
                <div className="text-xs font-bold text-down mb-2">Data Mismatches Detected</div>
                {verifyResult.mismatches.map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-4 text-xs py-1 border-b border-border/30 last:border-0">
                    <span className="font-bold text-primary">{m.symbol}</span>
                    <span className="text-muted">{m.field}:</span>
                    <span className="text-down line-through">Rs {m.dbValue}</span>
                    <span className="text-up">→ Rs {m.liveValue}</span>
                    <span className="text-down">({m.diffPct})</span>
                  </div>
                ))}
              </div>
            )}

            {/* OHLCV Data */}
            {verifyResult.ohlcv?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted mb-2">OHLCV (App DB)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted">
                      <th className="py-1 text-left">Symbol</th>
                      <th className="py-1 text-left">Date</th>
                      <th className="py-1 text-right">Open</th>
                      <th className="py-1 text-right">High</th>
                      <th className="py-1 text-right">Low</th>
                      <th className="py-1 text-right">Close</th>
                      <th className="py-1 text-right">Volume</th>
                    </tr></thead>
                    <tbody>
                      {verifyResult.ohlcv.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-border/30 text-xs">
                          <td className="py-1 font-bold text-primary">{r.symbol}</td>
                          <td className="py-1 text-muted">{r.date}</td>
                          <td className="py-1 text-right tabular-nums">{r.open}</td>
                          <td className="py-1 text-right tabular-nums">{r.high}</td>
                          <td className="py-1 text-right tabular-nums">{r.low}</td>
                          <td className="py-1 text-right font-bold tabular-nums">{r.close}</td>
                          <td className="py-1 text-right tabular-nums">{r.volume}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Live Data */}
            {verifyResult.live?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted mb-2">Live (MeroLagani)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted">
                      <th className="py-1 text-left">Symbol</th>
                      <th className="py-1 text-right">LTP</th>
                      <th className="py-1 text-right">Change</th>
                      <th className="py-1 text-right">Volume</th>
                    </tr></thead>
                    <tbody>
                      {verifyResult.live.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-border/30 text-xs">
                          <td className="py-1 font-bold text-primary">{r.symbol}</td>
                          <td className="py-1 text-right tabular-nums font-bold">Rs {r.ltp}</td>
                          <td className={`py-1 text-right tabular-nums ${(r.change ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                            {(r.change ?? 0) >= 0 ? "+" : ""}{r.change}%
                          </td>
                          <td className="py-1 text-right tabular-nums">{r.volume?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Collected Sources */}
            {verifyResult.collected?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-muted mb-2">Collected Data (via local proxy)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-xs text-muted">
                      <th className="py-1 text-left">Time</th>
                      <th className="py-1 text-left">Source</th>
                      <th className="py-1 text-left">Type</th>
                      <th className="py-1 text-left">Payload</th>
                    </tr></thead>
                    <tbody>
                      {verifyResult.collected.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-border/30 text-xs">
                          <td className="py-1 text-muted tabular-nums">{r.time}</td>
                          <td className="py-1">{r.source}</td>
                          <td className="py-1">{r.type}</td>
                          <td className="py-1 text-muted truncate max-w-[200px]" title={r.payload}>{r.payload}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!verifyResult && !loading && !error && (
          <div className="py-8 text-center text-muted text-xs">
            Enter a symbol and click Verify to cross-reference app data with live sources.
          </div>
        )}
      </div>
    </div>
  );
}

function LogDashboard() {
  const [logs, setLogs] = useState<Array<{ id: number; timestamp: string; stockSymbol: string; signal: string; confidence: number; dataSource: string; cmf?: number | null; mfi?: number | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trade-log").then(r => r.json()).then(d => { setLogs(d.logs ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="mb-4 text-base font-bold">📋 Trade Decision Log</h3>
      {loading ? (
        <div className="py-8 text-center text-muted">Loading trade decision log...</div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center text-muted">
          <div className="text-lg mb-2">No trade decisions logged yet.</div>
          <div className="text-xs">Trade decisions are logged when the signal engine produces a BUY/SELL signal with sufficient confidence.</div>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-xs text-muted sticky top-0 bg-surface">
              <th className="py-2 text-left">Time</th>
              <th className="py-2 text-left">Symbol</th>
              <th className="py-2 text-center">Signal</th>
              <th className="py-2 text-right">Confidence</th>
              <th className="py-2 text-right">CMF</th>
              <th className="py-2 text-right">MFI</th>
            </tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/30 hover:bg-surface-2/50">
                  <td className="py-2 text-xs text-muted tabular-nums">{new Date(l.timestamp).toLocaleTimeString()}</td>
                  <td className="py-2 font-bold text-primary">{l.stockSymbol}</td>
                  <td className="py-2 text-center">
                    {l.signal === "BUY" ? <span className="rounded bg-up-bg px-2 py-0.5 text-xs font-bold text-up">BUY</span>
                    : l.signal === "SELL" ? <span className="rounded bg-down-bg px-2 py-0.5 text-xs font-bold text-down">SELL</span>
                    : <span className="text-xs text-muted">{l.signal}</span>}
                  </td>
                  <td className="py-2 text-right font-bold tabular-nums">{l.confidence}%</td>
                  <td className="py-2 text-right tabular-nums text-xs">{l.cmf != null ? l.cmf.toFixed(3) : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-xs">{l.mfi != null ? l.mfi.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderTicketModal({ state, prices, prevClose, symbol, initPrice, signalSnapshot, onClose, onPlace }: {
  state: DemoState; prices: PriceMap; prevClose: PrevCloseMap; symbol: string; initPrice: number;
  signalSnapshot?: DemoOrder["signalSnapshot"]; onClose: () => void;
  onPlace: (symbol: string, side: "buy" | "sell", qty: number, customPrice?: number, signalSnapshot?: DemoOrder["signalSnapshot"]) => { success: boolean; error?: string; pending?: DemoPendingOrder };
}) {
  const [sym, setSym] = useState(symbol);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState(10);
  const [manualPrice, setManualPrice] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const ltp = prices[sym]?.ltp ?? initPrice;
  const orderPrice = manualPrice ? parseFloat(manualPrice) : ltp;
  const prevC = prevClose[sym]?.prevClose ?? 0;
  const fees = orderPrice > 0 && qty > 0 ? calcFees(side, qty, orderPrice) : null;
  const totalCost = fees ? fees.tradeValue + fees.total : 0;
  const posQty = state.positions.find(p => p.symbol === sym)?.qty ?? 0;

  const handleSubmit = () => {
    if (!sym.trim()) { setError("Enter a symbol"); return; }
    if (orderPrice <= 0) { setError("No price available"); return; }
    if (side === "sell" && posQty <= 0) { setError(`You don't own ${sym}.`); return; }
    if (side === "sell" && qty > posQty) { setError(`Only ${posQty} shares owned.`); return; }
    if (side === "buy" && fees && (fees.tradeValue + fees.total) > state.account.balance) {
      setError(`Insufficient balance! Need Rs ${npr(fees.tradeValue + fees.total)}`); return;
    }
    const customPrice = manualPrice ? parseFloat(manualPrice) : undefined;
    const result = onPlace(sym.toUpperCase(), side, qty, customPrice, signalSnapshot ?? undefined);
    if (result.success) { setSuccess(true); setTimeout(onClose, 1500); } else setError(result.error ?? "Order failed");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border-2 border-amber-500 bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-lg font-extrabold">🎯 Demo Trade</h2><div className="text-xs text-amber-600 dark:text-amber-400 font-bold">DEMO — फेक पैसा, वास्तविक ट्रेड होइन</div></div>
          <button onClick={onClose} className="text-2xl text-muted hover:text-foreground">&times;</button>
        </div>
        {success ? (<div className="py-8 text-center"><div className="text-3xl mb-2">⏳</div><div className="text-lg font-bold text-amber-500">Order Placed!</div><div className="mt-2 text-xs text-muted">Fills gradually based on floorsheet volume</div></div>) : (
          <>
            {signalSnapshot && <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs"><span className="font-bold text-primary">Signal: </span><span className="font-semibold">{signalSnapshot.recommendation}</span></div>}
            <div className="mb-3"><label className="mb-1 block text-xs font-bold text-muted">Symbol</label><input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="e.g. NABIL" className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold uppercase outline-none focus:border-amber-500" /></div>
            <div className="mb-3"><label className="mb-1 block text-xs font-bold text-muted">LTP (Live)</label><div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold tabular-nums">{ltp > 0 ? `Rs ${npr(ltp)}` : <span className="text-muted">No price</span>}</div></div>
            <div className="mb-3"><label className="mb-1 block text-xs font-bold text-muted">Your Price (optional, LTP ±2%)</label><input value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} type="number" step="0.01" placeholder={`Default: LTP = ${npr(ltp)}`} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold tabular-nums outline-none focus:border-amber-500" />
              {ltp > 0 && <div className="mt-1 text-[10px] text-muted">Range: Rs {npr(ltp * 0.98)} – Rs {npr(ltp * 1.02)}</div>}
            </div>
            <div className="mb-3 flex gap-2">
              <button onClick={() => setSide("buy")} className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${side === "buy" ? "bg-up text-white" : "bg-surface-2 text-muted hover:bg-up-bg"}`}>BUY</button>
              <button onClick={() => setSide("sell")} className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${side === "sell" ? "bg-down text-white" : "bg-surface-2 text-muted hover:bg-down-bg"}`}>SELL</button>
            </div>
            <div className="mb-3"><label className="mb-1 block text-xs font-bold text-muted">Quantity (min 10)</label><input type="number" min={10} value={qty} onChange={(e) => setQty(Math.max(0, parseInt(e.target.value) || 0))} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold tabular-nums outline-none focus:border-amber-500" /></div>
            {fees && orderPrice > 0 && <div className="mb-3 rounded-lg bg-surface-2 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted">Trade Value</span><span className="tabular-nums">Rs {npr(fees.tradeValue)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Brokerage+Fees</span><span className="tabular-nums">Rs {npr(fees.total)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-bold"><span>Total {side === "buy" ? "Cost" : "Proceeds"}</span><span className="tabular-nums">Rs {npr(totalCost)}</span></div>
            </div>}
            {side === "sell" && posQty > 0 && <div className="mb-2 text-xs text-muted">Available to sell: <b>{posQty}</b> shares</div>}
            <div className="mb-3 text-xs text-muted">Cash: <b>Rs {npr(state.account.balance)}</b></div>
            {error && <div className="mb-3 rounded-lg bg-down-bg px-3 py-2 text-xs font-bold text-down">{error}</div>}
            <button onClick={handleSubmit} className={`w-full rounded-lg py-3 text-sm font-extrabold text-white transition active:scale-95 ${side === "buy" ? "bg-up hover:bg-up/90" : "bg-down hover:bg-down/90"}`}>Confirm {side === "buy" ? "BUY" : "SELL"} — {num(qty)} shares</button>
          </>
        )}
      </div>
    </div>
  );
}

function SearchParamsHandler({ onOpen }: { onOpen: (sym: string, price: number, signal: DemoOrder["signalSnapshot"]) => void }) {
  const sp = useSearchParams();
  useEffect(() => {
    const sym = sp.get("symbol"); const price = sp.get("price"); const rec = sp.get("rec"); const conf = sp.get("conf"); const trend = sp.get("trend");
    if (sym) { const signal = rec ? { recommendation: rec, confidence: conf ? parseInt(conf) : 0, trend: trend || null } : null; onOpen(sym, price ? parseFloat(price) : 0, signal); }
  }, [sp, onOpen]);
  return null;
}
