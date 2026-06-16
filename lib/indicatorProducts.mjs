export const INDICATOR_PRODUCTS = [
  {
    code: 'scoring_v3',
    name: 'Scoring',
    priceLabel: '$500 USD',
    fileName: 'scoring.ex4',
    downloadPath: '/downloads/scoring.ex4',
  },
  {
    code: 'panda_full_v3',
    name: 'Panda VIP',
    priceLabel: '$1000 USD',
    fileName: 'panda-vip.ex4',
    downloadPath: '/downloads/panda-vip.ex4',
  },
];

export function getIndicatorProduct(code) {
  return INDICATOR_PRODUCTS.find((product) => product.code === code) || null;
}
