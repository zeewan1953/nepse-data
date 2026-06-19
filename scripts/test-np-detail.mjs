async function test() {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  const c = new AbortController(); setTimeout(() => c.abort(), 8000);
  const r = await fetch("https://nepalipaisa.com/api/GetNews?newsId=91863", {
    headers: { "User-Agent": UA }, signal: c.signal,
  });
  const d = await r.json();
  const result = d.result;
  console.log("All keys:", Object.keys(result));
  console.log("newsId:", result.newsId);
  console.log("newsTitle:", result.newsTitle);
  console.log("imageUrl:", result.imageUrl);
  console.log("imageName:", result.imageName);
  console.log("category:", result.category);
  console.log("publishedOn:", result.publishedOn);
  console.log("publishedOnNepaliTime:", result.publishedOnNepaliTime);
  console.log("descriptions type:", typeof result.descriptions, Array.isArray(result.descriptions));
  if (typeof result.descriptions === "string") {
    console.log("descriptions:", result.descriptions.slice(0, 500));
  } else if (Array.isArray(result.descriptions)) {
    console.log("descriptions count:", result.descriptions.length);
    result.descriptions.slice(0, 3).forEach((desc, i) => {
      console.log(`  desc ${i}:`, typeof desc === "object" ? JSON.stringify(desc).slice(0, 200) : String(desc).slice(0, 200));
    });
  }
  console.log("overview:", result.overview?.slice(0, 200));
  console.log("newsSource:", result.newsSource);
  // Check for images in descriptions
  const descStr = JSON.stringify(result.descriptions);
  const imgRe = /(?:src|href)="([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
  let m;
  const imgs = [];
  while ((m = imgRe.exec(descStr)) !== null) imgs.push(m[1]);
  console.log("Images in descriptions:", imgs.length);
  imgs.forEach((img, i) => console.log("  img", i, img.slice(0, 120)));
}
test();
