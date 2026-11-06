#property strict
#property indicator_chart_window
#property version "1.40"
#property description "Panda Box and Lines Licensed: standalone scores, bias, boxes and previous-period levels."

input int    RefreshSeconds = 5;
input bool   PanelDefaultBottomRight = true;
input int    PanelX         = 20;
input int    PanelY         = 30;
input int    FontSize       = 10;
input color  TextColor      = clrMagenta;
input color  AlertColor     = clrRed;
input int    GapThreshold   = 5;
input bool   ShowBoxes      = true;
input color  WagBox2Color   = C'70,120,255';
input color  WagBox1Color   = C'0,200,120';
input color  WagBox3Color   = C'255,160,50';
input int    BoxLineWidth   = 1;
input bool   ShowPandaLevels = true;
input bool   ShowLevelLabels = true;
input int    BoxCalcTF      = PERIOD_H1;
input int    WagBox3Days    = 2;
input int    WagBox3Offset  = 1;
input int    WagBox1Weeks   = 2;
input int    WagBox1Offset  = 1;
input int    WagBox2Months  = 2;
input int    WagBox2Offset  = 1;

string Prefix = "";
string BoxPrefix = "";
string LevelPrefix = "";
datetime LastRefresh = 0;
int PanelPosX = 0;
int PanelPosY = 0;
bool PanelWasMoved = false;
int PanelWidth = 500;
int PanelHeight = 158;

string Pairs[21] =
{
   "AUDCAD", "AUDJPY", "AUDNZD", "AUDUSD", "CADJPY",
   "EURAUD", "EURCAD", "EURGBP", "EURJPY", "EURNZD", "EURUSD",
   "GBPAUD", "GBPCAD", "GBPJPY", "GBPNZD", "GBPUSD",
   "NZDCAD", "NZDJPY", "NZDUSD", "USDCAD", "USDJPY"
};

string Currencies[7] = {"AUD", "CAD", "EUR", "GBP", "JPY", "NZD", "USD"};
int ScoresD1[7];
int ScoresH4[7];
int ScoresH1[7];
int AdvD1[7];
int AdvH4[7];
int AdvH1[7];
string CurrentPair = "";
int MainGap = 0;
int AdvGap = 0;
string MainBias = "WAIT";
string AdvBias = "WAIT";
string AdvHorizon = "TMRW";
bool AdvInvalid = false;
bool LicenseApproved = false;
string LicenseStatus = "LICENSE EA NOT RUNNING";

string LicenseKey()
{
   long hash = 0;
   string server = AccountServer();
   for(int i = 0; i < StringLen(server); i++)
      hash = (hash * 131 + StringGetCharacter(server, i)) % 2147483647;
   return("PBL." + IntegerToString(AccountNumber()) + "." + IntegerToString((int)hash));
}

bool CheckLicense()
{
   LicenseApproved = false;
   LicenseStatus = "LICENSE EA NOT RUNNING";
   string key = LicenseKey();
   if(!GlobalVariableCheck(key + ".state") || !GlobalVariableCheck(key + ".at"))
      return(false);

   int state = (int)GlobalVariableGet(key + ".state");
   datetime checkedAt = (datetime)GlobalVariableGet(key + ".at");
   int age = (int)(TimeGMT() - checkedAt);
   if(age < 0 || age > 600)
   {
      LicenseStatus = "LICENSE CHECK STALE";
      return(false);
   }
   if(state == 1)
   {
      LicenseApproved = true;
      LicenseStatus = "APPROVED";
      return(true);
   }
   LicenseStatus = (state == 0 ? "ACCOUNT NOT APPROVED" : "LICENSE CHECK FAILED");
   return(false);
}

int OnInit()
{
   string instance = IntegerToString(ChartID()) + "_" + IntegerToString((int)GetTickCount()) + "_";
   Prefix = "PandaLicensedPanel_" + instance;
   BoxPrefix = "PandaLicensedBox_" + instance;
   LevelPrefix = "PandaLicensedLevel_" + instance;
   IndicatorShortName("Panda Box and Lines Licensed");
   InitPanelPosition();
   EventSetTimer(MathMax(1, RefreshSeconds));
   RefreshScoring();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   RemoveObjectsByPrefix(Prefix);
   RemoveObjectsByPrefix(BoxPrefix);
   RemoveObjectsByPrefix(LevelPrefix);
}

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   if(TimeCurrent() - LastRefresh >= RefreshSeconds)
      RefreshScoring();
   return(rates_total);
}

