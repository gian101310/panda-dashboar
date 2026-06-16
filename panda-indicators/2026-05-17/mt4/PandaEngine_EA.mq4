//+------------------------------------------------------------------+
//| PandaEngine_EA.mq4                                                |
//| Panda Engine EA — 4 Strategies: BB, INTRA, PULLBACK, INTRA MASTER|
//| Reads panda_score_SYMBOL.txt from engine                          |
//+------------------------------------------------------------------+
#property copyright "Panda Engine"
#property link      "https://pandaengine.app"
#property version   "2.00"
#property strict

//=== GENERAL INPUTS ===
input double   LotSize           = 0.01;     // Lot size
input int      SwingLookback     = 20;       // Bars to scan for swing high/low
input int      SwingStrength     = 3;        // Bars on each side to confirm swing
input int      SlippagePoints    = 30;       // Max slippage in points
input int      MaxSpreadPoints   = 40;       // Max spread to allow entry (points)
input double   SL_Buffer_Points  = 50;       // Buffer beyond swing for SL (points)
input int      UAE_Offset        = 4;        // UAE = UTC+4 (broker offset from UTC)
input int      MinConfluence     = 0;        // Min confluence score to trade (0=disabled)
input bool     ShowDashboard     = true;     // Show on-chart info panel

//=== BB STRATEGY ===
input bool     EnableBB          = true;     // Enable BB strategy
input double   BB_RR             = 2.0;      // BB: TP = RR x SL distance
input int      BB_Magic          = 111001;   // BB: Magic number

//=== INTRA STRATEGY ===
input bool     EnableINTRA       = true;     // Enable INTRA strategy
input double   INTRA_RR          = 2.0;      // INTRA: TP = RR x SL distance
input int      INTRA_Magic       = 111002;   // INTRA: Magic number
input int      IntraStartHour    = 2;        // INTRA: Entry window start (UAE)
input int      IntraEndHour      = 4;        // INTRA: Entry window end (UAE)
input int      IntraCloseHour    = 10;       // INTRA: Hard close hour (UAE)

//=== PULLBACK STRATEGY ===
input bool     EnablePULLBACK    = true;     // Enable PULLBACK strategy
input int      PB_Magic          = 111003;   // PULLBACK: Magic number
input int      PB_SupportBars    = 50;       // PULLBACK: Bars to find S/R
input double   PB_ZoneBuffer     = 30;       // PULLBACK: Points buffer for S/R zone
input int      PB_MinGap         = 5;        // PULLBACK: Minimum gap score

//=== INTRA MASTER STRATEGY ===
input bool     EnableIM          = true;     // Enable INTRA MASTER strategy
input int      IM_Magic          = 111004;   // IM: Magic number
input int      IM_SuperTrendPd   = 10;       // IM: SuperTrend ATR period
input double   IM_SuperTrendMul  = 3.0;      // IM: SuperTrend multiplier
input bool     IM_UseSuperTrend  = true;     // IM: Use SuperTrend for SL (false=swing)
input double   IM_ST_Buffer      = 30;       // IM: Buffer below/above SuperTrend (pts)
input double   IM_TrailStep      = 20;       // IM: Trail step in points (min move)

//--- Global variables
string   CommonPath;
int      CheckIntervalSec = 30;

