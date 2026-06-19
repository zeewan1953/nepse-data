async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10000);

  // 1. CorporateKhabar
  console.log("=== CorporateKhabar ===");
  try {
    const res = await fetch("https://corporatekhabar.com", {
      headers: { "User-Agent": UA }, signal: ctrl.signal,
    });
    const html = await res.text();
    console.log("Status:", res.status, "HTML len:", html.length);
    // Find article links
    const re = /<a[^>]*href="(https?:\/\/corporatekhabar\.com\/[^">]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const t = m[2].replace(/<[^>]+>/g, "").trim();
      if (t.length > 10 && t.length < 200 && !m[1].includes("/category/") && !m[1].includes("/tag/") && !m[1].includes("/page/") && !m[1].includes("/author/")) {
        links.push({ url: m[1], title: t.slice(0, 80) });
      }
    }
    console.log("Links found:", links.length);
    links.slice(0, 8).forEach((l, i) => console.log(i, l.url, "||", l.title));

    // Find images near links
    const imgRe = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    const imgs = [];
    while ((m = imgRe.exec(html)) !== null) imgs.push(m[1]);
    console.log("Total images:", imgs.length);
    imgs.slice(0, 5).forEach((img, i) => console.log("  img", i, img.slice(0, 100)));
  } catch (e) {
    console.log("Error:", e.message);
  }

  // 2. NepaliPaisa
  console.log("\n=== NepaliPaisa ===");
  try {
    const ctrl2 = new AbortController();
    setTimeout(() => ctrl2.abort(), 10000);
    const res = await fetch("https://nepalipaisa.com", {
      headers: { "User-Agent": UA }, signal: ctrl2.signal,
    });
    const html = await res.text();
    console.log("Status:", res.status, "HTML len:", html.length);
    const re = /<a[^>]*href="(https?:\/\/nepalipaisa\.com\/[^">]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const t = m[2].replace(/<[^>]+>/g, "").trim();
      if (t.length > 10 && t.length < 200 && !m[1].includes("/category/") && !m[1].includes("/tag/") && !m[1].includes("/page/")) {
        links.push({ url: m[1], title: t.slice(0, 80) });
      }
    }
    console.log("Links found:", links.length);
    links.slice(0, 8).forEach((l, i) => console.log(i, l.url, "||", l.title));
  } catch (e) {
    console.log("Error:", e.message);
  }

  // 3. ArthaSansar
  console.log("\n=== ArthaSansar ===");
  try {
    const ctrl3 = new AbortController();
    setTimeout(() => ctrl3.abort(), 10000);
    const res = await fetch("https://arthasansar.com", {
      headers: { "User-Agent": UA }, signal: ctrl3.signal,
    });
    const html = await res.text();
    console.log("Status:", res.status, "HTML len:", html.length);
    const re = /<a[^>]*href="(https?:\/\/arthasansar\.com\/[^">]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const links = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const t = m[2].replace(/<[^>]+>/g, "").trim();
      if (t.length > 10 && t.length < 200 && !m[1].includes("/category/") && !m[1].includes("/tag/") && !m[1].includes("/page/")) {
        links.push({ url: m[1], title: t.slice(0, 80) });
      }
    }
    console.log("Links found:", links.length);
    links.slice(0, 8).forEach((l, i) => console.log(i, l.url, "||", l.title));
  } catch (e) {
    console.log("Error:", e.message);
  }
}
test();
