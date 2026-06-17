// Get full MeroLagani market summary
async function test() {
  const res = await fetch('https://merolagani.com/handlers/webrequesthandler.ashx?type=market_summary', {
    signal: AbortSignal.timeout(10000),
    headers: { 
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://merolagani.com/MarketSummary.aspx'
    }
  });
  const data = await res.json();
  
  console.log('=== Full Response Keys ===');
  console.log(Object.keys(data));
  
  console.log('\n=== Overall ===');
  console.log(JSON.stringify(data.overall, null, 2));
  
  console.log('\n=== Turnover (first 3) ===');
  console.log(JSON.stringify(data.turnover?.detail?.slice(0, 3), null, 2));
  
  console.log('\n=== Sector (first 3) ===');
  console.log(JSON.stringify(data.sector?.detail?.slice(0, 3), null, 2));
  
  console.log('\n=== Broker (first 3) ===');
  console.log(JSON.stringify(data.broker?.detail?.slice(0, 3), null, 2));
  
  console.log('\n=== Stock (first 3) ===');
  console.log(JSON.stringify(data.stock?.detail?.slice(0, 3), null, 2));
  
  // Check for indices data
  console.log('\n=== Index data ===');
  console.log('index:', data.index ? JSON.stringify(data.index).substring(0, 500) : 'NOT FOUND');
  console.log('indices:', data.indices ? JSON.stringify(data.indices).substring(0, 500) : 'NOT FOUND');
  console.log('subIndices:', data.subIndices ? JSON.stringify(data.subIndices).substring(0, 500) : 'NOT FOUND');
  console.log('sub_indices:', data.sub_indices ? JSON.stringify(data.sub_indices).substring(0, 500) : 'NOT FOUND');
  
  // Check for gainers/losers
  console.log('\n=== Gainers ===');
  console.log('gainers:', data.gainers ? JSON.stringify(data.gainers).substring(0, 500) : 'NOT FOUND');
  console.log('losers:', data.losers ? JSON.stringify(data.losers).substring(0, 500) : 'NOT FOUND');
  
  // Check all top-level keys and their types
  console.log('\n=== All keys and types ===');
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      console.log(`${key}: array[${value.length}]`);
    } else if (typeof value === 'object') {
      console.log(`${key}: object with keys [${Object.keys(value).join(', ')}]`);
    } else {
      console.log(`${key}: ${typeof value} = ${value}`);
    }
  }
}

test();
