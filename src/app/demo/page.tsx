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

export default function DemoPage() {
  const [state, setState] = useState<DemoState | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [prevClose, setPrevClose] = useState<PrevCloseMap>({});
  // Live market data (all stocks from /api/live — same as /market page)
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
  const [buyPrice, setBuyPrice] = useState(""); // Manual price input
  const [buySearch, setBuySearch] = useState(""); // for stock search
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [buyMsg, setBuyMsg] = useState("");
  const userId = "guest";

  useEffect(() => {
    const s = loadState(userId);
    if (s) {
      // Migrate old state: ensure pendingOrders exists
      if (!s.pendingOrders) s.pendingOrders = [];
      setState(s);
    } else { const f = initAccount(userId); saveState(userId, f); setState(f); }
  }, [userId]);

  // Process pending orders based on floorsheet volume
  const processPendingOrders = useCallback((currentState: DemoState, currentPrices: PriceMap): DemoState => {
    if (!currentState.pendingOrders?.length) return currentState;
    
    let newBalance = currentState.account.balance;
    const newPositions = [...currentState.positions];
    const newOrders = [...currentState.orders];
    const remainingPending: DemoPendingOrder[] = [];
    
    for (const pending of currentState.pendingOrders) {
      const priceData = currentPrices[pending.symbol];
      if (!priceData || priceData.totalQty <= 0) {
        remainingPending.push(pending);
        continue;
      }
      
      const remainingQty = pending.qty - pending.filled;
      // Fill up to 30% of available floorsheet volume per check (simulate market participation)
      const maxFill = Math.floor(priceData.totalQty * 0.3);
      const fillQty = Math.min(remainingQty, maxFill);
      
      if (fillQty <= 0) {
        remainingPending.push(pending);
        continue;
      }
      
      // Execute the fill
      const price = priceData.ltp;
      const fees = calcFees(pending.side, fillQty, price);
      
      if (pending.side === "buy") {
        const totalCost = fees.tradeValue + fees.total;
        if (totalCost > newBalance) {
          remainingPending.push(pending);
          continue;
        }
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
      
      // Create filled order record
      const filledOrder: DemoOrder = {
        id: `${pending.id}_fill_${Date.now()}`,
        ts: Date.now(),
        symbol: pending.symbol,
        side: pending.side,
        qty: fillQty,
        price,
        fees: fees.total,
        total: fees.tradeValue,
        balanceAfter: newBalance,
        signalSnapshot: pending.signalSnapshot ?? null,
      };
      newOrders.unshift(filledOrder);
      
      // Update pending or remove if fully filled
      const newFilled = pending.filled + fillQty;
      if (newFilled < pending.qty) {
        remainingPending.push({ ...pending, filled: newFilled });
      }
    }
    
    return {
      account: { ...currentState.account, balance: newBalance },
      positions: newPositions,
      orders: newOrders,
      pendingOrders: remainingPending,
    };
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/prices", { cache: "no-store" });
      const j = await r.json();
      const newPrices = j.prices ?? {};
      const newPrevClose = j.prevClose ?? {};
      setPrices(newPrices);
      setPrevClose(newPrevClose);
      
      // Process pending orders with new price/volume data
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
    
    // Validate price is within LTP ±2%
    if (ltp > 0 && customPrice) {
      const lower = ltp * 0.98;
      const upper = ltp * 1.02;
      if (customPrice < lower || customPrice > upper) {
        return { success: false, error: `Price must be within LTP ±2%: Rs ${npr(lower)} – Rs ${npr(upper)}` };
      }
    }
    
    // Sell: must own the stock
    if (side === "sell" && posQty <= 0) {
      return { success: false, error: `You don't own ${symbol}. Only owned stocks can be sold.` };
    }
    if (side === "sell" && qty > posQty) {
      return { success: false, error: `Only ${posQty} shares of ${symbol} owned. Cannot sell ${qty}.` };
    }
    
    const validation = validateOrder(side, qty, price, prevC, state.account.balance, posQty);
    if (!validation.valid) return { success: false, error: validation.error };
    
    // Create as pending order (will fill based on floorsheet volume)
    const pending: DemoPendingOrder = {
      id: orderId(),
      ts: Date.now(),
      symbol,
      side,
      qty,
      filled: 0,
      price,
      signalSnapshot: signalSnapshot ?? null,
    };
    
    const newState: DemoState = {
      ...state,
      pendingOrders: [pending, ...(state.pendingOrders ?? [])],
    };
    saveState(userId, newState);
    setState(newState);
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
    
    // Use manual price if provided, otherwise LTP
    const customPrice = buyPrice ? parseFloat(buyPrice) : 0;
    const orderPrice = customPrice > 0 ? customPrice : ltp;
    
    // Check balance
    const fees = calcFees("buy", qty, orderPrice);
    const totalCost = fees.tradeValue + fees.total;
    if (totalCost > (state?.account.balance ?? 0)) {
      setBuyMsg(`Insufficient balance! Need Rs ${npr(totalCost)}, have Rs ${npr(state?.account.balance ?? 0)}`);
      return;
    }
    
    const result = placeOrder(sym, "buy", qty, customPrice > 0 ? customPrice : undefined);
    if (result.success) {
      setBuyMsg(`ORDER: ${sym} x ${qty} @ Rs ${npr(orderPrice)} (fills from floorsheet)`);
      setBuyQty(""); setBuyPrice(""); setBuySearch(""); setBuySymbol("");
    } else setBuyMsg(result.error ?? "Order failed");
    setTimeout(() => setBuyMsg(""), 5000);
  };

  // All stocks from live market data (complete list like /market page)
  const allLiveStocks = useMemo(() => {
    const list = live.data?.data ?? [];
    return list.filter(s => s.lastTradedPrice > 0).sort((a, b) => b.lastTradedPrice - a.lastTradedPrice);
  }, [live.data]);
  const stockSuggestions = useMemo(() => {
    if (!buySearch.trim()) return allLiveStocks.slice(0, 12);
    const q = buySearch.toUpperCase().trim();
    return allLiveStocks.filter(s => s.symbol.toUpperCase().includes(q) || (s.securityName ?? "").toUpperCase().includes(q)).slice(0, 12);
  }, [allLiveStocks, buySearch]);

  return (
    <div className="space-y-4">
      <Suspense fallback={null}><SearchParamsHandler onOpen={openTicketFromParams} /></Suspense>
      <div className="rounded-xl border-2 border-amber-500 bg-amber-500/10 px-4 py-3 text-center">
        <div className="text-base font-extrabold text-amber-700 dark:text-amber-400">🏦 NEPSE FULL PORTFOLIO + P/L TRACKER</div>
        <div className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Virtual NPR {num(STARTING_BALANCE)} balance · No real money · For learning only</div>
        <Link href="/" className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">← Back to Dashboard</Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* BUY PANEL */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="mb-3 text-base font-bold">🛒 Buy Stock</h3>
          
          {/* Stock Search */}
          <div className="relative mb-2">
            <input
              value={buySearch}
              onChange={(e) => { setBuySearch(e.target.value.toUpperCase()); setBuySymbol(""); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Type stock symbol (e.g. NABIL, NTC...)"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold uppercase outline-none focus:border-amber-500"
            />
            {buySymbol && <div className="absolute right-3 top-2 text-xs font-bold text-up">✓ {buySymbol}</div>}
            {showSuggestions && stockSuggestions.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-[260px] w-full overflow-y-auto rounded-lg border border-border bg-surface-2 shadow-lg">
                {stockSuggestions.map((s) => {
                  const ltp = s.lastTradedPrice;
                  const ch = s.percentageChange ?? 0;
                  return (
                    <button key={s.symbol} onClick={() => { setBuySymbol(s.symbol); setBuySearch(s.symbol); setShowSuggestions(false); }} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-amber-500/10">
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

          {/* Quantity */}
          <input value={buyQty} onChange={(e) => setBuyQty(e.target.value)} type="number" min={1} placeholder="Quantity (shares)" className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold outline-none focus:border-amber-500" />

          {/* Manual Price (optional) */}
          <div className="mb-2">
            <input value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} type="number" step="0.01" placeholder={`Price (LTP: ${npr(prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0)}) — optional`} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-bold outline-none focus:border-amber-500" />
            {buySymbol && (prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0) > 0 && (
              <div className="mt-1 text-[10px] text-muted">Allowed range: <b className="text-foreground">Rs {npr((prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0) * 0.98)}</b> – <b className="text-foreground">Rs {npr((prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0) * 1.02)}</b> (LTP ±2%)</div>
            )}
          </div>

          {/* Summary */}
          <div className="mb-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
            {(() => {
              const ltp = prices[buySymbol]?.ltp ?? liveMap.get(buySymbol)?.ltp ?? 0;
              const orderPrice = buyPrice ? parseFloat(buyPrice) : ltp;
              const qty = buyQty ? parseInt(buyQty) || 0 : 0;
              const amt = qty * orderPrice;
              return (
                <>
                  <div>LTP: <span className="font-bold text-foreground">{buySymbol ? npr(ltp) : "—"}</span>
                    {buyPrice && orderPrice > 0 && <span className="ml-2">Your Price: <span className="font-bold text-amber-500">Rs {npr(orderPrice)}</span></span>}
                  </div>
                  {buySymbol && qty > 0 && (
                    <div className="mt-1">
                      <span>Qty: <b className="text-foreground">{num(qty)}</b> shares</span>
                      <span className="mx-2">·</span>
                      <span>Amount: <b className="text-amber-500">Rs {npr(amt)}</b></span>
                    </div>
                  )}
                  <div className="mt-1">Cash: <b className="text-foreground">Rs {npr(state?.account.balance ?? 0)}</b></div>
                </>
              );
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
                  return (
                  <tr key={s.symbol} className="border-b border-border/30 hover:bg-surface-2/50">
                    <td className="py-1.5 font-bold text-primary">{s.symbol}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums text-cyan-400">{npr(s.lastTradedPrice)}</td>
                    <td className={`py-1.5 text-right text-xs font-bold tabular-nums ${chg >= 0 ? "text-up" : "text-down"}`}>{chg >= 0 ? "+" : ""}{pct(chg)}</td>
                    <td className="py-1.5 text-right text-xs tabular-nums text-muted">{(s.totalTradeQuantity ?? 0) > 0 ? num(s.totalTradeQuantity) : "—"}</td>
                  </tr>
                  );
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
              {state?.positions.map((pos) => { const ltp = getLTP(pos.symbol); const pl = (ltp - pos.avgCost) * pos.qty; return (
                <tr key={pos.symbol} className="border-b border-border/30 hover:bg-surface-2/50">
                  <td className="py-1.5 font-bold text-primary">{pos.symbol}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(pos.qty)}</td>
                  <td className="py-1.5 text-right tabular-nums">{npr(pos.avgCost)}</td>
                  <td className={`py-1.5 text-right font-bold tabular-nums ${pl >= 0 ? "text-up" : "text-down"}`}>{pl >= 0 ? "+" : ""}{npr(pl)}</td>
                </tr>
              ); })}
              {(!state || state.positions.length === 0) && <tr><td colSpan={4} className="py-6 text-center text-muted">No positions yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* PENDING ORDERS - Shows orders waiting to be filled based on floorsheet volume */}
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
                return (
                  <tr key={po.id} className="border-b border-border/30">
                    <td className="py-2 font-bold text-primary">{po.symbol}</td>
                    <td className={`py-2 font-bold uppercase ${po.side === "buy" ? "text-up" : "text-down"}`}>{po.side}</td>
                    <td className="py-2 text-right tabular-nums">{num(po.qty)}</td>
                    <td className="py-2 text-right tabular-nums text-up">{num(po.filled)}</td>
                    <td className="py-2 text-right tabular-nums text-amber-500">{num(remaining)}</td>
                    <td className="py-2 text-right tabular-nums">{npr(po.price)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{pct.toFixed(0)}%</span>
                      </div>
                      {available > 0 && <div className="text-[10px] text-muted">Market: {num(available)} shares</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 text-[10px] text-muted">Orders fill gradually as market volume increases (up to 30% of floorsheet volume per check)</div>
        </div>
      )}

      {/* ACCOUNT SUMMARY */}
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
    
    // Sell: must own the stock
    if (side === "sell" && posQty <= 0) { setError(`You don't own ${sym}. Only owned stocks can be sold.`); return; }
    if (side === "sell" && qty > posQty) { setError(`Only ${posQty} shares owned.`); return; }
    
    // Buy: check balance
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
