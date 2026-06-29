"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { INDICATOR_REGISTRY } from "@/lib/algo/indicator-registry";
import type { ConditionNode } from "@/lib/algo/rule-engine";
import type { AlgoStrategy, BacktestResult } from "@/lib/algo/types";

/* ─── Types ─── */
type View = "list" | "builder" | "backtest";

interface StrategyForm {
  name: string;
  universe: string;
  custom_symbol_list: string;
  entry_rule: ConditionNode;
  exit_rule: ConditionNode;
  stop_loss_pct: string;
  take_profit_pct: string;
  max_hold_days: string;
  position_size_pct: string;
  max_concurrent_positions: string;
}

/* ─── Helpers ─── */
const defaultRule: ConditionNode = { type: "custom_threshold", indicator: "rsi_14", field: "raw_value", operator: "<", value: 30 };

const emptyForm: StrategyForm = {
  name: "", universe: "all_listed", custom_symbol_list: "",
  entry_rule: defaultRule, exit_rule: defaultRule,
  stop_loss_pct: "", take_profit_pct: "", max_hold_days: "",
  position_size_pct: "10", max_concurrent_positions: "5",
};

/* ─── Demo Badge ─── */
const DEMO_BADGE = () => (
  <span className="rounded border border-[#d4af37] px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wider text-[#d4af37] ml-2">
    DEMO
  </span>
);

/* ─── Condition Renderer ─── */
function ConditionRow({ node, onChange, onDelete, depth = 0 }: {
  node: ConditionNode; onChange: (n: ConditionNode) => void; onDelete?: () => void; depth?: number;
}) {
  const isGroup = "logic" in node;

  if (isGroup) {
    const group = node as { logic: "AND" | "OR"; conditions: ConditionNode[] };
    return (
      <div className="border border-[#2a2e39] rounded p-2 mb-1" style={{ marginLeft: depth * 12 }}>
        <div className="flex items-center gap-1 mb-1">
          <select value={group.logic} onChange={(e) => onChange({ ...group, logic: e.target.value as "AND" | "OR" })}
            className="rounded border border-[#2a2e39] bg-[#0b0f19] px-1 py-0.5 text-[10px] text-white outline-none">
            <option value="AND">AND</option>
            <option value="OR">OR</option>
          </select>
          <span className="text-[10px] text-[#787b86]">group</span>
          {depth < 2 && (
            <button onClick={() => { group.conditions.push({ logic: "AND", conditions: [{ ...defaultRule }] }); onChange({ ...group, conditions: [...group.conditions] }); }}
              className="ml-auto rounded bg-[#2962ff] px-1.5 py-0.5 text-[9px] text-white hover:bg-[#1e4db8]">
              + Group
            </button>
          )}
          <button onClick={() => { group.conditions.push({ ...defaultRule }); onChange({ ...group, conditions: [...group.conditions] }); }}
            className="rounded bg-[#26a69a] px-1.5 py-0.5 text-[9px] text-white hover:bg-[#00897b]">
            + Condition
          </button>
          {onDelete && (
            <button onClick={onDelete} className="rounded bg-[#ef5350] px-1.5 py-0.5 text-[9px] text-white hover:bg-[#c62828]">×</button>
          )}
        </div>
        {group.conditions.map((c, i) => (
          <ConditionRow key={i} node={c} depth={depth + 1}
            onChange={(updated) => { group.conditions[i] = updated; onChange({ ...group, conditions: [...group.conditions] }); }}
            onDelete={group.conditions.length > 1 ? () => { group.conditions.splice(i, 1); onChange({ ...group, conditions: [...group.conditions] }); } : undefined}
          />
        ))}
      </div>
    );
  }

  const atom = node as any;
  const isDefault = atom.type === "default_signal";

  return (
    <div className="flex items-center gap-1 py-0.5" style={{ marginLeft: depth * 12 }}>
      <select value={atom.type} onChange={(e) => onChange({ ...atom, type: e.target.value })}
        className="rounded border border-[#2a2e39] bg-[#0b0f19] px-1 py-0.5 text-[10px] text-white outline-none">
        <option value="custom_threshold">Custom Threshold</option>
        <option value="default_signal">Default Signal</option>
      </select>
      <select value={atom.indicator} onChange={(e) => onChange({ ...atom, indicator: e.target.value })}
        className="rounded border border-[#2a2e39] bg-[#0b0f19] px-1 py-0.5 text-[10px] text-white outline-none max-w-[140px]">
        {INDICATOR_REGISTRY.map((ind) => (
          <option key={ind.key} value={ind.key}>{ind.displayName}</option>
        ))}
      </select>
      {isDefault ? (
        <select value={atom.equals} onChange={(e) => onChange({ ...atom, equals: e.target.value })}
          className="rounded border border-[#2a2e39] bg-[#0b0f19] px-1 py-0.5 text-[10px] text-white outline-none">
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      ) : (
        <>
          <select value={atom.field} onChange={(e) => onChange({ ...atom, field: e.target.value })}
            className="rounded border border-[#2a2e39] bg-[#0b0f19] px-1 py-0.5 text-[10px] text-white outline-none">
            <option value="raw_value">Value</option>
            <option value="signal">Signal</option>
          </select>
          <select value={atom.operator} onChange={(e) => onChange({ ...atom, operator: e.target.value })}
            className="rounded border border-[#2a2e39] bg-[#0b0f19] px-1 py-0.5 text-[10px] text-white outline-none">
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
            <option value="==">==</option>
            <option value="crosses_above">Crosses Above</option>
            <option value="crosses_below">Crosses Below</option>
          </select>
          <input type="number" value={atom.value} onChange={(e) => onChange({ ...atom, value: Number(e.target.value) })}
            className="w-16 rounded border border-[#2a2e39] bg-[#0b0f19] px-1 py-0.5 text-[10px] text-white outline-none text-right font-mono" />
        </>
      )}
      {onDelete && (
        <button onClick={onDelete} className="rounded bg-[#ef5350] px-1.5 py-0.5 text-[9px] text-white hover:bg-[#c62828]">×</button>
      )}
    </div>
  );
}

