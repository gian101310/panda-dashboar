//+------------------------------------------------------------------+
//|                                  PandaST_EA_MT5_SignalOnly.mq5    |
//|   Trades ONLY the SuperTrend signal from "Panda Lines v4.1 MT5". |
//|   No Panda bias filter — pure ST flip entries.                  |
//|                                                                  |
//|   Logic:                                                         |
//|     - Reads the indicator via iCustom (buffers 0=STBullish,      |
//|       1=STBearish). BUY = ST flips bearish->bullish,            |
//|       SELL = ST flips bullish->bearish (the lime/red arrows).   |
//|     - Exit on the opposite ST signal + protective ATR stop.      |
//|     - Position size: fixed lots OR % risk per trade (toggle).    |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

//==================== INDICATOR (must match your chart) =============
input string  InpIndicatorName  = "Panda Lines v4.1 MT5"; // Indicator file name (in MQL5\Indicators)
input int     InpST_Period      = 10;     // ST_Period (match the indicator)
input double  InpST_Multiplier  = 3.0;    // ST_Multiplier (match the indicator)
input bool    InpST_UseATR      = true;   // ST_UseATR (match the indicator)
input bool    InpST_ShowSignals = true;   // ST_ShowSignals (match the indicator)

//==================== EXIT / RISK =================================
input int     InpATR_Period      = 14;    // ATR period for the protective stop
input double  InpATR_SL_Mult      = 2.0;  // Stop loss = ATR * this
input double  InpATR_TP_Mult      = 0.0;  // Take profit = ATR * this (0 = none, exit on opposite signal)
input bool    InpCloseOnOpposite  = true; // Close position when opposite ST signal fires

//==================== POSITION SIZING =============================
input bool    InpUsePercentRisk  = true;  // true = % risk per trade, false = fixed lots
input double  InpRiskPercent     = 1.0;   // Risk % of balance per trade (when % risk)
input double  InpFixedLots       = 0.10;  // Fixed lot size (when fixed)

//==================== GENERAL =====================================
input long    InpMagic           = 990042;// Magic number (different from the bias version)
input int     InpSlippage        = 30;    // Max slippage (points)
input bool    InpAllowReverse    = true;  // Reverse straight into opposite trade on a flip

//==================== GLOBALS =====================================
CTrade   trade;
int      hST   = INVALID_HANDLE;   // iCustom handle
int      hATR  = INVALID_HANDLE;   // ATR handle
datetime g_lastBar = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFillingBySymbol(_Symbol);

   // iCustom: pass ONLY the first four inputs (the SuperTrend block);
   // every later input keeps the indicator's own default.
   hST = iCustom(_Symbol, _Period, InpIndicatorName,
                 InpST_Period, InpST_Multiplier, InpST_UseATR, InpST_ShowSignals);
   if(hST == INVALID_HANDLE)
   {
      Print("ERROR: could not create iCustom handle for '", InpIndicatorName,
            "'. Make sure the indicator is compiled in MQL5\\Indicators.");
      return(INIT_FAILED);
   }

   hATR = iATR(_Symbol, _Period, InpATR_Period);
   if(hATR == INVALID_HANDLE)
   {
      Print("ERROR: could not create ATR handle.");
      return(INIT_FAILED);
   }

   Print("PandaST_EA_MT5_SignalOnly started on ", _Symbol, " ", EnumToString((ENUM_TIMEFRAMES)_Period));
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(hST  != INVALID_HANDLE) IndicatorRelease(hST);
   if(hATR != INVALID_HANDLE) IndicatorRelease(hATR);
}

//+------------------------------------------------------------------+
//| Is a SuperTrend buffer value "set" (not empty / valid price)?    |
//+------------------------------------------------------------------+
bool IsSet(const double v)
{
   return(v != EMPTY_VALUE && v != 0.0 && MathAbs(v) < 1.0e90);
}

