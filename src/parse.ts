import * as cheerio from "cheerio";
import type { ListingRow, BondDetail } from "./types.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// "101,0000" -> 101.0000  ; "-0,20" -> -0.20  ; "" / "-" -> null
export function parseRoNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = raw.replace(/\s| /g, "").trim();
  if (!s || s === "-") return null;
  // RO uses "." as thousands and "," as decimal
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// "dd.MM.yyyy" -> "yyyy-MM-dd"; tolerates trailing " HH:mm"
export function parseRoDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function fetchListing(): Promise<string> {
  return fetch("https://m.bvb.ro/FinancialInstruments/Markets/Bonds", {
    headers: { "user-agent": UA },
  }).then((r) => {
    if (!r.ok) throw new Error(`Listing HTTP ${r.status}`);
    return r.text();
  });
}

export function parseListing(html: string): ListingRow[] {
  const $ = cheerio.load(html);
  const rows: ListingRow[] = [];
  $("table#gv tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 9) return;
    const tickerLink = $(tds[0]).find("a").first();
    const tickerHref = tickerLink.attr("href") || "";
    const tickerMatch = tickerHref.match(/[?&]s=([^&]+)/);
    const ticker = tickerMatch ? tickerMatch[1] : tickerLink.text().trim();
    const isin = $(tds[0]).find("p").text().trim();
    rows.push({
      ticker,
      isin,
      issuer: $(tds[1]).text().trim().replace(/\s+/g, " "),
      lastPrice: parseRoNumber($(tds[2]).text()),
      changePct: parseRoNumber($(tds[3]).text()),
      lastTradeAt: $(tds[4]).text().trim() || null,
      couponPct: parseRoNumber($(tds[5]).text()),
      currency: $(tds[6]).text().trim(),
      maturity: $(tds[7]).text().trim(),
      category: $(tds[8]).text().trim(),
    });
  });
  return rows;
}

export function fetchDetail(ticker: string): Promise<string> {
  const url = `https://m.bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=${encodeURIComponent(
    ticker
  )}`;
  return fetch(url, { headers: { "user-agent": UA } }).then((r) => {
    if (!r.ok) throw new Error(`Detail ${ticker} HTTP ${r.status}`);
    return r.text();
  });
}

// Helpers to find a value in the Sumar table given the label-cell text.
function nextValueText(
  $: cheerio.CheerioAPI,
  labelRegex: RegExp
): string | null {
  let value: string | null = null;
  $("td").each((_, td) => {
    if (value !== null) return;
    const t = $(td).text().replace(/\s+/g, " ").trim();
    if (labelRegex.test(t)) {
      const next = $(td).next("td");
      if (next.length) {
        value = next.text().replace(/\s+/g, " ").trim();
      }
    }
  });
  return value;
}

// "100,7900 / 101,0000" -> [100.79, 101.00]
function splitPair(raw: string | null): [number | null, number | null] {
  if (!raw) return [null, null];
  const parts = raw.split("/");
  if (parts.length < 2) return [null, null];
  return [parseRoNumber(parts[0]), parseRoNumber(parts[1])];
}

// "7,34%" -> 7.34
function parsePct(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace("%", "").trim();
  return parseRoNumber(cleaned);
}

export function parseDetail(html: string, ticker: string): BondDetail {
  const $ = cheerio.load(html);

  // Header: "R2706B / ROFIH9DER1W7"
  let isin = "";
  const headerCell = $("td.pLeft15.date").filter((_, el) =>
    /\/\s*RO[A-Z0-9]+/.test($(el).text())
  );
  if (headerCell.length) {
    const m = headerCell.first().text().match(/\/\s*([A-Z0-9]+)/);
    if (m) isin = m[1];
  }
  // Header: "Principal / Titluri de stat"
  let segment = "";
  let category = "";
  const segCell = $("td.pLeft15.date").filter((_, el) =>
    /Principal|SMT|MTS/.test($(el).text())
  );
  if (segCell.length) {
    const parts = segCell.first().text().split("/").map((s) => s.trim());
    segment = parts[0] || "";
    category = parts[1] || "";
  }
  const status =
    $("#ctl00_body_HeaderControl_lbStare").text().trim() || "";

  const bidAskRaw = nextValueText($, /^Bid\s*\/\s*Ask$/i);
  const bidAskVolRaw = nextValueText($, /^Bid\s*\/\s*Ask Vol\./i);
  const [bid, ask] = splitPair(bidAskRaw);
  const [bidVol, askVol] = splitPair(bidAskVolRaw);

  const refPrice = parseRoNumber(nextValueText($, /^Pret referinta$/i));
  const lastPrice = parseRoNumber(nextValueText($, /^Ultimul pret$/i));
  const changePct = parseRoNumber(nextValueText($, /^Var \(%\)$/i));
  const high52w = parseRoNumber(nextValueText($, /^Max\. 52 saptamani$/i));
  const low52w = parseRoNumber(nextValueText($, /^Min\. 52 saptamani$/i));

  const couponPct = parsePct(nextValueText($, /^Cupon curent$/i));
  const bvbYtmPct = parsePct(nextValueText($, /^Randament \(YTM\)\*?$/i));
  const nominal = parseRoNumber(nextValueText($, /^Valoare Nominala$/i));
  const issueValue = parseRoNumber(nextValueText($, /^Valoare emisiune$/i));
  const tradingStart = parseRoDate(
    nextValueText($, /^Data start tranzactionare$/i)
  );
  const maturity = parseRoDate(nextValueText($, /^Data maturitatii$/i));
  const currency = nextValueText($, /^Moneda de emisiune$/i);

  let prospectusUrl: string | null = null;
  const prospLink = $("td.prospectus a").first();
  if (prospLink.length) {
    const href = prospLink.attr("href") || "";
    prospectusUrl = href.startsWith("http")
      ? href
      : `https://m.bvb.ro${href.startsWith("/") ? "" : "/"}${href}`;
  }

  return {
    ticker,
    isin,
    segment,
    category,
    status,
    bid,
    ask,
    bidVol,
    askVol,
    refPrice,
    lastPrice,
    changePct,
    high52w,
    low52w,
    couponPct,
    bvbYtmPct,
    nominal,
    issueValue,
    tradingStart,
    maturity,
    currency,
    prospectusUrl,
  };
}