void OnTimer()
{
   RefreshScoring();
}

void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(id == CHARTEVENT_OBJECT_DRAG && sparam == Prefix + "drag")
   {
      PanelPosX = (int)ObjectGetInteger(0, sparam, OBJPROP_XDISTANCE);
      PanelPosY = (int)ObjectGetInteger(0, sparam, OBJPROP_YDISTANCE);
      PanelWasMoved = true;
      DrawPanel();
   }
}

void RefreshScoring()
{
   CurrentPair = NormalizeSymbol(Symbol());
   if(!CheckLicense())
   {
      RemoveObjectsByPrefix(BoxPrefix);
      RemoveObjectsByPrefix(LevelPrefix);
      LastRefresh = TimeCurrent();
      DrawPanel();
      return;
   }

   ArrayInitialize(ScoresD1, 0);
   ArrayInitialize(ScoresH4, 0);
   ArrayInitialize(ScoresH1, 0);
   ArrayInitialize(AdvD1, 0);
   ArrayInitialize(AdvH4, 0);
   ArrayInitialize(AdvH1, 0);

   for(int i = 0; i < ArraySize(Pairs); i++)
   {
      ScorePairWindow(Pairs[i], 0, false);
      ScorePairWindow(Pairs[i], 1, false);
      ScorePairWindow(Pairs[i], 2, false);
      ScorePairWindow(Pairs[i], 0, true);
      ScorePairWindow(Pairs[i], 1, true);
      ScorePairWindow(Pairs[i], 2, true);
   }


   CurrentPair = NormalizeSymbol(Symbol());
   CalculateCurrentGaps();
   DrawCurrentChartBoxes();
   DrawPandaLevels();

   LastRefresh = TimeCurrent();
   DrawPanel();
}

void CalculateCurrentGaps()
{
   MainGap = 0;
   AdvGap = 0;
   MainBias = "WAIT";
   AdvBias = "WAIT";
   AdvInvalid = false;

   string pair = CurrentPair;
   if(StringLen(pair) < 6)
      pair = NormalizeSymbol(Symbol());

   string base = StringSubstr(pair, 0, 3);
   string quote = StringSubstr(pair, 3, 3);

   int baseStrong = StrongestScore(CurrencyScore(base, 0, false),
                                   CurrencyScore(base, 1, false),
                                   CurrencyScore(base, 2, false));
   int quoteStrong = StrongestScore(CurrencyScore(quote, 0, false),
                                    CurrencyScore(quote, 1, false),
                                    CurrencyScore(quote, 2, false));
   MainGap = baseStrong - quoteStrong;
   MainBias = GapBias(MainGap);

   CalculateAdvForecast(base, quote);
}

bool ForecastCurrencyConflict(const int d1, const int h4, const int h1)
{
   return((d1 >= 4 || h4 >= 4 || h1 >= 4) &&
          (d1 <= -4 || h4 <= -4 || h1 <= -4));
}

