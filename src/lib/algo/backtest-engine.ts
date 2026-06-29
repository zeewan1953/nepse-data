import { evaluateConditionTree, type DataRow, type YesterdayDataRow, type ConditionNode } from "./rule-engine";
import { getIndicator } from "./indicator-registry";
import { db } from "@/lib/db";
import type { BacktestResult } from "./types";

interface IndicatorIndex {
  [symbol: string]: {
    [indicatorName: string]: DataRow;
  };
}

async function fetchDay(date: string): Promise<IndicatorIndex> {
  const res = await db.execute({
    sql: "SELECT symbol, indicator_name, raw_value, signal FROM indicator_daily_signal WHERE trade_date = ?",
    args: [date],
  });
  const idx: IndicatorIndex = {};
  for (const r of res.rows) {
    const sym = String(r.symbol);
    const name = String(r.indicator_name);
    if (!idx[sym]) idx[sym] = {};
    idx[sym][name] = {
      raw_value: r.raw_value != null ? Number(r.raw_value) : null,
      signal: r.signal as any,
    };
  }
  return idx;
}

const PRICE_KEYS = new Set(["close", "volume", "pct_change"]);

function getDataForCondition(condition: ConditionNode, dayData: IndicatorIndex, symbol: string): DataRow | null {
  if ("logic" in condition) {
    // For a group, check if any condition has a specific indicator
    const group = condition as { logic: string; conditions: ConditionNode[] };
    for (const c of group.conditions) {
      const d = getDataForCondition(c, dayData, symbol);
      if (d) return d;
    }
    return null;
  }

  const atom = condition as any;
  const indicatorName = atom.indicator as string;

  if (PRICE_KEYS.has(indicatorName)) {
    // Price/volume fields - not in indicator_daily_signal yet, return null
    return null;
  }

  const meta = getIndicator(indicatorName);
  if (!meta) return null;

  if (meta.sourceTable === "signal_daily_snapshot") {
    return null; // Not yet supported in backtest
  }

  const row = dayData[symbol]?.[indicatorName];
  if (!row) return null;

  return row;
}

