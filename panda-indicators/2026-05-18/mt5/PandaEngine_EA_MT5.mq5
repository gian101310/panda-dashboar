//+------------------------------------------------------------------+
//| PandaEngine_EA_MT5.mq5                                            |
//| Panda Engine EA — 4 Strategies: BB, INTRA, PULLBACK, INTRA MASTER|
//| Reads panda_score_SYMBOL.txt from engine (MT5 version)            |
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
input int      UAE_Offset        = 4;        // UAE offset from UTC
input int      MinConfluence     = 0;        // Min confluence score to trade (0=disabled)
input bool     ShowDashboard     = true;     // Show on-chart info panel
input bool     EnableDebugLogs   = true;     // Print skip reasons in Experts log

//=== EXPOSURE GUARD ===
input bool     EnableExposureGuard              = true;  // Block overexposed signals
input int      MaxTotalOpenTrades               = 20;    // Max all open positions
input int      MaxTradesPerCurrency             = 4;     // Max positions involving one currency
input int      MaxDirectionalTradesPerCurrency  = 2;     // Max same long/short currency exposure
input bool     BlockOppositeCurrencyHedges      = false; // Block if trade hedges existing currency exposure

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

//=== PULLBACK STRATEGY ===
input bool     EnablePULLBACK    = true;     // Enable PULLBACK strategy
input ulong    PB_Magic          = 111003;   // PULLBACK: Magic number
input double   PB_ZonePips       = 15.0;     // PULLBACK: Max pips from generated S/R line
input double   PB_MinTPPips      = 50.0;     // PULLBACK: Minimum TP distance in pips
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
//| STRUCT: Panda Signal Data                                         |
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
struct SRLevel
{
   double   price;
   string   name;
   string   period;
};

//+------------------------------------------------------------------+
//| Debug helpers                                                     |
//+------------------------------------------------------------------+
string TfName()
{
   return EnumToString((ENUM_TIMEFRAMES)_Period);
}

void DebugSkip(string strategyName, string reason, PandaSignal &sig)
{
   if(!EnableDebugLogs) return;

   Print("[PANDA DEBUG] ", _Symbol, " ", TfName(), " ", strategyName,
         " skip: ", reason,
         " | gap=", sig.gap,
         " bias=", sig.bias,
         " zone=", sig.plZone,
         " hardInvalid=", sig.hardInvalid,
         " confluence=", sig.confluence,
         " spread=", GetSpreadPoints());
}

void DebugInfo(string reason)
{
   if(!EnableDebugLogs) return;

   Print("[PANDA DEBUG] ", _Symbol, " ", TfName(), " ", reason,
         " | spread=", GetSpreadPoints());
}

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   // Create ATR handle for SuperTrend
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

   Print("[PANDA EA v2 MT5] Init | BB=", EnableBB, " INTRA=", EnableINTRA,
         " PB=", EnablePULLBACK, " IM=", EnableIM);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(atrHandle != INVALID_HANDLE)
      IndicatorRelease(atrHandle);

   ObjectDelete(0, "PandaLabel");
   ObjectDelete(0, "PandaStatus");
   ObjectDelete(0, "PandaBB");
   ObjectDelete(0, "PandaINTRA");
   ObjectDelete(0, "PandaPB");
   ObjectDelete(0, "PandaIM");
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
   int handle = FileOpen(filename, FILE_READ | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(handle == INVALID_HANDLE)
   {
      sig.valid = false;
      return false;
   }

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
      StringTrimLeft(key); StringTrimRight(key);
      StringTrimLeft(value); StringTrimRight(value);
      if(StringLen(key) > 0 && StringGetCharacter(key, 0) == 65279)
         key = StringSubstr(key, 1);

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

   if(EnableDebugLogs)
      Print("[PANDA DEBUG] ", _Symbol, " ", TfName(), " loaded ", filename,
            " | gap=", sig.gap,
            " bias=", sig.bias,
            " hardInvalid=", sig.hardInvalid,
            " zone=", sig.plZone,
            " confluence=", sig.confluence);

   return true;
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
//| Fallback SL anchors when no formal swing is detected              |
//+------------------------------------------------------------------+
double FindRecentLow(int lookback)
{
   double best = 0;
   int bars = MathMin(lookback, Bars(_Symbol, PERIOD_CURRENT) - 1);
   for(int i = 1; i <= bars; i++)
   {
      double val = iLow(_Symbol, PERIOD_CURRENT, i);
      if(val > 0 && (best <= 0 || val < best))
         best = val;
   }
   return best;
}

double FindRecentHigh(int lookback)
{
   double best = 0;
   int bars = MathMin(lookback, Bars(_Symbol, PERIOD_CURRENT) - 1);
   for(int i = 1; i <= bars; i++)
   {
      double val = iHigh(_Symbol, PERIOD_CURRENT, i);
      if(val > best)
         best = val;
   }
   return best;
}

//+------------------------------------------------------------------+
//| Find nearest Support below price                                   |
//+------------------------------------------------------------------+
double FindSupport(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double bestSupport = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double low_i = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iLow(_Symbol, PERIOD_CURRENT, i - j) <= low_i ||
            iLow(_Symbol, PERIOD_CURRENT, i + j) <= low_i)
         { isSwing = false; break; }
      }
      if(isSwing && low_i < price)
      {
         double dist = price - low_i;
         if(dist < minDist) { minDist = dist; bestSupport = low_i; }
      }
   }
   return bestSupport;
}

