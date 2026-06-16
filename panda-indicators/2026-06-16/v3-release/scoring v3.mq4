//+------------------------------------------------------------------+
//| Scoring v3                                              |
//| Combined: Scoring v3 + Panda Lines v3                       |
//| Independent scoring - no engine or closed-source dependency      |
//+------------------------------------------------------------------+
#property strict
#property indicator_chart_window
#property indicator_buffers 4
#property indicator_color1 Lime
#property indicator_color2 Red
#property indicator_color3 DodgerBlue
#property indicator_color4 Red
#property indicator_width1 2
#property indicator_width2 2
#property indicator_width3 2
#property indicator_width4 2

// ===== SCORING INPUTS =====
const int    RefreshSeconds   = 15;
const int    GapThreshold     = 5;
const int    BoxCalcTF        = PERIOD_H1;
const int    WagBox3Days      = 2;
const int    WagBox3Offset    = 1;
const int    WagBox1Weeks     = 2;
const int    WagBox1Offset    = 1;
const int    WagBox2Months    = 2;
const int    WagBox2Offset    = 1;

// ===== SUPERTREND INPUTS =====
const int    ST_Period        = 10;
const double ST_Multiplier    = 3.0;
const bool   ST_ShowSignals   = true;

// ===== BB TRENDLINE INPUTS =====
const int    BB_Period        = 21;
const double BB_Deviations    = 1.0;
const bool   BB_UseATR        = true;
const int    BB_ATRPeriod     = 5;
const bool   BB_HideLabels    = false;

// ===== S/R ZONE INPUTS =====
const bool   SR_Show          = true;
const bool   SR_Daily         = true;
const bool   SR_Weekly        = true;
const bool   SR_Monthly       = true;
const bool   SR_Yearly        = true;
const double SR_ZoneWidth     = 0.01;
const int    SR_ExtendLeft    = 3000;
const int    SR_ExtendRight   = 3000;
const color  SR_DailyColor    = Orange;
const color  SR_WeeklyColor   = DodgerBlue;
const color  SR_MonthlyColor  = DarkViolet;
const color  SR_YearlyColor   = Crimson;

// ===== ALERT INPUTS =====
const bool   AL_SuperTrend    = true;
const bool   AL_BB            = true;

// ===== DISPLAY INPUTS =====
const bool   ShowBoxes        = true;
const color  WagBox2Color     = C'70,120,255';
const color  WagBox1Color     = C'0,200,120';
const color  WagBox3Color     = C'255,160,50';
const int    BoxLineWidth     = 1;

// ===== PANEL INPUTS =====
const bool   Panel_Show            = true;
const bool   Panel_DefaultBottomLeft = true;
const int    Panel_X               = 20;
const int    Panel_Y               = 30;
const int    Panel_Width           = 350;
const color  Panel_BgColor         = C'20,20,30';
const color  Panel_BuyColor        = C'0,255,159';
const color  Panel_SellColor       = C'255,77,109';
const color  Panel_WaitColor       = C'128,128,128';
const color  Panel_TextColor       = C'200,200,220';
const int    Panel_FontSize        = 10;

// ===== EXPORT INPUTS =====
// TestMode: uses "pe_" prefix on all exported files so they NEVER clash
//   with the original indicators or engine. Compare pe_* vs originals to verify.
//   Set to false when going live (writes to standard filenames).
const bool   TestMode              = false;     // USE pe_ PREFIX - safe for side-by-side testing
const bool   ExportForEngine       = true;     // write mt4/tbg files (engine reads these)
const bool   ExportPandaScore      = true;     // write panda_score file

// ===== LICENSE LOCK =====
const string LicenseEndpoint        = "https://pandaengine.app/api/indicator-license";
const string ProductCode            = "scoring_v3";
const int    LicenseCheckSeconds    = 3600;
const int    GraceHours             = 24;

// ===== INDICATOR BUFFERS =====
double STBullish[];
double STBearish[];
double BBTrendBull[];
double BBTrendBear[];

// SuperTrend working arrays
double UpBand[];
double DnBand[];
double TrendDir[];
// BB Trend working arrays
double BBTrendLine[];
double BBITrend[];

// ===== SCORING GLOBALS =====
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
bool CurrencyInvalid[7];

// Current pair computed data
string CurrentPair   = "";
int    MainGap       = 0;
int    AdvGap        = 0;
string MainBias      = "WAIT";
string AdvBias       = "WAIT";
string Execution     = "NONE";
string Confidence    = "INVALID";
bool   HardInvalid   = false;
string ConflictDetail = "";

// PL Zone data (from SuperTrend + Follow Line)
string PLZone        = "--";
string PLBias        = "--";
bool   PLG1Valid     = false;
double PLSTValue     = 0;
double PLFLValue     = 0;

// Box trend data (midpoint rule)
string BoxH1Trend    = "--";
string BoxH4Trend    = "--";

// Box bounds storage for current pair (for export + trend calc)
double Box3High = 0, Box3Low = 0;
double Box1High = 0, Box1Low = 0;
double Box2High = 0, Box2Low = 0;
datetime Box3Start = 0, Box3End = 0;
datetime Box1Start = 0, Box1End = 0;
datetime Box2Start = 0, Box2End = 0;
bool Box3Valid = false, Box1Valid = false, Box2Valid = false;

// Confluence + Strength
int    ConfluenceScore = 0;
double Strength        = 0;

// ATR/Spread display
string AtrLine       = "ATR : --";
string SpreadLine    = "SPREAD : --";

// Panel state
string PanelPrefix   = "ScoringV3_";
string BoxPrefix     = "ScoringV3Box_";
string STPrefix      = "ScoringV3ST_";
bool   PanelDragging = false;
bool   PanelWasDragged = false;
bool   PanelHidden   = false;
int    DragOffsetX   = 0;
int    DragOffsetY   = 0;
int    PanelPosX     = 0;
int    PanelPosY     = 0;

datetime LastRefresh  = 0;
datetime LastAlertTime = 0;
datetime LastLicenseCheck = 0;
datetime LicenseGraceUntil = 0;
datetime LastLicenseAlert = 0;
bool     LicenseOk = false;
string   LicenseStatus = "UNVERIFIED";


// ===================================================================
//  SECTION 1: LIFECYCLE
// ===================================================================
int OnInit()
{
   IndicatorShortName("Scoring");
   if(!ValidateLicense(true))
      return(INIT_FAILED);

   SetIndexBuffer(0, STBullish);
   SetIndexBuffer(1, STBearish);
   SetIndexBuffer(2, BBTrendBull);
   SetIndexBuffer(3, BBTrendBear);
   SetIndexStyle(0, DRAW_LINE);
   SetIndexStyle(1, DRAW_LINE);
   SetIndexStyle(2, DRAW_LINE);
   SetIndexStyle(3, DRAW_LINE);
   SetIndexLabel(0, "ST Bullish");
   SetIndexLabel(1, "ST Bearish");
   SetIndexLabel(2, "BB Trend Bullish");
   SetIndexLabel(3, "BB Trend Bearish");
   SetIndexEmptyValue(0, EMPTY_VALUE);
   SetIndexEmptyValue(1, EMPTY_VALUE);
   SetIndexEmptyValue(2, EMPTY_VALUE);
   SetIndexEmptyValue(3, EMPTY_VALUE);

   PanelPosX = Panel_X;
   PanelPosY = GetDefaultPanelY();
   ChartSetInteger(0, CHART_EVENT_MOUSE_MOVE, true);

   RefreshScoring();

   if(Panel_Show)
   {
      DrawPanel();
      EventSetTimer(MathMax(1, RefreshSeconds));
   }
   else
   {
      EventSetTimer(MathMax(1, RefreshSeconds));
   }

   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   RemoveObjectsByPrefix(PanelPrefix);
   RemoveObjectsByPrefix(BoxPrefix);
   RemoveObjectsByPrefix(STPrefix);
}

