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
  
  if (data.result?.data) {
    for (const group of data.result.data) {
      console.log("Date:", group.newsDate, group.newsDateFormatted);
      if (group.newsData && Array.isArray(group.newsData)) {
        console.log("  News count:", group.newsData.length);
        console.log("  First item keys:", Object.keys(group.newsData[0] || {}));
        group.newsData.slice(0, 5).forEach((item, i) => {
          console.log(`  Item ${i}:`);
          console.log("    newsId:", item.newsId || item.NewsId);
          console.log("    title:", (item.newsTitle || item.title || item.NewsTitle || "").slice(0, 80));
          console.log("    image:", item.newsImage || item.image || "");
          console.log("    slug:", item.slug || item.urlSlug || "");
          console.log("    date:", item.newsDate || item.publishedDate || "");
        });
      } else {
        console.log("  newsData:", typeof group.newsData, JSON.stringify(group.newsData)?.slice(0, 300));
      }
    }
  }
}
test();
