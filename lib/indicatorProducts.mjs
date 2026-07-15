export const CTRADER_OVERLAY_PRODUCT_CODE = 'ctrader_dashboard_overlay';
export const MT4_OVERLAY_PRODUCT_CODE = 'mt4_dashboard_overlay';
export const MT5_OVERLAY_PRODUCT_CODE = 'mt5_dashboard_overlay';

export const INDICATOR_PRODUCTS = [
  {
    code: 'scoring_v3',
    name: 'Panda Directional Bias',
    priceLabel: '$500 USD',
    paymentLink: 'https://pay.ziina.com/PandaEngine/oSp8WkBfj?source=app',
    requestable: true,
  },
  {
    code: 'panda_full_v3',
    name: 'Panda VIP',
    priceLabel: '$1000 USD',
    paymentLink: 'https://pay.ziina.com/PandaEngine/_PQ1JalrB?source=app',
    fileName: 'panda-vip.ex4',
    downloadPath: '/downloads/panda-vip.ex4',
    requestable: true,
  },
  {
    code: CTRADER_OVERLAY_PRODUCT_CODE,
    name: 'Panda cTrader Dashboard Overlay',
    priceLabel: 'Activation by approval',
    platform: 'CTRADER',
    adminOnly: true,
    requestable: true,
    publicDownload: true,
    fileName: 'panda-dashboard-overlay-ctrader-licensed.algo',
    downloadPath: '/downloads/panda-dashboard-overlay-ctrader-licensed.algo',
    installNote: 'Import the .algo file in cTrader, then attach it to a supported chart.',
  },
  {
    code: MT4_OVERLAY_PRODUCT_CODE,
    name: 'Panda MT4 Dashboard Overlay',
    priceLabel: 'Activation by approval',
    platform: 'MT4',
    adminOnly: true,
    requestable: true,
    publicDownload: true,
    fileName: 'panda-dashboard-overlay-mt4-licensed.ex4',
    downloadPath: '/downloads/panda-dashboard-overlay-mt4-licensed.ex4',
    installNote: 'Copy the .ex4 file into MQL4/Indicators and allow WebRequest for https://pandaengine.app.',
  },
  {
    code: MT5_OVERLAY_PRODUCT_CODE,
    name: 'Panda MT5 Dashboard Overlay',
    priceLabel: 'Activation by approval',
    platform: 'MT5',
    adminOnly: true,
    requestable: true,
    publicDownload: true,
    fileName: 'panda-dashboard-overlay-mt5-licensed.ex5',
    downloadPath: '/downloads/panda-dashboard-overlay-mt5-licensed.ex5',
    installNote: 'Copy the .ex5 file into MQL5/Indicators and allow WebRequest for https://pandaengine.app.',
  },
];

export const PUBLIC_INDICATOR_PRODUCTS = INDICATOR_PRODUCTS.filter((product) => !product.adminOnly);
export const PUBLIC_DOWNLOAD_PRODUCTS = INDICATOR_PRODUCTS.filter(
  (product) => product.publicDownload === true && product.downloadPath,
);

export function getIndicatorProduct(code) {
  return INDICATOR_PRODUCTS.find((product) => product.code === code) || null;
}
