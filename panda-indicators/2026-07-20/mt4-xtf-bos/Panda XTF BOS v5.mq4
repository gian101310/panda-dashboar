//+------------------------------------------------------------------+
//|  Panda XTF BOS v5                                                 |
//|  v5: lightweight. BOS/flip arrows OFF by default (toggle to show);   |
//|  only clean BUY/SELL signals draw. Fixed per-tick history scan that  |
//|  froze charts. Score + ADV grids show ONLY the chart pair's two      |
//|  currencies. Lines still OFF by default; execution surfaced.         |
//|  Lightweight MT4 indicator. Combines the working XTF/BOS logic    |
//|  (Panda Boxes, Panda Lines, Break of Structure, XTF-gated         |
//|  BUY/SELL triggers) with the local 21-pair currency scoring.      |
//|  Everything is computed from live broker chart data only:         |
//|  no API keys, no engine files, no network, never places trades.   |
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

enum ENUM_XTF { XTF_H1 = 0, XTF_H4 = 1 };
enum PANEL_CORNER
{
   PANEL_BOTTOM_LEFT  = 0,  // Bottom left
   PANEL_BOTTOM_RIGHT = 1,  // Bottom right
   PANEL_TOP_LEFT     = 2,  // Top left
   PANEL_TOP_RIGHT    = 3   // Top right
};

// ===== SCORING INPUTS =====
input int             GapThreshold   = 5;
input ENUM_TIMEFRAMES BoxCalcTF      = PERIOD_H1;
input int             Box3Days       = 2;   // short box span in TRADING days (weekends skipped)
input int             Box3Offset     = 1;   // short box offset in TRADING days
input int             Box1Weeks      = 2;   // medium (weekly) box span
input int             Box1Offset     = 1;
input int             Box2Months     = 2;   // long (monthly) box span
input int             Box2Offset     = 1;
input int             RefreshSeconds = 5;

// ===== PANDA LINES INPUTS =====
input bool   ShowPandaLines = true;
input bool   ShowSuperTrend = false;   // draw SuperTrend line (calc always runs)
input bool   ShowFollowLine = false;   // draw BB Follow line (calc always runs)
input int    ST_Period      = 10;
input double ST_Multiplier  = 3.0;
input int    BB_Period      = 21;
input double BB_Deviations  = 1.0;
input bool   BB_UseATR      = true;
input int    BB_ATRPeriod   = 5;

// ===== XTF / BOS INPUTS =====
input ENUM_XTF XtfStructure = XTF_H1;   // which box gates the trigger
input int      SwingLength  = 5;
input bool     ShowBoxes    = true;
input bool     ShowBOS      = false;   // draw BOS arrows on history (off = lighter)
input bool     ShowFlips    = false;   // draw Panda-Lines flip dots (off = lighter)
input bool     ShowTriggers = true;    // draw BUY/SELL signal markers

// ===== ALERT INPUTS =====
input bool   EnableAlerts = true;
input bool   AlertPopup   = true;
input bool   AlertSound   = true;

// ===== PANEL INPUTS =====
input bool         Panel_Show   = true;
input PANEL_CORNER PanelCorner  = PANEL_BOTTOM_LEFT;   // panel position
input int          Panel_X      = 16;                  // margin from corner (px)
input int          Panel_Y      = 16;                  // margin from corner (px)
input int          Panel_Width  = 320;                 // panel width (px)
input int          Panel_FontSize  = 9;
input color        Panel_BgColor   = C'12,17,28';      // panel background
input color        Panel_BorderColor = C'0,180,255';   // panel border
input bool         ShowScoreGrid   = true;             // show all 7-currency D1/H4/H1 grid
input color Panel_TitleColor= C'0,180,255';
input color Panel_BuyColor  = C'0,255,159';
input color Panel_SellColor = C'255,77,109';
input color Panel_WaitColor = C'255,209,102';
input color Panel_TextColor = C'200,200,220';
input color Panel_LabelColor= C'154,164,178';

input color Box3Color = C'255,160,50';   // short  / daily  orange
input color Box1Color = C'0,200,120';    // medium / weekly green
input color Box2Color = C'70,120,255';   // long   / monthly blue

// ===== PLOT BUFFERS (color-split: one logical ST + one Follow Line) =====
double STBull[];
double STBear[];
double FLBull[];
double FLBear[];

// ===== WORKING SERIES =====
double UpBand[];
double DnBand[];
double TrendDir[];
double BBLine[];
double BBITrend[];

// ===== SCORING GLOBALS =====
string Pairs[21] =
{
   "AUDCAD","AUDJPY","AUDNZD","AUDUSD","CADJPY",
   "EURAUD","EURCAD","EURGBP","EURJPY","EURNZD","EURUSD",
   "GBPAUD","GBPCAD","GBPJPY","GBPNZD","GBPUSD",
   "NZDCAD","NZDJPY","NZDUSD","USDCAD","USDJPY"
};
string Currencies[7] = {"AUD","CAD","EUR","GBP","JPY","NZD","USD"};
string BrokerSym[21];

int  ScoresD1[7];   // extreme (dominant-side total) per currency, main box
int  ScoresH4[7];
int  ScoresH1[7];
int  PosD1[7], NegD1[7], PosH4[7], NegH4[7], PosH1[7], NegH1[7];        // main pos/neg split
int  AdvD1[7], AdvH4[7], AdvH1[7];                                      // extreme, advance box
int  AdvPosD1[7], AdvNegD1[7], AdvPosH4[7], AdvNegH4[7], AdvPosH1[7], AdvNegH1[7];
bool CurrencyInvalid[7];

string CurrentPair = "";
int    MainGap      = 0;
string MainBias     = "WAIT";
string Execution    = "NONE";
string Confidence   = "INVALID";
bool   HardInvalid  = false;
string PLZone       = "--";
bool   PLG1Valid    = false;
string BoxH1Trend   = "UNKNOWN";
string BoxH4Trend   = "UNKNOWN";
string BaseXtfText  = "-";
string QuoteXtfText = "-";
string XtfSummary   = "-";

double   Box3High, Box3Low, Box1High, Box1Low, Box2High, Box2Low;
datetime Box3Start, Box3End, Box1Start, Box1End, Box2Start, Box2End;
bool     Box3Valid, Box1Valid, Box2Valid;

datetime LastRefresh = 0;
datetime LastBarTime = 0;
datetime _lastProcTime = 0;
bool     _backfilled = false;

// BOS / flip / trigger state
double LastSwingHigh = 0.0;
double LastSwingLow  = 0.0;
bool   SwingHighBroken = false;
bool   SwingLowBroken  = false;
int    LastDirSide   = 0;
string LatestFlip    = "NONE";
string LatestBos     = "NONE";
string SignalStatus  = "NO SETUP";

