import { Nepse } from '@rumess/nepse-api';

const client = new Nepse();

async function main() {
  try {
    console.log("Fetching Live Market...");
    const data = await client.getLiveMarket();
    console.log(JSON.stringify(data).slice(0, 3000));
  } catch (e) {
    console.error('getLiveMarket error:', e.message);
  }

  try {
    console.log("\nFetching Market Summary...");
    const summary = await client.getMarketSummary();
    console.log(JSON.stringify(summary, null, 2));
  } catch (e) {
    console.error('getMarketSummary error:', e.message);
  }

  try {
    console.log("\nFetching Market Status...");
    const status = await client.getMarketStatus();
    console.log(JSON.stringify(status, null, 2));
  } catch (e) {
    console.error('getMarketStatus error:', e.message);
  }
}

main();
