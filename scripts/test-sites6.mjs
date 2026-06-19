async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  // NepaliPaisa news page
  console.log("=== NepaliPaisa /news ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://nepalipaisa.com/news", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    console.log("Status:", res.status, "len:", html.length);
    // Find news-detail links
    const re = /href="([^"]*news-detail[^"]*)"/gi;
    const links = [];
    let m;
    while ((m = re.exec(html)) !== null) links.push(m[1]);
    console.log("news-detail links:", links.length, links.slice(0, 10));
    // Check all hrefs
    const allRe = /href="([^"]+)"/gi;
    const all = [];
    while ((m = allRe.exec(html)) !== null) {
      if (m[1].startsWith("/") && m[1].length > 2 && !m[1].includes("javascript")) all.push(m[1]);
    }
    const unique = [...new Set(all)];
    console.log("Unique paths:", unique.length);
    unique.slice(0, 20).forEach((u, i) => console.log(" ", i, u));
    // Try their API
    console.log("\n--- Try NP APIs ---");
    for (const api of [
      "https://adminapi.nepalipaisa.com/api/news",
      "https://adminapi.nepalipaisa.com/api/news/list",
      "https://adminapi.nepalipaisa.com/api/v1/news",
      "https://nepalipaisa.com/api/news",
    ]) {
      try {
        const c2 = new AbortController(); setTimeout(() => c2.abort(), 5000);
        const r = await fetch(api, { headers: { "User-Agent": UA }, signal: c2.signal });
        console.log(api, "=>", r.status);
        if (r.ok) {
          const txt = await r.text();
          console.log("  Response:", txt.slice(0, 300));
        }
      } catch (e) { console.log(api, "=> ERR:", e.message?.slice(0, 60)); }
    }
    // Check OG tags on article page
    console.log("\n--- NepaliPaisa article OG ---");
    const c3 = new AbortController(); setTimeout(() => c3.abort(), 8000);
    const res2 = await fetch("https://nepalipaisa.com/news-detail/91863", { headers: { "User-Agent": UA }, signal: c3.signal });
    const html2 = await res2.text();
    const ogTitle = html2.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    const ogDesc = html2.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    const ogImg = html2.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    console.log("OG title:", ogTitle?.[1]?.slice(0, 100));
    console.log("OG desc:", ogDesc?.[1]?.slice(0, 200));
    console.log("OG image:", ogImg?.[1]);
    // Find news IDs from homepage links  
    console.log("\n--- NP homepage news links ---");
    const c4 = new AbortController(); setTimeout(() => c4.abort(), 8000);
    const res3 = await fetch("https://nepalipaisa.com/news/latest", { headers: { "User-Agent": UA }, signal: c4.signal });
    const html3 = await res3.text();
    const newsLinks = [];
    const nlRe = /href="([^"]*news-detail[^"]*)"/gi;
    let m2;
    while ((m2 = nlRe.exec(html3)) !== null) newsLinks.push(m2[1]);
    console.log("news-detail links on /news/latest:", newsLinks.length, newsLinks.slice(0, 10));
    // Also check for dynamic content loading scripts
    const scriptSrc = /src="([^"]*(?:chunk|main|app|_next)[^"]*)"/gi;
    const scripts = [];
    while ((m2 = scriptSrc.exec(html3)) !== null) scripts.push(m2[1]);
    console.log("Script srcs:", scripts.length, scripts.slice(0, 5));
  } catch (e) { console.log("ERR:", e.message); }

  // ArthaSansar homepage - get links with images
  console.log("\n=== ArthaSansar Homepage ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://arthasansar.com", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Find news blocks with image + link + title
    // Look for blocks: <img> near <a href="/news/NNN">
    const newsRe = /<a[^>]*href="\/news\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const items = [];
    const seen = new Set();
    let m;
    while ((m = newsRe.exec(html)) !== null) {
      const id = m[1];
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (title.length > 10 && !seen.has(id)) {
        seen.add(id);
        // Find image near this link (look back 500 chars)
        const before = html.slice(Math.max(0, m.index - 500), m.index);
        const imgMatch = before.match(/src="([^"]*uploads\/media\/[^"]+)"/);
        const img = imgMatch ? imgMatch[1] : "";
        items.push({ id, title: title.slice(0, 80), img });
      }
    }
    console.log("News items:", items.length);
    items.slice(0, 10).forEach((it, i) => console.log(i, it.id, it.img ? "HAS_IMG" : "NO_IMG", it.title.slice(0, 60)));
    items.filter(i => i.img).slice(0, 3).forEach((it, i) => console.log("  img", i, it.img));
  } catch (e) { console.log("ERR:", e.message); }
}
test();
