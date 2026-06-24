import { NextResponse } from "next/server";
import { fetchMeroLaganiSummary } from "@/lib/merolagani";
import { saveMeroLaganiBrokerDaily, hasMeroBrokerData } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save MeroLagani broker data to DB
 * 
 * This API saves REAL broker purchase/sell data from MeroLagani.
 * 
 * Auto-save logic:
 * - Saves data for TODAY if market is closed (after 3:30 PM NPT)
 * - Can be triggered manually with ?date=YYYY-MM-DD
 * - Can be triggered with ?force=true to overwrite existing data
 * 
 * Schedule: Call this API at 3:30 PM NPT daily via cron or frontend auto-refresh
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const force = searchParams.get("force") === "true";
    
    // Get Nepal date (UTC+5:45)
    const now = new Date();
    const nepalDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
    const targetDate = dateParam || nepalDate;
    
    // Check if it's after market close (3:30 PM NPT = 9:45 AM UTC)
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcTime = utcHours * 60 + utcMinutes;
    const marketCloseTime = 9 * 60 + 45; // 3:30 PM NPT = 9:45 AM UTC
    const isAfterClose = utcTime >= marketCloseTime;
    
    console.log(`[save-broker-data] Target date: ${targetDate}, After close: ${isAfterClose}, Force: ${force}`);
    
    // Check if data already exists for this date
    if (!force && await hasMeroBrokerData(targetDate)) {
      return NextResponse.json({
        success: true,
        message: `Data already exists for ${targetDate}`,
        date: targetDate,
        alreadySaved: true,
        savedAt: new Date().toISOString()
      });
    }
    
    // Fetch REAL broker data from MeroLagani
    console.log("[save-broker-data] Fetching MeroLagani broker data...");
    const mero = await fetchMeroLaganiSummary();
    
    if (!mero) {
      return NextResponse.json({
        success: false,
        error: "MeroLagani API unavailable",
        date: targetDate
      }, { status: 503 });
    }
    
    // Extract broker data (REAL purchase/sell amounts)
    const brokers = mero.broker?.detail || [];
    
    if (brokers.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No broker data in MeroLagani response",
        date: targetDate,
        marketStatus: mero.mt
      }, { status: 503 });
    }
    
    // Transform to DB format
    const brokerData = brokers
      .filter(b => b.b && b.b.length > 0)
      .map(b => ({
        tradeDate: targetDate,
        brokerCode: b.b,
        brokerName: b.n || "",
        purchaseAmt: Number(b.p || 0),
        sellAmt: Number(b.s || 0),
        netAmt: Number(b.m || 0),
        totalAmt: Number(b.t || 0)
      }));
    
    if (brokerData.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No valid broker data to save",
        date: targetDate
      }, { status: 400 });
    }
    
    // Save to DB
    const saved = await saveMeroLaganiBrokerDaily(targetDate, brokerData);
    
    console.log(`[save-broker-data] Saved ${saved} brokers for ${targetDate}`);
    
    // Calculate summary stats
    const totalPurchase = brokerData.reduce((sum, b) => sum + b.purchaseAmt, 0);
    const totalSell = brokerData.reduce((sum, b) => sum + b.sellAmt, 0);
    const totalNet = brokerData.reduce((sum, b) => sum + b.netAmt, 0);
    
    // Top buyers and sellers
    const topBuyers = [...brokerData].sort((a, b) => b.purchaseAmt - a.purchaseAmt).slice(0, 5);
    const topSellers = [...brokerData].sort((a, b) => b.sellAmt - a.sellAmt).slice(0, 5);
    
    return NextResponse.json({
      success: true,
      date: targetDate,
      savedBrokers: saved,
      marketDate: mero.overall?.d || targetDate,
      marketStatus: mero.mt,
      savedAt: new Date().toISOString(),
      summary: {
        totalBrokers: saved,
        totalPurchase,
        totalSell,
        totalNet,
        topBuyers: topBuyers.map(b => ({ code: b.brokerCode, name: b.brokerName, purchase: b.purchaseAmt })),
        topSellers: topSellers.map(b => ({ code: b.brokerCode, name: b.brokerName, sell: b.sellAmt }))
      },
      message: `Successfully saved REAL broker data for ${targetDate}`
    });
    
  } catch (err) {
    console.error("[save-broker-data] Error:", err);
    return NextResponse.json({
      success: false,
      error: "Failed to save broker data",
      details: String(err)
    }, { status: 500 });
  }
}
