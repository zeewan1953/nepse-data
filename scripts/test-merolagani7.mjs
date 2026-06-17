// Check MeroLagani indices page
async function test() {
  // 1. Check indices page
  try {
    const res = await fetch('https://merolagani.com/Indices.aspx', {
      signal: AbortSignal.timeout(10000),
      headers: { 
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await res.text();
    
    // Find table with index data
    const tables = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
    console.log('=== Tables in Indices page ===');
    console.log('Count:', tables?.length);
    
    // Find index data in tables
    const indexRows = html.match(/<tr[^>]*>[\s\S]*?(?:NEPSE|Banking|Development|Finance|Hydro|Insurance|Manufacturing|Microfinance)[\s\S]*?<\/tr>/gi);
    console.log('\n=== Index rows ===');
    console.log(indexRows?.slice(0, 5)?.map(r => r.substring(0, 300)));
    
    // Look for specific patterns
    const indexValues = html.match(/<td[^>]*>[\s\S]*?(?:NEPSE|Banking|Development Bank|Finance|Hotels|Hydro|Life Insurance|Manufacturing|Microfinance|Mutual Fund|Non-Life|Trading|Others)[\s\S]*?<\/td>[\s\S]*?<td[^>]*>[\s\S]*?[\d,.]+[\s\S]*?<\/td>/gi);
    console.log('\n=== Index values ===');
    console.log(indexValues?.slice(0, 15));
    
    // Look for any number patterns near index names
    const allIndexData = html.match(/(NEPSE|Banking|Development Bank|Finance|Hotels And Tourism|Hydro Power|Life Insurance|Manufacturing|Microfinance|Mutual Fund|Non-Life Insurance|Trading|Others)[\s\S]{0,100}?(\d{1,3}(?:,\d{3})*\.\d{1,2})/gi);
    console.log('\n=== All index data ===');
    console.log(allIndexData?.slice(0, 20));
    
  } catch (e) {
    console.error('Indices page error:', e.message);
  }
}

test();
