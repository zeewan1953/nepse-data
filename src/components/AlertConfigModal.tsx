"use client";
import { useState } from "react";
import { getUserId } from "@/lib/user-id";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Pre-fill from stock page context */
  defaultSymbol?: string;
};

const SIGNAL_OPTIONS = [
  { value: "momentum_score", label: "Momentum Score (0-100)" },
  { value: "smart_money_score", label: "Smart Money Score" },
  { value: "volume_zscore", label: "Volume Z-Score" },
  { value: "cmf", label: "Chaikin Money Flow (-1 to +1)" },
  { value: "mfi", label: "Money Flow Index (0-100)" },
  { value: "divergence_flag", label: "Divergence Flag" },
];

export default function AlertConfigModal({ open, onClose, onSaved, defaultSymbol }: Props) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<"price" | "signal" | "broker_flow">("price");
  const [symbol, setSymbol] = useState(defaultSymbol || "");
  const [brokerId, setBrokerId] = useState("");
  const [signalName, setSignalName] = useState("momentum_score");
  const [condition, setCondition] = useState("above");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const reset = () => {
    setStep(0);
    setType("price");
    setSymbol(defaultSymbol || "");
    setBrokerId("");
    setSignalName("momentum_score");
    setCondition("above");
    setThreshold("");
    setError("");
  };

  const handleSave = async () => {
    if (!threshold || isNaN(Number(threshold))) {
      setError("Enter a valid threshold number");
      return;
    }
    if (type === "broker_flow" && !brokerId) {
      setError("Enter a broker ID");
      return;
    }
    if ((type === "price" || type === "signal") && !symbol) {
      setError("Enter a stock symbol");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": getUserId() },
        body: JSON.stringify({
          alert_type: type,
          symbol: symbol.toUpperCase().trim() || null,
          broker_id: brokerId.trim() || null,
          signal_name: type === "signal" ? signalName : null,
          condition,
          threshold: Number(threshold),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "Failed to save");
      }
      reset();
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative mx-3 w-full max-w-[420px] rounded-2xl border border-border bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-foreground mb-4">Create Alert</h2>

        {step === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted mb-2">Select alert type:</p>
            {(["price", "signal", "broker_flow"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setStep(1); }}
                className="w-full rounded-lg border border-border px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-surface-2 transition"
              >
                {t === "price" ? "💰 Price Alert" : t === "signal" ? "📊 Signal Trigger" : "🏦 Broker Net-Flow"}
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {type === "price" && (
              <div>
                <label className="text-xs font-semibold text-muted">Stock Symbol</label>
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. NABIL"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mt-1"
                />
              </div>
            )}

            {type === "signal" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted">Stock Symbol</label>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g. NABIL"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted">Signal</label>
                  <select
                    value={signalName}
                    onChange={(e) => setSignalName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mt-1"
                  >
                    {SIGNAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {type === "broker_flow" && (
              <div>
                <label className="text-xs font-semibold text-muted">Broker ID</label>
                <input
                  value={brokerId}
                  onChange={(e) => setBrokerId(e.target.value)}
                  placeholder="e.g. 58"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mt-1"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mt-1"
              >
                <option value="above">Above</option>
                <option value="below">Below</option>
                <option value="crosses_up">Crosses Above</option>
                <option value="crosses_down">Crosses Below</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted">Threshold</label>
              <input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                type="number"
                step="any"
                placeholder={type === "price" ? "e.g. 1000" : type === "signal" ? "e.g. 80" : "e.g. 5000000"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mt-1"
              />
            </div>

            {error && <p className="text-xs text-down">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(0)} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-2 transition">
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg px-3 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: "#0F6E56" }}
              >
                {saving ? "Saving..." : "Save Alert"}
              </button>
            </div>
          </div>
        )}

        <button onClick={() => { reset(); onClose(); }} className="absolute right-3 top-3 text-muted hover:text-foreground text-lg leading-none">&times;</button>
      </div>
    </div>
  );
}
