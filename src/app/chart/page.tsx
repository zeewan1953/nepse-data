"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  type LineData,
  type HistogramData,
  type Time,
} from "lightweight-charts";

type TF = "5m" | "15m" | "30m" | "1H" | "1D" | "1W";
const TIMEFRAMES: TF[] = ["5m", "15m", "30m", "1H", "1D", "1W"];
const TF_MIN: Record<TF, number> = { "5m": 5, "15m": 15, "30m": 30, "1H": 60, "1D": 0, "1W": 0 };

type Bar = CandlestickData<Time>;
type Vol = HistogramData<Time>;

const IND = ["MA20", "MA50", "EMA20", "BB", "VOL", "RSI", "MACD"] as const;
type Indicator = (typeof IND)[number];

// ---- indicator math (aligned to bar times) ----
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
function emaLine(bars: Bar[], period: number): LineData<Time>[] {
  if (bars.length < period) return [];
  const k = 2 / (period + 1);
  const out: LineData<Time>[] = [];
  let prev = bars.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
  out.push({ time: bars[period - 1].time, value: r2(prev) });
  for (let i = period; i < bars.length; i++) {
    prev = bars[i].close * k + prev * (1 - k);
    out.push({ time: bars[i].time, value: r2(prev) });
  }
  return out;
}
function bollLines(bars: Bar[], period = 20, mult = 2) {
  const upper: LineData<Time>[] = [];
  const lower: LineData<Time>[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1).map((b) => b.close);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    upper.push({ time: bars[i].time, value: r2(mean + mult * sd) });
    lower.push({ time: bars[i].time, value: r2(mean - mult * sd) });
  }
  return { upper, lower };
}

