const activeSubscriptions: Record<string, ReturnType<typeof setInterval>> = {};

export const NEPSE_ChartDatafeed = {
  onReady: (callback: (config: any) => void) => {
    fetch("/api/chart/config")
      .then((res) => res.json())
      .then((config) => setTimeout(() => callback(config), 0))
      .catch(() =>
        callback({
          supported_resolutions: ["D"],
          exchanges: [{ value: "NEPSE", name: "NEPSE", desc: "Nepal Stock Exchange" }],
          symbols_types: [{ name: "stock", value: "stock" }],
          supports_search: true,
          supports_group_request: false,
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: true,
        }),
      );
  },

  searchSymbols: (
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResultReadyCallback: (results: any[]) => void,
  ) => {
    fetch(`/api/chart/symbols?query=${encodeURIComponent(userInput)}`)
      .then((res) => res.json())
      .then(onResultReadyCallback)
      .catch(() => onResultReadyCallback([]));
  },

  resolveSymbol: (
    symbolName: string,
    onSymbolResolvedCallback: (info: any) => void,
    onResolveErrorCallback: (reason: string) => void,
  ) => {
    fetch(`/api/chart/symbol-info?symbol=${encodeURIComponent(symbolName)}`)
      .then((res) => {
        if (res.status === 404) throw new Error("not_found");
        return res.json();
      })
      .then((info) => {
        onSymbolResolvedCallback({
          name: info.symbol,
          ticker: info.symbol,
          description: info.symbol,
          type: "stock",
          session: info.session,
          timezone: info.timezone,
          exchange: "NEPSE",
          minmov: 1,
          pricescale: 100,
          has_intraday: info.has_intraday,
          supported_resolutions: info.supported_resolutions,
          volume_precision: 0,
          data_status: "streaming",
        });
      })
      .catch(() => onResolveErrorCallback("Symbol not found"));
  },

  getBars: (
    symbolInfo: { ticker: string },
    resolution: string,
    periodParams: { from: number; to: number; firstDataRequest: boolean },
    onHistoryCallback: (bars: any[], meta: { noData: boolean }) => void,
    onErrorCallback: (reason: string) => void,
  ) => {
    const { from, to } = periodParams;
    fetch(
      `/api/chart/history?symbol=${symbolInfo.ticker}&resolution=${resolution}&from=${from}&to=${to}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.s === "no_data") {
          onHistoryCallback([], { noData: true });
          return;
        }
        if (data.s === "error") {
          onErrorCallback(data.errmsg ?? "History error");
          return;
        }
        const bars = data.t.map((t: number, i: number) => ({
          time: t * 1000,
          open: data.o[i],
          high: data.h[i],
          low: data.l[i],
          close: data.c[i],
          volume: data.v[i],
        }));
        onHistoryCallback(bars, { noData: false });
      })
      .catch((err) => onErrorCallback(err.message));
  },

  subscribeBars: (
    symbolInfo: { ticker: string },
    _resolution: string,
    onRealtimeCallback: (bar: any) => void,
    subscriberUID: string,
    _onResetCacheNeededCallback: () => void,
  ) => {
    const interval = setInterval(() => {
      fetch(`/api/chart/today-snapshot?symbol=${symbolInfo.ticker}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((snapshot) => {
          if (!snapshot) return;
          onRealtimeCallback({
            time: snapshot.time * 1000,
            open: snapshot.open,
            high: snapshot.high,
            low: snapshot.low,
            close: snapshot.close,
            volume: snapshot.volume,
          });
        });
    }, 10000);
    activeSubscriptions[subscriberUID] = interval;
  },

  unsubscribeBars: (subscriberUID: string) => {
    clearInterval(activeSubscriptions[subscriberUID]);
    delete activeSubscriptions[subscriberUID];
  },
};
