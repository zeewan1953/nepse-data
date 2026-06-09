// Lightweight technical indicators computed on the client from OHLC history.

export type Point = { time: string; value: number };

export function sma(values: { time: string; close: number }[], period: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i].close;
    if (i >= period) sum -= values[i - period].close;
    if (i >= period - 1) out.push({ time: values[i].time, value: sum / period });
  }
  return out;
}

export function ema(values: { time: string; close: number }[], period: number): Point[] {
  const out: Point[] = [];
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b.close, 0) / period;
  out.push({ time: values[period - 1].time, value: prev });
  for (let i = period; i < values.length; i++) {
    prev = values[i].close * k + prev * (1 - k);
    out.push({ time: values[i].time, value: prev });
  }
  return out;
}

// Wilder's RSI
export function rsi(values: { time: string; close: number }[], period = 14): Point[] {
  const out: Point[] = [];
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i].close - values[i - 1].close;
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const push = (i: number) => {
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const v = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    out.push({ time: values[i].time, value: v });
  };
  push(period);
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i].close - values[i - 1].close;
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    push(i);
  }
  return out;
}
