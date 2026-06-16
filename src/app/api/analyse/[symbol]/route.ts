import Groq from "groq-sdk";
import {
  getNepse,
  cached,
  resolveSecurityId,
  getPriceHistoryById,
  getSecurityDetailsById,
} from "@/lib/nepse";
import { generateSignal, type Candle } from "@/lib/signals";
import type { SecurityDetails, SecurityPriceVolumeHistory } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// System prompt — NEPSE expert analyst, Nepali language
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `तिमी एउटा Nepal Stock Market (NEPSE) को expert analyst हौ। User ले stock को technical data दिन्छ — तिमीले त्यो हेरेर **सम्पूर्ण नेपाली भाषामा** विश्लेषण गर्नु छ।

**यसरी analysis गर्नु:**

Data आउँदा यी सबै हेर्नु:
- Daily indicators (SMA, EMA, TMA/DMA Crossover, RSI, MACD, Parabolic SAR, ATR, Bollinger Bands, VWAP, OBV, Volume, Relative Strength vs NEPSE)
- Hourly indicators (EMA, RSI, MACD, VWAP, ATR)
- Fibonacci levels (Daily = 52W, Hourly = 5 days)
- Support/Resistance strength
- Order Flow (Buy/Sell pressure, large orders, OBV trend)
- Breakout Signal
- 52W position

**जवाफ सधैं यस्तो structure मा दिनु:**

---
**📊 [STOCK NAME] — आजको विश्लेषण**

**हालको अवस्था:**
[Price कहाँ छ, trend कस्तो छ, 52W मा कहाँ छ — २-३ वाक्य]

**Daily संकेत:**
[Bullish/Bearish indicators के के छन्, TMA/DMA crossover भयो कि छैन, RSI कति छ, MACD कस्तो छ — स्पष्ट नेपालीमा]

**Hourly संकेत:**
[Hourly trend daily भन्दा फरक छ कि एउटै छ — स्पषर्ट भन्नु]

**Fibonacci र Support/Resistance:**
[अहिले कुन Fib level मा छ, नजिकको support र resistance कति हो]

**Order Flow:**
[Buy pressure कति %, ठूला orders कसको बढी, institutional buying/selling देखिन्छ कि]

**TMA/DMA Crossover:**
[Golden Cross / Death Cross / Bullish zone / Bearish zone — अहिले के छ]

**ATR र Volatility:**
[दैनिक उतारचढाव कति %, ATR-based Stop Loss कति हुनु पर्छ]

**Relative Strength:**
[NEPSE Index भन्दा राम्रो छ कि कमजोर]

**⚠️ Risk र News:**
[के के हेर्नु पर्छ, कुन level break भए danger छ, sector news वा company news छ भने उल्लेख गर्नु — छैन भने "थाहा भएन, latest news आफैं हेर्नु" भन्नु]

**🎯 के गर्ने?**
- **किन्नेलाई:** [Entry zone, Stop Loss, Target 1, Target 2, Target 3]
- **भइसकेकालाई:** [Hold गर्ने कि Trail SL लगाउने]
- **नकिनेकालाई:** [कुन condition मा entry गर्ने, कुन signal को पर्खाइमा]
- **बेच्नेलाई:** [Sell zone, कुन level मा profit लिने]

**📌 एकलाइन सारांश:**
[एउटै वाक्यमा — किन्ने / नकिन्ने / पर्खने — र किन]

---

**नियमहरू:**
- Data null वा छैन भने त्यो indicator को बारेमा केही नभन्नु
- आफूले थाहा नभएको news बनाउनु हुँदैन — "latest news आफैं हेर्नु" भन्नु
- Technical terms (RSI, MACD, ATR, etc.) English मा राख्नु, बाँकी नेपालीमा
- हमेशा Risk:Reward ratio उल्लेख गर्नु
- NEPSE trading days Sunday–Thursday, 3:15 PM पछि मात्र आजको data valid छ`;

