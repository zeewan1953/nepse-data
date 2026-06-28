import "server-only";
import { db, execute, one } from "./db";

export type AlertRow = {
  id: number;
  user_id: string;
  alert_type: "price" | "signal" | "broker_flow";
  symbol: string | null;
  broker_id: string | null;
  signal_name: string | null;
  condition: "above" | "below" | "crosses_up" | "crosses_down";
  threshold: number;
  is_active: number;
  created_at: number;
  last_triggered_at: number | null;
};

export type TriggerLogRow = {
  id: number;
  alert_id: number;
  triggered_at: number;
  observed_value: number | null;
  message: string;
  is_read: number;
};

/** Check if `value` satisfies `condition` vs `threshold`. */
function conditionMet(value: number, condition: string, threshold: number): boolean {
  switch (condition) {
    case "above": return value > threshold;
    case "below": return value < threshold;
    case "crosses_up": return value > threshold;
    case "crosses_down": return value < threshold;
    default: return false;
  }
}

/** Get today's NPT date as YYYY-MM-DD */
function todayNpt(): string {
  const npt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  return npt.toISOString().slice(0, 10);
}

/** Get the start-of-day epoch ms for today in NPT */
function todayStartNpt(): number {
  const npt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  npt.setHours(0, 0, 0, 0);
  return npt.getTime();
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3002";
}

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/live`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const stock = json.data?.find((s: any) => s.symbol === symbol);
    return stock?.lastTradedPrice ?? null;
  } catch {
    return null;
  }
}

// ─── In-memory last known signal values (populated by evaluator) ────────
// Key = `${symbol}:${signalName}`, updates after each evaluation run
const _signalCache = new Map<string, number | null>();

export function getCachedSignal(symbol: string, signalName: string): number | null | undefined {
  return _signalCache.get(`${symbol}:${signalName}`);
}

async function fetchSignal(symbol: string, signalName: string): Promise<number | null> {
  const cached = _signalCache.get(`${symbol}:${signalName}`);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${getBaseUrl()}/api/stock-wise?symbol=${symbol}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();

    // stock-wise returns an array; find our symbol
    const entry = Array.isArray(json) ? json.find((s: any) => s.symbol === symbol) : json;
    if (!entry) return null;

    let value: number | null = null;
    switch (signalName) {
      case "cmf": value = entry.cmf ?? null; break;
      case "mfi": value = entry.mfi ?? null; break;
      case "volume_zscore": value = entry.volumeZScore ?? null; break;
      case "momentum_score": value = entry.momentumScore ?? null; break;
      case "smart_money_score": value = entry.smartMoneyScore ?? null; break;
      case "divergence_flag": value = entry.divergenceFlag ?? null; break;
    }
    _signalCache.set(`${symbol}:${signalName}`, value);
    return value;
  } catch {
    return null;
  }
}

async function fetchBrokerNetFlow(brokerId: string, symbol?: string | null): Promise<number | null> {
  try {
    const b = getBaseUrl();
    const url = symbol
      ? `${b}/api/broker-flow?broker_code=${brokerId}&symbol=${symbol}`
      : `${b}/api/broker-flow?broker_code=${brokerId}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json.net_amt_total ?? null;
  } catch {
    return null;
  }
}

async function sendPushNotification(userId: string, title: string, body: string): Promise<void> {
  try {
    const subs = await execute(
      "SELECT endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = ?",
      [userId]
    );
    if (!subs.rows.length) return;

    const webpush = await import("web-push");

    webpush.setVapidDetails(
      "mailto:alerts@nepseaxionl.app",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    for (const row of subs.rows) {
      const sub = {
        endpoint: row.endpoint as string,
        keys: {
          p256dh: row.p256dh_key as string,
          auth: row.auth_key as string,
        },
      };
      try {
        await webpush.sendNotification(sub, JSON.stringify({ title, body, icon: "/favicon-64.png" }));
      } catch {
        // If subscription is expired, remove it
        try {
          await execute("DELETE FROM push_subscriptions WHERE endpoint = ?", [sub.endpoint]);
        } catch {}
      }
    }
  } catch {}
}

export type EvaluationResult = {
  alertId: number;
  userId: string;
  message: string;
  observedValue: number | null;
};

export async function evaluateAlert(alert: AlertRow): Promise<EvaluationResult | null> {
  const today = todayStartNpt();

  // Skip if already triggered today
  if (alert.last_triggered_at && alert.last_triggered_at >= today) return null;
  if (!alert.is_active) return null;

  let observedValue: number | null = null;

  switch (alert.alert_type) {
    case "price": {
      if (!alert.symbol) return null;
      observedValue = await fetchPrice(alert.symbol);
      if (observedValue === null) return null;
      if (!conditionMet(observedValue, alert.condition, alert.threshold)) return null;
      break;
    }
    case "signal": {
      if (!alert.symbol || !alert.signal_name) return null;
      observedValue = await fetchSignal(alert.symbol, alert.signal_name);
      // Never fire on null signal values (per spec)
      if (observedValue === null) return null;
      if (!conditionMet(observedValue, alert.condition, alert.threshold)) return null;
      break;
    }
    case "broker_flow": {
      if (!alert.broker_id) return null;
      observedValue = await fetchBrokerNetFlow(alert.broker_id, alert.symbol);
      if (observedValue === null) return null;
      if (!conditionMet(observedValue, alert.condition, alert.threshold)) return null;
      break;
    }
    default:
      return null;
  }

  const symbolLabel = alert.symbol ? `${alert.symbol} ` : "";
  const label = alert.alert_type === "price"
    ? `Price ${alert.condition} ${alert.threshold}`
    : alert.alert_type === "signal"
    ? `${alert.signal_name} ${alert.condition} ${alert.threshold}`
    : `Broker ${alert.broker_id} net-flow ${alert.condition} ${alert.threshold}`;

  const message = `Alert: ${symbolLabel}${label} (actual: ${observedValue})`;

  // Insert trigger log
  const now = Date.now();
  await execute(
    `INSERT INTO alert_trigger_log (alert_id, triggered_at, observed_value, message) VALUES (?, ?, ?, ?)`,
    [alert.id, now, observedValue, message]
  );

  // Update last_triggered_at
  await execute(
    `UPDATE user_alerts SET last_triggered_at = ? WHERE id = ?`,
    [now, alert.id]
  );

  // Send push
  await sendPushNotification(alert.user_id, "NEPSE AXION Alert", message);

  return { alertId: alert.id, userId: alert.user_id, message, observedValue };
}

export async function evaluateAllAlerts(): Promise<EvaluationResult[]> {
  const result = await execute(
    "SELECT * FROM user_alerts WHERE is_active = 1 ORDER BY id"
  );
  const alerts = result.rows as unknown as AlertRow[];
  const fired: EvaluationResult[] = [];

  for (const alert of alerts) {
    try {
      const r = await evaluateAlert(alert);
      if (r) fired.push(r);
    } catch {
      // skip this alert silently
    }
  }
  return fired;
}