void OnTimer()
{
   if(!ValidateLicense(false))
      return;
   RefreshScoring();
   if(Panel_Show && !PanelHidden)
      DrawPanel();
}

void OnChartEvent(const int id,
                  const long &lparam,
                  const double &dparam,
                  const string &sparam)
{
   if(!Panel_Show) return;

   // Toggle button click
   if(id == CHARTEVENT_OBJECT_CLICK)
   {
      if(sparam == PanelPrefix + "toggle")
      {
         PanelHidden = !PanelHidden;
         if(PanelHidden)
            HidePanel();
         else
            DrawPanel();
         return;
      }
   }

   if(PanelHidden) return;

   if(id == CHARTEVENT_MOUSE_MOVE)
   {
      int mx = (int)lparam;
      int my = (int)dparam;
      int state = (int)StringToInteger(sparam);

      if(PanelDragging)
      {
         if((state & 1) == 1)
         {
            PanelPosX = mx - DragOffsetX;
            PanelPosY = my - DragOffsetY;
            if(PanelPosX < 0) PanelPosX = 0;
            if(PanelPosY < 0) PanelPosY = 0;
            DrawPanel();
            ChartRedraw();
         }
         else
         {
            PanelDragging = false;
         }
      }
      else if((state & 1) == 1)
      {
         if(mx >= PanelPosX && mx <= PanelPosX + Panel_Width &&
            my >= PanelPosY && my <= PanelPosY + 24)
         {
            PanelDragging = true;
            PanelWasDragged = true;
            DragOffsetX = mx - PanelPosX;
            DragOffsetY = my - PanelPosY;
         }
      }
   }
   else if(id == CHARTEVENT_CHART_CHANGE && Panel_DefaultBottomLeft && !PanelWasDragged)
   {
      PanelPosY = GetDefaultPanelY();
      DrawPanel();
   }
}


// ===================================================================
//  SECTION 2: OnCalculate - SuperTrend + BB Trend + S/R
// ===================================================================
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
   if(!ValidateLicense(false))
      return(rates_total);

   if(TimeCurrent() - LastRefresh >= MathMax(1, RefreshSeconds))
   {
      RefreshScoring();
      if(Panel_Show)
         DrawPanel();
   }
   return(rates_total);
}

// --- S/R Zones ---
void DrawZone(const string label, const double level, const color clr,
              const datetime time_left, const datetime time_right, const int thickness)
{
   double offset_val = level * SR_ZoneWidth / 100.0;
   double top = level + offset_val;
   double bottom = level - offset_val;

   string rect_name = STPrefix + "SR_" + label + "_zone";
   ObjectCreate(0, rect_name, OBJ_RECTANGLE, 0, time_left, top, time_right, bottom);
   ObjectSetInteger(0, rect_name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, rect_name, OBJPROP_WIDTH, thickness);
   ObjectSetInteger(0, rect_name, OBJPROP_BACK, true);
   ObjectSetInteger(0, rect_name, OBJPROP_FILL, true);
   ObjectSetInteger(0, rect_name, OBJPROP_SELECTABLE, false);

   string line_name = STPrefix + "SR_" + label + "_line";
   ObjectCreate(0, line_name, OBJ_TREND, 0, time_left, level, time_right, level);
   ObjectSetInteger(0, line_name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, line_name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, line_name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, line_name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, line_name, OBJPROP_SELECTABLE, false);

   string txt_name = STPrefix + "SR_" + label + "_txt";
   ObjectCreate(0, txt_name, OBJ_TEXT, 0, time_right, level);
   ObjectSetText(txt_name, label + "  " + DoubleToString(level, Digits), 8, "Arial", clr);
   ObjectSetInteger(0, txt_name, OBJPROP_SELECTABLE, false);
}

void GetPreviousYearHL(double &year_high, double &year_low)
{
   year_high = 0.0;
   year_low = DBL_MAX;
   int prev_year = TimeYear(TimeCurrent()) - 1;
   int bars = iBars(Symbol(), PERIOD_MN1);
   for(int shift = 1; shift < bars; shift++)
   {
      datetime t = iTime(Symbol(), PERIOD_MN1, shift);
      if(TimeYear(t) == prev_year)
      {
         year_high = MathMax(year_high, iHigh(Symbol(), PERIOD_MN1, shift));
         year_low = MathMin(year_low, iLow(Symbol(), PERIOD_MN1, shift));
      }
   }
   if(year_low == DBL_MAX) { year_high = 0.0; year_low = 0.0; }
}

void CheckAlerts(const datetime &time[])
{
   if(AL_SuperTrend)
   {
      if(TrendDir[1] == 1.0 && TrendDir[2] == -1.0) PlaySound("tada.wav");
      if(TrendDir[1] == -1.0 && TrendDir[2] == 1.0) PlaySound("chord.wav");
   }
   if(AL_BB)
   {
      if(BBITrend[1] == 1.0 && BBITrend[2] == -1.0) PlaySound("tada.wav");
      if(BBITrend[1] == -1.0 && BBITrend[2] == 1.0) PlaySound("chord.wav");
   }
}


// ===================================================================
//  SECTION 3: SCORING ENGINE
// ===================================================================
void RefreshScoring()
{
   // Step 1: Clear all scores
   ArrayInitialize(ScoresD1, 0);
   ArrayInitialize(ScoresH4, 0);
   ArrayInitialize(ScoresH1, 0);
   ArrayInitialize(AdvD1, 0);
   ArrayInitialize(AdvH4, 0);
   ArrayInitialize(AdvH1, 0);

   // Step 2: Score all 21 pairs across 3 TFs x main + advance
   for(int i = 0; i < ArraySize(Pairs); i++)
   {
      ScorePairWindow(Pairs[i], 0, false);  // D1 main
      ScorePairWindow(Pairs[i], 1, false);  // H4 main
      ScorePairWindow(Pairs[i], 2, false);  // H1 main
      ScorePairWindow(Pairs[i], 0, true);   // D1 advance
      ScorePairWindow(Pairs[i], 1, true);   // H4 advance
      ScorePairWindow(Pairs[i], 2, true);   // H1 advance
   }

   // Step 3: Detect HARD_INVALID currencies
   DetectCurrencyConflicts();

   // Step 4: Compute current pair data
   CurrentPair = NormalizeSymbol(Symbol());
   CalculateCurrentGaps();
   DetectPairHardInvalid();

   // Step 5: Compute PL Zone from SuperTrend + Follow Line
   ComputePLZone();

   // Step 6: Store box bounds for current pair + compute box trends
   StoreCurrentBoxBounds();
   ComputeBoxTrends();

   // Step 7: Build ATR/Spread
   BuildAtrSpread(CurrentPair);

   // Step 8: Compute strength + confluence
   ComputeStrength();
   ComputeConfluence();

   // Step 9: Export files
   ExportAllFiles();

   // Step 10: Draw boxes on chart
   DrawCurrentChartBoxes();

   LastRefresh = TimeCurrent();
}

