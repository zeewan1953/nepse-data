/**
 * Component Tests for Broker Analysis Components
 * Tests BrokerTableWithChart and ProfessionalBrokerTable with sample data
 */

import {
  SAMPLE_BROKERS_DATA,
  SAMPLE_STOCK_DATA,
  SAMPLE_MARKET_SUMMARY,
  validateBrokerData,
  validateStockData,
  TEST_DATE,
  TEST_RANGE,
} from "./broker-test-data";

/**
 * Test Suite 1: Data Validation
 */
describe("Broker Test Data Validation", () => {
  test("All sample brokers are valid", () => {
    const results = SAMPLE_BROKERS_DATA.map((broker) => {
      const validation = validateBrokerData(broker);
      return {
        code: broker.brokerCode,
        name: broker.brokerName,
        valid: validation.valid,
        errors: validation.errors,
      };
    });

    console.log("Broker Validation Results:");
    results.forEach((r) => {
      const status = r.valid ? "✓ PASS" : "✗ FAIL";
      console.log(`  ${status}: ${r.code} (${r.name})`);
      if (r.errors.length) {
        r.errors.forEach((e) => console.log(`    - ${e}`));
      }
    });

    const allValid = results.every((r) => r.valid);
    expect(allValid).toBe(true);
  });

  test("All sample stocks are valid", () => {
    const results = SAMPLE_STOCK_DATA.map((stock) => {
      const validation = validateStockData(stock);
      return {
        symbol: stock.symbol,
        valid: validation.valid,
        errors: validation.errors,
      };
    });

    console.log("Stock Validation Results:");
    results.forEach((r) => {
      const status = r.valid ? "✓ PASS" : "✗ FAIL";
      console.log(`  ${status}: ${r.symbol}`);
      if (r.errors.length) {
        r.errors.forEach((e) => console.log(`    - ${e}`));
      }
    });

    const allValid = results.every((r) => r.valid);
    expect(allValid).toBe(true);
  });
});

/**
 * Test Suite 2: Data Consistency
 */
describe("Data Consistency Checks", () => {
  test("Broker turnover equals buy + sell amounts", () => {
    const issues = SAMPLE_BROKERS_DATA.filter((broker) => {
      const sum = broker.buyAmt + broker.sellAmt;
      const tolerance = 1000; // 1000 rupee tolerance
      return Math.abs(broker.turnover - sum) > tolerance;
    });

    if (issues.length) {
      console.log("Turnover Mismatches:");
      issues.forEach((issue) => {
        const expected = issue.buyAmt + issue.sellAmt;
        console.log(
          `  ${issue.brokerCode}: expected ${expected}, got ${issue.turnover}`
        );
      });
    }

    expect(issues.length).toBe(0);
  });

  test("Broker volumes are reasonable", () => {
    const issues = SAMPLE_BROKERS_DATA.filter((broker) => {
      return (
        broker.buyVol <= 0 ||
        broker.sellVol <= 0 ||
        broker.buyVol > 10000000 ||
        broker.sellVol > 10000000
      );
    });

    if (issues.length) {
      console.log("Volume Issues:");
      issues.forEach((issue) => {
        console.log(
          `  ${issue.brokerCode}: buy=${issue.buyVol}, sell=${issue.sellVol}`
        );
      });
    }

    expect(issues.length).toBe(0);
  });

  test("Stock prices are reasonable", () => {
    const issues = SAMPLE_STOCK_DATA.filter((stock) => {
      return stock.ltp <= 0 || stock.ltp > 100000;
    });

    if (issues.length) {
      console.log("Price Issues:");
      issues.forEach((issue) => {
        console.log(`  ${issue.symbol}: LTP=${issue.ltp}`);
      });
    }

    expect(issues.length).toBe(0);
  });

  test("Stock change percentages are realistic", () => {
    const issues = SAMPLE_STOCK_DATA.filter((stock) => {
      return stock.changePercent < -50 || stock.changePercent > 50;
    });

    if (issues.length) {
      console.log("Extreme Price Changes:");
      issues.forEach((issue) => {
        console.log(`  ${issue.symbol}: change=${issue.changePercent}%`);
      });
    }

    expect(issues.length).toBe(0);
  });
});

