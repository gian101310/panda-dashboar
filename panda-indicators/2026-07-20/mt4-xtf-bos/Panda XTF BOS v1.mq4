//+------------------------------------------------------------------+
//|  Panda XTF BOS v1                                                 |
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

// ===== SCORING INPUTS =====
input int             GapThreshold   = 5;
input ENUM_TIMEFRAMES BoxCalcTF      = PERIOD_H1;
input int             Box3Days       = 2;   // short (daily) box span
input int             Box3Offset     = 1;
input int             Box1Weeks      = 2;   // medium (weekly) box span
input int             Box1Offset     = 1;
input int             Box2Months     = 2;   // long (monthly) box span
input int             Box2Offset     = 1;
input int             RefreshSeconds = 5;

// ===== PANDA LINES INPUTS =====
input bool   ShowPandaLines = true;
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
input bool     ShowBOS      = true;
input bool     ShowFlips    = true;
input bool     ShowTriggers = true;

// ===== ALERT INPUTS =====
input bool   EnableAlerts = true;
input bool   AlertPopup   = true;
input bool   AlertSound   = true;

// ===== PANEL INPUTS =====
input bool  Panel_Show      = true;
input int   Panel_X         = 16;
input int   Panel_Y         = 16;
input int   Panel_FontSize  = 9;
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

int  ScoresD1[7];
int  ScoresH4[7];
int  ScoresH1[7];
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
   IndicatorShortName("Panda XTF BOS v1");

   ResolveAllBrokerSymbols();
   LastRefresh = 0;
   LastBarTime = 0;
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

