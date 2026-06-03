//+------------------------------------------------------------------+
//| PandaEngine_EA_MT5 v2.mq5                                        |
//| Panda Engine EA v2 — BB, INTRA, PULLBACK (Engine S/R), IM        |
//| PULLBACK uses PDH/PDL/PWH/PWL/PMH/PML/PYH/PYL as S/R levels     |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property link      "https://pandaengine.app"
#property version   "2.00"

#include <Trade\Trade.mqh>

//=== GENERAL INPUTS ===
input double   LotSize           = 0.01;     // Lot size
input int      SwingLookback     = 20;       // Bars to scan for swing high/low
input int      SwingStrength     = 3;        // Bars on each side to confirm swing
input ulong    SlippagePoints    = 30;       // Max slippage in points
input int      MaxSpreadPoints   = 40;       // Max spread to allow entry (points)
input double   SL_Buffer_Points  = 50;       // Buffer beyond swing for SL (points)
input int      UAE_Offset        = 4;        // UAE = UTC+4 (broker offset from UTC)
input int      MinConfluence     = 0;        // Min confluence score to trade (0=disabled)
input bool     ShowDashboard     = true;     // Show on-chart info panel

//=== BB STRATEGY ===
input bool     EnableBB          = true;     // Enable BB strategy
input double   BB_RR             = 2.0;      // BB: TP = RR x SL distance
input ulong    BB_Magic          = 111001;   // BB: Magic number

//=== INTRA STRATEGY ===
input bool     EnableINTRA       = true;     // Enable INTRA strategy
input double   INTRA_RR          = 2.0;      // INTRA: TP = RR x SL distance
input ulong    INTRA_Magic       = 111002;   // INTRA: Magic number
input int      IntraStartHour    = 2;        // INTRA: Entry window start (UAE)
input int      IntraEndHour      = 4;        // INTRA: Entry window end (UAE)
input int      IntraCloseHour    = 10;       // INTRA: Hard close hour (UAE)

//=== PULLBACK STRATEGY (Engine S/R) ===
input bool     EnablePULLBACK    = true;     // Enable PULLBACK strategy
input ulong    PB_Magic          = 111003;   // PULLBACK: Magic number
input double   PB_ZonePips       = 15.0;     // PULLBACK: Max pips from S/R to enter
input int      PB_MinGap         = 5;        // PULLBACK: Minimum gap score
input bool     PB_UseDaily       = true;     // PULLBACK: Use PDH/PDL
input bool     PB_UseWeekly      = true;     // PULLBACK: Use PWH/PWL
input bool     PB_UseMonthly     = true;     // PULLBACK: Use PMH/PML
input bool     PB_UseYearly      = true;     // PULLBACK: Use PYH/PYL

//=== INTRA MASTER STRATEGY ===
input bool     EnableIM          = true;     // Enable INTRA MASTER strategy
input ulong    IM_Magic          = 111004;   // IM: Magic number
input int      IM_SuperTrendPd   = 10;       // IM: SuperTrend ATR period
input double   IM_SuperTrendMul  = 3.0;      // IM: SuperTrend multiplier
input bool     IM_UseSuperTrend  = true;     // IM: Use SuperTrend for SL (false=swing)
input double   IM_ST_Buffer      = 30;       // IM: Buffer below/above SuperTrend (pts)
input double   IM_TrailStep      = 20;       // IM: Trail step in points (min move)

//--- Global objects
CTrade   trade;
int      CheckIntervalSec = 30;
int      atrHandle = INVALID_HANDLE;

//+------------------------------------------------------------------+
//| STRUCT: Panda Signal                                               |
//+------------------------------------------------------------------+
struct PandaSignal
{
   int      gap;
   string   bias;
   string   confidence;
   string   execution;
   string   momentum;
   int      strength;
   bool     hardInvalid;
   string   plZone;
   bool     plG1;
   string   boxH1;
   string   boxH4;
   int      confluence;
   bool     valid;
};

