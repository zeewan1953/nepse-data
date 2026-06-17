// Scrape MarketSummary.aspx for index data
async function test() {
  const res = await fetch('https://merolagani.com/MarketSummary.aspx', {
    signal: AbortSignal.timeout(10000),
    headers: { 
      'Accept': 'text/html',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await res.text();
  
  // Find all div/table sections with index data
  // Look for NEPSE index value pattern
  const sections = html.match(/<div[^>]*class="[^"]*"[^>]*>[\s\S]*?<\/div>/gi);
  
  // Find index-related content
  const indexSection = html.match(/Indices[\s\S]*?(?=<div[^>]*class="[^"]*section[^"]*"|$)/i);
  console.log('=== Index section ===');
  console.log(indexSection?.[0]?.substring(0, 2000));
  
  // Look for specific index patterns
  const nepseValue = html.match(/NEPSE\s*<\/[\s\S]*?(\d[\d,.]+)\s*<[\s\S]*?([\-\+]?\d+\.?\d*)\s*<[\s\S]*?([\-\+]?\d+\.?\d*)/i);
  console.log('\n=== NEPSE Value ===');
  console.log(nepseValue?.slice(0, 5));
  
  // Find all number patterns near index names
  const patterns = html.match(/(NEPSE|Banking|Development Bank|Finance|Hotels|Hydro|Life Insurance|Manufacturing|Microfinance|Mutual Fund|Non-Life|Trading|Others)[\s\S]{0,200}?(\d[\d,.]+)/gi);
  console.log('\n=== Index patterns with values ===');
  console.log(patterns?.slice(0, 20));
  
  // Look for table rows with index data
  const tableRows = html.match(/<tr[^>]*>[\s\S]*?(?:NEPSE|Banking|Development)[\s\S]*?<\/tr>/gi);
  console.log('\n=== Table rows with indices ===');
  console.log(tableRows?.slice(0, 5)?.map(r => r.substring(0, 200)));
  
  // Look for specific index data pattern
  const indexData = html.match(/<td[^>]*>(?:NEPSE|Banking|Development Bank|Finance|Hotels|Hydro|Life Insurance|Manufacturing|Microfinance|Mutual Fund|Non-Life|Trading|Others)[^<]*<\/td>[\s\S]*?<td[^>]*>[\d,.]+<\/td>/gi);
  console.log('\n=== Index data cells ===');
  console.log(indexData?.slice(0, 15));
}

test();
