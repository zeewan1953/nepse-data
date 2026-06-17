// Test MeroLagani handler endpoints
async function test() {
  // Try handler endpoints
  const endpoints = [
    'https://merolagani.com/handlers/watchlisthandler.ashx',
    'https://merolagani.com/handlers/webrequesthandler.ashx?type=Current_User_Info',
    'https://merolagani.com/handlers/marketdatahandler.ashx',
    'https://merolagani.com/handlers/livepricehandler.ashx',
    'https://merolagani.com/handlers/stockpricehandler.ashx',
    'https://merolagani.com/handlers/indexhandler.ashx',
    'https://merolagani.com/handlers/nepsehandler.ashx',
    'https://merolagani.com/handlers/tradinghandler.ashx',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { 'Accept': 'application/json' },
        redirect: 'manual'
      });
      const type = res.headers.get('content-type');
      let body = '';
      if (type?.includes('json')) {
        body = await res.text();
        body = body.substring(0, 200);
      }
      console.log(`${url} -> ${res.status} (${type}) ${body}`);
    } catch (e) {
      console.log(`${url} -> ERROR: ${e.message}`);
    }
  }

  // Also check the jquicker script for data loading patterns
  try {
    const res = await fetch('https://merolagani.com/Scripts/jquicker-1.5.js', {
      signal: AbortSignal.timeout(5000),
    });
    const js = await res.text();
    // Find API URLs in the script
    const urls = js.match(/["'](\/[^"']*(?:handler|api|data|market|live|stock|index)[^"']*)/gi);
    console.log('\n=== URLs in jquicker.js ===');
    console.log(urls?.slice(0, 20));
    
    // Find ajax calls
    const ajax = js.match(/url\s*:\s*["'][^"']+["']/g);
    console.log('\n=== Ajax URLs in jquicker.js ===');
    console.log(ajax?.slice(0, 20));
  } catch (e) {
    console.error('Error fetching jquicker:', e.message);
  }
}

test();