//+------------------------------------------------------------------+
//| STRUCT: S/R Level                                                  |
//+------------------------------------------------------------------+
struct SRLevel
{
   double   price;
   string   name;    // PDH, PDL, PWH, PWL, PMH, PML, PYH, PYL
   string   period;  // DAILY, WEEKLY, MONTHLY, YEARLY
};

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   atrHandle = iATR(_Symbol, PERIOD_CURRENT, IM_SuperTrendPd);

   if(ShowDashboard)
   {
      ObjectCreate(0, "PandaLabel", OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_XDISTANCE, 15);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_YDISTANCE, 25);
      ObjectSetString(0, "PandaLabel", OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, "PandaLabel", OBJPROP_FONTSIZE, 10);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_COLOR, clrLime);
      ObjectSetString(0, "PandaLabel", OBJPROP_TEXT, "Panda EA v2 MT5: Initializing...");
   }

   Print("[PANDA EA v2] Init | BB=", EnableBB, " INTRA=", EnableINTRA,
         " PB=", EnablePULLBACK, " IM=", EnableIM);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(atrHandle != INVALID_HANDLE) IndicatorRelease(atrHandle);
   ObjectDelete(0, "PandaLabel");
   ObjectDelete(0, "PandaStatus");
   ObjectDelete(0, "PandaBB");
   ObjectDelete(0, "PandaINTRA");
   ObjectDelete(0, "PandaPB");
   ObjectDelete(0, "PandaIM");
   ObjectDelete(0, "PandaSR");
}

//+------------------------------------------------------------------+
//| Read panda_score_SYMBOL.txt                                       |
//+------------------------------------------------------------------+
bool ReadPandaSignal(string symbol, PandaSignal &sig)
{
   string cleanSym = symbol;
   if(StringLen(cleanSym) > 6)
   {
      string test = StringSubstr(cleanSym, 0, 6);
      bool valid6 = true;
      for(int c = 0; c < 6; c++)
      {
         int ch = StringGetCharacter(test, c);
         if(ch < 'A' || ch > 'Z') { valid6 = false; break; }
      }
      if(valid6) cleanSym = test;
   }

   string filename = "panda_score_" + cleanSym + ".txt";
   int handle = FileOpen(filename, FILE_READ | FILE_TXT | FILE_COMMON);
   if(handle == INVALID_HANDLE) { sig.valid = false; return false; }

   sig.gap = 0; sig.bias = "WAIT"; sig.confidence = "INVALID";
   sig.execution = "NONE"; sig.momentum = "NEUTRAL"; sig.strength = 0;
   sig.hardInvalid = true; sig.plZone = "BETWEEN"; sig.plG1 = false;
   sig.boxH1 = "UNKNOWN"; sig.boxH4 = "UNKNOWN"; sig.confluence = 0;
   sig.valid = false;

   while(!FileIsEnding(handle))
   {
      string line = FileReadString(handle);
      if(StringLen(line) == 0) continue;
      int colonPos = StringFind(line, ":");
      if(colonPos < 0) continue;

      string key   = StringSubstr(line, 0, colonPos);
      string value = StringSubstr(line, colonPos + 1);
      StringTrimLeft(value); StringTrimRight(value);

      if(key == "GAP")              sig.gap         = (int)StringToInteger(value);
      else if(key == "BIAS")        sig.bias        = value;
      else if(key == "CONFIDENCE")  sig.confidence  = value;
      else if(key == "EXECUTION")   sig.execution   = value;
      else if(key == "MOMENTUM")    sig.momentum    = value;
      else if(key == "STRENGTH")    sig.strength    = (int)StringToInteger(value);
      else if(key == "HARD_INVALID") sig.hardInvalid = (value == "1");
      else if(key == "PL_ZONE")     sig.plZone      = value;
      else if(key == "PL_G1")       sig.plG1        = (value == "1");
      else if(key == "BOX_H1")      sig.boxH1       = value;
      else if(key == "BOX_H4")      sig.boxH4       = value;
      else if(key == "CONFLUENCE")  sig.confluence  = (int)StringToInteger(value);
   }
   FileClose(handle);
   sig.valid = true;
   return true;
}