string OBJ   = "PXB1_";
string PANEL = "PXB1p_";
int    _pLeft = 0;
int    _pTop  = 0;
int    _rowH  = 17;

//+------------------------------------------------------------------+
//| Init / Deinit                                                     |
//+------------------------------------------------------------------+
int OnInit()
{
   IndicatorBuffers(9);
   SetIndexBuffer(0, STBull);  SetIndexStyle(0, DRAW_LINE, STYLE_SOLID, 2, Lime);
   SetIndexBuffer(1, STBear);  SetIndexStyle(1, DRAW_LINE, STYLE_SOLID, 2, Red);
   SetIndexBuffer(2, FLBull);  SetIndexStyle(2, DRAW_LINE, STYLE_SOLID, 2, DodgerBlue);
   SetIndexBuffer(3, FLBear);  SetIndexStyle(3, DRAW_LINE, STYLE_SOLID, 2, Red);
   SetIndexBuffer(4, UpBand);
   SetIndexBuffer(5, DnBand);
   SetIndexBuffer(6, TrendDir);
   SetIndexBuffer(7, BBLine);
   SetIndexBuffer(8, BBITrend);
   for(int b = 0; b < 4; b++) SetIndexEmptyValue(b, EMPTY_VALUE);
   IndicatorShortName("Panda XTF BOS v5");

   ResolveAllBrokerSymbols();
   LastRefresh = 0;
   LastBarTime = 0;
   _lastProcTime = 0;
   _backfilled = false;
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   ObjectsDeleteAll(0, OBJ);
   ObjectsDeleteAll(0, PANEL);
   Comment("");
}

//+------------------------------------------------------------------+
//| Small helpers                                                     |
//+------------------------------------------------------------------+
bool IsVal(const double v) { return(v != EMPTY_VALUE); }

string NormalizeSymbol(const string sym)
{
   string up = sym;
   StringToUpper(up);
   string clean = "";
   int n = StringLen(up);
   for(int i = 0; i < n; i++)
   {
      string ch = StringSubstr(up, i, 1);
      if(ch >= "A" && ch <= "Z") clean = clean + ch;
   }
   if(StringLen(clean) > 6) clean = StringSubstr(clean, 0, 6);
   return(clean);
}

int CurrencyIndex(const string currency)
{
   for(int i = 0; i < 7; i++)
      if(Currencies[i] == currency) return(i);
   return(-1);
}

// Resolve each Panda pair to a broker symbol once (handles suffixes).
void ResolveAllBrokerSymbols()
{
   string chart = Symbol();
   string nchart = NormalizeSymbol(chart);
   string suffix = "";
   if(StringLen(chart) > StringLen(nchart) && StringFind(chart, StringSubstr(nchart, 0, 3)) == 0)
      suffix = StringSubstr(chart, StringLen(nchart));

   int total = SymbolsTotal(false);
   for(int p = 0; p < 21; p++)
   {
      BrokerSym[p] = "";
      if(NormalizeSymbol(chart) == Pairs[p]) { BrokerSym[p] = chart; continue; }
      if(suffix != "" && MarketInfo(Pairs[p] + suffix, MODE_BID) > 0) { BrokerSym[p] = Pairs[p] + suffix; continue; }
      if(MarketInfo(Pairs[p], MODE_BID) > 0) { BrokerSym[p] = Pairs[p]; continue; }
      for(int s = 0; s < total; s++)
      {
         string nm = SymbolName(s, false);
         if(NormalizeSymbol(nm) == Pairs[p]) { BrokerSym[p] = nm; break; }
      }
   }
}

string ResolveBrokerSymbol(const string pair)
{
   for(int p = 0; p < 21; p++)
      if(Pairs[p] == pair && BrokerSym[p] != "") return(BrokerSym[p]);
   if(NormalizeSymbol(Symbol()) == pair) return(Symbol());
   return("");
}

//+------------------------------------------------------------------+
//| Math helpers (series arrays: index i = current, i+1 = older)      |
//+------------------------------------------------------------------+
double TrueRangeAt(const int i, const double &high[], const double &low[], const double &close[])
{
   int n = ArraySize(close);
   if(i + 1 >= n) return(high[i] - low[i]);
   double a = high[i] - low[i];
   double b = MathAbs(high[i] - close[i + 1]);
   double c = MathAbs(low[i]  - close[i + 1]);
   return(MathMax(a, MathMax(b, c)));
}

double AtrSma(const int i, const int period, const double &high[], const double &low[], const double &close[])
{
   double sum = 0; int cnt = 0; int n = ArraySize(close);
   for(int k = 0; k < period; k++)
   {
      int idx = i + k; if(idx >= n) break;
      sum += TrueRangeAt(idx, high, low, close); cnt++;
   }
   return(cnt > 0 ? sum / cnt : 0.0);
}

double SmaClose(const int i, const int period, const double &close[])
{
   double sum = 0; int cnt = 0; int n = ArraySize(close);
   for(int k = 0; k < period; k++)
   {
      int idx = i + k; if(idx >= n) break;
      sum += close[idx]; cnt++;
   }
   return(cnt > 0 ? sum / cnt : close[i]);
}

double StdDevClose(const int i, const int period, const double &close[], const double mean)
{
   double sum = 0; int cnt = 0; int n = ArraySize(close);
   for(int k = 0; k < period; k++)
   {
      int idx = i + k; if(idx >= n) break;
      double d = close[idx] - mean; sum += d * d; cnt++;
   }
   return(cnt > 0 ? MathSqrt(sum / cnt) : 0.0);
}

//+------------------------------------------------------------------+
//| Calendar helpers (server time, forex week = Monday)               |
//+------------------------------------------------------------------+
datetime StartOfDay(const datetime t) { return(t - (t % 86400)); }

datetime StartOfWeek(const datetime t)
{
   datetime d = StartOfDay(t);
   int dow = TimeDayOfWeek(d);        // 0=Sun .. 6=Sat
   int back = (dow + 6) % 7;          // days since Monday
   return(d - back * 86400);
}

datetime StartOfMonth(const datetime t)
{
   return(StrToTime(StringFormat("%04d.%02d.01 00:00", TimeYear(t), TimeMonth(t))));
}

datetime ShiftMonth(const datetime t, const int n)
{
   int y = TimeYear(t);
   int m = TimeMonth(t) + n;
   while(m < 1)  { m += 12; y--; }
   while(m > 12) { m -= 12; y++; }
   return(StrToTime(StringFormat("%04d.%02d.01 00:00", y, m)));
}

// Step back n TRADING days (skip Sat/Sun) from a day-start boundary.
datetime StepTradingDaysBack(const datetime dayStart, const int n)
{
   datetime d = dayStart;
   int stepped = 0;
   int guard = 0;
   while(stepped < n && guard < 400)
   {
      d -= 86400;
      guard++;
      int dow = TimeDayOfWeek(d);
      if(dow != 0 && dow != 6) stepped++;   // count Monday..Friday only
   }
   return(d);
}

