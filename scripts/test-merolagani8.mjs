// Scrape MarketSummary.aspx for index data - detailed
async function test() {
  const res = await fetch('https://merolagani.com/MarketSummary.aspx', {
    signal: AbortSignal.timeout(10000),
    headers: { 
      'Accept': 'text/html',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await res.text();
  
  // Save full HTML for inspection
  const fs = await import('fs');
  fs.writeFileSync('c:\\nepali bajar 2\\scripts\\market-summary.html', html);
  console.log('Saved MarketSummary.aspx HTML');
  
  // Find all table rows
  const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
  console.log('\n=== Total table rows ===');
  console.log('Count:', trs?.length);
  
  // Find rows with numbers that look like index values
  const indexLikeRows = trs?.filter(tr => {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!tds || tds.length < 2) return false;
    // Check if first td has an index name
    const firstTd = tds[0].replace(/<[^>]+>/g, '').trim();
    return firstTd && (
      firstTd.includes('NEPSE') || 
      firstTd.includes('Banking') || 
      firstTd.includes('Development') ||
      firstTd.includes('Finance') ||
      firstTd.includes('Hydro') ||
      firstTd.includes('Insurance') ||
      firstTd.includes('Manufacturing') ||
      firstTd.includes('Microfinance') ||
      firstTd.includes('Mutual') ||
      firstTd.includes('Trading') ||
      firstTd.includes('Others') ||
      firstTd.includes('Hotels') ||
      firstTd.includes('Sensitive') ||
      firstTd.includes('Float')
    );
  });
  
  console.log('\n=== Index-like rows ===');
  console.log('Count:', indexLikeRows?.length);
  if (indexLikeRows) {
    for (const row of indexLikeRows.slice(0, 15)) {
      const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      const values = tds?.map(td => td.replace(/<[^>]+>/g, '').trim());
      console.log(values?.join(' | '));
    }
  }
  
  // Also look for div-based index cards
  const indexCards = html.match(/<div[^>]*class="[^"]*(?:index|card|metric|stat)[^"]*"[^>]*>[\s\S]*?<\/div>/gi);
  console.log('\n=== Index cards ===');
  console.log('Count:', indexCards?.length);
  
  // Look for specific patterns with NEPSE value
  const nepsePattern = html.match(/2[,.]?\d{3}\.\d{2}/g);
  console.log('\n=== NEPSE-like values (2,xxx.xx) ===');
  console.log(nepsePattern?.slice(0, 10));
}

test();