//+------------------------------------------------------------------+
//| Build S/R levels array from engine data (PDH/PDL/PWH/PWL etc.)    |
//+------------------------------------------------------------------+
int BuildSRLevels(SRLevel &levels[])
{
   ArrayResize(levels, 0);
   double buf[];
   int count = 0;

   // Previous Day High / Low
   if(PB_UseDaily)
   {
      if(CopyHigh(_Symbol, PERIOD_D1, 1, 1, buf) > 0 && buf[0] > 0)
      { ArrayResize(levels, count + 1); levels[count].price = buf[0]; levels[count].name = "PDH"; levels[count].period = "DAILY"; count++; }

      if(CopyLow(_Symbol, PERIOD_D1, 1, 1, buf) > 0 && buf[0] > 0)
      { ArrayResize(levels, count + 1); levels[count].price = buf[0]; levels[count].name = "PDL"; levels[count].period = "DAILY"; count++; }
   }

   // Previous Week High / Low
   if(PB_UseWeekly)
   {
      if(CopyHigh(_Symbol, PERIOD_W1, 1, 1, buf) > 0 && buf[0] > 0)
      { ArrayResize(levels, count + 1); levels[count].price = buf[0]; levels[count].name = "PWH"; levels[count].period = "WEEKLY"; count++; }

      if(CopyLow(_Symbol, PERIOD_W1, 1, 1, buf) > 0 && buf[0] > 0)
      { ArrayResize(levels, count + 1); levels[count].price = buf[0]; levels[count].name = "PWL"; levels[count].period = "WEEKLY"; count++; }
   }

   // Previous Month High / Low
   if(PB_UseMonthly)
   {
      if(CopyHigh(_Symbol, PERIOD_MN1, 1, 1, buf) > 0 && buf[0] > 0)
      { ArrayResize(levels, count + 1); levels[count].price = buf[0]; levels[count].name = "PMH"; levels[count].period = "MONTHLY"; count++; }

      if(CopyLow(_Symbol, PERIOD_MN1, 1, 1, buf) > 0 && buf[0] > 0)
      { ArrayResize(levels, count + 1); levels[count].price = buf[0]; levels[count].name = "PML"; levels[count].period = "MONTHLY"; count++; }
   }

   // Previous Year High / Low
   if(PB_UseYearly)
   {
      double yh = 0, yl = 0;
      GetPreviousYearHL(yh, yl);
      if(yh > 0)
      { ArrayResize(levels, count + 1); levels[count].price = yh; levels[count].name = "PYH"; levels[count].period = "YEARLY"; count++; }
      if(yl > 0)
      { ArrayResize(levels, count + 1); levels[count].price = yl; levels[count].name = "PYL"; levels[count].period = "YEARLY"; count++; }
   }

   return count;
}

//+------------------------------------------------------------------+
//| Get Previous Year High/Low                                         |
//+------------------------------------------------------------------+
void GetPreviousYearHL(double &yh, double &yl)
{
   yh = 0; yl = DBL_MAX;
   MqlDateTime dt;
   TimeCurrent(dt);
   int prev_year = dt.year - 1;

   int bars = Bars(_Symbol, PERIOD_MN1);
   int toCopy = MathMin(bars, 24);
   double hBuf[], lBuf[];
   datetime tBuf[];

   if(CopyHigh(_Symbol, PERIOD_MN1, 1, toCopy, hBuf) < 1 ||
      CopyLow(_Symbol, PERIOD_MN1, 1, toCopy, lBuf) < 1 ||
      CopyTime(_Symbol, PERIOD_MN1, 1, toCopy, tBuf) < 1)
   { yh = 0; yl = 0; return; }

   for(int k = 0; k < ArraySize(tBuf); k++)
   {
      MqlDateTime mdt;
      TimeToStruct(tBuf[k], mdt);
      if(mdt.year == prev_year)
      {
         yh = MathMax(yh, hBuf[k]);
         yl = MathMin(yl, lBuf[k]);
      }
   }
   if(yl == DBL_MAX) { yh = 0; yl = 0; }
}

//+------------------------------------------------------------------+
//| Find nearest S/R level BELOW price (support for BUY)               |
//+------------------------------------------------------------------+
bool FindNearestSupport(SRLevel &levels[], double price, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;

   for(int i = 0; i < ArraySize(levels); i++)
   {
      if(levels[i].price < price)
      {
         double dist = price - levels[i].price;
         if(dist < minDist)
         {
            minDist = dist;
            result = levels[i];
            found = true;
         }
      }
   }
   return found;
}

//+------------------------------------------------------------------+
//| Find nearest S/R level ABOVE price (resistance for BUY TP)        |
//+------------------------------------------------------------------+
bool FindNearestResistance(SRLevel &levels[], double price, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;

   for(int i = 0; i < ArraySize(levels); i++)
   {
      if(levels[i].price > price)
      {
         double dist = levels[i].price - price;
         if(dist < minDist)
         {
            minDist = dist;
            result = levels[i];
            found = true;
         }
      }
   }
   return found;
}

//+------------------------------------------------------------------+
//| Find SECOND nearest S/R above price (skip the one we're at)        |
//+------------------------------------------------------------------+
bool FindNextResistanceAbove(SRLevel &levels[], double price, double skipPrice, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   for(int i = 0; i < ArraySize(levels); i++)
   {
      // Skip the level we're currently at
      if(MathAbs(levels[i].price - skipPrice) < 10 * point) continue;
      if(levels[i].price > price)
      {
         double dist = levels[i].price - price;
         if(dist < minDist)
         {
            minDist = dist;
            result = levels[i];
            found = true;
         }
      }
   }
   return found;
}