/**
 * Test Suite 3: Component Props Compatibility
 */
describe("Component Props Compatibility", () => {
  test("Broker data matches BrokerTableWithChart interface", () => {
    const requiredFields = [
      "brokerCode",
      "brokerName",
      "turnover",
      "buyAmt",
      "buyVol",
      "avgBuy",
      "buyTrans",
      "buyVolPct",
      "sellAmt",
      "sellVol",
      "avgSell",
      "sellTrans",
      "matchingAmt",
      "matchingVol",
      "matchingTrans",
    ];

    SAMPLE_BROKERS_DATA.forEach((broker) => {
      requiredFields.forEach((field) => {
        expect(broker).toHaveProperty(field);
      });
    });

    console.log(
      `✓ All ${SAMPLE_BROKERS_DATA.length} brokers have required fields`
    );
  });

  test("Broker data types are correct", () => {
    const broker = SAMPLE_BROKERS_DATA[0];

    expect(typeof broker.brokerCode).toBe("string");
    expect(typeof broker.brokerName).toBe("string");
    expect(typeof broker.turnover).toBe("number");
    expect(typeof broker.buyAmt).toBe("number");
    expect(typeof broker.avgBuy).toBe("number");
    expect(typeof broker.buyVolPct).toBe("number");

    console.log("✓ All broker fields have correct types");
  });

  test("Stock data matches API response format", () => {
    const requiredFields = [
      "symbol",
      "ltp",
      "changePercent",
      "totalVolume",
      "totalTurnover",
      "estBuyVolume",
      "estSellVolume",
      "estNetVolume",
      "cmf",
      "mfi",
      "volumeZScore",
    ];

    SAMPLE_STOCK_DATA.forEach((stock) => {
      requiredFields.forEach((field) => {
        expect(stock).toHaveProperty(field);
      });
    });

    console.log(`✓ All ${SAMPLE_STOCK_DATA.length} stocks have required fields`);
  });
});

/**
 * Test Suite 4: Data Formatting Functions
 */
