// Get full stock count and find indices from MarketSummary
async function test() {
  // 1. Get full market summary to count stocks
  const res = await fetch('https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary', {
    signal: AbortSignal.timeout(10000),
    headers: { 
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://merolagani.com/MarketSummary.aspx'
    }
  });
  const data = await res.json();
  
  console.log('=== Stock count ===');
  console.log('Total stocks:', data.stock?.detail?.length);
  
  // Check stock data shape
  console.log('\n=== Sample stocks ===');
  console.log(JSON.stringify(data.stock?.detail?.slice(0, 5), null, 2));
  
  // Find top gainers and losers from stock data
  const stocks = data.stock?.detail || [];
  const withChange = stocks.map(s => ({
    symbol: s.s,
    ltp: s.lp,
    change: s.c,
    pc: s.c && s.lp ? (s.c / (s.lp - s.c) * 100) : 0,
    qty: s.q
  }));
  
  const gainers = withChange.filter(s => s.change > 0).sort((a, b) => b.pc - a.pc).slice(0, 5);
  const losers = withChange.filter(s => s.change < 0).sort((a, b) => a.pc - b.pc).slice(0, 5);
  
  console.log('\n=== Top Gainers (calculated) ===');
  console.log(JSON.stringify(gainers, null, 2));
  
  console.log('\n=== Top Losers (calculated) ===');
  console.log(JSON.stringify(losers, null, 2));
  
  // 2. Scrape MarketSummary.aspx for NEPSE Index
  try {
    const res2 = await fetch('https://merolagani.com/MarketSummary.aspx', {
      signal: AbortSignal.timeout(10000),
      headers: { 
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res2.text();
    
    // Look for NEPSE Index value patterns
    const nepseMatch = html.match(/NEPSE[\s\S]*?(\d[\d,.]+)[\s\S]*?([\-\+]?\d+\.?\d*)[\s\S]*?([\-\+]?\d+\.?\d*)/i);
    console.log('\n=== NEPSE Index from HTML ===');
    console.log(nepseMatch?.slice(0, 5));
    
    // Look for index-related patterns
    const indexPatterns = html.match(/(NEPSE|Banking|Development|Finance|Hydro|Insurance|Manufacturing|Microfinance)[\s\S]*?(\d[\d,.]+)/gi);
    console.log('\n=== Index patterns ===');
    console.log(indexPatterns?.slice(0, 15));
    
    // Look for data in script tags
    const scriptData = html.match(/var\s+\w+\s*=\s*(\[[\s\S]*?\]|\{[\s\S]*?\});/g);
    console.log('\n=== Script data ===');
    console.log(scriptData?.slice(0, 5));
    
  } catch (e) {
    console.error('MarketSummary error:', e.message);
  }
}

test();