//+------------------------------------------------------------------+
//| Find SECOND nearest S/R below price (skip the one we're at)        |
//+------------------------------------------------------------------+
bool FindNextSupportBelow(SRLevel &levels[], double price, double skipPrice, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   for(int i = 0; i < ArraySize(levels); i++)
   {
      if(MathAbs(levels[i].price - skipPrice) < 10 * point) continue;
      if(levels[i].price < price)
      {
         double dist = price - levels[i].price;
         if(dist < minDist)
         {
            minDist = dist;
            result = levels[i];
            found = true;
         }
      }
   }
   return found;
}

//+------------------------------------------------------------------+
//| Find Previous Swing Low                                            |
//+------------------------------------------------------------------+
double FindSwingLow(int lookback, int strength)
{
   for(int i = strength + 1; i < lookback; i++)
   {
      double low_i = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= strength; j++)
      {
         if(iLow(_Symbol, PERIOD_CURRENT, i - j) <= low_i ||
            iLow(_Symbol, PERIOD_CURRENT, i + j) <= low_i)
         { isSwing = false; break; }
      }
      if(isSwing) return low_i;
   }
   return 0;
}

//+------------------------------------------------------------------+
//| Find Previous Swing High                                           |
//+------------------------------------------------------------------+
double FindSwingHigh(int lookback, int strength)
{
   for(int i = strength + 1; i < lookback; i++)
   {
      double high_i = iHigh(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= strength; j++)
      {
         if(iHigh(_Symbol, PERIOD_CURRENT, i - j) >= high_i ||
            iHigh(_Symbol, PERIOD_CURRENT, i + j) >= high_i)
         { isSwing = false; break; }
      }
      if(isSwing) return high_i;
   }
   return 0;
}

//+------------------------------------------------------------------+
//| Check if position with given magic exists                          |
//+------------------------------------------------------------------+
bool HasOpenTrade(ulong magic)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == (long)magic)
         return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Get UAE hour                                                       |
//+------------------------------------------------------------------+
int GetUAEHour()
{
   MqlDateTime dt;
   TimeCurrent(dt);
   return (dt.hour + UAE_Offset) % 24;
}

//+------------------------------------------------------------------+
//| Normalize price                                                    |
//+------------------------------------------------------------------+
double NormPrice(double price)
{
   return NormalizeDouble(price, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
}

//+------------------------------------------------------------------+
//| Distance to pips                                                   |
//+------------------------------------------------------------------+
double DistanceToPips(double distance)
{
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double pipSize = (digits == 3 || digits == 5) ? 10.0 * point : point;
   if(pipSize == 0) return 0;
   return distance / pipSize;
}

//+------------------------------------------------------------------+
//| Get spread in points                                               |
//+------------------------------------------------------------------+
int GetSpreadPoints()
{
   return (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
}

//+------------------------------------------------------------------+
//| SuperTrend calculation                                             |
//+------------------------------------------------------------------+
double GetSuperTrend(int shift)
{
   if(atrHandle == INVALID_HANDLE) return 0;

   double atrBuf[];
   ArraySetAsSeries(atrBuf, true);
   if(CopyBuffer(atrHandle, 0, shift, 1, atrBuf) < 1) return 0;

   double atr = atrBuf[0];
   double median = (iHigh(_Symbol, PERIOD_CURRENT, shift) +
                    iLow(_Symbol, PERIOD_CURRENT, shift)) / 2.0;

   double upperBand = median + IM_SuperTrendMul * atr;
   double lowerBand = median - IM_SuperTrendMul * atr;

   double closeVal = iClose(_Symbol, PERIOD_CURRENT, shift);
   if(closeVal > median)
      return NormPrice(lowerBand);
   else
      return NormPrice(upperBand);
}

//+------------------------------------------------------------------+
//| Execute BB / INTRA trade (swing SL, fixed RR TP)                   |
//+------------------------------------------------------------------+
bool ExecuteTrade(ENUM_ORDER_TYPE direction, ulong magic, string strategyName, double rrMultiplier)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(GetSpreadPoints() > MaxSpreadPoints)
   { Print("[PANDA] ", strategyName, " — Spread too high"); return false; }

   trade.SetExpertMagicNumber(magic);
   trade.SetDeviationInPoints(SlippagePoints);

   double sl = 0, tp = 0, entry = 0, slDistance = 0;
   string comment = "Panda_" + strategyName;

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));
      double swLow = FindSwingLow(SwingLookback, SwingStrength);
      if(swLow <= 0) { Print("[PANDA] ", strategyName, " BUY — No swing low"); return false; }

      sl = NormPrice(swLow - SL_Buffer_Points * point);
      slDistance = entry - sl;
      if(slDistance <= 0) return false;
      tp = NormPrice(entry + slDistance * rrMultiplier);

      if(!trade.Buy(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA] Buy FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] ", strategyName, " BUY #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
   else
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));
      double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
      if(swHigh <= 0) { Print("[PANDA] ", strategyName, " SELL — No swing high"); return false; }

      sl = NormPrice(swHigh + SL_Buffer_Points * point);
      slDistance = sl - entry;
      if(slDistance <= 0) return false;
      tp = NormPrice(entry - slDistance * rrMultiplier);

      if(!trade.Sell(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA] Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] ", strategyName, " SELL #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
}