// ---------------------------------------------------------------------------
// Build structured technical data object to feed Claude
// ---------------------------------------------------------------------------
function buildTechData(
  symbol: string,
  securityName: string,
  ltp: number,
  signal: ReturnType<typeof generateSignal>,
  depthData: { marketDepth?: { buyMarketDepthList?: { quantity: number; orderBookOrderPrice: number }[]; sellMarketDepthList?: { quantity: number; orderBookOrderPrice: number }[] } } | null,
  day52High: number | null,
  day52Low: number | null,
) {
  const buys = depthData?.marketDepth?.buyMarketDepthList ?? [];
  const sells = depthData?.marketDepth?.sellMarketDepthList ?? [];
  const totalBuy = buys.reduce((s, r) => s + r.quantity, 0);
  const totalSell = sells.reduce((s, r) => s + r.quantity, 0);
  const totalDepth = totalBuy + totalSell;
  const buyPct = totalDepth > 0 ? Math.round((totalBuy / totalDepth) * 100) : null;

  return {
    stock: symbol,
    name: securityName,
    ltp,
    fiftyTwoWeekHigh: day52High,
    fiftyTwoWeekLow: day52Low,
    week52Position: signal.week52Position,
    trend: signal.trend,
    recommendation: signal.recommendation,
    confidence: signal.confidence,

    // Indicators
    rsi: signal.rsi !== null ? +signal.rsi.toFixed(1) : null,
    macd: signal.macd ? { line: +signal.macd.macd.toFixed(2), signal: +signal.macd.signal.toFixed(2), hist: +signal.macd.hist.toFixed(2) } : null,
    bollingerBands: null, // computed internally; Bullish/Bearish in factors
    atr: signal.atr,
    vwap: signal.vwap,

    // Moving averages
    ema20: signal.ema20,
    sma50: signal.sma50,
    sma200: signal.sma200,
    tmaValue: signal.tmaValue,
    tmaDmaCross: signal.tmaDmaCross, // "golden" | "death" | "bullish" | "bearish" | null

    // Parabolic SAR
    sar: signal.sar ? { value: signal.sar.sar, trend: signal.sar.trend, bullish: signal.sar.bullish } : null,

    // Price levels
    support: signal.support,
    resistance: signal.resistance,
    fibLevels: signal.fib ?? null,
    pivots: signal.pivots ?? null,

    // ATR-based levels
    atrStopLoss: signal.atrStopLoss,
    atrTarget1: signal.atrTarget1,
    atrTarget2: signal.atrTarget2,
    atrTarget3: signal.atrTarget3,
    riskReward: signal.riskReward,

    // Order flow from depth
    orderFlow: {
      buyPressurePct: buyPct,
      totalBuyQty: totalBuy || null,
      totalSellQty: totalSell || null,
      topBidPrice: buys[0]?.orderBookOrderPrice ?? null,
      topAskPrice: sells[0]?.orderBookOrderPrice ?? null,
    },

    // All weighted factors from the engine (for Claude to reference)
    factors: signal.factors.map((f) => ({
      indicator: f.category,
      verdict: f.verdict,
      weight: f.weight,
      note: f.note,
    })),

    // Summary
    engineSummary: signal.summary,

    // Note: no hourly data available from current API (daily only)
    hourlyNote: "Hourly candlestick data is not available from the current API feed.",
  };
}

// ---------------------------------------------------------------------------
// Route handler — streams Claude response
// ---------------------------------------------------------------------------
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  // 1. Fetch security data (same cache as main security route)
  let securityData: {
    symbol: string;
    details: SecurityDetails | null;
    history: SecurityPriceVolumeHistory | null;
    depth: { marketDepth?: { buyMarketDepthList?: { quantity: number; orderBookOrderPrice: number }[]; sellMarketDepthList?: { quantity: number; orderBookOrderPrice: number }[] } } | null;
  } | null = null;

  try {
    securityData = await cached(`security:${symbol}`, 5_000, async () => {
      const nepse = getNepse();
      const id = await resolveSecurityId(symbol);
      if (!id) return null;
      const [details, history, depth] = await Promise.all([
        getSecurityDetailsById(id).catch(() => null) as Promise<SecurityDetails | null>,
        getPriceHistoryById(id, 500).catch(() => null) as Promise<SecurityPriceVolumeHistory | null>,
        nepse.getMarketDepth(symbol).catch(() => null),
      ]);
      return { symbol, id, details, history, depth };
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to fetch NEPSE data" }), { status: 502 });
  }

  if (!securityData) {
    return new Response(JSON.stringify({ error: `Symbol "${symbol}" not found on NEPSE` }), { status: 404 });
  }

  // 2. Build candles & generate signal
  const sorted = [...(securityData.history?.content ?? [])].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate),
  );
  const candles: Candle[] = sorted.map((c) => ({
    high: c.highPrice,
    low: c.lowPrice,
    close: c.closePrice,
    volume: c.totalTradedQuantity,
  }));

  if (candles.length < 20) {
    return new Response(
      JSON.stringify({ error: "Not enough historical data to analyse (need at least 20 days)" }),
      { status: 422 },
    );
  }

  const daily = securityData.details?.securityDailyTradeDto;
  const last = sorted.at(-1);
  const ltp = daily?.lastTradedPrice || last?.lastTradedPrice || last?.closePrice || 0;

  const signal = generateSignal(candles, ltp);
  const securityName = securityData.details?.security?.securityName ?? symbol;
  const day52High = daily?.fiftyTwoWeekHigh || last?.fiftyTwoWeekHigh || null;
  const day52Low = daily?.fiftyTwoWeekLow || last?.fiftyTwoWeekLow || null;

  const techData = buildTechData(
    symbol,
    securityName,
    ltp,
    signal,
    securityData.depth as { marketDepth?: { buyMarketDepthList?: { quantity: number; orderBookOrderPrice: number }[]; sellMarketDepthList?: { quantity: number; orderBookOrderPrice: number }[] } } | null,
    day52High ?? null,
    day52Low ?? null,
  );

  // 3. Stream Groq response (llama-3.3-70b-versatile — free tier)
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI analysis not configured (GROQ_API_KEY missing)" }), { status: 503 });
  }

  const client = new Groq({ apiKey });

  const userMessage = `यो stock को technical data हेरेर सम्पूर्ण विश्लेषण गर्नुस्:\n\n\`\`\`json\n${JSON.stringify(techData, null, 2)}\n\`\`\``;

  // Use TransformStream for streaming
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Run streaming in background
  (async () => {
    try {
      const stream = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2000,
        stream: true,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) await writer.write(encoder.encode(text));
      }
    } catch (e) {
      const errMsg = `\n\n⚠️ विश्लेषण असफल: ${(e as Error)?.message ?? "Unknown error"}`;
      await writer.write(encoder.encode(errMsg));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      "X-Stock-Symbol": symbol,
    },
  });
}
