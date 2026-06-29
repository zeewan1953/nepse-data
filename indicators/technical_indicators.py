"""
Technical Indicator Signal Matrix — 24 indicators, pure functions, daily timeframe.

Every indicator is implemented exactly once in this module.  No indicator formula
may be duplicated or re-derived inline anywhere else.

Rule: insufficient history → returns None (never a fabricated number).
Rule: all lookbacks use trading-day arithmetic from the caller.
"""

from __future__ import annotations
import math
from typing import Any


# ─── Types ───────────────────────────────────────────────────────────────────

class OHLCV:
    __slots__ = ("trade_date", "open", "high", "low", "close", "volume")
    def __init__(self, trade_date: str, open_: float, high: float, low: float, close: float, volume: float) -> None:
        self.trade_date = trade_date
        self.open = open_
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume


IndicatorResult = tuple[float | None, str | None]
"""Returns (raw_value, signal) where signal is 'BUY','SELL','NEUTRAL' or None."""


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def _ema(values: list[float], period: int) -> list[float]:
    """Full EMA series over `values` with standard smoothing factor 2/(period+1)."""
    if not values:
        return []
    k = 2.0 / (period + 1)
    result = [values[0]]
    for v in values[1:]:
        result.append((v - result[-1]) * k + result[-1])
    return result


def _wilder_ema(values: list[float], period: int) -> list[float]:
    """Wilder-style EMA (smoothing = 1/period)."""
    if not values:
        return []
    k = 1.0 / period
    result = [values[0]]
    for v in values[1:]:
        result.append((v - result[-1]) * k + result[-1])
    return result


def _tr(high: float, low: float, close: float, prev_close: float) -> float:
    return max(high - low, abs(high - prev_close), abs(low - prev_close))


def _typical_price(bar: OHLCV) -> float:
    return (bar.high + bar.low + bar.close) / 3.0


def _sign(val: float) -> int:
    return 1 if val > 0 else (-1 if val < 0 else 0)


# ─── 1. RSI ──────────────────────────────────────────────────────────────────

def compute_rsi(bars: list[OHLCV], period: int = 14) -> IndicatorResult:
    if len(bars) < period + 1:
        return (None, None)
    closes = [b.close for b in bars]
    gains: list[float] = []
    losses: list[float] = []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_gain = _wilder_ema(gains, period)[-1]
    avg_loss = _wilder_ema(losses, period)[-1]
    if avg_loss == 0:
        rsi = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi = 100.0 - 100.0 / (1.0 + rs)
    raw = round(rsi, 2)
    if raw < 30:
        return (raw, "BUY")
    elif raw > 70:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 2. MACD ─────────────────────────────────────────────────────────────────

def compute_macd(bars: list[OHLCV], fast: int = 12, slow: int = 26, signal: int = 9) -> IndicatorResult:
    if len(bars) < slow + signal:
        return (None, None)
    closes = [b.close for b in bars]
    ema_fast = _ema(closes, fast)
    ema_slow = _ema(closes, slow)
    macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
    signal_line = _ema(macd_line, signal)
    raw = round(macd_line[-1], 4)
    s = round(signal_line[-1], 4)
    if raw > s:
        return (raw, "BUY")
    elif raw < s:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 3. Stochastic %K ────────────────────────────────────────────────────────

def compute_stochastic_k(bars: list[OHLCV], k_period: int = 14, d_period: int = 3) -> IndicatorResult:
    if len(bars) < k_period:
        return (None, None)
    slice_bars = bars[-(k_period + d_period - 1):] if len(bars) >= k_period + d_period - 1 else bars
    k_values: list[float] = []
    for i in range(len(slice_bars) - k_period + 1):
        window = slice_bars[i:i + k_period]
        low_min = min(b.low for b in window)
        high_max = max(b.high for b in window)
        denom = high_max - low_min
        if denom == 0:
            k_values.append(50.0)
        else:
            k = (window[-1].close - low_min) / denom * 100
            k_values.append(k)
    if not k_values:
        return (None, None)
    k_val = k_values[-1]
    d_val = sum(k_values[-d_period:]) / d_period if len(k_values) >= d_period else k_val
    raw = round(k_val, 2)
    if raw < 20:
        return (raw, "BUY")
    elif raw > 80:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 4. CMF (reused from TS, period=20 per spec) ─────────────────────────────

