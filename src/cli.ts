import { scrapeAll } from "./scrape.js";

function pct(x: number | null, digits = 2): string {
  if (x == null) return "-";
  return (x * 100).toFixed(digits) + "%";
}
function num(x: number | null, digits = 2): string {
  if (x == null) return "-";
  return x.toFixed(digits);
}
function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

async function main() {
  const res = await scrapeAll();
  console.error(
    `Scraped ${res.listing.length} bonds @ ${res.generatedAt} (${res.errors.length} errors)`
  );
  console.log(
    [
      pad("Ticker", 10),
      pad("Maturity", 11),
      pad("Yrs", 6),
      pad("Cpn", 7),
      pad("Bid", 9),
      pad("Ask", 9),
      pad("AskVol", 8),
      pad("Last", 9),
      pad("Accrued", 9),
      pad("YTM ask", 9),
      pad("YTM bid", 9),
      pad("YTM last", 9),
      pad("BVB YTM", 9),
    ].join(" ")
  );
  for (const a of res.analytics) {
    console.log(
      [
        pad(a.ticker, 10),
        pad(a.maturity, 11),
        pad(num(a.yearsToMaturity, 2), 6),
        pad(num(a.couponPct, 2), 7),
        pad(num(a.bid, 4), 9),
        pad(num(a.ask, 4), 9),
        pad(num(a.askVol, 0), 8),
        pad(num(a.lastPrice, 4), 9),
        pad(num(a.accrued, 3), 9),
        pad(pct(a.ytmAtAsk, 3), 9),
        pad(pct(a.ytmAtBid, 3), 9),
        pad(pct(a.ytmAtLast, 3), 9),
        pad(pct(a.bvbYtm, 3), 9),
      ].join(" ")
    );
  }
  if (res.errors.length) {
    console.error("\nErrors:");
    for (const e of res.errors) console.error(`  ${e.ticker}: ${e.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
