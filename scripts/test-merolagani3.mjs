// Test MeroLagani API endpoints
async function test() {
  // 1. Test market_summary endpoint
  try {
    const res = await fetch('https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary', {
      signal: AbortSignal.timeout(10000),
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://merolagani.com/MarketSummary.aspx'
      }
    });
    const type = res.headers.get('content-type');
    const text = await res.text();
    console.log('=== market_summary ===');
    console.log('Status:', res.status, 'Type:', type);
    console.log('Body (first 2000):', text.substring(0, 2000));
  } catch (e) {
    console.error('market_summary error:', e.message);
  }

  // 2. Test today_event endpoint
  try {
    const res = await fetch('https://merolagani.com/handlers/webrequesthandler.ashx?type=today_event', {
      signal: AbortSignal.timeout(10000),
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://merolagani.com/'
      }
    });
    const type = res.headers.get('content-type');
    const text = await res.text();
    console.log('\n=== today_event ===');
    console.log('Status:', res.status, 'Type:', type);
    console.log('Body (first 1000):', text.substring(0, 1000));
  } catch (e) {
    console.error('today_event error:', e.message);
  }

  // 3. Scrape latestmarket.aspx for table data
  try {
    const res = await fetch('https://merolagani.com/latestmarket.aspx', {
      signal: AbortSignal.timeout(10000),
      headers: { 
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    
    // Find the live trading table
    const tableMatch = html.match(/<table[^>]*id="[^"]*"[^>]*>([\s\S]*?)<\/table>/gi);
    console.log('\n=== Tables found ===');
    console.log('Count:', tableMatch?.length);
    
    // Find rows with stock data
    const stockRows = html.match(/<tr[^>]*>[\s\S]*?<td[^>]*>[A-Z]+<\/td>[\s\S]*?<\/tr>/gi);
    console.log('Stock rows:', stockRows?.length);
    if (stockRows?.length > 0) {
      console.log('Sample row:', stockRows[0].substring(0, 300));
    }
    
    // Look for NEPSE Index data
    const nepseIndex = html.match(/NEPSE[\s\S]*?(\d[\d,.]+)/i);
    console.log('\n=== NEPSE Index ===');
    console.log(nepseIndex?.[0]?.substring(0, 200));
    
  } catch (e) {
    console.error('latestmarket error:', e.message);
  }

  // 4. Scrape MarketSummary.aspx
  try {
    const res = await fetch('https://merolagani.com/MarketSummary.aspx', {
      signal: AbortSignal.timeout(10000),
      headers: { 
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    
    // Find indices data
    const indexData = html.match(/<div[^>]*class="[^"]*index[^"]*"[^>]*>[\s\S]*?<\/div>/gi);
    console.log('\n=== MarketSummary Index divs ===');
    console.log('Count:', indexData?.length);
    if (indexData) console.log('Sample:', indexData[0]?.substring(0, 300));
    
    // Find table data
    const tables = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
    console.log('\n=== Tables in MarketSummary ===');
    console.log('Count:', tables?.length);
    
  } catch (e) {
    console.error('MarketSummary error:', e.message);
  }
}

test();
