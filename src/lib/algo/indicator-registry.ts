export interface IndicatorRegistryEntry {
  key: string;
  displayName: string;
  description: string;
  valueType: "numeric" | "signal" | "crossover";
  sourceTable: "indicator_daily_signal" | "signal_daily_snapshot" | "stock_daily_summary";
  defaultBuyThreshold?: number;
  defaultSellThreshold?: number;
}

const TECHNICAL_INDICATORS: IndicatorRegistryEntry[] = [
  { key: "rsi_14", displayName: "RSI (14)", description: "Relative Strength Index", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: 30, defaultSellThreshold: 70 },
  { key: "macd", displayName: "MACD (12/26/9)", description: "Moving Average Convergence Divergence", valueType: "signal", sourceTable: "indicator_daily_signal" },
  { key: "stoch_k", displayName: "Stochastic %K (14/3)", description: "Stochastic Oscillator", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: 20, defaultSellThreshold: 80 },
  { key: "cmf", displayName: "CMF (20)", description: "Chaikin Money Flow", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: -0.1, defaultSellThreshold: 0.1 },
  { key: "mfi", displayName: "MFI (14)", description: "Money Flow Index", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: 20, defaultSellThreshold: 80 },
  { key: "volume_zscore", displayName: "Volume Z-Score (20)", description: "Volume Anomaly Detection", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: -2, defaultSellThreshold: 2 },
  { key: "momentum_score", displayName: "Momentum Score", description: "Multi-horizon ROC-based momentum", valueType: "numeric", sourceTable: "indicator_daily_signal" },
  { key: "smart_money_score", displayName: "Smart Money Score", description: "Price × Volume composite", valueType: "numeric", sourceTable: "indicator_daily_signal" },
  { key: "bollinger_b", displayName: "Bollinger %B (20,2σ)", description: "Bollinger Band position", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: 0, defaultSellThreshold: 1 },
  { key: "adx", displayName: "ADX (14)", description: "Average Directional Index", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: 25 },
  { key: "williams_r", displayName: "Williams %R (14)", description: "Williams Percent Range", valueType: "numeric", sourceTable: "indicator_daily_signal", defaultBuyThreshold: -80, defaultSellThreshold: -20 },
  { key: "ema_cross", displayName: "EMA 9/21 Cross", description: "Exponential MA crossover", valueType: "crossover", sourceTable: "indicator_daily_signal" },
  { key: "sma_cross", displayName: "SMA 50/200 Cross", description: "Golden/death cross", valueType: "crossover", sourceTable: "indicator_daily_signal" },
  { key: "obv_trend", displayName: "OBV Trend (20)", description: "On-Balance Volume trend", valueType: "signal", sourceTable: "indicator_daily_signal" },
  { key: "psar", displayName: "Parabolic SAR", description: "Parabolic Stop and Reverse", valueType: "signal", sourceTable: "indicator_daily_signal" },
  { key: "ichimoku", displayName: "Ichimoku Cloud", description: "Ichimoku Kinko Hyo", valueType: "signal", sourceTable: "indicator_daily_signal" },
  { key: "vwap_dev", displayName: "VWAP Dev (20)", description: "VWAP deviation", valueType: "numeric", sourceTable: "indicator_daily_signal" },
  { key: "roc", displayName: "ROC (12)", description: "Rate of Change", valueType: "numeric", sourceTable: "indicator_daily_signal" },
  { key: "net_broker_flow", displayName: "Net Broker Flow", description: "Broker net position", valueType: "numeric", sourceTable: "indicator_daily_signal" },
  { key: "order_flow_est", displayName: "Order Flow (est.)", description: "Tick-rule estimated order flow", valueType: "numeric", sourceTable: "indicator_daily_signal" },
  { key: "supertrend", displayName: "Supertrend (10,3)", description: "Supertrend", valueType: "signal", sourceTable: "indicator_daily_signal" },
  { key: "tma_dma_cross", displayName: "TMA(20)/DMA(50)", description: "Triangular vs Daily MA cross", valueType: "crossover", sourceTable: "indicator_daily_signal" },
  { key: "dema_cross", displayName: "DEMA 9/21 Cross", description: "Double EMA crossover", valueType: "crossover", sourceTable: "indicator_daily_signal" },
  { key: "tema_cross", displayName: "TEMA 9/21 Cross", description: "Triple EMA crossover", valueType: "crossover", sourceTable: "indicator_daily_signal" },
];

const LEADERBOARD_SIGNALS: IndicatorRegistryEntry[] = [
  { key: "divergence_flag", displayName: "Divergence Flag", description: "Price-indicator divergence", valueType: "numeric", sourceTable: "signal_daily_snapshot" },
];

const PRICE_VOLUME_FIELDS: IndicatorRegistryEntry[] = [
  { key: "close", displayName: "Close Price", description: "Daily closing price", valueType: "numeric", sourceTable: "stock_daily_summary" },
  { key: "volume", displayName: "Volume", description: "Daily trading volume", valueType: "numeric", sourceTable: "stock_daily_summary" },
  { key: "pct_change", displayName: "% Change", description: "Daily percentage change", valueType: "numeric", sourceTable: "stock_daily_summary" },
];

export const INDICATOR_REGISTRY: IndicatorRegistryEntry[] = [
  ...TECHNICAL_INDICATORS,
  ...LEADERBOARD_SIGNALS,
  ...PRICE_VOLUME_FIELDS,
];

export function getIndicator(key: string): IndicatorRegistryEntry | undefined {
  return INDICATOR_REGISTRY.find((e) => e.key === key);
}
