// Re-export the modular tactical-analysis signal engine so existing imports
// from "@/lib/signals" keep working.
export {
  generateSignal,
  type Signal,
  type Candle,
  type Factor,
} from "@/tactical-analysis/calculation/signalEngine";
