export type FiscalYear = "2074/75" | "2075/76" | "2076/77" | "2077/78" | "2078/79";

export type FiveYearData = {
  years: FiscalYear[];
  revenue: number[];
  profit: number[];
  eps: number[];
  roe: number[];
  debt: number[];
  dividend: number[];
};

export type StockFundamental = {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  volume: string;
  current: {
    pe: number;
    eps: number;
    shares: string;
    roe: number;
    debt: string;
    revenue: string;
    profit: string;
  };
  fiveYear: FiveYearData;
  ratios: {
    pb: number;
    debtEquity: number;
    currentRatio: number;
    beta: number;
    peg: number;
  };
  holdings: {
    promoter: string;
    fii: string;
    dii: string;
    public: string;
    longTerm: string;
  };
  quarterly: {
    q1: number;
    q1Change: number;
    q2: number;
    q2Change: number;
    q3: number;
    q3Change: number;
    q4: number;
    q4Change: number;
  };
  news: string;
};

const YEARS: FiscalYear[] = ["2074/75", "2075/76", "2076/77", "2077/78", "2078/79"];

function buildStock(
  symbol: string,
  name: string,
  sector: string,
  price: number,
  change: number,
  volume: string,
  current: StockFundamental["current"],
  fiveYear: Omit<FiveYearData, "years">,
  ratios: StockFundamental["ratios"],
  holdings: StockFundamental["holdings"],
  quarterly: StockFundamental["quarterly"],
  news: string,
): StockFundamental {
  return {
    id: `NEPSE-${symbol}`,
    symbol,
    name,
    sector,
    price,
    change,
    volume,
    current,
    fiveYear: { years: YEARS, ...fiveYear },
    ratios,
    holdings,
    quarterly,
    news,
  };
}

