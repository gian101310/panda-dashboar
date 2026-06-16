//+------------------------------------------------------------------+
//|                                  PandaST_EA_MT4_SignalOnly.mq4    |
//|   Trades ONLY the SuperTrend signal from "Panda Lines v4.1 MT4". |
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

//==================== INDICATOR (must match your chart) =============
input string  InpIndicatorName  = "Panda Lines v4.1 MT4"; // Indicator file name (in MQL4\Indicators)
input int     InpST_Period      = 10;     // ST_Period (match the indicator)
input double  InpST_Multiplier  = 3.0;    // ST_Multiplier (match the indicator)
input bool    InpST_UseATR      = true;   // ST_UseATR (match the indicator)
input bool    InpST_ShowSignals = true;   // ST_ShowSignals (match the indicator)

//==================== EXIT / RISK =================================
input int     InpATR_Period      = 14;    // ATR period for the protective stop
input double  InpATR_SL_Mult      = 2.0;  // Stop loss = ATR * this
input double  InpATR_TP_Mult      = 0.0;  // Take profit = ATR * this (0 = none)
input bool    InpCloseOnOpposite  = true; // Close position when opposite ST signal fires

//==================== POSITION SIZING =============================
input bool    InpUsePercentRisk  = true;  // true = % risk per trade, false = fixed lots
input double  InpRiskPercent     = 1.0;   // Risk % of balance per trade (when % risk)
input double  InpFixedLots       = 0.10;  // Fixed lot size (when fixed)

//==================== GENERAL =====================================
input int     InpMagic           = 990042;// Magic number (different from the bias version)
input int     InpSlippage        = 30;    // Max slippage (points)
input bool    InpAllowReverse    = true;  // Reverse straight into opposite trade on a flip

datetime g_lastBar = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   Print("PandaST_EA_MT4_SignalOnly started on ", _Symbol, " ", (string)_Period);
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason){}

//+------------------------------------------------------------------+
bool IsSet(const double v)
{
   return(v != EMPTY_VALUE && v != 0.0 && MathAbs(v) < 1.0e90);
}

//+------------------------------------------------------------------+
//| SuperTrend signal off the last CLOSED bar (shift 1).             |
//| Uses plot buffers 0 (STBullish) & 1 (STBearish).                |
//+------------------------------------------------------------------+
bool GetSignal(bool &buy, bool &sell)
{
   buy = false; sell = false;

   double bull1 = iCustom(_Symbol, _Period, InpIndicatorName,
                          InpST_Period, InpST_Multiplier, InpST_UseATR, InpST_ShowSignals, 0, 1);
   double bull2 = iCustom(_Symbol, _Period, InpIndicatorName,
                          InpST_Period, InpST_Multiplier, InpST_UseATR, InpST_ShowSignals, 0, 2);
   double bear1 = iCustom(_Symbol, _Period, InpIndicatorName,
                          InpST_Period, InpST_Multiplier, InpST_UseATR, InpST_ShowSignals, 1, 1);
   double bear2 = iCustom(_Symbol, _Period, InpIndicatorName,
                          InpST_Period, InpST_Multiplier, InpST_UseATR, InpST_ShowSignals, 1, 2);

   bool b1 = IsSet(bull1);
   bool s1 = IsSet(bear1);
   bool b2 = IsSet(bull2);
   bool s2 = IsSet(bear2);

   if(b1 && !s1 && s2) buy  = true;
   if(s1 && !b1 && b2) sell = true;
   return(true);
}

//+------------------------------------------------------------------+
double GetATR()
{
   return(iATR(_Symbol, _Period, InpATR_Period, 1));
}

//+------------------------------------------------------------------+
double CalcLots(const double stopDistPrice)
{
   double minLot  = MarketInfo(_Symbol, MODE_MINLOT);
   double maxLot  = MarketInfo(_Symbol, MODE_MAXLOT);
   double lotStep = MarketInfo(_Symbol, MODE_LOTSTEP);

   double lots = InpFixedLots;

   if(InpUsePercentRisk && stopDistPrice > 0.0)
   {
      double tickVal  = MarketInfo(_Symbol, MODE_TICKVALUE);
      double tickSize = MarketInfo(_Symbol, MODE_TICKSIZE);
      if(tickSize > 0.0 && tickVal > 0.0)
      {
         double riskMoney  = AccountBalance() * InpRiskPercent / 100.0;
         double lossPerLot = (stopDistPrice / tickSize) * tickVal;
         if(lossPerLot > 0.0) lots = riskMoney / lossPerLot;
      }
   }

   if(lotStep > 0.0) lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(minLot, MathMin(maxLot, lots));
   return(lots);
}

//+------------------------------------------------------------------+
int CurrentDir()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != _Symbol || OrderMagicNumber() != InpMagic) continue;
      if(OrderType() == OP_BUY)  return(1);
      if(OrderType() == OP_SELL) return(-1);
   }
   return(0);
}

//+------------------------------------------------------------------+
void CloseAll()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != _Symbol || OrderMagicNumber() != InpMagic) continue;
      double px = (OrderType() == OP_BUY) ? Bid : Ask;
      if(!OrderClose(OrderTicket(), OrderLots(), px, InpSlippage, clrYellow))
         Print("OrderClose failed: ", GetLastError());
   }
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

   double minStop = MarketInfo(_Symbol, MODE_STOPLEVEL) * _Point;
   if(stopDist < minStop) stopDist = minStop;

   double price, sl, tp;
   if(isBuy)
   {
      price = Ask;
      sl    = NormalizeDouble(price - stopDist, _Digits);
      tp    = (tpDist > 0.0) ? NormalizeDouble(price + tpDist, _Digits) : 0.0;
      if(OrderSend(_Symbol, OP_BUY, lots, price, InpSlippage, sl, tp, "PandaST-SO buy", InpMagic, 0, clrLime) < 0)
         Print("Buy failed: ", GetLastError());
   }
   else
   {
      price = Bid;
      sl    = NormalizeDouble(price + stopDist, _Digits);
      tp    = (tpDist > 0.0) ? NormalizeDouble(price - tpDist, _Digits) : 0.0;
      if(OrderSend(_Symbol, OP_SELL, lots, price, InpSlippage, sl, tp, "PandaST-SO sell", InpMagic, 0, clrRed) < 0)
         Print("Sell failed: ", GetLastError());
   }
}

//+------------------------------------------------------------------+
void OnTick()
{
   if(Time[0] == g_lastBar) return;
   g_lastBar = Time[0];

   bool buy, sell;
   if(!GetSignal(buy, sell)) return;
   if(!buy && !sell) return;

   int dir = CurrentDir();

   // ---- Exit on opposite signal ----
   if(InpCloseOnOpposite && dir != 0)
   {
      if((dir == 1 && sell) || (dir == -1 && buy))
      {
         CloseAll();
         dir = 0;
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