//+------------------------------------------------------------------+
//| Expert initialization                                             |
//+------------------------------------------------------------------+
int OnInit()
{
   CommonPath = TerminalInfoString(TERMINAL_COMMONDATA_PATH) + "\\Files\\";

   if(ShowDashboard)
   {
      ObjectCreate(0, "PandaLabel", OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_XDISTANCE, 15);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_YDISTANCE, 25);
      ObjectSetString(0, "PandaLabel", OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, "PandaLabel", OBJPROP_FONTSIZE, 10);
      ObjectSetInteger(0, "PandaLabel", OBJPROP_COLOR, clrLime);
      ObjectSetString(0, "PandaLabel", OBJPROP_TEXT, "Panda EA v2: Initializing...");
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
   ObjectDelete(0, "PandaLabel");
   ObjectDelete(0, "PandaStatus");
   ObjectDelete(0, "PandaBB");
   ObjectDelete(0, "PandaINTRA");
   ObjectDelete(0, "PandaPB");
   ObjectDelete(0, "PandaIM");
}

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
//| Find Previous Swing Low (for BUY stop loss)                       |
//+------------------------------------------------------------------+
double FindSwingLow(int lookback, int strength)
{
   for(int i = strength + 1; i < lookback; i++)
   {
      double low_i = iLow(Symbol(), PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= strength; j++)
      {
         if(iLow(Symbol(), PERIOD_CURRENT, i - j) <= low_i ||
            iLow(Symbol(), PERIOD_CURRENT, i + j) <= low_i)
         { isSwing = false; break; }
      }
      if(isSwing) return low_i;
   }
   return 0;
}

//+------------------------------------------------------------------+
//| Find Previous Swing High (for SELL stop loss)                     |
//+------------------------------------------------------------------+
double FindSwingHigh(int lookback, int strength)
{
   for(int i = strength + 1; i < lookback; i++)
   {
      double high_i = iHigh(Symbol(), PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= strength; j++)
      {
         if(iHigh(Symbol(), PERIOD_CURRENT, i - j) >= high_i ||
            iHigh(Symbol(), PERIOD_CURRENT, i + j) >= high_i)
         { isSwing = false; break; }
      }
      if(isSwing) return high_i;
   }
   return 0;
}

//+------------------------------------------------------------------+
//| Find nearest Support (lowest low in lookback below current price)  |
//+------------------------------------------------------------------+
double FindSupport(int lookback)
{
   double price = MarketInfo(Symbol(), MODE_BID);
   double bestSupport = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double low_i = iLow(Symbol(), PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iLow(Symbol(), PERIOD_CURRENT, i - j) <= low_i ||
            iLow(Symbol(), PERIOD_CURRENT, i + j) <= low_i)
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
//| Find nearest Resistance (highest high above current price)         |
//+------------------------------------------------------------------+
double FindResistance(int lookback)
{
   double price = MarketInfo(Symbol(), MODE_BID);
   double bestResist = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double high_i = iHigh(Symbol(), PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iHigh(Symbol(), PERIOD_CURRENT, i - j) >= high_i ||
            iHigh(Symbol(), PERIOD_CURRENT, i + j) >= high_i)
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
//| Find nearest Support ABOVE current price (for SELL pullback)       |
//+------------------------------------------------------------------+
double FindSupportAbove(int lookback)
{
   double price = MarketInfo(Symbol(), MODE_BID);
   double bestSupport = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double high_i = iHigh(Symbol(), PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iHigh(Symbol(), PERIOD_CURRENT, i - j) >= high_i ||
            iHigh(Symbol(), PERIOD_CURRENT, i + j) >= high_i)
         { isSwing = false; break; }
      }
      if(isSwing && high_i > price)
      {
         double dist = high_i - price;
         if(dist < minDist) { minDist = dist; bestSupport = high_i; }
      }
   }
   return bestSupport;
}

//+------------------------------------------------------------------+
//| Find nearest Resistance BELOW current price (for SELL TP)          |
//+------------------------------------------------------------------+
double FindResistanceBelow(int lookback)
{
   double price = MarketInfo(Symbol(), MODE_BID);
   double bestResist = 0;
   double minDist = 999999;

   for(int i = SwingStrength + 1; i < lookback; i++)
   {
      double low_i = iLow(Symbol(), PERIOD_CURRENT, i);
      bool isSwing = true;
      for(int j = 1; j <= SwingStrength; j++)
      {
         if(iLow(Symbol(), PERIOD_CURRENT, i - j) <= low_i ||
            iLow(Symbol(), PERIOD_CURRENT, i + j) <= low_i)
         { isSwing = false; break; }
      }
      if(isSwing && low_i < price)
      {
         double dist = price - low_i;
         if(dist < minDist) { minDist = dist; bestResist = low_i; }
      }
   }
   return bestResist;
}

