"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePoll } from "@/lib/useLive";
import type { MarketStatus, FloorSheet, FloorSheetItem } from "@/lib/types";
import { num, compact } from "@/lib/format";

type Broker = { id: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number };
type StockAgg = { symbol: string; name: string; qty: number; amount: number; trades: number };
type Analysis = {
  totals: { trades: number; sampled: number; qty: number; amount: number; brokers: number; stocks: number; truncated: boolean };
  netFlow: Broker[];
  topBuyers: Broker[];
  topSellers: Broker[];
  stocks: StockAgg[];
  generatedAt: number;
  error?: string;
};

export default function FloorsheetDashboard() {
  const status = usePoll<MarketStatus>("/api/market-status", 30_000);
  const open = status.data?.isOpen?.toUpperCase() === "OPEN";
  const { data, error, loading, updatedAt } = usePoll<Analysis>(
    "/api/floorsheet/analysis",
    open ? 20_000 : 5 * 60_000,
  );

  const empty = data && data.totals.sampled === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Broker Analysis</h1>
          <p className="text-sm text-muted">
            Broker activity, net buy/sell flow & stock-wise trades
            {updatedAt && <> · updated {new Date(updatedAt).toLocaleTimeString("en-GB")}</>}
            {open ? " · auto 20s" : " · market closed"}
          </p>
        </div>
      </div>

      <AIAgent analysis={data ?? null} />

      <BrokerLookup />

      {error && <div className="rounded-lg bg-down-bg px-4 py-3 text-sm text-down">Error: {error}</div>}

      {empty && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
          <div className="text-4xl">🕒</div>
          <p className="mt-3 font-semibold">Floorsheet khali cha</p>
          <p className="mt-1 text-sm text-muted">
            NEPSE le floorsheet (trades) market khulda (Sun–Thu, 11am–3pm) matra dincha. Market band huda clear huncha.
          </p>
        </div>
      )}

      {/* Summary cards */}
      {data && !empty && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total Trades" value={num(data.totals.trades)} sub={data.totals.truncated ? `analysing ${num(data.totals.sampled)}` : undefined} />
            <Stat label="Turnover" value={`Rs ${compact(data.totals.amount)}`} />
            <Stat label="Active Brokers" value={num(data.totals.brokers)} />
            <Stat label="Stocks Traded" value={num(data.totals.stocks)} />
          </div>

          {/* Net flow visualization */}
          <div className="grid gap-4 lg:grid-cols-2">
            <NetFlowCard title="Biggest Net Buyers" rows={data.netFlow.filter((b) => b.netAmt > 0).slice(0, 10)} tone="up" />
            <NetFlowCard title="Biggest Net Sellers" rows={data.netFlow.filter((b) => b.netAmt < 0).slice(-10).reverse()} tone="down" />
          </div>

          {/* Top buyers / sellers */}
          <div className="grid gap-4 lg:grid-cols-2">
            <BrokerTable title="Top Buyers (by value)" rows={data.topBuyers} mode="buy" />
            <BrokerTable title="Top Sellers (by value)" rows={data.topSellers} mode="sell" />
          </div>

          {/* Stock-wise activity */}
          <StockTable stocks={data.stocks} />
        </>
      )}

      {loading && !data && <div className="py-10 text-center text-muted">Analysing floorsheet…</div>}
    </div>
  );
}

type BrokerStock = { symbol: string; name: string; buyQty: number; buyAmt: number; sellQty: number; sellAmt: number; netQty: number; netAmt: number };
type BrokerResp = { broker: number; stocks: BrokerStock[]; totals: { buyAmt: number; sellAmt: number; netAmt: number }; error?: string };