def compute_cmf(bars: list[OHLCV], period: int = 20) -> IndicatorResult:
    if len(bars) < period:
        return (None, None)
    slice_bars = bars[-period:]
    mfv_sum = 0.0
    vol_sum = 0.0
    for b in slice_bars:
        rng = b.high - b.low
        if rng <= 0:
            continue
        mfm = ((b.close - b.low) - (b.high - b.close)) / rng
        mfv_sum += mfm * b.volume
        vol_sum += b.volume
    if vol_sum == 0:
        return (None, None)
    raw = round(max(-1.0, min(1.0, mfv_sum / vol_sum)), 3)
    if raw > 0.05:
        return (raw, "BUY")
    elif raw < -0.05:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 5. MFI (reused from TS, period=14 per spec) ─────────────────────────────

def compute_mfi(bars: list[OHLCV], period: int = 14) -> IndicatorResult:
    if len(bars) < period + 1:
        return (None, None)
    pos_flow = 0.0
    neg_flow = 0.0
    for i in range(-period, 0):
        prev_tp = _typical_price(bars[i - 1])
        curr_tp = _typical_price(bars[i])
        raw_mf = curr_tp * bars[i].volume
        if curr_tp > prev_tp:
            pos_flow += raw_mf
        elif curr_tp < prev_tp:
            neg_flow += raw_mf
    if neg_flow == 0:
        raw = 100.0 if pos_flow > 0 else 50.0
    else:
        raw = 100.0 - 100.0 / (1.0 + pos_flow / neg_flow)
    raw = round(raw, 2)
    if raw < 20:
        return (raw, "BUY")
    elif raw > 80:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 6. Volume Z-Score (reused from TS, lookback=20 per spec) ────────────────

def compute_volume_zscore(bars: list[OHLCV], lookback: int = 20) -> IndicatorResult:
    if len(bars) < lookback + 1:
        return (None, None)
    historical = bars[-(lookback + 1):-1]
    today = bars[-1]
    avg_vol = sum(b.volume for b in historical) / len(historical)
    if avg_vol == 0:
        return (None, None)
    variance = sum((b.volume - avg_vol) ** 2 for b in historical) / len(historical)
    stddev = math.sqrt(variance)
    if stddev == 0:
        return (0.0, "NEUTRAL")
    z = round((today.volume - avg_vol) / stddev, 2)
    change_pct = ((today.close - historical[-1].close) / historical[-1].close) * 100 if historical[-1].close != 0 else 0
    if z > 2 and change_pct > 0:
        return (z, "BUY")
    elif z > 2 and change_pct < 0:
        return (z, "SELL")
    return (z, "NEUTRAL")


# ─── 7. Momentum Score ───────────────────────────────────────────────────────

def compute_momentum_score(bars: list[OHLCV]) -> IndicatorResult:
    if len(bars) < 2:
        return (None, None)
    roc_5 = _roc(bars, 5)
    roc_10 = _roc(bars, 10)
    roc_20 = _roc(bars, 20)
    score = 0.0
    count = 0
    for r in [roc_5, roc_10, roc_20]:
        if r is not None:
            score += r
            count += 1
    if count == 0:
        return (None, None)
    raw = round(score / count, 2)
    if raw > 0:
        return (raw, "BUY")
    elif raw < 0:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


def _roc(bars: list[OHLCV], period: int) -> float | None:
    if len(bars) < period + 1:
        return None
    prev_close = bars[-(period + 1)].close
    if prev_close == 0:
        return None
    return (bars[-1].close - prev_close) / prev_close * 100


# ─── 8. Smart Money Score ────────────────────────────────────────────────────

