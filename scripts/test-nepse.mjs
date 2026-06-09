// Quick smoke test for @rumess/nepse-api live data.
import { Nepse } from '@rumess/nepse-api';

const nepse = new Nepse();

async function run() {
  try {
    const status = await nepse.getMarketStatus();
    console.log('MARKET STATUS:', JSON.stringify(status));

    const live = await nepse.getLiveMarket();
    console.log('LIVE COUNT:', Array.isArray(live) ? live.length : typeof live);
    console.log('LIVE SAMPLE:', JSON.stringify(live?.[0]));

    const idx = await nepse.getNepseIndex();
    console.log('INDEX SAMPLE:', JSON.stringify(idx?.[0]));

    const gainers = await nepse.getTopTenGainers();
    console.log('GAINER SAMPLE:', JSON.stringify(gainers?.[0]));
  } catch (e) {
    console.error('ERROR:', e?.message || e);
    console.error(e?.stack);
  }
}
run();
