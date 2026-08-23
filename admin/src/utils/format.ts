const lydFormatter = new Intl.NumberFormat("ar-LY", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function formatMoney(amount: string | number): string {
  return lydFormatter.format(Number(amount));
}
