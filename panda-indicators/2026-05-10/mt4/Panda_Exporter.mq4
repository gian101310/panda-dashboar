//+------------------------------------------------------------------+
//|                                              Panda_Exporter.mq4  |
//|           PANDA GLOBAL EXPORTER (MASTER EA)                      |
//|   Attach to ONE chart only                                       |
//|                                                                  |
//|   Exports for ALL 21 pairs:                                      |
//|     1) mt4_SYMBOL.txt  — scoring labels + boxes (from charts)    |
//|     2) tbg_SYMBOL.txt  — Panda Lines (ST+FL) + S/R levels       |
//|                                                                  |
//|   No need to install indicators on every pair.                   |
//+------------------------------------------------------------------+
#property strict

input int    ExportIntervalSeconds = 1;      // Export interval (seconds)
input int    PL_Timeframe          = 0;      // Panda Lines TF (0=H1)
input string _pl_header_           = "=== Panda Lines Settings ==="; // ---
input int    ST_Period             = 10;     // SuperTrend ATR Period
input double ST_Multiplier         = 3.0;    // SuperTrend Multiplier
input int    BB_Period             = 21;     // FollowLine BB Period
input double BB_Deviations         = 1.0;    // FollowLine BB Deviations
input int    BB_ATRPeriod          = 5;      // FollowLine ATR Period

string filePrefix = "mt4_";

// ===== 21 PAIRS — matches app.py PAIRS list =====
string PAIRS[] = {
   "AUDJPY","AUDCAD","AUDNZD","AUDUSD","CADJPY",
   "EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD",
   "GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD",
   "NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY"
};

int plTF;

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(ExportIntervalSeconds);
   plTF = PL_Timeframe;
   if(plTF == 0) plTF = PERIOD_H1;
   Print("PANDA GLOBAL EXPORTER STARTED - ", ArraySize(PAIRS), " pairs");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
}

//+------------------------------------------------------------------+
void OnTimer()
{
   ExportAllCharts();
   ExportAllPandaLines();
}

// =================================================================
//  PART 1: MT4 SCORING EXPORT (reads chart labels from open charts)
// =================================================================

string ReadLabel(long chartId, string name)
{
   if(ObjectFind(chartId, name) < 0) return("");
   return(ObjectGetString(chartId, name, OBJPROP_TEXT));
}

void ExportBox(long chartId, int handle, string name)
{
   if(ObjectFind(chartId, name) < 0) return;
   datetime t1 = (datetime)ObjectGetInteger(chartId, name, OBJPROP_TIME1);
   datetime t2 = (datetime)ObjectGetInteger(chartId, name, OBJPROP_TIME2);
   double   p1 = ObjectGetDouble(chartId, name, OBJPROP_PRICE1);
   double   p2 = ObjectGetDouble(chartId, name, OBJPROP_PRICE2);
   FileWrite(handle,
      "BOX|" + name + "|" +
      IntegerToString((int)t1) + "|" +
      DoubleToString(p1, _Digits) + "|" +
      IntegerToString((int)t2) + "|" +
      DoubleToString(p2, _Digits));
}

void ExportAllCharts()
{
   long chartId = ChartFirst();
   while(chartId >= 0)
   {
      string symbol = ChartSymbol(chartId);
      if(symbol != "") ExportChart(chartId, symbol);
      chartId = ChartNext(chartId);
   }
}

void ExportChart(long chartId, string symbol)
{
   string fileName = filePrefix + symbol + ".txt";
   int handle = FileOpen(fileName, FILE_WRITE | FILE_TXT | FILE_COMMON);
   if(handle == INVALID_HANDLE) { Print("EXPORT ERROR: ", symbol); return; }

   string baseLine    = ReadLabel(chartId, "A1Adv-1");
   string quoteLine   = ReadLabel(chartId, "A1Adv-2");
   string advBase     = ReadLabel(chartId, "A1Adv-1.a");
   string advQuote    = ReadLabel(chartId, "A1Adv-2.a");
   string atrLine     = ReadLabel(chartId, "A1Adv-3");
   string spreadLine  = ReadLabel(chartId, "A1Adv-4");

   if(baseLine != "")    FileWrite(handle, baseLine);
   if(quoteLine != "")   FileWrite(handle, quoteLine);
   if(advBase != "")     FileWrite(handle, advBase);
   if(advQuote != "")    FileWrite(handle, advQuote);
   if(atrLine != "")     FileWrite(handle, atrLine);
   if(spreadLine != "")  FileWrite(handle, spreadLine);

   ExportBox(chartId, handle, "WagBox1");
   ExportBox(chartId, handle, "WagBox2");
   ExportBox(chartId, handle, "WagBox3");

   FileClose(handle);
}