//+------------------------------------------------------------------+
//| Execute PULLBACK trade using engine S/R levels                     |
//| BUY: price near support level → TP at next resistance above       |
//| SELL: price near resistance level → TP at next support below       |
//| SL ratio: TP<100pip→/2, <200→/3, <300→/4                         |
//+------------------------------------------------------------------+
bool ExecutePullbackTrade(ENUM_ORDER_TYPE direction)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(GetSpreadPoints() > MaxSpreadPoints) return false;

   trade.SetExpertMagicNumber(PB_Magic);
   trade.SetDeviationInPoints(SlippagePoints);

   // Build S/R levels from engine data
   SRLevel levels[];
   int levelCount = BuildSRLevels(levels);
   if(levelCount < 2) { Print("[PANDA] PB — Not enough S/R levels"); return false; }

   double entry = 0, sl = 0, tp = 0;
   double tpDistance = 0, slDistance = 0;
   string comment = "Panda_PB";
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double pipSize = (digits == 3 || digits == 5) ? 10.0 * point : point;

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));

      // Find nearest support BELOW price (this is our entry zone)
      SRLevel entryLevel;
      if(!FindNearestSupport(levels, entry, entryLevel))
      { Print("[PANDA] PB BUY — No support below"); return false; }

      // Check price is within zone of support level
      double distPips = DistanceToPips(entry - entryLevel.price);
      if(distPips > PB_ZonePips)
      { Print("[PANDA] PB BUY — Too far from ", entryLevel.name, " (", DoubleToString(distPips,1), " pips)"); return false; }

      // Find next resistance ABOVE for TP (skip the entry level)
      SRLevel tpLevel;
      if(!FindNearestResistance(levels, entry, tpLevel))
      { Print("[PANDA] PB BUY — No resistance above for TP"); return false; }

      tp = NormPrice(tpLevel.price);
      tpDistance = tp - entry;
      if(tpDistance <= 0) return false;

      // SL ratio based on TP pips
      double tpPips = DistanceToPips(tpDistance);
      double slRatio = 2.0;
      if(tpPips >= 300)      slRatio = 4.0;
      else if(tpPips >= 200) slRatio = 3.0;
      else if(tpPips >= 100) slRatio = 2.0;

      slDistance = tpDistance / slRatio;
      sl = NormPrice(entry - slDistance);

      Print("[PANDA] PB BUY | Entry at ", entryLevel.name, "=", DoubleToString(entryLevel.price, digits),
            " → TP at ", tpLevel.name, "=", DoubleToString(tpLevel.price, digits),
            " | TP=", DoubleToString(tpPips,1), "pip SL=", DoubleToString(DistanceToPips(slDistance),1),
            "pip ratio=1/", DoubleToString(slRatio,0));

      if(!trade.Buy(LotSize, _Symbol, entry, sl, tp, comment + "_" + entryLevel.name))
      { Print("[PANDA] PB Buy FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] PB BUY #", trade.ResultOrder());
      return true;
   }
   else // SELL
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));

      // Find nearest resistance ABOVE price (this is our entry zone)
      SRLevel entryLevel;
      if(!FindNearestResistance(levels, entry, entryLevel))
      { Print("[PANDA] PB SELL — No resistance above"); return false; }

      // Check price is within zone of resistance level
      double distPips = DistanceToPips(entryLevel.price - entry);
      if(distPips > PB_ZonePips)
      { Print("[PANDA] PB SELL — Too far from ", entryLevel.name, " (", DoubleToString(distPips,1), " pips)"); return false; }

      // Find next support BELOW for TP (skip the entry level)
      SRLevel tpLevel;
      if(!FindNearestSupport(levels, entry, tpLevel))
      { Print("[PANDA] PB SELL — No support below for TP"); return false; }

      tp = NormPrice(tpLevel.price);
      tpDistance = entry - tp;
      if(tpDistance <= 0) return false;

      double tpPips = DistanceToPips(tpDistance);
      double slRatio = 2.0;
      if(tpPips >= 300)      slRatio = 4.0;
      else if(tpPips >= 200) slRatio = 3.0;
      else if(tpPips >= 100) slRatio = 2.0;

      slDistance = tpDistance / slRatio;
      sl = NormPrice(entry + slDistance);

      Print("[PANDA] PB SELL | Entry at ", entryLevel.name, "=", DoubleToString(entryLevel.price, digits),
            " → TP at ", tpLevel.name, "=", DoubleToString(tpLevel.price, digits),
            " | TP=", DoubleToString(tpPips,1), "pip SL=", DoubleToString(DistanceToPips(slDistance),1),
            "pip ratio=1/", DoubleToString(slRatio,0));

      if(!trade.Sell(LotSize, _Symbol, entry, sl, tp, comment + "_" + entryLevel.name))
      { Print("[PANDA] PB Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] PB SELL #", trade.ResultOrder());
      return true;
   }
}