// Box windows. Weekly/monthly = calendar (unchanged). Short box = last N
// TRADING days (weekends excluded), offset by TRADING days.
void GetBoxWindow(const int tf, datetime &st, datetime &en)
{
   datetime now = TimeCurrent();
   if(tf == 0) // long / monthly (Box2)
   {
      datetime cm = StartOfMonth(now);
      en = ShiftMonth(cm, -MathMax(0, Box2Offset));
      st = ShiftMonth(en, -MathMax(1, Box2Months));
      return;
   }
   if(tf == 1) // medium / weekly (Box1)
   {
      datetime cw = StartOfWeek(now);
      en = cw - MathMax(0, Box1Offset) * 7 * 86400;
      st = en - MathMax(1, Box1Weeks) * 7 * 86400;
      return;
   }
   // short / daily (Box3): last N trading days, weekends skipped
   datetime cd = StartOfDay(now);
   int dow0 = TimeDayOfWeek(cd);
   while(dow0 == 0 || dow0 == 6) { cd -= 86400; dow0 = TimeDayOfWeek(cd); }  // snap to a trading day
   en = StepTradingDaysBack(cd, MathMax(0, Box3Offset));
   st = StepTradingDaysBack(en, MathMax(1, Box3Days));
}

bool CalculateBoxBounds(const string symbol, const datetime st, const datetime en, double &boxLow, double &boxHigh)
{
   int bars = iBars(symbol, BoxCalcTF);
   if(bars <= 0) return(false);
   bool found = false;
   boxLow = DBL_MAX; boxHigh = -DBL_MAX;
   for(int i = 0; i < bars; i++)
   {
      datetime bt = iTime(symbol, BoxCalcTF, i);
      if(bt >= en) continue;
      if(bt < st)  break;
      double hi = iHigh(symbol, BoxCalcTF, i);
      double lo = iLow(symbol, BoxCalcTF, i);
      if(hi <= 0 || lo <= 0) continue;
      boxHigh = MathMax(boxHigh, hi);
      boxLow  = MathMin(boxLow, lo);
      found = true;
   }
   return(found);
}

//+------------------------------------------------------------------+
//| Scoring (21 pairs, 3 boxes, from live data) - matches engine      |
//+------------------------------------------------------------------+
// Dominant-side total by absolute value (e.g. pos=+3,neg=-1 -> +3). Ties favour positive.
int Extreme(const int pos, const int neg)
{
   return(pos >= -neg ? pos : neg);
}

// Cell text in the old "+3/-1" style (both sides shown when both present).
string CellText(const int pos, const int neg)
{
   if(pos > 0 && neg < 0) return("+" + IntegerToString(pos) + "/" + IntegerToString(neg));
   if(pos > 0) return("+" + IntegerToString(pos));
   if(neg < 0) return(IntegerToString(neg));
   return("0");
}

void AddCurrencyScore(const string currency, const int vote, const int tf)
{
   int idx = CurrencyIndex(currency);
   if(idx < 0 || vote == 0) return;
   if(tf == 0)      { if(vote > 0) PosD1[idx] += vote; else NegD1[idx] += vote; }
   else if(tf == 1) { if(vote > 0) PosH4[idx] += vote; else NegH4[idx] += vote; }
   else             { if(vote > 0) PosH1[idx] += vote; else NegH1[idx] += vote; }
}

void AddAdvCurrencyScore(const string currency, const int vote, const int tf)
{
   int idx = CurrencyIndex(currency);
   if(idx < 0 || vote == 0) return;
   if(tf == 0)      { if(vote > 0) AdvPosD1[idx] += vote; else AdvNegD1[idx] += vote; }
   else if(tf == 1) { if(vote > 0) AdvPosH4[idx] += vote; else AdvNegH4[idx] += vote; }
   else             { if(vote > 0) AdvPosH1[idx] += vote; else AdvNegH1[idx] += vote; }
}

// Advance box = main box shifted one separator to the right (offset - 1).
void GetBoxWindowAdv(const int tf, datetime &st, datetime &en)
{
   datetime now = TimeCurrent();
   if(tf == 0)
   {
      datetime cm = StartOfMonth(now);
      en = ShiftMonth(cm, -MathMax(0, Box2Offset - 1));
      st = ShiftMonth(en, -MathMax(1, Box2Months));
      return;
   }
   if(tf == 1)
   {
      datetime cw = StartOfWeek(now);
      en = cw - MathMax(0, Box1Offset - 1) * 7 * 86400;
      st = en - MathMax(1, Box1Weeks) * 7 * 86400;
      return;
   }
   datetime cd = StartOfDay(now);
   int dow0 = TimeDayOfWeek(cd);
   while(dow0 == 0 || dow0 == 6) { cd -= 86400; dow0 = TimeDayOfWeek(cd); }
   en = StepTradingDaysBack(cd, MathMax(0, Box3Offset - 1));
   st = StepTradingDaysBack(en, MathMax(1, Box3Days));
}

void ScorePairWindowAdv(const string pair, const int tf)
{
   string symbol = ResolveBrokerSymbol(pair);
   if(symbol == "") return;
   double price = MarketInfo(symbol, MODE_BID);
   if(price <= 0) return;
   datetime st = 0, en = 0;
   GetBoxWindowAdv(tf, st, en);
   if(st <= 0 || en <= st) return;
   double boxLow = 0, boxHigh = 0;
   if(!CalculateBoxBounds(symbol, st, en, boxLow, boxHigh)) return;
   int baseVote = 0, quoteVote = 0;
   if(price > boxHigh)      { baseVote = 1;  quoteVote = -1; }
   else if(price < boxLow)  { baseVote = -1; quoteVote = 1;  }
   AddAdvCurrencyScore(StringSubstr(pair, 0, 3), baseVote, tf);
   AddAdvCurrencyScore(StringSubstr(pair, 3, 3), quoteVote, tf);
}

void ScorePairWindow(const string pair, const int tf)
{
   string symbol = ResolveBrokerSymbol(pair);
   if(symbol == "") return;
   double price = MarketInfo(symbol, MODE_BID);
   if(price <= 0) return;

   datetime st = 0, en = 0;
   GetBoxWindow(tf, st, en);
   if(st <= 0 || en <= st) return;

   double boxLow = 0, boxHigh = 0;
   if(!CalculateBoxBounds(symbol, st, en, boxLow, boxHigh)) return;

   int baseVote = 0, quoteVote = 0;
   if(price > boxHigh)      { baseVote = 1;  quoteVote = -1; }
   else if(price < boxLow)  { baseVote = -1; quoteVote = 1;  }

   AddCurrencyScore(StringSubstr(pair, 0, 3), baseVote, tf);
   AddCurrencyScore(StringSubstr(pair, 3, 3), quoteVote, tf);
}

