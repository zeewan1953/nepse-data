import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();

const list = await n.getSecurityList();
console.log("securityList length:", list.length);
const shol = list.find((s) => s.symbol === "SHOL");
console.log("SHOL in securityList:", JSON.stringify(shol));
console.log("SH* in list:", list.filter((s) => s.symbol?.startsWith("SH")).map((s) => s.symbol));

const live = await n.getLiveMarket().catch(() => []);
console.log("live length:", live.length);
console.log("SHOL in live:", JSON.stringify(live.find((s) => s.symbol === "SHOL")));