def compute_smart_money_score(bars: list[OHLCV]) -> IndicatorResult:
    if len(bars) < 20:
        return (None, None)
    closes = [b.close for b in bars]
    volumes = [b.volume for b in bars]
    sma_close = _sma(closes, 20)
    sma_vol = _sma(volumes, 20)
    if sma_close is None or sma_vol is None or sma_vol == 0:
        return (None, None)
    price_trend = (closes[-1] - sma_close) / sma_close
    vol_trend = (volumes[-1] - sma_vol) / sma_vol
    raw = round(price_trend * 100 + vol_trend * 100, 2)
    if raw > 5:
        return (raw, "BUY")
    elif raw < -5:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 9. Bollinger %B ─────────────────────────────────────────────────────────

def compute_bollinger_b(bars: list[OHLCV], period: int = 20, num_std: float = 2.0) -> IndicatorResult:
    if len(bars) < period:
        return (None, None)
    closes = [b.close for b in bars]
    window = closes[-period:]
    sma = sum(window) / period
    variance = sum((c - sma) ** 2 for c in window) / period
    stddev = math.sqrt(variance)
    upper = sma + num_std * stddev
    lower = sma - num_std * stddev
    denom = upper - lower
    if denom == 0:
        return (0.5, "NEUTRAL")
    b = round((closes[-1] - lower) / denom, 4)
    if b < 0:
        return (b, "BUY")
    elif b > 1:
        return (b, "SELL")
    return (b, "NEUTRAL")


# ─── 10. ADX + DI ────────────────────────────────────────────────────────────

def compute_adx(bars: list[OHLCV], period: int = 14) -> IndicatorResult:
    if len(bars) < period * 2 + 1:
        return (None, None)
    tr_values: list[float] = []
    plus_dm: list[float] = []
    minus_dm: list[float] = []
    for i in range(1, len(bars)):
        high = bars[i].high
        low = bars[i].low
        prev_high = bars[i - 1].high
        prev_low = bars[i - 1].low
        prev_close = bars[i - 1].close
        tr_values.append(_tr(high, low, bars[i].close, prev_close))
        up_move = high - prev_high
        down_move = prev_low - low
        p_dm = up_move if up_move > down_move and up_move > 0 else 0
        n_dm = down_move if down_move > up_move and down_move > 0 else 0
        plus_dm.append(p_dm)
        minus_dm.append(n_dm)
    if len(tr_values) < period:
        return (None, None)
    atr_s = _wilder_ema(tr_values, period)[-1]
    pdi_s = _wilder_ema(plus_dm, period)[-1]
    ndi_s = _wilder_ema(minus_dm, period)[-1]
    if atr_s == 0:
        return (None, None)
    pdi = (pdi_s / atr_s) * 100
    ndi = (ndi_s / atr_s) * 100
    dx = abs(pdi - ndi) / (pdi + ndi) * 100 if (pdi + ndi) > 0 else 0
    raw = round(dx, 2)
    if raw > 25 and pdi > ndi:
        return (raw, "BUY")
    elif raw > 25 and ndi > pdi:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 11. Williams %R ─────────────────────────────────────────────────────────

def compute_williams_r(bars: list[OHLCV], period: int = 14) -> IndicatorResult:
    if len(bars) < period:
        return (None, None)
    window = bars[-period:]
    hh = max(b.high for b in window)
    ll = min(b.low for b in window)
    denom = hh - ll
    if denom == 0:
        return (-50.0, "NEUTRAL")
    raw = round((hh - bars[-1].close) / denom * -100, 2)
    if raw < -80:
        return (raw, "BUY")
    elif raw > -20:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 12. EMA 9/21 Cross ──────────────────────────────────────────────────────

def compute_ema_cross(bars: list[OHLCV], fast: int = 9, slow: int = 21) -> IndicatorResult:
    if len(bars) < slow:
        return (None, None)
    closes = [b.close for b in bars]
    ema_fast = _ema(closes, fast)
    ema_slow = _ema(closes, slow)
    diff = round(ema_fast[-1] - ema_slow[-1], 4)
    if diff > 0:
        return (diff, "BUY")
    elif diff < 0:
        return (diff, "SELL")
    return (diff, "NEUTRAL")