// =================================================================
//  PART 2: PANDA LINES EXPORT (ST + FL + S/R for all 21 pairs)
//  Calculates from any chart — no per-pair installation needed
// =================================================================

void ExportAllPandaLines()
{
   int total = ArraySize(PAIRS);
   for(int p = 0; p < total; p++)
   {
      string symbol = PAIRS[p];
      string brokerSym = ResolveBrokerSymbol(symbol);
      if(brokerSym == "") continue;

      int bars = iBars(brokerSym, plTF);
      if(bars < 100) continue;

      // Calculate Panda Lines
      double stLine, flLine;
      string stBias, zone, g1Valid;
      CalcPandaLines(brokerSym, plTF, stLine, flLine, stBias, zone, g1Valid);

      // Calculate S/R levels
      double pdh, pdl, pwh, pwl, pmh, pml, pyh, pyl;
      CalcSRLevels(brokerSym, pdh, pdl, pwh, pwl, pmh, pml, pyh, pyl);

      double price = iClose(brokerSym, plTF, 0);
      int digits = (int)MarketInfo(brokerSym, MODE_DIGITS);

      // Write tbg_SYMBOL.txt
      string fileName = "tbg_" + symbol + ".txt";
      int handle = FileOpen(fileName, FILE_WRITE | FILE_TXT | FILE_COMMON);
      if(handle == INVALID_HANDLE) continue;

      FileWriteString(handle, "TBG_ST   : " + DoubleToString(stLine, digits) + "\n");
      FileWriteString(handle, "TBG_FL   : " + DoubleToString(flLine, digits) + "\n");
      FileWriteString(handle, "TBG_BIAS : " + stBias + "\n");
      FileWriteString(handle, "TBG_ZONE : " + zone + "\n");
      FileWriteString(handle, "TBG_G1   : " + g1Valid + "\n");
      FileWriteString(handle, "TBG_PRICE: " + DoubleToString(price, digits) + "\n");

      // S/R levels
      if(pdh > 0) FileWriteString(handle, "PDH : " + DoubleToString(pdh, digits) + "\n");
      if(pdl > 0) FileWriteString(handle, "PDL : " + DoubleToString(pdl, digits) + "\n");
      if(pwh > 0) FileWriteString(handle, "PWH : " + DoubleToString(pwh, digits) + "\n");
      if(pwl > 0) FileWriteString(handle, "PWL : " + DoubleToString(pwl, digits) + "\n");
      if(pmh > 0) FileWriteString(handle, "PMH : " + DoubleToString(pmh, digits) + "\n");
      if(pml > 0) FileWriteString(handle, "PML : " + DoubleToString(pml, digits) + "\n");
      if(pyh > 0) FileWriteString(handle, "PYH : " + DoubleToString(pyh, digits) + "\n");
      if(pyl > 0 && pyl < 999999) FileWriteString(handle, "PYL : " + DoubleToString(pyl, digits) + "\n");

      FileClose(handle);
   }
}

//+------------------------------------------------------------------+
//| Resolve broker symbol name (handles suffixes like .m, micro)      |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string cleanPair)
{
   if(MarketInfo(cleanPair, MODE_BID) > 0) return cleanPair;
   string suffixes[] = {".m", "m", ".pro", ".raw", ".", "_", ".r", "micro", ".i", ".e"};
   int total = ArraySize(suffixes);
   for(int i = 0; i < total; i++)
   {
      string test = cleanPair + suffixes[i];
      if(MarketInfo(test, MODE_BID) > 0) return test;
   }
   string lower = cleanPair;
   StringToLower(lower);
   if(MarketInfo(lower, MODE_BID) > 0) return lower;
   return "";
}

