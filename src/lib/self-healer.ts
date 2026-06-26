import { db } from "@/lib/db";

// ─── Config Store ──────────────────────────────────────────────────────────
// persisted key-value config, tunable at runtime

type ConfigValue = string | number | boolean;

const CONFIG_TABLE = "healer_config";

async function ensureTable(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${CONFIG_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export async function getConfig(key: string, fallback: ConfigValue): Promise<ConfigValue> {
  try {
    await ensureTable();
    const r = await db.execute({ sql: `SELECT value FROM ${CONFIG_TABLE} WHERE key = ?`, args: [key] });
    if (r.rows.length > 0) {
      const raw = String(r.rows[0].value);
      if (typeof fallback === "number") return parseFloat(raw);
      if (typeof fallback === "boolean") return raw === "true";
      return raw;
    }
    return fallback;
  } catch { return fallback; }
}

export async function setConfig(key: string, value: ConfigValue): Promise<void> {
  try {
    await ensureTable();
    await db.execute({
      sql: `INSERT INTO ${CONFIG_TABLE} (key, value, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [key, String(value)],
    });
  } catch {}
}

// ─── Repair Issue ──────────────────────────────────────────────────────────

export type RepairAction = {
  type: "config_tune" | "cache_clear" | "circuit_reset" | "report_only";
  endpoint: string;
  detail: string;
  applied: boolean;
};

export type HealResult = {
  timestamp: string;
  actions: RepairAction[];
  summary: string;
};

// ─── Repair Strategies ─────────────────────────────────────────────────────

type RepairStrategy = {
  name: string;
  canFix: (endpoint: string, rule: string, detail: string) => boolean;
  apply: (endpoint: string, rule: string, detail: string) => Promise<RepairAction>;
};

// Strategy 1: Auto-tune latency threshold based on observed performance
const autoTuneLatency: RepairStrategy = {
  name: "auto-tune-latency",
  canFix: (_endpoint, rule, _detail) => rule === "latency_threshold",
  apply: async (endpoint, _rule, detail) => {
    // Extract observed latency from detail like "24277ms (threshold: 10000ms)"
    const msMatch = detail.match(/(\d+)ms/);
    if (!msMatch) return { type: "report_only", endpoint, detail: "Could not parse latency from: " + detail, applied: false };

    const observed = parseInt(msMatch[1]);
    const configKey = `latency_threshold:${endpoint}`;
    const current = await getConfig(configKey, 10000);
    const currentNum = typeof current === "number" ? current : parseInt(String(current));

    // Set threshold to max(current, observed * 1.3) — 30% headroom
    const newThreshold = Math.max(currentNum, Math.ceil(observed * 1.3));
    if (newThreshold > currentNum) {
      await setConfig(configKey, newThreshold);
      return {
        type: "config_tune",
        endpoint,
        detail: `Latency threshold tuned from ${currentNum}ms → ${newThreshold}ms (observed: ${observed}ms, +30% headroom)`,
        applied: true,
      };
    }
    return { type: "config_tune", endpoint, detail: `Threshold already adequate at ${currentNum}ms (observed: ${observed}ms)`, applied: false };
  },
};

// Strategy 2: Reset circuit breaker for endpoints that recovered
const resetBreaker: RepairStrategy = {
  name: "reset-breaker",
  canFix: (_endpoint, rule, _detail) => rule === "http_status" || rule === "fetch_failed",
  apply: async (endpoint, _rule, _detail) => {
    const { resetBreaker } = await import("@/lib/self-heal");
    resetBreaker(endpoint);
    return { type: "circuit_reset", endpoint, detail: `Circuit breaker reset for ${endpoint}`, applied: true };
  },
};

// Strategy 3: Clear broker_flow_cache for endpoints with stale data
const clearStaleCache: RepairStrategy = {
  name: "clear-stale-cache",
  canFix: (_endpoint, rule, _detail) => rule === "no_sample_source" || rule === "no_nested_sample",
  apply: async (endpoint, _rule, _detail) => {
    try {
      await db.execute("DELETE FROM broker_flow_cache WHERE date < date('now', '-7 days')");
      return { type: "cache_clear", endpoint, detail: "Cleared broker_flow_cache entries older than 7 days", applied: true };
    } catch {
      return { type: "cache_clear", endpoint, detail: "Failed to clear cache", applied: false };
    }
  },
};

const STRATEGIES: RepairStrategy[] = [autoTuneLatency, resetBreaker, clearStaleCache];

// ─── Healer ────────────────────────────────────────────────────────────────

export async function heal(results: Array<{ endpoint: string; valueSanity: Array<{ rule: string; passed: boolean; detail: string }> }>): Promise<HealResult> {
  const actions: RepairAction[] = [];

  for (const ep of results) {
    const failed = ep.valueSanity.filter((s) => !s.passed);
    for (const s of failed) {
      for (const strategy of STRATEGIES) {
        if (strategy.canFix(ep.endpoint, s.rule, s.detail)) {
          const action = await strategy.apply(ep.endpoint, s.rule, s.detail);
          actions.push(action);
          // Only apply first matching strategy per rule
          break;
        }
      }
    }
  }

  // If no fix was applied but there were failures, log as report-only
  if (actions.length === 0) {
    for (const ep of results) {
      for (const s of ep.valueSanity.filter((s) => !s.passed)) {
        actions.push({
          type: "report_only",
          endpoint: ep.endpoint,
          detail: `${s.rule}: ${s.detail}`,
          applied: false,
        });
      }
    }
  }

  const fixed = actions.filter((a) => a.applied);
  const summary = fixed.length > 0
    ? `🛠 Auto-healed ${fixed.length} issue(s): ${fixed.map((a) => `[${a.endpoint}] ${a.detail}`).join("; ")}`
    : `📋 ${actions.length} issue(s) detected, no auto-fix available: ${actions.map((a) => `[${a.endpoint}] ${a.detail}`).join("; ")}`;

  const result: HealResult = {
    timestamp: new Date().toISOString(),
    actions,
    summary,
  };

  // Log heal result to DB
  try {
    await db.execute({
      sql: "INSERT INTO healer_log (timestamp, payload) VALUES (?, ?)",
      args: [result.timestamp, JSON.stringify(result)],
    });
  } catch {}

  return result;
}
