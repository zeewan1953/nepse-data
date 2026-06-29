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

type Bar = CandlestickData<Time>;
type Vol = HistogramData<Time>;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Indicators ──────────────────────────────────────────────────────────────
function sma(bars: Bar[], p: number): LineData<Time>[] {
  const o: LineData<Time>[] = []; let s = 0;
  for (let i = 0; i < bars.length; i++) { s += bars[i].close; if (i >= p) s -= bars[i - p].close; if (i >= p - 1) o.push({ time: bars[i].time, value: r2(s / p) }); }
  return o;
}
function ema(bars: Bar[], p: number): LineData<Time>[] {
  const o: LineData<Time>[] = []; const k = 2 / (p + 1); let e = bars[0]?.close ?? 0;
  for (let i = 0; i < bars.length; i++) { e = bars[i].close * k + e * (1 - k); if (i >= p) o.push({ time: bars[i].time, value: r2(e) }); }
  return o;
}
function rsi(bars: Bar[], p: number): LineData<Time>[] {
  const o: LineData<Time>[] = []; let g = 0, l = 0;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d > 0) g += d; else l -= d;
    if (i >= p) {
      const smaG = g / p, smaL = l / p;
      const rs = smaL === 0 ? 100 : smaG / smaL;
      o.push({ time: bars[i].time, value: r2(100 - 100 / (1 + rs)) });
      const remove = bars[i - p + 1].close - bars[i - p].close;
      if (remove > 0) g -= remove; else l += remove;
    }
  }
  return o;
}
function macdLine(bars: Bar[], fast: number, slow: number, signal: number): { macd: LineData<Time>[]; sig: LineData<Time>[]; hist: HistogramData<Time>[] } {
  const ef = emaFull(bars, fast), es = emaFull(bars, slow);
  const m: number[] = []; const times: Time[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (ef[i] === undefined || es[i] === undefined) { m.push(0); continue; }
    m.push(ef[i] - es[i]); times.push(bars[i].time);
  }
  const sigArr = emaFullArr(m, signal);
  const macd: LineData<Time>[] = []; const sig: LineData<Time>[] = []; const hist: HistogramData<Time>[] = [];
  for (let i = signal; i < bars.length; i++) {
    macd.push({ time: bars[i].time, value: r2(m[i]) });
    sig.push({ time: bars[i].time, value: r2(sigArr[i]) });
    hist.push({ time: bars[i].time, value: r2(m[i] - sigArr[i]), color: m[i] >= sigArr[i] ? "#26a69a" : "#ef5350" });
  }
  return { macd, sig, hist };
}
function emaFull(bars: Bar[], p: number): number[] {
  const k = 2 / (p + 1); const o: number[] = []; let e = bars[0]?.close ?? 0;
  for (let i = 0; i < bars.length; i++) { e = bars[i].close * k + e * (1 - k); o.push(e); }
  return o;
}
function emaFullArr(vals: number[], p: number): number[] {
  const k = 2 / (p + 1); const o: number[] = []; let e = vals[0] ?? 0;
  for (let i = 0; i < vals.length; i++) { e = vals[i] * k + e * (1 - k); o.push(e); }
  return o;
}
function bb(bars: Bar[], p: number, mult: number): { upper: LineData<Time>[]; middle: LineData<Time>[]; lower: LineData<Time>[] } {
  const m = sma(bars, p); const upper: LineData<Time>[] = []; const lower: LineData<Time>[] = [];
  for (let i = p - 1; i < bars.length; i++) {
    const slice = bars.slice(i - p + 1, i + 1); const avg = slice.reduce((a, b) => a + b.close, 0) / p;
    const sq = slice.reduce((a, b) => a + (b.close - avg) ** 2, 0) / p; const std = Math.sqrt(sq);
    upper.push({ time: bars[i].time, value: r2(avg + mult * std) });
    lower.push({ time: bars[i].time, value: r2(avg - mult * std) });
  }
  return { upper, middle: m.slice(p - 1), lower };
}

// ── Resolution presets ──────────────────────────────────────────────────────
const RESOLUTIONS = [
  { label: "1D", days: 1 },
  { label: "5D", days: 5 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "MAX", days: 9999 },
] as const;