void CalculateAdvForecast(const string base, const string quote)
{
   // Match the Pair Card and snapshot forecast: only advancing horizons are
   // substituted, and the next trading session is chosen in Dubai time.
   datetime dubaiNow = TimeGMT() + 4 * 3600;
   int day = TimeDayOfWeek(dubaiNow); // Sunday=0, Friday=5, Saturday=6
   int daysToSession = day == 5 ? 3 : day == 6 ? 2 : 1;
   datetime nextSession = dubaiNow + daysToSession * 86400;
   bool newMonth = TimeMonth(nextSession) != TimeMonth(dubaiNow) ||
                   TimeYear(nextSession) != TimeYear(dubaiNow);
   AdvHorizon = newMonth ? "MTH" : (day >= 1 && day <= 4 ? "TMRW" : "WK");

   int baseD1 = CurrencyScore(base, 0, AdvHorizon == "MTH");
   int quoteD1 = CurrencyScore(quote, 0, AdvHorizon == "MTH");
   int baseH4 = CurrencyScore(base, 1, AdvHorizon != "TMRW");
   int quoteH4 = CurrencyScore(quote, 1, AdvHorizon != "TMRW");
   int baseH1 = CurrencyScore(base, 2, true);
   int quoteH1 = CurrencyScore(quote, 2, true);

   AdvInvalid = ForecastCurrencyConflict(baseD1, baseH4, baseH1) ||
                ForecastCurrencyConflict(quoteD1, quoteH4, quoteH1);
   if(AdvInvalid)
   {
      AdvBias = "INVALID";
      return;
   }
   AdvGap = StrongestScore(baseD1, baseH4, baseH1) -
            StrongestScore(quoteD1, quoteH4, quoteH1);
   AdvBias = AdvGap >= 5 ? "BUY" : AdvGap <= -5 ? "SELL" : "WAIT";
}

int StrongestScore(const int d1, const int h4, const int h1)
{
   int strongestPos = 0;
   int strongestNeg = 0;

   RegisterStrongest(d1, strongestPos, strongestNeg);
   RegisterStrongest(h4, strongestPos, strongestNeg);
   RegisterStrongest(h1, strongestPos, strongestNeg);

   int absPos = MathAbs(strongestPos);
   int absNeg = MathAbs(strongestNeg);
   if(absPos == absNeg)
      return(0);

   return(absNeg > absPos ? strongestNeg : strongestPos);
}

void RegisterStrongest(const int value, int &strongestPos, int &strongestNeg)
{
   if(value > strongestPos)
      strongestPos = value;
   if(value < strongestNeg)
      strongestNeg = value;
}

string GapBias(const int gap)
{
   if(MathAbs(gap) < GapThreshold)
      return("INVALID");
   return(gap > 0 ? "BUY" : "SELL");
}

void ScorePairWindow(const string pair, const int timeframe, const bool advance)
{
   string symbol = ResolveBrokerSymbol(pair);
   if(symbol == "")
      return;

   double price = MarketInfo(symbol, MODE_BID);
   if(price <= 0)
      return;

   datetime startTime = 0;
   datetime endTime = 0;
   GetBoxWindow(timeframe, advance, startTime, endTime);
   if(startTime <= 0 || endTime <= startTime)
      return;

   double boxLow = 0;
   double boxHigh = 0;
   if(!CalculateBoxBounds(symbol, startTime, endTime, boxLow, boxHigh))
      return;

   int baseVote = 0;
   int quoteVote = 0;

   if(price > boxHigh)
   {
      baseVote = 1;
      quoteVote = -1;
   }
   else if(price < boxLow)
   {
      baseVote = -1;
      quoteVote = 1;
   }

   string base = StringSubstr(pair, 0, 3);
   string quote = StringSubstr(pair, 3, 3);
   AddCurrencyScore(base, baseVote, timeframe, advance);
   AddCurrencyScore(quote, quoteVote, timeframe, advance);
}

void GetBoxWindow(const int timeframe, const bool advance, datetime &startTime, datetime &endTime)
{
   datetime now = TimeCurrent();

   if(timeframe == 0)
   {
      datetime currentMonth = StartOfMonth(now);
      if(advance)
      {
         endTime = ShiftMonth(currentMonth, -MathMax(0, WagBox2Offset - 1));
         startTime = ShiftMonth(endTime, -MathMax(1, WagBox2Months));
      }
      else
      {
         endTime = ShiftMonth(currentMonth, -MathMax(0, WagBox2Offset));
         startTime = ShiftMonth(endTime, -MathMax(1, WagBox2Months));
      }
      return;
   }

   if(timeframe == 1)
   {
      datetime currentWeek = StartOfWeek(now);
      if(advance)
      {
         endTime = currentWeek - MathMax(0, WagBox1Offset - 1) * 7 * 86400;
         startTime = endTime - MathMax(1, WagBox1Weeks) * 7 * 86400;
      }
      else
      {
         endTime = currentWeek - MathMax(0, WagBox1Offset) * 7 * 86400;
         startTime = endTime - MathMax(1, WagBox1Weeks) * 7 * 86400;
      }
      return;
   }

   datetime currentDay = StartOfDay(now);
   if(advance)
   {
      endTime = currentDay - MathMax(0, WagBox3Offset - 1) * 86400;
      startTime = endTime - MathMax(1, WagBox3Days) * 86400;
   }
   else
   {
      endTime = currentDay - MathMax(0, WagBox3Offset) * 86400;
      startTime = endTime - MathMax(1, WagBox3Days) * 86400;
   }
}

