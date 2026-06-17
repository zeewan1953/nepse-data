// Local Nepali AI Analysis Generator — NO external API needed
// Generates comprehensive Nepali technical analysis from signal engine data
import type { Signal, Factor } from "@/lib/signals";

const npr = (n: number | null | undefined, dp = 2): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};

export function generateNepaliAnalysis(
  symbol: string,
  securityName: string,
  ltp: number,
  signal: Signal,
  day52High: number | null,
  day52Low: number | null,
): string {
  const bullFactors = signal.factors.filter(f => f.verdict === "Bullish");
  const bearFactors = signal.factors.filter(f => f.verdict === "Bearish");
  const neutralFactors = signal.factors.filter(f => f.verdict === "Neutral");

  const trendNepali = signal.trend === "Up" ? "अपट्रेन्ड" : signal.trend === "Down" ? "डाउनट्रेन्ड" : "साइडवेज";
  const recoNepali = signal.recommendation.includes("Buy") ? "किन्ने" : signal.recommendation.includes("Sell") ? "बेच्ने" : "पर्खने";

  let text = `## 📊 ${symbol} — ${securityName}\n\n`;

  // === Current Status ===
  text += `**हालको अवस्था:**\n`;
  text += `- LTP: **${npr(ltp)}** | Trend: **${trendNepali}**\n`;
  text += `- Recommendation: **${signal.recommendation}** (${signal.confidence}% confidence)\n`;
  if (signal.week52Position !== null) {
    text += `- 52W Position: **${signal.week52Position}%** `;
    if (signal.week52Position > 80) text += `(52W high को नजिक — overbought zone)`;
    else if (signal.week52Position < 20) text += `(52W low को नजिक — oversold zone)`;
    else text += `(52W range को बीचमा)`;
    text += `\n`;
  }
  if (day52High && day52Low) {
    text += `- 52W Range: ${npr(day52Low)} – ${npr(day52High)}\n`;
  }
  text += `\n`;

  // === Daily Signals ===
  text += `**📈 Daily संकेतहरू (${bullFactors.length} Bullish / ${bearFactors.length} Bearish / ${neutralFactors.length} Neutral):**\n`;
  for (const f of bullFactors) {
    text += `- 🟢 **${f.category}**: ${f.note}\n`;
  }
  for (const f of bearFactors) {
    text += `- 🔴 **${f.category}**: ${f.note}\n`;
  }
  for (const f of neutralFactors) {
    text += `- 🟡 **${f.category}**: ${f.note}\n`;
  }
  text += `\n`;

  // === TMA/DMA Crossover ===
  if (signal.tmaDmaCross) {
    text += `**⭐ TMA/DMA Crossover:**\n`;
    if (signal.tmaDmaCross === "golden") {
      text += `- ⭐ **Golden Cross** — DMA ले TMA लाई तलबाट माथि cross गर्‍यो (strongest BUY signal)\n`;
    } else if (signal.tmaDmaCross === "death") {
      text += `- 💀 **Death Cross** — DMA ले TMA लाई माथिबाट तल cross गर्‍यो (strongest SELL signal)\n`;
    } else if (signal.tmaDmaCross === "bullish") {
      text += `- ▲ DMA TMA भन्दा माथि — **Bullish zone** (cross भएको छैन तर momentum राम्रो)\n`;
    } else {
      text += `- ▼ DMA TMA भन्दा तल — **Bearish zone** (cross भएको छैन तर momentum कमजोर)\n`;
    }
    text += `\n`;
  }

  // === RSI ===
  if (signal.rsi !== null) {
    text += `**📊 RSI (14):** ${signal.rsi.toFixed(0)} — `;
    if (signal.rsi < 30) text += `**Oversold** — bounce आउन सक्छ, किन्ने मौका\n`;
    else if (signal.rsi > 70) text += `**Overbought** — pullback आउन सक्छ, सावधान\n`;
    else if (signal.rsi > 55) text += `**Bullish momentum** — trend strong छ\n`;
    else if (signal.rsi < 45) text += `**Bearish momentum** — trend कमजोर छ\n`;
    else text += `**Neutral zone** — direction clear छैन\n`;
    text += `\n`;
  }

  // === MACD ===
  if (signal.macd) {
    text += `**📉 MACD:** `;
    if (signal.macd.hist > 0) {
      text += `Histogram **+${signal.macd.hist.toFixed(2)}** — Momentum बढ्दैछ (Bullish)\n`;
    } else {
      text += `Histogram **${signal.macd.hist.toFixed(2)}** — Momentum घट्दैछ (Bearish)\n`;
    }
    text += `\n`;
  }

  // === Parabolic SAR ===
  if (signal.sar) {
    text += `**🔘 Parabolic SAR:** `;
    if (signal.sar.bullish) {
      text += `SAR ${npr(signal.sar.sar)} price भन्दा तल — **Uptrend** जारी\n`;
    } else {
      text += `SAR ${npr(signal.sar.sar)} price भन्दा माथि — **Downtrend** जारी\n`;
    }
    text += `\n`;
  }

  // === VWAP ===
  if (signal.vwap !== null) {
    text += `**📏 VWAP:** ${npr(signal.vwap)} — Price ${ltp > signal.vwap ? "**माथि** (Bullish)" : "**तल** (Bearish)"}\n\n`;
  }

  // === ATR & Volatility ===
  if (signal.atr !== null) {
    const atrPct = ltp > 0 ? ((signal.atr / ltp) * 100).toFixed(1) : "—";
    text += `**📐 ATR (Volatility):** ${signal.atr.toFixed(2)} (~${atrPct}% daily movement)\n`;
    text += `- ATR Stop Loss: **${npr(signal.atrStopLoss)}**\n`;
    text += `- ATR Target 1: **${npr(signal.atrTarget1)}**\n`;
    text += `- ATR Target 2: **${npr(signal.atrTarget2)}**\n`;
    text += `- ATR Target 3: **${npr(signal.atrTarget3)}**\n`;
    text += `\n`;
  }

  // === Support / Resistance ===
  text += `**🛡️ Support / Resistance:**\n`;
  text += `- Support: **${npr(signal.support)}** (नजिकको तल्लो level)\n`;
  text += `- Resistance: **${npr(signal.resistance)}** (नजिकको माथिल्लो level)\n`;
  if (signal.fib) {
    text += `- Fibonacci 50%: **${npr(signal.fib.level500)}**\n`;
    text += `- Fibonacci 61.8%: **${npr(signal.fib.level618)}**\n`;
  }
  text += `\n`;

  // === Risk/Reward ===
  if (signal.riskReward !== null) {
    text += `**⚖️ Risk:Reward Ratio:** 1:${signal.riskReward.toFixed(1)}\n`;
    if (signal.riskReward >= 2) text += `- राम्रो ratio — risk भन्दा reward धेरै छ\n`;
    else if (signal.riskReward >= 1) text += `- Average ratio — risk र reward बराबर जस्तै\n`;
    else text += `- कमजोर ratio — risk धेरै, reward कम\n`;
    text += `\n`;
  }

  // === Moving Averages ===
  text += `**📊 Moving Averages:**\n`;
  if (signal.ema20 !== null) text += `- EMA 20: **${npr(signal.ema20)}** ${ltp > signal.ema20 ? "✅ Price माथि" : "❌ Price तल"}\n`;
  if (signal.sma50 !== null) text += `- SMA 50: **${npr(signal.sma50)}** ${ltp > signal.sma50 ? "✅ Price माथि" : "❌ Price तल"}\n`;
  if (signal.sma200 !== null) text += `- SMA 200: **${npr(signal.sma200)}** ${ltp > signal.sma200 ? "✅ Price माथि (Long-term bullish)" : "❌ Price तल (Long-term bearish)"}\n`;
  text += `\n`;

  // === Action Plan ===
  text += `---\n\n`;
  text += `**🎯 के गर्ने?**\n`;
  text += `- **किन्नेलाई:** Entry zone ${signal.buyZone ? `${npr(signal.buyZone[0])} – ${npr(signal.buyZone[1])}` : "—"} | Stop Loss: **${npr(signal.stopLoss)}** | Target: **${npr(signal.target1)}**\n`;
  text += `- **भइसकेकालाई:** ${signal.recommendation.includes("Buy") ? "Hold गर्नुस्, trailing SL लगाउनुस्" : signal.recommendation.includes("Sell") ? "Exit गर्न विचार गर्नुस्" : "Hold वा partial profit लिनुस्"}\n`;
  text += `- **नकिनेकालाई:** ${signal.recommendation.includes("Buy") ? "Pullback मा entry गर्ने प्रयास गर्नुस्" : signal.recommendation.includes("Sell") ? "Entry नगर्नुस्, bearish continue हुन सक्छ" : "Signal clear भएसम्म पर्खनुस्"}\n`;
  text += `- **बेच्नेलाई:** ${signal.sellZone ? `Sell zone: ${npr(signal.sellZone[0])} – ${npr(signal.sellZone[1])}` : "Resistance मा profit लिनुस्"}\n`;
  text += `\n`;

  // === One-line Summary ===
  text += `**📌 एकलाइन सारांश:**\n`;
  if (signal.recommendation === "Strong Buy") {
    text += `🟢 **${symbol} Strong BUY signal** — ${signal.confidence}% confidence। ${bullFactors.length} bullish indicators। ${recoNepali} समय छ।\n`;
  } else if (signal.recommendation === "Buy") {
    text += `🟢 **${symbol} BUY signal** — ${signal.confidence}% confidence। ${trendNepali} मा छ, entry zone मा किन्न सकिन्छ।\n`;
  } else if (signal.recommendation === "Strong Sell") {
    text += `🔴 **${symbol} Strong SELL signal** — ${signal.confidence}% confidence। ${bearFactors.length} bearish indicators। बच्नुस्।\n`;
  } else if (signal.recommendation === "Sell") {
    text += `🔴 **${symbol} SELL signal** — ${signal.confidence}% confidence। ${trendNepali} मा छ, सावधानी अपनाउनुस्।\n`;
  } else {
    text += `🟡 **${symbol} HOLD/NEUTRAL** — ${signal.confidence}% confidence। Clear signal छैन, पर्खनुस् राम्रो।\n`;
  }
  text += `\n---\n\n`;
  text += `⚠️ *विश्लेषण शिक्षाको लागि मात्र — लगानी गर्नुभन्दा आफैं विषेशज्ञसंग सलाह लिनुहोस्। Not financial advice.*`;

  return text;
}