export const STOCKS: StockFundamental[] = [
  buildStock(
    "KBL", "Kumari Bank Ltd", "Banking", 1245.60, 2.4, "1.2M",
    { pe: 18.4, eps: 67.8, shares: "2.28 Cr", roe: 22.6, debt: "Rs. 485 Cr", revenue: "Rs. 1,245 Cr", profit: "Rs. 187 Cr" },
    { revenue: [720, 850, 980, 1120, 1245], profit: [92, 115, 138, 162, 187], eps: [32.8, 41.2, 49.6, 58.4, 67.8], roe: [14.2, 16.8, 18.4, 20.2, 22.6], debt: [620, 590, 560, 520, 485], dividend: [22, 28, 32, 38, 45] },
    { pb: 2.8, debtEquity: 0.45, currentRatio: 1.8, beta: 1.2, peg: 1.4 },
    { promoter: "62.4%", fii: "12.8%", dii: "18.6%", public: "6.2%", longTerm: "54%" },
    { q1: 42.5, q1Change: 8, q2: 48.2, q2Change: 13, q3: 52.8, q3Change: 9, q4: 55.3, q4Change: 5 },
    "🟢 Positive",
  ),
  buildStock(
    "NABIL", "Nabil Bank Ltd", "Banking", 1320.00, 1.8, "980K",
    { pe: 16.8, eps: 78.5, shares: "1.92 Cr", roe: 24.2, debt: "Rs. 410 Cr", revenue: "Rs. 1,380 Cr", profit: "Rs. 215 Cr" },
    { revenue: [820, 960, 1100, 1250, 1380], profit: [120, 145, 168, 192, 215], eps: [42.5, 51.8, 60.2, 69.5, 78.5], roe: [16.5, 18.8, 20.5, 22.4, 24.2], debt: [520, 490, 460, 430, 410], dividend: [28, 34, 40, 48, 55] },
    { pb: 2.6, debtEquity: 0.38, currentRatio: 1.9, beta: 1.1, peg: 1.2 },
    { promoter: "58.2%", fii: "15.4%", dii: "20.1%", public: "4.3%", longTerm: "62%" },
    { q1: 50.2, q1Change: 7, q2: 54.8, q2Change: 9, q3: 59.4, q3Change: 8, q4: 62.1, q4Change: 5 },
    "🟢 Strong fundamentals",
  ),
  buildStock(
    "EBL", "Everest Bank Ltd", "Banking", 1180.50, -0.5, "650K",
    { pe: 17.2, eps: 68.6, shares: "1.65 Cr", roe: 21.5, debt: "Rs. 395 Cr", revenue: "Rs. 1,150 Cr", profit: "Rs. 175 Cr" },
    { revenue: [700, 810, 930, 1040, 1150], profit: [105, 125, 142, 160, 175], eps: [40.2, 47.8, 54.5, 61.2, 68.6], roe: [15.8, 17.5, 19.2, 20.5, 21.5], debt: [450, 430, 415, 402, 395], dividend: [25, 30, 35, 40, 46] },
    { pb: 2.4, debtEquity: 0.42, currentRatio: 1.85, beta: 1.0, peg: 1.3 },
    { promoter: "55.0%", fii: "18.2%", dii: "19.4%", public: "4.4%", longTerm: "58%" },
    { q1: 40.5, q1Change: 5, q2: 43.8, q2Change: 8, q3: 47.2, q3Change: 8, q4: 49.5, q4Change: 5 },
    "🟢 Stable growth",
  ),
  buildStock(
    "NICA", "NIC Asia Bank Ltd", "Banking", 895.00, 3.2, "1.5M",
    { pe: 14.5, eps: 61.8, shares: "2.85 Cr", roe: 19.8, debt: "Rs. 620 Cr", revenue: "Rs. 1,520 Cr", profit: "Rs. 205 Cr" },
    { revenue: [850, 1020, 1200, 1360, 1520], profit: [110, 135, 158, 182, 205], eps: [33.5, 41.2, 48.5, 55.2, 61.8], roe: [13.2, 15.5, 17.2, 18.6, 19.8], debt: [720, 690, 665, 640, 620], dividend: [18, 22, 28, 34, 40] },
    { pb: 2.1, debtEquity: 0.55, currentRatio: 1.65, beta: 1.3, peg: 1.1 },
    { promoter: "51.8%", fii: "14.5%", dii: "24.2%", public: "6.5%", longTerm: "48%" },
    { q1: 48.2, q1Change: 12, q2: 51.5, q2Change: 7, q3: 54.8, q3Change: 6, q4: 56.2, q4Change: 3 },
    "🟢 High volume",
  ),
  buildStock(
    "SCB", "Standard Chartered Bank Nepal", "Banking", 1450.00, 0.9, "420K",
    { pe: 15.8, eps: 91.8, shares: "0.95 Cr", roe: 23.5, debt: "Rs. 285 Cr", revenue: "Rs. 980 Cr", profit: "Rs. 165 Cr" },
    { revenue: [620, 720, 820, 905, 980], profit: [95, 112, 130, 148, 165], eps: [55.2, 65.0, 75.4, 83.8, 91.8], roe: [17.2, 19.5, 21.2, 22.5, 23.5], debt: [340, 320, 305, 295, 285], dividend: [35, 42, 50, 58, 65] },
    { pb: 2.7, debtEquity: 0.35, currentRatio: 2.0, beta: 0.9, peg: 1.1 },
    { promoter: "70.0%", fii: "16.5%", dii: "10.2%", public: "1.3%", longTerm: "72%" },
    { q1: 38.5, q1Change: 6, q2: 41.2, q2Change: 7, q3: 44.8, q3Change: 9, q4: 47.1, q4Change: 5 },
    "🟢 Premium valuation",
  ),
  buildStock(
    "MBL", "Machhapuchchhre Bank Ltd", "Banking", 725.00, -1.2, "890K",
    { pe: 13.5, eps: 53.6, shares: "3.12 Cr", roe: 17.8, debt: "Rs. 580 Cr", revenue: "Rs. 1,050 Cr", profit: "Rs. 145 Cr" },
    { revenue: [620, 730, 850, 960, 1050], profit: [82, 98, 115, 132, 145], eps: [30.5, 36.4, 42.8, 48.5, 53.6], roe: [12.5, 14.2, 15.8, 16.8, 17.8], debt: [650, 630, 610, 595, 580], dividend: [15, 18, 22, 26, 30] },
    { pb: 1.8, debtEquity: 0.62, currentRatio: 1.55, beta: 1.3, peg: 1.0 },
    { promoter: "53.5%", fii: "8.5%", dii: "28.4%", public: "7.6%", longTerm: "42%" },
    { q1: 34.2, q1Change: 4, q2: 36.5, q2Change: 7, q3: 38.8, q3Change: 6, q4: 40.2, q4Change: 4 },
    "🟡 Moderate",
  ),
  buildStock(
    "CZBIL", "Citizens Bank International Ltd", "Banking", 695.00, 0.4, "1.1M",
    { pe: 12.8, eps: 54.2, shares: "3.45 Cr", roe: 16.5, debt: "Rs. 720 Cr", revenue: "Rs. 1,180 Cr", profit: "Rs. 165 Cr" },
    { revenue: [680, 790, 920, 1050, 1180], profit: [92, 108, 126, 146, 165], eps: [30.2, 35.5, 41.4, 47.8, 54.2], roe: [11.5, 13.2, 14.6, 15.6, 16.5], debt: [780, 760, 745, 730, 720], dividend: [12, 15, 18, 22, 26] },
    { pb: 1.6, debtEquity: 0.72, currentRatio: 1.5, beta: 1.4, peg: 0.9 },
    { promoter: "50.2%", fii: "7.8%", dii: "32.5%", public: "7.5%", longTerm: "38%" },
    { q1: 38.5, q1Change: 6, q2: 41.2, q2Change: 7, q3: 43.8, q3Change: 6, q4: 45.5, q4Change: 4 },
    "🟡 Value play",
  ),
  buildStock(
    "NIB", "Nepal Investment Bank Ltd", "Banking", 610.00, -2.1, "1.3M",
    { pe: 11.5, eps: 53.0, shares: "4.02 Cr", roe: 14.8, debt: "Rs. 850 Cr", revenue: "Rs. 1,250 Cr", profit: "Rs. 165 Cr" },
    { revenue: [780, 900, 1040, 1150, 1250], profit: [105, 120, 138, 152, 165], eps: [33.8, 38.8, 44.5, 48.8, 53.0], roe: [11.8, 12.8, 13.8, 14.4, 14.8], debt: [920, 895, 875, 860, 850], dividend: [10, 12, 15, 18, 20] },
    { pb: 1.4, debtEquity: 0.85, currentRatio: 1.42, beta: 1.4, peg: 0.8 },
    { promoter: "48.5%", fii: "6.5%", dii: "35.2%", public: "8.8%", longTerm: "32%" },
    { q1: 38.2, q1Change: 2, q2: 40.5, q2Change: 6, q3: 41.8, q3Change: 3, q4: 42.5, q4Change: 2 },
    "🔴 High debt",
  ),
  buildStock(
    "PRVU", "Prabhu Bank Ltd", "Banking", 585.00, 1.5, "1.0M",
    { pe: 12.2, eps: 47.9, shares: "3.68 Cr", roe: 15.8, debt: "Rs. 650 Cr", revenue: "Rs. 1,020 Cr", profit: "Rs. 135 Cr" },
    { revenue: [620, 720, 840, 940, 1020], profit: [82, 95, 110, 124, 135], eps: [29.2, 33.8, 39.2, 43.8, 47.9], roe: [11.2, 12.5, 14.0, 15.0, 15.8], debt: [720, 695, 680, 665, 650], dividend: [12, 14, 17, 20, 24] },
    { pb: 1.5, debtEquity: 0.68, currentRatio: 1.52, beta: 1.3, peg: 0.9 },
    { promoter: "52.0%", fii: "7.5%", dii: "31.8%", public: "6.7%", longTerm: "36%" },
    { q1: 31.5, q1Change: 5, q2: 33.8, q2Change: 7, q3: 35.8, q3Change: 6, q4: 36.8, q4Change: 3 },
    "🟡 Recovery play",
  ),
  buildStock(
    "SBI", "Nepal SBI Bank Ltd", "Banking", 665.00, 0.7, "520K",
    { pe: 13.0, eps: 51.1, shares: "2.28 Cr", roe: 16.2, debt: "Rs. 480 Cr", revenue: "Rs. 820 Cr", profit: "Rs. 118 Cr" },
    { revenue: [520, 610, 700, 765, 820], profit: [68, 82, 94, 108, 118], eps: [29.5, 35.6, 40.8, 46.2, 51.1], roe: [11.5, 13.2, 14.5, 15.5, 16.2], debt: [540, 515, 500, 490, 480], dividend: [14, 17, 20, 23, 27] },
    { pb: 1.7, debtEquity: 0.58, currentRatio: 1.62, beta: 1.1, peg: 1.0 },
    { promoter: "61.8%", fii: "9.2%", dii: "22.5%", public: "4.5%", longTerm: "46%" },
    { q1: 28.2, q1Change: 6, q2: 30.5, q2Change: 8, q3: 32.4, q3Change: 6, q4: 33.8, q4Change: 4 },
    "🟢 Stable",
  ),
  buildStock(
    "HBL", "Himalayan Bank Ltd", "Banking", 820.00, -0.3, "780K",
    { pe: 14.8, eps: 55.4, shares: "2.55 Cr", roe: 18.2, debt: "Rs. 520 Cr", revenue: "Rs. 950 Cr", profit: "Rs. 142 Cr" },
    { revenue: [600, 705, 810, 885, 950], profit: [88, 102, 118, 132, 142], eps: [34.5, 40.2, 46.5, 51.2, 55.4], roe: [13.2, 14.8, 16.2, 17.4, 18.2], debt: [590, 565, 545, 530, 520], dividend: [16, 20, 24, 28, 32] },
    { pb: 2.0, debtEquity: 0.52, currentRatio: 1.72, beta: 1.2, peg: 1.1 },
    { promoter: "56.4%", fii: "11.5%", dii: "24.8%", public: "5.3%", longTerm: "50%" },
    { q1: 33.5, q1Change: 5, q2: 36.2, q2Change: 8, q3: 38.5, q3Change: 6, q4: 40.1, q4Change: 4 },
    "🟢 Good fundamentals",
  ),
  buildStock(
    "GBBL", "Global IME Bank Ltd", "Banking", 540.00, 2.8, "2.1M",
    { pe: 11.8, eps: 45.8, shares: "5.20 Cr", roe: 15.2, debt: "Rs. 920 Cr", revenue: "Rs. 1,420 Cr", profit: "Rs. 188 Cr" },
    { revenue: [820, 980, 1150, 1290, 1420], profit: [110, 132, 154, 172, 188], eps: [26.8, 32.2, 37.5, 42.0, 45.8], roe: [10.8, 12.5, 13.8, 14.6, 15.2], debt: [1020, 985, 955, 935, 920], dividend: [8, 10, 13, 16, 20] },
    { pb: 1.3, debtEquity: 0.78, currentRatio: 1.45, beta: 1.5, peg: 0.8 },
    { promoter: "49.5%", fii: "5.8%", dii: "36.5%", public: "6.2%", longTerm: "34%" },
    { q1: 44.5, q1Change: 9, q2: 47.2, q2Change: 6, q3: 49.8, q3Change: 6, q4: 51.2, q4Change: 3 },
    "🟡 High volume",
  ),
  buildStock(
    "NHPC", "Nepal Hydro Power Co.", "Energy", 985.00, 4.2, "3.2M",
    { pe: 8.9, eps: 110.4, shares: "2.85 Cr", roe: 28.4, debt: "Rs. 320 Cr", revenue: "Rs. 2,340 Cr", profit: "Rs. 456 Cr" },
    { revenue: [1120, 1380, 1650, 1980, 2340], profit: [195, 248, 310, 380, 456], eps: [46.8, 59.6, 74.8, 91.2, 110.4], roe: [17.6, 20.2, 22.8, 25.6, 28.4], debt: [450, 410, 380, 350, 320], dividend: [35, 42, 50, 60, 72] },
    { pb: 2.1, debtEquity: 0.28, currentRatio: 2.4, beta: 1.1, peg: 0.5 },
    { promoter: "51.0%", fii: "18.5%", dii: "22.4%", public: "5.1%", longTerm: "58%" },
    { q1: 108.5, q1Change: 12, q2: 115.2, q2Change: 6, q3: 124.8, q3Change: 8, q4: 132.5, q4Change: 6 },
    "🟢 Excellent",
  ),
  buildStock(
    "HDHPC", "Himalayan Hydro Power", "Energy", 425.00, 1.2, "1.8M",
    { pe: 15.2, eps: 28.0, shares: "3.60 Cr", roe: 16.8, debt: "Rs. 520 Cr", revenue: "Rs. 620 Cr", profit: "Rs. 101 Cr" },
    { revenue: [380, 450, 510, 570, 620], profit: [58, 72, 84, 94, 101], eps: [16.2, 20.0, 23.4, 26.0, 28.0], roe: [12.5, 14.2, 15.5, 16.2, 16.8], debt: [600, 575, 550, 535, 520], dividend: [8, 10, 12, 14, 16] },
    { pb: 1.8, debtEquity: 0.68, currentRatio: 1.65, beta: 1.3, peg: 1.1 },
    { promoter: "55.2%", fii: "10.5%", dii: "25.8%", public: "6.5%", longTerm: "44%" },
    { q1: 24.2, q1Change: 7, q2: 25.8, q2Change: 7, q3: 27.0, q3Change: 5, q4: 28.2, q4Change: 4 },
    "🟢 Growth",
  ),
  buildStock(
    "RIDI", "Ridi Power Co.", "Energy", 315.00, -0.8, "950K",
    { pe: 13.5, eps: 23.3, shares: "2.80 Cr", roe: 14.5, debt: "Rs. 410 Cr", revenue: "Rs. 380 Cr", profit: "Rs. 65 Cr" },
    { revenue: [240, 280, 315, 350, 380], profit: [38, 46, 53, 60, 65], eps: [13.6, 16.4, 18.8, 21.2, 23.3], roe: [10.2, 11.5, 12.8, 13.8, 14.5], debt: [460, 445, 430, 420, 410], dividend: [5, 6, 7, 8, 10] },
    { pb: 1.5, debtEquity: 0.82, currentRatio: 1.45, beta: 1.4, peg: 0.9 },
    { promoter: "58.5%", fii: "7.2%", dii: "24.5%", public: "7.8%", longTerm: "36%" },
    { q1: 15.5, q1Change: 5, q2: 16.2, q2Change: 5, q3: 17.0, q3Change: 5, q4: 17.8, q4Change: 5 },
    "🟡 Moderate",
  ),
  buildStock(
    "CHCL", "Chilime Hydro Power Co.", "Energy", 1185.00, 2.1, "780K",
    { pe: 10.5, eps: 112.8, shares: "1.20 Cr", roe: 26.5, debt: "Rs. 180 Cr", revenue: "Rs. 980 Cr", profit: "Rs. 215 Cr" },
    { revenue: [520, 650, 780, 890, 980], profit: [105, 138, 168, 194, 215], eps: [55.2, 72.5, 88.4, 102.0, 112.8], roe: [16.8, 20.5, 23.2, 25.0, 26.5], debt: [260, 230, 210, 195, 180], dividend: [40, 52, 64, 76, 88] },
    { pb: 2.2, debtEquity: 0.22, currentRatio: 2.6, beta: 0.9, peg: 0.6 },
    { promoter: "60.5%", fii: "17.5%", dii: "16.8%", public: "3.2%", longTerm: "68%" },
    { q1: 52.5, q1Change: 9, q2: 56.2, q2Change: 7, q3: 60.5, q3Change: 8, q4: 64.2, q4Change: 6 },
    "🟢 Strong",
  ),
  buildStock(
    "AKJCL", "AKJCL Finance Ltd", "Finance", 285.00, -1.5, "420K",
    { pe: 16.8, eps: 17.0, shares: "1.85 Cr", roe: 13.2, debt: "Rs. 280 Cr", revenue: "Rs. 145 Cr", profit: "Rs. 31 Cr" },
    { revenue: [92, 105, 118, 132, 145], profit: [18, 21, 25, 28, 31], eps: [9.8, 11.4, 13.5, 15.2, 17.0], roe: [9.5, 10.5, 11.8, 12.6, 13.2], debt: [320, 305, 295, 288, 280], dividend: [3, 4, 5, 6, 7] },
    { pb: 1.6, debtEquity: 0.95, currentRatio: 1.35, beta: 1.4, peg: 1.2 },
    { promoter: "52.0%", fii: "5.5%", dii: "28.5%", public: "10.0%", longTerm: "30%" },
    { q1: 7.2, q1Change: 4, q2: 7.5, q2Change: 4, q3: 7.8, q3Change: 4, q4: 8.1, q4Change: 4 },
    "🟡 Small cap",
  ),
  buildStock(
    "RFPL", "Rural Finance Ltd", "Finance", 245.00, 0.6, "310K",
    { pe: 14.2, eps: 17.2, shares: "1.45 Cr", roe: 12.8, debt: "Rs. 220 Cr", revenue: "Rs. 118 Cr", profit: "Rs. 25 Cr" },
    { revenue: [72, 85, 96, 108, 118], profit: [14, 17, 20, 23, 25], eps: [9.6, 11.7, 13.8, 15.6, 17.2], roe: [8.8, 10.2, 11.4, 12.2, 12.8], debt: [255, 245, 238, 228, 220], dividend: [2, 3, 4, 5, 6] },
    { pb: 1.5, debtEquity: 0.88, currentRatio: 1.4, beta: 1.3, peg: 1.0 },
    { promoter: "55.5%", fii: "4.2%", dii: "26.8%", public: "9.5%", longTerm: "32%" },
    { q1: 6.0, q1Change: 5, q2: 6.2, q2Change: 3, q3: 6.4, q3Change: 3, q4: 6.6, q4Change: 3 },
    "🟡 Stable",
  ),
  buildStock(
    "PHCL", "Pharma Health Ltd", "Healthcare", 680.00, 5.4, "650K",
    { pe: 22.5, eps: 30.2, shares: "0.95 Cr", roe: 18.5, debt: "Rs. 85 Cr", revenue: "Rs. 245 Cr", profit: "Rs. 48 Cr" },
    { revenue: [145, 170, 195, 220, 245], profit: [25, 30, 36, 42, 48], eps: [15.8, 19.0, 22.5, 26.4, 30.2], roe: [12.5, 14.2, 16.0, 17.4, 18.5], debt: [110, 100, 95, 90, 85], dividend: [6, 8, 10, 12, 15] },
    { pb: 3.2, debtEquity: 0.32, currentRatio: 2.2, beta: 1.2, peg: 1.5 },
    { promoter: "64.2%", fii: "12.5%", dii: "15.8%", public: "4.5%", longTerm: "56%" },
    { q1: 11.2, q1Change: 11, q2: 12.5, q2Change: 12, q3: 13.2, q3Change: 6, q4: 14.0, q4Change: 6 },
    "🟢 High growth",
  ),
  buildStock(
    "SHEL", "Shell Nepal Ltd", "Oil & Gas", 1420.00, -3.2, "280K",
    { pe: 18.5, eps: 76.8, shares: "0.62 Cr", roe: 15.2, debt: "Rs. 120 Cr", revenue: "Rs. 890 Cr", profit: "Rs. 98 Cr" },
    { revenue: [620, 710, 790, 850, 890], profit: [72, 80, 88, 95, 98], eps: [56.5, 62.8, 69.2, 73.5, 76.8], roe: [13.5, 14.2, 14.8, 15.0, 15.2], debt: [150, 140, 132, 125, 120], dividend: [25, 28, 30, 32, 35] },
    { pb: 2.4, debtEquity: 0.28, currentRatio: 1.9, beta: 0.8, peg: 2.3 },
    { promoter: "68.5%", fii: "14.2%", dii: "12.5%", public: "2.8%", longTerm: "64%" },
    { q1: 24.2, q1Change: -4, q2: 23.8, q2Change: -2, q3: 23.5, q3Change: -1, q4: 24.0, q4Change: 2 },
    "🔴 Declining",
  ),
];
