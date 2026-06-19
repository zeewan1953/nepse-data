async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

  // 1. CorporateKhabar homepage - find news links with titles & images
  console.log("=== CorporateKhabar Homepage ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://corporatekhabar.com/", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Find article blocks with title + link
    const re = /<a[^>]*href="(https?:\/\/corporatekhabar\.com\/[^">]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const t = m[2].replace(/<[^>]+>/g, "").trim();
      if (t.length > 10 && t.length < 200 && !m[1].includes("/category/") && !m[1].includes("/tag/") && !m[1].includes("/page/") && !m[1].includes("/author/") && !m[1].includes("/about")) {
        links.push({ url: m[1], title: t.slice(0, 80) });
      }
    }
    console.log("Article links:", links.length);
    links.slice(0, 8).forEach((l, i) => console.log(i, l.url, "||", l.title));
    
    // Find images
    const imgRe = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    const imgs = [];
    while ((m = imgRe.exec(html)) !== null) {
      if (!m[1].includes("logo") && !m[1].includes("icon") && !m[1].includes("1x1") && m[1].length > 30) imgs.push(m[1]);
    }
    console.log("Content images:", imgs.length);
    imgs.slice(0, 5).forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
  } catch (e) { console.log("ERR:", e.message); }

  // 2. CorporateKhabar article detail
  console.log("\n=== CorporateKhabar Article ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://corporatekhabar.com/fncci-138/", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    // Find article content div
    const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:entry-content|article-body|news-content|post-content|tdb-block-inner)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    console.log("Body match:", !!bodyMatch, "len:", bodyMatch?.[1]?.length);
    // Find title
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
    console.log("Title:", titleMatch?.[1]?.replace(/<[^>]+>/g,"").trim().slice(0, 100));
    // Find images in article
    const imgRe = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    let m2;
    const artImgs = [];
    while ((m2 = imgRe.exec(html)) !== null) {
      if (!m2[1].includes("logo") && !m2[1].includes("icon") && !m2[1].includes("1x1")) artImgs.push(m2[1]);
    }
    console.log("Article images:", artImgs.length);
    artImgs.slice(0, 5).forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
    // Get content text snippet
    if (bodyMatch) {
      const text = bodyMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      console.log("Content text:", text.slice(0, 200));
    }
  } catch (e) { console.log("ERR:", e.message); }

  // 3. NepaliPaisa homepage
  console.log("\n=== NepaliPaisa Homepage ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://nepalipaisa.com", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    const re = /<a[^>]*href="([^"]*news-detail[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let m2;
    while ((m2 = re.exec(html)) !== null) {
      const t = m2[2].replace(/<[^>]+>/g, "").trim();
      if (t.length > 5) links.push({ url: m2[1], title: t.slice(0, 80) });
    }
    console.log("Article links:", links.length);
    links.slice(0, 8).forEach((l, i) => console.log(i, l.url, "||", l.title));
    // Also check other link patterns
    const re2 = /href="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const allLinks = [];
    while ((m2 = re2.exec(html)) !== null) {
      const t = m2[2].replace(/<[^>]+>/g, "").trim();
      if (t.length > 15 && t.length < 200) allLinks.push({ url: m2[1], title: t.slice(0, 80) });
    }
    console.log("All text links:", allLinks.length);
    allLinks.slice(0, 5).forEach((l, i) => console.log("  ", i, l.url, "||", l.title));
  } catch (e) { console.log("ERR:", e.message); }

  // 4. NepaliPaisa article detail
  console.log("\n=== NepaliPaisa Article ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://nepalipaisa.com/news-detail/91863", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:entry-content|article-body|news-content|post-content|news-detail|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    console.log("Body match:", !!bodyMatch, "len:", bodyMatch?.[1]?.length);
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
    console.log("Title:", titleMatch?.[1]?.replace(/<[^>]+>/g,"").trim().slice(0, 100));
    const imgRe = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    let m3;
    const artImgs = [];
    while ((m3 = imgRe.exec(html)) !== null) {
      if (!m3[1].includes("logo") && !m3[1].includes("icon")) artImgs.push(m3[1]);
    }
    console.log("Article images:", artImgs.length);
    artImgs.slice(0, 5).forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
    if (bodyMatch) {
      const text = bodyMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      console.log("Content text:", text.slice(0, 200));
    }
  } catch (e) { console.log("ERR:", e.message); }

  // 5. ArthaSansar article detail
  console.log("\n=== ArthaSansar Article ===");
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const res = await fetch("https://arthasansar.com/news/80676", { headers: { "User-Agent": UA }, signal: c.signal });
    const html = await res.text();
    const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:entry-content|article-body|news-content|post-content|news-detail|description|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    console.log("Body match:", !!bodyMatch, "len:", bodyMatch?.[1]?.length);
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
    console.log("Title:", titleMatch?.[1]?.replace(/<[^>]+>/g,"").trim().slice(0, 100));
    const imgRe = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    let m4;
    const artImgs = [];
    while ((m4 = imgRe.exec(html)) !== null) {
      if (!m4[1].includes("logo") && !m4[1].includes("icon")) artImgs.push(m4[1]);
    }
    console.log("Article images:", artImgs.length);
    artImgs.slice(0, 5).forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
    if (bodyMatch) {
      const text = bodyMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      console.log("Content text:", text.slice(0, 200));
    }
  } catch (e) { console.log("ERR:", e.message); }
}
test();
