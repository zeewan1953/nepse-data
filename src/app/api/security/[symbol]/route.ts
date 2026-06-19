import {
  getNepse,
  cached,
  resolveSecurityId,
  getPriceHistoryById,
  getSecurityDetailsById,
} from "@/lib/nepse";
import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";
import { getCandlesFromDb } from "@/lib/db";
import type { SecurityDetails, SecurityPriceVolumeHistory } from "@rumess/nepse-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build history from DB OHLCV candles when NEPSE is unreachable
async function buildHistoryFromDb(
  symbol: string,
): Promise<SecurityPriceVolumeHistory | null> {
  const candles = await getCandlesFromDb(symbol, 500).catch(() => []);
  if (candles.length === 0) return null;

  const content = candles.map((c, i) => ({
    id: i + 1,
    businessDate: c.tradeDate.replace(/\//g, "-"),
    openPrice: c.open,
    highPrice: c.high,
    lowPrice: c.low,
    closePrice: c.close,
    totalTradedQuantity: c.volume,
    totalTradedValue: c.close * c.volume,
    previousDayClosePrice: i > 0 ? candles[i - 1].close : c.open,
    fiftyTwoWeekHigh: 0,
    fiftyTwoWeekLow: 0,
    lastUpdatedTime: "",
    totalTrades: 0,
    lastTradedPrice: c.close,
    averageTradedPrice: c.volume > 0 ? (c.close * c.volume) / c.volume : c.close,
  }));

  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    size: content.length,
    number: 0,
    numberOfElements: content.length,
    first: true,
    last: true,
    empty: false,
  } as SecurityPriceVolumeHistory;
}

// Build daily trade DTO from MeroLagani data
async function buildDetailsFromMero(
  symbol: string,
  historyItem: SecurityPriceVolumeHistory["content"][0] | null,
): Promise<SecurityDetails | null> {
  const mero = await fetchMeroLaganiSummary();
  if (!mero?.stock?.detail?.length) return null;

  const stock = mero.stock.detail.find((s) => s.s === symbol);
  if (!stock) return null;

  const pctChange = calcMeroPercent(stock);
  const prevClose = pctChange !== 0 ? stock.lp / (1 + pctChange / 100) : stock.lp * 0.99;

  return {
    securityDailyTradeDto: {
      securityId: 0,
      openPrice: historyItem?.openPrice ?? stock.lp,
      highPrice: historyItem?.highPrice ?? stock.lp * 1.02,
      lowPrice: historyItem?.lowPrice ?? stock.lp * 0.98,
      totalTradeQuantity: stock.q,
      totalTrades: 0,
      lastTradedPrice: stock.lp,
      previousClose: prevClose,
      businessDate: mero.overall?.d ?? "",
      closePrice: stock.lp,
      fiftyTwoWeekHigh: 0,
      fiftyTwoWeekLow: 0,
      lastUpdatedDateTime: mero.overall?.d ?? "",
    },
    security: {
      id: 0,
      symbol,
      isin: "",
      permittedToTrade: "A",
      listingDate: "",
      creditRating: null,
      tickSize: 1,
      instrumentType: { id: 0, code: "EQ", description: "Equity", activeStatus: "A" },
      capitalGainBaseDate: "",
      faceValue: 100,
      highRangeDPR: 0,
      issuerName: null,
      meInstanceNumber: 0,
      parentId: null,
      recordType: 0,
      schemeDescription: null,
      schemeName: null,
      secured: null,
      series: null,
      shareGroupId: { id: 0, name: "", description: "", capitalRangeMin: 0, modifiedBy: null, modifiedDate: null, activeStatus: "A", isDefault: "N" },
      activeStatus: "A",
      divisor: 0,
      cdsStockRefId: 0,
      securityName: symbol,
      tradingStartDate: "",
      networthBasePrice: 0,
      securityTradeCycle: 0,
      isPromoter: "N",
      companyId: {
        id: 0, companyShortName: symbol, companyName: symbol, email: "", companyWebsite: "",
        companyContactPerson: "", sectorMaster: { id: 0, sectorDescription: "", activeStatus: "A", regulatoryBody: "" },
        companyRegistrationNumber: "", activeStatus: "A",
      },
    },
    stockListedShares: 0,
    paidUpCapital: 0,
    issuedCapital: 0,
    marketCapitalization: 0,
    publicShares: 0,
    publicPercentage: 0,
    promoterShares: 0,
    promoterPercentage: 0,
    updatedDate: "",
    securityId: 0,
  } as SecurityDetails;
}

// Full detail for one company: profile/details, price-volume history (for the
// candlestick chart + indicators) and live market depth (buy/sell order book).
// Resolves the security id from multiple feeds so symbols missing from the
// keymap still work, and returns a clean 404 for truly unknown symbols.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol: raw } = await ctx.params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  try {
    const data = await cached(`security:${symbol}`, 5_000, async () => {
      // 1. Try NEPSE API first
      try {
        const nepse = getNepse();
        const id = await resolveSecurityId(symbol);
        if (id) {
          const [details, history, depth] = await Promise.all([
            getSecurityDetailsById(id).catch(() => null) as Promise<SecurityDetails | null>,
            getPriceHistoryById(id, 500).catch(() => null) as Promise<SecurityPriceVolumeHistory | null>,
            nepse.getMarketDepth(symbol).catch(() => null),
          ]);
          if (details || history) {
            return { symbol, id, details, history, depth };
          }
        }
      } catch {
        // NEPSE unreachable, fall through to fallbacks
      }

      // 2. Fallback: DB history + MeroLagani live data
      const history = await buildHistoryFromDb(symbol);
      const lastItem = history?.content?.length ? history.content[history.content.length - 1] : null;
      const details = await buildDetailsFromMero(symbol, lastItem).catch(() => null);

      if (history || details) {
        return { symbol, id: 0, details, history, depth: null };
      }

      return null;
    });

    if (!data) {
      return Response.json(
        { error: `Symbol "${symbol}" not found (it may be delisted or renamed).` },
        { status: 404 },
      );
    }
    return Response.json(data);
  } catch (e) {
    return Response.json(
      { error: (e as Error)?.message ?? "Failed to load security" },
      { status: 502 },
    );
  }
}