// --- Score one pair for one timeframe ---
void ScorePairWindow(const string pair, const int timeframe, const bool advance)
{
   string symbol = ResolveBrokerSymbol(pair);
   if(symbol == "") return;

   double price = MarketInfo(symbol, MODE_BID);
   if(price <= 0) return;

   datetime startTime = 0;
   datetime endTime = 0;
   GetBoxWindow(timeframe, advance, startTime, endTime);
   if(startTime <= 0 || endTime <= startTime) return;

   double boxLow = 0;
   double boxHigh = 0;
   if(!CalculateBoxBounds(symbol, startTime, endTime, boxLow, boxHigh)) return;

   int baseVote = 0;
   int quoteVote = 0;

   if(price > boxHigh)       { baseVote = 1;  quoteVote = -1; }
   else if(price < boxLow)   { baseVote = -1; quoteVote = 1;  }

   string base = StringSubstr(pair, 0, 3);
   string quote = StringSubstr(pair, 3, 3);
   AddCurrencyScore(base, baseVote, timeframe, advance);
   AddCurrencyScore(quote, quoteVote, timeframe, advance);
}

// --- Time windows for boxes ---
void GetBoxWindow(const int timeframe, const bool advance, datetime &startTime, datetime &endTime)
{
   datetime now = TimeCurrent();

   if(timeframe == 0) // D1 / Monthly (WagBox2)
   {
      datetime currentMonth = StartOfMonth(now);
      if(advance)
      {
         endTime = currentMonth;
         startTime = ShiftMonth(endTime, -1);
      }
      else
      {
         endTime = ShiftMonth(currentMonth, -MathMax(0, WagBox2Offset));
         startTime = ShiftMonth(endTime, -MathMax(1, WagBox2Months));
      }
      return;
   }

   if(timeframe == 1) // H4 / Weekly (WagBox1)
   {
      datetime currentWeek = StartOfWeek(now);
      if(advance)
      {
         endTime = currentWeek;
         startTime = endTime - 7 * 86400;
      }
      else
      {
         endTime = currentWeek - MathMax(0, WagBox1Offset) * 7 * 86400;
         startTime = endTime - MathMax(1, WagBox1Weeks) * 7 * 86400;
      }
      return;
   }

   // timeframe == 2: H1 / Daily (WagBox3)
   datetime currentDay = StartOfDay(now);
   if(advance)
   {
      endTime = currentDay;
      startTime = endTime - 86400;
   }
   else
   {
      endTime = currentDay - MathMax(0, WagBox3Offset) * 86400;
      startTime = endTime - MathMax(1, WagBox3Days) * 86400;
   }
}

// --- Calculate high/low of box within time window ---
bool CalculateBoxBounds(const string symbol, const datetime startTime, const datetime endTime,
                        double &boxLow, double &boxHigh)
{
   int bars = iBars(symbol, BoxCalcTF);
   if(bars <= 0) return(false);

   bool found = false;
   boxLow = DBL_MAX;
   boxHigh = -DBL_MAX;

   for(int i = 0; i < bars; i++)
   {
      datetime barTime = iTime(symbol, BoxCalcTF, i);
      if(barTime >= endTime) continue;
      if(barTime < startTime) break;

      double hi = iHigh(symbol, BoxCalcTF, i);
      double lo = iLow(symbol, BoxCalcTF, i);
      if(hi <= 0 || lo <= 0) continue;

      boxHigh = MathMax(boxHigh, hi);
      boxLow = MathMin(boxLow, lo);
      found = true;
   }
   return(found);
}

// --- Currency score accumulation ---
void AddCurrencyScore(const string currency, const int vote, const int timeframe, const bool advance)
{
   int idx = CurrencyIndex(currency);
   if(idx < 0) return;

   if(advance)
   {
      if(timeframe == 0)      AdvD1[idx] += vote;
      else if(timeframe == 1) AdvH4[idx] += vote;
      else                    AdvH1[idx] += vote;
   }
   else
   {
      if(timeframe == 0)      ScoresD1[idx] += vote;
      else if(timeframe == 1) ScoresH4[idx] += vote;
      else                    ScoresH1[idx] += vote;
   }
}

int CurrencyScore(const string currency, const int timeframe, const bool advance)
{
   int idx = CurrencyIndex(currency);
   if(idx < 0) return(0);

   if(advance)
   {
      if(timeframe == 0) return(AdvD1[idx]);
      if(timeframe == 1) return(AdvH4[idx]);
      return(AdvH1[idx]);
   }
   if(timeframe == 0) return(ScoresD1[idx]);
   if(timeframe == 1) return(ScoresH4[idx]);
   return(ScoresH1[idx]);
}

int CurrencyIndex(const string currency)
{
   for(int i = 0; i < ArraySize(Currencies); i++)
      if(Currencies[i] == currency) return(i);
   return(-1);
}

// --- Strongest score across timeframes (exact match to engine) ---
int StrongestScore(const int d1, const int h4, const int h1)
{
   int strongestPos = 0;
   int strongestNeg = 0;

   if(d1 > strongestPos) strongestPos = d1;
   if(h4 > strongestPos) strongestPos = h4;
   if(h1 > strongestPos) strongestPos = h1;
   if(d1 < strongestNeg) strongestNeg = d1;
   if(h4 < strongestNeg) strongestNeg = h4;
   if(h1 < strongestNeg) strongestNeg = h1;

   int absPos = MathAbs(strongestPos);
   int absNeg = MathAbs(strongestNeg);
   if(absPos == absNeg) return(0);
   return(absNeg > absPos ? strongestNeg : strongestPos);
}

// --- Gap calculation for current pair ---
void CalculateCurrentGaps()
{
   MainGap = 0;
   AdvGap = 0;
   MainBias = "WAIT";
   AdvBias = "WAIT";
   Execution = "NONE";
   Confidence = "INVALID";

   string pair = CurrentPair;
   if(StringLen(pair) < 6) pair = NormalizeSymbol(Symbol());

   string base = StringSubstr(pair, 0, 3);
   string quote = StringSubstr(pair, 3, 3);

   int baseStrong = StrongestScore(CurrencyScore(base, 0, false),
                                   CurrencyScore(base, 1, false),
                                   CurrencyScore(base, 2, false));
   int quoteStrong = StrongestScore(CurrencyScore(quote, 0, false),
                                    CurrencyScore(quote, 1, false),
                                    CurrencyScore(quote, 2, false));
   MainGap = baseStrong - quoteStrong;

   int advBaseStrong = StrongestScore(CurrencyScore(base, 0, true),
                                      CurrencyScore(base, 1, true),
                                      CurrencyScore(base, 2, true));
   int advQuoteStrong = StrongestScore(CurrencyScore(quote, 0, true),
                                       CurrencyScore(quote, 1, true),
                                       CurrencyScore(quote, 2, true));
   AdvGap = advBaseStrong - advQuoteStrong;

   // Bias
   if(MathAbs(MainGap) < GapThreshold)
      MainBias = "INVALID";
   else
      MainBias = (MainGap > 0) ? "BUY" : "SELL";

   if(MathAbs(AdvGap) < GapThreshold)
      AdvBias = "INVALID";
   else
      AdvBias = (AdvGap > 0) ? "BUY" : "SELL";

   // Execution + Confidence (exact match to engine)
   int absGap = MathAbs(MainGap);
   if(absGap >= 9)      Execution = "MARKET";
   else if(absGap >= 5) Execution = "PULLBACK";
   else                 Execution = "NONE";

   if(absGap >= 10)     Confidence = "HIGH";
   else if(absGap >= 8) Confidence = "MEDIUM";
   else if(absGap >= 5) Confidence = "LOW";
   else                 Confidence = "INVALID";
}


