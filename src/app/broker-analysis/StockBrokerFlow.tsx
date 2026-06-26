"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type StockRow = { symbol: string; name: string; qty: number; amount: number; trades: number; avgPrice: number };
type BrokerRow = {
  id: string;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
  action: string;
  avgBuyPrice: number;
  avgSellPrice: number;
};
type FsStockResp = {
  date: string;
  stocks: StockRow[];
  stockBrokers: Record<string, BrokerRow[]>;
};

const fmt = (n: number) => n.toLocaleString("en-IN");
const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString("en-IN");
};

// Move classification on kitta (quantity) net, same idea as the demo.
// NEPSE quantities vary widely, so HOLD = net within 1% of broker's gross volume.
function classifyMove(buyQty: number, sellQty: number): "BUY" | "SELL" | "HOLD" {
  const net = buyQty - sellQty;
  const gross = buyQty + sellQty;
  const threshold = Math.max(50, gross * 0.05); // 5% band, min 50 kitta
  if (net > threshold) return "BUY";
  if (net < -threshold) return "SELL";
  return "HOLD";
}

export function StockBrokerFlow() {
  const [resp, setResp] = useState<FsStockResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Load all stocks + broker breakdown for the latest available date
  useEffect(() => {
    setLoading(true);
    fetch("/api/fs-stock")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: FsStockResp) => {
        if ((d as any).error) throw new Error((d as any).error);
        setResp(d);
        // auto-select the top stock by turnover
        if (d.stocks?.length) setSelected(d.stocks[0].symbol);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message ?? "Failed to load");
        setLoading(false);
      });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filtered stock list for the search dropdown — default shows ALL stocks
  const filteredStocks = useMemo(() => {
    const all = resp?.stocks ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all; // all stocks available by default
    return all.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [resp, search]);

  // Broker rows for the selected stock, ranked by kitta uthayo (buyQty)
  const brokerRows = useMemo(() => {
    if (!resp || !selected) return [];
    const rows = resp.stockBrokers[selected] ?? [];
    return [...rows].sort((a, b) => b.buyQty - a.buyQty);
  }, [resp, selected]);

  // Chart: top brokers by kitta for the selected stock
  const chartData = useMemo(() => {
    const top = brokerRows.slice(0, 15);
    return {
      labels: top.map((b) => b.id),
      datasets: [
        { label: "Buy (kitta)", data: top.map((b) => b.buyQty), backgroundColor: "#22c55e" },
        { label: "Sell (kitta)", data: top.map((b) => b.sellQty), backgroundColor: "#ef4444" },
      ],
    };
  }, [brokerRows]);

  const selectedStock = resp?.stocks.find((s) => s.symbol === selected);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="ml-3 text-sm text-muted">Loading stock-wise broker data...</span>
      </div>
    );
  }

  if (error || !resp) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
        {error ? `Error: ${error}` : "No floorsheet data available."}
        <div className="mt-1 text-xs">Stock-wise broker breakdown needs floorsheet data in the database.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stock search — default shows all stocks */}
      <div className="relative max-w-md" ref={boxRef}>
        <label className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Stock ({resp.stocks.length} available · {resp.date})
        </label>
        <input
          type="text"
          value={open ? search : selected ?? ""}
          onFocus={() => { setOpen(true); setSearch(""); }}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          placeholder="Search stock by symbol or name..."
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-primary"
        />
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
            {filteredStocks.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted">No stocks match &quot;{search}&quot;</div>
            ) : (
              filteredStocks.map((s) => (
                <div
                  key={s.symbol}
                  className={`flex items-center px-3 py-2 text-xs transition hover:bg-surface-2 cursor-pointer ${
                    selected === s.symbol ? "bg-primary/10 font-semibold" : ""
                  }`}
                  onMouseDown={() => { setSelected(s.symbol); setOpen(false); }}
                >
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">{s.symbol}</span>
                  <span className="ml-2 flex-1 text-foreground">{s.name}</span>
                  <span className="ml-auto tabular-nums text-muted">{compact(s.amount)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selectedStock && (
        <>
          {/* Selected stock stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Total Kitta</div>
              <div className="mt-1 text-base font-bold tabular-nums text-foreground">{fmt(selectedStock.qty)}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Turnover</div>
              <div className="mt-1 text-base font-bold tabular-nums text-foreground">{compact(selectedStock.amount)}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Avg Price</div>
              <div className="mt-1 text-base font-bold tabular-nums text-foreground">{selectedStock.avgPrice.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Brokers</div>
              <div className="mt-1 text-base font-bold tabular-nums text-foreground">{brokerRows.length}</div>
            </div>
          </div>

          {/* Chart: broker kitta */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {selectedStock.symbol} — Top brokers by kitta uthayo (Buy vs Sell)
            </h3>
            <div className="h-[320px]">
              <Bar
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { labels: { color: "#94a3b8" } } },
                  scales: {
                    x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
                    y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.1)" } },
                  },
                }}
              />
            </div>
          </div>

          {/* Table: which broker lifted how many kitta */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Broker-wise Buy / Sell / Hold ({brokerRows.length} brokers)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <th className="px-2 py-2 text-left">Broker</th>
                    <th className="px-2 py-2 text-right">Buy Kitta</th>
                    <th className="px-2 py-2 text-right">Sell Kitta</th>
                    <th className="px-2 py-2 text-right">Net Kitta</th>
                    <th className="px-2 py-2 text-right">Net Amount</th>
                    <th className="px-2 py-2 text-center">Move</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerRows.map((b) => {
                    const move = classifyMove(b.buyQty, b.sellQty);
                    const moveCls =
                      move === "BUY" ? "text-up" : move === "SELL" ? "text-down" : "text-amber-500";
                    return (
                      <tr key={b.id} className="border-b border-border/50 text-xs hover:bg-surface-2/50">
                        <td className="px-2 py-2 font-semibold text-foreground">Broker {b.id}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-up">{fmt(b.buyQty)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-down">{fmt(b.sellQty)}</td>
                        <td className={`px-2 py-2 text-right tabular-nums font-semibold ${b.netQty >= 0 ? "text-up" : "text-down"}`}>
                          {b.netQty >= 0 ? "+" : ""}{fmt(b.netQty)}
                        </td>
                        <td className={`px-2 py-2 text-right tabular-nums ${b.netAmt >= 0 ? "text-up" : "text-down"}`}>
                          {b.netAmt >= 0 ? "+" : ""}{compact(b.netAmt)}
                        </td>
                        <td className={`px-2 py-2 text-center font-bold ${moveCls}`}>{move}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
