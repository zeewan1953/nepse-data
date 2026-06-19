async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  
  console.log("=== NepaliPaisa API ===");
  // Test GetNewsList
  const c = new AbortController(); setTimeout(() => c.abort(), 8000);
  const res = await fetch("https://nepalipaisa.com/api/GetNewsList", { 
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=utf-8" },
    signal: c.signal 
  });
  console.log("GetNewsList status:", res.status);
  if (res.ok) {
    const data = await res.json();
    console.log("Keys:", Object.keys(data));
    console.log("statusCode:", data.statusCode);
    if (data.result) {
      console.log("Result type:", typeof data.result, Array.isArray(data.result));
      if (Array.isArray(data.result)) {
        console.log("Items:", data.result.length);
        console.log("First item keys:", Object.keys(data.result[0] || {}));
        console.log("First:", JSON.stringify(data.result[0]).slice(0, 500));
      } else {
        console.log("Result keys:", Object.keys(data.result));
        console.log("Result:", JSON.stringify(data.result).slice(0, 500));
      }
    }
    console.log("Full:", JSON.stringify(data).slice(0, 800));
  } else {
    console.log("Error:", await res.text());
  }

  // Try with POST and parameters
  console.log("\n=== NP API POST ===");
  try {
    const c2 = new AbortController(); setTimeout(() => c2.abort(), 8000);
    const body = JSON.stringify({ pageNo: 1, itemsPerPage: 15, categoryId: 0, subCategoryId: 0, newsType: "", sectorGroup: "" });
    const res2 = await fetch("https://nepalipaisa.com/api/GetNewsList", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/json; charset=utf-8" },
      body,
      signal: c2.signal,
    });
    console.log("POST status:", res2.status);
    if (res2.ok) {
      const data = await res2.json();
      console.log("POST response:", JSON.stringify(data).slice(0, 800));
      if (data.result && Array.isArray(data.result)) {
        console.log("Items:", data.result.length);
        console.log("First keys:", Object.keys(data.result[0] || {}));
        data.result.slice(0, 3).forEach((item, i) => {
          console.log(`\nItem ${i}:`);
          console.log("  ID:", item.newsId || item.id || item.NewsId);
          console.log("  Title:", (item.title || item.newsTitle || item.NewsTitle || "").slice(0, 80));
          console.log("  Image:", item.image || item.newsImage || item.Image || "");
          console.log("  Date:", item.date || item.newsDate || item.publishedDate || "");
        });
      }
    }
  } catch (e) { console.log("POST error:", e.message); }
}
test();
