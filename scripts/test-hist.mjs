import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();
try {
  const h = await n.getSecurityPriceVolumeHistory("NABIL");
  console.log("type:", typeof h, "isArray:", Array.isArray(h));
  console.log("keys:", Object.keys(h ?? {}));
  console.log("content length:", h?.content?.length);
  console.log("sample[0]:", JSON.stringify(h?.content?.[0]));
  console.log("totalPages:", h?.totalPages, "totalElements:", h?.totalElements);
} catch (e) {
  console.error("ERR:", e?.message);
  console.error(e?.stack?.split("\n").slice(0, 4).join("\n"));
}
