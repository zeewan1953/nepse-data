"use client";
import { useState, useEffect } from "react";

interface AlertConfig {
  alert_type: "price" | "signal" | "broker_flow";
  symbol?: string;
  broker_id?: string;
  signal_name?: string;
  condition: "above" | "below" | "crosses_up" | "crosses_down";
  threshold: number;
}

interface AlertConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefillSymbol?: string;
}

export default function AlertConfigModal({ isOpen, onClose, prefillSymbol }: AlertConfigModalProps) {
  const [config, setConfig] = useState<AlertConfig>({
    alert_type: "price",
    condition: "above",
    threshold: 0,
  });
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch existing alerts
  useEffect(() => {
    if (isOpen) {
      fetchAlerts();
      if (prefillSymbol) {
        setConfig(prev => ({ ...prev, symbol: prefillSymbol }));
      }
    }
  }, [isOpen, prefillSymbol]);

  const fetchAlerts = async () => {
    try {
      const response = await fetch("/api/alerts", {
        headers: { "x-user-id": "anonymous" },
      });
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts);
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
    }
  };

  const handleSave = async () => {
    if (!config.threshold || config.threshold <= 0) {
      alert("Please enter a valid threshold value");
      return;
    }

    try {
      setIsSaving(true);
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "anonymous",
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        alert("Alert created successfully!");
        fetchAlerts();
        // Reset form
        setConfig({
          alert_type: "price",
          condition: "above",
          threshold: 0,
          symbol: prefillSymbol,
        });
      } else {
        const error = await response.json();
        alert(error.error || "Failed to create alert");
      }
    } catch (error) {
      console.error("Failed to save alert:", error);
      alert("Failed to save alert");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this alert?")) return;

    try {
      const response = await fetch(`/api/alerts/${id}`, {
        method: "DELETE",
        headers: { "x-user-id": "anonymous" },
      });

      if (response.ok) {
        fetchAlerts();
      }
    } catch (error) {
      console.error("Failed to delete alert:", error);
    }
  };

  const handleToggleActive = async (id: number, is_active: boolean) => {
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "anonymous",
        },
        body: JSON.stringify({ is_active: !is_active }),
      });
      fetchAlerts();
    } catch (error) {
      console.error("Failed to toggle alert:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/20 shadow-2xl"
        style={{
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 border-b border-border bg-surface px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">🔔 Alert Configuration</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Create New Alert */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Create New Alert</h3>
            
            {/* Alert Type */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted mb-2">Alert Type</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "price", label: "💰 Price", desc: "Stock price threshold" },
                  { value: "signal", label: "🎯 Signal", desc: "Technical indicators" },
                  { value: "broker_flow", label: "💵 Broker Flow", desc: "Broker buying/selling" },
                ].map(type => (
                  <button
                    key={type.value}
                    onClick={() => setConfig(prev => ({ ...prev, alert_type: type.value as any }))}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      config.alert_type === type.value
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-border hover:border-blue-300"
                    }`}
                  >
                    <div className="text-sm font-semibold">{type.label}</div>
                    <div className="text-[10px] text-muted">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Symbol Input (for price & signal alerts) */}
            {(config.alert_type === "price" || config.alert_type === "signal") && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-muted mb-2">Stock Symbol</label>
                <input
                  type="text"
                  value={config.symbol || ""}
                  onChange={(e) => setConfig(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                  placeholder="e.g., HDL, NABIL"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Broker ID (for broker_flow alerts) */}
            {config.alert_type === "broker_flow" && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-muted mb-2">Broker ID</label>
                <input
                  type="text"
                  value={config.broker_id || ""}
                  onChange={(e) => setConfig(prev => ({ ...prev, broker_id: e.target.value }))}
                  placeholder="e.g., 58 (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Signal Name (for signal alerts) */}
            {config.alert_type === "signal" && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-muted mb-2">Signal Name</label>
                <select
                  value={config.signal_name || ""}
                  onChange={(e) => setConfig(prev => ({ ...prev, signal_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select signal...</option>
                  <option value="momentum_score">Momentum Score</option>
                  <option value="smart_money_score">Smart Money Score</option>
                  <option value="volume_zscore">Volume Z-Score</option>
                  <option value="cmf">CMF</option>
                  <option value="mfi">MFI</option>
                  <option value="divergence_flag">Divergence Flag</option>
                </select>
              </div>
            )}

            {/* Condition */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted mb-2">Condition</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "above", label: "Above" },
                  { value: "below", label: "Below" },
                  { value: "crosses_up", label: "Crosses Up" },
                  { value: "crosses_down", label: "Crosses Down" },
                ].map(cond => (
                  <button
                    key={cond.value}
                    onClick={() => setConfig(prev => ({ ...prev, condition: cond.value as any }))}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      config.condition === cond.value
                        ? "border-blue-500 bg-blue-500/10 text-blue-600"
                        : "border-border hover:border-blue-300"
                    }`}
                  >
                    {cond.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Threshold */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted mb-2">Threshold Value</label>
              <input
                type="number"
                step="0.01"
                value={config.threshold || ""}
                onChange={(e) => setConfig(prev => ({ ...prev, threshold: parseFloat(e.target.value) }))}
                placeholder="Enter value..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving || !config.threshold}
              className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Saving..." : "Create Alert"}
            </button>
          </div>

          {/* Existing Alerts */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Your Active Alerts ({alerts.length})</h3>
            
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-sm">No alerts configured yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {alert.alert_type === "price" ? "💰" : alert.alert_type === "signal" ? "🎯" : "💵"}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {alert.symbol || alert.broker_id || "Global"}
                        </span>
                        {alert.signal_name && (
                          <span className="text-[10px] text-muted">({alert.signal_name})</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted mt-1">
                        {alert.condition} {alert.threshold}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(alert.id, alert.is_active)}
                        className={`px-2 py-1 rounded text-[10px] font-medium ${
                          alert.is_active
                            ? "bg-green-500/10 text-green-600"
                            : "bg-gray-500/10 text-gray-600"
                        }`}
                      >
                        {alert.is_active ? "Active" : "Paused"}
                      </button>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="px-2 py-1 rounded text-[10px] font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
