//+------------------------------------------------------------------+
//|                                            PandaST_EA_MT5.mq5     |
//|   Trades the SuperTrend signal from "Panda Lines v4.1 MT5".       |
//|                                                                  |
//|   Logic:                                                         |
//|     - Reads the indicator via iCustom (buffers 0=STBullish,      |
//|       1=STBearish). A BUY signal = ST flips bearish->bullish,    |
//|       a SELL signal = ST flips bullish->bearish (same lime/red   |
//|       arrows the indicator draws).                               |
//|     - Entries are gated on the Panda scoring engine bias read    |
//|       from the common file panda_score_<SYMBOL>.txt (BIAS line). |
//|     - Exit on the opposite ST signal, with a protective          |
//|       ATR-based stop loss as a safety net.                       |
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

//==================== PANDA BIAS FILTER ============================
input bool    InpUsePandaFilter = true;   // Only trade when Panda bias agrees
input bool    InpTradeIfNoBias  = false;  // If bias file missing/NO DATA: trade anyway?

//==================== EXIT / RISK =================================
input int     InpATR_Period     = 14;     // ATR period for the protective stop
input double  InpATR_SL_Mult     = 2.0;   // Stop loss = ATR * this
input double  InpATR_TP_Mult     = 0.0;   // Take profit = ATR * this (0 = none, exit on opposite signal)
input bool    InpCloseOnOpposite = true;  // Close position when opposite ST signal fires

//==================== POSITION SIZING =============================
input bool    InpUsePercentRisk = true;   // true = % risk per trade, false = fixed lots
input double  InpRiskPercent    = 1.0;    // Risk % of balance per trade (when % risk)
input double  InpFixedLots      = 0.10;   // Fixed lot size (when fixed)

//==================== GENERAL =====================================
input long    InpMagic          = 990041; // Magic number
input int     InpSlippage       = 30;     // Max slippage (points)
input bool    InpAllowReverse   = true;   // Reverse straight into opposite trade on a flip

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

   Print("PandaST_EA_MT5 started on ", _Symbol, " ", EnumToString((ENUM_TIMEFRAMES)_Period));
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
//| Read the SuperTrend signal off the last CLOSED bar (shift 1).    |
//|   buy  = trend flipped bearish -> bullish at shift 1             |
//|   sell = trend flipped bullish -> bearish at shift 1            |
//| Detection uses plot buffers 0 (STBullish) & 1 (STBearish).       |
//| On a flip the indicator back-fills the PREVIOUS bar's opposite   |
//| buffer to connect the line, so shift 2 of the old side is set.   |
//+------------------------------------------------------------------+
bool GetSignal(bool &buy, bool &sell)
{
   buy = false; sell = false;

   double bull[], bear[];
   ArraySetAsSeries(bull, true);
   ArraySetAsSeries(bear, true);

   // start_pos=1, count=2  -> bull[0]=shift1, bull[1]=shift2
   if(CopyBuffer(hST, 0, 1, 2, bull) < 2) return(false);
   if(CopyBuffer(hST, 1, 1, 2, bear) < 2) return(false);

   bool bull1 = IsSet(bull[0]);  // shift 1 bullish line present
   bool bear1 = IsSet(bear[0]);  // shift 1 bearish line present
   bool bull2 = IsSet(bull[1]);  // shift 2 bullish line present
   bool bear2 = IsSet(bear[1]);  // shift 2 bearish line present

   // Flip to bullish at shift 1: now cleanly bullish, prior bar carried bearish value
   if(bull1 && !bear1 && bear2) buy  = true;
   // Flip to bearish at shift 1: now cleanly bearish, prior bar carried bullish value
   if(bear1 && !bull1 && bull2) sell = true;

   return(true);
}

//+------------------------------------------------------------------+
//| Read Panda engine bias from common file panda_score_<SYM>.txt    |
//| Returns "BUY","SELL","WAIT","INVALID","HARD_INVALID","NO DATA"   |
//+------------------------------------------------------------------+
string NormalizeSymbol(const string symbol)
{
   string out = "";
   for(int i = 0; i < StringLen(symbol); i++)
   {
      ushort ch = StringGetCharacter(symbol, i);
      if(ch >= 65 && ch <= 90) out += ShortToString(ch); // A-Z only
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
//| Latest ATR value (last closed bar)                              |
//+------------------------------------------------------------------+
double GetATR()
{
   double a[];
   ArraySetAsSeries(a, true);
   if(CopyBuffer(hATR, 0, 1, 1, a) < 1) return(0.0);
   return(a[0]);
}

//+------------------------------------------------------------------+
//| Lot size from fixed setting or % risk over the stop distance     |
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

   // round down to lot step and clamp
   if(lotStep > 0.0) lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(minLot, MathMin(maxLot, lots));
   return(lots);
}

//+------------------------------------------------------------------+
//| Does THIS EA already hold a position on this symbol?             |
//| dir out: +1 buy, -1 sell, 0 none                                |
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
      if(!trade.Buy(lots, _Symbol, price, sl, tp, "PandaST buy"))
         Print("Buy failed: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   }
   else
   {
      price = bid;
      sl    = NormalizeDouble(price + stopDist, dig);
      tp    = (tpDist > 0.0) ? NormalizeDouble(price - tpDist, dig) : 0.0;
      if(!trade.Sell(lots, _Symbol, price, sl, tp, "PandaST sell"))
         Print("Sell failed: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription());
   }
}

//+------------------------------------------------------------------+
void OnTick()
{
   // Act only once per new bar (signals are on closed bars).
   datetime t = iTime(_Symbol, _Period, 0);
   if(t == g_lastBar) return;
   g_lastBar = t;

   bool buy, sell;
   if(!GetSignal(buy, sell)) return;
   if(!buy && !sell) return;

   int dir;
   bool inTrade = HasPosition(dir);

   // ---- 1) Exit on opposite signal (not gated by Panda filter) ----
   if(InpCloseOnOpposite && inTrade)
   {
      if((dir == 1 && sell) || (dir == -1 && buy))
      {
         trade.PositionClose(_Symbol);
         inTrade = false; dir = 0;
      }
   }

   // ---- 2) Panda bias gate for ENTRIES ----
   bool allowEntry = true;
   if(InpUsePandaFilter)
   {
      string bias = GetPandaBias();
      bool noData  = (bias == "NO DATA" || bias == "");
      if(noData)            allowEntry = InpTradeIfNoBias;
      else if(buy)          allowEntry = (bias == "BUY");
      else if(sell)         allowEntry = (bias == "SELL");
      if(!allowEntry)
         PrintFormat("Signal %s blocked by Panda bias = %s", (buy?"BUY":"SELL"), bias);
   }
   if(!allowEntry) return;

   // ---- 3) Entries / reversal ----
   if(buy)
   {
      if(dir == 1) return;                 // already long
      if(dir == -1 && !InpAllowReverse) return;
      OpenTrade(true);
   }
   else if(sell)
   {
      if(dir == -1) return;                // already short
      if(dir == 1 && !InpAllowReverse) return;
      OpenTrade(false);
   }
}
//+------------------------------------------------------------------+
