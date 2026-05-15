// Bond analytics. Assumes annual coupons (the convention for Romanian
// retail "Fidelis" RON govies). Day-count ACT/365. Everything is normalized
// to "per 100 nominal" so the math is independent of the issue's face value
// (R-series nominal=100, B-series nominal=5000 — prices are always quoted as
// % of par, so we work in % of par throughout).
//
// Conventions:
//  - prices are clean, expressed as % of par (e.g. 101.00 means 101% of nominal)
//  - couponPct is annual %, e.g. 8.35 means 8.35% of nominal per year
//  - per-100 coupon cashflow = couponPct  (e.g. 8.35 per coupon)
//  - per-100 redemption = 100
//  - cashflows occur on each anniversary date of maturity (going back from
//    maturity) that falls strictly after `today`, plus +100 at maturity
//  - dirty = clean + accrued (both per 100 nominal)
//  - accrued = couponPct * (today - prevCoupon) / (nextCoupon - prevCoupon)
//  - YTM y solves: dirty = sum_i CF_i / (1+y)^t_i, where t_i is in years (ACT/365)

const MS_PER_DAY = 86_400_000;

function startOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function yearsBetween(a: Date, b: Date): number {
  return daysBetween(a, b) / 365;
}

// Move date back/forward by whole years preserving month+day. Handles Feb 29
// by clamping to Feb 28 in non-leap years.
function shiftYears(d: Date, years: number): Date {
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  let day = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (day > daysInMonth) day = daysInMonth;
  return new Date(Date.UTC(y, m, day));
}

export interface CouponSchedule {
  previousCouponDate: Date; // last coupon paid (or trading start if before first coupon)
  nextCouponDate: Date; // next coupon to be paid (>= today, strictly after previous)
  futureCoupons: Date[]; // all coupon dates > today, inclusive of nextCouponDate, ending at maturity
}

// Build the schedule going backwards from maturity in 1-year steps.
// If `tradingStart` is provided and the most-recent prior coupon falls before
// tradingStart, we treat tradingStart as the "previous coupon" anchor
// (i.e. accrual since issue).
export function buildSchedule(
  today: Date,
  maturity: Date,
  tradingStart: Date | null
): CouponSchedule {
  const t = startOfDayUTC(today);
  const m = startOfDayUTC(maturity);

  const allCoupons: Date[] = [];
  let cur = m;
  // Walk back from maturity in 1y steps until before "today" or before issue.
  while (cur.getTime() > t.getTime()) {
    allCoupons.push(cur);
    cur = shiftYears(cur, -1);
  }
  // `cur` is now the most-recent anniversary date <= today (or maturity itself
  // if maturity == today). It might predate the issue.
  let previousCouponDate: Date;
  if (tradingStart && cur.getTime() < startOfDayUTC(tradingStart).getTime()) {
    previousCouponDate = startOfDayUTC(tradingStart);
  } else {
    previousCouponDate = cur;
  }

  allCoupons.reverse(); // ascending
  const nextCouponDate = allCoupons[0] ?? m;
  return { previousCouponDate, nextCouponDate, futureCoupons: allCoupons };
}

// Accrued per 100 nominal.
export function accruedInterest(
  today: Date,
  schedule: CouponSchedule,
  couponPct: number
): number {
  const periodDays = daysBetween(
    schedule.previousCouponDate,
    schedule.nextCouponDate
  );
  if (periodDays <= 0) return 0;
  const elapsed = daysBetween(schedule.previousCouponDate, startOfDayUTC(today));
  const clamped = Math.max(0, Math.min(periodDays, elapsed));
  return (couponPct * clamped) / periodDays;
}

export interface CashFlow {
  date: Date;
  amount: number; // per 100 nominal
  years: number; // from today, ACT/365
}

// Cashflows per 100 nominal: couponPct on each future anniversary, +100 at maturity.
export function cashFlows(
  today: Date,
  schedule: CouponSchedule,
  couponPct: number
): CashFlow[] {
  const t = startOfDayUTC(today);
  return schedule.futureCoupons.map((d, i, arr) => {
    const isLast = i === arr.length - 1;
    return {
      date: d,
      amount: isLast ? couponPct + 100 : couponPct,
      years: yearsBetween(t, d),
    };
  });
}

// Solve dirty = sum CF_i / (1+y)^t_i  for y, via bisection.
// Returns y as a fraction (0.0734 == 7.34%). Returns null if it doesn't bracket.
export function solveYtm(dirty: number, cfs: CashFlow[]): number | null {
  if (!cfs.length || dirty <= 0) return null;
  const f = (y: number) =>
    cfs.reduce((s, cf) => s + cf.amount / Math.pow(1 + y, cf.years), 0) - dirty;

  // Bracket [-0.5, 1.5] — generous enough for any sane bond.
  let lo = -0.5;
  let hi = 1.5;
  let flo = f(lo);
  let fhi = f(hi);
  if (Number.isNaN(flo) || Number.isNaN(fhi)) return null;
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-10 || hi - lo < 1e-10) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}
