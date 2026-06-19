async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  
  const body = JSON.stringify({
    dateType: "",
    dateFrom: "",
    dateTo: "",
    sectors: [],
    companies: [],
    categoryId: 0,
    subCategoryId: 0,
    pageNo: 1,
    itemsPerPage: 15,
    pagePerDisplay: 10,
    newsType: "",
    sectorGroup: "",
  });
  
  const c = new AbortController(); setTimeout(() => c.abort(), 8000);
  const res = await fetch("https://nepalipaisa.com/api/GetNewsList", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=utf-8" },
    body,
    signal: c.signal,
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("statusCode:", data.statusCode);
  
  if (data.result && data.result.data) {
    const items = data.result.data;
    console.log("Items:", items.length);
    console.log("First item keys:", Object.keys(items[0] || {}));
    items.slice(0, 5).forEach((item, i) => {
      console.log(`\nItem ${i}:`);
      console.log("  newsId:", item.newsId);
      console.log("  title:", (item.title || "").slice(0, 80));
      console.log("  newsDate:", item.newsDate);
      console.log("  newsDateFormatted:", item.newsDateFormatted);
      console.log("  image:", item.image || item.newsImage || "");
      console.log("  slug:", item.slug || item.newsSlug || item.urlSlug || "");
    });
  } else {
    console.log("Result:", JSON.stringify(data).slice(0, 500));
  }
}
test();
