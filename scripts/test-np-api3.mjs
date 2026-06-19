async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const body = JSON.stringify({
    dateType: "", dateFrom: "", dateTo: "", sectors: [], companies: [],
    categoryId: 0, subCategoryId: 0, pageNo: 1, itemsPerPage: 15,
    pagePerDisplay: 10, newsType: "", sectorGroup: "",
  });
  
  const c = new AbortController(); setTimeout(() => c.abort(), 8000);
  const res = await fetch("https://nepalipaisa.com/api/GetNewsList", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=utf-8" },
    body, signal: c.signal,
  });
  const data = await res.json();
  const items = data.result?.data?.[0]?.newsData || [];
  
  console.log("=== NP Items with full data ===");
  items.slice(0, 5).forEach((item, i) => {
    console.log(`\nItem ${i}:`);
    console.log("  newsId:", item.newsId);
    console.log("  newsTitle:", item.newsTitle?.slice(0, 80));
    console.log("  imageName:", item.imageName);
    console.log("  imageUrl:", item.imageUrl);
    console.log("  category:", item.category);
    console.log("  overview:", item.overview?.slice(0, 100));
    console.log("  descriptions:", item.descriptions?.slice(0, 200));
    console.log("  publishedOn:", item.publishedOn);
    console.log("  newsSource:", item.newsSource);
  });

  // Now test article detail API
  console.log("\n=== NP Article Detail API ===");
  for (const api of ["GetNewsDetail", "GetNews", "NewsDetail"]) {
    try {
      const c2 = new AbortController(); setTimeout(() => c2.abort(), 5000);
      const r = await fetch(`https://nepalipaisa.com/api/${api}?newsId=91863`, {
        headers: { "User-Agent": UA }, signal: c2.signal,
      });
      if (r.ok) {
        const d = await r.json();
        console.log(`${api} GET:`, d.statusCode, JSON.stringify(d).slice(0, 300));
      } else {
        console.log(`${api} GET:`, r.status);
      }
    } catch (e) {}
  }
  // Try POST
  try {
    const c3 = new AbortController(); setTimeout(() => c3.abort(), 5000);
    const r = await fetch("https://nepalipaisa.com/api/GetNewsDetail", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ newsId: 91863 }),
      signal: c3.signal,
    });
    if (r.ok) {
      const d = await r.json();
      console.log("GetNewsDetail POST:", d.statusCode, JSON.stringify(d).slice(0, 500));
    } else {
      console.log("GetNewsDetail POST:", r.status);
    }
  } catch (e) {}
}
test();
