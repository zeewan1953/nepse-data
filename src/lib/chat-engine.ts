import { db } from "@/lib/db";
import { buildSignalsFromLiveData } from "@/lib/signal-engine";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { fetchMeroLaganiNews } from "@/lib/news-analyzer";
import { runAutoTrader, getState } from "@/lib/auto-trader";

// ======================= INTENT PARSER =======================

type Intent =
  | "SIGNAL" | "BROKER" | "MARKET" | "VERIFY" | "ANALYZE"
  | "AUTOTRADE" | "POSITIONS" | "NEWS" | "TEST_API" | "HELP" | "UNKNOWN";

type ParsedCommand = {
  intent: Intent;
  symbol?: string;
  brokerCode?: string;
  apiEndpoint?: string;
  raw: string;
};

const NEPALI_MAP: Record<string, string> = {
  "signal": "SIGNAL", "sinyal": "SIGNAL", "synal": "SIGNAL",
  "broker": "BROKER", "borker": "BROKER",
  "market": "MARKET", "bazar": "MARKET", "summary": "MARKET",
  "verify": "VERIFY", "verif": "VERIFY", "check": "VERIFY",
  "analyse": "ANALYZE", "analyze": "ANALYZE", "analysis": "ANALYZE",
  "autotrade": "AUTOTRADE", "trade": "AUTOTRADE", "robot": "AUTOTRADE",
  "position": "POSITIONS", "portfolio": "POSITIONS", "holding": "POSITIONS",
  "news": "NEWS", "samachar": "NEWS", "khabar": "NEWS",
  "test": "TEST_API", "try": "TEST_API", "check api": "TEST_API",
  "help": "HELP", "sahayata": "HELP", "command": "HELP",
};

function parseIntent(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();
  const raw = text.trim();

  // Extract symbol (look for uppercase patterns like NABIL, AKJCL, etc.)
  const symbolMatch = raw.match(/\b([A-Z]{2,10})\b/);
  const symbol = symbolMatch?.[1];

  // Extract broker code (like 58, 01, etc.)
  const brokerMatch = raw.match(/\b(\d{2})\b/);
  const brokerCode = brokerMatch?.[1];

  // Extract API endpoint
  const apiMatch = raw.match(/\/(api\/[\w\/-]+)/);
  const apiEndpoint = apiMatch?.[1];

  // Determine intent
  for (const [keyword, intent] of Object.entries(NEPALI_MAP)) {
    if (lower.includes(keyword)) {
      return { intent: intent as Intent, symbol, brokerCode, apiEndpoint, raw };
    }
  }

  // If has a stock symbol but no keyword, default to SIGNAL
  if (symbol) {
    return { intent: "SIGNAL", symbol, brokerCode, apiEndpoint, raw };
  }

  return { intent: "HELP", symbol, brokerCode, apiEndpoint, raw };
}

// ======================= ACTION HANDLERS =======================

type ChatResult = {
  type: "text" | "table" | "error" | "action";
  title: string;
  content: any;
  data?: any[];
};

async function handleSignal(symbol?: string): Promise<ChatResult> {
  const { signals } = await buildSignalsFromLiveData();
  const mero = await fetchMeroLaganiSummary();
  const stock = mero?.turnover?.detail?.find((s: any) => s.s === symbol);

  if (symbol && stock) {
    const sig = signals.find((s) => s.symbol === symbol);
    return {
      type: "table",
      title: `📊 ${symbol} Signal Analysis`,
      content: {
        ltp: String(stock.lp),
        change: stock.pc + "%",
        high: String(stock.h),
        low: String(stock.l),
        volume: (stock.q || 0).toLocaleString(),
        signal: sig?.signal || "—",
        confidence: sig?.confidence ? sig.confidence + "%" : "—",
      },
      data: [{ field: "Reason", value: sig?.reason?.slice(0, 60) || "No signal" }],
    };
  }

  if (symbol && !stock) {
    return { type: "error", title: "Not Found", content: `Symbol "${symbol}" not found in live market data.` };
  }

  // Summary of all signals
  const buys = signals.filter((s) => s.signal === "BUY").length;
  const sells = signals.filter((s) => s.signal === "SELL").length;
  const topBuys = signals.filter((s) => s.signal === "BUY").slice(0, 5);
  const topSells = signals.filter((s) => s.signal === "SELL").slice(0, 5);

  return {
    type: "table",
    title: `📊 Market Signals (${signals.length} stocks)`,
    content: { buys: String(buys), sells: String(sells), total: String(signals.length) },
    data: signals.slice(0, 10).map((s) => ({
      symbol: s.symbol, signal: s.signal || "—",
      conf: s.confidence + "%", reason: s.reason.slice(0, 40),
    })),
  };
}

