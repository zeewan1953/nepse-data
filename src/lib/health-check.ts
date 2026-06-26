import { db, execute } from "@/lib/db";
import { getConfig } from "@/lib/self-healer";

export type EndpointResult = {
  endpoint: string;
  status: number;
  shapeValid: boolean;
  valueSanity: SanityResult[];
  latencyMs: number;
};

export type SanityResult = {
  rule: string;
  passed: boolean;
  detail: string;
};

export type HealthCheckRun = {
  id?: number;
  timestamp: string;
  results: EndpointResult[];
  anyFailures: boolean;
  summary: string;
};

const HEALTH_ENDPOINTS: Array<{ name: string; check: () => Promise<{ status: number; body: unknown }> }> = [
  {
    name: "live",
    check: async () => {
      const r = await fetch("https://nepse-data-sand.vercel.app/api/live", { signal: AbortSignal.timeout(10000) });
      return { status: r.status, body: await r.json() };
    },
  },
  {
    name: "fs-date",
    check: async () => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
      const r = await fetch(`https://nepse-data-sand.vercel.app/api/fs-date?date=${today}`, { signal: AbortSignal.timeout(10000) });
      return { status: r.status, body: await r.json() };
    },
  },
  {
    name: "accumulation",
    check: async () => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
      const r = await fetch(`https://nepse-data-sand.vercel.app/api/accumulation?date=${today}`, { signal: AbortSignal.timeout(10000) });
      return { status: r.status, body: await r.json() };
    },
  },
  {
    name: "broker-holding",
    check: async () => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
      const r = await fetch(`https://nepse-data-sand.vercel.app/api/broker-holding?date=${today}`, { signal: AbortSignal.timeout(10000) });
      return { status: r.status, body: await r.json() };
    },
  },
  {
    name: "signals",
    check: async () => {
      const r = await fetch("https://nepse-data-sand.vercel.app/api/signals", { signal: AbortSignal.timeout(10000) });
      return { status: r.status, body: await r.json() };
    },
  },
  {
    name: "broker-analysis",
    check: async () => {
      const r = await fetch("https://nepse-data-sand.vercel.app/api/broker-analysis", { signal: AbortSignal.timeout(30000) });
      return { status: r.status, body: await r.json() };
    },
  },
];

async function callEndpoint(endpoint: { name: string; check: () => Promise<{ status: number; body: unknown }> }): Promise<EndpointResult> {
  const start = Date.now();
  let status = 0;
  let body: unknown = null;
  let shapeValid = true;
  const sanityResults: SanityResult[] = [];

  try {
    const result = await endpoint.check();
    status = result.status;
    body = result.body;
  } catch {
    status = 0;
    shapeValid = false;
  }

  const latencyMs = Date.now() - start;

  if (body && typeof body === "object" && status === 200) {
    const b = body as Record<string, unknown>;

    // Rule: source: "sample" must never appear
    if (b.source === "sample") {
      sanityResults.push({
        rule: "no_sample_source",
        passed: false,
        detail: `endpoint ${endpoint.name} returned source="sample" in production`,
      });
    } else {
      sanityResults.push({
        rule: "no_sample_source",
        passed: true,
        detail: "source is not sample",
      });
    }

    // Rule: check for any nested "sample" source
    const bodyStr = JSON.stringify(b);
    if (bodyStr.includes('"source":"sample"')) {
      sanityResults.push({
        rule: "no_nested_sample",
        passed: false,
        detail: `nested source="sample" found in ${endpoint.name} response`,
      });
    } else {
      sanityResults.push({
        rule: "no_nested_sample",
        passed: true,
        detail: "no nested sample source",
      });
    }

    // Rule: check for 0 where null is expected
    if (b.stocks && Array.isArray(b.stocks)) {
      const stocks = b.stocks as Record<string, unknown>[];
      if (stocks.length > 0) {
        const nullFields = ["signal", "buyAmt", "sellAmt", "netFlow"];
        for (const field of nullFields) {
          const zeroCount = stocks.filter((s) => s[field] === 0).length;
          if (zeroCount > 0) {
            sanityResults.push({
              rule: `no_zero_for_null:${field}`,
              passed: false,
              detail: `${zeroCount}/${stocks.length} stocks have ${field}=0 (should be null)`,
            });
          }
        }

        // Rule: signal distribution check
        const signalCounts = new Map<string, number>();
        for (const s of stocks) {
          const sig = String(s.signal ?? "null");
          signalCounts.set(sig, (signalCounts.get(sig) || 0) + 1);
        }
        for (const [val, count] of signalCounts) {
          const pct = (count / stocks.length) * 100;
          if (pct > 95 && val !== "null") {
            sanityResults.push({
              rule: "signal_over_95pct_same",
              passed: false,
              detail: `${pct.toFixed(1)}% of stocks have signal="${val}" — possible fabricated default`,
            });
          }
        }
      }
    }

    // Rule: latency — uses dynamic threshold from self-healer config (auto-tuned)
    const configKey = `latency_threshold:${endpoint.name}`;
    const configuredThreshold = await getConfig(configKey, 10000);
    const latencyThreshold = typeof configuredThreshold === "number" ? configuredThreshold : parseInt(String(configuredThreshold));
    if (latencyMs > latencyThreshold) {
      sanityResults.push({
        rule: "latency_threshold",
        passed: false,
        detail: `${latencyMs}ms (threshold: ${latencyThreshold}ms)`,
      });
    }

    // Rule: status
    if (status !== 200) {
      sanityResults.push({
        rule: "http_status",
        passed: false,
        detail: `HTTP ${status}`,
      });
    }
  } else if (status === 0) {
    shapeValid = false;
    sanityResults.push({
      rule: "fetch_failed",
      passed: false,
      detail: "Could not reach endpoint",
    });
  }

  return { endpoint: endpoint.name, status, shapeValid, valueSanity: sanityResults, latencyMs };
}

export async function runHealthCheck(): Promise<HealthCheckRun> {
  const results = await Promise.all(
    HEALTH_ENDPOINTS.map((ep) => callEndpoint(ep)),
  );

  const anyFailures = results.some(
    (r) => r.status !== 200 || !r.shapeValid || r.valueSanity.some((s) => !s.passed),
  );

  const failedRules = results.flatMap((r) =>
    r.valueSanity.filter((s) => !s.passed).map((s) => `[${r.endpoint}] ${s.rule}: ${s.detail}`),
  );

  let summary: string;
  if (anyFailures) {
    summary = `⚠ Health check FAILED. ${failedRules.length} rule(s) broken:\n${failedRules.join("\n")}`;
  } else {
    summary = `✅ All ${results.length} endpoints passed health check. Avg latency: ${Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / results.length)}ms.`;
  }

  const run: HealthCheckRun = {
    timestamp: new Date().toISOString(),
    results,
    anyFailures,
    summary,
  };

  try {
    await db.execute({
      sql: "INSERT INTO health_check_runs (timestamp, payload) VALUES (?, ?)",
      args: [run.timestamp, JSON.stringify(run)],
    });
  } catch (e) {
    console.error("[health-check] failed to save:", (e as Error)?.message);
  }

  return run;
}