//+------------------------------------------------------------------+
//| SuperTrend signal off the last CLOSED bar (shift 1).             |
//|   buy  = trend flipped bearish -> bullish at shift 1            |
//|   sell = trend flipped bullish -> bearish at shift 1           |
//| Uses plot buffers 0 (STBullish) & 1 (STBearish). On a flip the  |
//| indicator back-fills the previous bar's opposite buffer, so the |
//| old side is still "set" at shift 2.                             |
//+------------------------------------------------------------------+
bool GetSignal(bool &buy, bool &sell)
{
   buy = false; sell = false;

   double bull[], bear[];
   ArraySetAsSeries(bull, true);
   ArraySetAsSeries(bear, true);

   if(CopyBuffer(hST, 0, 1, 2, bull) < 2) return(false);
   if(CopyBuffer(hST, 1, 1, 2, bear) < 2) return(false);

   bool bull1 = IsSet(bull[0]);
   bool bear1 = IsSet(bear[0]);
   bool bull2 = IsSet(bull[1]);
   bool bear2 = IsSet(bear[1]);

   if(bull1 && !bear1 && bear2) buy  = true;
   if(bear1 && !bull1 && bull2) sell = true;
   return(true);
}

//+------------------------------------------------------------------+
double GetATR()
{
   double a[];
   ArraySetAsSeries(a, true);
   if(CopyBuffer(hATR, 0, 1, 1, a) < 1) return(0.0);
   return(a[0]);
}

//+------------------------------------------------------------------+
double CalcLots(const double stopDistPrice)
{
   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   double lots = InpFixedLots;

   if(InpUsePercentRisk && stopDistPrice > 0.0)
   {
      double tickVal  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      if(tickSize > 0.0 && tickVal > 0.0)
      {
         double riskMoney   = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
         double lossPerLot  = (stopDistPrice / tickSize) * tickVal;
         if(lossPerLot > 0.0) lots = riskMoney / lossPerLot;
      }
   }

   if(lotStep > 0.0) lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(minLot, MathMin(maxLot, lots));
   return(lots);
}

//+------------------------------------------------------------------+
//| Current position for this EA. dir: +1 buy, -1 sell, 0 none       |
//+------------------------------------------------------------------+
bool HasPosition(int &dir)
{
   dir = 0;
   if(!PositionSelect(_Symbol)) return(false);
   if(PositionGetInteger(POSITION_MAGIC) != InpMagic) return(false);
   long type = PositionGetInteger(POSITION_TYPE);
   dir = (type == POSITION_TYPE_BUY) ? 1 : -1;
   return(true);
}

//+------------------------------------------------------------------+
void OpenTrade(const bool isBuy)
{
   double atr = GetATR();
   if(atr <= 0.0){ Print("ATR unavailable, skip entry."); return; }

   double stopDist = atr * InpATR_SL_Mult;
   double tpDist   = (InpATR_TP_Mult > 0.0) ? atr * InpATR_TP_Mult : 0.0;
   double lots     = CalcLots(stopDist);
   if(lots <= 0.0){ Print("Lot size 0, skip."); return; }

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   int    dig = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   double price, sl, tp;
   if(isBuy)
   {
      price = ask;
      sl    = NormalizeDouble(price - stopDist, dig);
      tp    = (tpDist > 0.0) ? NormalizeDouble(price + tpDist, dig) : 0.0;
      if(!trade.Buy(lots, _Symbol, price, sl, tp, "PandaST-SO buy"))
         Print("Buy failed: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   }
   else
   {
      price = bid;
      sl    = NormalizeDouble(price + stopDist, dig);
      tp    = (tpDist > 0.0) ? NormalizeDouble(price - tpDist, dig) : 0.0;
      if(!trade.Sell(lots, _Symbol, price, sl, tp, "PandaST-SO sell"))
         Print("Sell failed: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   }
}

//+------------------------------------------------------------------+
void OnTick()
{
   datetime t = iTime(_Symbol, _Period, 0);
   if(t == g_lastBar) return;
   g_lastBar = t;

   bool buy, sell;
   if(!GetSignal(buy, sell)) return;
   if(!buy && !sell) return;

   int dir;
   bool inTrade = HasPosition(dir);

   // ---- Exit on opposite signal ----
   if(InpCloseOnOpposite && inTrade)
   {
      if((dir == 1 && sell) || (dir == -1 && buy))
      {
         trade.PositionClose(_Symbol);
         inTrade = false; dir = 0;
      }
   }

   // ---- Entries / reversal (signal only, no bias gate) ----
   if(buy)
   {
      if(dir == 1) return;
      if(dir == -1 && !InpAllowReverse) return;
      OpenTrade(true);
   }
   else if(sell)
   {
      if(dir == -1) return;
      if(dir == 1 && !InpAllowReverse) return;
      OpenTrade(false);
   }
}
//+------------------------------------------------------------------+