# ─── 13. SMA 50/200 Cross ────────────────────────────────────────────────────

def compute_sma_cross(bars: list[OHLCV], fast: int = 50, slow: int = 200) -> IndicatorResult:
    if len(bars) < slow:
        return (None, None)
    closes = [b.close for b in bars]
    sma_fast = _sma(closes, fast)
    sma_slow = _sma(closes, slow)
    if sma_fast is None or sma_slow is None:
        return (None, None)
    diff = round(sma_fast - sma_slow, 4)
    if diff > 0:
        return (diff, "BUY")
    elif diff < 0:
        return (diff, "SELL")
    return (diff, "NEUTRAL")


# ─── 14. OBV Trend ──────────────────────────────────────────────────────────

def compute_obv_trend(bars: list[OHLCV], period: int = 20) -> IndicatorResult:
    if len(bars) < period + 1:
        return (None, None)
    obv_values: list[float] = []
    obv = 0.0
    for i in range(len(bars)):
        if i == 0:
            obv += bars[i].volume
        else:
            if bars[i].close > bars[i - 1].close:
                obv += bars[i].volume
            elif bars[i].close < bars[i - 1].close:
                obv -= bars[i].volume
        obv_values.append(obv)
    obv_sma = _sma(obv_values, period)
    if obv_sma is None:
        return (None, None)
    raw = round(obv_values[-1], 2)
    if obv_values[-1] > obv_sma:
        return (raw, "BUY")
    elif obv_values[-1] < obv_sma:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 15. Parabolic SAR ───────────────────────────────────────────────────────

def compute_psar(bars: list[OHLCV], af_start: float = 0.02, af_step: float = 0.02, af_max: float = 0.2) -> IndicatorResult:
    if len(bars) < 2:
        return (None, None)
    high = [b.high for b in bars]
    low = [b.low for b in bars]
    close = [b.close for b in bars]
    uptrend = True
    af = af_start
    ep = high[0]
    sar = low[0]
    for i in range(1, len(bars)):
        if uptrend:
            sar = sar + af * (ep - sar)
            sar = min(sar, low[i - 1], low[i - 2]) if i >= 2 else min(sar, low[i - 1])
            if close[i] < sar:
                uptrend = False
                sar = ep
                af = af_start
                ep = low[i]
            else:
                if high[i] > ep:
                    ep = high[i]
                    af = min(af + af_step, af_max)
        else:
            sar = sar - af * (sar - ep)
            sar = max(sar, high[i - 1], high[i - 2]) if i >= 2 else max(sar, high[i - 1])
            if close[i] > sar:
                uptrend = True
                sar = ep
                af = af_start
                ep = high[i]
            else:
                if low[i] < ep:
                    ep = low[i]
                    af = min(af + af_step, af_max)
    raw = round(sar, 2)
    if close[-1] > sar:
        return (raw, "BUY")
    else:
        return (raw, "SELL")


# ─── 16. Ichimoku Cloud ──────────────────────────────────────────────────────

def compute_ichimoku(bars: list[OHLCV], tenkan: int = 9, kijun: int = 26, senkou: int = 52) -> IndicatorResult:
    if len(bars) < senkou:
        return (None, None)
    h = [b.high for b in bars]
    l_ = [b.low for b in bars]
    c = [b.close for b in bars]
    tenkan_sen = (max(h[-tenkan:]) + min(l_[-tenkan:])) / 2
    kijun_sen = (max(h[-kijun:]) + min(l_[-kijun:])) / 2
    senkou_a = (tenkan_sen + kijun_sen) / 2
    senkou_b = (max(h[-senkou:]) + min(l_[-senkou:])) / 2
    price = c[-1]
    above_cloud = price > senkou_a and price > senkou_b
    below_cloud = price < senkou_a and price < senkou_b
    if above_cloud and tenkan_sen > kijun_sen:
        return (round(senkou_a, 2), "BUY")
    elif below_cloud and tenkan_sen < kijun_sen:
        return (round(senkou_a, 2), "SELL")
    return (round(senkou_a, 2), "NEUTRAL")


