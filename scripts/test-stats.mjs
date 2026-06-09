import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();
try {
  const data = await n.requestGETAPI("/api/nots/securityDailyTradeStat/58");
  console.log("type:", Array.isArray(data) ? `array(${data.length})` : typeof data);
  const first = Array.isArray(data) ? data[0] : data;
  console.log("keys:", Object.keys(first ?? {}));
  console.log("sample:", JSON.stringify(first)?.slice(0, 400));
} catch (e) {
  console.log("threw:", e.message);
}