int CurrencyScore(const string cur, const int tf)
{
   int idx = CurrencyIndex(cur);
   if(idx < 0) return(0);
   if(tf == 0) return(ScoresD1[idx]);
   if(tf == 1) return(ScoresH4[idx]);
   return(ScoresH1[idx]);
}

int AdvCurrencyScore(const string cur, const int tf)
{
   int idx = CurrencyIndex(cur);
   if(idx < 0) return(0);
   if(tf == 0) return(AdvD1[idx]);
   if(tf == 1) return(AdvH4[idx]);
   return(AdvH1[idx]);
}

// Strongest extreme across D1/H4/H1 (ties = 0). Matches engine.
int StrongestScore(const int d1, const int h4, const int h1)
{
   int sp = 0, sn = 0;
   if(d1 > sp) sp = d1; if(h4 > sp) sp = h4; if(h1 > sp) sp = h1;
   if(d1 < sn) sn = d1; if(h4 < sn) sn = h4; if(h1 < sn) sn = h1;
   int ap = MathAbs(sp), an = MathAbs(sn);
   if(ap == an) return(0);
   return(an > ap ? sn : sp);
}

void DetectCurrencyConflicts()
{
   for(int i = 0; i < 7; i++)
   {
      bool pos = (PosD1[i] >= 4) || (PosH4[i] >= 4) || (PosH1[i] >= 4);
      bool neg = (NegD1[i] <= -4) || (NegH4[i] <= -4) || (NegH1[i] <= -4);
      CurrencyInvalid[i] = (pos && neg);
   }
}

string SignedInt(const int v) { return(v > 0 ? "+" + IntegerToString(v) : IntegerToString(v)); }

// BASE/QUOTE XTF: every timeframe whose |score| >= 4, D1 -> H4 -> H1 order.
string CurrencyExtremes(const string cur, const int d1, const int h4, const int h1)
{
   string vals = "";
   if(MathAbs(d1) >= 4) vals = "D1 " + SignedInt(d1);
   if(MathAbs(h4) >= 4) vals = (vals == "" ? "" : vals + " ") + "H4 " + SignedInt(h4);
   if(MathAbs(h1) >= 4) vals = (vals == "" ? "" : vals + " ") + "H1 " + SignedInt(h1);
   return(cur + ": " + (vals == "" ? "NONE" : vals));
}

// Strongest single extreme label, e.g. "GBP D1 +5".
string StrongestLabel(const string cur, const int d1, const int h4, const int h1)
{
   int best = StrongestScore(d1, h4, h1);
   if(best == 0 || MathAbs(best) < 4) return(cur + " -");
   string tf = (d1 == best ? "D1" : (h4 == best ? "H4" : "H1"));
   return(cur + " " + tf + " " + SignedInt(best));
}

//+------------------------------------------------------------------+
//| Box trends + PL zone + full scoring refresh                       |
//+------------------------------------------------------------------+
void StoreCurrentBoxBounds()
{
   Box3Valid = Box1Valid = Box2Valid = false;
   string symbol = ResolveBrokerSymbol(CurrentPair);
   if(symbol == "") symbol = Symbol();
   GetBoxWindow(2, Box3Start, Box3End);
   if(Box3Start > 0 && Box3End > Box3Start) Box3Valid = CalculateBoxBounds(symbol, Box3Start, Box3End, Box3Low, Box3High);
   GetBoxWindow(1, Box1Start, Box1End);
   if(Box1Start > 0 && Box1End > Box1Start) Box1Valid = CalculateBoxBounds(symbol, Box1Start, Box1End, Box1Low, Box1High);
   GetBoxWindow(0, Box2Start, Box2End);
   if(Box2Start > 0 && Box2End > Box2Start) Box2Valid = CalculateBoxBounds(symbol, Box2Start, Box2End, Box2Low, Box2High);
}

void ComputeBoxTrends()
{
   BoxH1Trend = "UNKNOWN";
   BoxH4Trend = "UNKNOWN";
   if(!Box3Valid || !Box1Valid) return;
   double h1mid = (Box3High + Box3Low) / 2.0;           // latter = short, former = medium
   if(h1mid >= Box1High)      BoxH1Trend = "UPTREND";
   else if(h1mid <= Box1Low)  BoxH1Trend = "DOWNTREND";
   else                       BoxH1Trend = "RANGING";
   if(!Box2Valid) return;
   double h4mid = (Box1High + Box1Low) / 2.0;           // latter = medium, former = long
   if(h4mid >= Box2High)      BoxH4Trend = "UPTREND";
   else if(h4mid <= Box2Low)  BoxH4Trend = "DOWNTREND";
   else                       BoxH4Trend = "RANGING";
}

// PL zone from the plotted Panda Lines at the current (forming) bar, shift 0.
void ComputePLZone()
{
   PLZone = "--"; PLG1Valid = false;
   double st = (IsVal(TrendDir[0]) && IsVal(UpBand[0]) && IsVal(DnBand[0])) ? (TrendDir[0] == 1.0 ? UpBand[0] : DnBand[0]) : 0.0;
   double fl = (IsVal(BBLine[0]) && BBLine[0] != 0.0) ? BBLine[0] : 0.0;
   if(st <= 0 || fl <= 0) return;
   double price = Close[0];
   double upper = MathMax(st, fl), lower = MathMin(st, fl);
   if(price > upper)      PLZone = "ABOVE";
   else if(price < lower) PLZone = "BELOW";
   else                   PLZone = "BETWEEN";
   if(MainGap >= GapThreshold && PLZone == "ABOVE") PLG1Valid = true;
   else if(MainGap <= -GapThreshold && PLZone == "BELOW") PLG1Valid = true;
}

