async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  // 1. CorporateKhabar - find article body structure
  console.log("=== CorporateKhabar Article Structure ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://corporatekhabar.com/fncci-138/", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Find all divs with class containing useful words
    const divRe = /<div[^>]*class="([^"]*)"[^>]*>/gi;
    let m;
    const classes = new Set();
    while ((m = divRe.exec(html)) !== null) {
      if (/content|body|article|news|detail|post|entry|text|story/i.test(m[1])) classes.add(m[1]);
    }
    console.log("Content-related classes:", [...classes].slice(0, 20));

    // Try broader body match
    const bodyPatterns = [
      html.match(/<div[^>]*class="[^"]*tdb-block-inner[^"]*"[^>]*>([\s\S]{50,}?)<\/div>/i),
      html.match(/<div[^>]*class="[^"]*td_block_wrap[^"]*"[^>]*>([\s\S]{50,}?)<\/div>/i),
      html.match(/<div[^>]*class="[^"]*post_content[^"]*"[^>]*>([\s\S]{50,}?)<\/div>/i),
    ];
    for (let i = 0; i < bodyPatterns.length; i++) {
      if (bodyPatterns[i]) {
        const text = bodyPatterns[i][1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        console.log(`Pattern ${i} matched, text:`, text.slice(0, 200));
      }
    }

    // Try finding paragraphs
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    while ((m = pRe.exec(html)) !== null) {
      const t = m[1].replace(/<[^>]+>/g, "").trim();
      if (t.length > 20) paragraphs.push(t);
    }
    console.log("Paragraphs found:", paragraphs.length);
    paragraphs.slice(0, 5).forEach((p, i) => console.log(`  p${i}:`, p.slice(0, 150)));

    // Find article images (not thumbnails)
    const imgRe = /<img[^>]*src="(https:\/\/cdn\.corporatekhabar\.com\/uploads\/[^"]+)"[^>]*>/gi;
    const bigImgs = [];
    while ((m = imgRe.exec(html)) !== null) {
      if (!m[1].includes("-150x150") && !m[1].includes("corporate.png")) bigImgs.push(m[1]);
    }
    console.log("Big article images:", bigImgs.length);
    bigImgs.slice(0, 5).forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
  } catch (e) { console.log("ERR:", e.message); }

  // 2. NepaliPaisa - check if it's SPA (try API endpoint)
  console.log("\n=== NepaliPaisa Structure ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://nepalipaisa.com/news-detail/91863", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Check if there's a JSON-LD or meta description
    const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)
      || html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
    console.log("Meta desc:", metaMatch?.[1]?.slice(0, 200));
    const ogImg = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    console.log("OG image:", ogImg?.[1]);
    const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
    console.log("OG title:", ogTitle?.[1]);
    // Check for API calls in script tags
    const scriptRe = /fetch\(["']([^"']+)["']/gi;
    let m2;
    while ((m2 = scriptRe.exec(html)) !== null) console.log("Fetch URL:", m2[1]);
    // Check for Next.js data
    const nextData = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextData) {
      const data = JSON.parse(nextData[1]);
      console.log("Next.js pageProps keys:", Object.keys(data?.props?.pageProps || {}));
      const news = data?.props?.pageProps?.newsDetail || data?.props?.pageProps?.data || data?.props?.pageProps?.news;
      if (news) console.log("News data keys:", Object.keys(news));
    }
  } catch (e) { console.log("ERR:", e.message); }

  // 3. ArthaSansar - check structure more carefully
  console.log("\n=== ArthaSansar Structure ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://arthasansar.com/news/80676", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Check all div classes
    const divRe = /<div[^>]*class="([^"]*)"[^>]*>/gi;
    let m3;
    const classes = new Set();
    while ((m3 = divRe.exec(html)) !== null) {
      if (/content|body|article|news|detail|post|entry|text|story|description/i.test(m3[1])) classes.add(m3[1]);
    }
    console.log("Content classes:", [...classes].slice(0, 20));
    // Find paragraphs
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const paragraphs = [];
    while ((m3 = pRe.exec(html)) !== null) {
      const t = m3[1].replace(/<[^>]+>/g, "").trim();
      if (t.length > 20) paragraphs.push(t);
    }
    console.log("Paragraphs:", paragraphs.length);
    paragraphs.slice(0, 5).forEach((p, i) => console.log(`  p${i}:`, p.slice(0, 150)));
    // Check for images with arthasansar uploads
    const imgRe = /(?:src|data-src)="([^"]*uploads\/media\/[^"]+)"/gi;
    const imgs = [];
    while ((m3 = imgRe.exec(html)) !== null) {
      if (!m3[1].includes("512x512") && !m3[1].includes(".gif")) imgs.push(m3[1]);
    }
    console.log("Article images:", imgs.length);
    imgs.forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
  } catch (e) { console.log("ERR:", e.message); }
}
test();
