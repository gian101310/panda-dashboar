export const INDICATOR_PRODUCTS = [
  {
    code: 'scoring_v3',
    name: 'Panda Directional Bias',
    priceLabel: '$500 USD',
    paymentLink: 'https://pay.ziina.com/PandaEngine/oSp8WkBfj?source=app',
  },
  {
    code: 'panda_full_v3',
    name: 'Panda VIP',
    priceLabel: '$1000 USD',
    paymentLink: 'https://pay.ziina.com/PandaEngine/_PQ1JalrB?source=app',
    fileName: 'panda-vip.ex4',
    downloadPath: '/downloads/panda-vip.ex4',
  },
  {
    code: 'ctrader_dashboard_overlay',
    name: 'Panda cTrader Dashboard Overlay',
    priceLabel: 'Admin approved',
    platform: 'CTRADER',
    adminOnly: true,
  },
];

export const PUBLIC_INDICATOR_PRODUCTS = INDICATOR_PRODUCTS.filter((product) => !product.adminOnly);

export function getIndicatorProduct(code) {
  return INDICATOR_PRODUCTS.find((product) => product.code === code) || null;
}