//+------------------------------------------------------------------+
//| Find nearest Resistance above price                                |
//+------------------------------------------------------------------+
double FindResistance(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double bestResist = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double high_i = iHigh(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iHigh(_Symbol, PERIOD_CURRENT, i - j) >= high_i ||
            iHigh(_Symbol, PERIOD_CURRENT, i + j) >= high_i)
         { isSwing = false; break; }
      }
      if(isSwing && high_i > price)
      {
         double dist = high_i - price;
         if(dist < minDist) { minDist = dist; bestResist = high_i; }
      }
   }
   return bestResist;
}

//+------------------------------------------------------------------+
//| Find nearest swing high above price (for SELL pullback proximity)  |
//+------------------------------------------------------------------+
double FindSupportAbove(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double best = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double high_i = iHigh(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iHigh(_Symbol, PERIOD_CURRENT, i - j) >= high_i ||
            iHigh(_Symbol, PERIOD_CURRENT, i + j) >= high_i)
         { isSwing = false; break; }
      }
      if(isSwing && high_i > price)
      {
         double dist = high_i - price;
         if(dist < minDist) { minDist = dist; best = high_i; }
      }
   }
   return best;
}

//+------------------------------------------------------------------+
//| Find nearest swing low below price (for SELL TP target)            |
//+------------------------------------------------------------------+
double FindResistanceBelow(int lookback)
{
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double best = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double low_i = iLow(_Symbol, PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iLow(_Symbol, PERIOD_CURRENT, i - j) <= low_i ||
            iLow(_Symbol, PERIOD_CURRENT, i + j) <= low_i)
         { isSwing = false; break; }
      }
      if(isSwing && low_i < price)
      {
         double dist = price - low_i;
         if(dist < minDist) { minDist = dist; best = low_i; }
      }
   }
   return best;
}

//+------------------------------------------------------------------+
//| Check if position with given magic exists on this symbol           |
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
//| Exposure guard helpers                                             |
//+------------------------------------------------------------------+
string BaseCurrency(string symbol)
{
   string cleanSym = symbol;
   if(StringLen(cleanSym) > 6)
      cleanSym = StringSubstr(cleanSym, 0, 6);
   return StringSubstr(cleanSym, 0, 3);
}

string QuoteCurrency(string symbol)
{
   string cleanSym = symbol;
   if(StringLen(cleanSym) > 6)
      cleanSym = StringSubstr(cleanSym, 0, 6);
   return StringSubstr(cleanSym, 3, 3);
}

int DirectionalCurrencyImpact(string symbol, string currency, ENUM_POSITION_TYPE posType)
{
   string base = BaseCurrency(symbol);
   string quote = QuoteCurrency(symbol);

   if(currency != base && currency != quote)
      return 0;

   if(posType == POSITION_TYPE_BUY)
      return (currency == base) ? 1 : -1;

   return (currency == base) ? -1 : 1;
}

int SignalCurrencyImpact(string symbol, string bias, string currency)
{
   string base = BaseCurrency(symbol);
   string quote = QuoteCurrency(symbol);

   if(currency != base && currency != quote)
      return 0;

   if(bias == "BUY")
      return (currency == base) ? 1 : -1;

   if(bias == "SELL")
      return (currency == base) ? -1 : 1;

   return 0;
}

