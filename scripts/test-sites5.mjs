async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  // 1. NepaliPaisa - try their admin API
  console.log("=== NepaliPaisa API ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://adminapi.nepalipaisa.com/api/news/get-all-news", { headers: { "User-Agent": UA }, signal: c.signal });
    const data = await res.json();
    console.log("Type:", typeof data, Array.isArray(data));
    if (Array.isArray(data)) {
      console.log("Items:", data.length);
      console.log("First item keys:", Object.keys(data[0] || {}));
      console.log("First:", JSON.stringify(data[0]).slice(0, 300));
    } else if (data?.data) {
      console.log("Data items:", data.data?.length);
      console.log("First:", JSON.stringify(data.data?.[0]).slice(0, 300));
    } else {
      console.log("Keys:", Object.keys(data));
      console.log("Response:", JSON.stringify(data).slice(0, 500));
    }
  } catch (e) {
    console.log("Error:", e.message);
    // Try alternative
    try {
      const c2 = new AbortController(); setTimeout(() => c2.abort(), 8000);
      const res2 = await fetch("https://adminapi.nepalipaisa.com/api/news/get-news-list", { headers: { "User-Agent": UA }, signal: c2.signal });
      console.log("Alt API status:", res2.status);
      const data2 = await res2.json();
      console.log("Alt response:", JSON.stringify(data2).slice(0, 500));
    } catch (e2) {
      console.log("Alt error:", e2.message);
    }
  }

  // 2. NepaliPaisa - try specific news API
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://adminapi.nepalipaisa.com/api/news/get-news/91863", { headers: { "User-Agent": UA }, signal: c.signal });
    console.log("\nNepaliPaisa detail status:", res.status);
    const data = await res.json();
    console.log("Detail keys:", Object.keys(data?.data || data || {}));
    const d = data?.data || data;
    console.log("Title:", d?.title || d?.news_title);
    console.log("Image:", d?.image || d?.news_image);
    console.log("Content:", (d?.description || d?.content || d?.news_description || "")?.slice(0, 200));
  } catch (e) {
    console.log("Detail error:", e.message);
  }

  // 3. NepaliPaisa homepage - find all links and images
  console.log("\n=== NepaliPaisa Homepage ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://nepalipaisa.com", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Check for any news link pattern
    const allHrefs = [];
    const hrefRe = /href="([^"]+)"/gi;
    let m;
    while ((m = hrefRe.exec(html)) !== null) {
      if (m[1].includes("news") || m[1].includes("detail")) allHrefs.push(m[1]);
    }
    console.log("News hrefs:", allHrefs.length, allHrefs.slice(0, 10));
    // Check images
    const imgRe = /src="([^"]+)"/gi;
    const imgs = [];
    while ((m = imgRe.exec(html)) !== null) {
      if (m[1].includes("adminapi") || m[1].includes("nepalipaisa")) imgs.push(m[1]);
    }
    console.log("NP images:", imgs.length);
    imgs.slice(0, 5).forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
  } catch (e) { console.log("ERR:", e.message); }

  // 4. CorporateKhabar - find content div
  console.log("\n=== CorporateKhabar Content Div ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://corporatekhabar.com/fncci-138/", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Try the "col-lg-12 col-md-12 col-sm-12 col-xs-12 content" class
    const bodyMatch = html.match(/<div[^>]*class="[^"]*col-lg-12 col-md-12 col-sm-12 col-xs-12 content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    if (bodyMatch) {
      const text = bodyMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      console.log("Content div text:", text.slice(0, 300));
    } else {
      console.log("Content div not found");
    }
    // Try matching via paragraphs approach - get all <p> text
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const allText = [];
    let m2;
    while ((m2 = pRe.exec(html)) !== null) {
      const t = m2[1].replace(/<[^>]+>/g, "").trim();
      if (t.length > 30 && !t.includes("Chabahil")) allText.push(t);
    }
    console.log("Paragraph content:", allText.join(" ").slice(0, 500));
    // Find featured image
    const ogImg = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    console.log("OG image:", ogImg?.[1]);
  } catch (e) { console.log("ERR:", e.message); }
}
test();