//+------------------------------------------------------------------+
//| Execute INTRA MASTER trade (trail stop)                            |
//+------------------------------------------------------------------+
bool ExecuteIMTrade(ENUM_ORDER_TYPE direction)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(GetSpreadPoints() > MaxSpreadPoints) return false;

   trade.SetExpertMagicNumber(IM_Magic);
   trade.SetDeviationInPoints(SlippagePoints);

   double entry = 0, sl = 0;
   string comment = "Panda_IM";

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));

      if(IM_UseSuperTrend)
      {
         double st = GetSuperTrend(1);
         if(st >= entry || st <= 0)
         {
            double swLow = FindSwingLow(SwingLookback, SwingStrength);
            if(swLow <= 0) return false;
            sl = NormPrice(swLow - SL_Buffer_Points * point);
         }
         else
            sl = NormPrice(st - IM_ST_Buffer * point);
      }
      else
      {
         double swLow = FindSwingLow(SwingLookback, SwingStrength);
         if(swLow <= 0) return false;
         sl = NormPrice(swLow - SL_Buffer_Points * point);
      }

      if(entry - sl <= 0) return false;
      double safeTP = NormPrice(entry + (entry - sl) * 10);

      if(!trade.Buy(LotSize, _Symbol, entry, sl, safeTP, comment))
      { Print("[PANDA] IM Buy FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] IM BUY #", trade.ResultOrder(), " E=", entry, " SL=", sl, " (trail)");
      return true;
   }
   else
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));

      if(IM_UseSuperTrend)
      {
         double st = GetSuperTrend(1);
         if(st <= entry || st <= 0)
         {
            double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
            if(swHigh <= 0) return false;
            sl = NormPrice(swHigh + SL_Buffer_Points * point);
         }
         else
            sl = NormPrice(st + IM_ST_Buffer * point);
      }
      else
      {
         double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
         if(swHigh <= 0) return false;
         sl = NormPrice(swHigh + SL_Buffer_Points * point);
      }

      if(sl - entry <= 0) return false;
      double safeTP = NormPrice(entry - (sl - entry) * 10);

      if(!trade.Sell(LotSize, _Symbol, entry, sl, safeTP, comment))
      { Print("[PANDA] IM Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] IM SELL #", trade.ResultOrder(), " E=", entry, " SL=", sl, " (trail)");
      return true;
   }
}

//+------------------------------------------------------------------+
//| Close positions by magic                                           |
//+------------------------------------------------------------------+
void CloseTradesByMagic(ulong magic, string reason)
{
   trade.SetExpertMagicNumber(magic);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)magic) continue;

      if(trade.PositionClose(ticket))
         Print("[PANDA] Closed #", ticket, " | ", reason);
      else
         Print("[PANDA] Close FAIL #", ticket);
   }
}

