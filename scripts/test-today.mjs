import { Nepse } from "@rumess/nepse-api";
const n = new Nepse();

async function tryPost(label, getId) {
  try {
    const id = await getId();
    const data = await n.requestPOSTAPI(
      "/api/nots/nepse-data/today-price?size=600&page=0",
      { id },
    );
    const len = data?.content?.length;
    console.log(`${label}: OK content=${len} sample keys=${Object.keys(data?.content?.[0] ?? {}).slice(0,6)}`);
  } catch (e) {
    console.log(`${label}: threw ${e.message}`);
  }
}

await tryPost("floorsheet-id", () => n.getPOSTPayloadIDForFloorSheet());
await tryPost("scrips-id", () => n.getPOSTPayloadIDForScrips());
await tryPost("plain-id", () => n.getPOSTPayloadID());
