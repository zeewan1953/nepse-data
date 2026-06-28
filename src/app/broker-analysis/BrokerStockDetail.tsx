"use client";
import { useEffect, useMemo, useState } from "react";
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

type BrokerRow = {
  id: string;
  buyQty: number;
  buyAmt: number;
  sellQty: number;
  sellAmt: number;
  netQty: number;
  netAmt: number;
};
type FsStockResp = {
  date: string;
  stocks: Array<{ symbol: string }>;
  stockBrokers: Record<string, BrokerRow[]>;
};

type StockLine = {
  symbol: string;
  buyQty: number;
  sellQty: number;
  netQty: number;
  buyAmt: number;
  sellAmt: number;
  netAmt: number;
  move: "BUY" | "SELL" | "HOLD";
};

const fmt = (n: number) => n.toLocaleString("en-IN");
const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString("en-IN");
};

function classifyMove(buyQty: number, sellQty: number): "BUY" | "SELL" | "HOLD" {
  const net = buyQty - sellQty;
  const gross = buyQty + sellQty;
  const threshold = Math.max(50, gross * 0.05);
  if (net > threshold) return "BUY";
  if (net < -threshold) return "SELL";
  return "HOLD";
}

// Shows the full stock-wise breakdown for ONE broker (kun stock kati kitta uthayo).
export function BrokerStockDetail({ brokerCode, brokerName }: { brokerCode: string; brokerName?: string }) {
  const [resp, setResp] = useState<FsStockResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch("/api/fs-stock?live=true")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: FsStockResp) => {
        if (!alive) return;
        if ((d as any).error) throw new Error((d as any).error);
        setResp(d);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message ?? "Failed to load");
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  // All stocks this broker touched, with buy/sell/net kitta.
  const lines = useMemo<StockLine[]>(() => {
    if (!resp) return [];
    const out: StockLine[] = [];
    for (const [symbol, brokers] of Object.entries(resp.stockBrokers)) {
      const b = brokers.find((x) => String(x.id) === String(brokerCode));
      if (!b) continue;
      if (b.buyQty === 0 && b.sellQty === 0) continue;
      out.push({
        symbol,
        buyQty: b.buyQty,
        sellQty: b.sellQty,
        netQty: b.buyQty - b.sellQty,
        buyAmt: b.buyAmt,
        sellAmt: b.sellAmt,
        netAmt: b.buyAmt - b.sellAmt,
        move: classifyMove(b.buyQty, b.sellQty),
      });
    }
    return out;
  }, [resp, brokerCode]);

  const top5Buy = useMemo(
    () => [...lines].filter((l) => l.buyQty > 0).sort((a, b) => b.buyQty - a.buyQty).slice(0, 5),
    [lines],
  );
  const top5Sell = useMemo(
    () => [...lines].filter((l) => l.sellQty > 0).sort((a, b) => b.sellQty - a.sellQty).slice(0, 5),
    [lines],
  );

  // Chart shows top 5 buy + top 5 sell stocks side by side (buy vs sell kitta).
  const chartSymbols = useMemo(() => {
    const set = new Set<string>();
    top5Buy.forEach((l) => set.add(l.symbol));
    top5Sell.forEach((l) => set.add(l.symbol));
    return [...set];
  }, [top5Buy, top5Sell]);

  const chartData = useMemo(() => {
    const bySym = new Map(lines.map((l) => [l.symbol, l]));
    return {
      labels: chartSymbols,
      datasets: [
        { label: "Buy kitta", data: chartSymbols.map((s) => bySym.get(s)?.buyQty ?? 0), backgroundColor: "#22c55e" },
        { label: "Sell kitta", data: chartSymbols.map((s) => bySym.get(s)?.sellQty ?? 0), backgroundColor: "#ef4444" },
      ],
    };
  }, [chartSymbols, lines]);

  const totals = useMemo(() => {
    return lines.reduce(
      (a, l) => {
        a.buyQty += l.buyQty; a.sellQty += l.sellQty;
        a.buyAmt += l.buyAmt; a.sellAmt += l.sellAmt;
        if (l.move === "BUY") a.buyStocks++;
        else if (l.move === "SELL") a.sellStocks++;
        else a.holdStocks++;
        return a;
      },
      { buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0, buyStocks: 0, sellStocks: 0, holdStocks: 0 },
    );
  }, [lines]);

  // Full table sorted by gross activity
  const tableRows = useMemo(
    () => [...lines].sort((a, b) => (b.buyQty + b.sellQty) - (a.buyQty + a.sellQty)),
    [lines],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
        <span className="ml-3 text-xs text-muted">Loading stock detail for broker {brokerCode}...</span>
      </div>
    );
  }

  if (error || !resp) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-center text-xs text-muted">
        {error ? `Error: ${error}` : "No floorsheet data."}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-center text-xs text-muted">
        Broker {brokerCode} ko floorsheet activity chaina ({resp.date}).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-foreground">
          Broker {brokerCode}{brokerName ? ` · ${brokerName}` : ""} — kun stock kati kitta uthayo
        </h4>
        <span className="text-[10px] text-muted">{lines.length} stocks · {resp.date}</span>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <div className="rounded-lg border border-border bg-surface p-2">
          <div className="text-[9px] uppercase tracking-wider text-muted">Buy kitta</div>
          <div className="text-xs font-bold tabular-nums text-up">{fmt(totals.buyQty)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-2">
          <div className="text-[9px] uppercase tracking-wider text-muted">Sell kitta</div>
          <div className="text-xs font-bold tabular-nums text-down">{fmt(totals.sellQty)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-2">
          <div className="text-[9px] uppercase tracking-wider text-muted">Net kitta</div>
          <div className={`text-xs font-bold tabular-nums ${totals.buyQty - totals.sellQty >= 0 ? "text-up" : "text-down"}`}>
            {totals.buyQty - totals.sellQty >= 0 ? "+" : ""}{fmt(totals.buyQty - totals.sellQty)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-2">
          <div className="text-[9px] uppercase tracking-wider text-up">Buy stocks</div>
          <div className="text-xs font-bold tabular-nums text-foreground">{totals.buyStocks}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-2">
          <div className="text-[9px] uppercase tracking-wider text-down">Sell stocks</div>
          <div className="text-xs font-bold tabular-nums text-foreground">{totals.sellStocks}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-2">
          <div className="text-[9px] uppercase tracking-wider text-amber-500">Hold stocks</div>
          <div className="text-xs font-bold tabular-nums text-foreground">{totals.holdStocks}</div>
        </div>
      </div>

      {/* Bar chart: top 5 buy + top 5 sell stocks */}
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-2 text-[10px] font-semibold text-muted">Top 5 buy &amp; top 5 sell stocks (kitta)</div>
        <div className="h-[280px]">
          <Bar
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { labels: { color: "#94a3b8", boxWidth: 12, font: { size: 10 } } } },
              scales: {
                x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.1)" } },
                y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "rgba(148,163,184,0.1)" } },
              },
            }}
          />
        </div>
      </div>

      {/* Full table: buy / sell / holding per stock */}
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-2 text-[10px] font-semibold text-muted">All stocks — Buy / Sell / Hold ({tableRows.length})</div>
        <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted">
                <th className="px-2 py-1.5 text-left">Stock</th>
                <th className="px-2 py-1.5 text-right">Buy Kitta</th>
                <th className="px-2 py-1.5 text-right">Sell Kitta</th>
                <th className="px-2 py-1.5 text-right">Net Kitta</th>
                <th className="px-2 py-1.5 text-right">Net Amount</th>
                <th className="px-2 py-1.5 text-center">Move</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((l) => {
                const moveCls = l.move === "BUY" ? "text-up" : l.move === "SELL" ? "text-down" : "text-amber-500";
                return (
                  <tr key={l.symbol} className="border-b border-border/50 text-xs hover:bg-surface-2/50">
                    <td className="px-2 py-1.5 font-semibold text-foreground">{l.symbol}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-up">{fmt(l.buyQty)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-down">{fmt(l.sellQty)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${l.netQty >= 0 ? "text-up" : "text-down"}`}>
                      {l.netQty >= 0 ? "+" : ""}{fmt(l.netQty)}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${l.netAmt >= 0 ? "text-up" : "text-down"}`}>
                      {l.netAmt >= 0 ? "+" : ""}{compact(l.netAmt)}
                    </td>
                    <td className={`px-2 py-1.5 text-center font-bold ${moveCls}`}>{l.move}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
