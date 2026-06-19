async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  // Try NepaliPaisa RSS
  console.log("=== NepaliPaisa RSS ===");
  for (const url of ["https://nepalipaisa.com/rss", "https://nepalipaisa.com/feed", "https://nepalipaisa.com/rss.xml"]) {
    try {
      const c = new AbortController(); setTimeout(() => c.abort(), 5000);
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: c.signal });
      if (r.ok) { const t = await r.text(); console.log(url, "=>", r.status, t.slice(0, 200)); }
      else console.log(url, "=>", r.status);
    } catch (e) { console.log(url, "=> ERR"); }
  }

  // Try finding JS AJAX endpoint
  console.log("\n=== NP JS Files ===");
  const c2 = new AbortController(); setTimeout(() => c2.abort(), 8000);
  const res = await fetch("https://nepalipaisa.com/news", { headers: { "User-Agent": UA }, signal: c2.signal });
  const html = await res.text();
  const jsRe = /<script[^>]*src="([^"]*(?:custom|main|app|script|news)[^"]*\.js[^"]*)"/gi;
  let m;
  const jsFiles = [];
  while ((m = jsRe.exec(html)) !== null) jsFiles.push(m[1]);
  console.log("JS files:", jsFiles);
  
  // Check each JS file for API endpoints
  for (const js of jsFiles.slice(0, 3)) {
    try {
      const jsUrl = js.startsWith("http") ? js : `https://nepalipaisa.com${js}`;
      const c3 = new AbortController(); setTimeout(() => c3.abort(), 5000);
      const r = await fetch(jsUrl, { headers: { "User-Agent": UA }, signal: c3.signal });
      if (r.ok) {
        const txt = await r.text();
        // Find API URLs
        const apiRe = /(?:url|api|endpoint|fetch|ajax)\s*[:=]\s*["']([^"']*(?:news|article|list)[^"']*)/gi;
        let m2;
        while ((m2 = apiRe.exec(txt)) !== null) console.log("  API in", js, ":", m2[1]);
        // Also find adminapi references
        const adminRe = /adminapi[^"'\s]*/gi;
        while ((m2 = adminRe.exec(txt)) !== null) console.log("  AdminAPI ref:", m2[0]);
        // Find $.ajax or $.get or $.post patterns
        const ajaxRe = /\$\.(?:ajax|get|post)\s*\(\s*["']([^"']+)/gi;
        while ((m2 = ajaxRe.exec(txt)) !== null) console.log("  jQuery ajax:", m2[1]);
        // Find URL patterns with /api/
        const urlRe = /["'](\/api\/[^"']+|https?:\/\/[^"']*api[^"']*)/gi;
        while ((m2 = urlRe.exec(txt)) !== null) console.log("  URL pattern:", m2[1]);
      }
    } catch (e) {}
  }
  
  // Check inline scripts on news page for AJAX calls
  console.log("\n=== NP Inline AJAX ===");
  const inlineRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = inlineRe.exec(html)) !== null) {
    const content = m[1];
    if (content.includes("ajax") || content.includes("$.get") || content.includes("$.post") || content.includes("fetch(")) {
      // Extract URL patterns
      const urlRe = /["']([^"']*(?:news|article|list|api)[^"']*)/gi;
      let m2;
      while ((m2 = urlRe.exec(content)) !== null) {
        if (m2[1].length > 5 && m2[1].length < 200) console.log("  Inline URL:", m2[1]);
      }
      console.log("  Script:", content.slice(0, 400));
      console.log();
    }
  }
}
test();