void RefreshScoring()
{
   ArrayInitialize(PosD1, 0); ArrayInitialize(NegD1, 0);
   ArrayInitialize(PosH4, 0); ArrayInitialize(NegH4, 0);
   ArrayInitialize(PosH1, 0); ArrayInitialize(NegH1, 0);
   ArrayInitialize(AdvPosD1, 0); ArrayInitialize(AdvNegD1, 0);
   ArrayInitialize(AdvPosH4, 0); ArrayInitialize(AdvNegH4, 0);
   ArrayInitialize(AdvPosH1, 0); ArrayInitialize(AdvNegH1, 0);
   for(int i = 0; i < 21; i++)
   {
      ScorePairWindow(Pairs[i], 0);
      ScorePairWindow(Pairs[i], 1);
      ScorePairWindow(Pairs[i], 2);
      ScorePairWindowAdv(Pairs[i], 0);
      ScorePairWindowAdv(Pairs[i], 1);
      ScorePairWindowAdv(Pairs[i], 2);
   }
   for(int e = 0; e < 7; e++)
   {
      ScoresD1[e] = Extreme(PosD1[e], NegD1[e]);
      ScoresH4[e] = Extreme(PosH4[e], NegH4[e]);
      ScoresH1[e] = Extreme(PosH1[e], NegH1[e]);
      AdvD1[e] = Extreme(AdvPosD1[e], AdvNegD1[e]);
      AdvH4[e] = Extreme(AdvPosH4[e], AdvNegH4[e]);
      AdvH1[e] = Extreme(AdvPosH1[e], AdvNegH1[e]);
   }
   DetectCurrencyConflicts();

   CurrentPair = NormalizeSymbol(Symbol());
   string base  = StringSubstr(CurrentPair, 0, 3);
   string quote = StringSubstr(CurrentPair, 3, 3);
   int bIdx = CurrencyIndex(base), qIdx = CurrencyIndex(quote);

   MainGap = 0; MainBias = "WAIT"; Execution = "NONE"; Confidence = "INVALID"; HardInvalid = false;

   if(StringLen(CurrentPair) < 6 || bIdx < 0 || qIdx < 0)
   {
      MainBias = "UNSUPPORTED";
   }
   else
   {
      int bStrong = StrongestScore(CurrencyScore(base,0), CurrencyScore(base,1), CurrencyScore(base,2));
      int qStrong = StrongestScore(CurrencyScore(quote,0), CurrencyScore(quote,1), CurrencyScore(quote,2));
      bool conflict = CurrencyInvalid[bIdx] || CurrencyInvalid[qIdx];
      bool neutral  = (MathAbs(bStrong) < 4 && MathAbs(qStrong) < 4);
      if(conflict || neutral)
      {
         HardInvalid = true; MainBias = "HARD_INVALID";
      }
      else
      {
         MainGap = bStrong - qStrong;
         int ag = MathAbs(MainGap);
         MainBias  = (ag < GapThreshold) ? "WAIT" : (MainGap > 0 ? "BUY" : "SELL");
         Execution = (ag >= 9) ? "MARKET" : (ag >= 5 ? "PULLBACK" : "NONE");
         Confidence = (ag >= 10) ? "HIGH" : (ag >= 8 ? "MEDIUM" : (ag >= 5 ? "LOW" : "INVALID"));
      }
      BaseXtfText  = CurrencyExtremes(base,  CurrencyScore(base,0),  CurrencyScore(base,1),  CurrencyScore(base,2));
      QuoteXtfText = CurrencyExtremes(quote, CurrencyScore(quote,0), CurrencyScore(quote,1), CurrencyScore(quote,2));
      XtfSummary   = StrongestLabel(base, CurrencyScore(base,0), CurrencyScore(base,1), CurrencyScore(base,2))
                   + " / " + StrongestLabel(quote, CurrencyScore(quote,0), CurrencyScore(quote,1), CurrencyScore(quote,2));
   }

   StoreCurrentBoxBounds();
   ComputeBoxTrends();
   ComputePLZone();
   DrawBoxes();
   LastRefresh = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Panda Lines: SuperTrend + Follow Line (color-split, bridged)      |
//+------------------------------------------------------------------+
void CalcSuperTrend(const int i, const double &high[], const double &low[], const double &close[])
{
   double atrv = AtrSma(i, ST_Period, high, low, close);
   double src  = (high[i] + low[i]) / 2.0;
   double curUp = src - ST_Multiplier * atrv;
   double curDn = src + ST_Multiplier * atrv;
   double prevUp = IsVal(UpBand[i + 1]) ? UpBand[i + 1] : curUp;
   double prevDn = IsVal(DnBand[i + 1]) ? DnBand[i + 1] : curDn;
   if(close[i + 1] > prevUp) curUp = MathMax(curUp, prevUp);
   if(close[i + 1] < prevDn) curDn = MathMin(curDn, prevDn);
   UpBand[i] = curUp;
   DnBand[i] = curDn;
   double prevTrend = IsVal(TrendDir[i + 1]) ? TrendDir[i + 1] : 1.0;
   if(prevTrend == -1.0 && close[i + 1] > prevDn)      TrendDir[i] = 1.0;
   else if(prevTrend == 1.0 && close[i + 1] < prevUp)  TrendDir[i] = -1.0;
   else                                                TrendDir[i] = prevTrend;

   double stv = (TrendDir[i] == 1.0) ? curUp : curDn;
   if(!ShowPandaLines || !ShowSuperTrend)
   {
      STBull[i] = EMPTY_VALUE; STBear[i] = EMPTY_VALUE; return;
   }
   if(TrendDir[i] == 1.0)
   {
      STBull[i] = stv; STBear[i] = EMPTY_VALUE;
      if(TrendDir[i + 1] == -1.0) STBull[i + 1] = DnBand[i + 1];  // single bridge point
   }
   else
   {
      STBear[i] = stv; STBull[i] = EMPTY_VALUE;
      if(TrendDir[i + 1] == 1.0) STBear[i + 1] = UpBand[i + 1];
   }
}

void CalcFollowLine(const int i, const double &high[], const double &low[], const double &close[])
{
   double atrbb = AtrSma(i, BB_ATRPeriod, high, low, close);
   double prevTL = (IsVal(BBLine[i + 1]) && BBLine[i + 1] != 0.0) ? BBLine[i + 1] : close[i];
   double pSma = SmaClose(i + 1, BB_Period, close);
   double pStd = StdDevClose(i + 1, BB_Period, close, pSma);
   double pUp = pSma + BB_Deviations * pStd;
   double pLo = pSma - BB_Deviations * pStd;
   int sig = 0;
   if(close[i + 1] > pUp) sig = 1;
   else if(close[i + 1] < pLo) sig = -1;
   double curTL = prevTL;
   if(sig == 1)      { curTL = BB_UseATR ? low[i]  - atrbb : low[i];  curTL = MathMax(curTL, prevTL); }
   else if(sig == -1){ curTL = BB_UseATR ? high[i] + atrbb : high[i]; curTL = MathMin(curTL, prevTL); }
   BBLine[i] = curTL;
   double prevIT = IsVal(BBITrend[i + 1]) ? BBITrend[i + 1] : 0.0;
   BBITrend[i] = prevIT;
   if(curTL > prevTL) BBITrend[i] = 1.0;
   else if(curTL < prevTL) BBITrend[i] = -1.0;

   if(!ShowPandaLines || !ShowFollowLine)
   {
      FLBull[i] = EMPTY_VALUE; FLBear[i] = EMPTY_VALUE; return;
   }
   if(BBITrend[i] > 0.0)
   {
      FLBull[i] = curTL; FLBear[i] = EMPTY_VALUE;
      if(BBITrend[i + 1] <= 0.0) FLBull[i + 1] = BBLine[i + 1];
   }
   else
   {
      FLBear[i] = curTL; FLBull[i] = EMPTY_VALUE;
      if(BBITrend[i + 1] > 0.0) FLBear[i + 1] = BBLine[i + 1];
   }
}

//+------------------------------------------------------------------+
//| Chart drawing: boxes + markers                                    |
//+------------------------------------------------------------------+
void DrawBox(const string tag, const bool valid, const datetime st, const datetime en,
             const double hi, const double lo, const color clr)
{
   string nm = OBJ + "box_" + tag;
   if(!ShowBoxes || !valid) { ObjectDelete(0, nm); return; }
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_RECTANGLE, 0, st, hi, en, lo);
   ObjectSetInteger(0, nm, OBJPROP_TIME1, st);
   ObjectSetDouble(0, nm, OBJPROP_PRICE1, hi);
   ObjectSetInteger(0, nm, OBJPROP_TIME2, en);
   ObjectSetDouble(0, nm, OBJPROP_PRICE2, lo);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, nm, OBJPROP_BACK, true);
   ObjectSetInteger(0, nm, OBJPROP_FILL, true);
   ObjectSetInteger(0, nm, OBJPROP_WIDTH, 2);
   ObjectSetInteger(0, nm, OBJPROP_STYLE, STYLE_SOLID);
}

