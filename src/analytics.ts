import type { BondDetail, BondAnalytics } from "./types.js";
import {
  accruedInterest,
  buildSchedule,
  cashFlows,
  solveYtm,
} from "./ytm.js";

function isoToDate(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function analyze(
  detail: BondDetail,
  now: Date = new Date()
): BondAnalytics | null {
  const maturity = isoToDate(detail.maturity);
  const tradingStart = isoToDate(detail.tradingStart);
  if (
    !maturity ||
    detail.couponPct == null ||
    detail.nominal == null ||
    detail.currency == null
  ) {
    return null;
  }
  const schedule = buildSchedule(now, maturity, tradingStart);
  const accrued = accruedInterest(now, schedule, detail.couponPct);
  const cfs = cashFlows(now, schedule, detail.couponPct);

  const ytmOf = (clean: number | null): number | null => {
    if (clean == null || clean <= 0) return null;
    const dirty = clean + accrued;
    return solveYtm(dirty, cfs);
  };

  const ytmAtAsk = ytmOf(detail.ask);
  const ytmAtBid = ytmOf(detail.bid);
  const ytmAtLast = ytmOf(detail.lastPrice);

  const years =
    cfs.length > 0 ? cfs[cfs.length - 1].years : 0;

  return {
    ticker: detail.ticker,
    isin: detail.isin,
    maturity: detail.maturity ?? "",
    yearsToMaturity: years,
    couponPct: detail.couponPct,
    nominal: detail.nominal,
    currency: detail.currency,
    bid: detail.bid,
    ask: detail.ask,
    lastPrice: detail.lastPrice,
    bidVol: detail.bidVol,
    askVol: detail.askVol,
    accrued,
    ytmAtBid,
    ytmAtAsk,
    ytmAtLast,
    bvbYtm: detail.bvbYtmPct != null ? detail.bvbYtmPct / 100 : null,
    dirtyAsk: detail.ask != null ? detail.ask + accrued : null,
    dirtyBid: detail.bid != null ? detail.bid + accrued : null,
    dirtyLast:
      detail.lastPrice != null ? detail.lastPrice + accrued : null,
  };
}