void GetCurrencyExposure(string currency, int &total, int &sameDirection, int &oppositeDirection, int newImpact)
{
   total = 0;
   sameDirection = 0;
   oppositeDirection = 0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;

      string posSymbol = PositionGetString(POSITION_SYMBOL);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      int impact = DirectionalCurrencyImpact(posSymbol, currency, posType);
      if(impact == 0) continue;

      total++;
      if(impact == newImpact) sameDirection++;
      else if(impact == -newImpact) oppositeDirection++;
   }
}

bool ExposureAllowsTrade(string symbol, string bias, string strategyName, PandaSignal &sig)
{
   if(!EnableExposureGuard) return true;

   if(MaxTotalOpenTrades > 0 && PositionsTotal() >= MaxTotalOpenTrades)
   {
      DebugSkip(strategyName, StringFormat("exposure blocked: max total open trades %d reached", MaxTotalOpenTrades), sig);
      return false;
   }

   string base = BaseCurrency(symbol);
   string quote = QuoteCurrency(symbol);
   string currencies[2] = { base, quote };

   for(int i = 0; i < 2; i++)
   {
      string currency = currencies[i];
      int impact = SignalCurrencyImpact(symbol, bias, currency);
      if(impact == 0) continue;

      int total = 0, sameDirection = 0, oppositeDirection = 0;
      GetCurrencyExposure(currency, total, sameDirection, oppositeDirection, impact);

      if(MaxTradesPerCurrency > 0 && total >= MaxTradesPerCurrency)
      {
         DebugSkip(strategyName, StringFormat("exposure blocked: %s has %d open trades, max %d", currency, total, MaxTradesPerCurrency), sig);
         return false;
      }

      if(MaxDirectionalTradesPerCurrency > 0 && sameDirection >= MaxDirectionalTradesPerCurrency)
      {
         string side = (impact > 0) ? "long" : "short";
         DebugSkip(strategyName, StringFormat("exposure blocked: already %s %s on %d trades, max %d", side, currency, sameDirection, MaxDirectionalTradesPerCurrency), sig);
         return false;
      }

      if(BlockOppositeCurrencyHedges && oppositeDirection > 0)
      {
         string side = (impact > 0) ? "long" : "short";
         DebugSkip(strategyName, StringFormat("exposure blocked: %s %s hedges %d opposite trades", side, currency, oppositeDirection), sig);
         return false;
      }
   }

   return true;
}

//+------------------------------------------------------------------+
//| Get current UAE hour                                               |
//+------------------------------------------------------------------+
int GetUAEHour()
{
   MqlDateTime dt;
   datetime uaeTime = TimeGMT() + UAE_Offset * 3600;
   TimeToStruct(uaeTime, dt);
   return dt.hour;
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
      return NormPrice(lowerBand);   // Uptrend support
   else
      return NormPrice(upperBand);   // Downtrend resistance
}

//+------------------------------------------------------------------+
//| Generated support/resistance lines for PULLBACK                    |
//+------------------------------------------------------------------+
void AddSRLevel(SRLevel &levels[], int &count, double price, string name, string period)
{
   if(price <= 0) return;
   ArrayResize(levels, count + 1);
   levels[count].price = NormPrice(price);
   levels[count].name = name;
   levels[count].period = period;
   count++;
}

void GetPreviousYearHL(double &yh, double &yl)
{
   yh = 0;
   yl = DBL_MAX;
   MqlDateTime dt;
   TimeCurrent(dt);
   int prevYear = dt.year - 1;

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
      if(mdt.year == prevYear)
      {
         yh = MathMax(yh, hBuf[k]);
         yl = MathMin(yl, lBuf[k]);
      }
   }
   if(yl == DBL_MAX) { yh = 0; yl = 0; }
}

