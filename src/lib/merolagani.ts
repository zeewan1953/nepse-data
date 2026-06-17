// MeroLagani API client for live market data
// Uses the webrequesthandler.ashx endpoint which returns JSON

const MERO_BASE = "https://merolagani.com";
const MERO_HEADERS = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://merolagani.com/MarketSummary.aspx",
};

export type MeroStock = {
  s: string;   // symbol
  lp: number;  // last price
  c: number;   // change (absolute)
  q: number;   // quantity
};

export type MeroMarketSummary = {
  mt: string;           // market status ("ok" = open)
  overall: {
    d: string;          // date
    t: string;          // turnover
    q: string;          // quantity
    tn: string;         // transactions
    st: string;         // scrips traded
    mc: string;         // market cap
    fc: string;         // float cap
  };
  turnover: {
    date: string;
    detail: Array<{
      s: string;        // symbol
      n: string;        // name
      lp: number;       // last price
      t: number;        // turnover
      pc: number;       // % change
      h: number;        // high
      l: number;        // low
      op: number;       // open
      q: number;        // quantity
    }>;
  };
  sector: {
    date: string;
    detail: Array<{
      s: string;        // sector name
      t: number;        // turnover
      q: number;        // quantity
    }>;
  };
  broker: {
    date: string;
    detail: Array<{
      b: string;        // broker code
      n: string;        // name
      p: number;        // purchase
      s: number;        // sell
      m: number;        // net
      t: number;        // total
    }>;
  };
  stock: {
    date: string;
    detail: MeroStock[];
  };
};

// Fetch market summary from MeroLagani
export async function fetchMeroLaganiSummary(): Promise<MeroMarketSummary | null> {
  try {
    const res = await fetch(`${MERO_BASE}/handlers/webrequesthandler.ashx?type=market_summary`, {
      signal: AbortSignal.timeout(10000),
      headers: MERO_HEADERS,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.mt && data.stock?.detail?.length > 50) {
      return data as MeroMarketSummary;
    }
  } catch {
    // MeroLagani fetch failed
  }
  return null;
}

// Calculate top gainers from MeroLagani stock data
export function calcMeroGainers(stocks: MeroStock[], limit = 10): MeroStock[] {
  return [...stocks]
    .filter((s) => s.c > 0)
    .sort((a, b) => {
      const pcA = a.lp ? a.c / (a.lp - a.c) : 0;
      const pcB = b.lp ? b.c / (b.lp - b.c) : 0;
      return pcB - pcA;
    })
    .slice(0, limit);
}

// Calculate top losers from MeroLagani stock data
export function calcMeroLosers(stocks: MeroStock[], limit = 10): MeroStock[] {
  return [...stocks]
    .filter((s) => s.c < 0)
    .sort((a, b) => {
      const pcA = a.lp ? a.c / (a.lp - a.c) : 0;
      const pcB = b.lp ? b.c / (b.lp - b.c) : 0;
      return pcA - pcB;
    })
    .slice(0, limit);
}

// Calculate % change for a stock
export function calcMeroPercent(stock: MeroStock): number {
  if (!stock.lp || stock.lp === stock.c) return 0;
  return (stock.c / (stock.lp - stock.c)) * 100;
}