# ─── 17. VWAP Deviation (rolling 20-day) ─────────────────────────────────────

def compute_vwap_deviation(bars: list[OHLCV], period: int = 20) -> IndicatorResult:
    if len(bars) < period:
        return (None, None)
    window = bars[-period:]
    tp_vol_sum = sum(_typical_price(b) * b.volume for b in window)
    vol_sum = sum(b.volume for b in window)
    if vol_sum == 0:
        return (None, None)
    vwap = tp_vol_sum / vol_sum
    close = window[-1].close
    deviation = (close - vwap) / vwap
    raw = round(deviation * 100, 4)
    if close > vwap * 1.01:
        return (raw, "BUY")
    elif close < vwap * 0.99:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 18. ROC ─────────────────────────────────────────────────────────────────

def compute_roc(bars: list[OHLCV], period: int = 12) -> IndicatorResult:
    if len(bars) < period + 1:
        return (None, None)
    prev_close = bars[-(period + 1)].close
    if prev_close == 0:
        return (None, None)
    raw = round((bars[-1].close - prev_close) / prev_close * 100, 2)
    if raw > 0:
        return (raw, "BUY")
    elif raw < 0:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 19. Net Broker Flow ────────────────────────────────────────────────────

def compute_net_broker_flow(net_amt: float | None) -> IndicatorResult:
    if net_amt is None:
        return (None, None)
    raw = round(net_amt, 2)
    if raw > 0:
        return (raw, "BUY")
    elif raw < 0:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 20. Order Flow (est.) ──────────────────────────────────────────────────

def compute_order_flow_est(est_net_volume: float | None) -> IndicatorResult:
    if est_net_volume is None:
        return (None, None)
    raw = round(est_net_volume, 2)
    if raw > 0:
        return (raw, "BUY")
    elif raw < 0:
        return (raw, "SELL")
    return (raw, "NEUTRAL")


# ─── 21. Supertrend ─────────────────────────────────────────────────────────

def compute_supertrend(bars: list[OHLCV], atr_period: int = 10, multiplier: float = 3.0) -> IndicatorResult:
    if len(bars) < atr_period + 1:
        return (None, None)
    tr_values: list[float] = []
    for i in range(1, len(bars)):
        tr_values.append(_tr(bars[i].high, bars[i].low, bars[i].close, bars[i - 1].close))
    atr = _wilder_ema(tr_values, atr_period)[-1]
    hl2 = (bars[-1].high + bars[-1].low) / 2
    basic_upper = hl2 + multiplier * atr
    basic_lower = hl2 - multiplier * atr
    if bars[-1].close > basic_lower:
        return (round(basic_lower, 2), "BUY")
    else:
        return (round(basic_upper, 2), "SELL")


# ─── 22. TMA / DMA Cross ────────────────────────────────────────────────────

def compute_tma_dma_cross(bars: list[OHLCV], tma_period: int = 20, dma_period: int = 50) -> IndicatorResult:
    if len(bars) < dma_period:
        return (None, None)
    closes = [b.close for b in bars]
    sma_first = []
    for i in range(len(closes) - tma_period + 1):
        sma_first.append(sum(closes[i:i + tma_period]) / tma_period)
    if len(sma_first) < tma_period:
        return (None, None)
    tma = sum(sma_first[-tma_period:]) / tma_period
    dma = sum(closes[-dma_period:]) / dma_period
    if dma_period > len(closes):
        dma = sum(closes) / len(closes)
    diff = round(tma - dma, 4)
    if diff > 0:
        return (diff, "BUY")
    elif diff < 0:
        return (diff, "SELL")
    return (diff, "NEUTRAL")


# ─── 23. DEMA 9/21 Cross ────────────────────────────────────────────────────