//+------------------------------------------------------------------+
//| INTRA MASTER: Break-even + Trail Stop                              |
//+------------------------------------------------------------------+
void ManageIMTrailingStop()
{
   if(!EnableIM) return;
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != (long)IM_Magic) continue;

      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);

      if(posType == POSITION_TYPE_BUY)
      {
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double slDistance = openPrice - currentSL;
         double currentProfit = bid - openPrice;

         if(currentProfit >= slDistance && currentSL < openPrice)
         {
            double newSL = NormPrice(openPrice + point);
            if(newSL > currentSL)
            {
               trade.PositionModify(ticket, newSL, currentTP);
               Print("[PANDA] IM #", ticket, " → BREAK EVEN");
            }
         }
         else if(currentSL >= openPrice && currentProfit > slDistance)
         {
            double trailLevel = NormPrice(bid - slDistance);
            if(trailLevel > currentSL + IM_TrailStep * point)
            {
               trade.PositionModify(ticket, trailLevel, currentTP);
               Print("[PANDA] IM #", ticket, " → TRAIL SL to ", trailLevel);
            }
         }
      }
      else if(posType == POSITION_TYPE_SELL)
      {
         double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         double slDistance = currentSL - openPrice;
         double currentProfit = openPrice - ask;

         if(currentProfit >= slDistance && currentSL > openPrice)
         {
            double newSL = NormPrice(openPrice - point);
            if(newSL < currentSL)
            {
               trade.PositionModify(ticket, newSL, currentTP);
               Print("[PANDA] IM #", ticket, " → BREAK EVEN");
            }
         }
         else if(currentSL <= openPrice && currentProfit > slDistance)
         {
            double trailLevel = NormPrice(ask + slDistance);
            if(trailLevel < currentSL - IM_TrailStep * point)
            {
               trade.PositionModify(ticket, trailLevel, currentTP);
               Print("[PANDA] IM #", ticket, " → TRAIL SL to ", trailLevel);
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| BB Strategy                                                        |
//+------------------------------------------------------------------+
void CheckBBStrategy(PandaSignal &sig)
{
   if(!EnableBB) return;
   if(HasOpenTrade(BB_Magic)) return;
   if(sig.hardInvalid) return;
   if(MathAbs(sig.gap) < 5) return;
   if(sig.bias != "BUY" && sig.bias != "SELL") return;
   if(MinConfluence > 0 && sig.confluence < MinConfluence) return;

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   ExecuteTrade(dir, BB_Magic, "BB", BB_RR);
}

//+------------------------------------------------------------------+
//| INTRA Strategy                                                     |
//+------------------------------------------------------------------+
void CheckINTRAStrategy(PandaSignal &sig)
{
   if(!EnableINTRA) return;
   if(HasOpenTrade(INTRA_Magic)) return;
   if(sig.hardInvalid) return;
   if(MathAbs(sig.gap) < 9) return;
   if(sig.bias != "BUY" && sig.bias != "SELL") return;
   if(sig.bias == "BUY" && sig.plZone != "ABOVE") return;
   if(sig.bias == "SELL" && sig.plZone != "BELOW") return;

   int uaeHour = GetUAEHour();
   if(uaeHour < IntraStartHour || uaeHour >= IntraEndHour) return;
   if(MinConfluence > 0 && sig.confluence < MinConfluence) return;

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   ExecuteTrade(dir, INTRA_Magic, "INTRA", INTRA_RR);
}

//+------------------------------------------------------------------+
//| INTRA Hard Close                                                   |
//+------------------------------------------------------------------+
void CheckINTRAHardClose()
{
   if(!EnableINTRA) return;
   if(GetUAEHour() >= IntraCloseHour && HasOpenTrade(INTRA_Magic))
      CloseTradesByMagic(INTRA_Magic, "INTRA 10AM hard close");
}

//+------------------------------------------------------------------+
//| PULLBACK Strategy (Engine S/R)                                     |
//+------------------------------------------------------------------+
void CheckPULLBACKStrategy(PandaSignal &sig)
{
   if(!EnablePULLBACK) return;
   if(HasOpenTrade(PB_Magic)) return;
   if(sig.hardInvalid) return;
   if(MathAbs(sig.gap) < PB_MinGap) return;
   if(sig.bias != "BUY" && sig.bias != "SELL") return;
   if(MinConfluence > 0 && sig.confluence < MinConfluence) return;

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   ExecutePullbackTrade(dir);
}

//+------------------------------------------------------------------+
//| INTRA MASTER Strategy                                              |
//+------------------------------------------------------------------+
void CheckIMStrategy(PandaSignal &sig)
{
   if(!EnableIM) return;
   if(HasOpenTrade(IM_Magic)) return;
   if(sig.hardInvalid) return;
   if(MathAbs(sig.gap) < 9) return;
   if(sig.bias != "BUY" && sig.bias != "SELL") return;
   if(sig.bias == "BUY" && sig.plZone != "ABOVE") return;
   if(sig.bias == "SELL" && sig.plZone != "BELOW") return;
   if(MinConfluence > 0 && sig.confluence < MinConfluence) return;

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   ExecuteIMTrade(dir);
}

//+------------------------------------------------------------------+
//| Helper: create chart label                                         |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, int fontSize, color clr)
{
   if(!ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0)) {}
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
}

//+------------------------------------------------------------------+
//| Update on-chart dashboard                                          |
//+------------------------------------------------------------------+
void UpdateDashboard(PandaSignal &sig)
{
   if(!ShowDashboard) return;

   color panelColor = clrGray;
   if(sig.bias == "BUY") panelColor = clrLime;
   else if(sig.bias == "SELL") panelColor = clrRed;

   string mainText = StringFormat("PANDA EA v2 | %s | Gap:%d | Bias:%s | Zone:%s | Conf:%d",
                                   _Symbol, sig.gap, sig.bias, sig.plZone, sig.confluence);
   ObjectSetString(0, "PandaLabel", OBJPROP_TEXT, mainText);
   ObjectSetInteger(0, "PandaLabel", OBJPROP_COLOR, panelColor);

   // BB
   CreateLabel("PandaBB", 15, 45, 9, EnableBB ? clrAqua : clrDarkGray);
   string bbSt = EnableBB ? (HasOpenTrade(BB_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaBB", OBJPROP_TEXT,
      StringFormat("BB: %s | RR 1:%.0f | Mom: %s", bbSt, BB_RR, sig.momentum));

   // INTRA
   CreateLabel("PandaINTRA", 15, 62, 9, EnableINTRA ? clrGold : clrDarkGray);
   string iSt = EnableINTRA ? (HasOpenTrade(INTRA_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaINTRA", OBJPROP_TEXT,
      StringFormat("INTRA: %s | UAE:%02d:00 | %d-%dAM | Close %dAM",
                   iSt, GetUAEHour(), IntraStartHour, IntraEndHour, IntraCloseHour));

   // PULLBACK — show active S/R levels
   CreateLabel("PandaPB", 15, 79, 9, EnablePULLBACK ? clrMagenta : clrDarkGray);
   string pbSt = EnablePULLBACK ? (HasOpenTrade(PB_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   SRLevel levels[];
   int lvlCount = BuildSRLevels(levels);
   ObjectSetString(0, "PandaPB", OBJPROP_TEXT,
      StringFormat("PULLBACK: %s | S/R levels: %d | Zone: %.0f pip", pbSt, lvlCount, PB_ZonePips));

   // Show nearest S/R levels
   CreateLabel("PandaSR", 15, 96, 8, clrDarkGray);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   int digs = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   SRLevel nearSup, nearRes;
   string srText = "S/R: ";
   if(FindNearestSupport(levels, bid, nearSup))
      srText += nearSup.name + "=" + DoubleToString(nearSup.price, digs);
   srText += " | ";
   if(FindNearestResistance(levels, bid, nearRes))
      srText += nearRes.name + "=" + DoubleToString(nearRes.price, digs);
   ObjectSetString(0, "PandaSR", OBJPROP_TEXT, srText);

   // INTRA MASTER
   CreateLabel("PandaIM", 15, 113, 9, EnableIM ? clrOrange : clrDarkGray);
   string imSt = EnableIM ? (HasOpenTrade(IM_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   string slType = IM_UseSuperTrend ? "SuperTrend" : "Swing";
   ObjectSetString(0, "PandaIM", OBJPROP_TEXT,
      StringFormat("IM: %s | SL:%s | Trail:%s", imSt, slType,
                   HasOpenTrade(IM_Magic) ? "RUNNING" : "---"));

   // Status
   CreateLabel("PandaStatus", 15, 130, 8, clrDarkGray);
   string swLow  = DoubleToString(FindSwingLow(SwingLookback, SwingStrength), digs);
   string swHigh = DoubleToString(FindSwingHigh(SwingLookback, SwingStrength), digs);
   ObjectSetString(0, "PandaStatus", OBJPROP_TEXT,
      StringFormat("SwLo:%s | SwHi:%s | Lot:%.2f | Box H1:%s H4:%s",
                   swLow, swHigh, LotSize, sig.boxH1, sig.boxH4));
}

//+------------------------------------------------------------------+
//| Expert tick function                                               |
//+------------------------------------------------------------------+
void OnTick()
{
   ManageIMTrailingStop();

   static datetime lastCheck = 0;
   if(TimeCurrent() - lastCheck < CheckIntervalSec) return;
   lastCheck = TimeCurrent();

   CheckINTRAHardClose();

   PandaSignal sig;
   if(!ReadPandaSignal(_Symbol, sig))
   {
      if(ShowDashboard)
      {
         ObjectSetString(0, "PandaLabel", OBJPROP_TEXT,
            "PANDA EA v2 | " + _Symbol + " | NO SIGNAL FILE");
         ObjectSetInteger(0, "PandaLabel", OBJPROP_COLOR, clrOrangeRed);
      }
      return;
   }

   CheckBBStrategy(sig);
   CheckINTRAStrategy(sig);
   CheckPULLBACKStrategy(sig);
   CheckIMStrategy(sig);

   UpdateDashboard(sig);
}
//+------------------------------------------------------------------+