void DrawBoxes()
{
   DrawBox("short",  Box3Valid, Box3Start, Box3End, Box3High, Box3Low, Box3Color);
   DrawBox("medium", Box1Valid, Box1Start, Box1End, Box1High, Box1Low, Box1Color);
   DrawBox("long",   Box2Valid, Box2Start, Box2End, Box2High, Box2Low, Box2Color);
}

void DrawMark(const string kind, const datetime t, const double price, const string txt,
              const color clr, const bool above)
{
   string nm = OBJ + kind + "_" + IntegerToString((int)t);
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_TEXT, 0, t, price);
   ObjectSetInteger(0, nm, OBJPROP_TIME1, t);
   ObjectSetDouble(0, nm, OBJPROP_PRICE1, price);
   ObjectSetString(0, nm, OBJPROP_TEXT, " " + txt + " ");
   ObjectSetInteger(0, nm, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, above ? ANCHOR_LOWER : ANCHOR_UPPER);
}

//+------------------------------------------------------------------+
//| Zone / alerts / BOS-flip-trigger on each newly closed bar         |
//+------------------------------------------------------------------+
string ZoneAt(const int shift)
{
   double st = (IsVal(TrendDir[shift]) && IsVal(UpBand[shift]) && IsVal(DnBand[shift])) ? (TrendDir[shift] == 1.0 ? UpBand[shift] : DnBand[shift]) : 0.0;
   double fl = (IsVal(BBLine[shift]) && BBLine[shift] != 0.0) ? BBLine[shift] : 0.0;
   if(st <= 0 || fl <= 0) return("UNKNOWN");
   double up = MathMax(st, fl), lo = MathMin(st, fl);
   double p = Close[shift];
   if(p > up) return("ABOVE");
   if(p < lo) return("BELOW");
   return("BETWEEN");
}

void FireAlert(const string dir)
{
   if(!EnableAlerts) return;
   string msg = "Panda XTF BOS v4: " + dir + " TRIGGER " + CurrentPair + " " + Symbol();
   if(AlertPopup) Alert(msg);
   if(AlertSound) PlaySound(dir == "BUY" ? "alert.wav" : "alert2.wav");
}

// Visible arrow marker (Wingdings code) at a bar.
void DrawArrowMark(const string kind, const datetime t, const double price, const int code,
                   const color clr, const bool above, const int width)
{
   string nm = OBJ + kind + "_" + IntegerToString((int)t);
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_ARROW, 0, t, price);
   ObjectSetInteger(0, nm, OBJPROP_TIME1, t);
   ObjectSetDouble(0, nm, OBJPROP_PRICE1, price);
   ObjectSetInteger(0, nm, OBJPROP_ARROWCODE, code);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, nm, OBJPROP_WIDTH, width);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, above ? ANCHOR_BOTTOM : ANCHOR_TOP);
   ObjectSetInteger(0, nm, OBJPROP_BACK, false);
   ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
}

void DrawSigText(const string kind, const datetime t, const double price, const string txt,
                 const color clr, const bool above)
{
   string nm = OBJ + kind + "x_" + IntegerToString((int)t);
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_TEXT, 0, t, price);
   ObjectSetInteger(0, nm, OBJPROP_TIME1, t);
   ObjectSetDouble(0, nm, OBJPROP_PRICE1, price);
   ObjectSetString(0, nm, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, above ? ANCHOR_LOWER : ANCHOR_UPPER);
   ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
}

// Process one confirmed (closed) bar at shift b. isLive = the last closed bar.
void ProcessClosedShift(const int b, const int rates_total, const bool isLive)
{
   int center = b + SwingLength;
   if(center + SwingLength <= rates_total - 1 && center - SwingLength >= 1)
   {
      bool ph = true, pl = true;
      for(int k = center - SwingLength; k <= center + SwingLength; k++)
      {
         if(k == center) continue;
         if(High[k] >= High[center]) ph = false;
         if(Low[k]  <= Low[center])  pl = false;
      }
      if(ph) { LastSwingHigh = High[center]; SwingHighBroken = false; }
      if(pl) { LastSwingLow  = Low[center];  SwingLowBroken  = false; }
   }

   double cb = Close[b];
   bool bosBull = false, bosBear = false;
   if(!SwingHighBroken && LastSwingHigh > 0 && cb > LastSwingHigh) { bosBull = true; SwingHighBroken = true; LatestBos = "BULLISH"; }
   if(!SwingLowBroken  && LastSwingLow  > 0 && cb < LastSwingLow)  { bosBear = true; SwingLowBroken  = true; LatestBos = "BEARISH"; }
   if(bosBull && ShowBOS) { DrawArrowMark("bos", Time[b], Low[b],  233, clrLime, false, 2); DrawSigText("bos", Time[b], Low[b],  "BOS", clrLime, false); }
   if(bosBear && ShowBOS) { DrawArrowMark("bos", Time[b], High[b], 234, clrRed,  true,  2); DrawSigText("bos", Time[b], High[b], "BOS", clrRed,  true); }

   string zone = ZoneAt(b);
   bool flipBull = (zone == "ABOVE" && LastDirSide == -1);
   bool flipBear = (zone == "BELOW" && LastDirSide == 1);
   if(zone == "ABOVE") LastDirSide = 1;
   else if(zone == "BELOW") LastDirSide = -1;
   if(flipBull) { LatestFlip = "BULLISH"; if(ShowFlips) DrawArrowMark("pl", Time[b], Low[b],  159, C'0,255,159', false, 1); }
   if(flipBear) { LatestFlip = "BEARISH"; if(ShowFlips) DrawArrowMark("pl", Time[b], High[b], 159, C'255,77,109', true,  1); }

   // Gated BUY/SELL trigger only on the live bar (scoring is a live snapshot).
   if(isLive)
   {
      string xtfBox = (XtfStructure == XTF_H4) ? BoxH4Trend : BoxH1Trend;
      string exec = (MathAbs(MainGap) >= 9) ? "MARKET" : (MathAbs(MainGap) >= GapThreshold ? "PULLBACK" : "NONE");
      bool buyReady  = (MainBias == "BUY"  && zone == "ABOVE" && xtfBox == "UPTREND");
      bool sellReady = (MainBias == "SELL" && zone == "BELOW" && xtfBox == "DOWNTREND");
      if(buyReady && bosBull)
      {
         SignalStatus = "BUY TRIGGER (" + exec + ")";
         if(ShowTriggers) { DrawArrowMark("sig", Time[b], Low[b], 233, clrLime, false, 2); DrawSigText("sig", Time[b], Low[b], "BUY", clrLime, false); }
         FireAlert("BUY");
      }
      else if(sellReady && bosBear)
      {
         SignalStatus = "SELL TRIGGER (" + exec + ")";
         if(ShowTriggers) { DrawArrowMark("sig", Time[b], High[b], 234, clrRed, true, 2); DrawSigText("sig", Time[b], High[b], "SELL", clrRed, true); }
         FireAlert("SELL");
      }
      else if(buyReady)  SignalStatus = "BUY READY (" + exec + ")";
      else if(sellReady) SignalStatus = "SELL READY (" + exec + ")";
      else               SignalStatus = "NO SETUP";
   }
}