// ===================================================================
//  SECTION 4: HARD_INVALID DETECTION (exact match to engine)
// ===================================================================
void DetectCurrencyConflicts()
{
   // A currency is conflicted if it has significant positive (>=4)
   // AND significant negative (<=-4) scores across ANY timeframe.
   // Exact match to extract_panda_score conflict detection.
   for(int i = 0; i < 7; i++)
   {
      bool hasPosSignificant = (ScoresD1[i] >= 4) || (ScoresH4[i] >= 4) || (ScoresH1[i] >= 4);
      bool hasNegSignificant = (ScoresD1[i] <= -4) || (ScoresH4[i] <= -4) || (ScoresH1[i] <= -4);
      CurrencyInvalid[i] = (hasPosSignificant && hasNegSignificant);
   }
}

void DetectPairHardInvalid()
{
   HardInvalid = false;
   ConflictDetail = "";

   string pair = CurrentPair;
   if(StringLen(pair) < 6) return;

   string base = StringSubstr(pair, 0, 3);
   string quote = StringSubstr(pair, 3, 3);
   int baseIdx = CurrencyIndex(base);
   int quoteIdx = CurrencyIndex(quote);
   if(baseIdx < 0 || quoteIdx < 0) { HardInvalid = true; return; }

   // Global currency conflict
   bool baseConflict = CurrencyInvalid[baseIdx];
   bool quoteConflict = CurrencyInvalid[quoteIdx];

   if(baseConflict || quoteConflict)
   {
      HardInvalid = true;
      if(baseConflict) ConflictDetail = base;
      if(quoteConflict)
      {
         if(StringLen(ConflictDetail) > 0) ConflictDetail += ",";
         ConflictDetail += quote;
      }
      MainGap = 0;
      MainBias = "HARD_INVALID";
      Execution = "NONE";
      Confidence = "INVALID";
      return;
   }

   // Neutral vs Neutral: both base and quote strongest < 4
   int baseStrong = StrongestScore(CurrencyScore(base, 0, false),
                                   CurrencyScore(base, 1, false),
                                   CurrencyScore(base, 2, false));
   int quoteStrong = StrongestScore(CurrencyScore(quote, 0, false),
                                    CurrencyScore(quote, 1, false),
                                    CurrencyScore(quote, 2, false));

   if(MathAbs(baseStrong) < 4 && MathAbs(quoteStrong) < 4)
   {
      HardInvalid = true;
      ConflictDetail = "NEUTRAL_VS_NEUTRAL";
      MainGap = 0;
      MainBias = "HARD_INVALID";
      Execution = "NONE";
      Confidence = "INVALID";
   }
}


// ===================================================================
//  SECTION 5: PL ZONE (from SuperTrend + Follow Line)
// ===================================================================
double GetCurrentST()
{
   // Get current SuperTrend value from buffer[0]
   if(ArraySize(STBullish) > 0 && STBullish[0] != EMPTY_VALUE && STBullish[0] > 0)
      return(STBullish[0]);
   if(ArraySize(STBearish) > 0 && STBearish[0] != EMPTY_VALUE && STBearish[0] > 0)
      return(STBearish[0]);
   return(0);
}

double GetCurrentFL()
{
   // Get current Follow Line (BB Trend) value from buffer[0]
   if(ArraySize(BBTrendBull) > 0 && BBTrendBull[0] != EMPTY_VALUE && BBTrendBull[0] > 0)
      return(BBTrendBull[0]);
   if(ArraySize(BBTrendBear) > 0 && BBTrendBear[0] != EMPTY_VALUE && BBTrendBear[0] > 0)
      return(BBTrendBear[0]);
   return(0);
}

void ComputePLZone()
{
   PLSTValue = 0;
   PLFLValue = 0;
   PLZone = "--";
   PLBias = "--";
   PLG1Valid = false;
}


// ===================================================================
//  SECTION 6: BOX TRENDS (midpoint rule - exact match to engine)
// ===================================================================
void StoreCurrentBoxBounds()
{
   Box3Valid = false; Box1Valid = false; Box2Valid = false;
   Box3High = 0; Box3Low = 0;
   Box1High = 0; Box1Low = 0;
   Box2High = 0; Box2Low = 0;

   string symbol = ResolveBrokerSymbol(CurrentPair);
   if(symbol == "") symbol = Symbol();

   // WagBox3 (H1 context, ~2d span, shortest)
   GetBoxWindow(2, false, Box3Start, Box3End);
   if(Box3Start > 0 && Box3End > Box3Start)
      Box3Valid = CalculateBoxBounds(symbol, Box3Start, Box3End, Box3Low, Box3High);

   // WagBox1 (H4 context, ~14d span, medium)
   GetBoxWindow(1, false, Box1Start, Box1End);
   if(Box1Start > 0 && Box1End > Box1Start)
      Box1Valid = CalculateBoxBounds(symbol, Box1Start, Box1End, Box1Low, Box1High);

   // WagBox2 (D1 context, ~62d span, longest)
   GetBoxWindow(0, false, Box2Start, Box2End);
   if(Box2Start > 0 && Box2End > Box2Start)
      Box2Valid = CalculateBoxBounds(symbol, Box2Start, Box2End, Box2Low, Box2High);
}

void ComputeBoxTrends()
{
   // Engine logic: compute_box_trends (lines 383-433 of app.py)
   // Sort boxes by span: shortest=WagBox3, medium=WagBox1, longest=WagBox2
   // H1 trend = trend(WagBox1 as former, WagBox3 as latter)
   // H4 trend = trend(WagBox2 as former, WagBox1 as latter)
   // trend(former, latter):
   //   f_hi = max(former high, former low)  [always high]
   //   f_lo = min(former high, former low)  [always low]
   //   l_mid = (latter high + latter low) / 2
   //   l_mid >= f_hi - UPTREND
   //   l_mid <= f_lo - DOWNTREND
   //   else - RANGING

   BoxH1Trend = "UNKNOWN";
   BoxH4Trend = "UNKNOWN";

   if(!Box3Valid || !Box1Valid) return;

   // H1 trend: WagBox1 (medium) as former, WagBox3 (short) as latter
   double h1_latter_mid = (Box3High + Box3Low) / 2.0;
   if(h1_latter_mid >= Box1High)      BoxH1Trend = "UPTREND";
   else if(h1_latter_mid <= Box1Low)  BoxH1Trend = "DOWNTREND";
   else                               BoxH1Trend = "RANGING";

   if(!Box2Valid) return;

   // H4 trend: WagBox2 (long) as former, WagBox1 (medium) as latter
   double h4_latter_mid = (Box1High + Box1Low) / 2.0;
   if(h4_latter_mid >= Box2High)      BoxH4Trend = "UPTREND";
   else if(h4_latter_mid <= Box2Low)  BoxH4Trend = "DOWNTREND";
   else                               BoxH4Trend = "RANGING";
}


