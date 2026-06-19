async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  // 1. CorporateKhabar - try with www prefix and different URLs
  console.log("=== CorporateKhabar ===");
  for (const url of ["https://corporatekhabar.com", "https://www.corporatekhabar.com", "https://corporatekhabar.com/fncci-138/"]) {
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 8000);
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: c.signal, redirect: "follow" });
      console.log(url, "=>", res.status, res.url, "len:", (await res.text()).length);
    } catch (e) {
      console.log(url, "=> ERROR:", e.message?.slice(0, 100));
    }
  }

  // 2. NepaliPaisa
  console.log("\n=== NepaliPaisa ===");
  for (const url of ["https://nepalipaisa.com", "https://www.nepalipaisa.com", "https://nepalipaisa.com/news-detail/91863"]) {
    try {
      const c = new AbortController();
      setTimeout(() => c.abort(), 8000);
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: c.signal, redirect: "follow" });
      console.log(url, "=>", res.status, res.url, "len:", (await res.text()).length);
    } catch (e) {
      console.log(url, "=> ERROR:", e.message?.slice(0, 100));
    }
  }

  // 3. ArthaSansar - check link patterns
  console.log("\n=== ArthaSansar links ===");
  try {
    const c = new AbortController();
    setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://arthasansar.com", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Find all href patterns
    const hrefRe = /href="([^"]*(?:news|article|detail)[^"]*)"/gi;
    const hrefs = [];
    let m;
    while ((m = hrefRe.exec(html)) !== null) hrefs.push(m[1]);
    console.log("News-like hrefs:", hrefs.length);
    hrefs.slice(0, 15).forEach((h, i) => console.log(" ", i, h));

    // Also check all <a> tags with any pattern containing /news/
    const allLinks = [];
    const linkRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
    while ((m = linkRe.exec(html)) !== null) {
      if (m[1].includes("/news/") || m[1].includes("news-detail")) allLinks.push(m[1]);
    }
    console.log("\n/news/ links:", allLinks.length);
    allLinks.slice(0, 10).forEach((l, i) => console.log(" ", i, l));
  } catch (e) {
    console.log("Error:", e.message);
  }
}
test();