def compute_dema_cross(bars: list[OHLCV], fast: int = 9, slow: int = 21) -> IndicatorResult:
    if len(bars) < slow * 2:
        return (None, None)
    closes = [b.close for b in bars]
    ema_fast = _ema(closes, fast)
    ema_of_ema_fast = _ema(ema_fast, fast)
    dema_fast = 2 * ema_fast[-1] - ema_of_ema_fast[-1]
    ema_slow = _ema(closes, slow)
    ema_of_ema_slow = _ema(ema_slow, slow)
    dema_slow = 2 * ema_slow[-1] - ema_of_ema_slow[-1]
    diff = round(dema_fast - dema_slow, 4)
    if diff > 0:
        return (diff, "BUY")
    elif diff < 0:
        return (diff, "SELL")
    return (diff, "NEUTRAL")


# ─── 24. TEMA 9/21 Cross ────────────────────────────────────────────────────

def compute_tema_cross(bars: list[OHLCV], fast: int = 9, slow: int = 21) -> IndicatorResult:
    if len(bars) < slow * 3:
        return (None, None)
    closes = [b.close for b in bars]
    ema1_fast = _ema(closes, fast)
    ema2_fast = _ema(ema1_fast, fast)
    ema3_fast = _ema(ema2_fast, fast)
    tema_fast = 3 * ema1_fast[-1] - 3 * ema2_fast[-1] + ema3_fast[-1]
    ema1_slow = _ema(closes, slow)
    ema2_slow = _ema(ema1_slow, slow)
    ema3_slow = _ema(ema2_slow, slow)
    tema_slow = 3 * ema1_slow[-1] - 3 * ema2_slow[-1] + ema3_slow[-1]
    diff = round(tema_fast - tema_slow, 4)
    if diff > 0:
        return (diff, "BUY")
    elif diff < 0:
        return (diff, "SELL")
    return (diff, "NEUTRAL")


# ─── 25. Divergence Flag ────────────────────────────────────────────────────

def compute_divergence_flag(price_bars: list[OHLCV], rsi_period: int = 14) -> IndicatorResult:
    """Regular divergence: price makes lower low but RSI makes higher low → BUY (bullish).
    Price makes higher high but RSI makes lower high → SELL (bearish)."""
    if len(price_bars) < rsi_period * 2 + 5:
        return (None, None)
    rsi_values = []
    for i in range(5, len(price_bars) + 1):
        sub = price_bars[:i]
        if len(sub) >= rsi_period + 1:
            val, _ = compute_rsi(sub, rsi_period)
            rsi_values.append(val)
    if not rsi_values or rsi_values[-1] is None:
        return (None, None)
    last_5_close = [b.close for b in price_bars[-5:]]
    last_5_rsi = rsi_values[-5:]
    if all(x is not None for x in last_5_rsi):
        rsi_vals = [x for x in last_5_rsi if x is not None]
        if len(last_5_close) >= 3 and len(rsi_vals) >= 3:
            low_idx = last_5_close.index(min(last_5_close))
            high_close_idx = last_5_close.index(max(last_5_close))
            if last_5_close[low_idx] < last_5_close[low_idx - 1] and rsi_vals[low_idx] > (rsi_vals[low_idx - 1] if low_idx > 0 else 50):
                return (1.0, "BUY")
            if last_5_close[high_close_idx] > last_5_close[high_close_idx - 1] and rsi_vals[high_close_idx] < (rsi_vals[high_close_idx - 1] if high_close_idx > 0 else 50):
                return (1.0, "SELL")
    return (0.0, "NEUTRAL")


# ─── Indicator registry ──────────────────────────────────────────────────────