bool CalculateBoxBounds(const string symbol, const datetime startTime, const datetime endTime, double &boxLow, double &boxHigh)
{
   int bars = iBars(symbol, BoxCalcTF);
   if(bars <= 0)
      return(false);

   bool found = false;
   boxLow = DBL_MAX;
   boxHigh = -DBL_MAX;

   for(int i = 0; i < bars; i++)
   {
      datetime barTime = iTime(symbol, BoxCalcTF, i);
      if(barTime >= endTime)
         continue;
      if(barTime < startTime)
         break;

      double hi = iHigh(symbol, BoxCalcTF, i);
      double lo = iLow(symbol, BoxCalcTF, i);
      if(hi <= 0 || lo <= 0)
         continue;

      boxHigh = MathMax(boxHigh, hi);
      boxLow = MathMin(boxLow, lo);
      found = true;
   }

   return(found);
}

void AddCurrencyScore(const string currency, const int vote, const int timeframe, const bool advance)
{
   for(int i = 0; i < ArraySize(Currencies); i++)
   {
      if(Currencies[i] == currency)
      {
         if(advance)
         {
            if(timeframe == 0)
               AdvD1[i] += vote;
            else if(timeframe == 1)
               AdvH4[i] += vote;
            else
               AdvH1[i] += vote;
         }
         else
         {
            if(timeframe == 0)
               ScoresD1[i] += vote;
            else if(timeframe == 1)
               ScoresH4[i] += vote;
            else
               ScoresH1[i] += vote;
         }
         return;
      }
   }
}

int CurrencyScore(const string currency, const int timeframe, const bool advance)
{
   for(int i = 0; i < ArraySize(Currencies); i++)
   {
      if(Currencies[i] == currency)
      {
         if(advance)
         {
            if(timeframe == 0)
               return(AdvD1[i]);
            if(timeframe == 1)
               return(AdvH4[i]);
            return(AdvH1[i]);
         }

         if(timeframe == 0)
            return(ScoresD1[i]);
         if(timeframe == 1)
            return(ScoresH4[i]);
         return(ScoresH1[i]);
      }
   }
   return(0);
}

void DrawPanel()
{
   RemoveObjectsByPrefix(Prefix);

   if(!PanelWasMoved)
      InitPanelPosition();

   int x = PanelPosX;
   int y = PanelPosY;
   string pair = CurrentPair;
   if(StringLen(pair) < 6)
      pair = NormalizeSymbol(Symbol());

   string base = StringSubstr(pair, 0, 3);
   string quote = StringSubstr(pair, 3, 3);
   int baseD1 = CurrencyScore(base, 0, false);
   int baseH4 = CurrencyScore(base, 1, false);
   int baseH1 = CurrencyScore(base, 2, false);
   int quoteD1 = CurrencyScore(quote, 0, false);
   int quoteH4 = CurrencyScore(quote, 1, false);
   int quoteH1 = CurrencyScore(quote, 2, false);
   int advBaseD1 = CurrencyScore(base, 0, true);
   int advBaseH4 = CurrencyScore(base, 1, true);
   int advBaseH1 = CurrencyScore(base, 2, true);
   int advQuoteD1 = CurrencyScore(quote, 0, true);
   int advQuoteH4 = CurrencyScore(quote, 1, true);
   int advQuoteH1 = CurrencyScore(quote, 2, true);

   CreatePanelBackground(x, y);
   CreateLabel(Prefix + "title", x + 12, y + 12, "PANDA BOX AND LINES LICENSED  |  " + pair, C'0,180,255', FontSize + 1, "Consolas");
   if(!LicenseApproved)
   {
      CreateLabel(Prefix + "license", x + 12, y + 49, LicenseStatus, AlertColor, FontSize, "Consolas");
      ChartRedraw();
      return;
   }
   CreateLabel(Prefix + "current", x + 12, y + 33, "CURRENT SCORE", TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "base", x + 12, y + 49, FormatScoreLine(base, baseD1, baseH4, baseH1), TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "quote", x + 12, y + 65, FormatScoreLine(quote, quoteD1, quoteH4, quoteH1), TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "adv_base", x + 12, y + 86, FormatScoreLine("ADV " + base, advBaseD1, advBaseH4, advBaseH1), TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "adv_quote", x + 12, y + 102, FormatScoreLine("ADV " + quote, advQuoteD1, advQuoteH4, advQuoteH1), TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "bias", x + 12, y + 124, "GAP " + SignedInt(MainGap) + "  BIAS " + MainBias, BiasColor(MainBias), FontSize, "Consolas");
   string forecast = "ADV " + AdvHorizon + " FORECAST ";
   if(AdvInvalid) forecast += "INVALID";
   else forecast += SignedInt(AdvGap) + "  " + AdvBias;
   CreateLabel(Prefix + "adv_bias", x + 210, y + 124, forecast, BiasColor(AdvBias), FontSize, "Consolas");

   ChartRedraw();
}

