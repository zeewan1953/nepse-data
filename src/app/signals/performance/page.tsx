"use client";
import { useState, useEffect, useCallback } from "react";

type PerfRow = {
  id: number;
  signal_name: string;
  horizon_days: number;
  window_start: string;
  window_end: string;
  hit_rate: number;
  avg_top_quintile_return: number;
  avg_baseline_return: number;
  sample_size: number;
  computed_at: number;
};

type HistoryRow = PerfRow;

const SIGNAL_LABELS: Record<string, string> = {
  momentum_score: "Momentum Score",
  smart_money_score: "Smart Money Score",
  volume_zscore: "Volume Z-Score",
  cmf: "Chaikin Money Flow",
  mfi: "Money Flow Index",
  order_flow_est: "Order Flow (Tick-Rule)",
  divergence_flag: "Divergence Flag",
  net_broker_flow: "Net Broker Flow",
};

const HORIZONS = [1, 3, 5, 10, 20];

function SignalCard({ perf, history }: { perf: PerfRow; history: HistoryRow[] }) {
  const n = perf.sample_size;
  const lowConfidence = n < 30;
  const hitRatePct = (perf.hit_rate * 100).toFixed(1);
  const topQuintilePct = (perf.avg_top_quintile_return * 100).toFixed(2);
  const baselinePct = (perf.avg_baseline_return * 100).toFixed(2);
  const outperformance = ((perf.avg_top_quintile_return - perf.avg_baseline_return) * 100).toFixed(2);
  const isPositive = perf.avg_top_quintile_return > perf.avg_baseline_return;

  // Sparkline data: hit_rate over time
  const sparklineData = history.slice().reverse();
  const maxHit = Math.max(...sparklineData.map((h) => h.hit_rate), 0.5);
  const sparklinePath = sparklineData
    .map((h, i) => {
      const x = (i / Math.max(sparklineData.length - 1, 1)) * 100;
      const y = 100 - (h.hit_rate / maxHit) * 80;
      return `${i === 0 ? "M" : "L"}${x.toFixed(0)},${y.toFixed(0)}`;
    })
    .join(" ");

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">{SIGNAL_LABELS[perf.signal_name] || perf.signal_name}</h3>
          <p className="text-[10px] text-muted">{perf.horizon_days}d horizon</p>
        </div>
        {lowConfidence && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500 whitespace-nowrap">
            Limited sample
          </span>
        )}
      </div>

      {/* Sparkline */}
      {sparklineData.length > 1 && (
        <svg viewBox="0 0 100 100" className="w-full h-10" preserveAspectRatio="none">
          <path d={sparklinePath} fill="none" stroke={isPositive ? "#00cc44" : "#e60000"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-muted">Hit Rate</div>
          <div className={`text-base font-black tabular-nums ${lowConfidence ? "text-gray-400" : "text-foreground"}`}>
            {hitRatePct}%
          </div>
        </div>
        <div>
          <div className="text-[9px] text-muted">Top Quintile</div>
          <div className={`text-base font-black tabular-nums ${lowConfidence ? "text-gray-400" : perf.avg_top_quintile_return >= 0 ? "text-up" : "text-down"}`}>
            {topQuintilePct}%
          </div>
        </div>
        <div>
          <div className="text-[9px] text-muted">Baseline Avg</div>
          <div className="text-sm font-semibold tabular-nums text-gray-500">{baselinePct}%</div>
        </div>
        <div>
          <div className="text-[9px] text-muted">Outperformance</div>
          <div className={`text-sm font-semibold tabular-nums ${outperformance.startsWith("-") ? "text-down" : "text-up"}`}>
            {outperformance.startsWith("-") ? "" : "+"}{outperformance}pp
          </div>
        </div>
      </div>

      {/* Sample size */}
      <div className="text-[9px] text-muted">
        n = {n.toLocaleString()}{lowConfidence ? " (low confidence)" : ""}
      </div>
    </div>
  );
}

export default function SignalPerformancePage() {
  const [perfData, setPerfData] = useState<PerfRow[]>([]);
  const [historyData, setHistoryData] = useState<Record<string, HistoryRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState(5);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/signals/performance?horizon=${horizon}`);
      if (res.ok) {
        const json = await res.json();
        setPerfData(json.performance || []);
      }

      // Fetch history for each signal
      const histMap: Record<string, HistoryRow[]> = {};
      for (const sn of Object.keys(SIGNAL_LABELS)) {
        const hRes = await fetch(`/api/signals/performance/history?signal=${sn}&horizon=${horizon}`);
        if (hRes.ok) {
          const hJson = await hRes.json();
          histMap[sn] = hJson.history || [];
        }
      }
      setHistoryData(histMap);
    } catch {} finally {
      setLoading(false);
    }
  }, [horizon]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-foreground">Signal Performance</h1>
        <p className="text-xs text-muted mt-1">
          Historical backtest: how each signal would have performed over the past 6 months
        </p>
      </div>

      {/* Horizon selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-muted">Horizon:</span>
        <div className="flex gap-1">
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                horizon === h ? "text-white" : "text-foreground hover:bg-surface-2"
              }`}
              style={horizon === h ? { background: "#0F6E56" } : { background: "transparent" }}
            >
              {h}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : perfData.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted">
          No performance data yet. The daily snapshot and backtest jobs need to run first.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {perfData.map((p) => (
            <SignalCard key={`${p.signal_name}-${p.horizon_days}`} perf={p} history={historyData[p.signal_name] || []} />
          ))}
        </div>
      )}

      {/* Mandatory disclaimer */}
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        ⚠️ Historical signal performance is statistical, not predictive. Past patterns do not guarantee future results.
      </div>
    </div>
  );
}
