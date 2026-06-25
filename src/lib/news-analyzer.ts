// News sentiment analyzer for Nepali stock market
// Sources: MeroLagani news (primary), configurable fallbacks

const MERO_BASE = "https://merolagani.com";
const MERO_HEADERS = {
  "Accept": "application/json, text/html",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://merolagani.com/",
};

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  symbol?: string;
  timestamp: string;
};

const POSITIVE_WORDS = [
  "profit", "growth", "dividend", "bonus", "right share", "positive", "gain",
  "increase", "rise", "upgrade", "approve", "sanction", "agreement", "partnership",
  "expansion", "acquisition", "merger", "record high", "breakthrough", "launch",
  "नाफा", "वृद्धि", "लाभांश", "बोनस", "अधिकार", "सकारात्मक",
];

const NEGATIVE_WORDS = [
  "loss", "decline", "fall", "decrease", "down", "regulator", "penalty",
  "investigation", "probe", "fraud", "default", "downgrade", "negative",
  "suspension", "ban", "restriction", "crash", "volatile", "uncertainty",
  "debentures", "loan", "debt", "protest", "strike",
  "नोक्सान", "गिरावट", "अनुसन्धान", "जरिवाना",
];

export function analyzeSentiment(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  let posScore = 0;
  let negScore = 0;

  for (const w of POSITIVE_WORDS) {
    if (lower.includes(w.toLowerCase())) posScore++;
  }
  for (const w of NEGATIVE_WORDS) {
    if (lower.includes(w.toLowerCase())) negScore++;
  }

  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

export async function fetchMeroLaganiNews(): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${MERO_BASE}/handlers/webrequesthandler.ashx?type=news&page=1`, {
      signal: AbortSignal.timeout(8000),
      headers: MERO_HEADERS,
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.slice(0, 20).map((n: any) => ({
      title: n.title || n.TITLE || "",
      url: `${MERO_BASE}/News/${n.id || n.ID || ""}`,
      source: "MeroLagani",
      summary: (n.summary || n.SUMMARY || n.content || "").slice(0, 200),
      sentiment: analyzeSentiment((n.title || "") + " " + (n.summary || "")),
      symbol: n.symbol || n.SYMBOL || undefined,
      timestamp: n.date || n.DATE || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// Extract stock symbols from news text
export function extractSymbols(text: string, allSymbols: string[]): string[] {
  const found: string[] = [];
  const upper = text.toUpperCase();
  for (const sym of allSymbols) {
    if (upper.includes(sym)) found.push(sym);
  }
  return found;
}

// Score news sentiment for a given symbol
export function scoreNewsSentiment(symbol: string, news: NewsItem[]): { score: number; count: number; recent: NewsItem[] } {
  const relevant = news.filter((n) => n.symbol === symbol || n.title.toUpperCase().includes(symbol));
  if (!relevant.length) return { score: 0, count: 0, recent: [] };

  let score = 0;
  for (const n of relevant) {
    if (n.sentiment === "positive") score += 1;
    else if (n.sentiment === "negative") score -= 1;
  }

  return {
    score,
    count: relevant.length,
    recent: relevant.slice(0, 3),
  };
}