// Seed swing state once over a bounded window (no per-tick history scan), then
// process only newly closed bars. This is the performance fix for chart freezing.
void ProcessBars(const int rates_total)
{
   if(!_backfilled)
   {
      int startB = rates_total - 2 - SwingLength;
      if(startB > 800) startB = 800;        // bounded one-time backfill
      if(startB < 1) startB = 1;
      for(int b = startB; b >= 1; b--) ProcessClosedShift(b, rates_total, (b == 1));
      _backfilled = true;
      _lastProcTime = (rates_total > 1) ? Time[1] : 0;
      return;
   }
   // Count newly closed bars (usually 0 or 1); stop at the first already-seen bar.
   int newBars = 0;
   for(int b = 1; b <= rates_total - 1; b++)
   {
      if(Time[b] <= _lastProcTime) break;
      newBars++;
      if(newBars >= 100) break;
   }
   for(int b = newBars; b >= 1; b--) ProcessClosedShift(b, rates_total, (b == 1));
   if(rates_total > 1) _lastProcTime = Time[1];
}

//+------------------------------------------------------------------+
//| Panel (stacked labels, bottom-left)                               |
//+------------------------------------------------------------------+
color StatusColor(const string v)
{
   if(v == "MARKET")   return(Panel_BuyColor);
   if(v == "PULLBACK") return(Panel_WaitColor);
   if(StringFind(v, "BUY") == 0)  return(Panel_BuyColor);
   if(StringFind(v, "SELL") == 0) return(Panel_SellColor);
   if(v == "UPTREND" || v == "ABOVE" || v == "BULLISH") return(Panel_BuyColor);
   if(v == "DOWNTREND" || v == "BELOW" || v == "BEARISH") return(Panel_SellColor);
   if(v == "WAIT" || v == "BETWEEN" || v == "RANGING" || v == "HARD_INVALID" || v == "NO SETUP") return(Panel_WaitColor);
   if(StringLen(v) > 0 && StringSubstr(v, 0, 1) == "+") return(Panel_BuyColor);
   if(StringLen(v) > 0 && StringSubstr(v, 0, 1) == "-") return(Panel_SellColor);
   return(Panel_TextColor);
}

color CellColor(const int v)
{
   if(v >= 4)  return(Panel_BuyColor);
   if(v <= -4) return(Panel_SellColor);
   if(v > 0)   return(C'0,150,90');
   if(v < 0)   return(C'150,60,80');
   return(Panel_LabelColor);
}

void PanelLabel(const string nm, const int x, const int y, const string txt, const color clr)
{
   if(ObjectFind(0, nm) < 0) ObjectCreate(0, nm, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, nm, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, nm, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, nm, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, Panel_FontSize);
   ObjectSetInteger(0, nm, OBJPROP_BACK, false);
   ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, nm, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, nm, OBJPROP_TEXT, txt);
}

// One panel row (label + value), positioned from the computed panel origin.
void PanelRow(const int r, const string label, const string value, const color clr)
{
   int y = _pTop + 6 + r * _rowH;
   color lblClr = (r == 0) ? Panel_TitleColor : Panel_LabelColor;
   PanelLabel(PANEL + "l" + IntegerToString(r), _pLeft + 8,   y, label, lblClr);
   PanelLabel(PANEL + "v" + IntegerToString(r), _pLeft + 132, y, value, clr);
}

void DrawPanelBg(const int H)
{
   string bg = PANEL + "bg";
   if(ObjectFind(0, bg) < 0) ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, _pLeft);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, _pTop);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, Panel_Width);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, H);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, Panel_BgColor);
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, Panel_BorderColor);
   ObjectSetInteger(0, bg, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, bg, OBJPROP_BACK, false);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
}

