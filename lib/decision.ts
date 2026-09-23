export type ModelInput = {
  amount: number | null;
  sharePrice: number | null;
  sharesMillions: number | null;
  discountPercent: number | null;
  grossDebtMillions: number | null;
};

export function financingModel(input: ModelInput) {
  const { amount, sharePrice, sharesMillions, discountPercent, grossDebtMillions } = input;
  const marketCap = sharePrice !== null && sharePrice > 0 && sharesMillions !== null && sharesMillions > 0 ? sharePrice * sharesMillions : null;
  const offerPrice = sharePrice !== null && sharePrice > 0 && discountPercent !== null && discountPercent >= 0 && discountPercent < 100
    ? sharePrice * (1 - discountPercent / 100) : null;
  const newShares = amount !== null && amount > 0 && offerPrice !== null && offerPrice > 0 ? amount / offerPrice : null;
  const dilution = newShares !== null && sharesMillions !== null && sharesMillions > 0 ? 100 * newShares / (sharesMillions + newShares) : null;
  const sizeToMarketCap = marketCap !== null && amount !== null && amount > 0 ? 100 * amount / marketCap : null;
  const debtToCapital = marketCap !== null && grossDebtMillions !== null && grossDebtMillions >= 0
    ? 100 * grossDebtMillions / (marketCap + grossDebtMillions) : null;
  const debtAfterBorrowing = marketCap !== null && grossDebtMillions !== null && grossDebtMillions >= 0 && amount !== null && amount > 0
    ? 100 * (grossDebtMillions + amount) / (marketCap + grossDebtMillions + amount) : null;
  return { marketCap, offerPrice, newShares, dilution, sizeToMarketCap, debtToCapital, debtAfterBorrowing };
}