// ===================================================================
//  SECTION 7: STRENGTH + CONFLUENCE
// ===================================================================
void ComputeStrength()
{
   // Simplified strength based on gap magnitude
   // (engine uses delta_mid/accel which requires gap history - we use fallback)
   if(HardInvalid)
      Strength = 0;
   else
      Strength = MathAbs(MainGap) * 0.3;
}

void ComputeConfluence()
{
   // Exact match to engine's panda_score file confluence (lines 1204-1260 of app.py)
   ConfluenceScore = 0;
   if(HardInvalid) return;

   int absGap = MathAbs(MainGap);
   bool isBuy = (MainGap > 0);

   // 1. Gap magnitude (+25 or +15)
   if(absGap >= 8)      ConfluenceScore += 25;
   else if(absGap >= 5) ConfluenceScore += 15;

   // 2. Matchup spread - individual TF scores
   string base = StringSubstr(CurrentPair, 0, 3);
   string quote = StringSubstr(CurrentPair, 3, 3);
   int baseD1 = CurrencyScore(base, 0, false);
   int baseH4 = CurrencyScore(base, 1, false);
   int baseH1 = CurrencyScore(base, 2, false);
   int quoteD1 = CurrencyScore(quote, 0, false);
   int quoteH4 = CurrencyScore(quote, 1, false);
   int quoteH1 = CurrencyScore(quote, 2, false);

   int bsRaw = 0, qsRaw = 0;
   if(isBuy)
   {
      bsRaw = MathMax(MathMax((baseD1 > 0 ? baseD1 : 0), (baseH4 > 0 ? baseH4 : 0)), (baseH1 > 0 ? baseH1 : 0));
      qsRaw = MathMin(MathMin((quoteD1 < 0 ? quoteD1 : 0), (quoteH4 < 0 ? quoteH4 : 0)), (quoteH1 < 0 ? quoteH1 : 0));
   }
   else
   {
      bsRaw = MathMin(MathMin((baseD1 < 0 ? baseD1 : 0), (baseH4 < 0 ? baseH4 : 0)), (baseH1 < 0 ? baseH1 : 0));
      qsRaw = MathMax(MathMax((quoteD1 > 0 ? quoteD1 : 0), (quoteH4 > 0 ? quoteH4 : 0)), (quoteH1 > 0 ? quoteH1 : 0));
   }
   int muDiff = MathAbs(bsRaw - qsRaw);
   if(muDiff >= 8)      ConfluenceScore += 20;
   else if(muDiff >= 5) ConfluenceScore += 10;

   // 3. PL zone validation (+15 or -15 penalty)
   bool plValid = (PLZone == "ABOVE" && isBuy) || (PLZone == "BELOW" && !isBuy);
   if(plValid) ConfluenceScore += 15;

   // 4. Box alignment (+10 or +5)
   string goodTrend = isBuy ? "UPTREND" : "DOWNTREND";
   bool h1ok = (BoxH1Trend == goodTrend);
   bool h4ok = (BoxH4Trend == goodTrend);
   if(h1ok && h4ok)     ConfluenceScore += 10;
   else if(h1ok)        ConfluenceScore += 5;

   // 5. COT - not available in indicator, skip (dashboard-only)

   // 6. Momentum bonus - not available without gap history, skip
   // (engine adds +10 STRONG, +5 BUILDING)

   // 7. Strength bonus (+10 or +5)
   double absStr = MathAbs(Strength);
   if(absStr >= 3)      ConfluenceScore += 10;
   else if(absStr >= 1) ConfluenceScore += 5;

   // 8. Penalties (same as engine)
   if(BoxH4Trend != "" && BoxH4Trend != "UNKNOWN" && !h4ok) ConfluenceScore -= 10;
   if(!plValid) ConfluenceScore -= 15;
   // Momentum penalty skipped (no momentum data)

   ConfluenceScore = MathMax(0, MathMin(100, ConfluenceScore));
}


// ===================================================================
//  SECTION 8: FILE EXPORTS
// ===================================================================
void ExportAllFiles()
{
   if(StringLen(CurrentPair) < 6) return;

   if(ExportPandaScore) WritePandaScoreFile();
   if(ExportForEngine) WriteMt4File();
}

