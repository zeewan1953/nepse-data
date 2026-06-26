import { db } from "@/lib/db";
import { buildSignalsFromLiveData } from "@/lib/signal-engine";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { fetchMeroLaganiNews } from "@/lib/news-analyzer";
import { runAutoTrader, getState } from "@/lib/auto-trader";
import { analyseStock } from "@/lib/stock-analysis";

// ======================= TYPES =======================

type Intent =
  | "SIGNAL" | "BROKER" | "MARKET" | "VERIFY" | "ANALYZE"
  | "AUTOTRADE" | "POSITIONS" | "NEWS" | "TEST_API"
  | "TOP_GAINER" | "TOP_LOSER" | "PRICE" | "VOLUME"
  | "GREET" | "THANKS" | "WHY" | "COMPARE" | "HELP" | "UNKNOWN";

type ChatResult = {
  type: "text" | "table" | "error" | "action";
  title: string;
  content?: any;
  data?: any[];
};

// ======================= NLP =======================

const SYMBOL_RE = /\b([A-Z]{2,10})\b/;
const BROKER_RE = /\b(\d{2})\b/;
const API_RE = /\/(api\/[\w\/-]+)/;

const RULES: Array<{ patterns: RegExp[]; intent: Intent }> = [
  // Greetings
  { patterns: [/^(namaste|namaskar|hello|hi|hey|hallo|नमस्ते|नमस्कार)\b/i], intent: "GREET" },
  { patterns: [/^(thanks|thank you|dhanyabad|धन्यवाद)\b/i], intent: "THANKS" },

  // Market / bazar
  { patterns: [/(market|bazar|summary|overview|बजार|मार्केट)\b/i], intent: "MARKET" },
  { patterns: [/ajha[\s]*ko[\s]*(market|bazar)|आजको बजार/i], intent: "MARKET" },
  { patterns: [/market[\s]*kasto|बजार कस्तो|market open/i], intent: "MARKET" },

  // Top gainers / losers
  { patterns: [/(gainers?|top[\s]*gain|badhne|बढ्ने|ukali)\b/i], intent: "TOP_GAINER" },
  { patterns: [/(losers?|top[\s]*los|ghatne|घट्ने|orali|ओराली)\b/i], intent: "TOP_LOSER" },
  { patterns: [/(gain|loss|profit|naira|नाफा|घाटा)\b/i], intent: "MARKET" },

  // Price / bhav
  { patterns: [/(price|bhav|भाउ|rate|kati[\s]*(bhayo|xa|छ)?)\b/i], intent: "PRICE" },
  { patterns: [/(ltp|close|traded|कति भयो|कति छ|के भयो)\b/i], intent: "PRICE" },

  // Volume / turnover (search by volume)
  { patterns: [/(volume|kharid|बिक्री|turnover|carbobar)\b/i], intent: "VOLUME" },

  // Broker
  { patterns: [/(broker|borker|बोर्कर|broker[\s]*\d{2})\b/i], intent: "BROKER" },

  // Signal / analysis
  { patterns: [/(signal|sinyal|synal|analysis|analyse|trend|tech|technical|indicato)\b/i], intent: "ANALYZE" },

  // News / samachar
  { patterns: [/(news|samachar|khabar|samt|समाचार|खबर)\b/i], intent: "NEWS" },

  // Verify / check
  { patterns: [/(verify|check|validate|cross|compare|verify)\b/i], intent: "VERIFY" },

  // Auto trade / robot
  { patterns: [/(auto|trade|robot|autotrade|automate)\b/i], intent: "AUTOTRADE" },

  // Positions / portfolio
  { patterns: [/(position|portfolio|holding|portfolio|my|portfolio)\b/i], intent: "POSITIONS" },
  { patterns: [/(portfolio|position|holding)\b/i], intent: "POSITIONS" },

  // Test API
  { patterns: [/(test|api|endpoint)\s+\/api/i], intent: "TEST_API" },
  { patterns: [/\/api\//i], intent: "TEST_API" },

  // Why questions (kina / why)
  { patterns: [/(kina|why|किन)\b.*(udaeko|ghatyo|badhyo)?/i], intent: "WHY" },

  // Compare
  { patterns: [/(compare|ra|vs|against|tyas|भन्दा)\b.*(ra|vs)/i], intent: "COMPARE" },

  // Help
  { patterns: [/(help|command|sahayata|सहायता|ke[\s]*garna|के गर्न|k garne)\b/i], intent: "HELP" },
];

const GREETING = ["namaste", "namaskar", "hello", "hi", "hey"];
const THANKS_WORDS = ["thanks", "thank", "dhanyabad", "धन्यवाद"];

function extractSymbol(text: string): string | undefined {
  const m = text.match(SYMBOL_RE);
  return m?.[1];
}

function extractBroker(text: string): string | undefined {
  const m = text.match(BROKER_RE);
  return m?.[1];
}

function extractApiEndpoint(text: string): string | undefined {
  const m = text.match(API_RE);
  return m?.[1];
}

function isNepali(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function detectIntent(text: string): { intent: Intent; symbol?: string } {
  const lower = text.trim().toLowerCase();

  for (const rule of RULES) {
    for (const p of rule.patterns) {
      if (p.test(lower)) {
        const symbol = extractSymbol(text);
        return { intent: rule.intent, symbol };
      }
    }
  }

  // Pure symbol query (e.g. "NABIL")
  const symbol = extractSymbol(text);
  if (symbol) {
    const noIntentWords = !["help", "market", "broker", "news", "test", "verify", "signal", "check", "price", "auto", "trade", "position", "portfolio", "gain", "loss", "volume"].some(w => lower.includes(w));
    if (noIntentWords) return { intent: "SIGNAL", symbol };
  }

  // Nepali asking about something
  if (isNepali(text)) {
    if (lower.includes("भाउ") || lower.includes("कति")) return { intent: "PRICE", symbol };
    if (lower.includes("समाचार") || lower.includes("खबर")) return { intent: "NEWS", symbol };
    if (lower.includes("बजार")) return { intent: "MARKET" };
    if (lower.includes("गेनर") || lower.includes("बढ्ने")) return { intent: "TOP_GAINER" };
    if (lower.includes("लुजर") || lower.includes("घट्ने")) return { intent: "TOP_LOSER" };
    if (symbol) return { intent: "SIGNAL", symbol };
  }

  // Single short word that looks like a stock query
  if (text.trim().length <= 8 && symbol) {
    return { intent: "SIGNAL", symbol };
  }

  return { intent: "UNKNOWN", symbol };
}

// ======================= CONVERSATIONAL RESPONSES =======================

function greetResponse(text: string): ChatResult {
  const time = new Date().toLocaleString("en-US", { hour: "numeric", hour12: true, timeZone: "Asia/Kathmandu" });
  return {
    type: "text",
    title: "नमस्ते 🙏",
    content: "नमस्ते! अहिले NEPSE " + time + " हो। म तपाईंलाई के मद्दत गर्न सक्छु?\n\nकुनै स्टक हेर्न symbol टाइप गर्नुहोस् (जस्तै NABIL, AKJCL)\nवा \"help\" टाइप गरेर सबै कमाण्ड हेर्नुहोस्।",
  };
}

function thanksResponse(): ChatResult {
  const msgs = [
    "तपाईंलाई धन्यवाद! अरु के सोध्नु छ? 😊",
    "खुशी लाग्यो! जे पनि सोध्नुहोस्। 🙌",
    "Damai chaina! अरु स्टक हेर्ने? 💪",
  ];
  return { type: "text", title: "🙏", content: msgs[Math.floor(Math.random() * msgs.length)] };
}

// ======================= DATA HANDLERS =======================

async function handleSignal(symbol?: string): Promise<ChatResult> {
  const { signals } = await buildSignalsFromLiveData();
  const mero = await fetchMeroLaganiSummary();
  const stock = mero?.turnover?.detail?.find((s: any) => s.s === symbol);

  if (symbol && stock) {
    const sig = signals.find((s) => s.symbol === symbol);
    const dir = stock.pc >= 0 ? "बढेको" : "घटेको";
    const text = isNepali(extractSymbol(symbol) ? "" : "")
      ? `${symbol} अहिले Rs ${stock.lp} मा कारोबार भइरहेको छ। ${Math.abs(stock.pc)}% ${dir}, volume ${(stock.q || 0).toLocaleString()}।`
      : `${symbol} trading at Rs ${stock.lp} (${stock.pc >= 0 ? "+" : ""}${stock.pc}%). Volume: ${(stock.q || 0).toLocaleString()}.`;
    return {
      type: "table",
      title: `📊 ${symbol}`,
      content: {
        LTP: "Rs " + stock.lp,
        Change: stock.pc + "%",
        High: String(stock.h), Low: String(stock.l),
        Volume: (stock.q || 0).toLocaleString(),
        Signal: sig?.signal || "—",
        Confidence: sig?.confidence ? sig.confidence + "%" : "—",
      },
      data: [{ text }],
    };
  }

  if (symbol && !stock) {
    return { type: "error", title: "Not Found", content: `"${symbol}" भेटिएन। Symbol सही छ कि जाँच गर्नुहोस्।` };
  }

  const buys = signals.filter((s) => s.signal === "BUY").length;
  const sells = signals.filter((s) => s.signal === "SELL").length;
  const tops = signals.filter((s) => s.signal === "BUY").slice(0, 8);
  return {
    type: "table",
    title: `📊 Market Signals`,
    content: `BUY: ${buys} · SELL: ${sells} · Total: ${signals.length}`,
    data: tops.map((s) => ({ symbol: s.symbol, signal: s.signal || "—", conf: s.confidence + "%" })),
  };
}

async function handleTopGainers(): Promise<ChatResult> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.turnover?.detail) return { type: "error", title: "No Data", content: "Data unavailable." };
  const gainers = [...mero.turnover.detail].filter((s: any) => s.pc > 0).sort((a: any, b: any) => b.pc - a.pc).slice(0, 8);
  return {
    type: "table",
    title: `📈 Top Gainers (${mero.turnover.date})`,
    content: { count: String(gainers.length), source: "nepseput" },
    data: gainers.map((s: any) => ({ Symbol: s.s, LTP: s.lp, Change: "+" + s.pc + "%", Volume: (s.q || 0).toLocaleString() })),
  };
}

async function handleTopLosers(): Promise<ChatResult> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.turnover?.detail) return { type: "error", title: "No Data", content: "Data unavailable." };
  const losers = [...mero.turnover.detail].filter((s: any) => s.pc < 0).sort((a: any, b: any) => a.pc - b.pc).slice(0, 8);
  return {
    type: "table",
    title: `📉 Top Losers (${mero.turnover.date})`,
    content: { count: String(losers.length), source: "nepseput" },
    data: losers.map((s: any) => ({ Symbol: s.s, LTP: s.lp, Change: s.pc + "%", Volume: (s.q || 0).toLocaleString() })),
  };
}

