export const CTRADER_OVERLAY_PRODUCT_CODE = 'ctrader_dashboard_overlay';
export const CTRADER_TRADE_PLAN_V13_PRODUCT_CODE = 'ctrader_trade_plan_v13';
export const MT4_OVERLAY_PRODUCT_CODE = 'mt4_dashboard_overlay';
export const MT5_OVERLAY_PRODUCT_CODE = 'mt5_dashboard_overlay';
export const CTRADER_PANDA_LEVELS_PRODUCT_CODE = 'ctrader_panda_levels_v2';
export const MT5_PANDA_LEVELS_PRODUCT_CODE = 'mt5_panda_levels_v1';
export const MT5_PANDA_LEVELS_VIP_PRODUCT_CODE = 'mt5_panda_levels_vip';

export function isMt5OfflineLevelsProduct(code) {
  return code === MT5_PANDA_LEVELS_PRODUCT_CODE || code === MT5_PANDA_LEVELS_VIP_PRODUCT_CODE;
}

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
    name: 'Panda cTrader Scoring Dashboard',
    priceLabel: 'Activation by approval',
    platform: 'CTRADER',
    adminOnly: true,
    requestable: true,
    publicDownload: true,
    fileName: 'panda-scoring-dashboard-ctrader-licensed.algo',
    downloadPath: '/downloads/panda-scoring-dashboard-ctrader-licensed.algo',
    installNote: 'Import the licensed .algo file in cTrader, then attach it to a supported chart. This build shows the attached pair score and bias.',
  },
  {
    code: CTRADER_TRADE_PLAN_V13_PRODUCT_CODE,
    name: 'Panda Trade Plan v1.3',
    priceLabel: 'Activation by approval',
    platform: 'CTRADER',
    adminOnly: true,
    requestable: false,
  },
  {
    code: CTRADER_PANDA_LEVELS_PRODUCT_CODE,
    name: 'Panda Levels V2 for cTrader',
    priceLabel: 'Activation by approval',
    platform: 'CTRADER',
    adminOnly: true,
    requestable: false,
  },
  {
    code: MT5_PANDA_LEVELS_PRODUCT_CODE,
    name: 'Panda Levels for MT5',
    priceLabel: 'Activation by approval',
    platform: 'MT5',
    adminOnly: true,
    requestable: false,
  },
  {
    code: MT5_PANDA_LEVELS_VIP_PRODUCT_CODE,
    name: 'Panda Level MT5 VIP',
    priceLabel: 'Activation by approval',
    platform: 'MT5',
    adminOnly: true,
    requestable: false,
  },
  {
    code: MT4_OVERLAY_PRODUCT_CODE,
    name: 'Panda MT4 Dashboard Overlay',
    priceLabel: 'Activation by approval',
    platform: 'MT4',
    adminOnly: true,
    requestable: true,
    publicDownload: true,
    fileName: 'panda-dashboard-overlay-mt4-licensed.zip',
    downloadPath: '/downloads/panda-dashboard-overlay-mt4-licensed.zip',
    installNote: 'Unzip, copy the overlay .ex4 into MQL4/Indicators and the feed EA .ex4 into MQL4/Experts, allow WebRequest for https://pandaengine.app, then attach the feed EA to one chart and the overlay to any charts. Full steps inside the package.',
  },
  {
    code: MT5_OVERLAY_PRODUCT_CODE,
    name: 'Panda MT5 Scoring Dashboard',
    priceLabel: 'Activation by approval',
    platform: 'MT5',
    adminOnly: true,
    requestable: true,
    publicDownload: true,
    fileName: 'panda-scoring-dashboard-mt5-licensed.zip',
    downloadPath: '/downloads/panda-scoring-dashboard-mt5-licensed.zip',
    installNote: 'Unzip, copy the scoring dashboard .ex5 into MQL5/Indicators and the licensed feed EA .ex5 into MQL5/Experts. Allow WebRequest for https://pandaengine.app, then attach the feed EA to one forex chart and the dashboard to any chart. Full steps inside the package.',
  },
  {
    code: 'panda_pro',
    name: 'Panda Pro',
    priceLabel: 'Contact for pricing',
  },
];

export const PUBLIC_INDICATOR_PRODUCTS = INDICATOR_PRODUCTS.filter((product) => !product.adminOnly);
export const PUBLIC_DOWNLOAD_PRODUCTS = INDICATOR_PRODUCTS.filter(
  (product) => product.publicDownload === true && product.downloadPath,
);

export function getIndicatorProduct(code) {
  return INDICATOR_PRODUCTS.find((product) => product.code === code) || null;
}