type IndicatorKey = "sma9" | "sma20" | "sma50" | "ema9" | "ema20" | "ema50" | "rsi" | "macd" | "bb";

interface LiveChartProps {
  symbol?: string;
}

export default function LiveChart({ symbol = "NEPSE" }: LiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barsRef = useRef<Bar[]>([]);

  const [resolution, setResolution] = useState<number>(365);
  const [indicators, setIndicators] = useState<Set<IndicatorKey>>(new Set(["sma20"]));
  const [headerInfo, setHeaderInfo] = useState<{ p: number; ch: number; pct: number; o: number; h: number; l: number; v: number } | null>(null);
  const [status, setStatus] = useState("loading");

  const indicatorRefs = useRef<Map<string, ISeriesApi<any>>>(new Map());

  const isNepse = symbol === "NEPSE" || symbol === "NEPSE INDEX";

  // ── History ───────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async (resDays: number) => {
    try {
      const toTs = Math.floor(Date.now() / 1000) + 86400;
      const fromTs = toTs - resDays * 86400;

      if (isNepse) {
        const r = await fetch("/api/index-graph", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "No index data");
        const pts = j.points as [number, number][];
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
        return { bars, vols, price: bars[bars.length - 1]?.close ?? 0, prevClose: bars[0]?.open ?? 0 };
      }

      let res = await fetch(`/api/chart/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromTs}&to=${toTs}`, { cache: "no-store" });
      let udf = await res.json();
      if (udf.s === "ok" && Array.isArray(udf.t) && udf.t.length > 0) {
        const bars: Bar[] = udf.t.map((t: number, i: number) => ({ time: t as Time, open: udf.o[i], high: udf.h[i], low: udf.l[i], close: udf.c[i] }));
        const vols: Vol[] = udf.t.map((t: number, i: number) => ({ time: t as Time, value: udf.v[i], color: udf.c[i] >= udf.o[i] ? "#26a69a44" : "#ef535044" }));
        barsRef.current = bars;
        const last = bars[bars.length - 1];
        const prev = bars.length > 1 ? bars[bars.length - 2] : undefined;
        return { bars, vols, price: last?.close ?? 0, prevClose: prev?.close ?? 0 };
      }

      res = await fetch(`/api/security/${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed");
      const content = (json.history?.content ?? []) as Array<{ businessDate: string; openPrice: number; highPrice: number; lowPrice: number; closePrice: number; totalTradedQuantity: number }>;
      if (!content.length) throw new Error("No data");
      const sorted = content.slice().sort((a, b) => a.businessDate.localeCompare(b.businessDate)).filter(c => c.closePrice > 0);
      const bars: Bar[] = sorted.map(c => ({ time: c.businessDate as Time, open: c.openPrice, high: c.highPrice, low: c.lowPrice, close: c.closePrice }));
      const vols: Vol[] = sorted.map(c => ({ time: c.businessDate as Time, value: c.totalTradedQuantity, color: c.closePrice >= c.openPrice ? "#26a69a44" : "#ef535044" }));
      barsRef.current = bars;
      const last = bars[bars.length - 1];
      const prev = bars.length > 1 ? bars[bars.length - 2] : undefined;
      return { bars, vols, price: last?.close ?? 0, prevClose: prev?.close ?? 0 };
    } catch (e) { throw e; }
  }, [symbol, isNepse]);

  // ── Apply data to chart ──────────────────────────────────────────────────
  const applyData = useCallback((bars: Bar[], vols: Vol[]) => {
    const c = candleRef.current, v = volRef.current;
    if (!c || !v) return;
    c.setData(bars);
    v.setData(vols);
    chartRef.current?.timeScale().fitContent();
  }, []);

  // ── Update indicators ────────────────────────────────────────────────────
  const applyIndicators = useCallback((bars: Bar[], active: Set<IndicatorKey>) => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = indicatorRefs.current;
    map.forEach((s, k) => { if (!active.has(k as IndicatorKey)) { chart.removeSeries(s); map.delete(k); } });

    if (active.has("sma9")) {
      if (!map.has("sma9")) map.set("sma9", chart.addSeries(LineSeries, { color: "#F5A623", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }));
      map.get("sma9")?.setData(sma(bars, 9));
    }
    if (active.has("sma20")) {
      if (!map.has("sma20")) map.set("sma20", chart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }));
      map.get("sma20")?.setData(sma(bars, 20));
    }
    if (active.has("sma50")) {
      if (!map.has("sma50")) map.set("sma50", chart.addSeries(LineSeries, { color: "#9b59b6", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }));
      map.get("sma50")?.setData(sma(bars, 50));
    }
    if (active.has("ema9")) {
      if (!map.has("ema9")) map.set("ema9", chart.addSeries(LineSeries, { color: "#e67e22", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }));
      map.get("ema9")?.setData(ema(bars, 9));
    }
    if (active.has("ema20")) {
      if (!map.has("ema20")) map.set("ema20", chart.addSeries(LineSeries, { color: "#1abc9c", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }));
      map.get("ema20")?.setData(ema(bars, 20));
    }
    if (active.has("ema50")) {
      if (!map.has("ema50")) map.set("ema50", chart.addSeries(LineSeries, { color: "#e74c3c", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }));
      map.get("ema50")?.setData(ema(bars, 50));
    }
    if (active.has("rsi")) {
      if (!map.has("rsi_pane")) {
        const p = chart.addSeries(LineSeries, { color: "#7f8c8d", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: "rsi" });
        map.set("rsi_pane", p);
        chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.4, bottom: 0.25 }, visible: true });
      }
      map.get("rsi_pane")?.setData(rsi(bars, 14));
    } else { const p = map.get("rsi_pane"); if (p) { chart.removeSeries(p); map.delete("rsi_pane"); } }

    if (active.has("macd")) {
      const { macd, sig, hist } = macdLine(bars, 12, 26, 9);
      if (!map.has("macd_m")) { const s = chart.addSeries(LineSeries, { color: "#3498db", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: "macd" }); map.set("macd_m", s); chart.priceScale("macd").applyOptions({ scaleMargins: { top: 0.65, bottom: 0.1 }, visible: true }); }
      if (!map.has("macd_s")) { const s = chart.addSeries(LineSeries, { color: "#e74c3c", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: "macd" }); map.set("macd_s", s); }
      if (!map.has("macd_h")) { const s = chart.addSeries(HistogramSeries, { priceScaleId: "macd", priceFormat: { type: "volume" } }); map.set("macd_h", s); }
      map.get("macd_m")?.setData(macd);
      map.get("macd_s")?.setData(sig);
      map.get("macd_h")?.setData(hist);
    } else {
      ["macd_m", "macd_s", "macd_h"].forEach(k => { const p = map.get(k); if (p) { chart.removeSeries(p); map.delete(k); } });
    }

    if (active.has("bb")) {
      const { upper, middle, lower } = bb(bars, 20, 2);
      if (!map.has("bb_u")) { const s = chart.addSeries(LineSeries, { color: "#e74c3c44", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); map.set("bb_u", s); }
      if (!map.has("bb_m")) { const s = chart.addSeries(LineSeries, { color: "#e74c3c44", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); map.set("bb_m", s); }
      if (!map.has("bb_l")) { const s = chart.addSeries(LineSeries, { color: "#e74c3c44", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }); map.set("bb_l", s); }
      map.get("bb_u")?.setData(upper);
      map.get("bb_m")?.setData(middle);
      map.get("bb_l")?.setData(lower);
    } else {
      ["bb_u", "bb_m", "bb_l"].forEach(k => { const p = map.get(k); if (p) { chart.removeSeries(p); map.delete(k); } });
    }
  }, []);

  // ── Main load ────────────────────────────────────────────────────────────
  const load = useCallback(async (resDays: number) => {
    setStatus("loading");
    try {
      const data = await loadHistory(resDays);
      applyData(data.bars, data.vols);
      applyIndicators(data.bars, indicators);
      const ch = data.price - data.prevClose;
      setHeaderInfo({ p: data.price, ch, pct: data.prevClose > 0 ? (ch / data.prevClose) * 100 : 0, o: data.bars[data.bars.length - 1]?.open ?? 0, h: data.bars.reduce((a, b) => Math.max(a, b.high), 0), l: data.bars.reduce((a, b) => Math.min(a, b.low), Infinity), v: data.vols.reduce((a, b) => a + b.value, 0) });
      setStatus("live");
    } catch { setStatus("error"); }
  }, [loadHistory, applyData, applyIndicators, indicators]);

  // ── Create chart ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0b0f19" }, textColor: "#787b86", fontSize: 11 },
      grid: { vertLines: { color: "#1e2538" }, horzLines: { color: "#1e2538" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1e2538" },
      timeScale: { borderColor: "#1e2538", timeVisible: false, rightOffset: 4, barSpacing: 8 },
      autoSize: true,
      handleScroll: { vertTouchDrag: false },
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

    chart.subscribeCrosshairMove(param => {
      const bar = param.seriesData.get(candles) as Bar | undefined;
      if (bar) {
        setHeaderInfo(prev => ({ ...prev!, o: bar.open, h: bar.high, l: bar.low, p: bar.close, v: 0 }));
      }
    });

    return () => { chart.remove(); chartRef.current = null; candleRef.current = null; volRef.current = null; indicatorRefs.current.clear(); };
  }, []);

  // ── Load on mount & resolution change ────────────────────────────────────
  useEffect(() => { load(resolution); }, [resolution, symbol]);

  // ── Toggle indicator ─────────────────────────────────────────────────────
  const toggleIndicator = useCallback((key: IndicatorKey) => {
    setIndicators(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (barsRef.current.length > 0) {
      applyIndicators(barsRef.current, indicators);
    }
  }, [indicators, applyIndicators]);

  // ── Resolutions ──────────────────────────────────────────────────────────
  const isUp = headerInfo ? headerInfo.ch >= 0 : true;
  const accentColor = isUp ? "#26a69a" : "#ef5350";

  return (
    <div className="flex h-full flex-col bg-[#0b0f19]">
      {/* ── toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[#1e2538] px-3 py-1">
        {/* symbol & price */}
        <div className="flex items-center gap-2 mr-3">
          <span className="text-sm font-bold text-white">{symbol}</span>
          {headerInfo && (
            <>
              <span className={`text-sm font-extrabold tabular-nums ${accentColor}`}>{r2(headerInfo.p)}</span>
              <span className={`text-xs font-bold tabular-nums ${accentColor}`}>
                {headerInfo.ch >= 0 ? "+" : ""}{r2(headerInfo.ch)} ({r2(headerInfo.pct)}%)
              </span>
            </>
          )}
        </div>

        {/* intervals */}
        <div className="flex items-center gap-0.5 border-r border-[#1e2538] pr-2 mr-2">
          {RESOLUTIONS.map(r => (
            <button key={r.label} onClick={() => setResolution(r.days)} className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${resolution === r.days ? "bg-[#2962ff] text-white" : "text-[#787b86] hover:text-white"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* indicators */}
        <div className="flex items-center gap-0.5 flex-wrap">
          {(["sma9", "sma20", "sma50", "ema9", "ema20", "ema50", "rsi", "macd", "bb"] as IndicatorKey[]).map(k => (
            <button key={k} onClick={() => toggleIndicator(k)} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${indicators.has(k) ? "bg-[#2962ff] text-white" : "text-[#787b86] hover:text-white"}`}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>

        {/* status */}
        <div className="ml-auto flex items-center gap-2">
          {status === "live" && <span className="flex items-center gap-1 text-[10px] font-bold text-[#26a69a]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#26a69a]" />LIVE</span>}
          {status === "loading" && <span className="text-[10px] text-[#787b86]">Loading...</span>}
          {status === "error" && <span className="text-[10px] text-[#ef5350]">Error</span>}
        </div>
      </div>

      {/* ── crosshair legend ─────────────────────────────────────────── */}
      {headerInfo && (
        <div className="flex items-center gap-3 border-b border-[#1e2538] px-3 py-1 text-[10px] tabular-nums text-[#787b86]">
          <span>O: <b className={`${accentColor}`}>{r2(headerInfo.o)}</b></span>
          <span>H: <b className={`${accentColor}`}>{r2(headerInfo.h)}</b></span>
          <span>L: <b className={`${accentColor}`}>{r2(headerInfo.l)}</b></span>
          <span>C: <b className={`${accentColor}`}>{r2(headerInfo.p)}</b></span>
          <span>V: <b className="text-white">{r2(headerInfo.v)}</b></span>
        </div>
      )}

      {/* ── chart container ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