// --- panda_score_SYMBOL.txt (what the panel reads) ---
void WritePandaScoreFile()
{
   string prefix = TestMode ? "pe_panda_score_" : "panda_score_";
   string filename = prefix + CurrentPair + ".txt";
   int handle = FileOpen(filename, FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle == INVALID_HANDLE) return;

   FileWriteString(handle,
      "GAP:" + IntegerToString(MainGap) + "\n" +
      "BIAS:" + MainBias + "\n" +
      "CONFIDENCE:" + Confidence + "\n" +
      "EXECUTION:" + Execution + "\n" +
      "MOMENTUM:NEUTRAL\n" +
      "STRENGTH:" + DoubleToString(Strength, 2) + "\n" +
      "HARD_INVALID:" + IntegerToString(HardInvalid ? 1 : 0) + "\n" +
      "PL_ZONE:" + PLZone + "\n" +
      "PL_G1:" + IntegerToString(PLG1Valid ? 1 : 0) + "\n" +
      "BOX_H1:" + BoxH1Trend + "\n" +
      "BOX_H4:" + BoxH4Trend + "\n" +
      "CONFLUENCE:" + IntegerToString(ConfluenceScore) + "\n" +
      "WRITE_TIME:" + TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\n");
   FileClose(handle);
}

// --- mt4_SYMBOL.txt (what the engine reads for scoring) ---
void WriteMt4File()
{
   string pair = CurrentPair;
   if(StringLen(pair) < 6) return;

   string base = StringSubstr(pair, 0, 3);
   string quote = StringSubstr(pair, 3, 3);

   string prefix = TestMode ? "pe_mt4_" : "mt4_";
   string filename = prefix + pair + ".txt";
   int handle = FileOpen(filename, FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle == INVALID_HANDLE) return;

   // Base line: "EUR      : D1 :  +5    | H4 :  +3    | H1 :  +4"
   FileWriteString(handle,
      FormatScoreLine(base,
         CurrencyScore(base, 0, false),
         CurrencyScore(base, 1, false),
         CurrencyScore(base, 2, false)) + "\n");

   // Quote line
   FileWriteString(handle,
      FormatScoreLine(quote,
         CurrencyScore(quote, 0, false),
         CurrencyScore(quote, 1, false),
         CurrencyScore(quote, 2, false)) + "\n");

   // ADV Base
   FileWriteString(handle,
      "ADV : " + FormatScoreLine(base,
         CurrencyScore(base, 0, true),
         CurrencyScore(base, 1, true),
         CurrencyScore(base, 2, true)) + "\n");

   // ADV Quote
   FileWriteString(handle,
      "ADV : " + FormatScoreLine(quote,
         CurrencyScore(quote, 0, true),
         CurrencyScore(quote, 1, true),
         CurrencyScore(quote, 2, true)) + "\n");

   // ATR line
   FileWriteString(handle, AtrLine + "\n");

   // SPREAD line
   FileWriteString(handle, SpreadLine + "\n");

   // BOX lines: BOX|Name|start_ts|high|end_ts|low
   if(Box3Valid)
      FileWriteString(handle, "BOX|WagBox3|" + IntegerToString((int)Box3Start) + "|" +
         DoubleToString(Box3High, Digits) + "|" + IntegerToString((int)Box3End) + "|" +
         DoubleToString(Box3Low, Digits) + "\n");
   if(Box1Valid)
      FileWriteString(handle, "BOX|WagBox1|" + IntegerToString((int)Box1Start) + "|" +
         DoubleToString(Box1High, Digits) + "|" + IntegerToString((int)Box1End) + "|" +
         DoubleToString(Box1Low, Digits) + "\n");
   if(Box2Valid)
      FileWriteString(handle, "BOX|WagBox2|" + IntegerToString((int)Box2Start) + "|" +
         DoubleToString(Box2High, Digits) + "|" + IntegerToString((int)Box2End) + "|" +
         DoubleToString(Box2Low, Digits) + "\n");

   FileClose(handle);
}

// --- tbg_SYMBOL.txt (what the engine reads for PL zone) ---
void WriteTbgFile()
{
   string pair = CurrentPair;
   if(StringLen(pair) < 6) return;

   string prefix = TestMode ? "pe_tbg_" : "tbg_";
   string filename = prefix + pair + ".txt";
   int handle = FileOpen(filename, FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(handle == INVALID_HANDLE) return;

   string symbol = ResolveBrokerSymbol(pair);
   if(symbol == "") symbol = Symbol();
   double price = MarketInfo(symbol, MODE_BID);

   FileWriteString(handle,
      "TBG_ST   : " + DoubleToString(PLSTValue, Digits) + "\n" +
      "TBG_FL   : " + DoubleToString(PLFLValue, Digits) + "\n" +
      "TBG_BIAS : " + PLBias + "\n" +
      "TBG_ZONE : " + PLZone + "\n" +
      "TBG_G1   : " + (PLG1Valid ? "VALID" : "INVALID") + "\n" +
      "TBG_PRICE: " + DoubleToString(price, Digits) + "\n");

   // S/R levels
   double pdh = iHigh(symbol, PERIOD_D1, 1);
   double pdl = iLow(symbol, PERIOD_D1, 1);
   double pwh = iHigh(symbol, PERIOD_W1, 1);
   double pwl = iLow(symbol, PERIOD_W1, 1);
   double pmh = iHigh(symbol, PERIOD_MN1, 1);
   double pml = iLow(symbol, PERIOD_MN1, 1);
   double pyh = 0, pyl = 0;
   GetPreviousYearHL(pyh, pyl);

   if(pdh > 0) FileWriteString(handle, "PDH : " + DoubleToString(pdh, Digits) + "\n");
   if(pdl > 0) FileWriteString(handle, "PDL : " + DoubleToString(pdl, Digits) + "\n");
   if(pwh > 0) FileWriteString(handle, "PWH : " + DoubleToString(pwh, Digits) + "\n");
   if(pwl > 0) FileWriteString(handle, "PWL : " + DoubleToString(pwl, Digits) + "\n");
   if(pmh > 0) FileWriteString(handle, "PMH : " + DoubleToString(pmh, Digits) + "\n");
   if(pml > 0) FileWriteString(handle, "PML : " + DoubleToString(pml, Digits) + "\n");
   if(pyh > 0) FileWriteString(handle, "PYH : " + DoubleToString(pyh, Digits) + "\n");
   if(pyl > 0) FileWriteString(handle, "PYL : " + DoubleToString(pyl, Digits) + "\n");

   FileClose(handle);
}


// ===================================================================
//  SECTION 9: ATR / SPREAD
// ===================================================================
void BuildAtrSpread(const string pair)
{
   // Fully independent - computes ATR and spread from live market data.
   // No dependency on any external file.
   string symbol = ResolveBrokerSymbol(pair);
   if(symbol == "")
   {
      AtrLine = "ATR : --";
      SpreadLine = "SPREAD : --";
      return;
   }

   double point = MarketInfo(symbol, MODE_POINT);
   if(point <= 0) point = Point;

   int atr1 = (int)MathRound(iATR(symbol, PERIOD_H1, 14, 1) / point);
   int atr2 = (int)MathRound(iATR(symbol, PERIOD_D1, 14, 1) / point);
   int spread_val = (int)MathRound(MarketInfo(symbol, MODE_SPREAD));

   AtrLine = "ATR : " + IntegerToString(atr1) + " : " + IntegerToString(atr2) + " Points.";
   SpreadLine = "SPREAD : " + IntegerToString(spread_val) + " Points.";
}


// ===================================================================
//  SECTION 10: PANEL DRAWING
// ===================================================================
void DrawPanel()
{
   RemoveObjectsByPrefix(PanelPrefix);

   int x = PanelPosX;
   int y = PanelPosY;
   int w = Panel_Width;
   int lineH = 17;
   int h = 360;

   // Background
   CreateRect(PanelPrefix + "bg", x, y, w, h, Panel_BgColor, 200);

   // Header bar (draggable)
   CreateRect(PanelPrefix + "header", x, y, w, 26, C'30,30,50', 230);
   string titleText = TestMode ? "SCORING V3" : "SCORING V3";
   CreateLabel(PanelPrefix + "title", x + 8, y + 5, titleText, C'0,180,255', 10, "Arial Bold");
   CreateLabel(PanelPrefix + "toggle", x + w - 20, y + 5, "x", C'180,180,180', 10, "Arial Bold");
   ObjectSetInteger(0, PanelPrefix + "toggle", OBJPROP_SELECTABLE, false);

   int cy = y + 34;
   int line = 0;

   // --- PAIR + BIAS + GAP ---
   string pairName = CurrentPair;
   if(StringLen(pairName) < 6) pairName = NormalizeSymbol(Symbol());

   color biasClr = Panel_WaitColor;
   if(MainBias == "BUY")               biasClr = Panel_BuyColor;
   else if(MainBias == "SELL")          biasClr = Panel_SellColor;
   else if(MainBias == "HARD_INVALID")  biasClr = C'255,170,68';
   else if(MainBias == "INVALID")       biasClr = C'160,160,160';

   string gapStr = IntegerToString(MainGap);
   if(MainGap > 0) gapStr = "+" + gapStr;

   CreatePanelLine(line++, x, cy, "PAIR        " + pairName, White, 11, "Arial Bold");
   CreatePanelLine(line++, x, cy, "BIAS        " + MainBias, biasClr, Panel_FontSize + 2, "Arial Bold");
   CreatePanelLine(line++, x, cy, "GAP SCORE   " + gapStr, biasClr, Panel_FontSize + 1, "Arial Bold");

   // --- SEPARATOR ---
   CreateRect(PanelPrefix + "sep1", x + 8, cy + line * lineH + 3, w - 16, 1, C'50,50,70', 150);
   line++;

   // --- PL ZONE + G1 ---
   color plClr = Panel_WaitColor;
   if(PLZone == "ABOVE")       plClr = Panel_BuyColor;
   else if(PLZone == "BELOW")  plClr = Panel_SellColor;
   else if(PLZone == "BETWEEN") plClr = C'255,170,68';

   string g1Tag = "WAIT";
   color g1Clr = Panel_WaitColor;
   if(PLZone != "--" && PLZone != "")
   {
      if(PLG1Valid) { g1Tag = "OK"; g1Clr = Panel_BuyColor; }
      else         { g1Tag = "WAIT"; g1Clr = C'255,100,100'; }
   }
   CreatePanelLine(line++, x, cy, "PL ZONE  " + PLZone + "   G1  " + g1Tag, plClr, Panel_FontSize, "Arial");

   // --- BOX TRENDS ---
   string h1Short = BoxH1Trend;
   if(BoxH1Trend == "UPTREND")        h1Short = "UP";
   else if(BoxH1Trend == "DOWNTREND") h1Short = "DN";
   else if(BoxH1Trend == "RANGING")   h1Short = "RNG";

   string h4Short = BoxH4Trend;
   if(BoxH4Trend == "UPTREND")        h4Short = "UP";
   else if(BoxH4Trend == "DOWNTREND") h4Short = "DN";
   else if(BoxH4Trend == "RANGING")   h4Short = "RNG";

   CreatePanelLine(line++, x, cy, "BOX  H1 " + h1Short + "   H4 " + h4Short, Panel_TextColor, Panel_FontSize, "Arial");

   // --- SEPARATOR ---
   CreateRect(PanelPrefix + "sep2", x + 8, cy + line * lineH + 3, w - 16, 1, C'50,50,70', 150);
   line++;

   // --- ST + FL STATUS ---
   string stDir = "---";
   color stClr = Panel_WaitColor;
   if(ArraySize(STBullish) > 0 && STBullish[0] != EMPTY_VALUE && STBullish[0] > 0) { stDir = "BULL"; stClr = Panel_BuyColor; }
   else if(ArraySize(STBearish) > 0 && STBearish[0] != EMPTY_VALUE && STBearish[0] > 0) { stDir = "BEAR"; stClr = Panel_SellColor; }

   string flDir = "---";
   color flClr = Panel_WaitColor;
   if(ArraySize(BBTrendBull) > 0 && BBTrendBull[0] != EMPTY_VALUE && BBTrendBull[0] > 0) { flDir = "BULL"; flClr = Panel_BuyColor; }
   else if(ArraySize(BBTrendBear) > 0 && BBTrendBear[0] != EMPTY_VALUE && BBTrendBear[0] > 0) { flDir = "BEAR"; flClr = Panel_SellColor; }

   // Draw ST and FL on same line with separate colors
   CreatePanelLine(line, x, cy, "ST  " + stDir, stClr, Panel_FontSize, "Arial");
   CreateLabel(PanelPrefix + "fl_label", x + 130, cy + line * lineH, "FL  " + flDir, flClr, Panel_FontSize, "Arial");
   ObjectSetInteger(0, PanelPrefix + "fl_label", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, PanelPrefix + "fl_label", OBJPROP_HIDDEN, true);
   line++;

   // --- SEPARATOR ---
   CreateRect(PanelPrefix + "sep4", x + 8, cy + line * lineH + 3, w - 16, 1, C'50,50,70', 150);
   line++;

   // --- RAW SCORING ---
   string base = StringSubstr(pairName, 0, 3);
   string quote = StringSubstr(pairName, 3, 3);

   CreatePanelLine(line++, x, cy, "RAW SCORING", C'120,120,150', 8, "Arial Bold");

   string baseLine = FormatScoreLine(base,
      CurrencyScore(base, 0, false), CurrencyScore(base, 1, false), CurrencyScore(base, 2, false));
   string quoteLine = FormatScoreLine(quote,
      CurrencyScore(quote, 0, false), CurrencyScore(quote, 1, false), CurrencyScore(quote, 2, false));
   string advBaseLine = "ADV:" + FormatScoreLine(base,
      CurrencyScore(base, 0, true), CurrencyScore(base, 1, true), CurrencyScore(base, 2, true));
   string advQuoteLine = "ADV:" + FormatScoreLine(quote,
      CurrencyScore(quote, 0, true), CurrencyScore(quote, 1, true), CurrencyScore(quote, 2, true));

   CreatePanelLine(line++, x, cy, ClipText(baseLine, 46), Panel_TextColor, Panel_FontSize - 1, "Consolas");
   CreatePanelLine(line++, x, cy, ClipText(quoteLine, 46), Panel_TextColor, Panel_FontSize - 1, "Consolas");
   CreatePanelLine(line++, x, cy, ClipText(advBaseLine, 46), C'180,180,200', Panel_FontSize - 1, "Consolas");
   CreatePanelLine(line++, x, cy, ClipText(advQuoteLine, 46), C'180,180,200', Panel_FontSize - 1, "Consolas");
   CreatePanelLine(line++, x, cy, ClipText(AtrLine, 46), C'170,190,210', Panel_FontSize - 1, "Consolas");
   CreatePanelLine(line++, x, cy, ClipText(SpreadLine, 46), C'170,190,210', Panel_FontSize - 1, "Consolas");

   // --- FRESHNESS ---
   if(LastRefresh > 0)
   {
      int age = (int)(TimeCurrent() - LastRefresh);
      string freshStr = (age < 120) ? "LIVE " + IntegerToString(age) + "s" : IntegerToString(age/60) + "m ago";
      color freshClr = (age < 120) ? C'0,180,255' : C'180,100,100';
      CreateLabel(PanelPrefix + "fresh", x + w - 12, cy, freshStr, freshClr, 7, "Arial");
      ObjectSetInteger(0, PanelPrefix + "fresh", OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
   }

   ChartRedraw();
}

void HidePanel()
{
   RemoveObjectsByPrefix(PanelPrefix);
   int x = PanelPosX;
   int y = PanelPosY;
   CreateRect(PanelPrefix + "mini_bg", x, y, 140, 24, Panel_BgColor, 200);
   CreateLabel(PanelPrefix + "mini_label", x + 8, y + 5, "SCORING V3", C'0,180,255', 9, "Arial Bold");
   CreateLabel(PanelPrefix + "toggle", x + 120, y + 5, "+", C'180,180,180', 10, "Arial Bold");
   ObjectSetInteger(0, PanelPrefix + "toggle", OBJPROP_SELECTABLE, false);
   ChartRedraw();
}


// ===================================================================
//  SECTION 11: CHART BOX DRAWING
// ===================================================================
void DrawCurrentChartBoxes()
{
   RemoveObjectsByPrefix(BoxPrefix);
   if(!ShowBoxes) return;

   string symbol = ResolveBrokerSymbol(CurrentPair);
   if(symbol == "") symbol = Symbol();

   if(Box2Valid) DrawOneBox(Box2Start, Box2End, Box2High, Box2Low, "WagBox2", WagBox2Color);
   if(Box1Valid) DrawOneBox(Box1Start, Box1End, Box1High, Box1Low, "WagBox1", WagBox1Color);
   if(Box3Valid) DrawOneBox(Box3Start, Box3End, Box3High, Box3Low, "WagBox3", WagBox3Color);
}

void DrawOneBox(const datetime startTime, const datetime endTime,
                const double boxHigh, const double boxLow,
                const string label, const color clr)
{
   string rectName = BoxPrefix + label;
   ObjectCreate(0, rectName, OBJ_RECTANGLE, 0, startTime, boxHigh, endTime, boxLow);
   ObjectSetInteger(0, rectName, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, rectName, OBJPROP_WIDTH, BoxLineWidth);
   ObjectSetInteger(0, rectName, OBJPROP_STYLE, STYLE_SOLID);
   ObjectSetInteger(0, rectName, OBJPROP_BACK, true);
   ObjectSetInteger(0, rectName, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, rectName, OBJPROP_HIDDEN, true);

}


// ===================================================================
//  SECTION 12: UTILITY FUNCTIONS
// ===================================================================
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
   if(MarketInfo(clean, MODE_BID) > 0) return(clean);

   for(int i = 0; i < SymbolsTotal(true); i++)
   {
      string symbol = SymbolName(i, true);
      if(NormalizeSymbol(symbol) == clean) return(symbol);
   }
   for(int j = 0; j < SymbolsTotal(false); j++)
   {
      string symbolAll = SymbolName(j, false);
      if(NormalizeSymbol(symbolAll) == clean) return(symbolAll);
   }
   return("");
}

string FormatScoreLine(const string label, const int d1, const int h4, const int h1)
{
   string left = label;
   while(StringLen(left) < 9) left = left + " ";
   return(left + "D1:" + FormatTfValue(d1) + " H4:" + FormatTfValue(h4) + " H1:" + FormatTfValue(h1));
}

string FormatTfValue(const int value)
{
   string text = SignedInt(value);
   if(value == 0) text = " 0";
   while(StringLen(text) < 3) text = " " + text;
   return(text);
}

string SignedInt(const int value)
{
   if(value > 0) return("+" + IntegerToString(value));
   return(IntegerToString(value));
}

string ClipText(string text, int maxLen)
{
   if(text == "") return("--");
   if(StringLen(text) <= maxLen) return(text);
   if(maxLen <= 3) return(StringSubstr(text, 0, maxLen));
   return(StringSubstr(text, 0, maxLen - 3) + "...");
}

string TrimStr(string text)
{
   StringTrimLeft(text);
   StringTrimRight(text);
   return(text);
}

// --- Math helpers ---
double TrueRange(const int i, const int rates_total,
                 const double &high[], const double &low[], const double &close[])
{
   if(i + 1 >= rates_total) return(high[i] - low[i]);
   return(MathMax(high[i] - low[i],
          MathMax(MathAbs(high[i] - close[i + 1]),
                  MathAbs(low[i] - close[i + 1]))));
}

double AtrSma(const int i, const int period, const int rates_total,
              const double &high[], const double &low[], const double &close[])
{
   double sum = 0.0;
   int count = 0;
   for(int k = 0; k < period && i + k < rates_total; k++)
   {
      sum += TrueRange(i + k, rates_total, high, low, close);
      count++;
   }
   return(count > 0 ? sum / period : 0.0);
}

double SmaClose(const int i, const int period, const int rates_total, const double &close[])
{
   double sum = 0.0;
   for(int k = 0; k < period && i + k < rates_total; k++)
      sum += close[i + k];
   return(sum / period);
}

double StdDevClose(const int i, const int period, const int rates_total,
                   const double &close[], const double mean)
{
   double sum = 0.0;
   for(int k = 0; k < period && i + k < rates_total; k++)
   {
      double delta = close[i + k] - mean;
      sum += delta * delta;
   }
   return(MathSqrt(sum / period));
}

bool IsValidVal(const double value)
{
   return(value != EMPTY_VALUE && value == value);
}

string UrlEncodeLite(string value)
{
   StringReplace(value, "%", "%25");
   StringReplace(value, " ", "%20");
   StringReplace(value, "&", "%26");
   StringReplace(value, "=", "%3D");
   StringReplace(value, "+", "%2B");
   return(value);
}

bool IsLicenseGraceValid()
{
   return(LicenseOk && LicenseGraceUntil > 0 && TimeCurrent() <= LicenseGraceUntil);
}

void ShowLicenseAlert(const string message)
{
   if(TimeCurrent() - LastLicenseAlert < 60)
      return;
   LastLicenseAlert = TimeCurrent();
   Alert(message);
   Print(message);
}

bool ValidateLicense(const bool force)
{
   datetime now = TimeCurrent();
   if(!force && LicenseOk && (now - LastLicenseCheck) < MathMax(60, LicenseCheckSeconds))
      return(true);

   string body = "product_code=" + UrlEncodeLite(ProductCode)
      + "&account_number=" + IntegerToString(AccountNumber())
      + "&account_server=" + UrlEncodeLite(AccountServer())
      + "&account_company=" + UrlEncodeLite(AccountCompany())
      + "&terminal_build=" + IntegerToString((int)TerminalInfoInteger(TERMINAL_BUILD));

   char post[];
   char result[];
   string result_headers = "";
   string headers = "Content-Type: application/x-www-form-urlencoded\r\n";
   StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);

   ResetLastError();
   int response_code = WebRequest("POST", LicenseEndpoint, headers, 5000, post, result, result_headers);
   LastLicenseCheck = now;

   if(response_code == -1)
   {
      int err = GetLastError();
      if(IsLicenseGraceValid())
         return(true);
      LicenseOk = false;
      LicenseStatus = "NETWORK";
      ShowLicenseAlert("Panda license check failed. Add https://pandaengine.app to MT4 WebRequest allowed URLs. Error " + IntegerToString(err));
      return(false);
   }

   string response = CharArrayToString(result, 0, -1, CP_UTF8);
   if(StringFind(response, "OK|APPROVED") == 0)
   {
      LicenseOk = true;
      LicenseStatus = "APPROVED";
      LicenseGraceUntil = now + GraceHours * 3600;
      return(true);
   }

   LicenseOk = false;
   LicenseStatus = response;
   ShowLicenseAlert("Panda indicator license denied: " + response);
   return(false);
}

// --- Time helpers ---
datetime StartOfDay(const datetime value)
{
   return(StrToTime(StringFormat("%04d.%02d.%02d 00:00",
                                 TimeYear(value), TimeMonth(value), TimeDay(value))));
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
                                 TimeYear(value), TimeMonth(value))));
}

