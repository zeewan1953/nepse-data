async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  console.log("=== NepaliPaisa Deep Check ===");
  const c = new AbortController(); setTimeout(() => c.abort(), 10000);
  const res = await fetch("https://nepalipaisa.com", { headers: { "User-Agent": UA }, signal: c.signal });
  const html = await res.text();
  
  // Find all <script> tags content
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const content = m[1].trim();
    if (content.length > 10 && (content.includes("fetch") || content.includes("ajax") || content.includes("axios") || content.includes("api") || content.includes("news") || content.includes("XMLHttp"))) {
      console.log("--- Script snippet ---");
      console.log(content.slice(0, 500));
      console.log();
    }
  }
  
  // Also check for data attributes or JSON in the page
  const dataRe = /data-[a-z-]+="([^"]{20,})"/gi;
  const dataAttrs = [];
  while ((m = dataRe.exec(html)) !== null) dataAttrs.push(m[1]);
  console.log("Data attributes:", dataAttrs.length);
  dataAttrs.slice(0, 5).forEach((d, i) => console.log(" ", i, d.slice(0, 100)));

  // Try their API with different patterns
  console.log("\n=== NP API Discovery ===");
  const apis = [
    "https://adminapi.nepalipaisa.com/api/News",
    "https://adminapi.nepalipaisa.com/api/News/GetAllNews",
    "https://adminapi.nepalipaisa.com/api/News/GetNewsList",
    "https://adminapi.nepalipaisa.com/news",
    "https://adminapi.nepalipaisa.com/api/newsfeed",
    "https://nepalipaisa.com/api/newsfeed",
    "https://nepalipaisa.com/newsfeed",
  ];
  for (const api of apis) {
    try {
      const c2 = new AbortController(); setTimeout(() => c2.abort(), 4000);
      const r = await fetch(api, { headers: { "User-Agent": UA }, signal: c2.signal });
      if (r.status !== 404) {
        const txt = await r.text();
        console.log(api, "=>", r.status, txt.slice(0, 150));
      }
    } catch (e) {}
  }

  // Check /news page for actual rendered content or API hints
  console.log("\n=== NP /news page ===");
  const c3 = new AbortController(); setTimeout(() => c3.abort(), 8000);
  const res2 = await fetch("https://nepalipaisa.com/news", { headers: { "User-Agent": UA }, signal: c3.signal });
  const html2 = await res2.text();
  const scriptRe2 = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = scriptRe2.exec(html2)) !== null) {
    const content = m[1].trim();
    if (content.includes("news") && content.length > 30) {
      console.log("--- News script ---");
      console.log(content.slice(0, 500));
      console.log();
    }
  }
  // Check for hidden divs with data
  const hiddenRe = /id="([^"]*)"[^>]*>([\s\S]{20,}?)<\/div>/gi;
  while ((m = hiddenRe.exec(html2)) !== null) {
    if (m[1].includes("news") || m[1].includes("content") || m[1].includes("data")) {
      console.log("Div id:", m[1], "content:", m[2].replace(/<[^>]+>/g, "").trim().slice(0, 200));
    }
  }
}
test();
