//+------------------------------------------------------------------+
//|                                            PandaST_EA_MT4.mq4     |
//|   Trades the SuperTrend signal from "Panda Lines v4.1 MT4".       |
//|                                                                  |
//|   Logic (identical to the MT5 build):                            |
//|     - Reads the indicator via iCustom (buffers 0=STBullish,      |
//|       1=STBearish). BUY = ST flips bearish->bullish,            |
//|       SELL = ST flips bullish->bearish (the lime/red arrows).   |
//|     - Entries gated on the Panda engine bias read from the       |
//|       common file panda_score_<SYMBOL>.txt (BIAS line).          |
//|     - Exit on the opposite ST signal, plus a protective          |
//|       ATR-based stop loss.                                       |
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

//==================== PANDA BIAS FILTER ============================
input bool    InpUsePandaFilter = true;   // Only trade when Panda bias agrees
input bool    InpTradeIfNoBias  = false;  // If bias file missing/NO DATA: trade anyway?

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
input int     InpMagic           = 990041;// Magic number
input int     InpSlippage        = 30;    // Max slippage (points)
input bool    InpAllowReverse    = true;  // Reverse straight into opposite trade on a flip

datetime g_lastBar = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   Print("PandaST_EA_MT4 started on ", _Symbol, " ", (string)_Period);
   return(INIT_SUCCEEDED);
}
void OnDeinit(const int reason){}

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

   if(b1 && !s1 && s2) buy  = true;   // flip to bullish at shift 1
   if(s1 && !b1 && b2) sell = true;   // flip to bearish at shift 1
   return(true);
}

//+------------------------------------------------------------------+
//| Panda engine bias from common file panda_score_<SYMBOL>.txt      |
//+------------------------------------------------------------------+
string NormalizeSymbol(const string symbol)
{
   string out = "";
   for(int i = 0; i < StringLen(symbol); i++)
   {
      ushort ch = StringGetCharacter(symbol, i);
      if(ch >= 65 && ch <= 90) out += ShortToString(ch);
   }
   if(StringLen(out) > 6) out = StringSubstr(out, 0, 6);
   return(out);
}

string Trim(string s){ StringTrimLeft(s); StringTrimRight(s); return(s); }

string GetPandaBias()
{
   string clean = NormalizeSymbol(_Symbol);
   string fname = "panda_score_" + clean + ".txt";
   int h = FileOpen(fname, FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI|FILE_SHARE_READ|FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return("NO DATA");

   string bias = "NO DATA";
   while(!FileIsEnding(h))
   {
      string line = FileReadString(h);
      int sep = StringFind(line, ":");
      if(sep < 0) continue;
      string key = Trim(StringSubstr(line, 0, sep));
      string val = Trim(StringSubstr(line, sep + 1));
      if(key == "BIAS"){ bias = val; break; }
   }
   FileClose(h);
   return(bias);
}

//+------------------------------------------------------------------+
double GetATR()
{
   return(iATR(_Symbol, _Period, InpATR_Period, 1)); // last closed bar
}

//+------------------------------------------------------------------+
//| Lot size: fixed or % risk over the stop distance                |
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
//| Current position for this EA. dir: +1 buy, -1 sell, 0 none       |
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

   // respect broker minimum stop distance
   double minStop = MarketInfo(_Symbol, MODE_STOPLEVEL) * _Point;
   if(stopDist < minStop) stopDist = minStop;

   double price, sl, tp;
   if(isBuy)
   {
      price = Ask;
      sl    = NormalizeDouble(price - stopDist, _Digits);
      tp    = (tpDist > 0.0) ? NormalizeDouble(price + tpDist, _Digits) : 0.0;
      if(OrderSend(_Symbol, OP_BUY, lots, price, InpSlippage, sl, tp, "PandaST buy", InpMagic, 0, clrLime) < 0)
         Print("Buy failed: ", GetLastError());
   }
   else
   {
      price = Bid;
      sl    = NormalizeDouble(price + stopDist, _Digits);
      tp    = (tpDist > 0.0) ? NormalizeDouble(price - tpDist, _Digits) : 0.0;
      if(OrderSend(_Symbol, OP_SELL, lots, price, InpSlippage, sl, tp, "PandaST sell", InpMagic, 0, clrRed) < 0)
         Print("Sell failed: ", GetLastError());
   }
}

//+------------------------------------------------------------------+
void OnTick()
{
   // Act once per new bar (signals are on closed bars).
   if(Time[0] == g_lastBar) return;
   g_lastBar = Time[0];

   bool buy, sell;
   if(!GetSignal(buy, sell)) return;
   if(!buy && !sell) return;

   int dir = CurrentDir();

   // ---- 1) Exit on opposite signal (not gated by Panda filter) ----
   if(InpCloseOnOpposite && dir != 0)
   {
      if((dir == 1 && sell) || (dir == -1 && buy))
      {
         CloseAll();
         dir = 0;
      }
   }

   // ---- 2) Panda bias gate for ENTRIES ----
   bool allowEntry = true;
   if(InpUsePandaFilter)
   {
      string bias = GetPandaBias();
      bool noData  = (bias == "NO DATA" || bias == "");
      if(noData)      allowEntry = InpTradeIfNoBias;
      else if(buy)    allowEntry = (bias == "BUY");
      else if(sell)   allowEntry = (bias == "SELL");
      if(!allowEntry)
         Print("Signal ", (buy?"BUY":"SELL"), " blocked by Panda bias = ", bias);
   }
   if(!allowEntry) return;

   // ---- 3) Entries / reversal ----
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
