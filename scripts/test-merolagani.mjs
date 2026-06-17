// Test MeroLagani API endpoints
async function test() {
  // 1. Try MeroLagani latestmarket page for API patterns
  try {
    const res = await fetch('https://merolagani.com/latestmarket.aspx', {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'text/html' }
    });
    const html = await res.text();
    
    // Find script tags and API URLs
    const scripts = html.match(/src="([^"]*\.js[^"]*)"/g);
    const apiUrls = html.match(/["'](\/api\/[^"']+|\/Services\/[^"']+|\.asmx[^"']*|WebService[^"']*)/gi);
    const ajaxCalls = html.match(/\$\.ajax\([^)]+\)|fetch\([^)]+\)/gi);
    
    console.log('=== Script tags ===');
    console.log(scripts?.slice(0, 10));
    console.log('\n=== API URLs ===');
    console.log(apiUrls?.slice(0, 10));
    console.log('\n=== AJAX calls ===');
    console.log(ajaxCalls?.slice(0, 10));
    
    // Look for data loading patterns
    const dataPatterns = html.match(/(url|href|src)\s*[:=]\s*["']([^"']+)["']/gi);
    console.log('\n=== Data patterns (first 20) ===');
    console.log(dataPatterns?.slice(0, 20));
    
  } catch (e) {
    console.error('Error fetching merolagani:', e.message);
  }

  // 2. Try common MeroLagani API endpoints
  const endpoints = [
    'https://merolagani.com/api/live',
    'https://merolagani.com/api/market',
    'https://merolagani.com/api/indices',
    'https://merolagani.com/WebService1.asmx',
    'https://merolagani.com/api/MarketSummary',
    'https://merolagani.com/handler.ashx',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { 'Accept': 'application/json' },
        redirect: 'manual'
      });
      const type = res.headers.get('content-type');
      console.log(`${url} -> ${res.status} (${type})`);
    } catch (e) {
      console.log(`${url} -> ERROR: ${e.message}`);
    }
  }
}

test();