async function handleAnalyze(symbol?: string): Promise<ChatResult> {
  if (!symbol) return { type: "text", title: "Analysis", content: 'कुन स्टकको analysis हेर्ने? Symbol टाइप गर्नुहोस् (जस्तै "NABIL analysis" वा "analyze NABIL")' };
  const result = await analyseStock(symbol);
  if ("error" in result) return { type: "error", title: "Not Found", content: result.error };

  const { price, trend, volume, signal, brokerFlow, supportResistance, verdict } = result;
  const dirIcon = price.changePct > 0 ? "📈" : price.changePct < 0 ? "📉" : "➡️";
  const ratingIcon = verdict.rating === "STRONG_BUY" || verdict.rating === "BUY" ? "🟢" : verdict.rating === "STRONG_SELL" || verdict.rating === "SELL" ? "🔴" : "🟡";

  const lines = [
    `${dirIcon} **${symbol}** @ Rs ${price.ltp} (${price.changePct >= 0 ? "+" : ""}${price.changePct}%)`,
    `O:${price.open} H:${price.high} L:${price.low} V:${(volume.total || 0).toLocaleString()}`,
    ``,
    `**Trend**: ${trend.shortTerm} (momentum ${trend.momentum >= 0 ? "+" : ""}${trend.momentum}, strength ${trend.strength}%)`,
    `**Range**: ${Math.round(price.rangePosition * 100)}% of day range · Volatility ${(price.volatility * 100).toFixed(1)}%`,
    `**Volume**: ${volume.quality}${volume.surge ? " (SURGE!)" : ""} · ${volume.relativeToAvg}x market avg`,
    `**Signal**: ${signal.direction || "—"} (${signal.confidence}%)`,
    brokerFlow ? `**Broker Flow**: ${brokerFlow.netFlow >= 0 ? "🟢" : "🔴"} Net ${brokerFlow.netFlow >= 0 ? "+" : ""}Rs ${(brokerFlow.netFlow || 0).toLocaleString()}` : null,
    `**S/R**: S=${supportResistance.support} R=${supportResistance.resistance} P=${supportResistance.pivot}`,
    ``,
    `${ratingIcon} **${verdict.rating}** (score ${verdict.score >= 0 ? "+" : ""}${verdict.score})`,
    `↳ ${verdict.action}`,
    `Risk:Reward ${verdict.riskReward}`,
  ].filter(Boolean).join("\n");

  return {
    type: "table",
    title: `🎯 ${symbol} — Completely Analysis`,
    content: {
      LTP: "Rs " + price.ltp,
      "Day Chg": price.changePct + "%",
      Trend: trend.shortTerm,
      Signal: signal.direction || "—",
      Verdict: verdict.rating,
      "R:R": verdict.riskReward,
    },
    data: [{ text: lines }],
  };
}