async function handleBroker(brokerCode?: string): Promise<ChatResult> {
  if (!brokerCode) {
    const r = await db.execute("SELECT COUNT(DISTINCT brokerCode) as cnt FROM broker_daily_summary");
    const count = r.rows[0]?.cnt || 0;
    return { type: "text", title: "🏦 Broker Data", content: `${count} brokers active in database. Use "broker 58" to see specific broker.` };
  }

  const r = await db.execute({
    sql: "SELECT tradeDate, buyAmt, sellAmt, netAmt FROM broker_daily_summary WHERE brokerCode = ? ORDER BY tradeDate DESC LIMIT 5",
    args: [brokerCode],
  });
  if (!r.rows.length) {
    return { type: "error", title: "Broker Not Found", content: `No data for broker code ${brokerCode}.` };
  }

  const rows = r.rows.map((r: any) => ({
    date: r.tradeDate,
    buy: "Rs " + Number(r.buyAmt).toLocaleString(),
    sell: "Rs " + Number(r.sellAmt).toLocaleString(),
    net: "Rs " + Number(r.netAmt).toLocaleString(),
  }));
  return {
    type: "table",
    title: `🏦 Broker ${brokerCode} — Recent Activity`,
    content: { rows: rows.length, brokerCode },
    data: rows,
  };
}

async function handleMarket(): Promise<ChatResult> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero) return { type: "error", title: "No Data", content: "Market data unavailable." };

  const top = mero.turnover?.detail?.slice(0, 5) || [];
  return {
    type: "table",
    title: `📈 Market Summary — ${mero.turnover?.date || ""}`,
    content: {
      turnover: "Rs " + (mero.overall?.t || "0"),
      stocks: mero.stock?.detail?.length || 0,
      gainers: top.filter((s: any) => s.pc > 0).length,
      losers: top.filter((s: any) => s.pc < 0).length,
    },
    data: top.map((s: any) => ({
      symbol: s.s, ltp: s.lp, change: s.pc + "%", volume: (s.q || 0).toLocaleString(),
    })),
  };
}

async function handleVerify(symbol?: string): Promise<ChatResult> {
  if (!symbol) return { type: "text", title: "Verify", content: 'Specify a symbol: "verify NABIL"' };

  const ohlcv = await db.execute({
    sql: "SELECT tradeDate, open, high, low, close, volume FROM stock_daily_ohlcv WHERE symbol = ? ORDER BY tradeDate DESC LIMIT 3",
    args: [symbol],
  });

  const mero = await fetchMeroLaganiSummary();
  const live = mero?.turnover?.detail?.find((s: any) => s.s === symbol);

  const mismatches: string[] = [];
  if (ohlcv.rows.length > 0 && live) {
    const dbClose = Number(ohlcv.rows[0].close);
    if (dbClose > 0 && Math.abs(dbClose - live.lp) / live.lp > 0.01) {
      mismatches.push(`Close mismatch: DB=${dbClose} vs Live=${live.lp}`);
    }
  }

  return {
    type: "table",
    title: `🔎 Verify ${symbol}`,
    content: {
      dbRows: ohlcv.rows.length,
      livePrice: live ? live.lp : "N/A",
      mismatches: mismatches.length || "None",
    },
    data: ohlcv.rows.slice(0, 3).map((r: any) => ({
      date: String(r.tradeDate),
      O: Number(r.open).toFixed(2),
      H: Number(r.high).toFixed(2),
      L: Number(r.low).toFixed(2),
      C: Number(r.close).toFixed(2),
      V: Number(r.volume).toFixed(0),
    })),
  };
}

