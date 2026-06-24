const fs = require('fs');

// Update broker-analysis API
let api = fs.readFileSync('src/app/api/broker-analysis/route.ts', 'utf8');
api = api.replace(
  'import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";',
  'import { fetchMeroLaganiSummary, calcMeroPercent } from "@/lib/merolagani";
import { getTargetDateWithFallback } from "@/lib/date-utils";'
);
api = api.replace(
  /    \/\/ Get date parameter from query string\r?\n    const \{ searchParams \} = new URL\(request\.url\);\r?\n    const dateParam = searchParams\.get\("date"\);\r?\n    const targetDate = dateParam \|\| todayStr\(\);/,
  '    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    
    // Auto-fallback to latest available date in database
    const { date: targetDate, usedFallback } = await getTargetDateWithFallback(dateParam || undefined);'
);
api = api.replace(
  /        return \{\r?\n          generatedAt: Date\.now\(\),\r?\n          source: isRealBrokerData \? `merolagani-\\\$\{brokerDataSource\}` : isSampleData \? `\\\$\{source\}\+sample` : source,\r?\n          dataQuality,/,
  '        return {
          generatedAt: Date.now(),
          source: isRealBrokerData ? `merolagani-${brokerDataSource}` : isSampleData ? `${source}+sample` : source,
          usedFallback,
          fallbackDate: usedFallback ? targetDate : undefined,
          dataQuality,'
);
fs.writeFileSync('src/app/api/broker-analysis/route.ts', api, 'utf8');
console.log('Updated API');

// Update page
let page = fs.readFileSync('src/app/broker-analysis/page.tsx', 'utf8');
const notice = '      {baData?.usedFallback && baData?.fallbackDate && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="text-xl">📅</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-700 mb-1">
                Showing data from {baData.fallbackDate}
              </div>
              <div className="text-xs text-amber-600">
                Today' + "'" + 's data is not yet available. Showing the most recent data from the database.
              </div>
            </div>
          </div>
        </div>
      )}

';
page = page.replace('      {baData?.dataQuality === "none" && (', notice + '      {baData?.dataQuality === "none" && (');
fs.writeFileSync('src/app/broker-analysis/page.tsx', page, 'utf8');
console.log('Updated page');
console.log('Done!');
