"use client";
import { useState, useEffect, useCallback } from "react";
import { getUserId } from "@/lib/user-id";
import AlertConfigModal from "@/components/AlertConfigModal";

type AlertItem = {
  id: number;
  alert_type: string;
  symbol: string | null;
  broker_id: string | null;
  signal_name: string | null;
  condition: string;
  threshold: number;
  is_active: number;
  created_at: number;
  last_triggered_at: number | null;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { headers: { "x-user-id": getUserId() } });
      if (res.ok) {
        const json = await res.json();
        setAlerts(json.alerts || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const toggleActive = async (id: number, active: boolean) => {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-user-id": getUserId() },
      body: JSON.stringify({ is_active: active ? 1 : 0 }),
    });
    fetchAlerts();
  };

  const deleteAlert = async (id: number) => {
    if (!confirm("Delete this alert?")) return;
    await fetch(`/api/alerts/${id}`, {
      method: "DELETE",
      headers: { "x-user-id": getUserId() },
    });
    fetchAlerts();
  };

  const typeLabel = (t: string) =>
    t === "price" ? "💰 Price" : t === "signal" ? "📊 Signal" : "🏦 Broker";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-foreground">Manage Alerts</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90"
          style={{ background: "#0F6E56" }}
        >
          + New Alert
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-center">
          <p className="text-sm text-muted">No alerts yet — set one from any stock page</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span>{typeLabel(a.alert_type)}</span>
                  {a.symbol && <span className="text-primary">{a.symbol}</span>}
                  {a.broker_id && <span>Broker {a.broker_id}</span>}
                  {a.signal_name && <span className="text-[10px] text-muted">{a.signal_name.replace(/_/g, " ")}</span>}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {a.condition.replace(/_/g, " ")} {a.threshold}
                  {a.last_triggered_at && (
                    <span className="ml-2 text-up"> · Last fired: {new Date(a.last_triggered_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  onClick={() => toggleActive(a.id, !a.is_active)}
                  className={`relative h-5 w-9 rounded-full transition ${a.is_active ? "" : "opacity-50"}`}
                  style={{ background: a.is_active ? "#0F6E56" : "#ccc" }}
                >
                  <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" style={{ left: a.is_active ? 18 : 2 }} />
                </button>
                <button onClick={() => deleteAlert(a.id)} className="text-xs text-down hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertConfigModal open={showCreate} onClose={() => setShowCreate(false)} onSaved={fetchAlerts} />
    </div>
  );
}
