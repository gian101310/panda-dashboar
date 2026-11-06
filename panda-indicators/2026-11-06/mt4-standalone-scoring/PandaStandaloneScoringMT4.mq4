#property strict
#property indicator_chart_window
#property version "1.20"
#property description "Raw scoring from Scoring with Adv v1 MT4. Broker data only; no export files."

input int    RefreshSeconds = 5;
input bool   PanelDefaultBottomRight = true;
input int    PanelX         = 20;
input int    PanelY         = 30;
input int    FontSize       = 10;
input color  TextColor      = clrMagenta;
input color  AlertColor     = clrRed;
input int    BoxCalcTF      = PERIOD_H1;
input int    WagBox3Days    = 2;
input int    WagBox3Offset  = 1;
input int    WagBox1Weeks   = 2;
input int    WagBox1Offset  = 1;
input int    WagBox2Months  = 2;
input int    WagBox2Offset  = 1;

string Prefix = "ScoringV1_";
datetime LastRefresh = 0;
int PanelPosX = 0;
int PanelPosY = 0;
bool PanelWasMoved = false;
int PanelWidth = 500;
int PanelHeight = 126;

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

int OnInit()
{
   IndicatorShortName("Panda Standalone Raw Score MT4");
   InitPanelPosition();
   EventSetTimer(MathMax(1, RefreshSeconds));
   RefreshScoring();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   RemoveObjectsByPrefix(Prefix);
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

   LastRefresh = TimeCurrent();
   DrawPanel();
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
   CreateLabel(Prefix + "title", x + 12, y + 12, "PANDA RAW  |  " + pair, C'0,180,255', FontSize + 1, "Consolas");
   CreateLabel(Prefix + "current", x + 12, y + 33, "CURRENT SCORE", TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "base", x + 12, y + 49, FormatScoreLine(base, baseD1, baseH4, baseH1), TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "quote", x + 12, y + 65, FormatScoreLine(quote, quoteD1, quoteH4, quoteH1), TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "adv_base", x + 12, y + 86, FormatScoreLine("ADV " + base, advBaseD1, advBaseH4, advBaseH1), TextColor, FontSize, "Consolas");
   CreateLabel(Prefix + "adv_quote", x + 12, y + 102, FormatScoreLine("ADV " + quote, advQuoteD1, advQuoteH4, advQuoteH1), TextColor, FontSize, "Consolas");

   ChartRedraw();
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
