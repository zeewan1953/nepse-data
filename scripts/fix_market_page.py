from pathlib import Path

path = Path("src/app/market/page.tsx")
text = path.read_text(encoding="utf-8")
old = '''            {rows.map((r) => {
              const symbolLabel = r.symbol.replace(/\d+/g, "");
              return (
                <tr
                  key={r.symbol}
                  className="border-t border-border hover:bg-surface-2"
                >
                  <td className="px-3 py-2 font-bold">
                    <Link href={`/stock/${r.symbol}`} className="text-primary hover:underline">
                      {symbolLabel}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-muted">
                    {r.securityName}
                  </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {npr(r.lastTradedPrice)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${changeClass(
                    r.percentageChange,
                  )}`}
                >
                  {pct(r.percentageChange)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">{npr(r.openPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-up">{npr(r.highPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-down">{npr(r.lowPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(r.totalTradeQuantity)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{compact(r.totalTradeValue)}</td>
              </tr>
            }))}
'''
new = '''            {rows.map((r) => {
              const symbolLabel = r.symbol.replace(/\d+/g, "");
              return (
                <tr
                  key={r.symbol}
                  className="border-t border-border hover:bg-surface-2"
                >
                  <td className="px-3 py-2 font-bold">
                    <Link href={`/stock/${r.symbol}`} className="text-primary hover:underline">
                      {symbolLabel}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-muted">
                    {r.securityName}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {npr(r.lastTradedPrice)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${changeClass(
                      r.percentageChange,
                    )}`}
                  >
                    {pct(r.percentageChange)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{npr(r.openPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-up">{npr(r.highPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-down">{npr(r.lowPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(r.totalTradeQuantity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{compact(r.totalTradeValue)}</td>
                </tr>
              );
            })}
'''
if old not in text:
    raise ValueError('old block not found')
path.write_text(text.replace(old, new), encoding="utf-8")
print('patched')
