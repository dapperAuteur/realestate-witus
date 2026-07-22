/** GHS 500.00 from 50000 pesewas; falls back gracefully for any ISO currency. */
export function formatMoneyMinor(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(amountMinor / 100);
  } catch {
    // Unknown currency code in data — show something rather than crash.
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}
