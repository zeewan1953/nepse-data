/**
 * Test Data for Broker Analysis Components
 * Comprehensive mock data for testing all features
 */

export const SAMPLE_BROKERS_DATA = [
  {
    brokerCode: "58",
    brokerName: "Naasa Securities",
    turnover: 4134000000,
    buyAmt: 1724000000,
    buyVol: 363198,
    avgBuy: 474.9,
    buyTrans: 4589,
    buyVolPct: 5.6,
    sellAmt: 2409000000,
    sellVol: 518806,
    avgSell: 464.52,
    sellTrans: 6913,
    sellVolPct: 8.01,
    matchingAmt: 182000000,
    matchingVol: 35016,
    matchingTrans: 649,
  },
  {
    brokerCode: "32",
    brokerName: "Premier Securities",
    turnover: 2258000000,
    buyAmt: 1026000000,
    buyVol: 326241,
    avgBuy: 314.76,
    buyTrans: 834,
    buyVolPct: 5.03,
    sellAmt: 1231000000,
    sellVol: 415262,
    avgSell: 296.53,
    sellTrans: 1122,
    sellVolPct: 6.41,
    matchingAmt: 548000000,
    matchingVol: 136992,
    matchingTrans: 49,
  },
  {
    brokerCode: "44",
    brokerName: "Dynamic Money Management",
    turnover: 2256000000,
    buyAmt: 1034000000,
    buyVol: 251899,
    avgBuy: 410.56,
    buyTrans: 835,
    buyVolPct: 3.89,
    sellAmt: 1222000000,
    sellVol: 229669,
    avgSell: 532.25,
    sellTrans: 860,
    sellVolPct: 3.54,
    matchingAmt: 152000000,
    matchingVol: 22628,
    matchingTrans: 20,
  },
  {
    brokerCode: "65",
    brokerName: "Sharepro Securities",
    turnover: 1925000000,
    buyAmt: 1031000000,
    buyVol: 270201,
    avgBuy: 381.65,
    buyTrans: 245,
    buyVolPct: 4.17,
    sellAmt: 894000000,
    sellVol: 218589,
    avgSell: 409.13,
    sellTrans: 203,
    sellVolPct: 3.37,
    matchingAmt: 780000000,
    matchingVol: 200046,
    matchingTrans: 12,
  },
  {
    brokerCode: "42",
    brokerName: "Sani Securities",
    turnover: 1781000000,
    buyAmt: 988000000,
    buyVol: 278216,
    avgBuy: 355.43,
    buyTrans: 2152,
    buyVolPct: 4.29,
    sellAmt: 792000000,
    sellVol: 172121,
    avgSell: 460.63,
    sellTrans: 2122,
    sellVolPct: 2.66,
    matchingAmt: 25180000,
    matchingVol: 4810,
    matchingTrans: 113,
  },
  {
    brokerCode: "28",
    brokerName: "Shree Krishna Securities",
    turnover: 1718000000,
    buyAmt: 919000000,
    buyVol: 171330,
    avgBuy: 536.9,
    buyTrans: 595,
    buyVolPct: 2.64,
    sellAmt: 798000000,
    sellVol: 199063,
    avgSell: 401.01,
    sellTrans: 689,
    sellVolPct: 3.07,
    matchingAmt: 65900000,
    matchingVol: 826,
    matchingTrans: 7,
  },
  {
    brokerCode: "45",
    brokerName: "Imperial Securities",
    turnover: 1659000000,
    buyAmt: 908000000,
    buyVol: 206211,
    avgBuy: 440.53,
    buyTrans: 2195,
    buyVolPct: 3.18,
    sellAmt: 750000000,
    sellVol: 160581,
    avgSell: 467.65,
    sellTrans: 1949,
    sellVolPct: 2.48,
    matchingAmt: 21610000,
    matchingVol: 4547,
    matchingTrans: 83,
  },
  {
    brokerCode: "48",
    brokerName: "Trishakti Securities",
    turnover: 1634000000,
    buyAmt: 917000000,
    buyVol: 181559,
    avgBuy: 505.41,
    buyTrans: 1892,
    buyVolPct: 2.8,
    sellAmt: 716000000,
    sellVol: 141497,
    avgSell: 506.61,
    sellTrans: 1118,
    sellVolPct: 2.18,
    matchingAmt: 17980000,
    matchingVol: 4116,
    matchingTrans: 45,
  },
  {
    brokerCode: "77",
    brokerName: "Nabil Securities",
    turnover: 1580000000,
    buyAmt: 738000000,
    buyVol: 65198,
    avgBuy: 1133.02,
    buyTrans: 543,
    buyVolPct: 1.01,
    sellAmt: 841000000,
    sellVol: 72161,
    avgSell: 1166.01,
    sellTrans: 651,
    sellVolPct: 1.11,
    matchingAmt: 19540000,
    matchingVol: 1492,
    matchingTrans: 6,
  },
  {
    brokerCode: "33",
    brokerName: "Dakshinkali Investments",
    turnover: 1503000000,
    buyAmt: 565000000,
    buyVol: 128598,
    avgBuy: 439.94,
    buyTrans: 452,
    buyVolPct: 1.98,
    sellAmt: 938000000,
    sellVol: 249900,
    avgSell: 375.36,
    sellTrans: 808,
    sellVolPct: 3.86,
    matchingAmt: 72050000,
    matchingVol: 20040,
    matchingTrans: 15,
  },
];

