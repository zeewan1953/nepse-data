"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from "lightweight-charts";
import TradingViewChart from "./TradingViewChart";
import { usePoll } from "@/lib/useLive";
import { isNepseMarketOpen, getNPTNow } from "@/lib/market-hours";

type Bar = CandlestickData<Time>;
type Vol = HistogramData<Time>;
const r2 = (n: number) => Math.round(n * 100) / 100;

function smaLine(bars: Bar[], period: number): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: bars[i].time, value: r2(sum / period) });
  }
  return out;
}

interface LiveChartProps {
  symbol?: string;
  height?: number;
  showHeader?: boolean;
}

/**
 * Smart Chart Wrapper
 * 
 * Priority:
 * 1. TradingView Charting Library (if /public/tradingview/charting_library.js exists)
 * 2. lightweight-charts (TradingView's own library - already installed)
 * 
 * The app works immediately with lightweight-charts.
 * When you add the TradingView Charting Library files, it auto-upgrades.
 */
export default function LiveChart({
  symbol = "NEPSE",
  height = 420,
  showHeader = true,
}: LiveChartProps) {
  const [useTradingView, setUseTradingView] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maRef = useRef<ISeriesApi<"Line"> | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<Bar[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const [headerInfo, setHeaderInfo] = useState<{ price: number; change: number; pct: number } | null>(null);
  const [status, setStatus] = useState("loading");
  const [barCount, setBarCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isNepse = symbol === "NEPSE" || symbol === "NEPSE INDEX";

  // Check if TradingView Charting Library is available
  useEffect(() => {
    const check = () => {
      // Check if script is already loaded
      if ((window as any).TradingView?.widget) {
        setUseTradingView(true);
        return;
      }
      // Try to load it
      const script = document.createElement("script");
      script.src = "/tradingview/charting_library.js";
      script.async = true;
      script.onload = () => {
        if ((window as any).TradingView?.widget) {
          setUseTradingView(true);
        } else {
          setUseTradingView(false);
        }
      };
      script.onerror = () => setUseTradingView(false);
      document.head.appendChild(script);
    };
    check();
  }, []);

  const updateLegend = useCallback((bar?: Bar) => {
    const el = legendRef.current;
    if (!el || !bar) return;
    const up = bar.close >= bar.open;
    const c = up ? "#26a69a" : "#ef5350";
    el.innerHTML = `O <b style="color:${c}">${r2(bar.open)}</b> H <b style="color:${c}">${r2(bar.high)}</b> L <b style="color:${c}">${r2(bar.low)}</b> C <b style="color:${c}">${r2(bar.close)}</b>`;
  }, []);

  // ── Load historical data from /api/chart/history ────────────────────
  const loadHistory = useCallback(async () => {
    try {
      if (isNepse) {
        const res = await fetch("/api/index-graph", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "No index data");
        const pts = json.points as [number, number][];
        if (!Array.isArray(pts) || pts.length < 2) throw new Error("No index data");

        const sec = 60;
        const bk = new Map<number, { o: number; h: number; l: number; c: number; v: number }>();
        for (const [t, v] of pts) {
          if (t <= 0 || v <= 0) continue;
          const b = Math.floor(t / sec) * sec;
          const cur = bk.get(b);
          if (!cur) bk.set(b, { o: v, h: v, l: v, c: v, v: 1 });
          else { cur.h = Math.max(cur.h, v); cur.l = Math.min(cur.l, v); cur.c = v; cur.v++; }
        }
        const sorted = [...bk.entries()].sort((a, b) => a[0] - b[0]);
        const bars: Bar[] = sorted.map(([t, v]) => ({ time: t as Time, open: r2(v.o), high: r2(v.h), low: r2(v.l), close: r2(v.c) }));
        const vols: Vol[] = sorted.map(([, v], i) => ({ time: bars[i].time, value: v.v, color: v.c >= v.o ? "#26a69a44" : "#ef535044" }));

        barsRef.current = bars;
        setBarCount(bars.length);
        candleRef.current?.setData(bars);
        volRef.current?.setData(vols);
        maRef.current?.setData(smaLine(bars, 20));
        chartRef.current?.timeScale().fitContent();

        const last = bars[bars.length - 1];
        const first = bars[0];
        if (last && first) {
          const ch = last.close - first.open;
          setHeaderInfo({ price: last.close, change: ch, pct: first.open > 0 ? (ch / first.open) * 100 : 0 });
        }
        setErrorMsg(null);
        setStatus("ready");
        return;
      }

      // Individual stock: use /api/chart/history (UDF format)
      const fromTs = Math.floor((Date.now() - 365 * 86400000) / 1000);
      const toTs = Math.floor(Date.now() / 1000) + 86400;
      let res = await fetch(`/api/chart/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromTs}&to=${toTs}`, { cache: "no-store" });
      let udf = await res.json();

      if (udf.s === "ok" && Array.isArray(udf.t) && udf.t.length > 0) {
        const bars: Bar[] = udf.t.map((t: number, i: number) => ({
          time: t as Time, open: udf.o[i], high: udf.h[i], low: udf.l[i], close: udf.c[i],
        }));
        const vols: Vol[] = udf.t.map((t: number, i: number) => ({
          time: t as Time, value: udf.v[i], color: udf.c[i] >= udf.o[i] ? "#26a69a44" : "#ef535044",
        }));

        barsRef.current = bars;
        setBarCount(bars.length);
        candleRef.current?.setData(bars);
        volRef.current?.setData(vols);
        maRef.current?.setData(smaLine(bars, 20));
        chartRef.current?.timeScale().fitContent();

        const last = bars[bars.length - 1];
        const prev = bars.length > 1 ? bars[bars.length - 2] : undefined;
        if (last) {
          const ch = prev ? last.close - prev.close : 0;
          setHeaderInfo({ price: last.close, change: ch, pct: prev?.close ? (ch / prev.close) * 100 : 0 });
        }
        setErrorMsg(null);
        setStatus("ready");
        return;
      }

      // Fallback: /api/security for stock daily history
      res = await fetch(`/api/security/${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load");
      const content = (json.history?.content ?? []) as Array<{ businessDate: string; openPrice: number; highPrice: number; lowPrice: number; closePrice: number; totalTradedQuantity: number }>;
      if (!content.length) throw new Error("No historical data");
      const sorted = content.slice().sort((a, b) => a.businessDate.localeCompare(b.businessDate));
      const bars: Bar[] = sorted.map(c => ({ time: c.businessDate as Time, open: c.openPrice, high: c.highPrice, low: c.lowPrice, close: c.closePrice }));
      const vols: Vol[] = sorted.map(c => ({ time: c.businessDate as Time, value: c.totalTradedQuantity, color: c.closePrice >= c.openPrice ? "#26a69a44" : "#ef535044" }));
      barsRef.current = bars;
      setBarCount(bars.length);
      candleRef.current?.setData(bars);
      volRef.current?.setData(vols);
      maRef.current?.setData(smaLine(bars, 20));
      chartRef.current?.timeScale().fitContent();
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      if (last) {
        const ch = prev ? last.close - prev.close : 0;
        setHeaderInfo({ price: last.close, change: ch, pct: prev?.close ? (ch / prev.close) * 100 : 0 });
      }
      setErrorMsg(null);
      setStatus("ready");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }, [symbol, isNepse]);

  // ── Poll /api/chart/today-snapshot for live updates ────────────────
  const pollToday = useCallback(async () => {
    if (isNepse) return;
    try {
      const res = await fetch(`/api/chart/today-snapshot?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!res.ok) { setStatus("reconnecting"); return; }
      const today = await res.json();
      if (!today) { setStatus("ready"); return; }

      setStatus("live");
      const bar: Bar = { time: today.time as Time, open: today.open, high: today.high, low: today.low, close: today.close };

      const bars = barsRef.current;
      if (bars.length > 0) {
        const lastIdx = bars.length - 1;
        const lastTime = typeof bars[lastIdx].time === "string"
          ? new Date(bars[lastIdx].time as string).getTime() / 1000
          : (bars[lastIdx].time as number);

        if (Math.abs(lastTime - today.time) < 86400) {
          bars[lastIdx] = bar;
          candleRef.current?.update(bar);
        } else {
          bars.push(bar);
          if (bars.length > 500) barsRef.current = bars.slice(-500);
          setBarCount(bars.length);
          candleRef.current?.setData(bars);
          volRef.current?.setData(bars.map(b => ({
            time: b.time, value: 0, color: b.close >= b.open ? "#26a69a44" : "#ef535044",
          })));
          maRef.current?.setData(smaLine(bars, 20));
        }

        setHeaderInfo(prev => {
          const ch = prev ? today.close - (prev.price - prev.change) : 0;
          return { price: today.close, change: ch, pct: ch !== 0 ? (ch / (prev?.price ?? today.close)) * 100 : 0 };
        });
        updateLegend(bar);
      }
    } catch { setStatus("reconnecting"); }
  }, [symbol, isNepse, updateLegend]);

  // Poll every 10s during market hours
  useEffect(() => {
    if (useTradingView || isNepse) return;
    pollToday();
    const id = setInterval(() => {
      if (isNepseMarketOpen(getNPTNow())) {
        pollToday();
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [pollToday, useTradingView, isNepse]);

  // Fallback SSE connect for symbols where today-snapshot returns null
  const connectLive = useCallback(() => {
    if (isNepse) return;
    esRef.current?.close();
    const es = new EventSource(`/api/stream?symbol=${encodeURIComponent(symbol)}`);
    esRef.current = es;

    es.onopen = () => { if (status !== "live") setStatus("live"); };
    es.onerror = () => { /* ignore, poll handles reconnection */ };

    es.addEventListener("tick", (e) => {
      try {
        const t = JSON.parse(e.data);
        if (t.price <= 0) return;
        const bars = barsRef.current;
        if (bars.length > 0) {
          const last = { ...bars[bars.length - 1] };
          last.high = Math.max(last.high, t.price);
          last.low = Math.min(last.low, t.price);
          last.close = t.price;
          bars[bars.length - 1] = last;
          candleRef.current?.update(last);
          updateLegend(last);
        }
      } catch { /* ignore */ }
    });
  }, [symbol, isNepse, updateLegend, status]);

  // ── Create chart (once) ────────────────────────────────────────────
  useEffect(() => {
    // Skip if using TradingView
    if (useTradingView) return;
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8a93a6", fontSize: 11 },
      grid: { vertLines: { color: "rgba(42,46,57,0.4)" }, horzLines: { color: "rgba(42,46,57,0.4)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#222a3a" },
      timeScale: { borderColor: "#222a3a", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350", borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });
    candleRef.current = candles;

    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volRef.current = vol;

    const ma = chart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    maRef.current = ma;

    chart.subscribeCrosshairMove(param => {
      updateLegend(param.seriesData.get(candles) as Bar | undefined ?? barsRef.current[barsRef.current.length - 1]);
    });

    return () => { chart.remove(); chartRef.current = null; candleRef.current = null; volRef.current = null; maRef.current = null; };
  }, [updateLegend, useTradingView]);

  // ── Load + connect on symbol change ────────────────────────────────
  useEffect(() => {
    // Skip if using TradingView (it handles its own data)
    if (useTradingView) return;

    barsRef.current = [];
    setStatus("loading");
    setErrorMsg(null);
    loadHistory();
    connectLive();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [loadHistory, connectLive, useTradingView]);

  // ── Render ─────────────────────────────────────────────────────────
  // If still checking, show loading
  if (useTradingView === null) {
    return (
      <section className="flex h-full flex-col overflow-hidden rounded-xl border border-[#222a3a] bg-[#0b0f19]">
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <div className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-[#2962ff] border-t-transparent mx-auto" />
            <p className="text-xs text-[#8a93a6]">Loading chart engine...</p>
          </div>
        </div>
      </section>
    );
  }

  // If TradingView is available, use it
  if (useTradingView) {
    return (
      <section className="flex h-full flex-col overflow-hidden rounded-xl border border-[#222a3a] bg-[#0b0f19]">
        {showHeader && (
          <div className="flex items-center justify-between border-b border-[#222a3a] px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-white">{isNepse ? "📊 NEPSE Index" : `📈 ${symbol}`}</span>
              <span className="rounded bg-[#2962ff] px-1.5 py-0.5 text-[9px] font-bold text-white">TradingView</span>
            </div>
          </div>
        )}
        <div className="relative min-h-0 flex-1" style={height < 9000 ? { height } : undefined}>
          <TradingViewChart symbol={symbol} interval="5" autosize height={height} />
        </div>
      </section>
    );
  }

  // Fallback to lightweight-charts
  const statusLabel = status === "live" ? "LIVE" : status === "loading" ? "Loading…" : status === "reconnecting" ? "Reconnecting…" : status === "error" ? "" : "READY";
  const statusColor = status === "live" ? "text-up" : status === "error" ? "text-down" : "text-muted";

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-[#222a3a] bg-[#0b0f19]">
      {showHeader && (
        <div className="flex items-center justify-between border-b border-[#222a3a] px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white">{isNepse ? "📊 NEPSE Index" : `📈 ${symbol}`}</span>
            {headerInfo && (
              <>
                <span className="text-sm font-extrabold tabular-nums text-white">{r2(headerInfo.price)}</span>
                <span className={`text-xs font-bold tabular-nums ${headerInfo.change >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                  {headerInfo.change >= 0 ? "+" : ""}{r2(headerInfo.change)} ({r2(headerInfo.pct)}%)
                </span>
              </>
            )}
            <span ref={legendRef} className="hidden text-[10px] tabular-nums text-[#8a93a6] sm:inline" />
          </div>
          <div className="flex items-center gap-2">
            {barCount > 0 && <span className="text-[10px] text-[#8a93a6]">{barCount} bars</span>}
            <span className={`flex items-center gap-1 text-[10px] font-bold ${statusColor}`}>
              {status === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#26a69a]" />}
              {statusLabel}
            </span>
            {errorMsg && <span className="text-[10px] text-[#ef5350]">{errorMsg}</span>}
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1" style={height < 9000 ? { height } : undefined}>
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </section>
  );
}