async function handlePrice(symbol?: string): Promise<ChatResult> {
  if (!symbol) return { type: "text", title: "Price", content: 'कुन स्टकको भाउ हेर्ने? Symbol टाइप गर्नुहोस् (जस्तै "NABIL कति भयो")' };
  const mero = await fetchMeroLaganiSummary();
  const stock = mero?.turnover?.detail?.find((s: any) => s.s === symbol);
  if (!stock) return { type: "error", title: "Not Found", content: `${symbol} भेटिएन।` };
  return {
    type: "table",
    title: `💰 ${symbol} Price`,
    content: {
      LTP: "Rs " + stock.lp,
      Change: stock.pc + "%",
      Open: String(stock.op), High: String(stock.h), Low: String(stock.l),
    },
  };
}

async function handleVolume(): Promise<ChatResult> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.turnover?.detail) return { type: "error", title: "No Data", content: "Data unavailable." };
  const top = [...mero.turnover.detail].sort((a: any, b: any) => b.q - a.q).slice(0, 8);
  return {
    type: "table",
    title: `📊 Top by Volume (${mero.turnover.date})`,
    content: { source: "nepseput" },
    data: top.map((s: any) => ({ Symbol: s.s, Volume: (s.q || 0).toLocaleString(), LTP: s.lp, Change: s.pc + "%" })),
  };
}

