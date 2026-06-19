async function test() {
  const BASE = "http://localhost:3098";
  
  // Test news list
  console.log("=== News List ===");
  const res = await fetch(`${BASE}/api/news`);
  const data = await res.json();
  console.log("Total items:", data.news?.length);
  
  const sources = {};
  for (const item of data.news || []) {
    const prefix = item.id.split("-")[0];
    sources[prefix] = (sources[prefix] || 0) + 1;
  }
  console.log("By source:", sources);
  
  const withImg = data.news?.filter(n => n.image).length;
  console.log("With images:", withImg, "/", data.news?.length);
  
  const cats = [...new Set(data.news?.map(n => n.category))];
  console.log("Categories:", cats.join(", "));
  
  // Show sample from each source
  for (const [prefix, name] of [["ml","MeroLagani"],["ss","ShareSansar"],["ck","CorporateKhabar"],["np","NepaliPaisa"],["as","ArthaSansar"]]) {
    const item = data.news?.find(n => n.id.startsWith(prefix + "-"));
    if (item) {
      console.log(`\n${name}: ${item.title.slice(0, 60)}`);
      console.log(`  Image: ${item.image ? "YES" : "NO"}`);
      console.log(`  Category: ${item.category}`);
    } else {
      console.log(`\n${name}: NO ITEMS`);
    }
  }

  // Test article details for each source
  console.log("\n\n=== Article Details ===");
  for (const [prefix, name] of [["ml","MeroLagani"],["ss","ShareSansar"],["ck","CorporateKhabar"],["np","NepaliPaisa"],["as","ArthaSansar"]]) {
    const item = data.news?.find(n => n.id.startsWith(prefix + "-"));
    if (!item) continue;
    const dashIdx = item.id.indexOf("-");
    const id = item.id.slice(dashIdx + 1);
    try {
      const r = await fetch(`${BASE}/api/news/article?id=${id}&source=${prefix}`);
      const art = await r.json();
      console.log(`\n${name}:`);
      console.log(`  Title: ${art.title?.slice(0, 70)}`);
      console.log(`  Content: ${art.content?.length || 0} chars`);
      console.log(`  Images: ${art.images?.length || 0}`);
      if (art.images?.[0]) console.log(`  First img: ${art.images[0].slice(0, 80)}`);
    } catch (e) {
      console.log(`\n${name}: ERROR ${e.message}`);
    }
  }
}
test();