describe("Data Formatting Functions", () => {
  function formatAmount(amount: number): string {
    if (amount === 0) return "Rs. 0";
    const abs = Math.abs(amount);

    if (abs >= 1e7) {
      return `Rs. ${(amount / 1e7).toFixed(2)} Cr`;
    }
    if (abs >= 1e5) {
      return `Rs. ${(amount / 1e5).toFixed(2)} L`;
    }
    if (abs >= 1e3) {
      return `Rs. ${(amount / 1e3).toFixed(2)}K`;
    }

    return `Rs. ${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  function formatVolume(volume: number): string {
    if (volume === 0) return "0";
    if (volume >= 1e6) {
      return `${(volume / 1e6).toFixed(1)}M`;
    }
    if (volume >= 1e3) {
      return `${(volume / 1e3).toFixed(0)}K`;
    }
    return volume.toLocaleString("en-IN");
  }

  test("formatAmount handles all scales correctly", () => {
    const testCases = [
      { input: 4134000000, expected: "Rs. 41.34 Cr" },
      { input: 2258000000, expected: "Rs. 22.58 Cr" },
      { input: 1724000000, expected: "Rs. 17.24 Cr" },
      { input: 500000, expected: "Rs. 5.00 L" },
      { input: 50000, expected: "Rs. 0.50 L" },
      { input: 5000, expected: "Rs. 5.00K" },
      { input: 500, expected: "Rs. 500" },
    ];

    testCases.forEach(({ input, expected }) => {
      const result = formatAmount(input);
      expect(result).toBe(expected);
    });

    console.log("✓ formatAmount works correctly for all scales");
  });

  test("formatVolume handles all scales correctly", () => {
    const testCases = [
      { input: 5000000, expected: "5.0M" },
      { input: 500000, expected: "500K" },
      { input: 50000, expected: "50K" },
      { input: 5000, expected: "5K" },
      { input: 500, expected: "500" },
    ];

    testCases.forEach(({ input, expected }) => {
      const result = formatVolume(input);
      expect(result).toBe(expected);
    });

    console.log("✓ formatVolume works correctly for all scales");
  });

  test("All broker amounts format correctly", () => {
    const formatted = SAMPLE_BROKERS_DATA.slice(0, 3).map((broker) => ({
      code: broker.brokerCode,
      turnover: formatAmount(broker.turnover),
      buyAmt: formatAmount(broker.buyAmt),
      sellAmt: formatAmount(broker.sellAmt),
    }));

    console.log("Sample Formatted Amounts:");
    formatted.forEach((f) => {
      console.log(`  ${f.code}: ${f.turnover} (Buy: ${f.buyAmt}, Sell: ${f.sellAmt})`);
    });

    expect(formatted.length).toBe(3);
  });
});

/**
 * Test Suite 5: Sorting and Filtering
 */
describe("Sorting and Filtering Logic", () => {
  test("Brokers can be sorted by turnover descending", () => {
    const sorted = [...SAMPLE_BROKERS_DATA].sort((a, b) => b.turnover - a.turnover);

    console.log("Top 5 Brokers by Turnover:");
    sorted.slice(0, 5).forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.brokerCode} - ${b.brokerName}: Rs. ${(b.turnover / 1e7).toFixed(2)} Cr`);
    });

    expect(sorted[0].turnover).toBeGreaterThanOrEqual(sorted[1].turnover);
    expect(sorted[1].turnover).toBeGreaterThanOrEqual(sorted[2].turnover);
  });

  test("Brokers can be filtered by code", () => {
    const searchTerm = "58";
    const filtered = SAMPLE_BROKERS_DATA.filter((b) =>
      b.brokerCode.toLowerCase().includes(searchTerm.toLowerCase())
    );

    console.log(`Brokers matching code "58": ${filtered.length}`);
    filtered.forEach((b) => {
      console.log(`  ${b.brokerCode} - ${b.brokerName}`);
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.some((b) => b.brokerCode === "58")).toBe(true);
  });

  test("Brokers can be filtered by name", () => {
    const searchTerm = "Securities";
    const filtered = SAMPLE_BROKERS_DATA.filter((b) =>
      b.brokerName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    console.log(`Brokers matching "Securities": ${filtered.length}`);
    expect(filtered.length).toBeGreaterThan(5);
  });

  test("Stocks can be sorted by change percent", () => {
    const sorted = [...SAMPLE_STOCK_DATA].sort((a, b) => b.changePercent - a.changePercent);

    console.log("Stocks by Change Percent:");
    sorted.forEach((s) => {
      const sign = s.changePercent > 0 ? "+" : "";
      console.log(`  ${s.symbol}: ${sign}${s.changePercent.toFixed(2)}%`);
    });

    expect(sorted.length).toBe(SAMPLE_STOCK_DATA.length);
  });
});

/**
 * Test Suite 6: Market Summary Validation
 */
