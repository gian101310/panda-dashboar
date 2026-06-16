export const INDICATOR_PRODUCTS = [
  {
    code: 'scoring_v3',
    name: 'Scoring v3',
    priceLabel: 'Manual price',
    fileName: 'scoring-v3.ex4',
    downloadPath: '/downloads/scoring-v3.ex4',
  },
  {
    code: 'panda_full_v3',
    name: 'Panda Full v3 Indicator',
    priceLabel: 'Manual price',
    fileName: 'panda-full-v3-indicator.ex4',
    downloadPath: '/downloads/panda-full-v3-indicator.ex4',
  },
];

export function getIndicatorProduct(code) {
  return INDICATOR_PRODUCTS.find((product) => product.code === code) || null;
}