datetime ShiftMonth(const datetime monthStart, const int monthDelta)
{
   int year = TimeYear(monthStart);
   int month = TimeMonth(monthStart) + monthDelta;
   while(month <= 0)  { month += 12; year--; }
   while(month > 12)  { month -= 12; year++; }
   return(StrToTime(StringFormat("%04d.%02d.01 00:00", year, month)));
}

int GetDefaultPanelY()
{
   if(!Panel_DefaultBottomLeft) return(Panel_Y);
   int chartHeight = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   int y = chartHeight - 360 - Panel_Y;
   if(y < 0) y = 0;
   return(y);
}

// --- Drawing helpers ---
void DrawArrow(const string name, const datetime t, const double price, const color clr, const int code)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_ARROW, 0, t, price);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, code);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetDouble(0, name, OBJPROP_PRICE1, price);
   ObjectSetInteger(0, name, OBJPROP_TIME1, t);
}

void CreateRect(const string name, int xp, int yp, int w, int h, color clr, int alpha)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, xp);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, yp);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void CreateLabel(const string name, int xp, int yp, string text, color clr, int fontSize, string font)
{
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, xp);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, yp);
   ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, MathMax(6, fontSize));
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void CreatePanelLine(const int lineNum, const int x, const int y,
                     string text, const color clr, const int fontSize, const string font)
{
   if(text == "") text = "--";
   CreateLabel(PanelPrefix + "line_" + IntegerToString(lineNum), x + 10, y + lineNum * 17, text, clr, fontSize, font);
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
//+------------------------------------------------------------------+