// Box windows: main boxes only (offset 1, span N) -> days 2-3, weeks 2-3, months 2-3.
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
   // short / daily (Box3)
   datetime cd = StartOfDay(now);
   en = cd - MathMax(0, Box3Offset) * 86400;
   st = en - MathMax(1, Box3Days) * 86400;
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
void AddCurrencyScore(const string currency, const int vote, const int tf)
{
   int idx = CurrencyIndex(currency);
   if(idx < 0) return;
   if(tf == 0)      ScoresD1[idx] += vote;
   else if(tf == 1) ScoresH4[idx] += vote;
   else             ScoresH1[idx] += vote;
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
      bool pos = (ScoresD1[i] >= 4) || (ScoresH4[i] >= 4) || (ScoresH1[i] >= 4);
      bool neg = (ScoresD1[i] <= -4) || (ScoresH4[i] <= -4) || (ScoresH1[i] <= -4);
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
   double st = IsVal(STBull[0]) ? STBull[0] : (IsVal(STBear[0]) ? STBear[0] : 0.0);
   double fl = IsVal(FLBull[0]) ? FLBull[0] : (IsVal(FLBear[0]) ? FLBear[0] : 0.0);
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
   ArrayInitialize(ScoresD1, 0);
   ArrayInitialize(ScoresH4, 0);
   ArrayInitialize(ScoresH1, 0);
   for(int i = 0; i < 21; i++)
   {
      ScorePairWindow(Pairs[i], 0);
      ScorePairWindow(Pairs[i], 1);
      ScorePairWindow(Pairs[i], 2);
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
   if(!ShowPandaLines)
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

   if(!ShowPandaLines)
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
   ObjectSetInteger(0, nm, OBJPROP_FILL, false);
   ObjectSetInteger(0, nm, OBJPROP_WIDTH, 1);
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
   double st = IsVal(STBull[shift]) ? STBull[shift] : (IsVal(STBear[shift]) ? STBear[shift] : 0.0);
   double fl = IsVal(FLBull[shift]) ? FLBull[shift] : (IsVal(FLBear[shift]) ? FLBear[shift] : 0.0);
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
   string msg = "Panda XTF BOS v1: " + dir + " TRIGGER " + CurrentPair + " " + Symbol();
   if(AlertPopup) Alert(msg);
   if(AlertSound) PlaySound(dir == "BUY" ? "alert.wav" : "alert2.wav");
}

// Runs once per newly-closed bar. Just-closed bar = shift 1.
void ProcessNewBar(const int rates_total)
{
   RefreshScoring();  // ensure bias / box trend / zone are current for the decision

   int c = SwingLength + 1;                 // pivot center that is now fully confirmed
   if(c + SwingLength < rates_total)
   {
      bool ph = true, pl = true;
      for(int k = c - SwingLength; k <= c + SwingLength; k++)
      {
         if(k == c) continue;
         if(High[k] >= High[c]) ph = false;
         if(Low[k]  <= Low[c])  pl = false;
      }
      if(ph) { LastSwingHigh = High[c]; SwingHighBroken = false; }
      if(pl) { LastSwingLow  = Low[c];  SwingLowBroken  = false; }
   }

   double c1 = Close[1];
   bool bosBull = false, bosBear = false;
   if(!SwingHighBroken && LastSwingHigh > 0 && c1 > LastSwingHigh) { bosBull = true; SwingHighBroken = true; LatestBos = "BULLISH"; }
   if(!SwingLowBroken  && LastSwingLow  > 0 && c1 < LastSwingLow)  { bosBear = true; SwingLowBroken  = true; LatestBos = "BEARISH"; }
   if(bosBull && ShowBOS) DrawMark("bos", Time[1], Low[1],  "BOS+", clrLime, false);
   if(bosBear && ShowBOS) DrawMark("bos", Time[1], High[1], "BOS-", clrRed,  true);

   string zone1 = ZoneAt(1);
   bool flipBull = (zone1 == "ABOVE" && LastDirSide == -1);
   bool flipBear = (zone1 == "BELOW" && LastDirSide == 1);
   if(zone1 == "ABOVE") LastDirSide = 1;
   else if(zone1 == "BELOW") LastDirSide = -1;
   if(flipBull) { LatestFlip = "BULLISH"; if(ShowFlips) DrawMark("pl", Time[1], Low[1],  "PL+", clrLime, false); }
   if(flipBear) { LatestFlip = "BEARISH"; if(ShowFlips) DrawMark("pl", Time[1], High[1], "PL-", clrRed,  true); }

   string xtfBox = (XtfStructure == XTF_H4) ? BoxH4Trend : BoxH1Trend;
   bool buyReady  = (MainBias == "BUY"  && zone1 == "ABOVE" && xtfBox == "UPTREND");
   bool sellReady = (MainBias == "SELL" && zone1 == "BELOW" && xtfBox == "DOWNTREND");
   if(buyReady && bosBull)
   {
      SignalStatus = "BUY TRIGGER";
      if(ShowTriggers) DrawMark("sig", Time[1], Low[1], "BUY", clrLime, false);
      FireAlert("BUY");
   }
   else if(sellReady && bosBear)
   {
      SignalStatus = "SELL TRIGGER";
      if(ShowTriggers) DrawMark("sig", Time[1], High[1], "SELL", clrRed, true);
      FireAlert("SELL");
   }
   else if(buyReady)  SignalStatus = "BUY READY - WAIT BULLISH BOS";
   else if(sellReady) SignalStatus = "SELL READY - WAIT BEARISH BOS";
   else               SignalStatus = "NO SETUP";
}

//+------------------------------------------------------------------+
//| Panel (stacked labels, bottom-left)                               |
//+------------------------------------------------------------------+
color StatusColor(const string v)
{
   if(v == "BUY" || v == "UPTREND" || v == "ABOVE" || v == "BULLISH" || v == "BUY TRIGGER" || v == "BUY READY - WAIT BULLISH BOS") return(Panel_BuyColor);
   if(v == "SELL" || v == "DOWNTREND" || v == "BELOW" || v == "BEARISH" || v == "SELL TRIGGER" || v == "SELL READY - WAIT BEARISH BOS") return(Panel_SellColor);
   if(v == "WAIT" || v == "BETWEEN" || v == "RANGING" || v == "HARD_INVALID") return(Panel_WaitColor);
   if(StringLen(v) > 0 && StringSubstr(v, 0, 1) == "+") return(Panel_BuyColor);
   if(StringLen(v) > 0 && StringSubstr(v, 0, 1) == "-") return(Panel_SellColor);
   return(Panel_TextColor);
}

void PanelLine(const int row, const string label, const string value, const color valClr)
{
   int y = Panel_Y + row * (Panel_FontSize + 7);
   string ln1 = PANEL + "l" + IntegerToString(row);
   string ln2 = PANEL + "v" + IntegerToString(row);
   if(ObjectFind(0, ln1) < 0) ObjectCreate(0, ln1, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, ln1, OBJPROP_CORNER, CORNER_LEFT_LOWER);
   ObjectSetInteger(0, ln1, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
   ObjectSetInteger(0, ln1, OBJPROP_XDISTANCE, Panel_X);
   ObjectSetInteger(0, ln1, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, ln1, OBJPROP_COLOR, Panel_LabelColor);
   ObjectSetInteger(0, ln1, OBJPROP_FONTSIZE, Panel_FontSize);
   ObjectSetString(0, ln1, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, ln1, OBJPROP_TEXT, label);
   if(ObjectFind(0, ln2) < 0) ObjectCreate(0, ln2, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, ln2, OBJPROP_CORNER, CORNER_LEFT_LOWER);
   ObjectSetInteger(0, ln2, OBJPROP_ANCHOR, ANCHOR_LEFT_LOWER);
   ObjectSetInteger(0, ln2, OBJPROP_XDISTANCE, Panel_X + 118);
   ObjectSetInteger(0, ln2, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, ln2, OBJPROP_COLOR, valClr);
   ObjectSetInteger(0, ln2, OBJPROP_FONTSIZE, Panel_FontSize);
   ObjectSetString(0, ln2, OBJPROP_FONT, "Consolas");
   ObjectSetString(0, ln2, OBJPROP_TEXT, value);
}

void DrawPanel()
{
   if(!Panel_Show) { ObjectsDeleteAll(0, PANEL); return; }
   string gapTxt  = HardInvalid ? "0" : (MainGap > 0 ? "+" + IntegerToString(MainGap) : IntegerToString(MainGap));
   string xtfName = (XtfStructure == XTF_H4) ? "H4" : "H1";
   string xtfBox  = (XtfStructure == XTF_H4) ? BoxH4Trend : BoxH1Trend;
   int r = 13;
   PanelLine(r--, "PANDA XTF BOS", CurrentPair == "" ? Symbol() : CurrentPair, Panel_TitleColor);
   PanelLine(r--, "BIAS",        MainBias,     StatusColor(MainBias));
   PanelLine(r--, "GAP",         gapTxt,       StatusColor(gapTxt));
   PanelLine(r--, "BASE XTF",    BaseXtfText,  Panel_TextColor);
   PanelLine(r--, "QUOTE XTF",   QuoteXtfText, Panel_TextColor);
   PanelLine(r--, "XTF " + xtfName,   XtfSummary, Panel_TextColor);
   PanelLine(r--, "XTF BOX " + xtfName, xtfBox,   StatusColor(xtfBox));
   PanelLine(r--, "SIGNAL",      SignalStatus, StatusColor(SignalStatus));
   PanelLine(r--, "BOX H1",      BoxH1Trend,   StatusColor(BoxH1Trend));
   PanelLine(r--, "BOX H4",      BoxH4Trend,   StatusColor(BoxH4Trend));
   PanelLine(r--, "PANDA LINES", PLZone,       StatusColor(PLZone));
   PanelLine(r--, "FLIP",        LatestFlip,   StatusColor(LatestFlip));
   PanelLine(r--, "BOS",         LatestBos,    StatusColor(LatestBos));
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

   // Fire BOS / flip / trigger once per newly closed bar
   if(time[0] != LastBarTime)
   {
      if(LastBarTime != 0) ProcessNewBar(rates_total);
      LastBarTime = time[0];
   }

   DrawPanel();
   return(rates_total);
}

