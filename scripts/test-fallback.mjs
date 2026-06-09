import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();
try {
  const live = await n.getLiveMarket().catch((e) => ({ err: e.message }));
  console.log("live length:", Array.isArray(live) ? live.length : JSON.stringify(live));
} catch (e) { console.log("live threw:", e.message); }
try {
  const tp = await n.getTodaysPriceVolumeHistory({ size: 600 });
  console.log("todays keys:", Object.keys(tp ?? {}));
  console.log("todays content length:", tp?.content?.length);
  console.log("todays sample:", JSON.stringify(tp?.content?.[0])?.slice(0, 300));
} catch (e) { console.log("todays threw:", e.message); }
