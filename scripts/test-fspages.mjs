import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();
const f = await n.getFloorSheet({ page: 0, size: 500 });
console.log("totalTrades:", f?.totalTrades);
console.log("floorsheets.totalElements:", f?.floorsheets?.totalElements);
console.log("floorsheets.totalPages:", f?.floorsheets?.totalPages);
console.log("page0 content length:", f?.floorsheets?.content?.length);

// fetch a few sequential pages, check each returns 500 (no silent failures)
let total = 0, fails = 0;
for (let p = 0; p < 10; p++) {
  try {
    const r = await n.getFloorSheet({ page: p, size: 500 });
    const len = r?.floorsheets?.content?.length ?? 0;
    total += len;
    if (len === 0) fails++;
  } catch (e) { fails++; console.log(`page ${p} err: ${e.message}`); }
}
console.log(`10 sequential pages: total rows=${total}, empties/fails=${fails}`);
