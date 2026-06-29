import { getIndicator } from "./indicator-registry";

type ComparisonOperator = ">" | "<" | ">=" | "<=" | "==" | "crosses_above" | "crosses_below";

interface DefaultSignalCondition {
  type: "default_signal";
  indicator: string;
  equals: "BUY" | "SELL";
}

interface CustomThresholdCondition {
  type: "custom_threshold";
  indicator: string;
  field: "raw_value" | "signal";
  operator: ComparisonOperator;
  value: number;
}

type ConditionAtom = DefaultSignalCondition | CustomThresholdCondition;

interface ConditionGroup {
  logic: "AND" | "OR";
  conditions: ConditionNode[];
}

export type ConditionNode = ConditionAtom | ConditionGroup;

export interface DataRow {
  raw_value: number | null;
  signal: "BUY" | "SELL" | "NEUTRAL" | null;
}

export interface YesterdayDataRow {
  raw_value: number | null;
  signal?: "BUY" | "SELL" | "NEUTRAL" | null;
}

export interface StockData {
  current: DataRow;
  yesterday?: DataRow;
}

function evaluateAtom(atom: ConditionAtom, data: DataRow, yesterdayData?: YesterdayDataRow): boolean {
  const meta = getIndicator(atom.indicator);
  if (!meta) return false;

  if (atom.type === "default_signal") {
    if (data.signal == null) return false;
    return data.signal === atom.equals;
  }

  const { operator, value } = atom;
  const currentVal = atom.field === "raw_value" ? data.raw_value : null;

  if (currentVal == null) return false;

  switch (operator) {
    case ">": return currentVal > value;
    case "<": return currentVal < value;
    case ">=": return currentVal >= value;
    case "<=": return currentVal <= value;
    case "==": return currentVal === value;
    case "crosses_above":
    case "crosses_below": {
      if (!yesterdayData) return false;
      const prevVal = atom.field === "raw_value" ? yesterdayData.raw_value : null;
      if (prevVal == null) return false;
      if (operator === "crosses_above") return prevVal <= value && currentVal > value;
      return prevVal >= value && currentVal < value;
    }
    default: return false;
  }
}

export function evaluateConditionTree(
  node: ConditionNode,
  data: DataRow,
  yesterdayData?: YesterdayDataRow,
): boolean {
  if ("logic" in node) {
    const group = node as ConditionGroup;
    if (group.conditions.length === 0) return false;
    if (group.logic === "AND") {
      return group.conditions.every((c) => evaluateConditionTree(c, data, yesterdayData));
    }
    return group.conditions.some((c) => evaluateConditionTree(c, data, yesterdayData));
  }
  return evaluateAtom(node as ConditionAtom, data, yesterdayData);
}

export interface EvaluationResult {
  triggered: boolean;
  symbol: string;
  missingData: boolean;
}