async function handleBroker(brokerCode?: string): Promise<ChatResult> {
  if (!brokerCode) {
    const r = await db.execute("SELECT COUNT(DISTINCT brokerCode) as cnt FROM broker_daily_summary");
    return { type: "text", title: "🏦 Broker", content: `DB मा ${r.rows[0]?.cnt || 0} brokers छन्। "broker 58" टाइप गर्नुहोस्।` };
  }
  const r = await db.execute({
    sql: "SELECT tradeDate, buyAmt, sellAmt, (buyAmt - sellAmt) as netAmt FROM broker_daily_summary WHERE brokerCode = ? ORDER BY tradeDate DESC LIMIT 5",
    args: [brokerCode],
  });
  if (!r.rows.length) return { type: "error", title: "Not Found", content: `Broker ${brokerCode} को डाटा छैन।` };
  const rows = r.rows.map((r: any) => ({
    Date: r.tradeDate, Buy: "Rs " + Number(r.buyAmt).toLocaleString(),
    Sell: "Rs " + Number(r.sellAmt).toLocaleString(),
    Net: "Rs " + Number(r.netAmt).toLocaleString(),
  }));
  return {
    type: "table",
    title: `🏦 Broker ${brokerCode} Activity`,
    content: { rows: rows.length, code: brokerCode },
    data: rows,
  };
}

async function handleMarket(): Promise<ChatResult> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero) return { type: "error", title: "No Data", content: "बजार डाटा उपलब्ध छैन।" };
  const top = mero.turnover?.detail?.slice(0, 5) || [];
  const gainers = top.filter((s: any) => s.pc > 0).length;
  const losers = top.filter((s: any) => s.pc < 0).length;
  return {
    type: "table",
    title: `📈 NEPSE Market`,
    content: {
      Turnover: "Rs " + (mero.overall?.t || "0"),
      Stocks: String(mero.stock?.detail?.length || 0),
      Gainers: String(gainers), Losers: String(losers),
    },
    data: top.map((s: any) => ({ Symbol: s.s, LTP: s.lp, Chg: s.pc + "%" })),
  };
}

async function handleNews(symbol?: string): Promise<ChatResult> {
  let news: any[] = [];
  try { const raw = await fetchMeroLaganiNews(); if (Array.isArray(raw)) news = raw; } catch {}
  const filtered = symbol ? news.filter((n) => n.symbol === symbol || n.title?.toUpperCase().includes(symbol)) : news;
  const rows = filtered.slice(0, 5).map((n: any) => ({
    Title: (n.title || "").slice(0, 50),
    Sentiment: n.sentiment || "—",
  }));
  return {
    type: "table",
    title: `📰 ${symbol ? `${symbol} News` : "Market News"} (${filtered.length})`,
    content: { count: String(rows.length), source: "nepseput" },
    data: rows,
  };
}