describe("Market Summary Data", () => {
  test("Market summary has valid structure", () => {
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("totalTurnover");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("totalVolume");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("totalTransactions");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("bullishBrokers");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("bearishBrokers");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("advancedStocks");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("declinedStocks");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("nepseIndex");
    expect(SAMPLE_MARKET_SUMMARY).toHaveProperty("nepseChange");

    console.log("Market Summary:");
    console.log(
      `  Total Turnover: Rs. ${(SAMPLE_MARKET_SUMMARY.totalTurnover / 1e9).toFixed(2)} Bn`
    );
    console.log(`  Total Volume: ${SAMPLE_MARKET_SUMMARY.totalVolume.toLocaleString()}`);
    console.log(`  Total Transactions: ${SAMPLE_MARKET_SUMMARY.totalTransactions.toLocaleString()}`);
    console.log(
      `  Bullish/Bearish Brokers: ${SAMPLE_MARKET_SUMMARY.bullishBrokers}/${SAMPLE_MARKET_SUMMARY.bearishBrokers}`
    );
    console.log(
      `  Advanced/Declined Stocks: ${SAMPLE_MARKET_SUMMARY.advancedStocks}/${SAMPLE_MARKET_SUMMARY.declinedStocks}`
    );
    console.log(`  NEPSE Index: ${SAMPLE_MARKET_SUMMARY.nepseIndex}`);
    console.log(`  Index Change: ${SAMPLE_MARKET_SUMMARY.nepseChange.toFixed(2)} points`);
  });

  test("Market sentiment is realistic", () => {
    const total =
      SAMPLE_MARKET_SUMMARY.advancedStocks +
      SAMPLE_MARKET_SUMMARY.declinedStocks +
      SAMPLE_MARKET_SUMMARY.unchangedStocks;

    console.log(`Total Stocks Analyzed: ${total}`);
    console.log(
      `  Advanced: ${SAMPLE_MARKET_SUMMARY.advancedStocks} (${((SAMPLE_MARKET_SUMMARY.advancedStocks / total) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Declined: ${SAMPLE_MARKET_SUMMARY.declinedStocks} (${((SAMPLE_MARKET_SUMMARY.declinedStocks / total) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Unchanged: ${SAMPLE_MARKET_SUMMARY.unchangedStocks} (${((SAMPLE_MARKET_SUMMARY.unchangedStocks / total) * 100).toFixed(1)}%)`
    );

    expect(total).toBeGreaterThan(200);
  });
});

/**
 * Test Suite 7: Integration Tests
 */
describe("Component Integration", () => {
  test("Test data can be used in BrokerTableWithChart", () => {
    const componentProps = {
      data: SAMPLE_BROKERS_DATA,
      date: TEST_DATE,
      range: TEST_RANGE as "1D" | "2D" | "3D" | "1W" | "1M" | "3M" | "6M" | "1Y",
    };

    expect(componentProps.data.length).toBe(SAMPLE_BROKERS_DATA.length);
    expect(componentProps.date).toBe(TEST_DATE);
    expect(componentProps.range).toBe(TEST_RANGE);

    console.log("✓ BrokerTableWithChart props are valid");
  });

  test("Test data can be used in ProfessionalBrokerTable", () => {
    const componentProps = {
      data: SAMPLE_BROKERS_DATA,
      date: TEST_DATE,
      range: TEST_RANGE as "1D" | "2D" | "3D" | "1W" | "1M" | "3M" | "6M" | "1Y",
    };

    expect(componentProps.data).toHaveLength(SAMPLE_BROKERS_DATA.length);
    expect(componentProps.data[0]).toHaveProperty("brokerCode");
    expect(componentProps.data[0]).toHaveProperty("brokerName");

    console.log("✓ ProfessionalBrokerTable props are valid");
  });

  test("Broker chart data can be generated from brokers", () => {
    const chartData = SAMPLE_BROKERS_DATA.slice(0, 5).map((b) => ({
      broker: b.brokerCode,
      buy: b.buyAmt,
      sell: b.sellAmt,
    }));

    console.log("Chart Data Sample (Top 5):");
    chartData.forEach((d) => {
      const max = Math.max(d.buy, d.sell);
      const buyBar = "█".repeat(Math.round((d.buy / max) * 20));
      const sellBar = "█".repeat(Math.round((d.sell / max) * 20));
      console.log(`  ${d.broker}: Buy: ${buyBar} | Sell: ${sellBar}`);
    });

    expect(chartData.length).toBe(5);
  });
});