export const SAMPLE_STOCK_DATA = [
  {
    symbol: "NRN",
    ltp: 1429,
    changePercent: 0.06,
    totalVolume: 44721,
    totalTurnover: 656000000,
    tradeCount: 850,
    estBuyVolume: 20877,
    estSellVolume: 23694,
    estNetVolume: -2817,
    cmf: 0.45,
    mfi: 52.3,
    volumeZScore: 0.8,
  },
  {
    symbol: "BUNGAL",
    ltp: 658,
    changePercent: 1.54,
    totalVolume: 67145,
    totalTurnover: 520000000,
    tradeCount: 620,
    estBuyVolume: 44092,
    estSellVolume: 22853,
    estNetVolume: 21239,
    cmf: 0.72,
    mfi: 65.8,
    volumeZScore: 1.2,
  },
  {
    symbol: "RSML",
    ltp: 3200,
    changePercent: 3.23,
    totalVolume: 31056,
    totalTurnover: 995200000,
    tradeCount: 445,
    estBuyVolume: 18945,
    estSellVolume: 12111,
    estNetVolume: 6834,
    cmf: 0.58,
    mfi: 58.2,
    volumeZScore: 0.95,
  },
  {
    symbol: "KHPL",
    ltp: 930,
    changePercent: 3.34,
    totalVolume: 28562,
    totalTurnover: 265600000,
    tradeCount: 380,
    estBuyVolume: 16234,
    estSellVolume: 12328,
    estNetVolume: 3906,
    cmf: 0.63,
    mfi: 61.5,
    volumeZScore: 0.88,
  },
  {
    symbol: "HEIP",
    ltp: 344.9,
    changePercent: 3.57,
    totalVolume: 33289,
    totalTurnover: 114800000,
    tradeCount: 410,
    estBuyVolume: 19234,
    estSellVolume: 14055,
    estNetVolume: 5179,
    cmf: 0.68,
    mfi: 63.2,
    volumeZScore: 1.05,
  },
];

export const SAMPLE_MARKET_SUMMARY = {
  totalTurnover: 28382794116.62,
  totalVolume: 64805999,
  totalTransactions: 46751,
  bullishBrokers: 46,
  bearishBrokers: 45,
  advancedStocks: 81,
  declinedStocks: 181,
  unchangedStocks: 65,
  nepseIndex: 2651.52,
  nepseChange: -8.5,
  nepseChangePercent: -0.31,
};

export const TEST_DATE = "2026-06-25";
export const TEST_RANGE = "1D" as const;

/**
 * Test Data Validation Helper
 */
export function validateBrokerData(broker: typeof SAMPLE_BROKERS_DATA[0]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (!broker.brokerCode) errors.push("Missing brokerCode");
  if (!broker.brokerName) errors.push("Missing brokerName");

  // Check numeric fields
  if (broker.turnover < 0) errors.push("Turnover cannot be negative");
  if (broker.buyAmt < 0) errors.push("Buy amount cannot be negative");
  if (broker.sellAmt < 0) errors.push("Sell amount cannot be negative");

  // Check arithmetic: turnover should equal buyAmt + sellAmt
  const expectedTurnover = broker.buyAmt + broker.sellAmt;
  if (Math.abs(broker.turnover - expectedTurnover) > 1000) {
    // Allow 1000 rupee tolerance for rounding
    errors.push(`Turnover mismatch: expected ~${expectedTurnover}, got ${broker.turnover}`);
  }

  // Check percentages
  if (broker.buyVolPct < 0 || broker.buyVolPct > 100) {
    errors.push(`Buy Vol % out of range: ${broker.buyVolPct}`);
  }
  if (broker.sellVolPct < 0 || broker.sellVolPct > 100) {
    errors.push(`Sell Vol % out of range: ${broker.sellVolPct}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test Data Validation Helper for Stocks
 */
export function validateStockData(stock: typeof SAMPLE_STOCK_DATA[0]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!stock.symbol) errors.push("Missing symbol");
  if (stock.ltp < 0) errors.push("LTP cannot be negative");
  if (stock.totalVolume < 0) errors.push("Volume cannot be negative");
  if (stock.totalTurnover < 0) errors.push("Turnover cannot be negative");

  // Check technical indicators
  if (stock.cmf < -1 || stock.cmf > 1) {
    errors.push(`CMF out of range [-1, 1]: ${stock.cmf}`);
  }
  if (stock.mfi < 0 || stock.mfi > 100) {
    errors.push(`MFI out of range [0, 100]: ${stock.mfi}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper to format test data for display
 */
export function formatTestDataSummary() {
  return {
    brokers: {
      total: SAMPLE_BROKERS_DATA.length,
      sample: SAMPLE_BROKERS_DATA[0],
      validation: validateBrokerData(SAMPLE_BROKERS_DATA[0]),
    },
    stocks: {
      total: SAMPLE_STOCK_DATA.length,
      sample: SAMPLE_STOCK_DATA[0],
      validation: validateStockData(SAMPLE_STOCK_DATA[0]),
    },
    market: SAMPLE_MARKET_SUMMARY,
    date: TEST_DATE,
    range: TEST_RANGE,
  };
}