void DrawCurrentChartBoxes()
{
   RemoveObjectsByPrefix(BoxPrefix);
   if(!ShowBoxes)
      return;

   string cleanPair = NormalizeSymbol(Symbol());
   string symbol = ResolveBrokerSymbol(cleanPair);
   if(symbol == "")
      symbol = Symbol();

   DrawOneBox(symbol, 0, "WagBox2", WagBox2Color);
   DrawOneBox(symbol, 1, "WagBox1", WagBox1Color);
   DrawOneBox(symbol, 2, "WagBox3", WagBox3Color);
}

void DrawOneBox(const string symbol, const int timeframe, const string label, const color clr)
{
   datetime startTime = 0;
   datetime endTime = 0;
   GetBoxWindow(timeframe, false, startTime, endTime);
   if(startTime <= 0 || endTime <= startTime)
      return;

   double boxLow = 0;
   double boxHigh = 0;
   if(!CalculateBoxBounds(symbol, startTime, endTime, boxLow, boxHigh))
      return;

   string rectName = BoxPrefix + label;
   ObjectCreate(0, rectName, OBJ_RECTANGLE, 0, startTime, boxHigh, endTime, boxLow);
   ObjectSetInteger(0, rectName, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, rectName, OBJPROP_WIDTH, BoxLineWidth);
   ObjectSetInteger(0, rectName, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, rectName, OBJPROP_BACK, true);
   ObjectSetInteger(0, rectName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, rectName, OBJPROP_HIDDEN, true);

   string labelName = BoxPrefix + label + "_txt";
   ObjectCreate(0, labelName, OBJ_TEXT, 0, endTime, boxHigh);
   ObjectSetText(labelName, label + "  " + DoubleToString(boxHigh, Digits) + " / " + DoubleToString(boxLow, Digits),
                 MathMax(7, FontSize - 2), "Arial", clr);
   ObjectSetInteger(0, labelName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, labelName, OBJPROP_HIDDEN, true);
}

int LevelPeriodKey(const datetime barTime, const int kind)
{
   if(kind == 0)
      return(TimeYear(barTime) * 10000 + TimeMonth(barTime) * 100 + TimeDay(barTime));
   if(kind == 1)
   {
      datetime monday = StartOfWeek(barTime);
      return(TimeYear(monday) * 10000 + TimeMonth(monday) * 100 + TimeDay(monday));
   }
   return(TimeYear(barTime) * 12 + TimeMonth(barTime));
}