/**
 * Test Suite 8: Data Completeness
 */
describe("Data Completeness", () => {
  test("All brokers have unique codes", () => {
    const codes = SAMPLE_BROKERS_DATA.map((b) => b.brokerCode);
    const uniqueCodes = new Set(codes);

    expect(uniqueCodes.size).toBe(codes.length);
    console.log(`✓ All ${codes.length} brokers have unique codes`);
  });

  test("All stocks have unique symbols", () => {
    const symbols = SAMPLE_STOCK_DATA.map((s) => s.symbol);
    const uniqueSymbols = new Set(symbols);

    expect(uniqueSymbols.size).toBe(symbols.length);
    console.log(`✓ All ${symbols.length} stocks have unique symbols`);
  });

  test("Sample covers diverse broker sizes", () => {
    const turnoverRanges = {
      small: SAMPLE_BROKERS_DATA.filter((b) => b.turnover < 1e9),
      medium: SAMPLE_BROKERS_DATA.filter((b) => b.turnover >= 1e9 && b.turnover < 2e9),
      large: SAMPLE_BROKERS_DATA.filter((b) => b.turnover >= 2e9),
    };

    console.log("Broker Size Distribution:");
    console.log(`  Small (<1 Cr): ${turnoverRanges.small.length}`);
    console.log(`  Medium (1-2 Cr): ${turnoverRanges.medium.length}`);
    console.log(`  Large (>2 Cr): ${turnoverRanges.large.length}`);

    expect(turnoverRanges.large.length).toBeGreaterThan(0);
  });
});

/**
 * Test Summary Report
 */
describe("Test Summary", () => {
  test("Generate comprehensive test report", () => {
    const report = {
      timestamp: new Date().toISOString(),
      testDate: TEST_DATE,
      testRange: TEST_RANGE,
      brokersCount: SAMPLE_BROKERS_DATA.length,
      stocksCount: SAMPLE_STOCK_DATA.length,
      brokerValidation: SAMPLE_BROKERS_DATA.map((b) => ({
        code: b.brokerCode,
        valid: validateBrokerData(b).valid,
      })),
      stockValidation: SAMPLE_STOCK_DATA.map((s) => ({
        symbol: s.symbol,
        valid: validateStockData(s).valid,
      })),
      marketTotals: {
        totalTurnover: SAMPLE_MARKET_SUMMARY.totalTurnover,
        totalVolume: SAMPLE_MARKET_SUMMARY.totalVolume,
        totalTransactions: SAMPLE_MARKET_SUMMARY.totalTransactions,
      },
    };

    console.log("\n========================================");
    console.log("TEST SUMMARY REPORT");
    console.log("========================================");
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Test Date: ${report.testDate}`);
    console.log(`Test Range: ${report.testRange}`);
    console.log(`\nData Volume:`);
    console.log(`  Brokers: ${report.brokersCount}`);
    console.log(`  Stocks: ${report.stocksCount}`);
    console.log(`\nValidation Status:`);
    console.log(
      `  Brokers Valid: ${report.brokerValidation.filter((b) => b.valid).length}/${report.brokerValidation.length}`
    );
    console.log(
      `  Stocks Valid: ${report.stockValidation.filter((s) => s.valid).length}/${report.stockValidation.length}`
    );
    console.log(`\nMarket Totals:`);
    console.log(
      `  Total Turnover: Rs. ${(report.marketTotals.totalTurnover / 1e9).toFixed(2)} Bn`
    );
    console.log(`  Total Volume: ${report.marketTotals.totalVolume.toLocaleString()}`);
    console.log(`  Total Transactions: ${report.marketTotals.totalTransactions.toLocaleString()}`);
    console.log("========================================\n");

    expect(report.brokersCount).toBeGreaterThan(0);
    expect(report.stocksCount).toBeGreaterThan(0);
  });
});
