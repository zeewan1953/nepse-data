export interface IndicatorMeta {
  name: string;
  label: string;
  description: string;
  /** Minimum number of OHLCV trading bars required to compute this indicator */
  barsRequired: number;
  /** True if the indicator uses external data (broker/floorsheet) instead of OHLCV */
  externalSource?: boolean;
}

export const INDICATOR_META: IndicatorMeta[] = [
  { name: "rsi_14", label: "RSI (14)", description: "Relative Strength Index", barsRequired: 15 },
  { name: "macd", label: "MACD (12/26/9)", description: "Moving Average Convergence Divergence", barsRequired: 35 },
  { name: "stoch_k", label: "Stochastic %K (14/3)", description: "Stochastic Oscillator", barsRequired: 16 },
  { name: "cmf", label: "CMF (20)", description: "Chaikin Money Flow", barsRequired: 20 },
  { name: "mfi", label: "MFI (14)", description: "Money Flow Index", barsRequired: 15 },
  { name: "volume_zscore", label: "Volume Z-Score (20)", description: "Volume Anomaly Detection", barsRequired: 21 },
  { name: "momentum_score", label: "Momentum Score", description: "Multi-horizon ROC-based momentum", barsRequired: 3 },
  { name: "smart_money_score", label: "Smart Money Score", description: "Price × Volume composite", barsRequired: 20 },
  { name: "bollinger_b", label: "Bollinger %B (20,2σ)", description: "Bollinger Band position", barsRequired: 20 },
  { name: "adx", label: "ADX (14)", description: "Average Directional Index", barsRequired: 29 },
  { name: "williams_r", label: "Williams %R (14)", description: "Williams Percent Range", barsRequired: 14 },
  { name: "ema_cross", label: "EMA 9/21 Cross", description: "Exponential MA crossover", barsRequired: 21 },
  { name: "sma_cross", label: "SMA 50/200 Cross", description: "Golden/death cross", barsRequired: 200 },
  { name: "obv_trend", label: "OBV Trend (20)", description: "On-Balance Volume trend", barsRequired: 21 },
  { name: "psar", label: "Parabolic SAR", description: "Parabolic Stop and Reverse", barsRequired: 2 },
  { name: "ichimoku", label: "Ichimoku Cloud", description: "Ichimoku Kinko Hyo", barsRequired: 52 },
  { name: "vwap_dev", label: "VWAP Dev (20)", description: "VWAP deviation", barsRequired: 20 },
  { name: "roc", label: "ROC (12)", description: "Rate of Change", barsRequired: 13 },
  { name: "net_broker_flow", label: "Net Broker Flow", description: "Broker net position", barsRequired: 0, externalSource: true },
  { name: "order_flow_est", label: "Order Flow (est.)", description: "Tick-rule estimated order flow", barsRequired: 0, externalSource: true },
  { name: "supertrend", label: "Supertrend (10,3)", description: "Supertrend", barsRequired: 11 },
  { name: "tma_dma_cross", label: "TMA(20)/DMA(50)", description: "Triangular vs Daily MA cross", barsRequired: 69 },
  { name: "dema_cross", label: "DEMA 9/21 Cross", description: "Double EMA crossover", barsRequired: 42 },
  { name: "tema_cross", label: "TEMA 9/21 Cross", description: "Triple EMA crossover", barsRequired: 63 },
];