bool PreviousLevelBounds(const string symbol, const int kind, double &low, double &high)
{
   int bars = iBars(symbol, PERIOD_H1);
   if(bars < 2) return(false);
   int currentKey = LevelPeriodKey(iTime(symbol, PERIOD_H1, 0), kind);
   int previousKey = -1;
   low = DBL_MAX;
   high = -DBL_MAX;
   bool found = false;
   for(int i = 0; i < bars; i++)
   {
      datetime barTime = iTime(symbol, PERIOD_H1, i);
      if(barTime <= 0) break;
      int key = LevelPeriodKey(barTime, kind);
      if(key == currentKey) continue;
      if(previousKey < 0) previousKey = key;
      if(key != previousKey) break;
      double hi = iHigh(symbol, PERIOD_H1, i);
      double lo = iLow(symbol, PERIOD_H1, i);
      if(hi <= 0 || lo <= 0) continue;
      high = MathMax(high, hi);
      low = MathMin(low, lo);
      found = true;
   }
   return(found);
}

bool PreviousYearBounds(const string symbol, double &low, double &high)
{
   int year = TimeYear(TimeCurrent()) - 1;
   low = DBL_MAX;
   high = -DBL_MAX;
   bool found = false;
   int bars = MathMin(25, iBars(symbol, PERIOD_MN1));
   for(int i = 0; i < bars; i++)
   {
      datetime barTime = iTime(symbol, PERIOD_MN1, i);
      if(barTime <= 0) break;
      if(TimeYear(barTime) != year) continue;
      double hi = iHigh(symbol, PERIOD_MN1, i);
      double lo = iLow(symbol, PERIOD_MN1, i);
      if(hi <= 0 || lo <= 0) continue;
      high = MathMax(high, hi);
      low = MathMin(low, lo);
      found = true;
   }
   return(found);
}

void DrawPandaLevel(const string label, const double price, const color lineColor)
{
   if(price <= 0) return;
   string lineName = LevelPrefix + label + "_line";
   ObjectCreate(0, lineName, OBJ_HLINE, 0, 0, price);
   ObjectSetInteger(0, lineName, OBJPROP_COLOR, lineColor);
   ObjectSetInteger(0, lineName, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, lineName, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, lineName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, lineName, OBJPROP_HIDDEN, true);
   if(!ShowLevelLabels) return;
   string textName = LevelPrefix + label + "_text";
   datetime at = iTime(Symbol(), Period(), 0);
   if(at <= 0) at = TimeCurrent();
   ObjectCreate(0, textName, OBJ_TEXT, 0, at, price);
   ObjectSetText(textName, label + "  " + DoubleToString(price, Digits), 8, "Arial", lineColor);
   ObjectSetInteger(0, textName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, textName, OBJPROP_HIDDEN, true);
}

void DrawPandaLevels()
{
   RemoveObjectsByPrefix(LevelPrefix);
   if(!ShowPandaLevels) return;
   string symbol = Symbol();
   double low = 0, high = 0;
   if(PreviousLevelBounds(symbol, 0, low, high))
   {
      DrawPandaLevel("PDH", high, clrOrange);
      DrawPandaLevel("PDL", low, clrOrange);
   }
   if(PreviousLevelBounds(symbol, 1, low, high))
   {
      DrawPandaLevel("PWH", high, clrDodgerBlue);
      DrawPandaLevel("PWL", low, clrDodgerBlue);
   }
   if(PreviousLevelBounds(symbol, 2, low, high))
   {
      DrawPandaLevel("PMH", high, clrDarkViolet);
      DrawPandaLevel("PML", low, clrDarkViolet);
   }
   if(PreviousYearBounds(symbol, low, high))
   {
      DrawPandaLevel("PYH", high, clrCrimson);
      DrawPandaLevel("PYL", low, clrCrimson);
   }
}

color BiasColor(const string bias)
{
   if(bias == "BUY") return(C'0,200,120');
   if(bias == "SELL") return(AlertColor);
   return(TextColor);
}

string SignedInt(const int value)
{
   if(value > 0)
      return("+" + IntegerToString(value));
   return(IntegerToString(value));
}

string FormatTfValue(const int value)
{
   string text = SignedInt(value);
   if(value == 0)
      text = "0";
   while(StringLen(text) < 3)
      text = " " + text;
   return(text);
}

