// Volume analysis — average volume, current spike ratio, and On-Balance Volume
// (OBV) trend for confirming price moves.
import { sma } from "./movingAverage";

export type VolumeStats = {
  avgVolume: number | null;
  lastVolume: number;
  spikeRatio: number | null; // lastVolume / avgVolume
  obv: number;
  obvRising: boolean | null;
};

export function volumeAnalysis(
  closes: number[],
  volumes: number[],
  period = 20,
): VolumeStats {
  const avgVolume = sma(volumes, period);
  const lastVolume = volumes[volumes.length - 1] ?? 0;
  const spikeRatio = avgVolume && avgVolume > 0 ? lastVolume / avgVolume : null;

  // On-Balance Volume
  let obv = 0;
  const obvSeries: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i] ?? 0;
    else if (closes[i] < closes[i - 1]) obv -= volumes[i] ?? 0;
    obvSeries.push(obv);
  }
  const recent = obvSeries.slice(-5);
  const obvRising =
    recent.length >= 2 ? recent[recent.length - 1] > recent[0] : null;

  return { avgVolume, lastVolume, spikeRatio, obv, obvRising };
}