INDICATOR_META: list[dict[str, Any]] = [
    {"name": "rsi_14", "label": "RSI (14)", "description": "Relative Strength Index"},
    {"name": "macd", "label": "MACD (12/26/9)", "description": "Moving Average Convergence Divergence"},
    {"name": "stoch_k", "label": "Stochastic %K (14/3)", "description": "Stochastic Oscillator"},
    {"name": "cmf", "label": "CMF (20)", "description": "Chaikin Money Flow"},
    {"name": "mfi", "label": "MFI (14)", "description": "Money Flow Index"},
    {"name": "volume_zscore", "label": "Volume Z-Score (20)", "description": "Volume Anomaly Detection"},
    {"name": "momentum_score", "label": "Momentum Score", "description": "Multi-horizon ROC-based momentum"},
    {"name": "smart_money_score", "label": "Smart Money Score", "description": "Price × Volume composite"},
    {"name": "bollinger_b", "label": "Bollinger %B (20,2σ)", "description": "Bollinger Band position"},
    {"name": "adx", "label": "ADX (14)", "description": "Average Directional Index"},
    {"name": "williams_r", "label": "Williams %R (14)", "description": "Williams Percent Range"},
    {"name": "ema_cross", "label": "EMA 9/21 Cross", "description": "Exponential Moving Average crossover"},
    {"name": "sma_cross", "label": "SMA 50/200 Cross", "description": "Simple Moving Average golden/death cross"},
    {"name": "obv_trend", "label": "OBV Trend (20)", "description": "On-Balance Volume trend"},
    {"name": "psar", "label": "Parabolic SAR", "description": "Parabolic Stop and Reverse"},
    {"name": "ichimoku", "label": "Ichimoku Cloud", "description": "Ichimoku Kinko Hyo"},
    {"name": "vwap_dev", "label": "VWAP Dev (20)", "description": "VWAP deviation"},
    {"name": "roc", "label": "ROC (12)", "description": "Rate of Change"},
    {"name": "net_broker_flow", "label": "Net Broker Flow", "description": "Broker net position"},
    {"name": "order_flow_est", "label": "Order Flow (est.)", "description": "Tick-rule estimated order flow"},
    {"name": "supertrend", "label": "Supertrend (10,3)", "description": "Supertrend trend-following"},
    {"name": "tma_dma_cross", "label": "TMA(20)/DMA(50)", "description": "Triangular vs Daily MA cross"},
    {"name": "dema_cross", "label": "DEMA 9/21 Cross", "description": "Double EMA crossover"},
    {"name": "tema_cross", "label": "TEMA 9/21 Cross", "description": "Triple EMA crossover"},
]

INDICATOR_FUNCS: dict[str, Any] = {
    "rsi_14": lambda bars: compute_rsi(bars),
    "macd": lambda bars: compute_macd(bars),
    "stoch_k": lambda bars: compute_stochastic_k(bars),
    "cmf": lambda bars: compute_cmf(bars),
    "mfi": lambda bars: compute_mfi(bars),
    "volume_zscore": lambda bars: compute_volume_zscore(bars),
    "momentum_score": lambda bars: compute_momentum_score(bars),
    "smart_money_score": lambda bars: compute_smart_money_score(bars),
    "bollinger_b": lambda bars: compute_bollinger_b(bars),
    "adx": lambda bars: compute_adx(bars),
    "williams_r": lambda bars: compute_williams_r(bars),
    "ema_cross": lambda bars: compute_ema_cross(bars),
    "sma_cross": lambda bars: compute_sma_cross(bars),
    "obv_trend": lambda bars: compute_obv_trend(bars),
    "psar": lambda bars: compute_psar(bars),
    "ichimoku": lambda bars: compute_ichimoku(bars),
    "vwap_dev": lambda bars: compute_vwap_deviation(bars),
    "roc": lambda bars: compute_roc(bars),
    "net_broker_flow": lambda _bars, net_amt=None: compute_net_broker_flow(net_amt),
    "order_flow_est": lambda _bars, est_net=None: compute_order_flow_est(est_net),
    "supertrend": lambda bars: compute_supertrend(bars),
    "tma_dma_cross": lambda bars: compute_tma_dma_cross(bars),
    "dema_cross": lambda bars: compute_dema_cross(bars),
    "tema_cross": lambda bars: compute_tema_cross(bars),
    "divergence_flag": lambda bars: compute_divergence_flag(bars),
}


def compute_indicator(indicator_name: str, bars: list[OHLCV], **kwargs) -> IndicatorResult:
    """Dispatch to the correct indicator function by name."""
    fn = INDICATOR_FUNCS.get(indicator_name)
    if fn is None:
        return (None, None)
    return fn(bars, **kwargs)