function BrokerLookup() {
  const [input, setInput] = useState("");
  const [broker, setBroker] = useState("");
  const [data, setData] = useState<BrokerResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"buyQty" | "sellQty" | "netQty" | "netAmt">("netAmt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sortBy = (k: typeof sortKey) => {
    if (k === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir("desc"); }
  };
  const arrow = (k: typeof sortKey) => (sortKey === k ? (dir === "asc" ? " ▲" : " ▼") : "");
  const sortRows = (rows: BrokerStock[]) =>
    [...rows].sort((a, b) => (dir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));

  const run = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      const res = await fetch(`/api/broker/${id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) setErr(j?.error ?? "Failed");
      else setData(j as BrokerResp);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim();
    setBroker(id);
    run(id);
  };

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-bold">Broker-wise Stock Analysis</h2>
          <p className="text-xs text-muted">Broker number halnus → tyo broker le kun stock kati kinyo / bechyo</p>
        </div>
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
            placeholder="Broker #"
            inputMode="numeric"
            className="w-28 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700">
            Analyse
          </button>
        </form>
      </div>

      {loading && <div className="px-4 py-6 text-center text-muted">Loading broker #{broker}…</div>}
      {err && <div className="px-4 py-3 text-sm text-down">{err}</div>}

      {data && (
        <div className="p-4">
          <div className="mb-3 flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg bg-surface-2 px-3 py-1">Broker <b>#{data.broker}</b></span>
            <span className="rounded-lg bg-up-bg px-3 py-1 text-up">Bought Rs {compact(data.totals.buyAmt)}</span>
            <span className="rounded-lg bg-down-bg px-3 py-1 text-down">Sold Rs {compact(data.totals.sellAmt)}</span>
            <span className={`rounded-lg px-3 py-1 font-bold ${data.totals.netAmt >= 0 ? "bg-up-bg text-up" : "bg-down-bg text-down"}`}>
              Net {data.totals.netAmt >= 0 ? "+" : ""}Rs {compact(data.totals.netAmt)} {data.totals.netAmt >= 0 ? "🟢 Accumulating" : "🔴 Exiting"}
            </span>
          </div>
          {data.stocks.length === 0 ? (
            <div className="rounded-lg border border-border px-3 py-6 text-center text-muted">
              Broker #{data.broker} ko trade bhetiena (market band hola).
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <BrokerSideTable
                title="🟢 Buying (Accumulating)"
                tone="up"
                rows={sortRows(data.stocks.filter((s) => s.netQty >= 0))}
                sortBy={sortBy}
                arrow={arrow}
              />
              <BrokerSideTable
                title="🔴 Selling (Exiting)"
                tone="down"
                rows={sortRows(data.stocks.filter((s) => s.netQty < 0))}
                sortBy={sortBy}
                arrow={arrow}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function BrokerSideTable({
  title,
  tone,
  rows,
  sortBy,
  arrow,
}: {
  title: string;
  tone: "up" | "down";
  rows: BrokerStock[];
  sortBy: (k: "buyQty" | "sellQty" | "netQty" | "netAmt") => void;
  arrow: (k: "buyQty" | "sellQty" | "netQty" | "netAmt") => string;
}) {
  const Th = ({ k, label }: { k: "buyQty" | "sellQty" | "netQty" | "netAmt"; label: string }) => (
    <th onClick={() => sortBy(k)} className="cursor-pointer select-none px-3 py-2 text-right hover:text-primary">
      {label}{arrow(k)}
    </th>
  );
  return (
    <div className="rounded-lg border border-border">
      <div className={`border-b border-border px-3 py-2 text-sm font-bold ${tone === "up" ? "text-up" : "text-down"}`}>
        {title} <span className="text-xs font-normal text-muted">({rows.length})</span>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Stock</th>
              <Th k="buyQty" label="Buy" />
              <Th k="sellQty" label="Sell" />
              <Th k="netQty" label="Net Qty" />
              <Th k="netAmt" label="Net Value" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.symbol} className="border-t border-border hover:bg-surface-2">
                <td className="px-3 py-1.5 font-bold">
                  <Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol}</Link>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-up">{num(s.buyQty)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-down">{num(s.sellQty)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${s.netQty >= 0 ? "text-up" : "text-down"}`}>
                  {s.netQty >= 0 ? "+" : ""}{num(s.netQty)}
                </td>
                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${s.netAmt >= 0 ? "text-up" : "text-down"}`}>
                  {s.netAmt >= 0 ? "+" : ""}{compact(s.netAmt)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-muted">None</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type LiveResp = { data: { symbol: string; percentageChange: number; lastTradedPrice: number }[] };

// AI agent: turns the raw floorsheet aggregation into plain-language insights.
function AIAgent({ analysis }: { analysis: Analysis | null }) {
  const live = usePoll<LiveResp>("/api/live", 60_000);
  const changeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of live.data?.data ?? []) m.set(r.symbol, r.percentageChange);
    return m;
  }, [live.data]);

  if (!analysis || analysis.totals.sampled === 0) {
    return (
      <section className="rounded-xl border border-primary/30 bg-surface p-4 shadow-sm">
        <h2 className="font-bold">🤖 AI Agent — Broker Analysis</h2>
        <p className="mt-1 text-sm text-muted">Market khulda (11am–3pm) floorsheet aaepachi auto insights dinchu.</p>
      </section>
    );
  }

  const buyers = analysis.netFlow.filter((b) => b.netAmt > 0).slice(0, 5);
  const sellers = analysis.netFlow.filter((b) => b.netAmt < 0).slice(-5).reverse();
  const moneyStocks = analysis.stocks.slice(0, 6);
  // accumulation = heavy-turnover stocks that are also up today
  const accumulation = analysis.stocks
    .slice(0, 40)
    .map((s) => ({ ...s, chg: changeMap.get(s.symbol) ?? 0 }))
    .filter((s) => s.chg > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  return (
    <section className="rounded-xl border border-primary/40 bg-gradient-to-br from-surface to-surface-2 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">🤖 AI Agent — Broker Analysis</h2>
        <span className="text-xs text-muted">auto from {num(analysis.totals.sampled)} trades</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {/* Net buyers */}
        <Insight title="🟢 Accumulating brokers" tone="up">
          {buyers.length ? buyers.map((b) => (
            <li key={b.id} className="flex justify-between">
              <span>Broker #{b.id}</span>
              <span className="font-semibold text-up tabular-nums">+{compact(b.netAmt)}</span>
            </li>
          )) : <li className="text-muted">—</li>}
        </Insight>

        {/* Net sellers */}
        <Insight title="🔴 Distributing brokers" tone="down">
          {sellers.length ? sellers.map((b) => (
            <li key={b.id} className="flex justify-between">
              <span>Broker #{b.id}</span>
              <span className="font-semibold text-down tabular-nums">{compact(b.netAmt)}</span>
            </li>
          )) : <li className="text-muted">—</li>}
        </Insight>

        {/* Accumulation stocks */}
        <Insight title="📈 Being accumulated">
          {accumulation.length ? accumulation.map((s) => (
            <li key={s.symbol} className="flex justify-between">
              <Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol}</Link>
              <span className="font-semibold text-up tabular-nums">+{s.chg.toFixed(1)}%</span>
            </li>
          )) : <li className="text-muted">heavy-volume + rising stock chaina abai</li>}
        </Insight>

        {/* Money flow */}
        <Insight title="💰 Money flowing into">
          {moneyStocks.map((s) => (
            <li key={s.symbol} className="flex justify-between">
              <Link href={`/stock/${s.symbol}`} className="text-primary hover:underline">{s.symbol}</Link>
              <span className="text-muted tabular-nums">{compact(s.amount)}</span>
            </li>
          ))}
        </Insight>
      </div>

      <p className="mt-3 text-sm">
        💡 <b>Summary:</b> Rs {compact(analysis.totals.amount)} turnover across {num(analysis.totals.brokers)} brokers.{" "}
        {buyers[0] && <>Top accumulator <b className="text-up">#{buyers[0].id}</b> (+{compact(buyers[0].netAmt)}). </>}
        {sellers[0] && <>Top distributor <b className="text-down">#{sellers[0].id}</b> ({compact(sellers[0].netAmt)}). </>}
        {accumulation[0] && <>Smart-money interest: <b>{accumulation.map((a) => a.symbol).slice(0, 3).join(", ")}</b>.</>}
      </p>
    </section>
  );
}

function Insight({ title, tone, children }: { title: string; tone?: "up" | "down"; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className={`mb-1 text-xs font-bold ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"}`}>{title}</div>
      <ul className="space-y-0.5 text-sm tabular-nums">{children}</ul>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

function NetFlowCard({ title, rows, tone }: { title: string; rows: Broker[]; tone: "up" | "down" }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.netAmt)));
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 font-bold">{title}</div>
      <div className="space-y-2 p-4">
        {rows.length === 0 && <div className="py-4 text-center text-sm text-muted">None</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 font-bold">#{r.id}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-2">
              <div
                className={`h-full ${tone === "up" ? "bg-up" : "bg-down"}`}
                style={{ width: `${(Math.abs(r.netAmt) / max) * 100}%`, opacity: 0.75 }}
              />
            </div>
            <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${tone === "up" ? "text-up" : "text-down"}`}>
              {compact(Math.abs(r.netAmt))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrokerTable({ title, rows, mode }: { title: string; rows: Broker[]; mode: "buy" | "sell" }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 font-bold">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-2 text-left">Broker</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Value</th>
            <th className="px-3 py-2 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-2">
              <td className="px-3 py-1.5 font-semibold">#{r.id}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{num(mode === "buy" ? r.buyQty : r.sellQty)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{compact(mode === "buy" ? r.buyAmt : r.sellAmt)}</td>
              <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${r.netAmt >= 0 ? "text-up" : "text-down"}`}>
                {r.netAmt >= 0 ? "+" : ""}{compact(r.netAmt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockTable({ stocks }: { stocks: StockAgg[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-4 py-3 font-bold">
        Stock-wise Activity <span className="text-xs font-normal text-muted">(click a stock for its broker breakdown)</span>
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-right">Trades</th>
              <th className="px-3 py-2 text-right">Quantity</th>
              <th className="px-3 py-2 text-right">Turnover</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => (
              <FragmentRow key={s.symbol} s={s} open={open === s.symbol} onToggle={() => setOpen(open === s.symbol ? null : s.symbol)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ s, open, onToggle }: { s: StockAgg; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="cursor-pointer border-t border-border hover:bg-surface-2" onClick={onToggle}>
        <td className="px-3 py-1.5 font-bold text-primary">
          <Link href={`/stock/${s.symbol}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{s.symbol}</Link>
        </td>
        <td className="max-w-[220px] truncate px-3 py-1.5 text-muted">{s.name}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{num(s.trades)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{num(s.qty)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{compact(s.amount)}</td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-surface-2">
          <td colSpan={5} className="px-3 py-2">
            <StockBrokers symbol={s.symbol} />
          </td>
        </tr>
      )}
    </>
  );
}

function StockBrokers({ symbol }: { symbol: string }) {
  const [rows, setRows] = useState<Broker[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/floorsheet?symbol=${symbol}&size=500`, { cache: "no-store" });
      const j = (await res.json()) as FloorSheet;
      const items: FloorSheetItem[] = j.floorsheets?.content ?? [];
      const map = new Map<string, Broker>();
      const get = (id: string) => map.get(id) ?? { id, buyQty: 0, buyAmt: 0, sellQty: 0, sellAmt: 0, netQty: 0, netAmt: 0 };
      for (const t of items) {
        const b = get(t.buyerMemberId); b.buyQty += t.contractQuantity; b.buyAmt += t.contractAmount; map.set(t.buyerMemberId, b);
        const s = get(t.sellerMemberId); s.sellQty += t.contractQuantity; s.sellAmt += t.contractAmount; map.set(t.sellerMemberId, s);
      }
      const list = [...map.values()].map((b) => ({ ...b, netQty: b.buyQty - b.sellQty, netAmt: b.buyAmt - b.sellAmt })).sort((a, b) => b.netAmt - a.netAmt);
      setRows(list);
    } catch (e) { setErr((e as Error).message); }
  }, [symbol]);

  useEffect(() => { load(); }, [load]);

  if (err) return <span className="text-sm text-down">{err}</span>;
  if (!rows) return <span className="text-sm text-muted">Loading {symbol} brokers…</span>;
  if (!rows.length) return <span className="text-sm text-muted">No trades for {symbol}.</span>;

  return (
    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {rows.slice(0, 12).map((b) => (
        <div key={b.id} className="flex items-center justify-between rounded bg-surface px-2 py-1 text-xs">
          <span className="font-bold">#{b.id}</span>
          <span className="flex gap-2 tabular-nums">
            <span className="text-up">B {num(b.buyQty)}</span>
            <span className="text-down">S {num(b.sellQty)}</span>
            <span className={`font-semibold ${b.netQty >= 0 ? "text-up" : "text-down"}`}>{b.netQty >= 0 ? "+" : ""}{num(b.netQty)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