void DrawPanel()
{
   if(!Panel_Show) { ObjectsDeleteAll(0, PANEL); return; }

   int N = 14;
   if(ShowScoreGrid) N += 8;   // SCORES: spacer+header+base+quote ; ADV: same
   _rowH = Panel_FontSize + 8;
   int H  = N * _rowH + 12;
   int cw = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS, 0);
   int ch = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   bool isRight  = (PanelCorner == PANEL_BOTTOM_RIGHT || PanelCorner == PANEL_TOP_RIGHT);
   bool isBottom = (PanelCorner == PANEL_BOTTOM_LEFT  || PanelCorner == PANEL_BOTTOM_RIGHT);
   _pLeft = isRight  ? (cw - Panel_X - Panel_Width) : Panel_X;
   _pTop  = isBottom ? (ch - Panel_Y - H)           : Panel_Y;
   if(_pLeft < 0) _pLeft = 0;
   if(_pTop  < 0) _pTop  = 0;

   DrawPanelBg(H);

   string gapTxt  = HardInvalid ? "0" : (MainGap > 0 ? "+" + IntegerToString(MainGap) : IntegerToString(MainGap));
   string xtfName = (XtfStructure == XTF_H4) ? "H4" : "H1";
   string xtfBox  = (XtfStructure == XTF_H4) ? BoxH4Trend : BoxH1Trend;
   int r = 0;
   PanelRow(r++, "PANDA XTF BOS", CurrentPair == "" ? Symbol() : CurrentPair, Panel_TitleColor);
   PanelRow(r++, "BIAS",        MainBias,     StatusColor(MainBias));
   PanelRow(r++, "GAP",         gapTxt,       StatusColor(gapTxt));
   PanelRow(r++, "EXECUTION",   Execution,    StatusColor(Execution));
   PanelRow(r++, "BASE XTF",    BaseXtfText,  Panel_TextColor);
   PanelRow(r++, "QUOTE XTF",   QuoteXtfText, Panel_TextColor);
   PanelRow(r++, "XTF " + xtfName,   XtfSummary, Panel_TextColor);
   PanelRow(r++, "XTF BOX " + xtfName, xtfBox,   StatusColor(xtfBox));
   PanelRow(r++, "SIGNAL",      SignalStatus, StatusColor(SignalStatus));
   PanelRow(r++, "BOX H1",      BoxH1Trend,   StatusColor(BoxH1Trend));
   PanelRow(r++, "BOX H4",      BoxH4Trend,   StatusColor(BoxH4Trend));
   PanelRow(r++, "PANDA LINES", PLZone,       StatusColor(PLZone));
   PanelRow(r++, "FLIP",        LatestFlip,   StatusColor(LatestFlip));
   PanelRow(r++, "BOS",         LatestBos,    StatusColor(LatestBos));

   if(ShowScoreGrid && StringLen(CurrentPair) >= 6)
   {
      string bs = StringSubstr(CurrentPair, 0, 3);
      string qs = StringSubstr(CurrentPair, 3, 3);
      int bi = CurrencyIndex(bs);
      int qi = CurrencyIndex(qs);
      if(bi >= 0 && qi >= 0)
      {
         r++;  // spacer
         int hy = _pTop + 6 + r * _rowH; r++;
         PanelLabel(PANEL + "gh0", _pLeft + 8,   hy, "SCORES", Panel_TitleColor);
         PanelLabel(PANEL + "gh1", _pLeft + 118, hy, "D1", Panel_TitleColor);
         PanelLabel(PANEL + "gh2", _pLeft + 186, hy, "H4", Panel_TitleColor);
         PanelLabel(PANEL + "gh3", _pLeft + 254, hy, "H1", Panel_TitleColor);
         int by = _pTop + 6 + r * _rowH; r++;
         PanelLabel(PANEL + "gcb", _pLeft + 8,   by, bs, Panel_TextColor);
         PanelLabel(PANEL + "gdb", _pLeft + 118, by, CellText(PosD1[bi], NegD1[bi]), CellColor(ScoresD1[bi]));
         PanelLabel(PANEL + "geb", _pLeft + 186, by, CellText(PosH4[bi], NegH4[bi]), CellColor(ScoresH4[bi]));
         PanelLabel(PANEL + "gfb", _pLeft + 254, by, CellText(PosH1[bi], NegH1[bi]), CellColor(ScoresH1[bi]));
         int qy = _pTop + 6 + r * _rowH; r++;
         PanelLabel(PANEL + "gcq", _pLeft + 8,   qy, qs, Panel_TextColor);
         PanelLabel(PANEL + "gdq", _pLeft + 118, qy, CellText(PosD1[qi], NegD1[qi]), CellColor(ScoresD1[qi]));
         PanelLabel(PANEL + "geq", _pLeft + 186, qy, CellText(PosH4[qi], NegH4[qi]), CellColor(ScoresH4[qi]));
         PanelLabel(PANEL + "gfq", _pLeft + 254, qy, CellText(PosH1[qi], NegH1[qi]), CellColor(ScoresH1[qi]));
         r++;  // spacer
         int ahy = _pTop + 6 + r * _rowH; r++;
         PanelLabel(PANEL + "ah0", _pLeft + 8,   ahy, "ADV", Panel_TitleColor);
         PanelLabel(PANEL + "ah1", _pLeft + 118, ahy, "D1", Panel_TitleColor);
         PanelLabel(PANEL + "ah2", _pLeft + 186, ahy, "H4", Panel_TitleColor);
         PanelLabel(PANEL + "ah3", _pLeft + 254, ahy, "H1", Panel_TitleColor);
         int aby = _pTop + 6 + r * _rowH; r++;
         PanelLabel(PANEL + "acb", _pLeft + 8,   aby, bs, Panel_TextColor);
         PanelLabel(PANEL + "adb", _pLeft + 118, aby, CellText(AdvPosD1[bi], AdvNegD1[bi]), CellColor(AdvD1[bi]));
         PanelLabel(PANEL + "aeb", _pLeft + 186, aby, CellText(AdvPosH4[bi], AdvNegH4[bi]), CellColor(AdvH4[bi]));
         PanelLabel(PANEL + "afb", _pLeft + 254, aby, CellText(AdvPosH1[bi], AdvNegH1[bi]), CellColor(AdvH1[bi]));
         int aqy = _pTop + 6 + r * _rowH; r++;
         PanelLabel(PANEL + "acq", _pLeft + 8,   aqy, qs, Panel_TextColor);
         PanelLabel(PANEL + "adq", _pLeft + 118, aqy, CellText(AdvPosD1[qi], AdvNegD1[qi]), CellColor(AdvD1[qi]));
         PanelLabel(PANEL + "aeq", _pLeft + 186, aqy, CellText(AdvPosH4[qi], AdvNegH4[qi]), CellColor(AdvH4[qi]));
         PanelLabel(PANEL + "afq", _pLeft + 254, aqy, CellText(AdvPosH1[qi], AdvNegH1[qi]), CellColor(AdvH1[qi]));
      }
   }
}

//+------------------------------------------------------------------+
//| OnCalculate                                                       |
//+------------------------------------------------------------------+
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
   int minReq = MathMax(MathMax(ST_Period, BB_Period), BB_ATRPeriod) + 3;
   if(rates_total <= minReq + SwingLength) return(0);

   // MT4 passes OnCalculate arrays as timeseries (index 0 = current bar).
   int limit = rates_total - minReq;
   if(prev_calculated > 0) limit = MathMin(limit, rates_total - prev_calculated + 2);

   for(int i = limit; i >= 0; i--)
   {
      if(i + 1 >= rates_total) continue;
      CalcSuperTrend(i, high, low, close);
      CalcFollowLine(i, high, low, close);
   }

   // Timer-based scoring refresh (keeps panel / zone live)
   if(TimeCurrent() - LastRefresh >= RefreshSeconds)
      RefreshScoring();

   // Refresh scoring once per new bar; then backfill/emit BOS + flip + trigger arrows.
   if(time[0] != LastBarTime)
   {
      RefreshScoring();
      LastBarTime = time[0];
   }
   ProcessBars(rates_total);

   DrawPanel();
   return(rates_total);
}

