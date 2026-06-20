/**
 * TradingView Charting Library Datafeed Adapter
 * 
 * This implements the IDatafeed interface that TradingView's Charting Library expects.
 * It fetches data from our /api/datafeed endpoints.
 * 
 * Usage:
 *   const datafeed = new NepseDatafeed();
 *   new TradingView.widget({ datafeed, ... });
 */

const API_BASE = "/api/datafeed";

export interface SymbolInfo {
  name: string;
  full_name: string;
  description: string;
  type: string;
  exchange: string;
  listed_exchange: string;
  timezone: string;
  format: string;
  currency_code: string;
  pricescale: number;
  minmov: number;
  has_intraday: boolean;
  intraday_multipliers: string[];
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  volume_precision: number;
  session: string;
}

export interface HistoryResponse {
  s: "ok" | "no_data" | "error";
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  errmsg?: string;
}

export class NepseDatafeed {
  private realtimeCallback: ((bar: any) => void) | null = null;
  private ws: WebSocket | null = null;

  /**
   * TradingView calls this to get supported configuration
   */
  onReady(callback: (config: any) => void): void {
    fetch(`${API_BASE}?type=config`)
      .then(r => r.json())
      .then(config => callback(config))
      .catch(err => {
        console.error("[Datafeed] config error:", err);
        callback({
          supported_resolutions: ["1", "5", "15", "30", "60", "240", "D", "W", "M"],
          exchanges: [{ value: "NEPSE", name: "NEPSE", desc: "Nepal Stock Exchange" }],
          symbols_types: [{ name: "stock", value: "stock" }],
          supports_time: true,
        });
      });
  }

  /**
   * TradingView calls this to search for symbols
   */
  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: (results: any[]) => void
  ): void {
    const query = encodeURIComponent(userInput);
    fetch(`${API_BASE}?type=search&query=${query}&limit=30`)
      .then(r => r.json())
      .then(results => onResult(results))
      .catch(err => {
        console.error("[Datafeed] search error:", err);
        onResult([]);
      });
  }

  /**
   * TradingView calls this to resolve a symbol
   */
  resolveSymbol(
    symbolName: string,
    onResolve: (symbolInfo: SymbolInfo) => void,
    onError: (reason: string) => void
  ): void {
    const symbol = encodeURIComponent(symbolName);
    fetch(`${API_BASE}?type=symbols&symbol=${symbol}`)
      .then(r => {
        if (!r.ok) throw new Error("Symbol not found");
        return r.json();
      })
      .then(info => onResolve(info))
      .catch(err => {
        console.error("[Datafeed] resolve error:", err);
        onError("Symbol not found");
      });
  }

  /**
   * TradingView calls this to get historical bars
   */
  getBars(
    symbolInfo: SymbolInfo,
    resolution: string,
    periodParams: { from: number; to: number; firstDataRequest: boolean },
    onResult: (bars: any[], meta: { noData: boolean }) => void,
    onError: (reason: string) => void
  ): void {
    const { from, to, firstDataRequest } = periodParams;
    const symbol = encodeURIComponent(symbolInfo.name);
    const url = `${API_BASE}?type=history&symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`;

    fetch(url)
      .then(r => r.json())
      .then((data: HistoryResponse) => {
        if (data.s === "no_data") {
          onResult([], { noData: true });
          return;
        }
        if (data.s === "error") {
          onError(data.errmsg ?? "History error");
          return;
        }

        const bars: any[] = [];
        for (let i = 0; i < data.t.length; i++) {
          bars.push({
            time: data.t[i] * 1000, // TradingView expects milliseconds
            open: data.o[i],
            high: data.h[i],
            low: data.l[i],
            close: data.c[i],
            volume: data.v[i],
          });
        }

        onResult(bars, { noData: false });
      })
      .catch(err => {
        console.error("[Datafeed] getBars error:", err);
        onError("Failed to fetch history");
      });
  }

  /**
   * TradingView calls this to subscribe to real-time updates
   */
  subscribeBars(
    symbolInfo: SymbolInfo,
    resolution: string,
    onTick: (bar: any) => void,
    listenerGuid: string,
    onResetCacheNeededCallback: () => void
  ): void {
    this.realtimeCallback = onTick;
    this.connectWebSocket(symbolInfo.name, resolution);
  }

  /**
   * TradingView calls this to unsubscribe from real-time updates
   */
  unsubscribeBars(listenerGuid: string): void {
    this.realtimeCallback = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Connect to WebSocket for live data
   */
  private connectWebSocket(symbol: string, resolution: string): void {
    if (this.ws) {
      this.ws.close();
    }

    // Use our SSE stream as the real-time source
    // (WebSocket can be added later when upgrading to full WS server)
    const es = new EventSource(`/api/stream?symbol=${encodeURIComponent(symbol)}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "tick" && this.realtimeCallback && data.price > 0) {
          const now = Math.floor(Date.now() / 1000);
          const bucket = Math.floor(now / 60) * 60;
          this.realtimeCallback({
            time: bucket * 1000,
            open: data.price,
            high: data.price,
            low: data.price,
            close: data.price,
            volume: data.volume || 0,
          });
        }
      } catch { /* ignore */ }
    };

    es.addEventListener("candle", (event) => {
      try {
        const c = JSON.parse(event.data);
        if (this.realtimeCallback) {
          this.realtimeCallback({
            time: c.t * 1000,
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
            volume: c.v,
          });
        }
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      console.warn("[Datafeed] SSE connection error, reconnecting...");
      setTimeout(() => this.connectWebSocket(symbol, resolution), 5000);
    };

    // Store EventSource reference for cleanup
    (this as any)._es = es;
  }

  /**
   * TradingView calls this to get server time
   */
  getServerTime(callback: (time: number) => void): void {
    fetch(`${API_BASE}?type=time`)
      .then(r => r.json())
      .then(data => callback(data.time))
      .catch(() => callback(Math.floor(Date.now() / 1000)));
  }
}
