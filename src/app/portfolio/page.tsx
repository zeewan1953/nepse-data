"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import { useLots, useSetups } from "@/lib/portfolio";
import { generateSignal, type Candle } from "@/lib/signals";
import type { LiveMarketData, MarketStatus, SecurityResponse } from "@/lib/types";
import { classifySymbol, TYPE_BADGE } from "@/lib/types";
import { npr, num, compact, pct, changeClass } from "@/lib/format";

type LiveResp = { data: LiveMarketData[]; count: number };
type StockSignal = { simple: "Buy" | "Hold" | "Sell"; strength: "Strong" | "Moderate" | "Weak"; confidence: number };

const PALETTE = ["#1d72d2", "#2c9bf0", "#0a8754", "#e0a800", "#d13438", "#7048e8", "#1098ad", "#e8590c", "#5c7cfa", "#37b24d"];

export default function PortfolioPage() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const live = usePoll<LiveResp>("/api/live", open ? 8_000 : 60_000);

  const ltpMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of live.data?.data ?? []) m.set(r.symbol, r.lastTradedPrice);
    return m;
  }, [live.data]);

  const { items: lots, add: addLot, remove: removeLot } = useLots();
  const { items: setups, add: addSetup, remove: removeSetup } = useSetups();

  // Group lots by symbol → weighted average cost (WACC) per holding.
  const holdings = useMemo(() => {
    const map = new Map<string, { symbol: string; qty: number; cost: number }>();
    for (const l of lots) {
      const h = map.get(l.symbol) ?? { symbol: l.symbol, qty: 0, cost: 0 };
      h.qty += l.qty;
      h.cost += l.qty * l.buyPrice;
      map.set(l.symbol, h);
    }
    const rows = [...map.values()].map((h) => {
      const wacc = h.qty ? h.cost / h.qty : 0; // weighted average cost
      const ltp = ltpMap.get(h.symbol) ?? wacc;
      const current = h.qty * ltp;
      const pl = current - h.cost;
      const plPct = h.cost ? (pl / h.cost) * 100 : 0;
      return { ...h, wacc, ltp, current, pl, plPct };
    });
    const invested = rows.reduce((a, r) => a + r.cost, 0);
    const current = rows.reduce((a, r) => a + r.current, 0);
    return { rows: rows.sort((a, b) => b.current - a.current), invested, current, pl: current - invested };
  }, [lots, ltpMap]);

  // Per-holding AI signal (strong/weak + simple Buy/Hold/Sell).
  const [signals, setSignals] = useState<Record<string, StockSignal>>({});
  const symbolKey = holdings.rows.map((r) => r.symbol).join(",");
  useEffect(() => {
    const symbols = symbolKey ? symbolKey.split(",") : [];
    let alive = true;
    (async () => {
      const out: Record<string, StockSignal> = {};
      await Promise.all(
        symbols.map(async (sym) => {
          try {
            const res = await fetch(`/api/security/${encodeURIComponent(sym)}`, { cache: "no-store" });
            const j = (await res.json()) as SecurityResponse;
            const candles: Candle[] = [...(j.history?.content ?? [])]
              .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
              .map((c) => ({ high: c.highPrice, low: c.lowPrice, close: c.closePrice, volume: c.totalTradedQuantity }));
            const ltp = j.details?.securityDailyTradeDto?.lastTradedPrice ?? candles.at(-1)?.close ?? 0;
            const s = generateSignal(candles, ltp);
            const simple = s.recommendation.includes("Buy") ? "Buy" : s.recommendation.includes("Sell") ? "Sell" : "Hold";
            const strength = s.confidence >= 65 ? "Strong" : s.confidence <= 45 ? "Weak" : "Moderate";
            out[sym] = { simple, strength, confidence: s.confidence };
          } catch {
            /* skip */
          }
        }),
      );
      if (alive) setSignals(out);
    })();
    return () => {
      alive = false;
    };
  }, [symbolKey]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Portfolio</h1>
        <p className="text-sm text-muted">WACC, allocation, live P/L and per-stock signals · saved on this device.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Invested" value={`Rs ${compact(holdings.invested)}`} />
        <Stat label="Current Value" value={`Rs ${compact(holdings.current)}`} />
        <Stat label="Profit / Loss" value={`${holdings.pl >= 0 ? "+" : ""}Rs ${compact(holdings.pl)}`} cls={changeClass(holdings.pl)} />
        <Stat label="Return" value={pct(holdings.invested ? (holdings.pl / holdings.invested) * 100 : 0)} cls={changeClass(holdings.pl)} />
      </div>

      {/* Allocation pie + legend */}
      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 font-bold">📊 Allocation</h2>
        {holdings.rows.length === 0 ? (
          <p className="text-sm text-muted">Add holdings to see allocation.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <Donut slices={holdings.rows.map((r, i) => ({ label: r.symbol, value: r.current, color: PALETTE[i % PALETTE.length] }))} />
            <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {holdings.rows.map((r, i) => (
                <div key={r.symbol} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                    {r.symbol}
                  </span>
                  <span className="tabular-nums text-muted">
                    {holdings.current ? ((r.current / holdings.current) * 100).toFixed(1) : "0"}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Holdings */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3 font-bold">Holdings</div>
        <AddLotForm onAdd={addLot} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">WACC</th>
                <th className="px-3 py-2 text-right">LTP</th>
                <th className="px-3 py-2 text-right">Current</th>
                <th className="px-3 py-2 text-right">P/L</th>
                <th className="px-3 py-2 text-center">Analysis</th>
                <th className="px-3 py-2 text-center">Signal</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {holdings.rows.map((r) => {
                const sig = signals[r.symbol];
                return (
                  <tr key={r.symbol} className="border-t border-border hover:bg-surface-2">
                    <td className="px-3 py-2 font-bold">
                      <Link href={`/stock/${r.symbol}`} className="text-primary hover:underline">{r.symbol}</Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[classifySymbol(r.symbol)]}`}>
                        {classifySymbol(r.symbol)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(r.qty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{npr(r.wacc)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{npr(r.ltp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{compact(r.current)}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${changeClass(r.pl)}`}>
                      {r.pl >= 0 ? "+" : ""}{compact(r.pl)} ({pct(r.plPct)})
                    </td>
                    <td className="px-3 py-2 text-center">
                      {sig ? (
                        <span className={`text-xs font-bold ${sig.strength === "Strong" ? "text-up" : sig.strength === "Weak" ? "text-down" : "text-muted"}`}>
                          {sig.strength} {sig.confidence}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted">…</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {sig ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${sig.simple === "Buy" ? "bg-up-bg text-up" : sig.simple === "Sell" ? "bg-down-bg text-down" : "bg-surface-2 text-muted"}`}>
                          {sig.simple}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">…</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeLot(lots.find((l) => l.symbol === r.symbol)?.id ?? "")} className="text-xs text-down hover:underline">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {holdings.rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">No holdings yet — add a buy above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {lots.length > holdings.rows.length && (
          <p className="px-4 py-2 text-[11px] text-muted">
            Multiple buys of the same stock are merged into one weighted-average (WACC) holding.
          </p>
        )}
      </section>

      {/* Watchlist / Buy setups */}
      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-3 font-bold">Watchlist — Next Buy Setups</div>
        <AddSetupForm onAdd={addSetup} />
        <div className="divide-y divide-border">
          {setups.map((s) => {
            const ltp = ltpMap.get(s.symbol);
            const hit = ltp !== undefined && ltp <= s.targetPrice;
            return (
              <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <Link href={`/stock/${s.symbol}`} className="font-bold text-primary hover:underline">{s.symbol}</Link>
                  <span className="ml-2 text-muted">target {npr(s.targetPrice)} · qty {num(s.qty)}{s.note ? ` · ${s.note}` : ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">LTP {ltp !== undefined ? npr(ltp) : "-"}</span>
                  {hit && <span className="rounded-full bg-up-bg px-2 py-0.5 text-xs font-bold text-up">✓ Buy zone</span>}
                  <button onClick={() => removeSetup(s.id)} className="text-xs text-down hover:underline">Remove</button>
                </div>
              </div>
            );
          })}
          {setups.length === 0 && <div className="px-4 py-6 text-center text-muted">No buy setups — add a target price to watch.</div>}
        </div>
      </section>
    </div>
  );
}

function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const cx = 70, cy = 70, rO = 64, rI = 38;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const frac = s.value / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x1, y1] = p(rO, start);
    const [x2, y2] = p(rO, end);
    const [x3, y3] = p(rI, end);
    const [x4, y4] = p(rI, start);
    const d = `M ${x1} ${y1} A ${rO} ${rO} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rI} ${rI} 0 ${large} 0 ${x4} ${y4} Z`;
    return { d, color: s.color };
  });
  return (
    <svg width={140} height={140} viewBox="0 0 140 140" className="shrink-0">
      {slices.length === 1 ? (
        <>
          <circle cx={cx} cy={cy} r={rO} fill={slices[0].color} />
          <circle cx={cx} cy={cy} r={rI} fill="var(--surface)" />
        </>
      ) : (
        arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} />)
      )}
    </svg>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

function AddLotForm({ onAdd }: { onAdd: (l: { symbol: string; qty: number; buyPrice: number; date: string }) => void }) {
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const submit = () => {
    if (!symbol || !qty || !price) return;
    onAdd({ symbol: symbol.trim().toUpperCase(), qty: Number(qty), buyPrice: Number(price), date: new Date().toISOString().slice(0, 10) });
    setSymbol(""); setQty(""); setPrice("");
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-2 px-4 py-3">
      <Inp label="Symbol" value={symbol} onChange={setSymbol} w="w-28" placeholder="NABIL" />
      <Inp label="Qty" value={qty} onChange={(v) => setQty(v.replace(/\D/g, ""))} w="w-24" placeholder="10" />
      <Inp label="Buy Price" value={price} onChange={(v) => setPrice(v.replace(/[^\d.]/g, ""))} w="w-28" placeholder="500" />
      <button onClick={submit} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">+ Add Buy</button>
    </div>
  );
}

function AddSetupForm({ onAdd }: { onAdd: (s: { symbol: string; targetPrice: number; qty: number; note?: string }) => void }) {
  const [symbol, setSymbol] = useState("");
  const [target, setTarget] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const submit = () => {
    if (!symbol || !target) return;
    onAdd({ symbol: symbol.trim().toUpperCase(), targetPrice: Number(target), qty: Number(qty || "0"), note: note.trim() || undefined });
    setSymbol(""); setTarget(""); setQty(""); setNote("");
  };
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border bg-surface-2 px-4 py-3">
      <Inp label="Symbol" value={symbol} onChange={setSymbol} w="w-28" placeholder="NABIL" />
      <Inp label="Target Buy" value={target} onChange={(v) => setTarget(v.replace(/[^\d.]/g, ""))} w="w-28" placeholder="480" />
      <Inp label="Qty" value={qty} onChange={(v) => setQty(v.replace(/\D/g, ""))} w="w-24" placeholder="10" />
      <Inp label="Note" value={note} onChange={setNote} w="w-40" placeholder="optional" />
      <button onClick={submit} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">+ Add Setup</button>
    </div>
  );
}

function Inp({ label, value, onChange, w, placeholder }: { label: string; value: string; onChange: (v: string) => void; w: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${w} rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary`} />
    </label>
  );
}