// EMA over a number array; output aligned starting at index (period-1).
function emaArr(vals: number[], period: number): number[] {
  if (vals.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < vals.length; i++) {
    prev = vals[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsiLine(bars: Bar[], period = 14): LineData<Time>[] {
  if (bars.length <= period) return [];
  const out: LineData<Time>[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = bars[i].close - bars[i - 1].close;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let ag = gain / period;
  let al = loss / period;
  const push = (i: number) => {
    const rs = al === 0 ? 100 : ag / al;
    out.push({ time: bars[i].time, value: r2(al === 0 ? 100 : 100 - 100 / (1 + rs)) });
  };
  push(period);
  for (let i = period + 1; i < bars.length; i++) {
    const ch = bars[i].close - bars[i - 1].close;
    ag = (ag * (period - 1) + (ch > 0 ? ch : 0)) / period;
    al = (al * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    push(i);
  }
  return out;
}

function macdLines(bars: Bar[]) {
  const closes = bars.map((b) => b.close);
  const macd: LineData<Time>[] = [];
  const signal: LineData<Time>[] = [];
  const hist: HistogramData<Time>[] = [];
  if (closes.length < 35) return { macd, signal, hist };
  const e12 = emaArr(closes, 12); // starts at idx 11
  const e26 = emaArr(closes, 26); // starts at idx 25
  const macdVals: number[] = [];
  for (let i = 25; i < closes.length; i++) macdVals.push(e12[i - 11] - e26[i - 25]);
  const sig = emaArr(macdVals, 9); // starts at macdVals idx 8 => closes idx 33
  for (let i = 25; i < closes.length; i++) macd.push({ time: bars[i].time, value: r2(macdVals[i - 25]) });
  for (let i = 0; i < sig.length; i++) {
    const ci = 33 + i;
    signal.push({ time: bars[ci].time, value: r2(sig[i]) });
    const h = macdVals[ci - 25] - sig[i];
    hist.push({ time: bars[ci].time, value: r2(h), color: h >= 0 ? "#26a69a" : "#ef5350" });
  }
  return { macd, signal, hist };
}

// ---- data layer ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function loadDaily(symbol: string): Promise<{ bars: Bar[]; vols: Vol[] }> {
  const res = await fetch(`/api/security/${encodeURIComponent(symbol)}`, { cache: "no-store" });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? "Failed to load");
  const content = (j.history?.content ?? []) as Array<{
    businessDate: string;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    closePrice: number;
    totalTradedQuantity: number;
  }>;
  const sorted = content.slice().sort((a, b) => a.businessDate.localeCompare(b.businessDate));
  const bars: Bar[] = sorted.map((c) => ({
    time: c.businessDate as Time,
    open: c.openPrice,
    high: c.highPrice,
    low: c.lowPrice,
    close: c.closePrice,
  }));
  const vols: Vol[] = sorted.map((c) => ({
    time: c.businessDate as Time,
    value: c.totalTradedQuantity,
    color: c.closePrice >= c.openPrice ? "#26a69a55" : "#ef535055",
  }));
  return { bars, vols };
}

function toWeekly(bars: Bar[], vols: Vol[]): { bars: Bar[]; vols: Vol[] } {
  const ob: Bar[] = [];
  const ov: Vol[] = [];
  let cur: Bar | null = null;
  let curVol = 0;
  let curKey = "";
  for (let i = 0; i < bars.length; i++) {
    const d = bars[i];
    const date = new Date(d.time as string);
    const onejan = new Date(date.getFullYear(), 0, 1);
    const week = Math.ceil(((date.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
    const key = `${date.getFullYear()}-${week}`;
    if (key !== curKey) {
      if (cur) {
        ob.push(cur);
        ov.push({ time: cur.time, value: curVol, color: cur.close >= cur.open ? "#26a69a55" : "#ef535055" });
      }
      cur = { ...d };
      curVol = vols[i]?.value ?? 0;
      curKey = key;
    } else if (cur) {
      cur.high = Math.max(cur.high, d.high);
      cur.low = Math.min(cur.low, d.low);
      cur.close = d.close;
      curVol += vols[i]?.value ?? 0;
    }
  }
  if (cur) {
    ob.push(cur);
    ov.push({ time: cur.time, value: curVol, color: cur.close >= cur.open ? "#26a69a55" : "#ef535055" });
  }
  return { bars: ob, vols: ov };
}

function synthIntraday(symbol: string, tf: TF, lastClose: number, bars = 160): { bars: Bar[]; vols: Vol[] } {
  const step = TF_MIN[tf] * 60;
  const now = Math.floor(Date.now() / 1000);
  const aligned = now - (now % step);
  const rng = mulberry32(hash(symbol + tf));
  const ob: Bar[] = [];
  const ov: Vol[] = [];
  let price = lastClose || 100;
  for (let i = bars - 1; i >= 0; i--) {
    const time = (aligned - i * step) as Time;
    const open = price;
    const close = Math.max(1, open + (rng() - 0.5) * lastClose * 0.01);
    const high = Math.max(open, close) * (1 + rng() * 0.004);
    const low = Math.min(open, close) * (1 - rng() * 0.004);
    ob.push({ time, open: r2(open), high: r2(high), low: r2(low), close: r2(close) });
    ov.push({ time, value: Math.round(rng() * 50000), color: close >= open ? "#26a69a55" : "#ef535055" });
    price = close;
  }
  return { bars: ob, vols: ov };
}

// Aggregate the NEPSE index intraday points [t, value] into OHLC candles.
function aggregateIndex(points: [number, number][], tf: TF): { bars: Bar[]; vols: Vol[] } {
  const intervalSec = (TF_MIN[tf] > 0 ? TF_MIN[tf] : 5) * 60;
  const buckets = new Map<number, { o: number; h: number; l: number; c: number }>();
  for (const [t, v] of points) {
    const b = Math.floor(t / intervalSec) * intervalSec;
    const cur = buckets.get(b);
    if (!cur) buckets.set(b, { o: v, h: v, l: v, c: v });
    else {
      cur.h = Math.max(cur.h, v);
      cur.l = Math.min(cur.l, v);
      cur.c = v;
    }
  }
  const bars: Bar[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, o]) => ({ time: t as Time, open: r2(o.o), high: r2(o.h), low: r2(o.l), close: r2(o.c) }));
  const vols: Vol[] = bars.map((b) => ({ time: b.time, value: 0, color: "#26a69a33" }));
  return { bars, vols };
}

const isIndex = (s: string) => s === "NEPSE" || s === "NEPSE INDEX";

async function getData(symbol: string, tf: TF) {
  if (isIndex(symbol)) {
    const res = await fetch("/api/index-graph", { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error ?? "Failed to load index");
    const result = aggregateIndex((j.points ?? []) as [number, number][], tf);
    return { ...result, source: j.source ?? "nepse" };
  }
  const daily = await loadDaily(symbol);
  if (tf === "1D") return { ...daily, source: "nepse" };
  if (tf === "1W") return { ...toWeekly(daily.bars, daily.vols), source: "nepse" };
  return { ...synthIntraday(symbol, tf, daily.bars.at(-1)?.close ?? 100), source: "synthetic" };
}

export default function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayRef = useRef<ISeriesApi<"Line" | "Histogram">[]>([]);
  const dataRef = useRef<{ bars: Bar[]; vols: Vol[] }>({ bars: [], vols: [] });
  const legendRef = useRef<HTMLDivElement>(null);

  const [symbol, setSymbol] = useState("NEPSE");
  const [symbolInput, setSymbolInput] = useState("NEPSE");
  const [tf, setTf] = useState<TF>("1D");
  const [inds, setInds] = useState<Set<Indicator>>(new Set(["MA20", "VOL"]));
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<string>("nepse");

  // fetch all stock symbols once (for the search list)
  useEffect(() => {
    fetch("/api/live", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setAllSymbols(["NEPSE", ...(j.data ?? []).map((d: { symbol: string }) => d.symbol).sort()]))
      .catch(() => {});
  }, []);

  // create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f19" },
        textColor: "#d1d4dc",
        fontFamily: "system-ui, sans-serif",
      },
      grid: { vertLines: { color: "#161b27" }, horzLines: { color: "#161b27" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#222a3a" },
      timeScale: { borderColor: "#222a3a", timeVisible: true, secondsVisible: false, rightOffset: 6 },
      autoSize: true,
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    chartRef.current = chart;
    candleRef.current = candles;

    // OHLC legend (top-left) updated on crosshair move
    const updateLegend = (bar?: Bar) => {
      const el = legendRef.current;
      if (!el) return;
      const b = bar ?? dataRef.current.bars.at(-1);
      if (!b) { el.innerHTML = ""; return; }
      const up = b.close >= b.open;
      const col = up ? "#26a69a" : "#ef5350";
      el.innerHTML = `O <b style="color:${col}">${b.open}</b>&nbsp; H <b style="color:${col}">${b.high}</b>&nbsp; L <b style="color:${col}">${b.low}</b>&nbsp; C <b style="color:${col}">${b.close}</b>`;
    };
    chart.subscribeCrosshairMove((param) => {
      updateLegend(param.seriesData.get(candles) as Bar | undefined);
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      overlayRef.current = [];
    };
  }, []);

  // (re)draw overlays for the current data + active indicators
  function drawOverlays() {
    const chart = chartRef.current;
    if (!chart) return;
    overlayRef.current.forEach((s) => chart.removeSeries(s));
    overlayRef.current = [];
    const { bars, vols } = dataRef.current;
    if (!bars.length) return;

    const addLine = (data: LineData<Time>[], color: string, pane = 0, width = 2) => {
      const s = chart.addSeries(
        LineSeries,
        { color, lineWidth: width as 1 | 2 | 3, priceLineVisible: false, lastValueVisible: pane !== 0 },
        pane,
      );
      s.setData(data);
      overlayRef.current.push(s);
      return s;
    };
    if (inds.has("MA20")) addLine(smaLine(bars, 20), "#2962ff");
    if (inds.has("MA50")) addLine(smaLine(bars, 50), "#ff9800");
    if (inds.has("EMA20")) addLine(emaLine(bars, 20), "#ab47bc");
    if (inds.has("BB")) {
      const bb = bollLines(bars, 20, 2);
      addLine(bb.upper, "#787b86", 0, 1);
      addLine(bb.lower, "#787b86", 0, 1);
    }
    if (inds.has("VOL")) {
      const v = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      v.setData(vols);
      overlayRef.current.push(v);
    }

    // ---- oscillator panes (TradingView style) ----
    let pane = 1;
    if (inds.has("RSI")) {
      const s = addLine(rsiLine(bars, 14), "#ab47bc", pane);
      s.createPriceLine({ price: 70, color: "#ef535066", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      s.createPriceLine({ price: 30, color: "#26a69a66", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      chart.panes()[pane]?.setHeight(110);
      pane++;
    }
    if (inds.has("MACD")) {
      const m = macdLines(bars);
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      h.setData(m.hist);
      overlayRef.current.push(h);
      addLine(m.macd, "#2962ff", pane, 1);
      addLine(m.signal, "#ff9800", pane, 1);
      chart.panes()[pane]?.setHeight(120);
      pane++;
    }
  }

  // load data on symbol / timeframe change
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getData(symbol, tf)
      .then((d) => {
        if (!alive || !candleRef.current) return;
        dataRef.current = { bars: d.bars, vols: d.vols };
        setDataSource(d.source ?? "nepse");
        candleRef.current.setData(d.bars);
        drawOverlays();
        chartRef.current?.timeScale().fitContent();
        const b = d.bars.at(-1);
        if (b && legendRef.current) {
          const up = b.close >= b.open;
          const col = up ? "#26a69a" : "#ef5350";
          legendRef.current.innerHTML = `O <b style="color:${col}">${b.open}</b>&nbsp; H <b style="color:${col}">${b.high}</b>&nbsp; L <b style="color:${col}">${b.low}</b>&nbsp; C <b style="color:${col}">${b.close}</b>`;
        }
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf]);

  // redraw overlays when indicators toggle
  useEffect(() => {
    drawOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inds]);

  const toggle = (i: Indicator) =>
    setInds((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b0f19] text-[#d1d4dc]">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#222a3a] px-3 py-2">
        <Link href="/" className="text-sm font-bold text-[#8a93a6] hover:text-white">← DARI SIR</Link>

        {/* searchable stock selector — all NEPSE stocks */}
        <form
          onSubmit={(e) => { e.preventDefault(); setSymbol(symbolInput.trim().toUpperCase()); }}
          className="flex items-center"
        >
          <input
            list="nepse-symbols"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder="Search stock…"
            className="w-40 rounded bg-[#161b27] px-2 py-1 text-sm font-bold uppercase text-white outline-none focus:ring-1 focus:ring-[#2962ff]"
          />
          <datalist id="nepse-symbols">
            {allSymbols.map((s) => <option key={s} value={s} />)}
          </datalist>
        </form>
        <span className="text-sm font-extrabold text-white">{symbol}</span>
        <span className="text-xs text-[#8a93a6]">{allSymbols.length} stocks</span>

        {/* indicators */}
        <div className="flex items-center gap-1 rounded-lg bg-[#161b27] p-0.5">
          {IND.map((i) => (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`rounded-md px-2 py-1 text-xs font-bold transition ${
                inds.has(i) ? "bg-[#089981] text-white" : "text-[#8a93a6] hover:text-white"
              }`}
            >
              {i}
            </button>
          ))}
        </div>

        {/* timeframes */}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-[#161b27] p-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`rounded-md px-3 py-1 text-xs font-bold transition ${
                tf === t ? "bg-[#2962ff] text-white" : "text-[#8a93a6] hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* chart */}
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-3 top-2 z-10 flex items-center gap-2 text-xs">
          <span className="font-extrabold text-white">{symbol}</span>
          <span className="text-[#8a93a6]">·</span>
          <span className="font-bold text-[#8a93a6]">{tf}</span>
          <span ref={legendRef} className="ml-2 tabular-nums text-[#8a93a6]" />
        </div>
        {loading && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-[#8a93a6]">
            Loading {symbol} {tf}…
          </div>
        )}
        {error && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[#2a1416] px-4 py-3 text-sm text-[#ef5350]">
            {error}
          </div>
        )}
        {!loading && !error && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-[#161b27]/80 px-2 py-1 text-[10px] text-[#8a93a6]">
            {symbol === "NEPSE" || symbol === "NEPSE INDEX"
              ? dataSource === "synthetic"
                ? "NEPSE index — simulated (NEPSE API unreachable)"
                : "NEPSE index — today's intraday (real)"
              : tf === "1D" || tf === "1W"
                ? "real NEPSE daily (~1yr available free)"
                : `${tf} = sample data (no free intraday feed)`}
          </div>
        )}
      </div>
    </div>
  );
}
