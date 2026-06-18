// NEPSE fee calculator and order validator for demo trading
// All values are based on current NEPSE/SEBON regulations

export const MIN_LOT_SIZE = 10; // Minimum 10 shares per trade
export const CIRCUIT_BAND_PCT = 0.10; // ±10% of previous close

export type FeeBreakdown = {
  tradeValue: number;
  brokerComm: number;
  sebonFee: number;
  dpFee: number;
  total: number;
};

// Calculate NEPSE transaction fees
export function calcFees(_side: "buy" | "sell", qty: number, price: number): FeeBreakdown {
  const tradeValue = qty * price;

  // Broker commission: 0.15% for trade value > 500K, else 0.3% (min Rs 50)
  let brokerComm: number;
  if (tradeValue > 500_000) {
    brokerComm = tradeValue * 0.0015;
  } else {
    brokerComm = Math.max(tradeValue * 0.003, 50);
  }

  // SEBON regulation fee: 0.015% of trade value
  const sebonFee = tradeValue * 0.00015;

  // DP (CDS) fee: Rs 25 per trade
  const dpFee = 25;

  const total = brokerComm + sebonFee + dpFee;

  return {
    tradeValue: Math.round(tradeValue * 100) / 100,
    brokerComm: Math.round(brokerComm * 100) / 100,
    sebonFee: Math.round(sebonFee * 100) / 100,
    dpFee: Math.round(dpFee * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export type ValidationResult = {
  valid: boolean;
  error?: string;
};

// Validate an order before execution
export function validateOrder(
  side: "buy" | "sell",
  qty: number,
  price: number,
  prevClose: number,
  cash: number,
  positionQty: number,
): ValidationResult {
  // Minimum lot size
  if (qty < MIN_LOT_SIZE) {
    return { valid: false, error: `Minimum lot size is ${MIN_LOT_SIZE} shares` };
  }

  // Lot size must be multiple of 1 (NEPSE allows any qty >= 10)
  if (!Number.isInteger(qty)) {
    return { valid: false, error: "Quantity must be a whole number" };
  }

  // Price validation
  if (price <= 0) {
    return { valid: false, error: "Invalid price" };
  }

  // Circuit band check (only if we have previous close)
  if (prevClose > 0) {
    const lowerLimit = prevClose * (1 - CIRCUIT_BAND_PCT);
    const upperLimit = prevClose * (1 + CIRCUIT_BAND_PCT);
    if (price < lowerLimit || price > upperLimit) {
      return {
        valid: false,
        error: `Price Rs ${price.toFixed(2)} is outside circuit band (±10%): Rs ${lowerLimit.toFixed(2)} – Rs ${upperLimit.toFixed(2)}`,
      };
    }
  }

  // Cash / quantity checks
  const fees = calcFees(side, qty, price);
  const totalCost = fees.tradeValue + fees.total;

  if (side === "buy") {
    if (totalCost > cash) {
      return {
        valid: false,
        error: `Insufficient cash. Need Rs ${totalCost.toFixed(0)}, have Rs ${cash.toFixed(0)}`,
      };
    }
  }

  if (side === "sell") {
    if (qty > positionQty) {
      return {
        valid: false,
        error: `Insufficient shares. Need ${qty}, have ${positionQty}`,
      };
    }
  }

  return { valid: true };
}
