import {
  fetchListing,
  parseListing,
  fetchDetail,
  parseDetail,
} from "./parse.js";
import { analyze } from "./analytics.js";
import type { BondAnalytics, BondDetail, ListingRow } from "./types.js";

export interface ScrapeResult {
  generatedAt: string;
  listing: ListingRow[]; // filtered (RON + Titluri de stat)
  details: BondDetail[];
  analytics: BondAnalytics[]; // sorted by ytmAtAsk desc, then ytmAtLast desc
  errors: { ticker: string; error: string }[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pMapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export interface ScrapeOptions {
  concurrency?: number;
  delayMs?: number;
  filter?: {
    currency?: string;
    category?: string;
  };
}

export async function scrapeAll(
  opts: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const concurrency = opts.concurrency ?? 4;
  const delayMs = opts.delayMs ?? 100;
  const wantCurrency = opts.filter?.currency ?? "RON";
  const wantCategory = opts.filter?.category ?? "Titluri de stat";

  const listingHtml = await fetchListing();
  const allRows = parseListing(listingHtml);
  const listing = allRows.filter(
    (r) => r.currency === wantCurrency && r.category === wantCategory
  );

  const errors: ScrapeResult["errors"] = [];
  const details = await pMapLimit(listing, concurrency, async (row) => {
    try {
      if (delayMs) await sleep(Math.random() * delayMs);
      const html = await fetchDetail(row.ticker);
      return parseDetail(html, row.ticker);
    } catch (e) {
      errors.push({
        ticker: row.ticker,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  });

  const validDetails = details.filter((d): d is BondDetail => d != null);

  const now = new Date();
  const analytics = validDetails
    .map((d) => analyze(d, now))
    .filter((a): a is BondAnalytics => a != null)
    .sort((a, b) => {
      const av = a.ytmAtAsk ?? a.ytmAtLast ?? -Infinity;
      const bv = b.ytmAtAsk ?? b.ytmAtLast ?? -Infinity;
      return bv - av;
    });

  return {
    generatedAt: now.toISOString(),
    listing,
    details: validDetails,
    analytics,
    errors,
  };
}