async function handleAutoTrade(): Promise<ChatResult> {
  const result = await runAutoTrader();
  const state = await getState();
  return {
    type: "action",
    title: "🤖 Auto-Trader Result",
    content: result.summary,
    data: state.positions.map((p: any) => ({
      symbol: p.symbol, qty: String(p.qty),
      avgCost: "Rs " + (p.avgCost || 0).toLocaleString(),
    })),
  };
}

async function handlePositions(): Promise<ChatResult> {
  const state = await getState();
  return {
    type: "table",
    title: `💼 Portfolio — Rs ${state.balance.toLocaleString()} balance`,
    content: {
      balance: state.balance,
      invested: state.totalInvested,
      return: state.totalReturn,
      positions: state.positions.length,
    },
    data: state.positions.map((p: any) => ({
      symbol: p.symbol, qty: String(p.qty),
      cost: "Rs " + (p.avgCost || 0).toLocaleString(),
      invested: "Rs " + ((p.qty || 0) * (p.avgCost || 0)).toLocaleString(),
    })),
  };
}

async function handleNews(symbol?: string): Promise<ChatResult> {
  let news: any[] = [];
  try {
    const raw = await fetchMeroLaganiNews();
    if (Array.isArray(raw)) news = raw;
  } catch {}

  const filtered = symbol
    ? news.filter((n) => n.symbol === symbol || n.title?.toUpperCase().includes(symbol))
    : news;

  const rows = filtered.slice(0, 5).map((n: any) => ({
    title: (n.title || "").slice(0, 60),
    sentiment: n.sentiment || "neutral",
    time: (n.timestamp || "").slice(0, 10),
  }));
  return {
    type: "table",
    title: `📰 ${symbol ? `${symbol} News` : "Latest Market News"} (${filtered.length})`,
    content: { count: String(rows.length), source: "MeroLagani" },
    data: rows,
  };
}

async function handleTestAPI(endpoint?: string): Promise<ChatResult> {
  if (!endpoint) return { type: "text", title: "Test API", content: 'Specify endpoint: "test /api/signals"' };
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const url = `${base}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;

  try {
    const start = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const ms = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    return {
      type: "table",
      title: `🧪 API Test: ${endpoint}`,
      content: { status: res.status, latency: ms + "ms", ok: String(res.ok) },
      data: [{ status: res.status, latency: ms + "ms" }],
    };
  } catch (e) {
    return { type: "error", title: "API Error", content: (e as Error)?.message };
  }
}

function handleHelp(): ChatResult {
  return {
    type: "text",
    title: "🤖 Available Commands",
    content: [
      "📊 `<symbol>` — Stock signal & price (e.g. NABIL)",
      "🏦 `broker <code>` — Broker analysis (e.g. broker 58)",
      "📈 `market` — Market summary",
      "🔎 `verify <symbol>` — Cross-reference data",
      "🤖 `autotrade` — Run auto-trader cycle",
      "💼 `positions` / `portfolio` — Auto-trader portfolio",
      "📰 `news <symbol>` — Stock news",
      "🧪 `test /api/endpoint` — Test any API",
      "❓ `help` — This menu",
    ].join("\n"),
  };
}

// ======================= MAIN ENGINE =======================

export async function processChatMessage(message: string): Promise<ChatResult> {
  const cmd = parseIntent(message);

  try {
    switch (cmd.intent) {
      case "SIGNAL": return await handleSignal(cmd.symbol);
      case "BROKER": return await handleBroker(cmd.brokerCode);
      case "MARKET": return await handleMarket();
      case "VERIFY": return await handleVerify(cmd.symbol);
      case "ANALYZE": return await handleSignal(cmd.symbol); // same as signal for now
      case "AUTOTRADE": return await handleAutoTrade();
      case "POSITIONS": return await handlePositions();
      case "NEWS": return await handleNews(cmd.symbol);
      case "TEST_API": return await handleTestAPI(cmd.apiEndpoint);
      default: return handleHelp();
    }
  } catch (e) {
    return { type: "error", title: "Error", content: (e as Error)?.message || "Unknown error" };
  }
}