//+------------------------------------------------------------------+
//| Check if a trade with given magic already exists on this symbol    |
//+------------------------------------------------------------------+
bool HasOpenTrade(int magic)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() == Symbol() && OrderMagicNumber() == magic)
      {
         if(OrderType() == OP_BUY || OrderType() == OP_SELL)
            return true;
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Get current UAE hour                                               |
//+------------------------------------------------------------------+
int GetUAEHour()
{
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   return (dt.hour + UAE_Offset) % 24;
}

//+------------------------------------------------------------------+
//| Normalize price                                                    |
//+------------------------------------------------------------------+
double NormPrice(double price)
{
   return NormalizeDouble(price, (int)MarketInfo(Symbol(), MODE_DIGITS));
}

//+------------------------------------------------------------------+
//| Convert price distance to pips (handles 4/5 digit brokers)         |
//+------------------------------------------------------------------+
double DistanceToPips(double distance)
{
   int digits = (int)MarketInfo(Symbol(), MODE_DIGITS);
   double pipSize = (digits == 3 || digits == 5) ? 10 * MarketInfo(Symbol(), MODE_POINT)
                                                  : MarketInfo(Symbol(), MODE_POINT);
   if(pipSize == 0) return 0;
   return distance / pipSize;
}

//+------------------------------------------------------------------+
//| SuperTrend calculation (returns the SuperTrend level)               |
//+------------------------------------------------------------------+
double GetSuperTrend(int period, double multiplier, int shift)
{
   // Simple SuperTrend: ATR-based trailing stop
   double atr = iATR(Symbol(), PERIOD_CURRENT, period, shift);
   double median = (iHigh(Symbol(), PERIOD_CURRENT, shift) +
                    iLow(Symbol(), PERIOD_CURRENT, shift)) / 2.0;

   double upperBand = median + multiplier * atr;
   double lowerBand = median - multiplier * atr;

   // Determine trend direction from close vs previous SuperTrend
   double prevClose = iClose(Symbol(), PERIOD_CURRENT, shift + 1);

   // Simple approach: if close > median → uptrend → return lowerBand (support)
   //                  if close < median → downtrend → return upperBand (resistance)
   double close = iClose(Symbol(), PERIOD_CURRENT, shift);
   if(close > median)
      return NormPrice(lowerBand);  // Uptrend: ST acts as support below
   else
      return NormPrice(upperBand);  // Downtrend: ST acts as resistance above
}

//+------------------------------------------------------------------+
//| Execute BB / INTRA trade (swing SL, fixed RR TP)                   |
//+------------------------------------------------------------------+
bool ExecuteTrade(int direction, int magic, string strategyName, double rrMultiplier)
{
   double point  = MarketInfo(Symbol(), MODE_POINT);
   double spread = MarketInfo(Symbol(), MODE_SPREAD);

   if(spread > MaxSpreadPoints)
   {
      Print("[PANDA] ", strategyName, " — Spread too high: ", spread);
      return false;
   }

   double sl = 0, tp = 0, entry = 0, slDistance = 0;
   string comment = "Panda_" + strategyName;

   if(direction == OP_BUY)
   {
      entry = NormPrice(MarketInfo(Symbol(), MODE_ASK));
      double swingLow = FindSwingLow(SwingLookback, SwingStrength);
      if(swingLow <= 0) { Print("[PANDA] ", strategyName, " BUY — No swing low"); return false; }

      sl = NormPrice(swingLow - SL_Buffer_Points * point);
      slDistance = entry - sl;
      if(slDistance <= 0) { Print("[PANDA] ", strategyName, " BUY — SL >= entry"); return false; }

      tp = NormPrice(entry + slDistance * rrMultiplier);

      int ticket = OrderSend(Symbol(), OP_BUY, LotSize, entry, SlippagePoints,
                             sl, tp, comment, magic, 0, clrLime);
      if(ticket < 0) { Print("[PANDA] OrderSend FAIL: ", GetLastError()); return false; }
      Print("[PANDA] ", strategyName, " BUY #", ticket, " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
   else
   {
      entry = NormPrice(MarketInfo(Symbol(), MODE_BID));
      double swingHigh = FindSwingHigh(SwingLookback, SwingStrength);
      if(swingHigh <= 0) { Print("[PANDA] ", strategyName, " SELL — No swing high"); return false; }

      sl = NormPrice(swingHigh + SL_Buffer_Points * point);
      slDistance = sl - entry;
      if(slDistance <= 0) { Print("[PANDA] ", strategyName, " SELL — SL <= entry"); return false; }

      tp = NormPrice(entry - slDistance * rrMultiplier);

      int ticket = OrderSend(Symbol(), OP_SELL, LotSize, entry, SlippagePoints,
                             sl, tp, comment, magic, 0, clrRed);
      if(ticket < 0) { Print("[PANDA] OrderSend FAIL: ", GetLastError()); return false; }
      Print("[PANDA] ", strategyName, " SELL #", ticket, " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
}

//+------------------------------------------------------------------+
//| Execute PULLBACK trade (support entry, resistance TP, ratio SL)    |
//+------------------------------------------------------------------+
bool ExecutePullbackTrade(int direction, PandaSignal &sig)
{
   double point  = MarketInfo(Symbol(), MODE_POINT);
   double spread = MarketInfo(Symbol(), MODE_SPREAD);
   if(spread > MaxSpreadPoints) return false;

   double entry = 0, sl = 0, tp = 0;
   double tpDistance = 0, slDistance = 0;
   string comment = "Panda_PB";

   if(direction == OP_BUY)
   {
      // BUY pullback: price is near support, TP at resistance
      entry = NormPrice(MarketInfo(Symbol(), MODE_ASK));
      double support    = FindSupport(PB_SupportBars);
      double resistance = FindResistance(PB_SupportBars);

      if(support <= 0 || resistance <= 0)
      { Print("[PANDA] PB BUY — No S/R found"); return false; }

      // Check price is near support (within buffer zone)
      double distToSupport = (entry - support) / point;
      if(distToSupport > PB_ZoneBuffer * 3)
      { Print("[PANDA] PB BUY — Price too far from support: ", distToSupport, " pts"); return false; }

      tp = NormPrice(resistance);
      tpDistance = tp - entry;
      if(tpDistance <= 0) { Print("[PANDA] PB BUY — Resistance below entry"); return false; }

      // SL ratio based on TP distance in pips
      double tpPips = DistanceToPips(tpDistance);
      double slRatio = 2.0;  // default: TP < 100 pips → SL = TP/2
      if(tpPips >= 300)      slRatio = 4.0;
      else if(tpPips >= 200) slRatio = 3.0;
      else if(tpPips >= 100) slRatio = 2.0;

      slDistance = tpDistance / slRatio;
      sl = NormPrice(entry - slDistance);

      Print("[PANDA] PB BUY | TP pips=", DoubleToString(tpPips, 1),
            " ratio=1/", slRatio, " SL dist=", DoubleToString(DistanceToPips(slDistance), 1), " pips");

      int ticket = OrderSend(Symbol(), OP_BUY, LotSize, entry, SlippagePoints,
                             sl, tp, comment, PB_Magic, 0, clrLime);
      if(ticket < 0) { Print("[PANDA] PB OrderSend FAIL: ", GetLastError()); return false; }
      Print("[PANDA] PB BUY #", ticket, " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
   else
   {
      // SELL pullback: price is near resistance, TP at support
      entry = NormPrice(MarketInfo(Symbol(), MODE_BID));
      double resistance = FindResistance(PB_SupportBars);  // nearest resist above
      double support    = FindSupport(PB_SupportBars);      // nearest support below

      // For SELL: we want to enter near resistance (above), TP at support (below)
      // Actually for SELL pullback: price pulled back UP to resistance → sell down to support
      double resistAbove = FindSupportAbove(PB_SupportBars);  // swing high above price
      double supportBelow = FindResistanceBelow(PB_SupportBars); // swing low below price

      // Use nearest resistance above and support below
      if(resistAbove <= 0) resistAbove = FindSwingHigh(PB_SupportBars, SwingStrength);
      if(supportBelow <= 0) supportBelow = FindSwingLow(PB_SupportBars, SwingStrength);

      if(supportBelow <= 0)
      { Print("[PANDA] PB SELL — No support below found"); return false; }

      // Check price is near resistance
      if(resistAbove > 0)
      {
         double distToResist = (resistAbove - entry) / point;
         if(distToResist > PB_ZoneBuffer * 3)
         { Print("[PANDA] PB SELL — Price too far from resistance"); return false; }
      }

      tp = NormPrice(supportBelow);
      tpDistance = entry - tp;
      if(tpDistance <= 0) { Print("[PANDA] PB SELL — Support above entry"); return false; }

      double tpPips = DistanceToPips(tpDistance);
      double slRatio = 2.0;
      if(tpPips >= 300)      slRatio = 4.0;
      else if(tpPips >= 200) slRatio = 3.0;
      else if(tpPips >= 100) slRatio = 2.0;

      slDistance = tpDistance / slRatio;
      sl = NormPrice(entry + slDistance);

      Print("[PANDA] PB SELL | TP pips=", DoubleToString(tpPips, 1),
            " ratio=1/", slRatio, " SL dist=", DoubleToString(DistanceToPips(slDistance), 1), " pips");

      int ticket = OrderSend(Symbol(), OP_SELL, LotSize, entry, SlippagePoints,
                             sl, tp, comment, PB_Magic, 0, clrRed);
      if(ticket < 0) { Print("[PANDA] PB OrderSend FAIL: ", GetLastError()); return false; }
      Print("[PANDA] PB SELL #", ticket, " E=", entry, " SL=", sl, " TP=", tp);
      return true;
   }
}

//+------------------------------------------------------------------+
//| Execute INTRA MASTER trade (SuperTrend/swing SL, no TP — trail)    |
//+------------------------------------------------------------------+
bool ExecuteIMTrade(int direction)
{
   double point  = MarketInfo(Symbol(), MODE_POINT);
   double spread = MarketInfo(Symbol(), MODE_SPREAD);
   if(spread > MaxSpreadPoints) return false;

   double entry = 0, sl = 0;
   string comment = "Panda_IM";

   if(direction == OP_BUY)
   {
      entry = NormPrice(MarketInfo(Symbol(), MODE_ASK));

      if(IM_UseSuperTrend)
      {
         double st = GetSuperTrend(IM_SuperTrendPd, IM_SuperTrendMul, 1);
         // For BUY, SuperTrend should be BELOW price (uptrend)
         if(st >= entry)
         {
            // Fallback to swing low
            double swLow = FindSwingLow(SwingLookback, SwingStrength);
            if(swLow <= 0) { Print("[PANDA] IM BUY — No SL level"); return false; }
            sl = NormPrice(swLow - SL_Buffer_Points * point);
         }
         else
         {
            sl = NormPrice(st - IM_ST_Buffer * point);
         }
      }
      else
      {
         double swLow = FindSwingLow(SwingLookback, SwingStrength);
         if(swLow <= 0) { Print("[PANDA] IM BUY — No swing low"); return false; }
         sl = NormPrice(swLow - SL_Buffer_Points * point);
      }

      if(entry - sl <= 0) { Print("[PANDA] IM BUY — SL >= entry"); return false; }

      // NO TP set — we'll trail stop instead. Set a very wide safety TP.
      double slDist = entry - sl;
      double safeTP = NormPrice(entry + slDist * 10);  // 1:10 safety ceiling

      int ticket = OrderSend(Symbol(), OP_BUY, LotSize, entry, SlippagePoints,
                             sl, safeTP, comment, IM_Magic, 0, clrLime);
      if(ticket < 0) { Print("[PANDA] IM OrderSend FAIL: ", GetLastError()); return false; }
      Print("[PANDA] IM BUY #", ticket, " E=", entry, " SL=", sl, " (trail active)");
      return true;
   }
   else
   {
      entry = NormPrice(MarketInfo(Symbol(), MODE_BID));

      if(IM_UseSuperTrend)
      {
         double st = GetSuperTrend(IM_SuperTrendPd, IM_SuperTrendMul, 1);
         if(st <= entry)
         {
            double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
            if(swHigh <= 0) { Print("[PANDA] IM SELL — No SL level"); return false; }
            sl = NormPrice(swHigh + SL_Buffer_Points * point);
         }
         else
         {
            sl = NormPrice(st + IM_ST_Buffer * point);
         }
      }
      else
      {
         double swHigh = FindSwingHigh(SwingLookback, SwingStrength);
         if(swHigh <= 0) { Print("[PANDA] IM SELL — No swing high"); return false; }
         sl = NormPrice(swHigh + SL_Buffer_Points * point);
      }

      if(sl - entry <= 0) { Print("[PANDA] IM SELL — SL <= entry"); return false; }

      double slDist = sl - entry;
      double safeTP = NormPrice(entry - slDist * 10);

      int ticket = OrderSend(Symbol(), OP_SELL, LotSize, entry, SlippagePoints,
                             sl, safeTP, comment, IM_Magic, 0, clrRed);
      if(ticket < 0) { Print("[PANDA] IM OrderSend FAIL: ", GetLastError()); return false; }
      Print("[PANDA] IM SELL #", ticket, " E=", entry, " SL=", sl, " (trail active)");
      return true;
   }
}

//+------------------------------------------------------------------+
//| Close all trades with given magic                                  |
//+------------------------------------------------------------------+
void CloseTradesByMagic(int magic, string reason)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol() || OrderMagicNumber() != magic) continue;

      double closePrice = (OrderType() == OP_BUY) ? MarketInfo(Symbol(), MODE_BID)
                                                   : MarketInfo(Symbol(), MODE_ASK);
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;

      bool closed = OrderClose(OrderTicket(), OrderLots(), closePrice, SlippagePoints, clrYellow);
      if(closed) Print("[PANDA] Closed #", OrderTicket(), " | ", reason);
      else       Print("[PANDA] Close FAIL #", OrderTicket(), " Err=", GetLastError());
   }
}

//+------------------------------------------------------------------+
//| INTRA MASTER: Break-even + Trail Stop Management                   |
//| Phase 1: Move SL to break-even when profit >= original SL distance |
//| Phase 2: Trail stop to lock in further gains                       |
//+------------------------------------------------------------------+
void ManageIMTrailingStop()
{
   if(!EnableIM) return;
   double point = MarketInfo(Symbol(), MODE_POINT);

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderSymbol() != Symbol() || OrderMagicNumber() != IM_Magic) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;

      double openPrice = OrderOpenPrice();
      double currentSL = OrderStopLoss();
      double slDistance = 0;
      double currentProfit = 0;
      double newSL = 0;

      if(OrderType() == OP_BUY)
      {
         double bid = MarketInfo(Symbol(), MODE_BID);
         slDistance = openPrice - currentSL;  // Original SL distance
         currentProfit = bid - openPrice;

         // Phase 1: Break-even — when profit >= SL distance
         if(currentProfit >= slDistance && currentSL < openPrice)
         {
            newSL = NormPrice(openPrice + point);  // +1 point above entry
            if(newSL > currentSL)
            {
               bool modified = OrderModify(OrderTicket(), openPrice, newSL,
                                           OrderTakeProfit(), 0, clrAqua);
               if(modified)
                  Print("[PANDA] IM #", OrderTicket(), " → BREAK EVEN at ", newSL);
            }
         }
         // Phase 2: Trail stop — once at break-even, keep trailing
         else if(currentSL >= openPrice && currentProfit > slDistance)
         {
            // Trail: move SL up as price moves up, by trail step increments
            double trailLevel = NormPrice(bid - slDistance);  // maintain original SL distance as trail
            // But never move SL backwards
            if(trailLevel > currentSL + IM_TrailStep * point)
            {
               bool modified = OrderModify(OrderTicket(), openPrice, trailLevel,
                                           OrderTakeProfit(), 0, clrAqua);
               if(modified)
                  Print("[PANDA] IM #", OrderTicket(), " → TRAIL SL to ", trailLevel);
            }
         }
      }
      else // OP_SELL
      {
         double ask = MarketInfo(Symbol(), MODE_ASK);
         slDistance = currentSL - openPrice;
         currentProfit = openPrice - ask;

         // Phase 1: Break-even
         if(currentProfit >= slDistance && currentSL > openPrice)
         {
            newSL = NormPrice(openPrice - point);
            if(newSL < currentSL)
            {
               bool modified = OrderModify(OrderTicket(), openPrice, newSL,
                                           OrderTakeProfit(), 0, clrAqua);
               if(modified)
                  Print("[PANDA] IM #", OrderTicket(), " → BREAK EVEN at ", newSL);
            }
         }
         // Phase 2: Trail stop
         else if(currentSL <= openPrice && currentProfit > slDistance)
         {
            double trailLevel = NormPrice(ask + slDistance);
            if(trailLevel < currentSL - IM_TrailStep * point)
            {
               bool modified = OrderModify(OrderTicket(), openPrice, trailLevel,
                                           OrderTakeProfit(), 0, clrAqua);
               if(modified)
                  Print("[PANDA] IM #", OrderTicket(), " → TRAIL SL to ", trailLevel);
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

   int dir = (sig.bias == "BUY") ? OP_BUY : OP_SELL;
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

   int dir = (sig.bias == "BUY") ? OP_BUY : OP_SELL;
   ExecuteTrade(dir, INTRA_Magic, "INTRA", INTRA_RR);
}

//+------------------------------------------------------------------+
//| INTRA Hard Close at 10AM UAE                                       |
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
   if(!EnablePULLBACK) return;
   if(HasOpenTrade(PB_Magic)) return;
   if(sig.hardInvalid) return;
   if(MathAbs(sig.gap) < PB_MinGap) return;
   if(sig.bias != "BUY" && sig.bias != "SELL") return;
   if(MinConfluence > 0 && sig.confluence < MinConfluence) return;

   // Pullback = execution type PULLBACK from engine (gap 5-8)
   // But also allow manual trigger when gap >= PB_MinGap

   int dir = (sig.bias == "BUY") ? OP_BUY : OP_SELL;
   ExecutePullbackTrade(dir, sig);
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

   // TBG must confirm (same as INTRA, but no time window)
   if(sig.bias == "BUY" && sig.plZone != "ABOVE") return;
   if(sig.bias == "SELL" && sig.plZone != "BELOW") return;

   if(MinConfluence > 0 && sig.confluence < MinConfluence) return;

   int dir = (sig.bias == "BUY") ? OP_BUY : OP_SELL;
   ExecuteIMTrade(dir);
}

//+------------------------------------------------------------------+
//| Update on-chart dashboard (6 lines)                                |
//+------------------------------------------------------------------+
void UpdateDashboard(PandaSignal &sig)
{
   if(!ShowDashboard) return;

   color panelColor = clrGray;
   if(sig.bias == "BUY") panelColor = clrLime;
   else if(sig.bias == "SELL") panelColor = clrRed;

   // Line 1: Main signal
   string mainText = StringFormat("PANDA EA v2 | %s | Gap:%d | Bias:%s | Zone:%s | Conf:%d",
                                   Symbol(), sig.gap, sig.bias, sig.plZone, sig.confluence);
   ObjectSetString(0, "PandaLabel", OBJPROP_TEXT, mainText);
   ObjectSetInteger(0, "PandaLabel", OBJPROP_COLOR, panelColor);

   // Line 2: BB
   CreateLabel("PandaBB", 15, 45, 9, EnableBB ? clrAqua : clrDarkGray);
   string bbSt = EnableBB ? (HasOpenTrade(BB_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaBB", OBJPROP_TEXT,
      StringFormat("BB: %s | RR 1:%.0f | Mom: %s", bbSt, BB_RR, sig.momentum));

   // Line 3: INTRA
   CreateLabel("PandaINTRA", 15, 62, 9, EnableINTRA ? clrGold : clrDarkGray);
   string iSt = EnableINTRA ? (HasOpenTrade(INTRA_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaINTRA", OBJPROP_TEXT,
      StringFormat("INTRA: %s | UAE:%02d:00 | Window %d-%dAM | Close %dAM",
                   iSt, GetUAEHour(), IntraStartHour, IntraEndHour, IntraCloseHour));

   // Line 4: PULLBACK
   CreateLabel("PandaPB", 15, 79, 9, EnablePULLBACK ? clrMagenta : clrDarkGray);
   string pbSt = EnablePULLBACK ? (HasOpenTrade(PB_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   ObjectSetString(0, "PandaPB", OBJPROP_TEXT,
      StringFormat("PULLBACK: %s | S/R scan: %d bars", pbSt, PB_SupportBars));

   // Line 5: INTRA MASTER
   CreateLabel("PandaIM", 15, 96, 9, EnableIM ? clrOrange : clrDarkGray);
   string imSt = EnableIM ? (HasOpenTrade(IM_Magic) ? "ACTIVE" : "WATCHING") : "OFF";
   string slType = IM_UseSuperTrend ? "SuperTrend" : "Swing";
   ObjectSetString(0, "PandaIM", OBJPROP_TEXT,
      StringFormat("IM: %s | SL:%s | Trail:%s", imSt, slType,
                   HasOpenTrade(IM_Magic) ? "RUNNING" : "—"));

   // Line 6: Levels
   CreateLabel("PandaStatus", 15, 113, 8, clrDarkGray);
   string swLow  = DoubleToString(FindSwingLow(SwingLookback, SwingStrength),
                                   (int)MarketInfo(Symbol(), MODE_DIGITS));
   string swHigh = DoubleToString(FindSwingHigh(SwingLookback, SwingStrength),
                                   (int)MarketInfo(Symbol(), MODE_DIGITS));
   ObjectSetString(0, "PandaStatus", OBJPROP_TEXT,
      StringFormat("SwLo:%s | SwHi:%s | Lot:%.2f | Box H1:%s H4:%s",
                   swLow, swHigh, LotSize, sig.boxH1, sig.boxH4));
}

//+------------------------------------------------------------------+
//| Helper: create/update a chart label                                |
//+------------------------------------------------------------------+
void CreateLabel(string name, int x, int y, int fontSize, color clr)
{
   if(!ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0))
   {} // Already exists, just update
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
}

//+------------------------------------------------------------------+
//| Expert tick function                                               |
//+------------------------------------------------------------------+
void OnTick()
{
   // Trail stop management runs EVERY tick for responsiveness
   ManageIMTrailingStop();

   // Throttle signal checks
   static datetime lastCheck = 0;
   if(TimeCurrent() - lastCheck < CheckIntervalSec) return;
   lastCheck = TimeCurrent();

   // INTRA hard close
   CheckINTRAHardClose();

   // Read engine signal
   PandaSignal sig;
   if(!ReadPandaSignal(Symbol(), sig))
   {
      if(ShowDashboard)
      {
         ObjectSetString(0, "PandaLabel", OBJPROP_TEXT,
            "PANDA EA v2 | " + Symbol() + " | NO SIGNAL FILE");
         ObjectSetInteger(0, "PandaLabel", OBJPROP_COLOR, clrOrangeRed);
      }
      return;
   }

   // Check all strategies
   CheckBBStrategy(sig);
   CheckINTRAStrategy(sig);
   CheckPULLBACKStrategy(sig);
   CheckIMStrategy(sig);

   // Dashboard
   UpdateDashboard(sig);
}
//+------------------------------------------------------------------+
