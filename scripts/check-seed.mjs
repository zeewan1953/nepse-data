import Database from "better-sqlite3";
import { join } from "path";

const db = new Database(join(process.cwd(), "seed", "darisir.db"));
const r = db.prepare("SELECT brokerCode, tradeDate, purchaseAmt, sellAmt, netAmt FROM merolagani_broker_daily WHERE brokerCode = '58' ORDER BY tradeDate").all();
console.log(JSON.stringify(r, null, 2));
db.close();