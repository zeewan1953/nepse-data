import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();
try {
  const fs = await n.getFloorSheet({ size: 20 });
  console.log("totalTrades:", fs?.totalTrades, "totalQty:", fs?.totalQty);
  console.log("content length:", fs?.floorsheets?.content?.length);
  console.log("totalElements:", fs?.floorsheets?.totalElements);
  console.log("sample:", JSON.stringify(fs?.floorsheets?.content?.[0])?.slice(0, 200));
} catch (e) { console.log("threw:", e.message); }
