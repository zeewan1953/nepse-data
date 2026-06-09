import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();

// 1) raw trade fields
const fs = await n.getFloorSheet({ size: 5 });
console.log("totalTrades:", fs?.totalTrades, "totalQty:", fs?.totalQty);
console.log("sample trade:", JSON.stringify(fs?.floorsheets?.content?.[0]));

// 2) does buyerBroker filter actually work?
const b = await n.getFloorSheet({ buyerBroker: 58, size: 20 });
const rows = b?.floorsheets?.content ?? [];
const buyers = [...new Set(rows.map((r) => r.buyerMemberId))];
console.log(`\nbuyerBroker=58 filter -> returned ${rows.length} trades; distinct buyerMemberId:`, buyers);

// 3) sanity: across a sample, total buy qty == total sell qty (each trade matched)
let buyQty = 0, sellQty = 0;
const brokers = new Map();
for (const t of rows) { buyQty += t.contractQuantity; }
console.log("buyerBroker=58 total buy qty:", buyQty);

// seller side for same broker
const s = await n.getFloorSheet({ sellerBroker: 58, size: 20 });
const srows = s?.floorsheets?.content ?? [];
const sellers = [...new Set(srows.map((r) => r.sellerMemberId))];
console.log(`sellerBroker=58 -> ${srows.length} trades; distinct sellerMemberId:`, sellers);