//+------------------------------------------------------------------+
//| Calculate SuperTrend + FollowLine for any symbol                   |
//+------------------------------------------------------------------+
void CalcPandaLines(string symbol, int tf,
                    double &outST, double &outFL,
                    string &outBias, string &outZone, string &outG1)
{
   int lookback = 300;
   int bars = iBars(symbol, tf);
   if(lookback > bars) lookback = bars;

   double upBand[], dnBand[], trend[];
   double flLine[], flTrend[];
   ArrayResize(upBand, lookback);
   ArrayResize(dnBand, lookback);
   ArrayResize(trend, lookback);
   ArrayResize(flLine, lookback);
   ArrayResize(flTrend, lookback);
   ArrayInitialize(upBand, 0);
   ArrayInitialize(dnBand, 0);
   ArrayInitialize(trend, 1);
   ArrayInitialize(flLine, 0);
   ArrayInitialize(flTrend, 0);

   for(int idx = 2; idx < lookback; idx++)
   {
      int shift     = lookback - 1 - idx;
      int shiftPrev = shift + 1;

      double h     = iHigh(symbol, tf, shift);
      double l     = iLow(symbol, tf, shift);
      double c     = iClose(symbol, tf, shift);
      double cPrev = iClose(symbol, tf, shiftPrev);

      // ---- SUPERTREND ----
      double atr = iATR(symbol, tf, ST_Period, shift);
      if(atr == 0) continue;

      double src  = (h + l) / 2.0;
      double curUp = src - ST_Multiplier * atr;
      double curDn = src + ST_Multiplier * atr;

      double prevUp = upBand[idx-1];
      double prevDn = dnBand[idx-1];
      if(prevUp == 0) prevUp = curUp;
      if(prevDn == 0) prevDn = curDn;

      if(cPrev > prevUp) curUp = MathMax(curUp, prevUp);
      if(cPrev < prevDn) curDn = MathMin(curDn, prevDn);

      upBand[idx] = curUp;
      dnBand[idx] = curDn;

      double prevTrend = trend[idx-1];
      if(prevTrend == -1 && cPrev > prevDn)      trend[idx] = 1;
      else if(prevTrend == 1 && cPrev < prevUp)  trend[idx] = -1;
      else                                        trend[idx] = prevTrend;

      // ---- FOLLOWLINE ----
      double prevBBUp = iBands(symbol, tf, BB_Period, BB_Deviations, 0, PRICE_CLOSE, MODE_UPPER, shiftPrev);
      double prevBBDn = iBands(symbol, tf, BB_Period, BB_Deviations, 0, PRICE_CLOSE, MODE_LOWER, shiftPrev);
      double atrBB    = iATR(symbol, tf, BB_ATRPeriod, shift);

      double prevTL = flLine[idx-1];
      if(prevTL == 0) prevTL = c;

      int bbSig = 0;
      if(cPrev > prevBBUp) bbSig = 1;
      else if(cPrev < prevBBDn) bbSig = -1;

      double curTL = prevTL;
      if(bbSig == 1)       { curTL = l - atrBB; curTL = MathMax(curTL, prevTL); }
      else if(bbSig == -1) { curTL = h + atrBB; curTL = MathMin(curTL, prevTL); }

      flLine[idx] = curTL;

      double prevIT = flTrend[idx-1];
      flTrend[idx] = prevIT;
      if(curTL > prevTL)      flTrend[idx] = 1;
      else if(curTL < prevTL) flTrend[idx] = -1;
   }

   // Extract latest values
   int last = lookback - 1;
   outST   = (trend[last] == 1) ? upBand[last] : dnBand[last];
   outFL   = flLine[last];
   outBias = (trend[last] == 1) ? "BUY" : "SELL";

   double price = iClose(symbol, tf, 0);
   double upper = MathMax(outST, outFL);
   double lower = MathMin(outST, outFL);

   if(price > upper)      outZone = "ABOVE";
   else if(price < lower) outZone = "BELOW";
   else                   outZone = "BETWEEN";

   if((outBias == "BUY" && outZone == "ABOVE") ||
      (outBias == "SELL" && outZone == "BELOW"))
      outG1 = "VALID";
   else
      outG1 = "INVALID";
}

//+------------------------------------------------------------------+
//| Calculate S/R levels for any symbol                                |
//+------------------------------------------------------------------+
void CalcSRLevels(string symbol,
                  double &pdh, double &pdl,
                  double &pwh, double &pwl,
                  double &pmh, double &pml,
                  double &pyh, double &pyl)
{
   pdh = iHigh(symbol, PERIOD_D1, 1);
   pdl = iLow(symbol, PERIOD_D1, 1);
   pwh = iHigh(symbol, PERIOD_W1, 1);
   pwl = iLow(symbol, PERIOD_W1, 1);
   pmh = iHigh(symbol, PERIOD_MN1, 1);
   pml = iLow(symbol, PERIOD_MN1, 1);

   pyh = 0;
   pyl = 999999;
   int prevYear = TimeYear(TimeCurrent()) - 1;
   int monthlyBars = iBars(symbol, PERIOD_MN1);

   for(int m = 1; m < monthlyBars; m++)
   {
      datetime mTime = iTime(symbol, PERIOD_MN1, m);
      int mYear = TimeYear(mTime);
      if(mYear == prevYear)
      {
         double mh = iHigh(symbol, PERIOD_MN1, m);
         double ml = iLow(symbol, PERIOD_MN1, m);
         if(mh > pyh) pyh = mh;
         if(ml < pyl) pyl = ml;
      }
      else if(mYear < prevYear)
         break;
   }
}
//+------------------------------------------------------------------+
