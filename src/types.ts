export interface ListingRow {
  ticker: string;
  isin: string;
  issuer: string;
  lastPrice: number | null;
  changePct: number | null;
  lastTradeAt: string | null;
  couponPct: number | null;
  currency: string;
  maturity: string; // dd.MM.yyyy
  category: string;
}

export interface BondDetail {
  ticker: string;
  isin: string;
  segment: string;
  category: string;
  status: string;
  bid: number | null;
  ask: number | null;
  bidVol: number | null;
  askVol: number | null;
  refPrice: number | null;
  lastPrice: number | null;
  changePct: number | null;
  high52w: number | null;
  low52w: number | null;
  couponPct: number | null;
  bvbYtmPct: number | null; // displayed YTM (based on last price)
  nominal: number | null;
  issueValue: number | null;
  tradingStart: string | null; // dd.MM.yyyy
  maturity: string | null; // dd.MM.yyyy
  currency: string | null;
  prospectusUrl: string | null;
}

export interface BondAnalytics {
  ticker: string;
  isin: string;
  maturity: string; // ISO yyyy-mm-dd
  yearsToMaturity: number;
  couponPct: number;
  nominal: number;
  currency: string;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  bidVol: number | null;
  askVol: number | null;
  accrued: number; // accrued interest per 100 nominal
  ytmAtBid: number | null; // as fraction (e.g. 0.0734)
  ytmAtAsk: number | null;
  ytmAtLast: number | null;
  bvbYtm: number | null; // as fraction
  dirtyAsk: number | null;
  dirtyBid: number | null;
  dirtyLast: number | null;
  // Future cashflows per 100 nominal, ACT/365 years from `generatedAt`.
  // Exposed so the frontend can invert the pricing equation in O(n_cfs) to
  // answer "what clean price gives me YTM y?" without round-tripping to the
  // server: clean = sum(amount / (1+y)^years) - accrued.
  cashflows: { years: number; amount: number }[];
}
