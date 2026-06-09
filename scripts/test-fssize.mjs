import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();
for (const size of [500, 2000, 5000, 10000]) {
  try {
    const r = await n.getFloorSheet({ page: 0, size });
    console.log(`size=${size} -> content=${r?.floorsheets?.content?.length}, totalPages=${r?.floorsheets?.totalPages}, totalElements=${r?.floorsheets?.totalElements}`);
  } catch (e) {
    console.log(`size=${size} -> threw ${e.message}`);
  }
}
