import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();
try {
  const g = await n.getNepseIndexDailyGraph();
  console.log("length:", g?.length);
  console.log("first:", JSON.stringify(g?.[0]));
  console.log("last:", JSON.stringify(g?.[g.length - 1]));
} catch (e) { console.log("index graph threw:", e.message); }

// also check how many daily price records a stock really has at large size
try {
  const km = await n.getSecuritySymbolIdKeymap();
  const id = km.get("NABIL");
  const h = await n.requestGETAPI(`/api/nots/market/security/price/${id}?size=5000&page=0`);
  console.log("NABIL price totalElements:", h?.totalElements, "content:", h?.content?.length);
  console.log("oldest:", h?.content?.[h.content.length-1]?.businessDate, "newest:", h?.content?.[0]?.businessDate);
} catch (e) { console.log("price threw:", e.message); }