int BuildSRLevels(SRLevel &levels[])
{
   ArrayResize(levels, 0);
   double buf[];
   int count = 0;

   if(PB_UseDaily)
   {
      if(CopyHigh(_Symbol, PERIOD_D1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PDH", "DAILY");
      if(CopyLow(_Symbol, PERIOD_D1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PDL", "DAILY");
   }
   if(PB_UseWeekly)
   {
      if(CopyHigh(_Symbol, PERIOD_W1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PWH", "WEEKLY");
      if(CopyLow(_Symbol, PERIOD_W1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PWL", "WEEKLY");
   }
   if(PB_UseMonthly)
   {
      if(CopyHigh(_Symbol, PERIOD_MN1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PMH", "MONTHLY");
      if(CopyLow(_Symbol, PERIOD_MN1, 1, 1, buf) > 0) AddSRLevel(levels, count, buf[0], "PML", "MONTHLY");
   }
   if(PB_UseYearly)
   {
      double yh = 0, yl = 0;
      GetPreviousYearHL(yh, yl);
      AddSRLevel(levels, count, yh, "PYH", "YEARLY");
      AddSRLevel(levels, count, yl, "PYL", "YEARLY");
   }
   return count;
}

bool FindNearestSupport(SRLevel &levels[], double price, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;
   for(int i = 0; i < ArraySize(levels); i++)
      if(levels[i].price < price && price - levels[i].price < minDist)
      { minDist = price - levels[i].price; result = levels[i]; found = true; }
   return found;
}

bool FindNearestResistance(SRLevel &levels[], double price, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;
   for(int i = 0; i < ArraySize(levels); i++)
      if(levels[i].price > price && levels[i].price - price < minDist)
      { minDist = levels[i].price - price; result = levels[i]; found = true; }
   return found;
}

bool FindTargetResistance(SRLevel &levels[], double entry, double minPips, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;
   for(int i = 0; i < ArraySize(levels); i++)
   {
      if(levels[i].price <= entry) continue;
      double dist = levels[i].price - entry;
      if(DistanceToPips(dist) < minPips) continue;
      if(dist < minDist) { minDist = dist; result = levels[i]; found = true; }
   }
   return found;
}

bool FindTargetSupport(SRLevel &levels[], double entry, double minPips, SRLevel &result)
{
   double minDist = DBL_MAX;
   bool found = false;
   for(int i = 0; i < ArraySize(levels); i++)
   {
      if(levels[i].price >= entry) continue;
      double dist = entry - levels[i].price;
      if(DistanceToPips(dist) < minPips) continue;
      if(dist < minDist) { minDist = dist; result = levels[i]; found = true; }
   }
   return found;
}
//+------------------------------------------------------------------+
//| Execute BB / INTRA trade (swing SL, fixed RR TP)                   |
//+------------------------------------------------------------------+
bool ExecuteTrade(ENUM_ORDER_TYPE direction, ulong magic, string strategyName, double rrMultiplier)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(GetSpreadPoints() > MaxSpreadPoints)
   {
      Print("[PANDA] ", strategyName, " — Spread too high");
      return false;
   }

   trade.SetExpertMagicNumber(magic);
   trade.SetDeviationInPoints(SlippagePoints);

   double sl = 0, tp = 0, entry = 0, slDistance = 0;
   string comment = "Panda_" + strategyName;

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));
      double swingLow = FindSwingLow(SwingLookback, SwingStrength);
      if(swingLow <= 0)
      {
         swingLow = FindRecentLow(SwingLookback);
         Print("[PANDA] ", strategyName, " BUY - using recent low fallback for SL: ", swingLow);
      }
      if(swingLow <= 0) { Print("[PANDA] ", strategyName, " BUY - No SL low"); return false; }

      sl = NormPrice(swingLow - SL_Buffer_Points * point);
      slDistance = entry - sl;
      if(slDistance <= 0) { Print("[PANDA] ", strategyName, " BUY — SL >= entry"); return false; }

      tp = NormPrice(entry + slDistance * rrMultiplier);

      if(!trade.Buy(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA] Buy FAIL: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription()); return false; }

      Print("[PANDA] ", strategyName, " BUY #", trade.ResultOrder(),
            " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
   else
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));
      double swingHigh = FindSwingHigh(SwingLookback, SwingStrength);
      if(swingHigh <= 0)
      {
         swingHigh = FindRecentHigh(SwingLookback);
         Print("[PANDA] ", strategyName, " SELL - using recent high fallback for SL: ", swingHigh);
      }
      if(swingHigh <= 0) { Print("[PANDA] ", strategyName, " SELL - No SL high"); return false; }

      sl = NormPrice(swingHigh + SL_Buffer_Points * point);
      slDistance = sl - entry;
      if(slDistance <= 0) { Print("[PANDA] ", strategyName, " SELL — SL <= entry"); return false; }

      tp = NormPrice(entry - slDistance * rrMultiplier);

      if(!trade.Sell(LotSize, _Symbol, entry, sl, tp, comment))
      { Print("[PANDA] Sell FAIL: ", trade.ResultRetcode(), " ", trade.ResultRetcodeDescription()); return false; }

      Print("[PANDA] ", strategyName, " SELL #", trade.ResultOrder(),
            " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
}

//+------------------------------------------------------------------+
//| Execute PULLBACK trade                                             |
//+------------------------------------------------------------------+
bool ExecutePullbackTrade(ENUM_ORDER_TYPE direction, PandaSignal &sig)
{
   if(GetSpreadPoints() > MaxSpreadPoints)
   {
      DebugSkip("PULLBACK", StringFormat("spread too high, max=%d", MaxSpreadPoints), sig);
      return false;
   }

   trade.SetExpertMagicNumber(PB_Magic);
   trade.SetDeviationInPoints(SlippagePoints);

   SRLevel levels[];
   int levelCount = BuildSRLevels(levels);
   if(levelCount < 2) { Print("[PANDA] PB - Not enough generated S/R lines"); return false; }

   double entry = 0, sl = 0, tp = 0, tpDistance = 0, slDistance = 0;
   string comment = "Panda_PB";
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   if(direction == ORDER_TYPE_BUY)
   {
      entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_ASK));
      SRLevel entryLevel;
      if(!FindNearestSupport(levels, entry, entryLevel))
      { Print("[PANDA] PB BUY - No generated support below"); return false; }

      double distPips = DistanceToPips(entry - entryLevel.price);
      if(distPips > PB_ZonePips)
      { Print("[PANDA] PB BUY - Too far from ", entryLevel.name, " (", DoubleToString(distPips,1), " pips, max ", DoubleToString(PB_ZonePips,1), ")"); return false; }

      SRLevel tpLevel;
      if(!FindTargetResistance(levels, entry, PB_MinTPPips, tpLevel))
      { Print("[PANDA] PB BUY - No generated resistance above with min TP ", DoubleToString(PB_MinTPPips,1), " pips"); return false; }

      tp = NormPrice(tpLevel.price);
      tpDistance = tp - entry;
      if(tpDistance <= 0) return false;

      double tpPips = DistanceToPips(tpDistance);
      double slRatio = 2.0;
      if(tpPips >= 300)      slRatio = 4.0;
      else if(tpPips >= 200) slRatio = 3.0;
      slDistance = tpDistance / slRatio;
      sl = NormPrice(entry - slDistance);

      Print("[PANDA] PB BUY | Entry near ", entryLevel.name, "=", DoubleToString(entryLevel.price, digits),
            " | TP ", tpLevel.name, "=", DoubleToString(tpLevel.price, digits),
            " | TP=", DoubleToString(tpPips,1), " pips SL=", DoubleToString(DistanceToPips(slDistance),1), " pips");

      if(!trade.Buy(LotSize, _Symbol, entry, sl, tp, comment + "_" + entryLevel.name))
      { Print("[PANDA] PB Buy FAIL: ", trade.ResultRetcodeDescription()); return false; }
      Print("[PANDA] PB BUY #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }

   entry = NormPrice(SymbolInfoDouble(_Symbol, SYMBOL_BID));
   SRLevel entryLevel;
   if(!FindNearestResistance(levels, entry, entryLevel))
   { Print("[PANDA] PB SELL - No generated resistance above"); return false; }

   double distPips = DistanceToPips(entryLevel.price - entry);
   if(distPips > PB_ZonePips)
   { Print("[PANDA] PB SELL - Too far from ", entryLevel.name, " (", DoubleToString(distPips,1), " pips, max ", DoubleToString(PB_ZonePips,1), ")"); return false; }

   SRLevel tpLevel;
   if(!FindTargetSupport(levels, entry, PB_MinTPPips, tpLevel))
   { Print("[PANDA] PB SELL - No generated support below with min TP ", DoubleToString(PB_MinTPPips,1), " pips"); return false; }

   tp = NormPrice(tpLevel.price);
   tpDistance = entry - tp;
   if(tpDistance <= 0) return false;

   double tpPips = DistanceToPips(tpDistance);
   double slRatio = 2.0;
   if(tpPips >= 300)      slRatio = 4.0;
   else if(tpPips >= 200) slRatio = 3.0;
   slDistance = tpDistance / slRatio;
   sl = NormPrice(entry + slDistance);

   Print("[PANDA] PB SELL | Entry near ", entryLevel.name, "=", DoubleToString(entryLevel.price, digits),
         " | TP ", tpLevel.name, "=", DoubleToString(tpLevel.price, digits),
         " | TP=", DoubleToString(tpPips,1), " pips SL=", DoubleToString(DistanceToPips(slDistance),1), " pips");

   if(!trade.Sell(LotSize, _Symbol, entry, sl, tp, comment + "_" + entryLevel.name))
   { Print("[PANDA] PB Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }
   Print("[PANDA] PB SELL #", trade.ResultOrder(), " E=", entry, " SL=", sl, " TP=", tp);
   return true;
}
//+------------------------------------------------------------------+
bool ExecuteIMTrade(ENUM_ORDER_TYPE direction)
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   if(GetSpreadPoints() > MaxSpreadPoints)
   {
      DebugInfo(StringFormat("IM skip: spread too high, max=%d", MaxSpreadPoints));
      return false;
   }

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
            if(swLow <= 0)
            {
               swLow = FindRecentLow(SwingLookback);
               Print("[PANDA] IM BUY - using recent low fallback for SL: ", swLow);
            }
            if(swLow <= 0) { Print("[PANDA] IM BUY - No SL level"); return false; }
            sl = NormPrice(swLow - SL_Buffer_Points * point);
         }
         else
            sl = NormPrice(st - IM_ST_Buffer * point);
      }
      else
      {
         double swLow = FindSwingLow(SwingLookback, SwingStrength);
         if(swLow <= 0)
         {
            swLow = FindRecentLow(SwingLookback);
            Print("[PANDA] IM BUY - using recent low fallback for SL: ", swLow);
         }
         if(swLow <= 0) { Print("[PANDA] IM BUY - No swing low"); return false; }
         sl = NormPrice(swLow - SL_Buffer_Points * point);
      }

      if(entry - sl <= 0) { Print("[PANDA] IM BUY — SL >= entry"); return false; }

      double slDist = entry - sl;
      double safeTP = NormPrice(entry + slDist * 10);

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
            if(swHigh <= 0)
            {
               swHigh = FindRecentHigh(SwingLookback);
               Print("[PANDA] IM SELL - using recent high fallback for SL: ", swHigh);
            }
            if(swHigh <= 0) { Print("[PANDA] IM SELL - No SL level"); return false; }
            sl = NormPrice(swHigh + SL_Buffer_Points * point);
         }
         else
            sl = NormPrice(st + IM_ST_Buffer * point);
      }
      else
      {
         double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
         if(swHigh <= 0)
         {
            swHigh = FindRecentHigh(SwingLookback);
            Print("[PANDA] IM SELL - using recent high fallback for SL: ", swHigh);
         }
         if(swHigh <= 0) { Print("[PANDA] IM SELL - No swing high"); return false; }
         sl = NormPrice(swHigh + SL_Buffer_Points * point);
      }

      if(sl - entry <= 0) { Print("[PANDA] IM SELL — SL <= entry"); return false; }

      double slDist = sl - entry;
      double safeTP = NormPrice(entry - slDist * 10);

      if(!trade.Sell(LotSize, _Symbol, entry, sl, safeTP, comment))
      { Print("[PANDA] IM Sell FAIL: ", trade.ResultRetcodeDescription()); return false; }

      Print("[PANDA] IM SELL #", trade.ResultOrder(), " E=", entry, " SL=", sl, " (trail)");
      return true;
   }
}

//+------------------------------------------------------------------+
//| Close all positions with given magic                               |
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
         Print("[PANDA] Close FAIL #", ticket, " Err=", GetLastError());
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

         // Phase 1: Break-even
         if(currentProfit >= slDistance && currentSL < openPrice)
         {
            double newSL = NormPrice(openPrice + point);
            if(newSL > currentSL)
            {
               trade.PositionModify(ticket, newSL, currentTP);
               Print("[PANDA] IM #", ticket, " → BREAK EVEN at ", newSL);
            }
         }
         // Phase 2: Trail
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

         // Phase 1: Break-even
         if(currentProfit >= slDistance && currentSL > openPrice)
         {
            double newSL = NormPrice(openPrice - point);
            if(newSL < currentSL)
            {
               trade.PositionModify(ticket, newSL, currentTP);
               Print("[PANDA] IM #", ticket, " → BREAK EVEN at ", newSL);
            }
         }
         // Phase 2: Trail
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
   if(!EnableBB) { DebugSkip("BB", "disabled", sig); return; }
   if(HasOpenTrade(BB_Magic)) { DebugSkip("BB", "already has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("BB", "hard invalid signal", sig); return; }
   if(MathAbs(sig.gap) < 5) { DebugSkip("BB", "gap below 5", sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("BB", "bias is not BUY/SELL", sig); return; }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("BB", "confluence below minimum", sig); return; }

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   DebugSkip("BB", "entry conditions passed, sending order", sig);
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "BB", sig)) return;
   ExecuteTrade(dir, BB_Magic, "BB", BB_RR);
}

//+------------------------------------------------------------------+
//| INTRA Strategy                                                     |
//+------------------------------------------------------------------+
void CheckINTRAStrategy(PandaSignal &sig)
{
   if(!EnableINTRA) { DebugSkip("INTRA", "disabled", sig); return; }
   if(HasOpenTrade(INTRA_Magic)) { DebugSkip("INTRA", "already has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("INTRA", "hard invalid signal", sig); return; }
   if(MathAbs(sig.gap) < 9) { DebugSkip("INTRA", "gap below 9", sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("INTRA", "bias is not BUY/SELL", sig); return; }
   if(sig.bias == "BUY" && sig.plZone != "ABOVE") { DebugSkip("INTRA", "BUY requires PL_ZONE ABOVE", sig); return; }
   if(sig.bias == "SELL" && sig.plZone != "BELOW") { DebugSkip("INTRA", "SELL requires PL_ZONE BELOW", sig); return; }

   int uaeHour = GetUAEHour();
   if(uaeHour < IntraStartHour || uaeHour >= IntraEndHour)
   {
      DebugSkip("INTRA", StringFormat("outside UAE entry window, hour=%d window=%d-%d", uaeHour, IntraStartHour, IntraEndHour), sig);
      return;
   }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("INTRA", "confluence below minimum", sig); return; }

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   DebugSkip("INTRA", "entry conditions passed, sending order", sig);
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "INTRA", sig)) return;
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
//| PULLBACK Strategy                                                  |
//+------------------------------------------------------------------+
void CheckPULLBACKStrategy(PandaSignal &sig)
{
   if(!EnablePULLBACK) { DebugSkip("PULLBACK", "disabled", sig); return; }
   if(HasOpenTrade(PB_Magic)) { DebugSkip("PULLBACK", "already has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("PULLBACK", "hard invalid signal", sig); return; }
   if(MathAbs(sig.gap) < PB_MinGap) { DebugSkip("PULLBACK", StringFormat("gap below PB_MinGap %d", PB_MinGap), sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("PULLBACK", "bias is not BUY/SELL", sig); return; }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("PULLBACK", "confluence below minimum", sig); return; }

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   DebugSkip("PULLBACK", "entry conditions passed, checking S/R order setup", sig);
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "PULLBACK", sig)) return;
   ExecutePullbackTrade(dir, sig);
}

//+------------------------------------------------------------------+
//| INTRA MASTER Strategy                                              |
//+------------------------------------------------------------------+
void CheckIMStrategy(PandaSignal &sig)
{
   if(!EnableIM) { DebugSkip("IM", "disabled", sig); return; }
   if(HasOpenTrade(IM_Magic)) { DebugSkip("IM", "already has open trade", sig); return; }
   if(sig.hardInvalid) { DebugSkip("IM", "hard invalid signal", sig); return; }
   if(MathAbs(sig.gap) < 9) { DebugSkip("IM", "gap below 9", sig); return; }
   if(sig.bias != "BUY" && sig.bias != "SELL") { DebugSkip("IM", "bias is not BUY/SELL", sig); return; }
   if(sig.bias == "BUY" && sig.plZone != "ABOVE") { DebugSkip("IM", "BUY requires PL_ZONE ABOVE", sig); return; }
   if(sig.bias == "SELL" && sig.plZone != "BELOW") { DebugSkip("IM", "SELL requires PL_ZONE BELOW", sig); return; }
   if(MinConfluence > 0 && sig.confluence < MinConfluence) { DebugSkip("IM", "confluence below minimum", sig); return; }

   ENUM_ORDER_TYPE dir = (sig.bias == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   DebugSkip("IM", "entry conditions passed, sending order", sig);
   if(!ExposureAllowsTrade(_Symbol, sig.bias, "IM", sig)) return;
   ExecuteIMTrade(dir);
}

//+------------------------------------------------------------------+
//| Helper: create/update a chart label                                |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, int fontSize, color clr)
{
   if(!ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0))
   {}
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

   string mainText = StringFormat("PANDA EA v2 MT5 | %s | Gap:%d | Bias:%s | Zone:%s | Conf:%d",
                                   _Symbol, sig.gap, sig.bias, sig.plZone, sig.confluence);
   ObjectSetString(0, "PandaLabel", OBJPROP_TEXT, mainText);
   ObjectSetInteger(0, "PandaLabel", OBJPROP_COLOR, panelColor);

   CreateLabel("PandaBB", 15, 45, 9, EnableBB ? clrAqua : clrDarkGray);
   string bbSt = EnableBB ? (HasOpenTrade(BB_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaBB", OBJPROP_TEXT,
      StringFormat("BB: %s | RR 1:%.0f | Mom: %s", bbSt, BB_RR, sig.momentum));

   CreateLabel("PandaINTRA", 15, 62, 9, EnableINTRA ? clrGold : clrDarkGray);
   string iSt = EnableINTRA ? (HasOpenTrade(INTRA_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaINTRA", OBJPROP_TEXT,
      StringFormat("INTRA: %s | UAE:%02d:00 | Window %d-%dAM | Close %dAM",
                   iSt, GetUAEHour(), IntraStartHour, IntraEndHour, IntraCloseHour));

   CreateLabel("PandaPB", 15, 79, 9, EnablePULLBACK ? clrMagenta : clrDarkGray);
   string pbSt = EnablePULLBACK ? (HasOpenTrade(PB_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaPB", OBJPROP_TEXT,
      StringFormat("PULLBACK: %s | Zone %.0f pip | Min TP %.0f", pbSt, PB_ZonePips, PB_MinTPPips));

   CreateLabel("PandaIM", 15, 96, 9, EnableIM ? clrOrange : clrDarkGray);
   string imSt = EnableIM ? (HasOpenTrade(IM_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   string slType = IM_UseSuperTrend ? "SuperTrend" : "Swing";
   ObjectSetString(0, "PandaIM", OBJPROP_TEXT,
      StringFormat("IM: %s | SL:%s | Trail:%s", imSt, slType,
                   HasOpenTrade(IM_Magic) ? "RUNNING" : "---"));

   CreateLabel("PandaStatus", 15, 113, 8, clrDarkGray);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   string swLow  = DoubleToString(FindSwingLow(SwingLookback, SwingStrength), digits);
   string swHigh = DoubleToString(FindSwingHigh(SwingLookback, SwingStrength), digits);
   ObjectSetString(0, "PandaStatus", OBJPROP_TEXT,
      StringFormat("SwLo:%s | SwHi:%s | Lot:%.2f | Box H1:%s H4:%s",
                   swLow, swHigh, LotSize, sig.boxH1, sig.boxH4));
}

//+------------------------------------------------------------------+
//| Expert tick function                                               |
//+------------------------------------------------------------------+
void OnTick()
{
   // Trail stop runs every tick
   ManageIMTrailingStop();

   // Throttle signal checks
   static datetime lastCheck = 0;
   if(TimeCurrent() - lastCheck < CheckIntervalSec) return;
   lastCheck = TimeCurrent();

   CheckINTRAHardClose();

   PandaSignal sig;
   if(!ReadPandaSignal(_Symbol, sig))
   {
      DebugInfo("NO SIGNAL FILE");
      if(ShowDashboard)
      {
         ObjectSetString(0, "PandaLabel", OBJPROP_TEXT,
            "PANDA EA v2 MT5 | " + _Symbol + " | NO SIGNAL FILE");
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