export async function runBacktest(strategyId: number): Promise<BacktestResult> {
  const row = await db.execute({ sql: "SELECT * FROM algo_strategies WHERE id = ?", args: [strategyId] });
  if (!row.rows.length) throw new Error("Strategy not found");
  const s = row.rows[0];
  const entryRule: ConditionNode = typeof s.entry_rule === "string" ? JSON.parse(s.entry_rule) : s.entry_rule;
  const exitRule: ConditionNode = typeof s.exit_rule === "string" ? JSON.parse(s.exit_rule) : s.exit_rule;

  // Collect all indicators referenced in the rules
  function collectIndicators(node: ConditionNode, set: Set<string>) {
    if ("logic" in node) {
      for (const c of (node as any).conditions) collectIndicators(c, set);
    } else {
      set.add((node as any).indicator);
    }
  }
  const requiredIndicators = new Set<string>();
  collectIndicators(entryRule, requiredIndicators);
  collectIndicators(exitRule, requiredIndicators);

  // Get available dates
  const datesRes = await db.execute("SELECT DISTINCT trade_date FROM indicator_daily_signal ORDER BY trade_date ASC");
  const dates = datesRes.rows.map((r: any) => String(r.trade_date));
  if (dates.length < 2) return emptyResult("Insufficient historical data to run backtest.");

  // Get symbols
  let symbols: string[];
  if (s.universe === "custom_list" && s.custom_symbol_list != null) {
    symbols = JSON.parse(String(s.custom_symbol_list)) as string[];
  } else {
    const symRes = await db.execute("SELECT DISTINCT symbol FROM indicator_daily_signal");
    symbols = symRes.rows.map((r: any) => String(r.symbol));
  }

  const trades: BacktestResult["trades"] = [];
  const equityCurve: { date: string; equity: number }[] = [];
  let cash = 1000000;
  let peak = cash;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  const holdings: Map<string, { entryDate: string; entryPrice: number; qty: number }> = new Map();

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prevDate = dates[i - 1];
    const dayData = await fetchDay(date);
    const prevDayData = await fetchDay(prevDate);
    let nextDate: string | null = i + 1 < dates.length ? dates[i + 1] : null;

    // Process exits first
    const openSymbols = [...holdings.keys()];
    for (const sym of openSymbols) {
      const data = getDataForCondition(exitRule, dayData, sym);
      if (!data) continue;
      const yesterday: YesterdayDataRow | undefined = getDataForCondition(exitRule, prevDayData, sym) || undefined;

      const exitTriggered = evaluateConditionTree(exitRule, data, yesterday);
      if (exitTriggered && nextDate) {
        const h = holdings.get(sym)!;
        const nextPrice = await getOpenPrice(sym, nextDate);
        if (nextPrice) {
          const exitVal = nextPrice * h.qty;
          cash += exitVal;
          const pnlPct = ((nextPrice - h.entryPrice) / h.entryPrice) * 100;
          trades.push({
            entryDate: h.entryDate,
            exitDate: date,
            symbol: sym,
            entryPrice: h.entryPrice,
            exitPrice: nextPrice,
            pnlPct: Math.round(pnlPct * 100) / 100,
            exitReason: "rule_exit",
          });
          if (pnlPct >= 0) wins++; else losses++;
          holdings.delete(sym);
        }
      }
    }

    // Process entries
    for (const sym of symbols) {
      if (holdings.has(sym)) continue;
      if (holdings.size >= Number(s.max_concurrent_positions)) break;

      const data = getDataForCondition(entryRule, dayData, sym);
      if (!data) continue;
      const yesterday: YesterdayDataRow | undefined = getDataForCondition(entryRule, prevDayData, sym) || undefined;

      const entryTriggered = evaluateConditionTree(entryRule, data, yesterday);
      if (entryTriggered && nextDate) {
        const nextPrice = await getOpenPrice(sym, nextDate);
        if (nextPrice) {
          const positionSize = cash * (Number(s.position_size_pct) / 100);
          const qty = Math.floor(positionSize / nextPrice);
          if (qty > 0) {
            holdings.set(sym, { entryDate: date, entryPrice: nextPrice, qty });
            cash -= qty * nextPrice;
          }
        }
      }
    }

    // Snapshot equity
    let posVal = 0;
    for (const [, h] of holdings) {
      const price = await getOpenPrice(h.entryDate, date);
      if (price) posVal += price * h.qty;
    }
    const eq = cash + posVal;
    equityCurve.push({ date, equity: Math.round(eq) });
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const tradeCount = trades.length;
  const winRate = tradeCount > 0 ? (wins / tradeCount) * 100 : 0;
  const totalEquity = cash;
  const totalReturnPct = ((totalEquity - 1000000) / 1000000) * 100;
  const avgHoldingPeriod = trades.length > 0
    ? trades.reduce((sum, t) => {
        if (!t.exitDate) return sum;
        const days = (new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime()) / 86400000;
        return sum + days;
      }, 0) / trades.length
    : 0;

  return {
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    tradeCount,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    avgHoldingPeriod: Math.round(avgHoldingPeriod * 100) / 100,
    equityCurve,
    trades,
    disclaimer: "Backtested performance is simulated against historical data and does not guarantee future results. Live results may differ. Stop-loss/take-profit are checked once daily at close, not intraday \u2014 a real intraday-triggered stop is not simulated here.",
  };
}

async function getOpenPrice(symbol: string, date: string): Promise<number | null> {
  const row = await db.execute({
    sql: "SELECT open FROM stock_daily_ohlcv WHERE symbol = ? AND tradeDate = ?",
    args: [symbol, date],
  });
  if (row.rows.length && row.rows[0].open != null) return Number(row.rows[0].open);
  const fRow = await db.execute({
    sql: "SELECT close FROM stock_daily_ohlcv WHERE symbol = ? AND tradeDate = ?",
    args: [symbol, date],
  });
  return fRow.rows.length && fRow.rows[0].close != null ? Number(fRow.rows[0].close) : null;
}

function emptyResult(msg: string): BacktestResult {
  return {
    totalReturnPct: 0, winRate: 0, tradeCount: 0, maxDrawdown: 0, avgHoldingPeriod: 0,
    equityCurve: [], trades: [], disclaimer: msg,
  };
}