string FormatScoreLine(const string label, const int d1, const int h4, const int h1)
{
   string left = label;
   while(StringLen(left) < 9)
      left = left + " ";

   return(left + " : D1 : " + FormatTfValue(d1) +
          "    | H4 : " + FormatTfValue(h4) +
          "    | H1 : " + FormatTfValue(h1));
}

string NormalizeSymbol(string symbol)
{
   StringToUpper(symbol);
   string out = "";
   for(int i = 0; i < StringLen(symbol); i++)
   {
      ushort ch = StringGetCharacter(symbol, i);
      if(ch >= 65 && ch <= 90)
         out += StringSubstr(symbol, i, 1);
   }
   if(StringLen(out) > 6)
      out = StringSubstr(out, 0, 6);
   return(out);
}

string ResolveBrokerSymbol(const string cleanPair)
{
   string clean = NormalizeSymbol(cleanPair);
   if(MarketInfo(clean, MODE_BID) > 0)
      return(clean);

   for(int i = 0; i < SymbolsTotal(true); i++)
   {
      string symbol = SymbolName(i, true);
      if(NormalizeSymbol(symbol) == clean)
         return(symbol);
   }

   for(int j = 0; j < SymbolsTotal(false); j++)
   {
      string symbolAll = SymbolName(j, false);
      if(NormalizeSymbol(symbolAll) == clean)
         return(symbolAll);
   }

   return("");
}

datetime StartOfDay(const datetime value)
{
   return(StrToTime(StringFormat("%04d.%02d.%02d 00:00",
                                 TimeYear(value),
                                 TimeMonth(value),
                                 TimeDay(value))));
}

datetime StartOfWeek(const datetime value)
{
   datetime dayStart = StartOfDay(value);
   int dow = TimeDayOfWeek(dayStart);
   int daysFromMonday = (dow + 6) % 7;
   return(dayStart - daysFromMonday * 86400);
}

datetime StartOfMonth(const datetime value)
{
   return(StrToTime(StringFormat("%04d.%02d.01 00:00",
                                 TimeYear(value),
                                 TimeMonth(value))));
}

datetime ShiftMonth(const datetime monthStart, const int monthDelta)
{
   int year = TimeYear(monthStart);
   int month = TimeMonth(monthStart) + monthDelta;

   while(month <= 0)
   {
      month += 12;
      year--;
   }

   while(month > 12)
   {
      month -= 12;
      year++;
   }

   return(StrToTime(StringFormat("%04d.%02d.01 00:00", year, month)));
}

string TrimCopy(string text)
{
   StringTrimLeft(text);
   StringTrimRight(text);
   return(text);
}

void InitPanelPosition()
{
   if(!PanelDefaultBottomRight)
   {
      PanelPosX = PanelX;
      PanelPosY = PanelY;
      return;
   }

   int chartWidth = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int chartHeight = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   PanelPosX = chartWidth - PanelWidth - PanelX;
   PanelPosY = chartHeight - PanelHeight - PanelY;
   if(PanelPosX < 0) PanelPosX = 0;
   if(PanelPosY < 0) PanelPosY = 0;
}

void CreatePanelBackground(const int x, const int y)
{
   ObjectCreate(0, Prefix + "bg", OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_XSIZE, PanelWidth);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_YSIZE, PanelHeight);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_BGCOLOR, clrWhite);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_BACK, false);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, Prefix + "bg", OBJPROP_HIDDEN, true);

   ObjectCreate(0, Prefix + "drag", OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_XSIZE, PanelWidth);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_YSIZE, 8);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_BGCOLOR, clrSilver);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_COLOR, clrSilver);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_BACK, false);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_SELECTABLE, true);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_SELECTED, false);
   ObjectSetInteger(0, Prefix + "drag", OBJPROP_HIDDEN, false);
}

void CreateLabel(const string name,
                 const int x,
                 const int y,
                 const string text,
                 const color clr,
                 const int fontSize,
                 const string font)
{
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, MathMax(6, fontSize));
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void RemoveObjectsByPrefix(const string prefix)
{
   for(int i = ObjectsTotal(0, 0, -1) - 1; i >= 0; i--)
   {
      string name = ObjectName(0, i, 0, -1);
      if(StringFind(name, prefix) == 0)
         ObjectDelete(0, name);
   }
}
