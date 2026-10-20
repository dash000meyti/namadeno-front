/**
 * Installment-plan helpers for display before a server quote is available (the quote endpoint is the source of truth).
 * Mirrors the mock backend: fee grows with the term (store fee per 3 months), collateral = 50% of the financed part.
 */
export const planMonths = (maxMonths: number) => [3, 6, 10, 12].filter((m) => m <= maxMonths).slice(-3);

export function planMonthly(price: number, down: number, months: number, feePctPer3m: number) {
  const financed = Math.max(0, price - down);
  const fee = feePctPer3m * (months / 3);
  return Math.round((financed * (1 + fee / 100)) / months / 10000) * 10000;
}

/** Down-payment slider: 0 … 50% of the price in 12 steps (rounded to 100,000). */
export const downMax = (price: number) => Math.round(price / 2 / 100_000) * 100_000;
export const downStep = (price: number) => Math.max(100_000, Math.round(downMax(price) / 12 / 100_000) * 100_000);
export const defaultDown = (price: number) => Math.min(downMax(price), downStep(price) * 4);

export const collateralFor = (price: number, down: number) => Math.round(Math.max(0, price - down) / 2 / 1000) * 1000;
