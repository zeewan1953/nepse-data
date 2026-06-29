export interface IndicatorMeta {
  name: string;
  label: string;
  description: string;
}

export const INDICATOR_META: IndicatorMeta[] = [
  { name: "rsi_14", label: "RSI (14)", description: "Relative Strength Index" },
  { name: "macd", label: "MACD (12/26/9)", description: "Moving Average Convergence Divergence" },
  { name: "stoch_k", label: "Stochastic %K (14/3)", description: "Stochastic Oscillator" },
  { name: "cmf", label: "CMF (20)", description: "Chaikin Money Flow" },
  { name: "mfi", label: "MFI (14)", description: "Money Flow Index" },
  { name: "volume_zscore", label: "Volume Z-Score (20)", description: "Volume Anomaly Detection" },
  { name: "momentum_score", label: "Momentum Score", description: "Multi-horizon ROC-based momentum" },
  { name: "smart_money_score", label: "Smart Money Score", description: "Price × Volume composite" },
  { name: "bollinger_b", label: "Bollinger %B (20,2σ)", description: "Bollinger Band position" },
  { name: "adx", label: "ADX (14)", description: "Average Directional Index" },
  { name: "williams_r", label: "Williams %R (14)", description: "Williams Percent Range" },
  { name: "ema_cross", label: "EMA 9/21 Cross", description: "Exponential MA crossover" },
  { name: "sma_cross", label: "SMA 50/200 Cross", description: "Golden/death cross" },
  { name: "obv_trend", label: "OBV Trend (20)", description: "On-Balance Volume trend" },
  { name: "psar", label: "Parabolic SAR", description: "Parabolic Stop and Reverse" },
  { name: "ichimoku", label: "Ichimoku Cloud", description: "Ichimoku Kinko Hyo" },
  { name: "vwap_dev", label: "VWAP Dev (20)", description: "VWAP deviation" },
  { name: "roc", label: "ROC (12)", description: "Rate of Change" },
  { name: "net_broker_flow", label: "Net Broker Flow", description: "Broker net position" },
  { name: "order_flow_est", label: "Order Flow (est.)", description: "Tick-rule estimated order flow" },
  { name: "supertrend", label: "Supertrend (10,3)", description: "Supertrend" },
  { name: "tma_dma_cross", label: "TMA(20)/DMA(50)", description: "Triangular vs Daily MA cross" },
  { name: "dema_cross", label: "DEMA 9/21 Cross", description: "Double EMA crossover" },
  { name: "tema_cross", label: "TEMA 9/21 Cross", description: "Triple EMA crossover" },
];
