export function formatPrice(amountInSmallestUnit: number, currency: string): string {
  const amount = amountInSmallestUnit / 100
  if (currency.toLowerCase() === 'ron') {
    return `${amount} RON`
  }
  return new Intl.NumberFormat('en-EU', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount)
}

export function getCurrencyFromLocale(locale: string): 'ron' | 'eur' {
  return locale === 'ro' ? 'ron' : 'eur'
}