/* ─── Rule Editor ─── */
function RuleEditor({ rule, onChange, label }: { rule: ConditionNode; onChange: (r: ConditionNode) => void; label: string }) {
  return (
    <div className="rounded-lg border border-[#1e2538] bg-[#131722] p-3">
      <div className="text-[11px] font-semibold text-white mb-2">{label}</div>
      <ConditionRow node={rule} depth={0}
        onChange={onChange}
        onDelete={undefined}
      />
    </div>
  );
}

/* ─── Backtest Report ─── */
function BacktestReport({ result, onBack }: { result: BacktestResult; onBack: () => void }) {
  return (
    <div className="p-4 space-y-4">
      <button onClick={onBack} className="text-xs text-[#787b86] hover:text-white">← Back to Builder</button>
      <h2 className="text-base font-bold text-white">Backtest Report</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Return", value: `${result.totalReturnPct >= 0 ? "+" : ""}${result.totalReturnPct}%`, cls: result.totalReturnPct >= 0 ? "text-[#26a69a]" : "text-[#ef5350]" },
          { label: "Win Rate", value: `${result.winRate}%`, cls: "text-white" },
          { label: "Trades", value: String(result.tradeCount), cls: "text-white" },
          { label: "Max Drawdown", value: `${result.maxDrawdown}%`, cls: "text-[#ef5350]" },
          { label: "Avg Hold", value: `${result.avgHoldingPeriod}d`, cls: "text-white" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-[#1e2538] bg-[#131722] p-3 text-center">
            <div className="text-[10px] text-[#787b86]">{s.label}</div>
            <div className={`text-sm font-bold mt-0.5 ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {result.equityCurve.length > 1 && (
        <div className="rounded-lg border border-[#1e2538] bg-[#131722] p-3">
          <div className="text-[11px] font-semibold text-white mb-2">Equity Curve</div>
          <div className="h-32 flex items-end gap-px">
            {(() => {
              const vals = result.equityCurve.map((e) => e.equity);
              const min = Math.min(...vals);
              const max = Math.max(...vals);
              const range = max - min || 1;
              return result.equityCurve.map((pt, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end"
                  title={`${pt.date}: Rs. ${pt.equity.toLocaleString()}`}>
                  <div className="w-full transition-all"
                    style={{ height: `${((pt.equity - min) / range) * 100}%`, background: pt.equity >= vals[0] ? "#26a69a" : "#ef5350", minHeight: 1 }} />
                </div>
              ));
            })()}
          </div>
        </div>
      )}
      {result.trades.length > 0 && (
        <div className="rounded-lg border border-[#1e2538] bg-[#131722] overflow-hidden">
          <div className="text-[11px] font-semibold text-white p-3 border-b border-[#1e2538]">Recent Trades</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead><tr className="text-[#787b86] border-b border-[#1e2538]">
                <th className="px-2 py-1 text-left">Symbol</th>
                <th className="px-2 py-1 text-right">Entry</th>
                <th className="px-2 py-1 text-right">Exit</th>
                <th className="px-2 py-1 text-right">P&L %</th>
                <th className="px-2 py-1 text-left">Reason</th>
              </tr></thead>
              <tbody>
                {result.trades.slice(-20).map((t, i) => (
                  <tr key={i} className="border-b border-[#1e2538] hover:bg-[#1e2538]">
                    <td className="px-2 py-1 font-medium text-white">{t.symbol}</td>
                    <td className="px-2 py-1 text-right">{t.entryPrice?.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{t.exitPrice?.toFixed(2) ?? "—"}</td>
                    <td className={`px-2 py-1 text-right font-bold ${t.pnlPct >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>{t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%</td>
                    <td className="px-2 py-1">{t.exitReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="text-[9px] text-[#f57c00] bg-[#f57c0011] border border-[#f57c00] rounded p-2 leading-relaxed">
        {result.disclaimer}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function AlgoPage() {
  const [view, setView] = useState<View>("list");
  const [strategies, setStrategies] = useState<AlgoStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<StrategyForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/algo/strategies");
      const d = await r.json();
      setStrategies(Array.isArray(d) ? d : []);
    } catch { setStrategies([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name) { setError("Name is required"); return; }
    setSaving(true); setError(null);
    const body: Record<string, any> = {
      name: form.name,
      universe: form.universe,
      entry_rule: form.entry_rule,
      exit_rule: form.exit_rule,
      position_size_pct: Number(form.position_size_pct),
      max_concurrent_positions: Number(form.max_concurrent_positions),
    };
    if (form.universe === "custom_list") body.custom_symbol_list = form.custom_symbol_list.split(",").map((s) => s.trim()).filter(Boolean);
    if (form.stop_loss_pct) body.stop_loss_pct = Number(form.stop_loss_pct);
    if (form.take_profit_pct) body.take_profit_pct = Number(form.take_profit_pct);
    if (form.max_hold_days) body.max_hold_days = Number(form.max_hold_days);

    try {
      const url = editingId ? `/api/algo/strategies/${editingId}` : "/api/algo/strategies";
      const r = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Save failed"); }
      await load();
      setView("list");
      setEditingId(null);
      setForm({ ...emptyForm });
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleEdit = (s: AlgoStrategy) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      universe: s.universe,
      custom_symbol_list: s.custom_symbol_list?.join(", ") || "",
      entry_rule: s.entry_rule,
      exit_rule: s.exit_rule,
      stop_loss_pct: s.stop_loss_pct?.toString() || "",
      take_profit_pct: s.take_profit_pct?.toString() || "",
      max_hold_days: s.max_hold_days?.toString() || "",
      position_size_pct: s.position_size_pct.toString(),
      max_concurrent_positions: s.max_concurrent_positions.toString(),
    });
    setView("builder");
    setBacktestResult(null);
  };

  const handleNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setView("builder");
    setBacktestResult(null);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this strategy?")) return;
    const r = await fetch(`/api/algo/strategies/${id}`, { method: "DELETE" });
    if (r.ok) load();
    else { const d = await r.json(); setError(d.error); }
  };

  const handleBacktest = async (id: number) => {
    setBacktesting(true);
    setError(null);
    try {
      const r = await fetch(`/api/algo/strategies/${id}/backtest`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBacktestResult(d);
      setView("backtest");
      await load();
    } catch (e: any) { setError(e.message); }
    setBacktesting(false);
  };

  const handleActivate = async (id: number) => {
    const r = await fetch(`/api/algo/strategies/${id}/activate`, { method: "POST" });
    if (r.ok) load();
    else { const d = await r.json(); setError(d.error || "Activation failed"); }
  };

  const handleDeactivate = async (id: number) => {
    await fetch(`/api/algo/strategies/${id}/deactivate`, { method: "POST" });
    load();
  };

  /* ── View: Strategy List ── */
  if (view === "list") return (
    <div className="min-h-screen bg-[#0b0f19] text-[#d1d4dc]">
      <div className="border-b border-[#1e2538] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white">Strategy Builder</h1>
            <DEMO_BADGE />
          </div>
          <p className="text-xs text-[#787b86]">Build, backtest and run algorithmic trading strategies</p>
        </div>
        <button onClick={handleNew}
          className="rounded bg-[#2962ff] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1e4db8]">
          + New Strategy
        </button>
      </div>
      <div className="p-4">
        {error && <div className="mb-3 rounded bg-[#ef535011] border border-[#ef5350] p-2 text-xs text-[#ef5350]">{error}</div>}
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2962ff] border-t-transparent" /></div>
        ) : strategies.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-[#787b86]">
            <p className="text-sm">No strategies yet</p>
            <p className="text-xs mt-1">Create your first algorithmic trading strategy</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {strategies.map((s) => (
              <div key={s.id} className="rounded-lg border border-[#1e2538] bg-[#131722] p-4 hover:border-[#2a2e39] transition">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold text-white ${s.is_active ? "bg-[#26a69a]" : s.last_backtested_at ? "bg-[#7b1fa2]" : "bg-[#546e7a]"}`}>
                        {s.is_active ? "Active" : s.last_backtested_at ? "Backtested" : "Draft"}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{s.name}</h3>
                    <span className="text-[10px] text-[#787b86]">{s.universe}</span>
                  </div>
                </div>
                <div className="flex gap-1 mt-3">
                  <button onClick={() => handleEdit(s)}
                    className="rounded border border-[#2a2e39] px-2 py-1 text-[10px] text-white hover:bg-[#1e2538]">Edit</button>
                  <button onClick={() => handleBacktest(s.id)} disabled={backtesting}
                    className="rounded border border-[#2a2e39] px-2 py-1 text-[10px] text-white hover:bg-[#1e2538] disabled:opacity-40">
                    {backtesting ? "..." : "Backtest"}
                  </button>
                  {s.is_active ? (
                    <button onClick={() => handleDeactivate(s.id)}
                      className="rounded bg-[#f57c00] px-2 py-1 text-[10px] text-white hover:bg-[#e65100]">Deactivate</button>
                  ) : (
                    <button onClick={() => handleActivate(s.id)}
                      className="rounded bg-[#26a69a] px-2 py-1 text-[10px] text-white hover:bg-[#00897b] disabled:opacity-40">Activate</button>
                  )}
                  <button onClick={() => handleDelete(s.id)}
                    className="rounded bg-[#ef5350] px-2 py-1 text-[10px] text-white hover:bg-[#c62828] ml-auto">×</button>
                </div>
                {s.last_backtested_at && (
                  <div className="text-[9px] text-[#787b86] mt-2">
                    Backtested: {new Date(s.last_backtested_at * 1000).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ── View: Backtest Report ── */
  if (view === "backtest" && backtestResult) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-[#d1d4dc]">
        <div className="border-b border-[#1e2538] px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white">Backtest Results</h1>
            <DEMO_BADGE />
          </div>
        </div>
        <BacktestReport result={backtestResult} onBack={() => { setView("list"); setBacktestResult(null); }} />
      </div>
    );
  }

  /* ── View: Strategy Builder ── */
  return (
    <div className="min-h-screen bg-[#0b0f19] text-[#d1d4dc]">
      <div className="border-b border-[#1e2538] px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { setView("list"); setEditingId(null); setError(null); }} className="text-xs text-[#787b86] hover:text-white mr-1">←</button>
          <h1 className="text-lg font-bold text-white">{editingId ? "Edit Strategy" : "New Strategy"}</h1>
          <DEMO_BADGE />
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto space-y-4">
        {error && <div className="rounded bg-[#ef535011] border border-[#ef5350] p-2 text-xs text-[#ef5350]">{error}</div>}

        <div className="rounded-lg border border-[#1e2538] bg-[#131722] p-4">
          <div className="text-[11px] font-semibold text-white mb-3">Strategy Settings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Strategy" className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Universe</label>
              <select value={form.universe} onChange={(e) => setForm({ ...form, universe: e.target.value })}
                className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]">
                <option value="all_listed">All Listed</option>
                <option value="custom_list">Custom List</option>
              </select>
            </div>
            {form.universe === "custom_list" && (
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Symbols (comma-separated)</label>
                <input type="text" value={form.custom_symbol_list} onChange={(e) => setForm({ ...form, custom_symbol_list: e.target.value })}
                  placeholder="NABIL, NICA, SCB, NTC" className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]" />
              </div>
            )}
            <div>
              <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Position Size (%)</label>
              <input type="number" value={form.position_size_pct} onChange={(e) => setForm({ ...form, position_size_pct: e.target.value })}
                className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Max Concurrent Positions</label>
              <input type="number" value={form.max_concurrent_positions} onChange={(e) => setForm({ ...form, max_concurrent_positions: e.target.value })}
                className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Stop Loss (%)</label>
              <input type="number" value={form.stop_loss_pct} onChange={(e) => setForm({ ...form, stop_loss_pct: e.target.value })}
                placeholder="Optional" className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Take Profit (%)</label>
              <input type="number" value={form.take_profit_pct} onChange={(e) => setForm({ ...form, take_profit_pct: e.target.value })}
                placeholder="Optional" className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#787b86] mb-1">Max Hold Days</label>
              <input type="number" value={form.max_hold_days} onChange={(e) => setForm({ ...form, max_hold_days: e.target.value })}
                placeholder="Optional" className="w-full rounded border border-[#2a2e39] bg-[#0b0f19] px-2 py-1.5 text-xs text-white outline-none focus:border-[#2962ff]" />
            </div>
          </div>
        </div>

        <RuleEditor rule={form.entry_rule} onChange={(r) => setForm({ ...form, entry_rule: r })} label="Entry Rule" />
        <RuleEditor rule={form.exit_rule} onChange={(r) => setForm({ ...form, exit_rule: r })} label="Exit Rule" />

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="rounded bg-[#2962ff] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e4db8] disabled:opacity-40">
            {saving ? "Saving..." : editingId ? "Update Strategy" : "Create Strategy"}
          </button>
          <button onClick={() => { setView("list"); setEditingId(null); setError(null); }}
            className="rounded border border-[#2a2e39] px-4 py-2 text-xs text-white hover:bg-[#1e2538]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