async function handleUnknown(text: string): Promise<ChatResult> {
  // Try to search by matching text against stock symbols
  const mero = await fetchMeroLaganiSummary();
  const stocks = mero?.turnover?.detail || [];
  const upper = text.toUpperCase().trim();

  // Try partial symbol match
  const partial = stocks.filter((s: any) => s.s.includes(upper) || upper.includes(s.s));
  if (partial.length > 0 && partial.length <= 5) {
    return {
      type: "table",
      title: `🔍 Found ${partial.length} symbol(s)`,
      data: partial.map((s: any) => ({ symbol: s.s, LTP: s.lp, Change: s.pc + "%" })),    };
  }

  // Try name match
  if (upper.length > 2) {
    const byName = stocks.filter((s: any) => (s.n || "").toUpperCase().includes(upper));
    if (byName.length > 0 && byName.length <= 3) {
      const sig = await buildSignalsFromLiveData();
      return {
        type: "table",
        title: `🔍 "${text}" खोज्दै...`,
        data: byName.map((s: any) => ({
          Symbol: s.s, Name: s.n?.slice(0, 30),
          LTP: s.lp, Change: s.pc + "%",
        })),
      };
    }
  }

  // Why query
  if (/kina|why/.test(text.toLowerCase())) {
    const sym = extractSymbol(text);
    if (sym) {
      const stock = stocks.find((s: any) => s.s === sym);
      if (stock) {
        const dir = stock.pc > 0 ? "बढेको" : "घटेको";
        return {
          type: "text",
          title: `🤔 ${sym} ${dir}`,
          content: `${sym} ${Math.abs(stock.pc)}% ${dir} छ। Volume ${(stock.q || 0).toLocaleString()} र Turnover Rs ${(stock.t || 0).toLocaleString()}। ब्रोकर फ्लो र signals check गर्न "signal ${sym}" वा "broker" टाइप गर्नुहोस्।`,
        };
      }
    }
    return { type: "text", title: "🤔", content: "कुन स्टकको कुरा गर्दै हुनुहुन्छ? Symbol टाइप गर्नुहोस्।" };
  }

  // General Nepali query — show market summary
  if (isNepali(text)) {
    return await handleMarket();
  }

  // Help as default
  return {
    type: "text",
    title: "🤖 क के गर्न सक्छु",
    content: [
      "📊 `symbol` — Stock signal, price, analysis (जस्तै `NABIL`)",
      "📈 `gainers` — Top gainers",
      "📉 `losers` — Top losers",
      "🏦 `broker 58` — Broker analysis",
      "📰 `news NABIL` — News",
      "💰 `NABIL kati bhayo` — Price",
      "🔎 `verify NABIL` — Cross-check data",
      "🤖 `autotrade` — Run auto-trader",
      "🧪 `test /api/signals` — Test API",
      "❓ `help` — Sabai commands",
    ].join("\n"),
  };
}

// ======================= MAIN =======================

export async function processChatMessage(message: string): Promise<ChatResult> {
  const { intent, symbol } = detectIntent(message);
  const brokerCode = extractBroker(message);
  const apiEndpoint = extractApiEndpoint(message);

  try {
    switch (intent) {
      case "GREET": return greetResponse(message);
      case "THANKS": return thanksResponse();
      case "SIGNAL": return await handleSignal(symbol);
      case "TOP_GAINER": return await handleTopGainers();
      case "TOP_LOSER": return await handleTopLosers();
      case "PRICE": return await handlePrice(symbol);
      case "VOLUME": return await handleVolume();
      case "ANALYZE": return await handleAnalyze(symbol);
      case "MARKET": return await handleMarket();
      case "BROKER": return await handleBroker(brokerCode);
      case "NEWS": return await handleNews(symbol);
      case "VERIFY": return await handleSignal(symbol);
      case "AUTOTRADE": const r = await runAutoTrader(); return { type: "action", title: "🤖 Auto-Trader", content: r.summary };
      case "POSITIONS": const s = await getState(); return { type: "table", title: "💼 Portfolio", content: `Rs ${s.balance.toLocaleString()} balance, ${s.positions.length} positions`, data: s.positions.map((p: any) => ({ Symbol: p.symbol, Qty: String(p.qty), AvgCost: "Rs " + (p.avgCost || 0).toLocaleString() })) };
      case "TEST_API": return apiEndpoint ? (async () => {
        const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
        const url = `${base}/${apiEndpoint}`;
        const start = Date.now();
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        return { type: "table", title: `🧪 ${apiEndpoint}`, content: { status: res.status, latency: Date.now() - start + "ms" } };
      })() : { type: "text", title: "Test API", content: 'जस्तै: "test /api/signals"' };
      case "WHY": return await handleUnknown(message);
      case "HELP": return await handleUnknown(message);
      default: return await handleUnknown(message);
    }
  } catch (e) {
    return { type: "error", title: "Error", content: (e as Error)?.message || "Kehi error bhayo." };
  }
}
